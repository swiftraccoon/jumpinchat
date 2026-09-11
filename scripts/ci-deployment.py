#!/usr/bin/env python3
"""Run isolated deployment, browser and restore checks; export sanitized evidence.

The work directory must not exist. Only projects recorded in its ownership marker
can be removed by cleanup. Private fixtures, keys, archives and browser diagnostics
remain outside reports/, which is the only directory intended for CI artifacts.
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

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('ci_local', ROOT / 'scripts/local.py')
local = importlib.util.module_from_spec(spec)
spec.loader.exec_module(local)
OWNER = 'ci-owner.json'
SENSITIVE_KEY = re.compile(r'password|secret|token|cookie|authorization|credential|session(?:_?id)?|\bsid\b', re.I)


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2) + '\n')
    path.chmod(0o600)


def command(arguments, log, *, env=None, timeout=1800, check=True):
    """Bound child processes and stop their process group on cancellation."""
    with log.open('w') as output:
        process = subprocess.Popen(list(map(str, arguments)), cwd=ROOT, env=env,
                                   stdout=output, stderr=output, start_new_session=True)
        try:
            code = process.wait(timeout=timeout)
        except BaseException:
            try:
                os.killpg(process.pid, signal.SIGTERM)
                process.wait(timeout=10)
            except (ProcessLookupError, subprocess.TimeoutExpired):
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                process.wait()
            raise
    if check and code:
        raise RuntimeError(f'{log.stem} failed (exit {code}); inspect the sanitized report logs')
    return code


def ownership(work):
    if not work.exists():
        return None
    marker = work / OWNER
    if not marker.is_file() or marker.is_symlink():
        raise ValueError('Refusing an unowned CI work directory')
    owner = json.loads(marker.read_text())
    if owner.get('format') != 1 or owner.get('engine') not in ('docker', 'podman'):
        raise ValueError('Invalid CI ownership marker')
    if owner.get('project') is not None and not re.fullmatch(r'jic-local-[a-f0-9]{8}', owner['project']):
        raise ValueError('Invalid owned project')
    state_path = work / 'private/source/state.json'
    if owner.get('project'):
        if state_path.is_symlink():
            raise ValueError('Refusing a linked local state')
        state = json.loads(state_path.read_text())
        if state.get('project') != owner['project'] or state.get('engine') != owner['engine']:
            raise ValueError('Local state does not match the CI ownership marker')
    return owner


def secret_values(work):
    values = []

    def visit(value, sensitive=False):
        if isinstance(value, dict):
            for key, item in value.items():
                visit(item, sensitive or bool(SENSITIVE_KEY.search(key)))
        elif isinstance(value, list):
            for item in value:
                visit(item, sensitive)
        elif sensitive and isinstance(value, str) and len(value) >= 6:
            values.append(value)

    for path in [work / 'private/fixture.json', *(work / 'private').rglob('secrets.json')]:
        if path.is_file():
            visit(json.loads(path.read_text()))
    return values


def redact(text, secrets):
    for value in sorted(secrets, key=len, reverse=True):
        text = text.replace(value, '[REDACTED]')
    text = re.sub(r'-----BEGIN [^-]*PRIVATE KEY-----.*?-----END [^-]*PRIVATE KEY-----',
                  '[PRIVATE KEY REDACTED]', text, flags=re.S)
    text = re.sub(r'\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b', '[JWT REDACTED]', text)
    text = re.sub(r'(?i)(Bearer\s+)\S+', r'\1[REDACTED]', text)
    text = re.sub(r'(?i)(a=ice-(?:pwd|ufrag):)[^\s\\"]+', r'\1[REDACTED]', text)
    text = re.sub(r'(?i)((?:password|secret|token|cookie|authorization|credential|session|\bsid)[\w-]*["\s]*[:=][\s"]*)[^\s",;}]+',
                  r'\1[REDACTED]', text)
    text = re.sub(r'(\S+\?)[^\s"<>]+', r'\1[QUERY REDACTED]', text)
    text = re.sub(r'(?i)(https?://)[^\s/@:]+:[^\s/@]+@', r'\1[REDACTED]@', text)
    # Generated credentials, verification links and transient ICE passwords can
    # occur without a field name in native diagnostics. Hashes are omitted too.
    return re.sub(r'\b[a-fA-F0-9]{32,}\b', '[HEX REDACTED]', text)


def numeric_details(value):
    if isinstance(value, (int, float, bool)) or value is None:
        return value
    if isinstance(value, dict):
        return {key: numeric_details(item) for key, item in value.items()
                if isinstance(item, (int, float, bool, dict, list)) or item is None}
    if isinstance(value, list):
        return [numeric_details(item) for item in value
                if isinstance(item, (int, float, bool, dict, list)) or item is None]
    return None


def sanitized(value, secrets):
    if isinstance(value, str):
        return redact(value, secrets)
    if isinstance(value, list):
        return [sanitized(item, secrets) for item in value]
    if isinstance(value, dict):
        return {key: '[REDACTED]' if SENSITIVE_KEY.search(key) else sanitized(item, secrets)
                for key, item in value.items()}
    return value


def public_summary(report, secrets):
    """Preserve assertions and numeric evidence, never raw browser/session data."""
    keys = ('status', 'phase', 'startedAt', 'finishedAt', 'checkedAt', 'browserName',
            'browserVersion', 'mediaMode', 'audioOutputMuted', 'failure', 'limits', 'skipped')
    summary = {key: report[key] for key in keys if key in report}
    summary['checks'] = []
    for item in report.get('checks', []):
        if isinstance(item, str):
            summary['checks'].append(item)
        elif isinstance(item, dict):
            summary['checks'].append({'name': item.get('name'), 'time': item.get('time'),
                                      'details': numeric_details(item.get('details'))})
    return sanitized(summary, secrets)


def diagnose(work):
    """Capture only owned service state/logs before teardown removes them."""
    owner = ownership(work)
    if not owner or not owner.get('project'):
        return
    private = work / 'private'
    for service in ('web', 'home', 'nginx', 'janus', 'mongodb', 'redis', 'coturn'):
        name = f"{owner['project']}-{service}"
        # Inspect only lifecycle state; never inspect Config.Env or raw objects.
        commands = [('state', ['inspect', '--format', '{{json .State}}', name]),
                    ('service', ['logs', '--tail', '150', '--timestamps', name])]
        if service in ('web', 'home'):
            # App images run an inner nginx whose file logs are separate from
            # container stdout; these distinguish proxy errors from Node errors.
            commands.append(('proxy', ['exec', name, 'tail', '-n', '150', '/var/log/nginx/error.log']))
        for label, args in commands:
            try:
                command([owner['engine'], *args], private / f'diagnostic-{service}-{label}.log',
                        timeout=10, check=False)
            except (Exception, KeyboardInterrupt):
                continue  # Diagnostics must never prevent independent cleanup.


def collect(work):
    owner = ownership(work)
    if owner is None:
        return
    reports = work / 'reports'
    reports.mkdir(exist_ok=True)
    private = work / 'private'
    secrets = secret_values(work)
    for label, path in [('application', private / 'application.json'),
                        ('media', private / 'media/result-all.json'),
                        ('recovery', private / 'recovery.json')]:
        if path.is_file():
            write_json(reports / f'{label}.json', public_summary(json.loads(path.read_text()), secrets))
    # Child harness and build logs are useful on failure. Do not export native
    # browser client dumps, environment files, Mailpit MIME, database or uploads.
    logs = list(private.glob('*.log')) + list((private / 'source/logs').glob('build-*.log'))
    logs += [private / 'source/logs/compose.log']
    for path in logs:
        if path.is_file():
            text = path.read_text(errors='replace')[-250_000:]
            (reports / path.name).write_text(redact(text, secrets))
    for path in (private / 'recovery').glob('diagnostic-*.log'):
        if path.is_file():
            text = path.read_text(errors='replace')[-250_000:]
            (reports / f'recovery-{path.name}').write_text(redact(text, secrets))


def cleanup(work):
    owner = ownership(work)
    if owner is None:
        return
    private = work / 'private'
    errors = []

    def attempt(label, operation):
        # A failed or timed-out restored stack must never prevent cleanup of the
        # independent source stack. The always() retry follows the same rule.
        try:
            return operation()
        except (Exception, KeyboardInterrupt) as error:
            errors.append(f'{label}: {type(error).__name__}')
            return None

    recovery = private / 'recovery'
    if recovery.exists():
        code = attempt('restored deployment cleanup', lambda: command(
            [sys.executable, ROOT / 'scripts/test-recovery.py', '--cleanup', '--work-dir', recovery],
            private / 'cleanup-recovery.log', timeout=180, check=False))
        if code:
            errors.append('restored deployment cleanup failed')
    if owner.get('project'):
        engine, project = owner['engine'], owner['project']
        state_dir = private / 'source'
        state = json.loads((state_dir / 'state.json').read_text())
        if (state_dir / 'compose.yml').is_file():
            code = attempt('source deployment cleanup', lambda: command(
                local.compose(state, state_dir) + ['down', '--volumes', '--remove-orphans'],
                private / 'cleanup-source.log', timeout=90, check=False))
            if code:
                errors.append('source deployment cleanup failed')
        for service in local.BUILDS:
            tag = f'localhost/{project}-{service}:local'
            inspected = attempt(f'owned {service} image inspection', lambda: subprocess.run(
                [engine, 'image', 'inspect', tag], capture_output=True, timeout=10))
            if inspected is not None and inspected.returncode == 0:
                code = attempt(f'owned {service} image cleanup', lambda: command(
                    [engine, 'image', 'rm', tag], private / f'cleanup-image-{service}.log',
                    timeout=15, check=False))
                if code:
                    errors.append(f'owned {service} image cleanup failed')
        # Named volumes and containers must be gone; never use a global prune.
        for resource in ('container', 'volume', 'network'):
            args = [engine, resource, 'ls', '-q', '--filter', f'label=com.docker.compose.project={project}']
            if resource == 'container':
                args.insert(3, '-a')
            remaining = attempt(f'owned {resource} verification', lambda: subprocess.run(
                args, capture_output=True, text=True, timeout=10))
            if remaining is not None and (remaining.returncode or remaining.stdout.strip()):
                errors.append(f'owned {resource} cleanup could not be verified')
    (work / 'reports').mkdir(exist_ok=True)
    write_json(work / 'reports/cleanup.json', {'status': 'failed' if errors else 'passed', 'errors': errors})
    if errors:
        raise RuntimeError('; '.join(errors))


def run(args):
    work = args.work_dir.resolve()
    # Exclusive creation is deliberate: the persistent local profile is never a
    # valid work directory, even if its project uses the same launcher format.
    work.mkdir(mode=0o700, parents=True, exist_ok=False)
    private = work / 'private'
    private.mkdir(mode=0o700)
    (work / 'reports').mkdir(mode=0o700)
    owner = {'format': 1, 'engine': args.engine, 'project': None}
    write_json(work / OWNER, owner)
    outcome = {'startedAt': datetime.now(timezone.utc).isoformat(), 'status': 'failed'}
    try:
        state_dir = private / 'source'
        state = local.initialize(state_dir, args.engine, True)
        owner['project'] = state['project']
        write_json(work / OWNER, owner)
        print('Building and starting the isolated deployment...', flush=True)
        command([sys.executable, ROOT / 'scripts/local.py', 'up', '--engine', args.engine,
                 '--state-dir', state_dir], private / 'start.log', timeout=2400)
        origin = f"https://localhost:{state['https_port']}"
        common_env = {**os.environ, 'PLAYWRIGHT_PACKAGE': str(args.playwright_package.resolve()),
                      'BASE_URL': origin, 'BROWSER': 'chromium', 'MEDIA_MODE': 'synthetic',
                      'EXTRA_HOSTS': '127.0.0.1', 'PHASE': 'all',
                      'OUTPUT_DIR': str(private / 'media')}
        for key in ('ROOM_SUFFIX', 'ROOM_NAME', 'CHROME_PATH', 'FIREFOX_PATH', 'FIREFOX_LOOPBACK_ICE'):
            common_env.pop(key, None)
        if args.chrome_path:
            common_env['CHROME_PATH'] = str(args.chrome_path.resolve())
        public_key = subprocess.run(['openssl', 'x509', '-in', state_dir / 'tls/cert.pem',
                                     '-pubkey', '-noout'], capture_output=True, check=True).stdout
        der = subprocess.run(['openssl', 'pkey', '-pubin', '-outform', 'DER'],
                             input=public_key, capture_output=True, check=True).stdout
        common_env['TLS_SPKI'] = base64.b64encode(hashlib.sha256(der).digest()).decode()
        common_env['TLS_CA'] = str(state_dir / 'tls/ca.pem')
        print('Checking accounts, mail, rooms and uploads...', flush=True)
        command([args.node, ROOT / 'scripts/test-deployment.mjs',
                 '--origin', f"https://127.0.0.1:{state['https_port']}",
                 '--host', f"localhost:{state['https_port']}", '--public-origin', origin,
                 '--ca', state_dir / 'tls/ca.pem', '--mailpit', f"http://127.0.0.1:{state['mail_port']}",
                 '--fixture-output', private / 'fixture.json', '--report', private / 'application.json'],
                private / 'application.log', env=common_env, timeout=180)
        print('Checking muted synthetic Chromium chat and media...', flush=True)
        command([args.node, ROOT / 'scripts/test-media.mjs'], private / 'media.log',
                env=common_env, timeout=420)
        media = json.loads((private / 'media/result-all.json').read_text())
        if media.get('status') != 'passed' or media.get('audioOutputMuted') is not True:
            raise RuntimeError('Browser checks did not pass with native output muted')
        print('Checking a full restored application...', flush=True)
        command([sys.executable, ROOT / 'scripts/test-recovery.py', '--source-state', state_dir,
                 '--work-dir', private / 'recovery', '--fixture', private / 'fixture.json',
                 '--report', private / 'recovery.json', '--node', args.node],
                private / 'recovery.log', env=common_env, timeout=1200)
        outcome['status'] = 'passed'
    except BaseException as error:
        outcome['failure'] = str(error) or type(error).__name__
        raise
    finally:
        outcome['finishedAt'] = datetime.now(timezone.utc).isoformat()
        try:
            write_json(work / 'reports/integration.json', sanitized(outcome, secret_values(work)))
        finally:
            try:
                diagnose(work)
            finally:
                try:
                    cleanup(work)
                finally:
                    collect(work)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['run', 'cleanup'])
    parser.add_argument('--work-dir', type=Path, required=True)
    parser.add_argument('--engine', choices=['docker', 'podman'], default='docker')
    parser.add_argument('--playwright-package', type=Path)
    parser.add_argument('--chrome-path', type=Path, help='Optional installed Chromium/Chrome executable; CI uses Playwright Chromium')
    parser.add_argument('--node', default='node')
    args = parser.parse_args()
    if args.command == 'run' and not args.playwright_package:
        parser.error('run requires --playwright-package (external Playwright package path)')

    def cancelled(_number, _frame):
        raise KeyboardInterrupt('CI process cancelled')

    signal.signal(signal.SIGTERM, cancelled)
    if args.command == 'run':
        run(args)
    else:
        try:
            cleanup(args.work_dir.resolve())
        finally:
            collect(args.work_dir.resolve())


if __name__ == '__main__':
    try:
        main()
    except (Exception, KeyboardInterrupt) as error:
        print(f'Integration check failed: {type(error).__name__}: {error}', file=sys.stderr)
        sys.exit(1)
