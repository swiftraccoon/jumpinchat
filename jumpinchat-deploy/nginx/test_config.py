from pathlib import Path
import os
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).with_name('conf') / 'site.conf.sh'


class UploadProxyConfigurationTests(unittest.TestCase):
    def generate(self, **environment):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / 'site.conf'
            result = subprocess.run(['bash', str(SCRIPT)], capture_output=True, text=True,
                                    env={**os.environ, **environment,
                                         'NGINX_CONFIG_OUTPUT': str(target)})
            return result, target.read_text() if target.exists() else ''

    def test_local_uploads_use_only_public_directory(self):
        result, config = self.generate(STORAGE_BACKEND='local')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('alias /data/uploads/public/;', config)
        self.assertNotIn('/data/uploads/private', config)

    def test_external_s3_uses_public_prefix_with_verified_tls(self):
        result, config = self.generate(STORAGE_BACKEND='s3',
                                      S3_PUBLIC_BASE_URL='https://assets.example.com/uploads/public/')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('proxy_pass https://assets.example.com/uploads/public/$public_image_key;', config)
        self.assertIn('proxy_ssl_verify on;', config)
        self.assertIn('proxy_ssl_name assets.example.com;', config)
        self.assertIn('proxy_set_header Cookie "";', config)
        self.assertIn('proxy_set_header Authorization "";', config)

    def test_bucket_root_or_insecure_origin_is_refused(self):
        for base in ['https://assets.example.com/uploads/', 'http://assets.example.com/public/',
                     'https://user:password@assets.example.com/public/',
                     'https://assets.example.com/../public/',
                     'https://assets.example.com/public/?token=secret']:
            with self.subTest(base=base):
                result, config = self.generate(STORAGE_BACKEND='s3', S3_PUBLIC_BASE_URL=base)
                self.assertEqual(result.returncode, 1)
                self.assertEqual(config, '')


if __name__ == '__main__':
    unittest.main()
