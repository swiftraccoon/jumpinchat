from pathlib import Path
import os
import subprocess
import tempfile
import unittest

GUARD = Path(__file__).resolve().parent.parent / 'jumpinchat-deploy/mongodb/entrypoint.sh'


class MongoUpgradeGuardTests(unittest.TestCase):
    def check(self, directory):
        return subprocess.run(['bash', str(GUARD), '--check'], capture_output=True, text=True,
                              env={**os.environ, 'JIC_MONGO_DB_PATH': str(directory)})

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
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / '.jic-mongodb-series').write_text('8.3\n')
            (Path(tmp) / 'WiredTiger').write_text('migrated fixture')
            self.assertEqual(self.check(tmp).returncode, 0)


if __name__ == '__main__':
    unittest.main()
