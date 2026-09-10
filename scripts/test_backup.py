import argparse
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('backup', Path(__file__).with_name('backup.py'))
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)


class BackupTests(unittest.TestCase):
    def test_corruption_is_detected(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            for name in backup.ARCHIVES:
                (directory / name).write_bytes(b'archive fixture')
            manifest = {'format': 1, 'sha256': {
                name: backup.digest(directory / name) for name in backup.ARCHIVES}}
            (directory / 'manifest.json').write_text(json.dumps(manifest))
            backup.verify(directory)
            (directory / backup.ARCHIVES[0]).write_bytes(b'corrupted')
            with self.assertRaisesRegex(ValueError, 'Checksum mismatch'):
                backup.verify(directory)

    def test_failed_dump_restarts_only_previously_running_services(self):
        with tempfile.TemporaryDirectory() as tmp:
            args = argparse.Namespace(maintenance=True, project='test', engine='podman',
                                      compose_file=Path('compose.yml'), database='tc',
                                      directory=Path(tmp) / 'backup')
            calls = []
            running = {'web': True, 'home': False}

            def run(command, output=None, timeout=None):
                calls.append(command)
                if command[-2:] == ['config', '--services']:
                    return 'web\nhome\nmongodb'
                if 'ps' in command:
                    self.assertEqual(command[:4], ['podman', 'ps', '-a', '-q'])
                    self.assertEqual(command[4:7], [
                        '--filter', 'label=com.docker.compose.project=test', '--filter'])
                    self.assertTrue(command[-1].startswith('label=com.docker.compose.service='))
                    return command[-1].split('=', 2)[-1]
                if command[1] == 'inspect':
                    return json.dumps([{'Config': {'Env': ['STORAGE_BACKEND=local', 'MONGODB_URI=mongodb://mongodb/tc?replicaSet=rs0'],
                                                   'Healthcheck': {'Test': ['CMD', 'health-probe']}},
                                        'State': {'Running': running[command[-1]]},
                                        'Image': 'test-image', 'Id': command[-1]}])
                if 'stop' in command:
                    running['web'] = False
                    return ''
                if command[1] == 'start':
                    running[command[-1]] = True
                    return ''
                if command[:3] == ['podman', 'exec', 'web']:
                    self.assertEqual(timeout, 10)
                    return ''
                if 'mongosh' in command:
                    return json.dumps({'version': '8.3.1', 'fcv': '8.3'})
                if command[-1] == '--version':
                    return 'mongodump version: 100.16.0'
                if 'mongodump' in command:
                    raise RuntimeError('simulated dump failure')
                return ''

            with patch.object(backup, 'run', side_effect=run):
                with self.assertRaisesRegex(RuntimeError, 'simulated dump failure'):
                    backup.backup(args)
            self.assertEqual([call for call in calls if call[1] == 'start'], [['podman', 'start', 'web']])
            self.assertEqual(calls[-1], ['podman', 'inspect', 'web'])
            self.assertIn(['podman', 'exec', 'web', 'health-probe'], calls)
            self.assertEqual([call[call.index('stop'):] for call in calls if 'stop' in call],
                             [['stop', '-t', '20', 'web']])
            self.assertFalse((args.directory / 'manifest.json').exists())

    def test_stop_failure_prevents_archives_and_still_recovers_original_services(self):
        with tempfile.TemporaryDirectory() as tmp:
            args = argparse.Namespace(maintenance=True, project='test', engine='podman',
                                      compose_file=Path('compose.yml'), database='tc',
                                      directory=Path(tmp) / 'backup')
            container = {'Id': 'original-web', 'Image': 'fixture', 'State': {'Running': True},
                         'Config': {'Env': ['MONGODB_URI=mongodb://mongodb/tc?replicaSet=rs0']}}

            def run(command, output=None, timeout=None):
                if command[-2:] == ['config', '--services']:
                    return 'web\nmongodb'
                if command[1] == 'ps':
                    return container['Id']
                if command[1] == 'inspect':
                    return json.dumps([container])
                if 'mongosh' in command:
                    return json.dumps({'version': '8.3.9', 'fcv': '8.3'})
                if command[-1] == '--version':
                    return 'mongodump version: 100.18.0'
                if 'stop' in command:
                    return ''  # Successful command, but the process remains running.
                self.fail(f'Unexpected operation before writers stopped: {command[0:2]}')

            with patch.object(backup, 'run', side_effect=run), \
                 patch.object(backup, 'restore_services') as restore, patch.object(backup, 'verify') as verify:
                with self.assertRaisesRegex(RuntimeError, 'Could not stop service before backup: web'):
                    backup.backup(args)
            restore.assert_called_once_with('podman', {'web': container}, ['web'])
            verify.assert_not_called()
            self.assertEqual(list(args.directory.iterdir()), [])

    def test_recovery_failure_does_not_report_a_completed_backup_as_success(self):
        with tempfile.TemporaryDirectory() as tmp:
            args = argparse.Namespace(maintenance=True, project='test', engine='podman',
                                      compose_file=Path('compose.yml'), database='tc',
                                      directory=Path(tmp) / 'backup')
            stopped = False

            def run(command, output=None, timeout=None):
                nonlocal stopped
                if command[-2:] == ['config', '--services']:
                    return 'web\nmongodb'
                if command[1] == 'ps':
                    return 'original-web'
                if command[1] == 'inspect':
                    return json.dumps([{'Id': 'original-web', 'Image': 'fixture',
                        'State': {'Running': not stopped},
                        'Config': {'Env': ['MONGODB_URI=mongodb://mongodb/tc?replicaSet=rs0']}}])
                if 'mongosh' in command:
                    return json.dumps({'version': '8.3.9', 'fcv': '8.3'})
                if command[-1] == '--version':
                    return 'mongodump version: 100.18.0'
                if 'stop' in command:
                    stopped = True
                    return ''
                if output is not None:
                    output.write(b'archive fixture')
                    return None
                self.fail(f'Unexpected operation: {command[0:2]}')

            with patch.object(backup, 'run', side_effect=run), \
                 patch.object(backup, 'restore_services', side_effect=RuntimeError('Could not restore healthy services after backup: web')), \
                 patch.object(backup, 'verify') as verify:
                with self.assertRaisesRegex(RuntimeError, 'Could not restore healthy services'):
                    backup.backup(args)
            verify.assert_not_called()
            self.assertTrue((args.directory / 'manifest.json').is_file())

    def test_container_lookup_requires_one_label_scoped_match_before_stopping_writers(self):
        for engine in ('docker', 'podman'):
            for matches in ('', 'first-container\nsecond-container'):
                with self.subTest(engine=engine, matches=matches), tempfile.TemporaryDirectory() as tmp:
                    args = argparse.Namespace(maintenance=True, project='my-local', engine=engine,
                                              compose_file=Path('compose.yml'), database='tc',
                                              directory=Path(tmp) / 'backup')
                    calls = []

                    def run(command, output=None):
                        calls.append(command)
                        if command[-2:] == ['config', '--services']:
                            return 'web\nmongodb'
                        self.assertEqual(command, [engine, 'ps', '-a', '-q',
                            '--filter', 'label=com.docker.compose.project=my-local',
                            '--filter', 'label=com.docker.compose.service=web'])
                        return matches

                    with patch.object(backup, 'run', side_effect=run):
                        with self.assertRaisesRegex(ValueError, 'exactly one existing container for web'):
                            backup.backup(args)
                    self.assertEqual(len(calls), 2)
                    self.assertFalse(args.directory.exists())

    def test_new_manifest_requires_server_and_tool_versions(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            manifest = {'format': 2, 'sha256': dict.fromkeys(backup.ARCHIVES, 'unused')}
            (directory / 'manifest.json').write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ValueError, 'MongoDB version information'):
                backup.verify(directory)

    def test_maintenance_acknowledgment_precedes_container_operations(self):
        with patch.object(backup, 'run') as run:
            with self.assertRaisesRegex(ValueError, '--maintenance'):
                backup.backup(argparse.Namespace(maintenance=False))
            run.assert_not_called()


class BackupServiceRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.containers = {
            name: {'Id': f'original-{name}', 'State': {'Running': name != 'web2', 'Health': {'Status': 'healthy'}},
                   'Config': {'Healthcheck': {'Test': ['CMD', 'node', 'probe.js']}}}
            for name in ('web', 'web2', 'home')
        }
        self.containers['home']['Config']['Healthcheck']['Test'] = ['CMD-SHELL', 'curl -fsS http://localhost/health/ready']
        self.running = ['web', 'home']

    def inspect(self, identity, running=True):
        return json.dumps([{'Id': identity, 'State': {'Running': running, 'Health': {'Status': 'healthy'}}}])

    def test_starts_original_ids_then_waits_for_fresh_cmd_and_shell_probes(self):
        calls = []
        web_attempts = 0

        def run(command, output=None, timeout=None):
            nonlocal web_attempts
            calls.append(command)
            if command[1] == 'start':
                self.assertEqual(timeout, 30)
            elif command[1] == 'inspect':
                self.assertEqual(timeout, 10)
                return self.inspect(command[2])
            elif command[1] == 'exec':
                self.assertEqual(timeout, 10)
                if command[2] == 'original-web':
                    web_attempts += 1
                    if web_attempts == 1:
                        raise RuntimeError('not ready yet')
            return ''

        with patch.object(backup, 'run', side_effect=run), patch.object(backup.time, 'sleep') as sleep:
            backup.restore_services('podman', self.containers, self.running)
        self.assertEqual([call for call in calls if call[1] == 'start'],
                         [['podman', 'start', 'original-web'], ['podman', 'start', 'original-home']])
        probes = [call for call in calls if call[1] == 'exec']
        self.assertEqual(probes, [
            ['podman', 'exec', 'original-web', 'node', 'probe.js'],
            ['podman', 'exec', 'original-web', 'node', 'probe.js'],
            ['podman', 'exec', 'original-home', 'sh', '-c', 'curl -fsS http://localhost/health/ready'],
        ])
        self.assertLess(calls.index(['podman', 'start', 'original-home']), calls.index(probes[0]))
        self.assertFalse(any('original-web2' in call for call in calls))
        sleep.assert_called_once_with(1)

    def test_failed_or_silently_ineffective_start_does_not_skip_other_services(self):
        for raised_error in (False, True):
            with self.subTest(raised_error=raised_error):
                calls = []

                def run(command, output=None, timeout=None):
                    calls.append(command)
                    if command[1] == 'start' and command[2] == 'original-web' and raised_error:
                        raise RuntimeError('start failed')
                    if command[1] == 'inspect':
                        return self.inspect(command[2], command[2] != 'original-web')
                    return ''

                with patch.object(backup, 'run', side_effect=run), \
                     self.assertRaisesRegex(RuntimeError, 'after backup: web$'):
                    backup.restore_services('docker', self.containers, self.running)
                self.assertIn(['docker', 'start', 'original-home'], calls)
                self.assertIn(['docker', 'exec', 'original-home', 'sh', '-c',
                               'curl -fsS http://localhost/health/ready'], calls)
                self.assertFalse(any('original-web2' in call for call in calls))

    def test_probe_timeout_ignores_cached_healthy_state_and_still_probes_other_services(self):
        calls = []

        def run(command, output=None, timeout=None):
            calls.append(command)
            if command[1] == 'inspect':
                return self.inspect(command[2])
            if command[1] == 'exec' and command[2] == 'original-web':
                self.assertEqual(timeout, 10)
                raise RuntimeError('probe timed out')
            return ''

        with patch.object(backup, 'run', side_effect=run), \
             patch.object(backup.time, 'monotonic', side_effect=[0, 1, 91, 92]), \
             patch.object(backup.time, 'sleep') as sleep, \
             self.assertRaisesRegex(RuntimeError, 'after backup: web$'):
            backup.restore_services('podman', self.containers, self.running)
        web_probes = [call for call in calls if call[:3] == ['podman', 'exec', 'original-web']]
        self.assertEqual(len(web_probes), 2)
        self.assertTrue(any(call[:3] == ['podman', 'exec', 'original-home'] for call in calls))
        sleep.assert_called_once_with(1)

    def test_final_running_check_rejects_a_container_that_exited_after_its_probe(self):
        inspections = 0

        def run(command, output=None, timeout=None):
            nonlocal inspections
            if command[1] == 'inspect':
                inspections += 1
                return self.inspect(command[2], inspections == 1)
            return ''

        with patch.object(backup, 'run', side_effect=run), \
             self.assertRaisesRegex(RuntimeError, 'after backup: web$'):
            backup.restore_services('podman', self.containers, ['web'])
        self.assertEqual(inspections, 2)

    def test_command_timeout_is_bounded_and_does_not_echo_service_output(self):
        command = ['podman', 'exec', 'fixture', 'health-probe']
        timeout = subprocess.TimeoutExpired(command, 10, output=b'private-output-fixture', stderr=b'private-error-fixture')
        with patch.object(backup.subprocess, 'run', side_effect=timeout) as run:
            with self.assertRaisesRegex(RuntimeError, '^podman operation timed out$'):
                backup.run(command, timeout=10)
        self.assertEqual(run.call_args.kwargs['timeout'], 10)


if __name__ == '__main__':
    unittest.main()
