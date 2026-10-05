#!/usr/bin/env python3
"""Rehearse a disposable local deployment backup in a second complete stack.

Requires the private fixture from test-deployment.mjs. Never restores into the
source. Archives and credentials remain in the private work directory; only the
explicit summary report is suitable for publication.
"""
import argparse
import base64
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parent.parent


def module(name):
    spec = importlib.util.spec_from_file_location('recovery_' + name, ROOT / 'scripts' / (name + '.py'))
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


local = module('local')
backup = module('backup')
OWNER = 'recovery-owner.json'
MONGO_SNAPSHOT = r'''
const crypto = require('crypto');
const hash = value => crypto.createHash('sha256')
  .update(EJSON.stringify(value, {relaxed: false})).digest('hex');
const database = db.getSiblingDB('tc');
print(JSON.stringify(Object.fromEntries(database.getCollectionNames().sort().map(name => {
  const collection = database.getCollection(name);
  return [name, {
    indexes: hash(collection.getIndexes().sort((a,b) => a.name.localeCompare(b.name))),
    ...(['users', 'rooms'].includes(name) ? {
      count: collection.countDocuments({}),
      documents: hash(collection.find().sort({_id: 1}).toArray()),
    } : {}),
  }];
}))));
'''
UPLOAD_SNAPSHOT = r'''
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const base = '/data/uploads', output = {};
function walk(directory) {
  for (const item of fs.readdirSync(directory, {withFileTypes: true})) {
    const file = path.join(directory, item.name);
    if (item.isDirectory()) walk(file);
    else if (item.isFile()) output[path.relative(base, file)] =
      crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    else throw new Error('Unexpected upload entry');
  }
}
walk(base); process.stdout.write(JSON.stringify(output));
'''


def write_json(path, value):
    with tempfile.NamedTemporaryFile(mode='w', dir=path.parent, prefix='.' + path.name,
                                     delete=False) as stream:
        temporary = Path(stream.name)
        try:
            stream.write(json.dumps(value, indent=2) + '\n')
            stream.close()
            temporary.replace(path)
        finally:
            temporary.unlink(missing_ok=True)


def run(command, log, *, stdin=None, timeout=180, check=True, env=None):
    result = subprocess.run(list(map(str, command)), cwd=ROOT, stdin=stdin,
                            stdout=subprocess.PIPE, stderr=log, timeout=timeout, env=env)
    if check and result.returncode:
        raise RuntimeError(f'{command[0]} operation failed (exit {result.returncode}); see private recovery log')
    return result


def state_at(directory):
    state = json.loads((directory / 'state.json').read_text())
    if (state.get('format') != 1 or state.get('engine') not in ('docker', 'podman')
            or not re.fullmatch(r'jic-local-[a-f0-9]{8}', state.get('project', ''))):
        raise ValueError('Expected a local launcher state')
    return state


HELPERS = ('uploads', 'snapshot-source', 'snapshot-restored', 'backup-uploads')
CONTAINERS = ('nginx', 'home', 'web', 'dns', 'coturn', 'email', 'janus', 'redis', 'mongodb', 'mailpit')
VOLUMES = ('mongodb', 'mongo-config', 'uploads', 'redis', 'mailpit')


def ownership(work):
    if not work.exists():
        return None
    marker = work / OWNER
    if (work.is_symlink() or not marker.is_file() or marker.is_symlink()
            or (work / 'restored').is_symlink() or (work / 'restored/state.json').is_symlink()):
        raise ValueError('Refusing an unowned or linked recovery work directory')
    owner = json.loads(marker.read_text())
    state = state_at(work / 'restored')
    images = owner.get('images')
    if (owner.get('format') != 1 or owner.get('project') != state['project']
            or owner.get('engine') != state['engine'] or not isinstance(owner.get('claimed'), bool)
            or not isinstance(images, dict) or set(images) - set(local.BUILDS)
            or any(not isinstance(value, str) or not re.fullmatch(r'(?:sha256:)?[a-f0-9]{64}', value)
                   for value in images.values())
            or (not owner['claimed'] and (images or owner.get('source')))):
        raise ValueError('Recovery ownership does not match the restored project')
    source = owner.get('source')
    if source is not None:
        directory = Path(source.get('state_dir', ''))
        records, running = source.get('containers'), source.get('running')
        if (not directory.is_absolute() or directory.is_symlink() or (directory / 'state.json').is_symlink()
                or not isinstance(source.get('pending'), bool) or not isinstance(records, dict)
                or set(records) != {'web', 'home'} or not isinstance(running, list)
                or len(running) != len(set(running)) or set(running) - set(records)
                or any(not isinstance(value, str) or not re.fullmatch(r'[a-f0-9]{64}', value)
                       for value in records.values())):
            raise ValueError('Invalid source recovery journal')
        original = state_at(directory)
        if (original['project'] != source.get('project') or original['engine'] != owner['engine']
                or original['project'] == owner['project']):
            raise ValueError('Source recovery journal does not match the source state')
    return owner


def recover_source(work, owner, log):
    source = owner.get('source')
    if not source or not source['pending']:
        return
    containers, failures = {}, []
    engine = owner['engine']
    for name in source['running']:
        try:
            item = json.loads(run([engine, 'inspect', source['containers'][name]], log, timeout=10).stdout)[0]
            labels = item['Config'].get('Labels') or {}
            if (item['Id'] != source['containers'][name]
                    or labels.get('com.docker.compose.project') != source['project']
                    or labels.get('com.docker.compose.service') != name):
                raise ValueError('Source writer ownership mismatch')
            containers[name] = item
        except (OSError, RuntimeError, ValueError, KeyError, IndexError, subprocess.TimeoutExpired):
            failures.append(name)
    # A killed CI child cannot execute its finally block. This durable journal
    # lets the cleanup retry resume the exact original writers before proceeding.
    backup.restore_services(engine, containers, list(containers))
    if failures:
        raise RuntimeError('Could not validate source writers: ' + ', '.join(failures))
    source['pending'] = False
    write_json(work / OWNER, owner)


def capture_diagnostics(work):
    owner = ownership(work)
    if not owner or not owner['claimed']:
        return
    failures = []
    with (work / 'diagnostic-collection.log').open('a') as log:
        for service in ('web', 'home', 'nginx', 'janus', 'mongodb', 'redis', 'coturn'):
            try:
                name = owner['project'] + '-' + service
                item = json.loads(run([owner['engine'], 'inspect', name], log, timeout=10).stdout)[0]
                if (item['Config'].get('Labels') or {}).get('com.docker.compose.project') != owner['project']:
                    raise ValueError('Diagnostic container ownership mismatch')
                # Config.Env must never enter diagnostics or publishable reports.
                write_json(work / f'diagnostic-{service}-state.log', item['State'])
                result = subprocess.run([owner['engine'], 'logs', '--tail', '150', '--timestamps', item['Id']],
                    stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=10, check=False)
                local.private_write(work / f'diagnostic-{service}-service.log',
                                    result.stdout[-250_000:].decode(errors='replace'))
                if result.returncode:
                    raise RuntimeError('Service log capture failed')
            except (Exception, KeyboardInterrupt) as error:
                failures.append(f'{service}: {type(error).__name__}')
    write_json(work / 'diagnostics.json', {'failures': failures})


def cleanup(work):
    owner = ownership(work)
    if owner is None:
        return
    engine, project = owner['engine'], owner['project']
    failures = []
    with (work / 'cleanup.log').open('a') as log:
        def attempt(label, operation):
            try:
                return operation()
            except (Exception, KeyboardInterrupt) as error:
                failures.append(f'{label}: {type(error).__name__}')
                return None

        attempt('source writer recovery', lambda: recover_source(work, owner, log))
        if owner['claimed']:
            def remove_resource(kind, name, helper=False):
                inspected = run([engine, kind, 'inspect', name], log, check=False, timeout=10)
                if inspected.returncode:
                    return
                info = json.loads(inspected.stdout)[0]
                labels = ((info.get('Config') or {}).get('Labels') if kind == 'container'
                          else info.get('Labels') or info.get('labels')) or {}
                label = 'jic.recovery' if helper else 'com.docker.compose.project'
                if labels.get(label) != project:
                    raise ValueError('Resource ownership mismatch')
                if kind == 'container':
                    run([engine, 'rm', '-f', info['Id']], log, timeout=30)
                else:
                    run([engine, kind, 'rm', name], log, timeout=30)

            for suffix in HELPERS:
                attempt(f'{suffix} helper', lambda suffix=suffix:
                        remove_resource('container', project + '-' + suffix, True))
            for suffix in CONTAINERS:
                attempt(f'{suffix} container', lambda suffix=suffix:
                        remove_resource('container', project + '-' + suffix))
            for suffix in VOLUMES:
                attempt(f'{suffix} volume', lambda suffix=suffix:
                        remove_resource('volume', project + '-' + suffix))
            attempt('restored network', lambda: remove_resource('network', project + '-network'))
            for name, identity in owner['images'].items():
                def remove_image(name=name, identity=identity):
                    tag = f'localhost/{project}-{name}:local'
                    found = run([engine, 'image', 'inspect', tag], log, check=False, timeout=10)
                    if not found.returncode:
                        item = json.loads(found.stdout)[0]
                        if item['Id'].removeprefix('sha256:') != identity.removeprefix('sha256:'):
                            raise ValueError('Image tag ownership mismatch')
                        run([engine, 'image', 'rm', tag], log, timeout=30)
                attempt(f'{name} image', remove_image)
            for resource in ('container', 'volume', 'network'):
                def verify(resource=resource):
                    command = [engine, resource, 'ls', '-q']
                    if resource == 'container':
                        command.append('-a')
                    found = run(command + ['--filter', f'label=com.docker.compose.project={project}'],
                                log, timeout=10)
                    if found.stdout.strip():
                        raise RuntimeError('Owned resources remain')
                attempt(f'{resource} removal verification', verify)
            def verify_helpers():
                found = run([engine, 'container', 'ls', '-a', '-q', '--filter',
                             f'label=jic.recovery={project}'], log, timeout=10)
                if found.stdout.strip():
                    raise RuntimeError('Owned upload helpers remain')
            attempt('upload helper removal verification', verify_helpers)
    write_json(work / 'cleanup.json', {'status': 'failed' if failures else 'passed', 'failures': failures})
    if failures:
        raise RuntimeError('Recovery cleanup failed: ' + ', '.join(failures))


def rehearse(args):
    source = args.source_state.resolve()
    source_state = state_at(source)
    fixture = json.loads(args.fixture.read_text())
    if (fixture.get('format') != 1 or not re.fullmatch(r'smoke[a-f0-9]{12}', fixture.get('username', ''))
            or fixture.get('sourceOrigin') != f"https://localhost:{source_state['https_port']}"):
        raise ValueError('Expected a synthetic fixture created against this source deployment')
    if not source_state.get('turn'):
        raise ValueError('The recovery media rehearsal requires local TURN')
    work = args.work_dir.resolve()
    work.mkdir(mode=0o700, parents=False, exist_ok=False)
    target = work / 'restored'
    started = time.monotonic()
    outcome = {'status': 'failed', 'startedAt': datetime.now(timezone.utc).isoformat(),
               'checks': [], 'audioOutputMuted': True, 'mediaMode': 'synthetic',
               'limits': ['Fresh synthetic MongoDB 9.0 data and local uploads; no old-version upgrade or provider accounts.',
                          'Redis sessions and Mailpit mail are outside this backup; login uses a fresh session.',
                          'Saved room identity is restored; ephemeral Janus media rooms are initialized anew.']}
    owned = False
    cancelled = False
    backing_up = False
    cleaning = False

    def interrupt(_number, _frame):
        nonlocal cancelled
        cancelled = True
        # Allow the backup utility's finally block to resume source writers.
        if not backing_up and not cleaning:
            raise InterruptedError('Recovery rehearsal cancelled')

    previous = {number: signal.signal(number, interrupt) for number in (signal.SIGTERM, signal.SIGINT)}
    try:
        with (work / 'operations.log').open('w') as log:
            state = local.initialize(target, source_state['engine'], True)
            engine, project = state['engine'], state['project']
            owner = {'format': 1, 'engine': engine, 'project': project, 'claimed': False, 'images': {}}
            write_json(work / OWNER, owner)
            owned = True
            for resource, names in (
                ('container', [f'{project}-{name}' for name in (*CONTAINERS, *HELPERS)]),
                ('volume', [f'{project}-{name}' for name in ('mongodb', 'mongo-config', 'uploads', 'redis', 'mailpit')]),
                ('network', [project + '-network']),
            ):
                for name in names:
                    if not run([engine, resource, 'inspect', name], log, check=False).returncode:
                        raise ValueError('Fresh restore resource name already exists')
            for name in local.BUILDS:
                tag = f'localhost/{project}-{name}:local'
                if not run([engine, 'image', 'inspect', tag], log, check=False).returncode:
                    raise ValueError('Fresh restore image tag already exists')
            owner['claimed'] = True
            write_json(work / OWNER, owner)
            # Restore the application signing configuration, with new TLS and
            # separate Redis/Mailpit volumes. No provider settings are inherited.
            local.private_write(target / 'secrets.json', (source / 'secrets.json').read_text())
            local.private_write(target / 'compose.yml', local.render(state, target))
            for name in local.BUILDS:
                info = json.loads(run([engine, 'inspect', source_state['project'] + '-' + name], log).stdout)[0]
                tag = f'localhost/{project}-{name}:local'
                owner['images'][name] = info['Image']
                write_json(work / OWNER, owner)
                run([engine, 'tag', info['Image'], tag], log)

            def mongo_snapshot(name):
                return json.loads(run([engine, 'exec', name, 'mongosh', '--quiet', '--eval', MONGO_SNAPSHOT], log).stdout)

            def upload_snapshot(container=None):
                mounts = (['--volumes-from', container + ':ro'] if container else
                          ['-v', project + '-uploads:/data/uploads:ro'])
                helper = project + ('-snapshot-source' if container else '-snapshot-restored')
                return json.loads(run([engine, 'run', '--rm', '--network=none', '--name', helper,
                    '--label', f'jic.recovery={project}', *mounts,
                    '--entrypoint', 'node', f'localhost/{project}-web:local', '-e', UPLOAD_SNAPSHOT], log).stdout)

            baseline = {}
            original_run = backup.run

            def observed_backup(command, output=None, timeout=None):
                # Capture persistent documents and file bytes after the actual
                # backup utility has verified that all app writers stopped.
                if output is not None and 'mongodump' in command:
                    baseline['database'] = mongo_snapshot(source_state['project'] + '-mongodb')
                    baseline['uploads'] = upload_snapshot(source_state['project'] + '-web')
                if command[:2] == [engine, 'run'] and '--entrypoint' in command:
                    entrypoint = command.index('--entrypoint')
                    if command[entrypoint + 1] == 'tar':
                        if '--name' in command:
                            raise ValueError('Backup upload helper naming changed')
                        command = command[:2] + ['--name', project + '-backup-uploads',
                            '--label', f'jic.recovery={project}'] + command[2:]
                return original_run(command, output, timeout)

            print('Backing up the isolated source and recording its stopped-writer baseline...', flush=True)
            journal = {'state_dir': str(source), 'project': source_state['project'],
                       'pending': True, 'containers': {}, 'running': []}
            for name in ('web', 'home'):
                item = json.loads(run([engine, 'inspect', source_state['project'] + '-' + name], log).stdout)[0]
                labels = item['Config'].get('Labels') or {}
                if (labels.get('com.docker.compose.project') != source_state['project']
                        or labels.get('com.docker.compose.service') != name):
                    raise ValueError('Source writer ownership mismatch')
                journal['containers'][name] = item['Id']
                if item['State']['Running']:
                    journal['running'].append(name)
            owner['source'] = journal
            write_json(work / OWNER, owner)
            backing_up = True
            backup.run = observed_backup
            try:
                backup.backup(argparse.Namespace(maintenance=True, engine=engine, project=source_state['project'],
                    compose_file=source / 'compose.yml', database='tc', directory=work / 'backup'))
            finally:
                backup.run = original_run
                backing_up = False
            local.verify_frontdoors(source_state, source)
            journal['pending'] = False
            write_json(work / OWNER, owner)
            if cancelled:
                raise InterruptedError('Recovery rehearsal cancelled after source recovery')
            outcome['checks'].append('Coordinated backup completed and source application resumed')

            print('Restoring into fresh MongoDB and upload volumes before starting application writers...', flush=True)
            run(local.compose(state, target) + ['up', '-d', '--no-build', 'mongodb'], log)
            mongo = [engine, 'exec', project + '-mongodb', 'mongosh', '--quiet', '--eval']
            for attempt in range(60):
                if not run(mongo + ['db.adminCommand({ping:1})'], log, check=False, timeout=10).returncode:
                    break
                time.sleep(1)
            else:
                raise RuntimeError('Restore MongoDB did not start')
            run(mongo + ['rs.initiate({_id:"rs0",members:[{_id:0,host:"mongodb:27017"}]})'], log)
            for attempt in range(60):
                if run(mongo + ['print(db.hello().isWritablePrimary)'], log).stdout.strip() == b'true':
                    break
                time.sleep(1)
            else:
                raise RuntimeError('Restore MongoDB did not elect a primary')
            empty = run(mongo + ['print(JSON.stringify(db.getSiblingDB("tc").getCollectionNames()))'], log)
            if json.loads(empty.stdout) != []:
                raise ValueError('Restore database must be empty')
            with (work / 'backup/database.archive.gz').open('rb') as archive:
                run([engine, 'exec', '-i', project + '-mongodb', 'mongorestore',
                     '--archive', '--gzip', '--nsInclude=tc.*'], log, stdin=archive)
            run([engine, 'volume', 'create', '--label', f'com.docker.compose.project={project}',
                 '--label', 'com.docker.compose.volume=uploads', project + '-uploads'], log)
            with (work / 'backup/uploads.tar.gz').open('rb') as archive:
                run([engine, 'run', '--rm', '-i', '--network=none', '--name', project + '-uploads',
                     '--label', f'jic.recovery={project}', '-v', project + '-uploads:/data/uploads',
                     '--entrypoint', 'tar', f'localhost/{project}-web:local', '-C', '/data/uploads', '-xzf', '-'],
                    log, stdin=archive)
            restored = mongo_snapshot(project + '-mongodb')
            if restored != baseline['database']:
                raise AssertionError('Restored account/room documents or collection indexes differ')
            if upload_snapshot() != baseline['uploads']:
                raise AssertionError('Restored upload inventory or bytes differ')
            outcome['checks'].append({'name': 'Account/room documents, all indexes and upload bytes match before startup',
                'details': {'indexSets': len(restored), 'accounts': restored['users']['count'],
                            'rooms': restored['rooms']['count'], 'files': len(baseline['uploads'])}})

            print('Starting the complete restored application...', flush=True)
            local.up(state, target, False)
            application_report = work / 'application.json'
            app = run([args.node, ROOT / 'scripts/test-deployment.mjs', '--restore-fixture', args.fixture.resolve(),
                '--origin', f"https://127.0.0.1:{state['https_port']}", '--host', f"localhost:{state['https_port']}",
                '--ca', target / 'tls/ca.pem', '--report', application_report], log)
            log.write(app.stdout.decode())
            outcome['checks'].extend(json.loads(application_report.read_text())['checks'])
            public_key = run(['openssl', 'pkey', '-in', target / 'tls/privkey.pem', '-pubout', '-outform', 'DER'], log).stdout
            environment = {**os.environ, 'BASE_URL': f"https://localhost:{state['https_port']}",
                'TLS_CA': str(target / 'tls/ca.pem'),
                'TLS_SPKI': base64.b64encode(hashlib.sha256(public_key).digest()).decode(),
                'BROWSER': 'chromium', 'MEDIA_MODE': 'synthetic', 'PHASE': 'relay',
                'EXTRA_HOSTS': '127.0.0.1', 'ROOM_NAME': fixture['username'], 'OUTPUT_DIR': str(work / 'media')}
            environment.pop('FIREFOX_LOOPBACK_ICE', None)
            print('Checking muted media and two-way chat in the restored reserved room...', flush=True)
            media = run([args.node, ROOT / 'scripts/test-media.mjs'], log, env=environment, timeout=360)
            log.write(media.stdout.decode())
            evidence = json.loads((work / 'media/result-relay.json').read_text())
            if evidence.get('status') != 'passed' or evidence.get('audioOutputMuted') is not True:
                raise AssertionError('Restored media checks did not pass with output muted')
            if not evidence['clients'] or any(not client['roomResponses'] or any(code != 200 for code in client['roomResponses'])
                                              for client in evidence['clients']):
                raise AssertionError('Browser recreated a missing room instead of joining the restored room')
            outcome['checks'].append({'name': 'Restored room supports two-way chat and advancing TURN audio/video',
                                      'details': {'browserChecks': len(evidence['checks'])}})
            outcome['status'] = 'passed'
    finally:
        cleaning = True
        try:
            if owned:
                if outcome['status'] != 'passed':
                    try:
                        capture_diagnostics(work)
                    except (Exception, KeyboardInterrupt):
                        pass
                cleanup(work)
                outcome['checks'].append('All restored containers, volumes, network and image tags removed')
        except Exception:
            outcome['status'] = 'failed'
            raise
        finally:
            for number, handler in previous.items():
                signal.signal(number, handler)
            outcome['finishedAt'] = datetime.now(timezone.utc).isoformat()
            outcome['seconds'] = round(time.monotonic() - started, 2)
            write_json(args.report.resolve(), outcome)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-state', type=Path)
    parser.add_argument('--work-dir', type=Path, required=True)
    parser.add_argument('--fixture', type=Path)
    parser.add_argument('--report', type=Path)
    parser.add_argument('--node', default='node')
    parser.add_argument('--cleanup', action='store_true')
    args = parser.parse_args()
    if args.cleanup:
        cleanup(args.work_dir.resolve())
    else:
        if not all((args.source_state, args.fixture, args.report)):
            parser.error('rehearsal requires --source-state, --fixture and --report')
        os.umask(0o077)
        rehearse(args)


if __name__ == '__main__':
    try:
        main()
    except (Exception, KeyboardInterrupt) as error:
        print(f'Recovery verification failed: {type(error).__name__}: {error}', file=sys.stderr)
        sys.exit(1)
