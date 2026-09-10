#!/usr/bin/env python3
"""Create and verify a maintenance-window backup of MongoDB and local uploads.

Does not restore, delete, rotate, or upload backups. Restore into a fresh,
isolated deployment using RECOVERY.md. S3 requires a coordinated object backup.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import subprocess
import time

DEPLOY = Path(__file__).resolve().parent.parent / 'jumpinchat-deploy'
ARCHIVES = ('database.archive.gz', 'uploads.tar.gz')


def run(args, output=None, timeout=None):
    try:
        result = subprocess.run(args, cwd=DEPLOY, stdout=output or subprocess.PIPE,
                                stderr=subprocess.PIPE, check=False, timeout=timeout)
    except subprocess.TimeoutExpired as error:
        raise RuntimeError(f'{args[0]} operation timed out') from error
    if result.returncode:
        # Never echo environment values or raw service errors into backup logs.
        raise RuntimeError(f'{args[0]} operation failed (exit {result.returncode})')
    return result.stdout.decode().strip() if output is None else None


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def verify(directory):
    manifest = json.loads((directory / 'manifest.json').read_text())
    if manifest.get('format') not in (1, 2) or set(manifest.get('sha256', {})) != set(ARCHIVES):
        raise ValueError('Unsupported or incomplete backup manifest')
    if manifest['format'] == 2:
        source = manifest.get('mongodb', {})
        if not all(source.get(key) for key in ('version', 'fcv', 'database_tools')):
            raise ValueError('Backup manifest is missing MongoDB version information')
    for name in ARCHIVES:
        archive = directory / name
        if not archive.is_file() or archive.stat().st_size == 0:
            raise ValueError(f'Missing or empty archive: {name}')
        if digest(archive) != manifest['sha256'][name]:
            raise ValueError(f'Checksum mismatch: {name}')
    print('Both backup archives match the manifest. A restore exercise is still required.')


def restore_services(engine, containers, running):
    failed = []
    started = []
    for name in running:
        identity = containers[name]['Id']
        try:
            # Starting the service group through podman-compose can return zero
            # even when its dependency-graph handling leaves a service stopped.
            run([engine, 'start', identity], timeout=30)
            current = json.loads(run([engine, 'inspect', identity], timeout=10))[0]
            if not current['State']['Running']:
                raise RuntimeError('Container remained stopped')
            started.append(name)
        except (OSError, RuntimeError, ValueError, KeyError, IndexError):
            failed.append(name)
    for name in started:
        identity = containers[name]['Id']
        probe = (containers[name]['Config'].get('Healthcheck') or {}).get('Test') or []
        if probe and probe[0] != 'NONE':
            if probe[0] == 'CMD-SHELL' and len(probe) == 2:
                command = ['sh', '-c', probe[1]]
            elif probe[0] == 'CMD' and len(probe) > 1:
                command = probe[1:]
            else:
                failed.append(name)
                continue
            deadline = time.monotonic() + 90
            while True:
                try:
                    # Stored health status can still say healthy after a failed
                    # restart. Run a fresh probe with a bounded execution time.
                    run([engine, 'exec', identity, *command], timeout=10)
                    break
                except (OSError, RuntimeError):
                    if time.monotonic() >= deadline:
                        failed.append(name)
                        break
                    time.sleep(1)
        try:
            current = json.loads(run([engine, 'inspect', identity], timeout=10))[0]
            if not current['State']['Running']:
                failed.append(name)
        except (OSError, RuntimeError, ValueError, KeyError, IndexError):
            failed.append(name)
    if failed:
        raise RuntimeError('Could not restore healthy services after backup: ' + ', '.join(dict.fromkeys(failed)))


def backup(args):
    if not args.maintenance:
        raise ValueError('--maintenance is required: backup temporarily stops application services')
    if not re.fullmatch(r'[a-z0-9][a-z0-9_-]*', args.project):
        raise ValueError('Invalid Compose project name')
    if not re.fullmatch(r'[A-Za-z0-9_-]+', args.database):
        raise ValueError('Invalid database name')
    compose = (['docker', 'compose'] if args.engine == 'docker' else ['podman-compose'])
    compose += ['-p', args.project, '-f', str(args.compose_file.resolve())]
    services = run(compose + ['config', '--services']).splitlines()
    if 'mongodb' not in services:
        raise ValueError('Backup requires the local mongodb service')
    containers = {}
    for service in ('web', 'web2', 'home', 'home2'):
        if service not in services:
            continue
        # podman-compose ps does not support Docker Compose's -a/service
        # arguments. Both engines expose the standard Compose labels, including
        # on deliberately stopped containers that must stay stopped afterward.
        ids = run([args.engine, 'ps', '-a', '-q',
                   '--filter', f'label=com.docker.compose.project={args.project}',
                   '--filter', f'label=com.docker.compose.service={service}']).splitlines()
        if len(ids) != 1:
            raise ValueError(f'Expected exactly one existing container for {service}')
        containers[service] = json.loads(run([args.engine, 'inspect', ids[0]]))[0]
    if 'web' not in containers:
        raise ValueError('Backup requires the application web container and mongodb service')
    web = containers['web']
    web_env = dict(item.split('=', 1) for item in web['Config']['Env'] if '=' in item)
    if web_env.get('STORAGE_BACKEND', 'local') != 'local':
        raise ValueError('S3 backup is not automated; follow the coordinated S3 procedure in RECOVERY.md')
    if web_env.get('UPLOAD_BASE_PATH', '/data/uploads') != '/data/uploads':
        raise ValueError('Custom upload paths require an operator-managed backup procedure')
    local_uri = (r'mongodb://mongodb(?::27017)?(?:,mongodbslave(?::27017)?)?/'
                 + re.escape(args.database) + r'(?:\?replicaSet=rs0)?')
    if not re.fullmatch(local_uri, web_env.get('MONGODB_URI', '')):
        raise ValueError('External or custom MongoDB URI requires an operator-managed backup procedure')
    # Record format compatibility before stopping writers. A dump is not a
    # shortcut past the supported MongoDB server/FCV upgrade sequence.
    mongo = json.loads(run(compose + ['exec', '-T', 'mongodb', 'mongosh', '--quiet',
        '--eval', 'print(JSON.stringify({version: db.version(), fcv: '
        'db.adminCommand({getParameter: 1, featureCompatibilityVersion: 1})'
        '.featureCompatibilityVersion.version}))']))
    if not mongo.get('version', '').startswith('8.3.') or mongo.get('fcv') != '8.3':
        raise ValueError('Finish the MongoDB 8.3/FCV migration first; use the recorded old revision to back up an older deployment')
    mongo['database_tools'] = run(compose + ['exec', '-T', 'mongodb', 'mongodump', '--version']).splitlines()[0]
    # Refuse an existing destination, including incomplete backups.
    args.directory.mkdir(mode=0o700, parents=False, exist_ok=False)
    running = [name for name, info in containers.items() if info['State']['Running']]
    try:
        if running:
            run(compose + ['stop', '-t', '20', *running])
        for name in running:
            current = json.loads(run([args.engine, 'inspect', containers[name]['Id']], timeout=10))[0]
            if current['State']['Running']:
                raise RuntimeError(f'Could not stop service before backup: {name}')
        with (args.directory / ARCHIVES[0]).open('xb') as output:
            run(compose + ['exec', '-T', 'mongodb', 'mongodump', '--db', args.database,
                           '--archive', '--gzip'], output)
        with (args.directory / ARCHIVES[1]).open('xb') as output:
            run([args.engine, 'run', '--rm', '--network=none',
                 '--volumes-from', f"{web['Id']}:ro", '--entrypoint', 'tar',
                 web['Image'], '-C', '/data/uploads', '-czf', '-', '.'], output)
        manifest = {
            'format': 2,
            'created_at': datetime.now(timezone.utc).isoformat(),
            'project': args.project,
            'database': args.database,
            'storage_backend': 'local',
            'mongodb': mongo,
            'sha256': {name: digest(args.directory / name) for name in ARCHIVES},
        }
        (args.directory / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    finally:
        # Preserve services that were deliberately stopped before the backup.
        restore_services(args.engine, containers, running)
    verify(args.directory)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    create = commands.add_parser('create')
    create.add_argument('directory', type=Path)
    create.add_argument('--engine', choices=['podman', 'docker'], default='podman')
    create.add_argument('--project', required=True)
    create.add_argument('--compose-file', type=Path, default=DEPLOY / 'docker-compose.yml')
    create.add_argument('--database', default='tc')
    create.add_argument('--maintenance', action='store_true')
    check = commands.add_parser('verify')
    check.add_argument('directory', type=Path)
    args = parser.parse_args()
    try:
        if args.command == 'verify':
            verify(args.directory)
        else:
            backup(args)
    except (OSError, ValueError, RuntimeError, KeyError) as err:
        parser.exit(1, f'Backup failed: {err}\n')


if __name__ == '__main__':
    main()
