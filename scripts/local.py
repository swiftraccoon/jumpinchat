#!/usr/bin/env python3
"""Persistent, loopback-only local deployment. Down keeps data and credentials."""
import argparse
import base64
from datetime import datetime, timezone
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import socket
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
DEPLOY = ROOT / 'jumpinchat-deploy'
SERVICES = ('web', 'home', 'janus', 'mongodb', 'redis', 'nginx', 'email')
BUILDS = {
    'web': (ROOT, 'jumpinchat-deploy/srv/Dockerfile'),
    'home': (ROOT, 'jumpinchat-deploy/home/Dockerfile'),
    'janus': (DEPLOY / 'janus', 'Dockerfile'),
    'nginx': (DEPLOY / 'nginx', 'Dockerfile'),
    'email': (ROOT / 'jumpinchat-email', 'Dockerfile'),
    'coturn': (ROOT / 'jumpinchat-turn', 'Dockerfile'),
}


def run(command, log=None, check=True):
    result = subprocess.run(list(map(str, command)), cwd=ROOT,
                            stdout=log or subprocess.PIPE, stderr=log or subprocess.PIPE)
    if check and result.returncode:
        raise RuntimeError(f'{command[0]} operation failed; see local logs' if log
                           else f'{command[0]} operation failed (exit {result.returncode})')
    return result


def private_write(path, value):
    if not path.exists() or path.read_text() != value:
        path.write_text(value)
    path.chmod(0o600)


def free_port(preferred, udp=False):
    for attempt in range(100):
        try:
            with socket.socket() as listener:
                listener.bind(('127.0.0.1', preferred if attempt == 0 else 0))
                port = listener.getsockname()[1]
                if udp:
                    with socket.socket(type=socket.SOCK_DGRAM) as datagram:
                        datagram.bind(('127.0.0.1', port))
                return port
        except OSError:
            continue
    raise RuntimeError('Could not find an available loopback listener port')


def free_rtp_range():
    for start in range(20000, 50000, 200):
        listeners = []
        try:
            for port in range(start, start + 101):
                listener = socket.socket(type=socket.SOCK_DGRAM)
                listeners.append(listener)
                listener.bind(('127.0.0.1', port))
            return start, start + 100
        except OSError:
            pass
        finally:
            for listener in listeners:
                listener.close()
    raise RuntimeError('Could not find an available local RTP port range')


def free_subnet(engine):
    names = run([engine, 'network', 'ls', '--format', '{{.Name}}']).stdout.decode().splitlines()
    records = json.loads(run([engine, 'network', 'inspect', *names]).stdout) if names else []
    occupied = []
    for record in records:
        entries = (record.get('subnets') or []) + ((record.get('IPAM') or {}).get('Config') or [])
        for entry in entries:
            value = entry.get('subnet') or entry.get('Subnet')
            if value:
                occupied.append(ipaddress.ip_network(value))
    first = secrets.randbelow(250)
    for offset in range(250):
        candidate = ipaddress.ip_network(f'10.208.{1 + (first + offset) % 250}.0/24')
        if not any(candidate.overlaps(other) for other in occupied if other.version == 4):
            return str(candidate)
    raise RuntimeError('No unused local profile subnet is available')


def service_blocks(source):
    """Preserve canonical YAML values; understand only its service/property headings."""
    match = re.search(r'^services:\n(.*?)(?=^volumes:|\Z)', source, re.M | re.S)
    if not match:
        raise ValueError('Canonical lite services section is missing')
    blocks = {}
    for block in re.split(r'(?=^  [a-z][a-z0-9_]*:\s*$)', match[1], flags=re.M):
        if not block.strip():
            continue
        heading = re.match(r'  ([a-z][a-z0-9_]*):\s*\n', block)
        if not heading:
            raise ValueError('Unsupported canonical service heading')
        properties = {}
        for prop in re.split(r'(?=^    [a-z][a-z0-9_]*:)', block[heading.end():], flags=re.M):
            if not prop.strip():
                continue
            key = re.match(r'    ([a-z][a-z0-9_]*):', prop)
            if not key or key[1] in properties:
                raise ValueError('Unsupported or duplicate canonical service property')
            properties[key[1]] = prop.rstrip() + '\n'
        blocks[heading[1]] = properties
    if set(blocks) != set(SERVICES):
        raise ValueError('Canonical lite service set changed; review the local profile')
    return blocks


def expand(value, environment):
    def replace(match):
        name, operator, default, simple = match.groups()
        name = name or simple
        if environment.get(name):
            return environment[name]
        if operator == ':?':
            raise ValueError(f'Missing generated local setting: {name}')
        return default if operator == ':-' else ''
    return re.sub(r'\$\{(\w+)(:-|:\?)?([^}]*)\}|\$(\w+)', replace, value)


def canonical_environment(block, environment):
    result = {}
    for line in block.splitlines()[1:]:
        if not line.strip() or line.lstrip().startswith('#'):
            continue
        match = re.fullmatch(r'\s+- ([A-Z][A-Z0-9_]*)=(.*)', line)
        if not match:
            raise ValueError('Unsupported canonical environment entry')
        result[match[1]] = expand(match[2].split(' #', 1)[0].strip(), environment)
    return result


def render(state, directory):
    blocks = service_blocks((DEPLOY / 'compose.lite.yml').read_text())
    values = json.loads((directory / 'secrets.json').read_text())
    origin = f"https://localhost:{state['https_port']}"
    turn = ','.join(f"turn:127.0.0.1:{state['turn_port']}?transport={kind}"
                    for kind in ('udp', 'tcp')) if state['turn'] else ''
    values.update(PUBLIC_BASE_URL=origin, JANUS_NAT_IP='127.0.0.1', STORAGE_BACKEND='local',
                  MONGODB_URI='mongodb://mongodb/tc?replicaSet=rs0', REDIS_URI='redis://redis:6379',
                  EMAIL_URL='http://email:3001', SMTP_HOST='mailpit', SMTP_PORT='1025',
                  SMTP_SECURE='false', SMTP_USER='', SMTP_PASS='', SMTP_FROM='JumpInChat <local@example.com>',
                  TURN_URIS=turn)
    private_write(directory / '.env', '\n'.join(f'{key}={value}' for key, value in values.items()) + '\n')
    project = state['project']
    ips = {name: state['subnet'].rsplit('.', 1)[0] + f'.{10 + index}'
           for index, name in enumerate((*SERVICES, 'mailpit', 'coturn', 'dns'))}
    records = {**ips, 'localhost': '127.0.0.1'}
    private_write(directory / 'records.json', json.dumps(records))
    private_write(directory / 'resolv.conf', f"nameserver {ips['dns']}\noptions timeout:1 attempts:2\n")
    output = ['# Generated by scripts/local.py; credentials belong only to this local project.\nservices:\n']
    for name, properties in blocks.items():
        environment = canonical_environment(properties.pop('environment', 'environment:\n'), values)
        overrides = {'environment': environment, 'container_name': f'{project}-{name}',
                     'networks': {'local': {'ipv4_address': ips[name]}}, 'restart': 'unless-stopped'}
        if name in BUILDS:
            context, dockerfile = BUILDS[name]
            overrides.update(image=f'localhost/{project}-{name}:local',
                             build={'context': str(context), 'dockerfile': dockerfile})
        if name == 'web':
            overrides['volumes'] = ['uploads:/data/uploads', f'{directory / "resolv.conf"}:/etc/resolv.conf:ro']
        elif name == 'janus':
            low, high = state.get('rtp_port_min', 20000), state.get('rtp_port_max', 20100)
            environment.update(STUN_SERVER='', KEEP_PRIVATE_HOST='true',
                               RTP_PORT_MIN=str(low), RTP_PORT_MAX=str(high))
            overrides.update(ports=[f'127.0.0.1:{low}-{high}:{low}-{high}/udp'],
                             volumes=[f'{directory / "tls/fullchain.pem"}:/opt/janus/certs/fullchain.pem:ro',
                                      f'{directory / "tls/privkey.pem"}:/opt/janus/certs/privkey.pem:ro'])
        elif name == 'mongodb':
            overrides['volumes'] = ['mongodb:/data/db', 'mongo-config:/data/configdb',
                                   f'{DEPLOY / "mongodb/entrypoint.sh"}:/usr/local/bin/jic-mongodb-entrypoint.sh:ro']
        elif name == 'redis':
            overrides.update(volumes=['redis:/data'], command=['redis-server', '--appendonly', 'yes'])
        elif name == 'nginx':
            overrides.update(ports=[f"127.0.0.1:{state['https_port']}:443"],
                             volumes=['uploads:/data/uploads:ro',
                                      f'{directory / "tls/fullchain.pem"}:/etc/nginx/ssl/fullchain.pem:ro',
                                      f'{directory / "tls/privkey.pem"}:/etc/nginx/ssl/privkey.pem:ro',
                                      f'{directory / "tls/dhparam.pem"}:/etc/nginx/ssl/dhparam.pem:ro'])
        output.append(f'  {name}:\n')
        for key, original in properties.items():
            if key not in overrides:
                output.append(expand(original, values))
        output.extend(f'    {key}: {json.dumps(value)}\n' for key, value in overrides.items())
    pins = re.findall(r'^FROM\s+(\S+)\s*$', (DEPLOY / 'local/Dockerfile').read_text(), re.M)
    if len(pins) != 1 or '@sha256:' not in pins[0]:
        raise ValueError('Expected one pinned Mailpit FROM image')
    mailpit = pins[0]
    ancillary = {
        'mailpit': {'image': mailpit, 'ports': [f"127.0.0.1:{state['mail_port']}:8025"],
                    'volumes': ['mailpit:/data'], 'environment': {'MP_DATABASE': '/data/mailpit.db',
                    'MP_DISABLE_VERSION_CHECK': 'true', 'MP_ALLOWED_HOSTS': 'localhost,127.0.0.1,mailpit'}},
        'dns': {'image': f'localhost/{project}-email:local', 'entrypoint': ['node', '/local/dns.cjs'],
                'volumes': [f'{DEPLOY / "local/dns.cjs"}:/local/dns.cjs:ro',
                            f'{directory / "records.json"}:/local/records.json:ro']},
    }
    if state['turn']:
        ancillary['coturn'] = {'image': f'localhost/{project}-coturn:local',
            'build': {'context': str(BUILDS['coturn'][0]), 'dockerfile': 'Dockerfile'},
            'ports': [f"127.0.0.1:{state['turn_port']}:3478/{kind}" for kind in ('udp', 'tcp')],
            'tmpfs': ['/var/lib/coturn'], 'environment': {'TURN_SHARED_SECRET': values['TURN_SHARED_SECRET'],
            'TURN_REALM': 'localhost', 'EXTERNAL_IP': ips['coturn'], 'TURN_TLS': 'false'}}
    for name, properties in ancillary.items():
        properties.update(container_name=f'{project}-{name}', restart='unless-stopped',
                          networks={'local': {'ipv4_address': ips[name]}})
        output.append(f'  {name}:\n')
        output.extend(f'    {key}: {json.dumps(value)}\n' for key, value in properties.items())
    output.append('volumes:\n')
    for name in ('uploads', 'mongodb', 'mongo-config', 'redis', 'mailpit'):
        output.append(f'  {name}: {json.dumps({"name": project + "-" + name})}\n')
    output.append('networks:\n  local: ' + json.dumps({'name': project + '-network', 'internal': True,
                  'ipam': {'config': [{'subnet': state['subnet']}]}}) + '\n')
    return ''.join(output)


def generate_tls(tls, log):
    # A CA certificate cannot also be the HTTPS leaf in Firefox. Keep the root
    # separate and preserve the server key when repairing an existing local cert.
    ca_key, ca_cert = tls / 'ca-key.pem', tls / 'ca.pem'
    if ca_key.exists() != ca_cert.exists():
        raise ValueError('Local CA key and certificate must both exist or both be absent')
    if not ca_key.exists():
        run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '3650',
             '-sha256', '-keyout', ca_key, '-out', ca_cert,
             '-subj', '/CN=JumpInChat local CA',
             '-addext', 'basicConstraints=critical,CA:TRUE',
             '-addext', 'keyUsage=critical,keyCertSign,cRLSign'], log)
    key = tls / 'privkey.pem'
    if not key.exists():
        run(['openssl', 'genpkey', '-algorithm', 'RSA', '-pkeyopt', 'rsa_keygen_bits:2048',
             '-out', key], log)
    run(['openssl', 'req', '-new', '-key', key, '-subj', '/CN=localhost',
         '-out', tls / 'server.csr'], log)
    private_write(tls / 'server.ext', 'basicConstraints=critical,CA:FALSE\n'
                  'keyUsage=critical,digitalSignature,keyEncipherment\n'
                  'extendedKeyUsage=serverAuth\n'
                  'subjectAltName=DNS:localhost,IP:127.0.0.1\n')
    run(['openssl', 'x509', '-req', '-in', tls / 'server.csr', '-CA', ca_cert,
         '-CAkey', ca_key, '-CAcreateserial', '-days', '365', '-sha256',
         '-extfile', tls / 'server.ext', '-out', tls / 'cert.pem'], log)
    run(['openssl', 'verify', '-CAfile', ca_cert, '-purpose', 'sslserver',
         '-verify_hostname', 'localhost', tls / 'cert.pem'], log)
    private_write(tls / 'fullchain.pem', (tls / 'cert.pem').read_text() + ca_cert.read_text())
    run(['openssl', 'genpkey', '-genparam', '-algorithm', 'DH', '-pkeyopt', 'group:ffdhe2048',
         '-out', tls / 'dhparam.pem'], log)
    for item in tls.iterdir():
        item.chmod(0o600)


def initialize(directory, engine, turn):
    if directory.exists() and any(directory.iterdir()):
        raise ValueError('Refusing to initialize a nonempty directory without local state')
    low, high = free_rtp_range()
    subnet = free_subnet(engine)
    directory.mkdir(parents=True, mode=0o700, exist_ok=True)
    directory.chmod(0o700)
    state = {'format': 1, 'project': 'jic-local-' + secrets.token_hex(4), 'engine': engine,
             'https_port': free_port(8443), 'mail_port': free_port(8025),
             'turn_port': free_port(3478, udp=True), 'turn': turn,
             'rtp_port_min': low, 'rtp_port_max': high, 'subnet': subnet}
    values = {name: secrets.token_hex(32) for name in
              ('JWT_SECRET', 'COOKIE_SECRET', 'SHARED_SECRET', 'JANUS_TOKEN_SECRET',
               'FILE_TOKEN_SECRET', 'TURN_SHARED_SECRET')}
    private_write(directory / 'secrets.json', json.dumps(values))
    (directory / 'logs').mkdir(mode=0o700, exist_ok=True)
    tls = directory / 'tls'
    tls.mkdir(mode=0o700, exist_ok=True)
    with (directory / 'logs/tls.log').open('w') as log:
        generate_tls(tls, log)
    private_write(directory / 'state.json', json.dumps(state, indent=2))
    return state


def compose(state, directory):
    command = ['podman-compose'] if state['engine'] == 'podman' else ['docker', 'compose']
    return command + ['-p', state['project'], '-f', str(directory / 'compose.yml')]


def status(state, directory):
    print(f"App: https://localhost:{state['https_port']}")
    print(f"Inbox: http://localhost:{state['mail_port']}")
    print(f"Project: {state['project']}\nCompose: {directory / 'compose.yml'}")
    print(f"Certificate: {directory / 'tls/fullchain.pem'}")
    print(f"Local CA: {directory / 'tls/ca.pem'}")
    result = run([state['engine'], 'ps', '-a', '--filter', f"name={state['project']}-",
                  '--format', '{{.Names}} {{.Status}}'])
    print(result.stdout.decode().strip() or 'Stopped; local data is preserved.')


def open_browser(state, directory):
    candidates = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
                  shutil.which('google-chrome'), shutil.which('chromium'),
                  shutil.which('chromium-browser')]
    browser = next((path for path in candidates if path and Path(path).is_file()), None)
    if not browser:
        raise RuntimeError('Chrome or Chromium is required for automatic local certificate trust; '
                           'use the URL and certificate printed by status in another browser')
    public_key = run(['openssl', 'pkey', '-in', directory / 'tls/privkey.pem',
                      '-pubout', '-outform', 'DER']).stdout
    spki = base64.b64encode(hashlib.sha256(public_key).digest()).decode()
    profile = directory / 'browser'
    profile.mkdir(mode=0o700, exist_ok=True)
    subprocess.Popen([browser, f'--user-data-dir={profile}',
                      f'--ignore-certificate-errors-spki-list={spki}',
                      '--no-first-run', '--no-default-browser-check',
                      f"https://localhost:{state['https_port']}"],
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                     start_new_session=True)
    print('Opened the local app in its separate browser profile.')


def create_backup(state, directory, destination):
    if destination is None:
        parent = directory / 'backups'
        parent.mkdir(mode=0o700, exist_ok=True)
        destination = parent / datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S.%fZ')
    destination = destination.resolve()
    print('Backing up MongoDB and uploads; web and homepage services briefly stop.', flush=True)
    with (directory / 'logs/backup.log').open('w') as log:
        run([sys.executable, ROOT / 'scripts/backup.py', 'create', destination,
             '--engine', state['engine'], '--project', state['project'],
             '--compose-file', directory / 'compose.yml', '--maintenance'], log)
    print(f'Backup: {destination}')
    verify_frontdoors(state, directory)
    print('Archive checksums verified. Use RECOVERY.md to verify a restore.')


def up(state, directory, rebuild):
    target = directory / 'compose.yml'
    old = target.read_text() if target.exists() else None
    generated = render(state, directory)
    private_write(target, generated)
    command = compose(state, directory)
    with (directory / 'logs/compose.log').open('w') as log:
        run(command + ['config', '-q'], log)
    for name, (context, dockerfile) in BUILDS.items():
        if name == 'coturn' and not state['turn']:
            continue
        tag = f"localhost/{state['project']}-{name}:local"
        if rebuild or run([state['engine'], 'image', 'inspect', tag], check=False).returncode:
            print(f'Building {name}...', flush=True)
            with (directory / f'logs/build-{name}.log').open('w') as log:
                run([state['engine'], 'build', '-f', context / dockerfile,
                     '--build-arg', 'BUILD_REVISION=local', '-t', tag, context], log)
    with (directory / 'logs/compose.log').open('a') as log:
        if rebuild or (old is not None and old != generated):
            # Compose implementations differ in image-change detection and dependent
            # container replacement. Recreate this project without deleting its data.
            run(command + ['down'], log)
        run(command + ['up', '-d', '--no-build'], log)
    mongo = state['project'] + '-mongodb'
    script = ('try { const c=rs.conf(); if(c._id!=="rs0" || c.members.length!==1 || '
              'c.members[0].host!=="mongodb:27017") quit(2); } catch(e) { '
              'if(e.code!==94 && e.codeName!=="NotYetInitialized") throw e; '
              'rs.initiate({_id:"rs0",members:[{_id:0,host:"mongodb:27017"}]}); }')
    for attempt in range(60):
        result = run([state['engine'], 'exec', mongo, 'mongosh', '--quiet', '--eval', script], check=False)
        if not result.returncode:
            break
        time.sleep(1)
    else:
        raise RuntimeError('Local Mongo initialization failed; existing topology was not changed')
    for service, port in [('web', 8080), ('home', 3000)]:
        code = (f"fetch('http://127.0.0.1:{port}/health/ready',{{signal:AbortSignal.timeout(2000)}})"
                '.then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))')
        for attempt in range(90):
            if not run([state['engine'], 'exec', state['project'] + '-' + service,
                        'node', '-e', code], check=False).returncode:
                break
            time.sleep(1)
        else:
            raise RuntimeError(f'{service} is not ready; inspect local logs')
    verify_frontdoors(state, directory)
    status(state, directory)


def verify_frontdoors(state, directory):
    context = ssl.create_default_context(cafile=directory / 'tls/ca.pem')
    # Avoid workstation proxy configuration for this loopback-only profile.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}),
                                         urllib.request.HTTPSHandler(context=context))
    for name, url in [('App', f"https://localhost:{state['https_port']}/login"),
                      ('Inbox', f"http://127.0.0.1:{state['mail_port']}/")]:
        for attempt in range(15):
            try:
                with opener.open(url, timeout=2) as response:
                    if response.status == 200:
                        break
            except (OSError, urllib.error.URLError):
                pass
            time.sleep(1)
        else:
            raise RuntimeError(f'{name} local URL is not ready; inspect local logs')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['up', 'down', 'status', 'open', 'backup'])
    parser.add_argument('--state-dir', type=Path, default=DEPLOY / '.local')
    parser.add_argument('--engine', choices=['podman', 'docker'], default='podman')
    parser.add_argument('--build', action='store_true', help='Rebuild this local project images')
    parser.add_argument('--no-turn', action='store_true', help='Disable local TURN on first initialization')
    parser.add_argument('--destination', type=Path,
                        help='New backup directory; defaults to a timestamped directory in local state')
    args = parser.parse_args()
    directory = args.state_dir.resolve()
    path = directory / 'state.json'
    if path.exists():
        state = json.loads(path.read_text())
        if state.get('format') != 1 or not re.fullmatch(r'jic-local-[a-f0-9]{8}', state.get('project', '')):
            raise ValueError('Not a local launcher state directory')
    elif args.command == 'up':
        state = initialize(directory, args.engine, not args.no_turn)
    else:
        print('Local deployment has not been initialized.')
        return
    if args.command == 'up':
        up(state, directory, args.build)
    elif args.command == 'down':
        # Never pass --volumes: accounts, uploads, inbox, sessions and secrets persist.
        with (directory / 'logs/compose.log').open('a') as log:
            run(compose(state, directory) + ['down'], log)
        status(state, directory)
    elif args.command == 'open':
        open_browser(state, directory)
    elif args.command == 'backup':
        create_backup(state, directory, args.destination)
    else:
        status(state, directory)


if __name__ == '__main__':
    try:
        main()
    except (OSError, RuntimeError, ValueError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
