import argparse
import importlib.util
import json
from pathlib import Path
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

            def run(command, output=None):
                calls.append(command)
                if command[-2:] == ['config', '--services']:
                    return 'web\nhome\nmongodb'
                if 'ps' in command:
                    return command[-1]
                if command[1] == 'inspect':
                    return json.dumps([{'Config': {'Env': ['STORAGE_BACKEND=local', 'MONGODB_URI=mongodb://mongodb/tc?replicaSet=rs0']},
                                        'State': {'Running': command[-1] == 'web'},
                                        'Image': 'test-image', 'Id': command[-1]}])
                if 'mongodump' in command:
                    raise RuntimeError('simulated dump failure')
                return ''

            with patch.object(backup, 'run', side_effect=run):
                with self.assertRaisesRegex(RuntimeError, 'simulated dump failure'):
                    backup.backup(args)
            self.assertEqual(calls[-1][-2:], ['start', 'web'])
            self.assertFalse((args.directory / 'manifest.json').exists())

    def test_maintenance_acknowledgment_precedes_container_operations(self):
        with patch.object(backup, 'run') as run:
            with self.assertRaisesRegex(ValueError, '--maintenance'):
                backup.backup(argparse.Namespace(maintenance=False))
            run.assert_not_called()


if __name__ == '__main__':
    unittest.main()
