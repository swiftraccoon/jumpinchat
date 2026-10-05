from pathlib import Path
import ipaddress
import os
import re
import subprocess
import tempfile
import unittest
from urllib.parse import urlsplit

SCRIPT = Path(__file__).with_name('conf') / 'site.conf.sh'


class NginxConfigurationTests(unittest.TestCase):
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

    def test_custom_hostname_is_served_over_https_and_redirected_from_http(self):
        result, config = self.generate(NGINX_PUBLIC_HOSTNAME='jic.research.clinic')
        self.assertEqual(result.returncode, 0, result.stderr)
        names = re.findall(r'^  server_name (.*);$', config, re.M)
        self.assertEqual(sum('jic.research.clinic' in line.split() for line in names), 2)
        self.assertIn('jumpin.chat', names[1].split())
        self.assertIn('localhost', names[1].split())
        self.assertIn('return 301 https://$host$request_uri;', config)

    def test_invalid_custom_hostname_is_refused_before_writing_config(self):
        for hostname in ['https://example.com', 'example.com:443', 'example.com/path',
                         '*.example.com', 'example.com other.example.com',
                         'example.com; return 200;', 'example.com\nserver',
                         '-example.com', 'example-.com', 'example..com',
                         f"{'x' * 64}.example.com", '.'.join(['x' * 63] * 4)]:
            with self.subTest(hostname=hostname):
                result, config = self.generate(NGINX_PUBLIC_HOSTNAME=hostname)
                self.assertEqual(result.returncode, 1)
                self.assertEqual(config, '')

    def test_http_challenge_uses_webroot_while_other_paths_redirect(self):
        result, config = self.generate(NGINX_PUBLIC_HOSTNAME='jic.research.clinic')
        self.assertEqual(result.returncode, 0, result.stderr)
        http_server = config[config.rfind('server {'):]
        self.assertIn('listen 80;', http_server)
        self.assertIn('jic.research.clinic;', http_server)
        self.assertRegex(http_server, r'location \^~ /\.well-known/acme-challenge/\s*\{'
                         r'\s*root /var/www/acme;\s*default_type text/plain;'
                         r'\s*try_files \$uri =404;\s*\}')
        self.assertRegex(http_server, r'location /\s*\{\s*return 301 https://\$host\$request_uri;\s*\}')

    def test_request_rate_keeps_default_and_accepts_configured_units(self):
        for rate, expected in [('', '2r/s'), ('10r/s', '10r/s'), ('600r/m', '600r/m')]:
            with self.subTest(rate=rate):
                result, config = self.generate(NGINX_REQUEST_RATE=rate)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn(f'limit_req_zone $limit_key zone=sitelimit:10m rate={expected};', config)

    def test_invalid_request_rate_is_refused_before_writing_config(self):
        for rate in ['0r/s', '-1r/s', '1.5r/s', '10', '10r/h', '1000000r/s',
                     '10r/s; return 200;', '10r/s\nserver', '10r/s other', ' 10r/s']:
            with self.subTest(rate=rate):
                result, config = self.generate(NGINX_REQUEST_RATE=rate)
                self.assertEqual(result.returncode, 1)
                self.assertEqual(config, '')


class ApplicationProxyConfigurationTests(unittest.TestCase):
    def test_node_upstream_is_one_loopback_address_on_the_image_runtime_port(self):
        deployment = Path(__file__).resolve().parent.parent
        config = (deployment / 'srv/conf/site.conf').read_text()
        image = (deployment / 'srv/Dockerfile').read_text()
        proxy = re.search(r'location @proxy\s*\{.*?proxy_pass\s+(http://[^;\s]+);', config, re.S)
        self.assertIsNotNone(proxy)
        target = urlsplit(proxy[1])
        # A DNS hostname can expand into multiple independently failed peers.
        address = ipaddress.ip_address(target.hostname)
        self.assertIsInstance(address, ipaddress.IPv4Address)
        self.assertTrue(address.is_loopback)
        port = re.search(r'^ENV\s+.*\bPORT=(\d+)\b', image, re.M)
        self.assertIsNotNone(port)
        self.assertEqual(target.port, int(port[1]))


if __name__ == '__main__':
    unittest.main()
