#!/usr/bin/env python3
"""Rehearse the pinned MongoDB 8.3 -> 9.0 transition using only disposable data.

No existing URI, container, volume or project can be supplied. Containers have
no network access or published ports. Only this invocation's labelled resources
are removed; synthetic dumps, snapshots and logs remain in its temporary folder.
"""

import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import time
import uuid


ROOT = Path(__file__).resolve().parent.parent
GUARD = ROOT / 'jumpinchat-deploy/mongodb/entrypoint.sh'
LABEL = 'clinic.research.jic.mongo-upgrade-test'
MARKER = '/data/db/.jic-mongodb-series'
SNAPSHOT = '''
const fixture = db.getSiblingDB('tc');
const collections = fixture.getCollectionNames().sort().map(name => ({
  name,
  documents: fixture.getCollection(name).find().sort({_id: 1}).toArray(),
  indexes: fixture.getCollection(name).getIndexes().sort((a, b) => a.name.localeCompare(b.name))
}));
print(JSON.stringify({version: db.version(),
  fcv: db.adminCommand({getParameter: 1, featureCompatibilityVersion: 1}).featureCompatibilityVersion,
  primary: db.hello().isWritablePrimary, collections}));
'''
SEED = '''
const fixture = db.getSiblingDB('tc');
if (fixture.getCollectionNames().length) throw Error('Fixture database must be empty');
fixture.users.insertMany([
  {_id: 'u1', username: 'synthetic-alice', email: 'alice@example.invalid', darkTheme: true},
  {_id: 'u2', username: 'synthetic-bob', email: 'bob@example.invalid', darkTheme: false},
  {_id: 'u3', username: 'synthetic-carol', darkTheme: true}
]);
fixture.users.createIndex({username: 1}, {unique: true, name: 'username_unique'});
fixture.users.createIndex({email: 1}, {unique: true, name: 'email_partial',
  partialFilterExpression: {email: {$type: 'string'}}});
fixture.rooms.insertMany([
  {_id: 'r1', name: 'synthetic-one', owner: 'u1', updatedAt: new Date('2026-01-01')},
  {_id: 'r2', name: 'synthetic-two', owner: 'u2', updatedAt: new Date('2026-01-02')},
  {_id: 'r3', name: 'synthetic-three', owner: 'u1', updatedAt: new Date('2026-01-03')}
]);
fixture.rooms.createIndex({name: 1}, {unique: true, name: 'room_name_unique'});
fixture.rooms.createIndex({owner: 1, updatedAt: -1}, {name: 'owner_updated'});
fixture.sessions.insertMany([
  {_id: 's1', userId: 'u1', expires: new Date('2100-01-01')},
  {_id: 's2', userId: 'u2', expires: new Date('2100-01-02')}
]);
fixture.sessions.createIndex({expires: 1}, {expireAfterSeconds: 0, name: 'session_ttl'});
print(JSON.stringify({ok: 1}));
'''


def semantic_collections(snapshot):
    """MongoDB 9 reports explicit simple collation; it is the existing default."""
    result = json.loads(json.dumps(snapshot['collections']))
    for collection in result:
        for index in collection['indexes']:
            if index.get('collation') == {'locale': 'simple'}:
                del index['collation']
            # Compound index key order is significant, unlike ordinary Python
            # dictionary equality. Preserve it explicitly in the comparison.
            index['key'] = list(index['key'].items())
    return result


class Rehearsal:
    def __init__(self, engine):
        self.engine = engine
        self.identity = uuid.uuid4().hex[:12]
        self.prefix = 'jic-mongo-upgrade-' + self.identity
        self.directory = Path(tempfile.mkdtemp(prefix=self.prefix + '-'))
        self.log = (self.directory / 'commands.log').open('w')
        self.containers = []
        self.volumes = []
        self.result = {'status': 'running', 'resourcePrefix': self.prefix, 'checks': [],
                       'limits': ['Synthetic single-member replica set only; no application writers.',
                                  'Does not validate production backups, topology, or older upgrade paths.']}
        pins = json.loads((ROOT / 'jumpinchat-deploy/images.lock.json').read_text())['images']
        self.images = {version: 'docker.io/library/mongo:' + version + '@' + pins['library/mongo:' + version]
                       for version in ('8.3.11', '9.0.2')}
        self.result['images'] = self.images
        print('Evidence directory: ' + str(self.directory), flush=True)

    def run(self, args, *, check=True, timeout=60, stdin=None, stdout=None):
        self.log.write(json.dumps(args) + '\n')
        self.log.flush()
        result = subprocess.run(args, stdin=stdin, stdout=stdout or subprocess.PIPE,
                                stderr=subprocess.PIPE, timeout=timeout)
        if result.stdout:
            self.log.write(result.stdout.decode(errors='replace') + '\n')
        if result.stderr:
            self.log.write(result.stderr.decode(errors='replace') + '\n')
        self.log.flush()
        if check and result.returncode:
            raise RuntimeError(f'Command failed ({result.returncode}): {args[:4]}: '
                               + result.stderr.decode(errors='replace')[-1200:])
        return result

    def check(self, condition, name):
        if not condition:
            raise AssertionError(name)
        self.result['checks'].append(name)
        print('PASS ' + name, flush=True)

    def volume(self, suffix):
        name = self.prefix + '-' + suffix
        exists = self.run([self.engine, 'volume', 'inspect', name], check=False)
        if exists.returncode == 0:
            raise RuntimeError('Refusing an existing volume: ' + name)
        self.run([self.engine, 'volume', 'create', '--label', LABEL + '=' + self.identity, name])
        self.volumes.append(name)
        return name

    def create(self, suffix, image, volumes, command, *, entrypoint='/bin/bash', detach=False):
        name = self.prefix + '-' + suffix
        exists = self.run([self.engine, 'container', 'inspect', name], check=False)
        if exists.returncode == 0:
            raise RuntimeError('Refusing an existing container: ' + name)
        args = [self.engine, 'create', '--name', name, '--label', LABEL + '=' + self.identity,
                '--network=none', '--cpus=1', '--memory=1g',
                '--mount', f'type=bind,src={GUARD},dst=/jic-entrypoint.sh,ro=true']
        for volume, target in volumes:
            args.extend(['--mount', f'type=volume,src={volume},dst={target}'])
        args.extend(['--entrypoint', entrypoint, image, *command])
        self.run(args)
        self.containers.append(name)
        result = self.run([self.engine, 'start', *([] if detach else ['--attach']), name], check=False)
        return name, result

    def server(self, suffix, version, volumes, upgrade=False):
        args = ['/jic-entrypoint.sh'] + (['--upgrade-from-8.3'] if upgrade else [])
        args.extend(['mongod', '--bind_ip', '127.0.0.1', '--replSet', 'rs0',
                     '--wiredTigerCacheSizeGB', '0.25', '--oplogSize', '64'])
        name, result = self.create(suffix, self.images[version], volumes, args, detach=True)
        if result.returncode:
            raise RuntimeError('Could not start ' + name)
        deadline = time.monotonic() + 90
        while time.monotonic() < deadline:
            response = self.mongo(name, 'print(JSON.stringify(db.adminCommand({ping: 1})))', check=False)
            if response.returncode == 0:
                return name
            state = json.loads(self.run([self.engine, 'container', 'inspect', name]).stdout)[0]['State']
            if not state['Running']:
                raise RuntimeError('MongoDB exited before readiness: ' + name)
            time.sleep(1)
        raise RuntimeError('MongoDB readiness deadline: ' + name)

    def mongo(self, name, source, check=True):
        return self.run([self.engine, 'exec', name, 'mongosh', '--quiet', '--eval', source],
                        check=check, timeout=30)

    def initiate(self, name):
        self.mongo(name, 'print(JSON.stringify(rs.initiate({_id:"rs0",members:[{_id:0,host:"localhost:27017"}]})))')
        self.primary(name)

    def primary(self, name):
        deadline = time.monotonic() + 60
        while time.monotonic() < deadline:
            response = self.mongo(name, 'print(db.hello().isWritablePrimary)', check=False)
            if response.returncode == 0 and response.stdout.strip() == b'true':
                return
            time.sleep(1)
        raise RuntimeError('No writable primary: ' + name)

    def stop(self, name):
        self.run([self.engine, 'stop', '--time', '30', name])
        state = json.loads(self.run([self.engine, 'container', 'inspect', name]).stdout)[0]['State']
        self.check(not state['Running'] and state['ExitCode'] == 0, 'clean shutdown ' + name.rsplit('-', 1)[-1])

    def snapshot(self, name, label, version, fcv, baseline=None):
        snapshot = json.loads(self.mongo(name, SNAPSHOT).stdout)
        (self.directory / (label + '.json')).write_text(json.dumps(snapshot, indent=2) + '\n')
        self.check(snapshot['version'] == version and snapshot['fcv'] == {'version': fcv}
                   and snapshot['primary'], label + ' binary/FCV/primary')
        if baseline is not None:
            self.check(semantic_collections(snapshot) == semantic_collections(baseline),
                       label + ' documents and semantic indexes match 8.3 baseline')
        return snapshot

    def guard_check(self, suffix, version, volumes, *, upgrade=False, accepted=False):
        args = ['/jic-entrypoint.sh', '--check'] + (['--upgrade-from-8.3'] if upgrade else []) + ['mongod']
        _, result = self.create(suffix, self.images[version], volumes, args)
        output = (result.stdout or b'') + (result.stderr or b'')
        expected = result.returncode == 0 if accepted else (
            result.returncode == 1 and b'prepared for another release or has a pending migration' in output)
        self.check(expected, suffix)

    def marker(self, name):
        return self.run([self.engine, 'exec', name, 'cat', MARKER]).stdout.decode().strip()

    def dump(self, name, label):
        path = self.directory / (label + '.archive.gz')
        tools = self.run([self.engine, 'exec', name, 'mongodump', '--version']).stdout.decode().splitlines()[0]
        with path.open('wb') as stream:
            self.run([self.engine, 'exec', name, 'mongodump', '--db=tc', '--archive', '--gzip'], stdout=stream)
        self.check(path.stat().st_size > 0, label + ' archive created')
        self.result.setdefault('archives', {})[label] = {
            'path': str(path), 'bytes': path.stat().st_size,
            'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'tools': tools}
        return path

    def execute(self):
        for image in self.images.values():
            self.run([self.engine, 'pull', image], timeout=600)
        source_volumes = [(self.volume('source-db'), '/data/db'), (self.volume('source-config'), '/data/configdb')]
        source = self.server('source83', '8.3.11', source_volumes)
        self.initiate(source)
        self.mongo(source, SEED)
        baseline = self.snapshot(source, 'baseline83', '8.3.11', '8.3')
        self.check(self.marker(source) == '8.3', 'fresh 8.3 marker matches binary')
        self.dump(source, 'before-upgrade83')
        self.stop(source)
        self.guard_check('reject-normal9-on83', '9.0.2', source_volumes)
        self.guard_check('accept-upgrade-preflight', '9.0.2', source_volumes, upgrade=True, accepted=True)
        _, preflight_marker = self.create('read-preflight-marker', self.images['8.3.11'], source_volumes,
                                         ['-c', 'cat /data/db/.jic-mongodb-series'])
        self.check(preflight_marker.returncode == 0 and preflight_marker.stdout.strip() == b'8.3',
                   'upgrade preflight does not change 8.3 marker')
        upgraded = self.server('pending9', '9.0.2', source_volumes, upgrade=True)
        self.primary(upgraded)
        self.snapshot(upgraded, 'binary9-fcv83', '9.0.2', '8.3', baseline)
        self.check(self.marker(upgraded) == '9.0-pending-fcv', 'upgrade writes only pending marker')
        self.guard_check('reject83-onpending', '8.3.11', source_volumes)
        self.guard_check('reject9-onpending', '9.0.2', source_volumes)
        self.check(self.marker(upgraded) == '9.0-pending-fcv', 'refused startup leaves pending marker unchanged')
        self.stop(upgraded)
        resumed = self.server('resumed9', '9.0.2', source_volumes, upgrade=True)
        self.primary(resumed)
        self.snapshot(resumed, 'resumed9-fcv83', '9.0.2', '8.3', baseline)
        self.mongo(resumed, 'print(JSON.stringify(db.adminCommand({setFeatureCompatibilityVersion:"9.0",confirm:true})))')
        self.snapshot(resumed, 'promoted9-fcv9', '9.0.2', '9.0', baseline)
        self.check(self.marker(resumed) == '9.0-pending-fcv', 'FCV promotion does not falsely complete marker')
        self.stop(resumed)
        _, marked = self.create('complete-marker', self.images['9.0.2'], source_volumes,
                                ['-c', 'test "$(cat /data/db/.jic-mongodb-series)" = 9.0-pending-fcv '
                                 '&& printf "9.0\\n" > /data/db/.jic-mongodb-series'])
        self.check(marked.returncode == 0, 'record verified completed 9.0 marker after clean shutdown')
        completed = self.server('completed9', '9.0.2', source_volumes)
        self.primary(completed)
        self.snapshot(completed, 'normal9-fcv9', '9.0.2', '9.0', baseline)
        archive = self.dump(completed, 'after-upgrade9')
        self.stop(completed)
        restore_volumes = [(self.volume('restore-db'), '/data/db'), (self.volume('restore-config'), '/data/configdb')]
        restored = self.server('restore9', '9.0.2', restore_volumes)
        self.initiate(restored)
        empty = json.loads(self.mongo(restored, 'print(JSON.stringify(db.getSiblingDB("tc").getCollectionNames()))').stdout)
        self.check(empty == [], 'restore target has no user collections')
        with archive.open('rb') as stream:
            self.run([self.engine, 'exec', '-i', restored, 'mongorestore', '--archive', '--gzip', '--stopOnError'], stdin=stream)
        final = self.snapshot(restored, 'restored9', '9.0.2', '9.0', baseline)
        self.check(self.marker(restored) == '9.0', 'fresh restore marker remains completed 9.0')
        self.result['collections'] = {item['name']: {'documents': len(item['documents']), 'indexes': len(item['indexes'])}
                                      for item in final['collections']}
        self.stop(restored)
        self.result['status'] = 'passed'

    def cleanup(self):
        errors = []
        for kind, names in [('container', self.containers), ('volume', self.volumes)]:
            for name in reversed(names):
                try:
                    inspected = self.run([self.engine, kind, 'inspect', name], check=False)
                    if inspected.returncode:
                        continue
                    info = json.loads(inspected.stdout)[0]
                    labels = info.get('Config', {}).get('Labels', {}) if kind == 'container' else info.get('Labels', {})
                    if labels.get(LABEL) != self.identity:
                        raise RuntimeError('Refusing cleanup without owned label: ' + name)
                    if kind == 'container':
                        logs = self.run([self.engine, 'logs', name], check=False)
                        (self.directory / (name + '.log')).write_bytes((logs.stdout or b'') + (logs.stderr or b''))
                        self.run([self.engine, 'rm', '--force', name])
                    else:
                        self.run([self.engine, 'volume', 'rm', name])
                except Exception as error:
                    errors.append(str(error))
        self.result['cleanupErrors'] = errors
        if errors:
            self.result['status'] = 'failed'
        (self.directory / 'result.json').write_text(json.dumps(self.result, indent=2) + '\n')
        self.log.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--engine', choices=('podman', 'docker'), default='podman')
    args = parser.parse_args()
    rehearsal = Rehearsal(args.engine)
    started = time.monotonic()
    try:
        rehearsal.execute()
    except Exception as error:
        rehearsal.result.update(status='failed', error=str(error))
        print('FAIL ' + str(error), flush=True)
    finally:
        rehearsal.result['seconds'] = round(time.monotonic() - started, 2)
        rehearsal.cleanup()
    print(json.dumps(rehearsal.result, indent=2), flush=True)
    return 0 if rehearsal.result['status'] == 'passed' else 1


if __name__ == '__main__':
    raise SystemExit(main())
