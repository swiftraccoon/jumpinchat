from pathlib import Path
import os
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent.parent


class EnvironmentTests(unittest.TestCase):
    def test_generated_secrets_are_private_and_existing_file_is_preserved(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / '.env'
            command = ['node', str(ROOT / 'scripts/init-env.mjs'), '--output', str(target)]
            result = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0)
            original = target.read_bytes()
            secrets = [line.split('=', 1)[1] for line in original.decode().splitlines()
                       if line.startswith(('JWT_SECRET=', 'COOKIE_SECRET=', 'SHARED_SECRET=',
                                           'JANUS_TOKEN_SECRET=', 'FILE_TOKEN_SECRET='))]
            self.assertEqual(len(set(secrets)), 5)
            self.assertTrue(all(len(value) == 64 for value in secrets))
            self.assertEqual(target.stat().st_mode & 0o777, 0o600)
            result = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(result.returncode, 1)
            self.assertEqual(target.read_bytes(), original)

    def test_placeholder_secrets_fail_without_disclosing_values(self):
        result = subprocess.run([
            'node', str(ROOT / 'scripts/preflight.mjs'),
            '--env-file', str(ROOT / 'jumpinchat-deploy/example.env'), '--profile', 'app',
        ], env={'PATH': os.environ['PATH']}, capture_output=True, text=True)
        self.assertEqual(result.returncode, 1)
        self.assertIn('JWT_SECRET is set to a known insecure default', result.stderr)
        self.assertNotIn('dev-jwt-secret-change-me', result.stderr)

    def test_email_profile_only_requires_its_shared_secret(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / '.env'
            target.write_text('SHARED_SECRET=unique-test-shared-secret\n')
            result = subprocess.run([
                'node', str(ROOT / 'scripts/preflight.mjs'), '--env-file', str(target),
                '--profile', 'email',
            ], env={'PATH': os.environ['PATH']}, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertNotIn('unique-test-shared-secret', result.stdout)


if __name__ == '__main__':
    unittest.main()
