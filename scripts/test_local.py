import contextlib
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import tempfile
import unittest
from unittest.mock import patch


spec = importlib.util.spec_from_file_location('local_launcher', Path(__file__).with_name('local.py'))
launcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launcher)


def service_property(document, service, key):
    """Read generated JSON properties without needing a second YAML dependency."""
    section = re.search(rf'^  {re.escape(service)}:\n(.*?)(?=^  [a-z]|^\S|\Z)',
                        document, re.MULTILINE | re.DOTALL)
    if not section:
        raise AssertionError(f'Missing service {service}')
    entry = re.search(rf'^    {re.escape(key)}: (.+)$', section[1], re.MULTILINE)
    if not entry:
        return None
    try:
        return json.loads(entry[1])
    except json.JSONDecodeError:
        return entry[1]


class LocalProfileTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.directory = Path(temporary.name).resolve()
        self.state = {
            'format': 1, 'project': 'jic-local-a1b2c3d4', 'engine': 'podman',
            'https_port': 18443, 'mail_port': 18025, 'turn_port': 13478,
            'turn': True, 'subnet': '10.208.201.0/24',
            'rtp_port_min': 24000, 'rtp_port_max': 24100,
        }
        self.secrets = {name: f'local-fixture-{name.lower()}' for name in (
            'JWT_SECRET', 'COOKIE_SECRET', 'SHARED_SECRET', 'JANUS_TOKEN_SECRET',
            'FILE_TOKEN_SECRET', 'TURN_SHARED_SECRET',
        )}
        launcher.private_write(self.directory / 'secrets.json', json.dumps(self.secrets))
        launcher.private_write(self.directory / 'state.json', json.dumps(self.state))
        (self.directory / 'logs').mkdir()

    def test_default_expansion_and_required_settings(self):
        self.assertEqual(launcher.expand('${REDIS_IMAGE:-redis:fixture}', {}), 'redis:fixture')
        self.assertEqual(launcher.expand('${REDIS_IMAGE:-redis:fixture}', {'REDIS_IMAGE': ''}),
                         'redis:fixture')
        self.assertEqual(launcher.expand('$JWT_SECRET', {'JWT_SECRET': 'local-fixture'}),
                         'local-fixture')
        self.assertEqual(launcher.expand('${EMPTY:-}', {}), '')
        with self.assertRaisesRegex(ValueError, 'Missing generated local setting: REQUIRED'):
            launcher.expand('${REQUIRED:?configure this setting}', {})

    def test_render_uses_only_local_provider_and_database_settings(self):
        with patch.dict(os.environ, {
            'STRIPE_SK': 'host-provider-value-must-not-be-used',
            'STRIPE_KEY_PUBLIC': 'host-public-value-must-not-be-used',
            'SMTP_HOST': 'external-mail.invalid',
            'MONGODB_URI': 'mongodb://unrelated.invalid/existing',
            'REDIS_URI': 'redis://unrelated.invalid:6379',
        }):
            output = launcher.render(self.state, self.directory)
        web = service_property(output, 'web', 'environment')
        home = service_property(output, 'home', 'environment')
        email = service_property(output, 'email', 'environment')
        self.assertEqual(web['MONGODB_URI'], 'mongodb://mongodb/tc?replicaSet=rs0')
        self.assertEqual(home['MONGODB_URI'], web['MONGODB_URI'])
        self.assertEqual(web['REDIS_URI'], 'redis://redis:6379')
        self.assertEqual(web['STRIPE_SK'], '')
        self.assertEqual(web['STRIPE_WH_KEY'], '')
        self.assertEqual(home['STRIPE_KEY_PUBLIC'], '')
        self.assertEqual(web['PUBLIC_BASE_URL'], 'https://localhost:18443')
        self.assertEqual(home['PUBLIC_BASE_URL'], web['PUBLIC_BASE_URL'])
        self.assertEqual(home['API_URL'], 'http://web')
        self.assertEqual(email['SMTP_HOST'], 'mailpit')
        self.assertEqual(email['SMTP_USER'], '')
        self.assertEqual(email['SMTP_PASS'], '')
        self.assertEqual(email['SMTP_SECURE'], 'false')
        self.assertEqual(web['JANUS_TOKEN_SECRET'], self.secrets['JANUS_TOKEN_SECRET'])
        self.assertNotIn('unrelated.invalid', output)
        self.assertNotIn('host-provider-value', output)
        self.assertTrue(service_property(output, 'redis', 'image').startswith('docker.io/library/redis:'))
        self.assertIn('@sha256:', service_property(output, 'mailpit', 'image'))

    def test_named_data_volumes_and_exposed_ports_are_scoped_to_this_profile(self):
        output = launcher.render(self.state, self.directory)
        for service in (*launcher.SERVICES, 'mailpit', 'dns', 'coturn'):
            self.assertEqual(service_property(output, service, 'container_name'),
                             f"{self.state['project']}-{service}")
            for binding in service_property(output, service, 'ports') or []:
                self.assertTrue(binding.startswith('127.0.0.1:'), binding)
        for service in ('web', 'home', 'mongodb', 'redis', 'email', 'dns'):
            self.assertIsNone(service_property(output, service, 'ports'))
        self.assertEqual(service_property(output, 'web', 'volumes')[0], 'uploads:/data/uploads')
        self.assertIn('uploads:/data/uploads:ro', service_property(output, 'nginx', 'volumes'))
        self.assertIn('mongodb:/data/db', service_property(output, 'mongodb', 'volumes'))
        self.assertIn('mongo-config:/data/configdb', service_property(output, 'mongodb', 'volumes'))
        self.assertEqual(service_property(output, 'redis', 'volumes'), ['redis:/data'])
        self.assertEqual(service_property(output, 'redis', 'command'),
                         ['redis-server', '--appendonly', 'yes'])
        for name in ('uploads', 'mongodb', 'mongo-config', 'redis', 'mailpit'):
            self.assertIn(json.dumps({'name': self.state['project'] + '-' + name}), output)
        self.assertNotIn('./data/db', output)
        self.assertIn('"internal": true', output)
        records = json.loads((self.directory / 'records.json').read_text())
        self.assertTrue(set(launcher.SERVICES).issubset(records))
        self.assertEqual(records['mailpit'], '10.208.201.17')

    def test_disabling_turn_removes_the_server_and_browser_advertisement(self):
        output = launcher.render({**self.state, 'turn': False}, self.directory)
        self.assertNotIn('\n  coturn:\n', output)
        self.assertEqual(service_property(output, 'web', 'environment')['TURN_URIS'], '')

    def test_rtp_mapping_matches_janus_configuration_and_preserves_legacy_ports(self):
        for state, low, high in (
            (self.state, 24000, 24100),
            ({key: value for key, value in self.state.items() if not key.startswith('rtp_')}, 20000, 20100),
        ):
            with self.subTest(low=low):
                output = launcher.render(state, self.directory)
                self.assertEqual(service_property(output, 'janus', 'ports'),
                                 [f'127.0.0.1:{low}-{high}:{low}-{high}/udp'])
                environment = service_property(output, 'janus', 'environment')
                self.assertEqual(environment['RTP_PORT_MIN'], str(low))
                self.assertEqual(environment['RTP_PORT_MAX'], str(high))

    def test_busy_udp_port_falls_back_to_a_port_free_for_both_protocols(self):
        with socket.socket(type=socket.SOCK_DGRAM) as busy:
            busy.bind(('127.0.0.1', 0))
            preferred = busy.getsockname()[1]
            with socket.socket() as tcp_probe:
                tcp_probe.bind(('127.0.0.1', preferred))
            selected = launcher.free_port(preferred, udp=True)
            self.assertNotEqual(selected, preferred)
            with socket.socket() as tcp, socket.socket(type=socket.SOCK_DGRAM) as udp:
                tcp.bind(('127.0.0.1', selected))
                udp.bind(('127.0.0.1', selected))

    def test_rtp_selection_skips_a_busy_range_and_releases_all_probe_sockets(self):
        first, last = launcher.free_rtp_range()
        with socket.socket(type=socket.SOCK_DGRAM) as busy:
            busy.bind(('127.0.0.1', first + 50))
            low, high = launcher.free_rtp_range()
            self.assertEqual(high - low + 1, 101)
            self.assertTrue(high < first or low > last)
            with contextlib.ExitStack() as stack:
                for port in range(low, high + 1):
                    listener = stack.enter_context(socket.socket(type=socket.SOCK_DGRAM))
                    listener.bind(('127.0.0.1', port))

    def test_subnet_selection_handles_docker_null_ipam_and_both_engine_formats(self):
        records = [
            {'Name': 'none', 'IPAM': {'Config': None}},
            {'Name': 'bridge', 'IPAM': {'Config': [{'Subnet': '10.208.0.0/23'}, {'Subnet': 'fd00::/64'}]}},
            {'name': 'local', 'subnets': [{'subnet': '10.208.2.0/24'}]},
        ]
        responses = [
            subprocess.CompletedProcess([], 0, stdout=b'none\nbridge\nlocal\n'),
            subprocess.CompletedProcess([], 0, stdout=json.dumps(records).encode()),
        ]
        with patch.object(launcher, 'run', side_effect=responses) as run, \
             patch.object(launcher.secrets, 'randbelow', return_value=0):
            self.assertEqual(launcher.free_subnet('docker'), '10.208.3.0/24')
        self.assertEqual(run.call_args_list[1].args[0],
                         ['docker', 'network', 'inspect', 'none', 'bridge', 'local'])

    def test_subnet_selection_refuses_an_exhausted_range(self):
        responses = [
            subprocess.CompletedProcess([], 0, stdout=b'existing\n'),
            subprocess.CompletedProcess([], 0, stdout=b'[{"IPAM":{"Config":[{"Subnet":"10.208.0.0/16"}]}}]'),
        ]
        with patch.object(launcher, 'run', side_effect=responses), \
             self.assertRaisesRegex(RuntimeError, 'No unused local profile subnet'):
            launcher.free_subnet('docker')

    def test_initialization_refuses_an_unowned_nonempty_directory_before_any_mutation(self):
        unowned = self.directory / 'unrelated'
        unowned.mkdir(mode=0o755)
        marker = unowned / 'existing-data.txt'
        marker.write_text('existing data must remain unchanged')
        original_mode = unowned.stat().st_mode
        with patch.object(launcher, 'run') as run, \
             patch.object(launcher, 'free_rtp_range') as ports, \
             patch.object(launcher, 'free_subnet') as subnet:
            with self.assertRaisesRegex(ValueError, 'Refusing to initialize a nonempty directory'):
                launcher.initialize(unowned, 'docker', True)
        run.assert_not_called()
        ports.assert_not_called()
        subnet.assert_not_called()
        self.assertEqual(list(unowned.iterdir()), [marker])
        self.assertEqual(marker.read_text(), 'existing data must remain unchanged')
        self.assertEqual(unowned.stat().st_mode, original_mode)

    def test_rerender_preserves_identity_secrets_and_generated_private_file_modes(self):
        before = {name: (self.directory / name).read_bytes() for name in ('state.json', 'secrets.json')}
        first = launcher.render(self.state, self.directory)
        generated = ('.env', 'records.json', 'resolv.conf')
        original_time = 1_700_000_000_000_000_000
        for name in generated:
            os.utime(self.directory / name, ns=(original_time, original_time))
        second = launcher.render(self.state, self.directory)
        self.assertEqual(first, second)
        for name, value in before.items():
            self.assertEqual((self.directory / name).read_bytes(), value)
        for name in ('.env', 'records.json', 'resolv.conf', 'state.json', 'secrets.json'):
            self.assertEqual((self.directory / name).stat().st_mode & 0o777, 0o600)
        for name in generated:
            self.assertEqual((self.directory / name).stat().st_mtime_ns, original_time)

    def test_changed_canonical_service_set_is_rejected(self):
        source = (launcher.DEPLOY / 'compose.lite.yml').read_text()
        with self.assertRaisesRegex(ValueError, 'Canonical lite service set changed'):
            launcher.service_blocks(source.replace('\n  redis:\n', '\n  othercache:\n'))

    def test_down_uses_the_recorded_project_without_removing_data_or_configuration(self):
        (self.directory / 'compose.yml').write_text('fixture compose file\n')
        before = {name: (self.directory / name).read_bytes()
                  for name in ('state.json', 'secrets.json', 'compose.yml')}
        result = subprocess.CompletedProcess([], 0, stdout=b'', stderr=b'')
        with patch.object(launcher, 'run', return_value=result) as run, \
             patch.object(launcher, 'initialize') as initialize, \
             patch.object(launcher.sys, 'argv', ['local.py', 'down', '--state-dir', str(self.directory),
                                               '--engine', 'docker']), \
             contextlib.redirect_stdout(io.StringIO()):
            launcher.main()
        initialize.assert_not_called()
        commands = [call.args[0] for call in run.call_args_list]
        self.assertEqual(commands[0], ['podman-compose', '-p', self.state['project'],
                                      '-f', str(self.directory / 'compose.yml'), 'down'])
        self.assertEqual(len(commands), 2)
        self.assertIn(f"name={self.state['project']}-", commands[1])
        for name, value in before.items():
            self.assertEqual((self.directory / name).read_bytes(), value)

    def test_repeated_up_keeps_the_recorded_engine_and_turn_choice(self):
        with patch.object(launcher, 'up') as up, patch.object(launcher, 'initialize') as initialize, \
             patch.object(launcher.sys, 'argv', ['local.py', 'up', '--state-dir', str(self.directory),
                                               '--engine', 'docker', '--no-turn']):
            launcher.main()
        initialize.assert_not_called()
        up.assert_called_once_with(self.state, self.directory, False)

    def test_unchanged_up_avoids_teardown_but_build_or_configuration_changes_recreate_without_data_removal(self):
        generated = launcher.render(self.state, self.directory)
        result = subprocess.CompletedProcess([], 0, stdout=b'', stderr=b'')
        for rebuild, prior, should_recreate in (
            (False, generated, False), (True, generated, True), (False, '# previous profile\n', True),
        ):
            with self.subTest(rebuild=rebuild, should_recreate=should_recreate):
                (self.directory / 'compose.yml').write_text(prior)
                with patch.object(launcher, 'run', return_value=result) as run, \
                     patch.object(launcher, 'verify_frontdoors'), patch.object(launcher, 'status'), \
                     contextlib.redirect_stdout(io.StringIO()):
                    launcher.up(self.state, self.directory, rebuild)
                commands = [call.args[0] for call in run.call_args_list]
                stops = [command for command in commands if command[-1] == 'down']
                self.assertEqual(len(stops), int(should_recreate))
                for command in stops:
                    self.assertEqual(command, launcher.compose(self.state, self.directory) + ['down'])
                starts = [command for command in commands if command[-3:] == ['up', '-d', '--no-build']]
                self.assertEqual(len(starts), 1)
                if stops:
                    self.assertLess(commands.index(stops[0]), commands.index(starts[0]))
                self.assertTrue((self.directory / 'secrets.json').is_file())

    def test_generated_tls_is_a_separate_localhost_server_certificate_signed_by_the_local_ca(self):
        tls = self.directory / 'tls'
        tls.mkdir(mode=0o700)
        with (self.directory / 'tls-test.log').open('w') as log:
            launcher.generate_tls(tls, log)
        for option, name in (('-verify_hostname', 'localhost'), ('-verify_ip', '127.0.0.1')):
            result = subprocess.run(['openssl', 'verify', '-CAfile', str(tls / 'ca.pem'),
                                     '-purpose', 'sslserver', option, name, str(tls / 'cert.pem')],
                                    capture_output=True, text=True, timeout=10)
            self.assertEqual(result.returncode, 0, result.stderr)
        certificate = subprocess.run(['openssl', 'x509', '-in', str(tls / 'cert.pem'), '-noout', '-text'],
                                     capture_output=True, text=True, timeout=10, check=True).stdout
        self.assertIn('CA:FALSE', certificate)
        self.assertIn('TLS Web Server Authentication', certificate)
        self.assertIn('DNS:localhost', certificate)
        self.assertIn('IP Address:127.0.0.1', certificate)
        self.assertEqual((tls / 'fullchain.pem').read_text().count('BEGIN CERTIFICATE'), 2)
        for item in tls.iterdir():
            self.assertEqual(item.stat().st_mode & 0o777, 0o600)
        original = {name: hashlib.sha256((tls / name).read_bytes()).hexdigest()
                    for name in ('privkey.pem', 'ca-key.pem', 'ca.pem')}
        with (self.directory / 'tls-test.log').open('a') as log:
            launcher.generate_tls(tls, log)
        for name, digest in original.items():
            self.assertEqual(hashlib.sha256((tls / name).read_bytes()).hexdigest(), digest)

    def test_unrelated_state_is_rejected_before_any_container_operation(self):
        launcher.private_write(self.directory / 'state.json', json.dumps({
            **self.state, 'project': 'unrelated-existing-project',
        }))
        with patch.object(launcher, 'run') as run, patch.object(launcher, 'up') as up, \
             patch.object(launcher.sys, 'argv', ['local.py', 'up', '--state-dir', str(self.directory)]):
            with self.assertRaisesRegex(ValueError, 'Not a local launcher state directory'):
                launcher.main()
        run.assert_not_called()
        up.assert_not_called()


if __name__ == '__main__':
    unittest.main()
