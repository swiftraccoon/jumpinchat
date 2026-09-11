import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import signal
import subprocess
import tempfile
import unittest
from unittest.mock import patch


spec = importlib.util.spec_from_file_location('deployment_recovery', Path(__file__).with_name('test-recovery.py'))
recovery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recovery)


class RecoveryOrchestrationTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.parent = Path(temporary.name).resolve()
        self.source = self.parent / 'source'
        self.source.mkdir()
        self.work = self.parent / 'recovery'
        self.source_state = {
            'format': 1, 'engine': 'docker', 'project': 'jic-local-11223344',
            'https_port': 18443, 'turn': True,
        }
        self.target_state = {
            'format': 1, 'engine': 'docker', 'project': 'jic-local-aabbccdd',
            'https_port': 19443, 'turn': True,
        }
        self.write(self.source / 'state.json', self.source_state)
        self.write(self.source / 'secrets.json', {'JWT_SECRET': 'isolated-synthetic-signing-key'})
        self.fixture = self.parent / 'fixture.json'
        self.write(self.fixture, {
            'format': 1, 'username': 'smoke0123456789ab',
            'sourceOrigin': 'https://localhost:18443',
        })
        self.args = argparse.Namespace(
            source_state=self.source, work_dir=self.work, fixture=self.fixture,
            report=self.parent / 'report.json', node='node',
        )

    @staticmethod
    def write(path, value):
        path.write_text(json.dumps(value))

    @staticmethod
    def result(command, value=b'', code=0):
        if not isinstance(value, bytes):
            value = json.dumps(value).encode()
        return subprocess.CompletedProcess(command, code, stdout=value, stderr=b'')

    def owned_work(self, *, pending=False, claimed=True):
        target = self.work / 'restored'
        target.mkdir(parents=True)
        self.write(target / 'state.json', self.target_state)
        self.owner = {
            'format': 1, 'engine': 'docker', 'project': self.target_state['project'],
            'claimed': claimed,
            'images': {'web': 'sha256:' + 'a' * 64, 'home': 'sha256:' + 'b' * 64},
            'source': {
                'state_dir': str(self.source), 'project': self.source_state['project'],
                'pending': pending, 'containers': {'web': '1' * 64, 'home': '2' * 64},
                'running': ['web'],
            },
        }
        if not claimed:
            self.owner['images'] = {}
            del self.owner['source']
        self.write(self.work / recovery.OWNER, self.owner)
        return self.owner

    def container_info(self, name, *, source=False):
        project = (self.source_state if source else self.target_state)['project']
        service = name.removeprefix(project + '-')
        labels = {'com.docker.compose.project': project, 'com.docker.compose.service': service}
        if service in ('uploads', 'snapshot-source', 'snapshot-restored', 'backup-uploads'):
            labels['jic.recovery'] = project
        return {
            'Id': (('1' if service == 'web' else '2') * 64 if source
                   else hashlib.sha256(name.encode()).hexdigest()),
            'Name': '/' + name, 'Config': {'Labels': labels},
            'State': {'Running': False}, 'Image': 'sha256:' + 'a' * 64,
        }

    def cleanup_engine(self, calls, *, invalid_helper=None, timeout_helper=None, wrong_image=False):
        project = self.target_state['project']
        removed = set()

        def execute(command, *_args, **_kwargs):
            command = list(map(str, command))
            calls.append(command)
            name = command[-1]
            if 'inspect' in command:
                if name in removed:
                    return self.result(command, code=1)
                if name == project + '-' + str(timeout_helper):
                    raise subprocess.TimeoutExpired(command, 10)
                if command[1] == 'image':
                    service = name.rsplit('-', 1)[-1].split(':')[0]
                    image = self.owner['images'].get(service, 'sha256:' + 'c' * 64)
                    if wrong_image and service == 'web':
                        image = 'sha256:' + 'd' * 64
                    return self.result(command, [{'Id': image}])
                if command[1] in ('volume', 'network'):
                    return self.result(command, [{'Name': name, 'Labels': {
                        'com.docker.compose.project': project,
                    }}])
                info = self.container_info(name)
                if name == project + '-' + str(invalid_helper):
                    info['Config']['Labels'] = {'jic.recovery': 'another-project'}
                return self.result(command, [info])
            if 'rm' in command:
                removed.add(name)
                return self.result(command)
            if 'ls' in command:
                return self.result(command)
            raise AssertionError(f'Unexpected mocked engine operation: {command}')

        return execute

    def test_failure_diagnostics_capture_only_owned_state_and_continue_after_errors(self):
        self.owned_work()
        project = self.target_state['project']

        def inspect(command, *_args, **_kwargs):
            name = command[-1]
            if name == project + '-web':
                raise subprocess.TimeoutExpired(command, 10)
            item = self.container_info(name)
            item['Config']['Env'] = ['PRIVATE_SECRET=never-export-this']
            if name == project + '-home':
                item['Config']['Labels'] = {'com.docker.compose.project': 'other-project'}
            return self.result(command, [item])

        with patch.object(recovery, 'run', side_effect=inspect), \
                patch.object(recovery.subprocess, 'run', return_value=self.result([], b'x' * 260_000)):
            recovery.capture_diagnostics(self.work)
        self.assertFalse((self.work / 'diagnostic-web-state.log').exists())
        self.assertFalse((self.work / 'diagnostic-home-state.log').exists())
        self.assertEqual(json.loads((self.work / 'diagnostic-nginx-state.log').read_text()), {'Running': False})
        self.assertEqual((self.work / 'diagnostic-nginx-service.log').stat().st_size, 250_000)
        self.assertNotIn('never-export-this', ''.join(path.read_text() for path in self.work.glob('diagnostic-*.log')))
        self.assertEqual(len(json.loads((self.work / 'diagnostics.json').read_text())['failures']), 2)

    def test_unowned_work_cannot_trigger_engine_operations(self):
        self.work.mkdir()
        unrelated = self.work / 'unrelated.txt'
        unrelated.write_text('keep this data')
        with patch.object(recovery, 'run') as execute, \
                patch.object(recovery.local, 'initialize') as initialize:
            with self.assertRaisesRegex(ValueError, 'unowned'):
                recovery.cleanup(self.work)
            with self.assertRaises(FileExistsError):
                recovery.rehearse(self.args)
            execute.assert_not_called()
            initialize.assert_not_called()
        self.assertEqual(unrelated.read_text(), 'keep this data')
        recovery.cleanup(self.parent / 'never-created')

    def test_wrong_source_fixture_is_rejected_before_creating_restore_state(self):
        self.write(self.fixture, {
            'format': 1, 'username': 'smoke0123456789ab',
            'sourceOrigin': 'https://localhost:28443',
        })
        with patch.object(recovery, 'run') as execute, \
                patch.object(recovery.local, 'initialize') as initialize:
            with self.assertRaisesRegex(ValueError, 'fixture'):
                recovery.rehearse(self.args)
            execute.assert_not_called()
            initialize.assert_not_called()
        self.assertFalse(self.work.exists())

    def test_invalid_ownership_ledger_is_rejected_before_engine_operations(self):
        owner = self.owned_work()
        invalid = [
            {**owner, 'project': 'jic-local-deadbeef'},
            {**owner, 'engine': 'podman'},
            {**owner, 'images': {'unrecognized-service': 'sha256:' + 'a' * 64}},
            {**owner, 'source': {**owner['source'], 'project': self.target_state['project']}},
            {**owner, 'source': {**owner['source'], 'containers': {'web': 'not-a-container-id'}}},
        ]
        for value in invalid:
            with self.subTest(ledger=value):
                self.write(self.work / recovery.OWNER, value)
                with patch.object(recovery, 'run') as execute, \
                        patch.object(recovery.backup, 'restore_services') as resume:
                    with self.assertRaises(ValueError):
                        recovery.cleanup(self.work)
                    execute.assert_not_called()
                    resume.assert_not_called()

    def test_unclaimed_work_never_removes_resources_during_fallback_cleanup(self):
        self.owned_work(claimed=False)
        with patch.object(recovery, 'run') as execute, \
                patch.object(recovery.backup, 'restore_services') as resume:
            recovery.cleanup(self.work)
            execute.assert_not_called()
            resume.assert_not_called()

    def test_interrupted_owner_replacement_keeps_previous_valid_recovery_journal(self):
        owner = self.owned_work(pending=True)
        path = self.work / recovery.OWNER
        original = path.read_bytes()
        files = set(self.work.iterdir())
        updated = {**owner, 'source': {**owner['source'], 'pending': False}}
        with patch.object(Path, 'replace', side_effect=OSError('fixture replacement interrupted')):
            with self.assertRaisesRegex(OSError, 'replacement interrupted'):
                recovery.write_json(path, updated)
        self.assertEqual(path.read_bytes(), original)
        self.assertEqual(recovery.ownership(self.work), owner)
        self.assertTrue(recovery.ownership(self.work)['source']['pending'])
        self.assertEqual(set(self.work.iterdir()), files, 'An interrupted atomic write must remove its temporary file')

    def test_remaining_helper_fails_cleanup_even_when_compose_resources_are_gone(self):
        self.owned_work()
        project = self.target_state['project']
        calls = []

        def execute(command, *_args, **_kwargs):
            calls.append(command)
            if 'inspect' in command:
                return self.result(command, code=1)
            self.assertIn('ls', command)
            remaining = b'fixture-helper-id\n' if f'label=jic.recovery={project}' in command else b''
            return self.result(command, remaining)

        with patch.object(recovery, 'run', side_effect=execute):
            with self.assertRaisesRegex(RuntimeError, 'helper removal verification'):
                recovery.cleanup(self.work)
        queries = [command for command in calls if f'label=jic.recovery={project}' in command]
        self.assertEqual(len(queries), 1)
        self.assertIn('-a', queries[0])
        self.assertEqual(json.loads((self.work / 'cleanup.json').read_text())['status'], 'failed')

    def test_helper_inspection_timeout_does_not_skip_independent_cleanup(self):
        self.owned_work()
        calls = []
        with patch.object(recovery, 'run', side_effect=self.cleanup_engine(calls, timeout_helper='uploads')):
            with self.assertRaises(RuntimeError):
                recovery.cleanup(self.work)
        project = self.target_state['project']
        identity = self.container_info(project + '-home')['Id']
        self.assertTrue(any('rm' in command and command[-1] == identity for command in calls))
        self.assertTrue(any(command[1:3] == ['image', 'rm'] for command in calls))
        self.assertTrue(any(command[1] == 'network' for command in calls))
        report = json.loads((self.work / 'cleanup.json').read_text())
        self.assertEqual(report['status'], 'failed')

    def test_mismatched_helper_is_preserved_while_other_owned_resources_are_removed(self):
        self.owned_work()
        calls = []
        with patch.object(recovery, 'run', side_effect=self.cleanup_engine(calls, invalid_helper='snapshot-source')):
            with self.assertRaises(RuntimeError):
                recovery.cleanup(self.work)
        project = self.target_state['project']
        removals = [command[-1] for command in calls if 'rm' in command]
        self.assertNotIn(self.container_info(project + '-snapshot-source')['Id'], removals)
        self.assertIn(self.container_info(project + '-snapshot-restored')['Id'], removals)
        self.assertIn(self.container_info(project + '-web')['Id'], removals)
        self.assertEqual(json.loads((self.work / 'cleanup.json').read_text())['status'], 'failed')

    def test_image_identity_mismatch_preserves_tag_and_cleans_other_recorded_images(self):
        self.owned_work()
        calls = []
        with patch.object(recovery, 'run', side_effect=self.cleanup_engine(calls, wrong_image=True)):
            with self.assertRaises(RuntimeError):
                recovery.cleanup(self.work)
        project = self.target_state['project']
        image_removals = [command[-1] for command in calls if command[1:3] == ['image', 'rm']]
        self.assertNotIn(f'localhost/{project}-web:local', image_removals)
        self.assertIn(f'localhost/{project}-home:local', image_removals)

    def test_interrupted_source_recovery_preserves_originally_stopped_services(self):
        owner = self.owned_work(pending=True)

        def inspect(command, *_args, **_kwargs):
            identity = str(command[-1])
            service = 'web' if identity == '1' * 64 else 'home'
            info = self.container_info(self.source_state['project'] + '-' + service, source=True)
            return self.result(command, [info])

        with (self.work / 'operations.log').open('w') as log, \
                patch.object(recovery, 'run', side_effect=inspect) as probes, \
                patch.object(recovery.backup, 'restore_services') as resume, \
                patch.object(recovery.local, 'verify_frontdoors'):
            recovery.recover_source(self.work, owner, log)
        resume.assert_called_once()
        self.assertEqual(resume.call_args.args[0], 'docker')
        self.assertEqual(resume.call_args.args[2], ['web'])
        self.assertEqual(resume.call_args.args[1]['web']['Id'], '1' * 64)
        self.assertEqual([call.args[0][-1] for call in probes.call_args_list], ['1' * 64])
        persisted = json.loads((self.work / recovery.OWNER).read_text())
        self.assertFalse(persisted['source']['pending'])

    def test_failed_source_readiness_keeps_pending_recovery_for_next_cleanup(self):
        owner = self.owned_work(pending=True)

        def inspect(command, *_args, **_kwargs):
            service = 'web' if str(command[-1]) == '1' * 64 else 'home'
            return self.result(command, [self.container_info(self.source_state['project'] + '-' + service, source=True)])

        with (self.work / 'operations.log').open('w') as log, \
                patch.object(recovery, 'run', side_effect=inspect), \
                patch.object(recovery.backup, 'restore_services', side_effect=RuntimeError('fresh readiness failed')):
            with self.assertRaises(RuntimeError):
                recovery.recover_source(self.work, owner, log)
        self.assertTrue(json.loads((self.work / recovery.OWNER).read_text())['source']['pending'])

    def test_source_identity_mismatch_cannot_restart_replacement_container(self):
        owner = self.owned_work(pending=True)
        owner['source']['running'] = ['web', 'home']
        self.write(self.work / recovery.OWNER, owner)

        def inspect(command, *_args, **_kwargs):
            service = 'web' if str(command[-1]) == '1' * 64 else 'home'
            info = self.container_info(self.source_state['project'] + '-' + service, source=True)
            if service == 'web':
                info['Config']['Labels']['com.docker.compose.project'] = 'another-project'
            return self.result(command, [info])

        with (self.work / 'operations.log').open('w') as log, \
                patch.object(recovery, 'run', side_effect=inspect), \
                patch.object(recovery.backup, 'restore_services') as resume:
            with self.assertRaises(RuntimeError):
                recovery.recover_source(self.work, owner, log)
        resume.assert_called_once()
        self.assertEqual(resume.call_args.args[2], ['home'])
        self.assertNotIn('web', resume.call_args.args[1])
        self.assertTrue(json.loads((self.work / recovery.OWNER).read_text())['source']['pending'])

    def initialize_target(self, directory, _engine, _turn):
        directory.mkdir()
        self.write(directory / 'state.json', self.target_state)
        return self.target_state

    def assert_collision_is_unclaimed(self, kind):
        project = self.target_state['project']
        name = project + '-web' if kind == 'container' else f'localhost/{project}-web:local'
        calls = []

        def inspect(command, *_args, **_kwargs):
            command = list(map(str, command))
            calls.append(command)
            self.assertIn('inspect', command)
            return self.result(command, code=0 if command[-1] == name else 1)

        with patch.object(recovery.local, 'initialize', side_effect=self.initialize_target), \
                patch.object(recovery, 'run', side_effect=inspect), \
                patch.object(recovery.local, 'render') as render, \
                patch.object(recovery.backup, 'backup') as backup:
            with self.assertRaisesRegex(ValueError, 'already exists'):
                recovery.rehearse(self.args)
            count = len(calls)
            recovery.cleanup(self.work)
            self.assertEqual(len(calls), count, 'Fallback cleanup must not adopt a colliding existing resource')
            render.assert_not_called()
            backup.assert_not_called()
        self.assertFalse(json.loads((self.work / recovery.OWNER).read_text())['claimed'])

    def test_existing_container_name_never_becomes_owned(self):
        self.assert_collision_is_unclaimed('container')

    def test_existing_image_tag_never_becomes_owned(self):
        self.assert_collision_is_unclaimed('image')

    def rehearsal_engine(self, command, *_args, **_kwargs):
        command = list(map(str, command))
        name = command[-1]
        if 'inspect' in command:
            if name.startswith(self.source_state['project'] + '-'):
                info = self.container_info(name, source=True)
                info['State']['Running'] = name.endswith('-web')
                return self.result(command, [info])
            if name in ('1' * 64, '2' * 64):
                service = 'web' if name.startswith('1') else 'home'
                return self.result(command, [self.container_info(self.source_state['project'] + '-' + service, source=True)])
            return self.result(command, code=1)
        if 'tag' in command:
            return self.result(command)
        raise AssertionError(f'Unexpected mocked rehearsal operation: {command}')

    def test_cancellation_during_backup_waits_for_source_recovery_and_cannot_interrupt_cleanup(self):
        events = []
        handlers = {}
        interrupted = []

        def register(number, handler):
            previous = handlers.get(number, signal.SIG_DFL)
            handlers[number] = handler
            return previous

        def backup(_args):
            events.append('backup-started')
            interrupt = handlers[signal.SIGTERM]
            interrupted.append(interrupt)
            interrupt(signal.SIGTERM, None)
            interrupt(signal.SIGINT, None)
            events.append('backup-returned')

        def clean(_work):
            events.append('cleanup-started')
            interrupted[0](signal.SIGTERM, None)
            events.append('cleanup-finished')

        with patch.object(recovery.local, 'initialize', side_effect=self.initialize_target), \
                patch.object(recovery.local, 'render', return_value='services: {}\n'), \
                patch.object(recovery, 'run', side_effect=self.rehearsal_engine), \
                patch.object(recovery.backup, 'backup', side_effect=backup), \
                patch.object(recovery.local, 'verify_frontdoors', side_effect=lambda *_args: events.append('source-ready')), \
                patch.object(recovery, 'cleanup', side_effect=clean), \
                patch.object(recovery.signal, 'signal', side_effect=register):
            with self.assertRaises(InterruptedError):
                recovery.rehearse(self.args)
        self.assertEqual(events, ['backup-started', 'backup-returned', 'source-ready', 'cleanup-started', 'cleanup-finished'])
        self.assertFalse(json.loads((self.work / recovery.OWNER).read_text())['source']['pending'])
        self.assertEqual(json.loads(self.args.report.read_text())['status'], 'failed')
        self.assertTrue(all(value == signal.SIG_DFL for value in handlers.values()))

    def test_cancellation_before_backup_still_cleans_claimed_resources(self):
        handlers = {}
        events = []

        def register(number, handler):
            previous = handlers.get(number, signal.SIG_DFL)
            handlers[number] = handler
            return previous

        def execute(command, *_args, **_kwargs):
            if 'tag' in command:
                events.append('tag-started')
                handlers[signal.SIGTERM](signal.SIGTERM, None)
                self.fail('Cancellation outside backup must stop further work')
            return self.rehearsal_engine(command)

        with patch.object(recovery.local, 'initialize', side_effect=self.initialize_target), \
                patch.object(recovery.local, 'render', return_value='services: {}\n'), \
                patch.object(recovery, 'run', side_effect=execute), \
                patch.object(recovery.backup, 'backup') as backup, \
                patch.object(recovery, 'cleanup', side_effect=lambda _work: events.append('cleanup')), \
                patch.object(recovery.signal, 'signal', side_effect=register):
            with self.assertRaises(InterruptedError):
                recovery.rehearse(self.args)
            backup.assert_not_called()
        self.assertEqual(events, ['tag-started', 'cleanup'])
        self.assertEqual(json.loads(self.args.report.read_text())['status'], 'failed')

    def test_backup_tar_helper_is_named_and_labelled_without_changing_archive_io(self):
        project = self.target_state['project']
        source_web = self.source_state['project'] + '-web'
        tar_command = ['docker', 'run', '--rm', '--network=none', '--volumes-from', source_web + ':ro',
                       '--entrypoint', 'tar', 'fixture-web-image', '-C', '/data/uploads', '-czf', '-', '.']
        plain_command = ['docker', 'inspect', source_web]
        output = object()
        returned = object()

        def backup(_args):
            self.assertIs(recovery.backup.run(tar_command, output, 37), returned)
            self.assertIs(recovery.backup.run(plain_command, None, 11), returned)
            with self.assertRaisesRegex(ValueError, 'naming changed'):
                recovery.backup.run(tar_command[:2] + ['--name', 'existing-helper'] + tar_command[2:])
            raise RuntimeError('fixture finished wrapper validation')

        with patch.object(recovery.local, 'initialize', side_effect=self.initialize_target), \
                patch.object(recovery.local, 'render', return_value='services: {}\n'), \
                patch.object(recovery, 'run', side_effect=self.rehearsal_engine), \
                patch.object(recovery.backup, 'run', return_value=returned) as archive, \
                patch.object(recovery.backup, 'backup', side_effect=backup), \
                patch.object(recovery, 'cleanup') as cleanup:
            with self.assertRaisesRegex(RuntimeError, 'finished wrapper validation'):
                recovery.rehearse(self.args)
        expected = tar_command[:2] + ['--name', project + '-backup-uploads',
                                     '--label', f'jic.recovery={project}'] + tar_command[2:]
        self.assertEqual(archive.call_count, 2)
        self.assertEqual(archive.call_args_list[0].args, (expected, output, 37))
        self.assertEqual(archive.call_args_list[1].args, (plain_command, None, 11))
        self.assertNotIn('--name', tar_command, 'The observer must not mutate the backup utility command')
        cleanup.assert_called_once_with(self.work)


if __name__ == '__main__':
    unittest.main()
