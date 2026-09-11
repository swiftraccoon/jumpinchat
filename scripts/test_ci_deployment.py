import argparse
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch


spec = importlib.util.spec_from_file_location('ci_deployment', Path(__file__).with_name('ci-deployment.py'))
ci = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ci)


class IntegrationOrchestrationTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.parent = Path(temporary.name).resolve()
        self.work = self.parent / 'integration'

    def owned_work(self):
        source = self.work / 'private/source'
        source.mkdir(parents=True)
        (self.work / 'reports').mkdir()
        state = {'format': 1, 'engine': 'docker', 'project': 'jic-local-1234abcd'}
        ci.write_json(source / 'state.json', state)
        ci.write_json(self.work / ci.OWNER, state)
        return source

    def test_existing_or_unowned_work_is_never_adopted_or_cleaned(self):
        self.work.mkdir()
        (self.work / 'unrelated.txt').write_text('preserve this directory')
        args = argparse.Namespace(work_dir=self.work, engine='docker', node='node',
                                  playwright_package=self.parent / 'playwright')
        with patch.object(ci, 'command') as execute, patch.object(ci.local, 'initialize') as initialize:
            with self.assertRaises(FileExistsError):
                ci.run(args)
            with self.assertRaisesRegex(ValueError, 'unowned'):
                ci.cleanup(self.work)
            execute.assert_not_called()
            initialize.assert_not_called()
        self.assertEqual((self.work / 'unrelated.txt').read_text(), 'preserve this directory')
        ci.cleanup(self.parent / 'never-initialized')

    def test_project_mismatch_rejects_cleanup_before_any_engine_command(self):
        source = self.owned_work()
        state = json.loads((source / 'state.json').read_text())
        state['project'] = 'jic-local-deadbeef'
        ci.write_json(source / 'state.json', state)
        with patch.object(ci, 'command') as execute, patch.object(ci.subprocess, 'run') as inspect:
            with self.assertRaisesRegex(ValueError, 'does not match'):
                ci.cleanup(self.work)
            execute.assert_not_called()
            inspect.assert_not_called()

    def test_cleanup_removes_only_named_project_and_verifies_no_resources_remain(self):
        source = self.owned_work()
        (source / 'compose.yml').write_text('services: {}\n')
        clean = subprocess.CompletedProcess([], 0, stdout='', stderr='')
        with patch.object(ci, 'command', return_value=0) as execute, \
                patch.object(ci.subprocess, 'run', return_value=clean) as inspect:
            ci.cleanup(self.work)
        commands = [list(map(str, call.args[0])) for call in execute.call_args_list]
        self.assertEqual(commands[0], ['docker', 'compose', '-p', 'jic-local-1234abcd',
                                      '-f', str(source / 'compose.yml'), 'down', '--volumes', '--remove-orphans'])
        self.assertTrue(all(command[-1].startswith('localhost/jic-local-1234abcd-')
                            for command in commands[1:]))
        queries = [call.args[0] for call in inspect.call_args_list if 'ls' in call.args[0]]
        self.assertEqual(len(queries), 3)
        self.assertTrue(all('label=com.docker.compose.project=jic-local-1234abcd' in query for query in queries))
        self.assertEqual(json.loads((self.work / 'reports/cleanup.json').read_text())['status'], 'passed')

    def test_incomplete_cleanup_is_a_failing_result(self):
        source = self.owned_work()
        (source / 'compose.yml').write_text('services: {}\n')

        def inspect(args, **_kwargs):
            return subprocess.CompletedProcess(args, 0, stdout='remaining-container\n' if 'container' in args else '', stderr='')

        with patch.object(ci, 'command', return_value=0), patch.object(ci.subprocess, 'run', side_effect=inspect):
            with self.assertRaisesRegex(RuntimeError, 'container cleanup'):
                ci.cleanup(self.work)
        self.assertEqual(json.loads((self.work / 'reports/cleanup.json').read_text())['status'], 'failed')

    def test_timed_out_restored_cleanup_does_not_skip_source_cleanup(self):
        source = self.owned_work()
        (source / 'compose.yml').write_text('services: {}\n')
        (self.work / 'private/recovery').mkdir()
        calls = []

        def execute(args, *_args, **_kwargs):
            calls.append(list(map(str, args)))
            if '--cleanup' in args:
                raise subprocess.TimeoutExpired(args, 180)
            return 0

        missing = subprocess.CompletedProcess([], 1, stdout='', stderr='')

        def inspect(args, **_kwargs):
            if 'image' in args:
                return missing
            return subprocess.CompletedProcess(args, 0, stdout='', stderr='')

        with patch.object(ci, 'command', side_effect=execute), patch.object(ci.subprocess, 'run', side_effect=inspect):
            with self.assertRaisesRegex(RuntimeError, 'TimeoutExpired'):
                ci.cleanup(self.work)
        self.assertTrue(any('down' in args and '--volumes' in args for args in calls))
        evidence = json.loads((self.work / 'reports/cleanup.json').read_text())
        self.assertEqual(evidence['status'], 'failed')
        self.assertTrue(any('restored deployment' in error for error in evidence['errors']))

    def test_exports_assertions_and_numeric_energy_without_private_artifacts(self):
        source = self.owned_work()
        secret = 'generated-secret-' + 'a' * 48
        password = 'fixture-password-with-spaces'
        ci.write_json(source / 'secrets.json', {'JWT_SECRET': secret})
        ci.write_json(self.work / 'private/fixture.json', {'password': password, 'account': 'synthetic'})
        media = self.work / 'private/media'
        media.mkdir()
        ci.write_json(media / 'result-all.json', {
            'status': 'passed', 'audioOutputMuted': True,
            'clients': [{'consoleErrors': ['do not export native session diagnostics'], 'cookie': 'sensitive'}],
            'checks': [{'name': 'received audio grows', 'details': {
                'before': {'inboundAudioEnergy': 0.02}, 'after': {'inboundAudioEnergy': 0.06},
                'mediaRequests': 'private constraints and device identifiers',
            }}],
        })
        (self.work / 'private/application.log').write_text(f'fixture: {password}\nsecret: {secret}\na=ice-pwd:fixture-unknown-ice-password\nGET /socket.io/?sid=opaque-session-id HTTP/1.1\n{{"sessionId":"fixture-session-id"}}\n')
        (self.work / 'private/archive.gz').write_bytes(b'database archive must stay private')
        ci.collect(self.work)
        output = json.loads((self.work / 'reports/media.json').read_text())
        self.assertTrue(output['audioOutputMuted'])
        self.assertEqual(output['checks'][0]['details']['after']['inboundAudioEnergy'], 0.06)
        exported = '\n'.join(item.read_text() for item in (self.work / 'reports').iterdir())
        for forbidden in [secret, password, 'fixture-unknown-ice-password', 'opaque-session-id', 'fixture-session-id', 'native session', 'device identifiers', 'database archive']:
            self.assertNotIn(forbidden, exported)
        self.assertEqual({item.name for item in (self.work / 'reports').iterdir()}, {'media.json', 'application.log'})

    def test_timeout_terminates_the_actual_child_process(self):
        log = self.parent / 'child.log'
        with self.assertRaises(subprocess.TimeoutExpired):
            ci.command([sys.executable, '-c', 'import os,time; print(os.getpid(), flush=True); time.sleep(60)'],
                       log, timeout=0.2)
        child = int(log.read_text().strip())
        with self.assertRaises(ProcessLookupError):
            os.kill(child, 0)

    def test_launch_failure_still_runs_owned_cleanup_and_exports_failure(self):
        args = argparse.Namespace(work_dir=self.work, engine='docker', node='node',
                                  playwright_package=self.parent / 'playwright')

        def initialize(directory, engine, _turn):
            directory.mkdir()
            state = {'format': 1, 'engine': engine, 'project': 'jic-local-1234abcd'}
            ci.write_json(directory / 'state.json', state)
            return state

        with patch.object(ci.local, 'initialize', side_effect=initialize), \
                patch.object(ci, 'command', side_effect=RuntimeError('fixture start failed')), \
                patch.object(ci, 'cleanup') as cleanup, patch.object(ci, 'collect') as collect:
            with self.assertRaisesRegex(RuntimeError, 'fixture start failed'):
                ci.run(args)
        cleanup.assert_called_once_with(self.work)
        collect.assert_called_once_with(self.work)
        outcome = json.loads((self.work / 'reports/integration.json').read_text())
        self.assertEqual(outcome['status'], 'failed')

    def test_report_write_failure_cannot_skip_resource_cleanup(self):
        args = argparse.Namespace(work_dir=self.work, engine='docker', node='node',
                                  playwright_package=self.parent / 'playwright')
        write = ci.write_json

        def fail_report(path, value):
            if path.name == 'integration.json':
                raise OSError('fixture artifact write failed')
            write(path, value)

        with patch.object(ci.local, 'initialize', side_effect=RuntimeError('fixture start failed')), \
                patch.object(ci, 'write_json', side_effect=fail_report), \
                patch.object(ci, 'cleanup') as cleanup, patch.object(ci, 'collect') as collect:
            with self.assertRaisesRegex(OSError, 'artifact write failed'):
                ci.run(args)
        cleanup.assert_called_once_with(self.work)
        collect.assert_called_once_with(self.work)


if __name__ == '__main__':
    unittest.main()
