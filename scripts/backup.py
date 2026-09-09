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

DEPLOY = Path(__file__).resolve().parent.parent / 'jumpinchat-deploy'
ARCHIVES = ('database.archive.gz', 'uploads.tar.gz')


def run(args, output=None):
    result = subprocess.run(args, cwd=DEPLOY, stdout=output or subprocess.PIPE,
                            stderr=subprocess.PIPE, check=False)
    if result.returncode:
        # Never echo environment values or raw service errors into backup logs.
        raise RuntimeError(f'{args[0]} operation failed (exit {result.returncode})')
    return result.stdout.decode().strip() if output is None else None


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def verify(directory):
    manifest = json.loads((directory / 'manifest.json').read_text())
    if manifest.get('format') != 1 or set(manifest.get('sha256', {})) != set(ARCHIVES):
        raise ValueError('Unsupported or incomplete backup manifest')
    for name in ARCHIVES:
        archive = directory / name
        if not archive.is_file() or archive.stat().st_size == 0:
            raise ValueError(f'Missing or empty archive: {name}')
        if digest(archive) != manifest['sha256'][name]:
            raise ValueError(f'Checksum mismatch: {name}')
    print('Both backup archives match the manifest. A restore exercise is still required.')


def backup(args):
    if not args.maintenance:
        raise ValueError('--maintenance is required: backup temporarily stops application services')
    if not re.fullmatch(r'[a-z0-9][a-z0-9_-]*', args.project):
        raise ValueError('Invalid Compose project name')
    compose = (['docker', 'compose'] if args.engine == 'docker' else ['podman-compose'])
    compose += ['-p', args.project, '-f', str(args.compose_file.resolve())]
    services = run(compose + ['config', '--services']).splitlines()
    containers = {}
    for service in ('web', 'web2', 'home', 'home2'):
        if service not in services:
            continue
        ids = run(compose + ['ps', '-a', '-q', service]).splitlines()
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
    # Refuse an existing destination, including incomplete backups.
    args.directory.mkdir(mode=0o700, parents=False, exist_ok=False)
    running = [name for name, info in containers.items() if info['State']['Running']]
    try:
        if running:
            run(compose + ['stop', '-t', '20', *running])
        with (args.directory / ARCHIVES[0]).open('xb') as output:
            run(compose + ['exec', '-T', 'mongodb', 'mongodump', '--db', args.database,
                           '--archive', '--gzip'], output)
        with (args.directory / ARCHIVES[1]).open('xb') as output:
            run([args.engine, 'run', '--rm', '--network=none',
                 '--volumes-from', f"{web['Id']}:ro", '--entrypoint', 'tar',
                 web['Image'], '-C', '/data/uploads', '-czf', '-', '.'], output)
        manifest = {
            'format': 1,
            'created_at': datetime.now(timezone.utc).isoformat(),
            'project': args.project,
            'database': args.database,
            'storage_backend': 'local',
            'sha256': {name: digest(args.directory / name) for name in ARCHIVES},
        }
        (args.directory / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    finally:
        # Preserve services that were deliberately stopped before the backup.
        if running:
            run(compose + ['start', *running])
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
