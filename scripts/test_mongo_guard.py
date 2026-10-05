from pathlib import Path
import os
import subprocess
import tempfile
import unittest

GUARD = Path(__file__).resolve().parent.parent / 'jumpinchat-deploy/mongodb/entrypoint.sh'


class MongoUpgradeGuardTests(unittest.TestCase):
    def check(self, directory, version='9.0.2', upgrade=False, start=False):
        # Supply only a version-reporting binary; no database server is started.
        with tempfile.TemporaryDirectory() as tools:
            binary = Path(tools) / 'mongod'
            binary.write_text('#!/bin/sh\nprintf "db version v%s\\n" "$TEST_MONGO_VERSION"\n')
            binary.chmod(0o755)
            # Intercept the final exec to inspect marker ordering without an
            # upstream Docker entrypoint or any host-level installation.
            hook = Path(tools) / 'bash-env'
            hook.write_text('exec() { test "$1" = /usr/local/bin/docker-entrypoint.sh; }\n')
            args = [] if start else ['--check']
            if upgrade:
                args.append('--upgrade-from-8.3')
            return subprocess.run(['bash', str(GUARD), *args, 'mongod'], capture_output=True, text=True,
                                  env={**os.environ, 'JIC_MONGO_DB_PATH': str(directory),
                                       'PATH': tools + os.pathsep + os.environ['PATH'],
                                       'TEST_MONGO_VERSION': version, 'BASH_ENV': str(hook)})

    def test_fresh_directory_passes_without_creating_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(self.check(tmp).returncode, 0)
            self.assertEqual(list(Path(tmp).iterdir()), [])

    def test_unmarked_existing_data_is_refused_without_changes(self):
        with tempfile.TemporaryDirectory() as tmp:
            data = Path(tmp) / 'WiredTiger'
            data.write_text('old database fixture')
            result = self.check(tmp)
            self.assertEqual(result.returncode, 1)
            self.assertIn('Existing MongoDB data', result.stderr)
            self.assertEqual(data.read_text(), 'old database fixture')
            self.assertEqual(list(Path(tmp).iterdir()), [data])

    def test_other_release_marker_is_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / '.jic-mongodb-series').write_text('4.4\n')
            self.assertEqual(self.check(tmp).returncode, 1)

    def test_verified_current_release_marker_is_accepted(self):
        for series in ('8.3', '9.0'):
            with self.subTest(series=series), tempfile.TemporaryDirectory() as tmp:
                (Path(tmp) / '.jic-mongodb-series').write_text(series + '\n')
                (Path(tmp) / 'WiredTiger').write_text('migrated fixture')
                self.assertEqual(self.check(tmp, series + '.2').returncode, 0)

    def test_normal_startup_never_opens_another_series_or_pending_data(self):
        for version, marker in [('9.0.2', '8.3'), ('8.3.11', '9.0'),
                                ('9.0.2', '9.0-pending-fcv'), ('8.3.11', '9.0-pending-fcv')]:
            with self.subTest(version=version, marker=marker), tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp) / '.jic-mongodb-series'
                path.write_text(marker + '\n')
                self.assertEqual(self.check(tmp, version).returncode, 1)
                self.assertEqual(path.read_text(), marker + '\n')

    def test_explicit_upgrade_check_and_resume_do_not_claim_completion(self):
        for marker in ('8.3', '9.0-pending-fcv'):
            with self.subTest(marker=marker), tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp) / '.jic-mongodb-series'
                path.write_text(marker + '\n')
                self.assertEqual(self.check(tmp, upgrade=True).returncode, 0)
                self.assertEqual(path.read_text(), marker + '\n')
                self.assertEqual(self.check(tmp, upgrade=True, start=True).returncode, 0)
                self.assertEqual(path.read_text(), '9.0-pending-fcv\n')

    def test_upgrade_mode_refuses_fresh_unknown_and_completed_directories(self):
        for marker in (None, '4.4', '9.0', ''):
            with self.subTest(marker=marker), tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp) / '.jic-mongodb-series'
                if marker is not None:
                    path.write_text(marker)
                self.assertEqual(self.check(tmp, upgrade=True).returncode, 1)

    def test_upgrade_mode_refuses_an_8_3_binary_even_with_matching_marker(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / '.jic-mongodb-series').write_text('8.3\n')
            self.assertEqual(self.check(tmp, '8.3.11', upgrade=True).returncode, 1)

    def test_fresh_start_creates_the_actual_binary_series_marker(self):
        for version, series in [('8.3.11', '8.3'), ('9.0.2', '9.0')]:
            with self.subTest(version=version), tempfile.TemporaryDirectory() as tmp:
                self.assertEqual(self.check(tmp, version, start=True).returncode, 0)
                self.assertEqual((Path(tmp) / '.jic-mongodb-series').read_text(), series + '\n')

    def test_unknown_or_prerelease_binary_is_refused_even_on_fresh_data(self):
        for version in ('4.4.30', '9.1.0', '9.0.2-rc0'):
            with self.subTest(version=version), tempfile.TemporaryDirectory() as tmp:
                self.assertEqual(self.check(tmp, version).returncode, 1)
                self.assertEqual(list(Path(tmp).iterdir()), [])

    def test_symlink_marker_is_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            external = Path(tmp) / 'other'
            external.write_text('9.0\n')
            (Path(tmp) / '.jic-mongodb-series').symlink_to(external)
            self.assertEqual(self.check(tmp).returncode, 1)


if __name__ == '__main__':
    unittest.main()
