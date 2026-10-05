"""Keep the reviewed image inventory aligned with every deployment profile."""
import json
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parent.parent
DEPLOY = ROOT / 'jumpinchat-deploy'


class ImagePinTests(unittest.TestCase):
    def test_all_external_references_match_the_reviewed_lock(self):
        lock = json.loads((DEPLOY / 'images.lock.json').read_text())['images']
        files = [*DEPLOY.glob('*/Dockerfile'), *DEPLOY.glob('*.yml'),
                 ROOT / 'jumpinchat-email/Dockerfile', ROOT / 'jumpinchat-turn/Dockerfile']
        seen = set()
        for path in files:
            for name, digest in re.findall(r'docker\.io/([^@\s}]+)@(sha256:[a-f0-9]{64})', path.read_text()):
                with self.subTest(file=str(path.relative_to(ROOT)), image=name):
                    self.assertEqual(lock.get(name), digest)
                    seen.add(name)
        self.assertEqual(seen, set(lock))

    def test_janus_release_and_checksum_match_source_lock(self):
        dockerfile = (DEPLOY / 'janus/Dockerfile').read_text()
        version = re.search(r'^ARG JANUS_VERSION=(.+)$', dockerfile, re.M).group(1)
        digest = re.search(r'^ARG JANUS_SHA256=(.+)$', dockerfile, re.M).group(1)
        source = json.loads((DEPLOY / 'images.lock.json').read_text())['sources'][f'janus-gateway:{version}']
        self.assertEqual(source['sha256'], digest)
        self.assertEqual(source['url'], f'https://codeload.github.com/meetecho/janus-gateway/tar.gz/refs/tags/v{version}')

    def test_npm_policy_is_copied_before_every_application_install(self):
        for relative in ('jumpinchat-deploy/home/Dockerfile', 'jumpinchat-deploy/srv/Dockerfile',
                         'jumpinchat-email/Dockerfile'):
            with self.subTest(file=relative):
                text = (ROOT / relative).read_text()
                self.assertLess(text.index('.npmrc'), text.index('RUN npm ci'))
                stages = text.split('FROM ')[1:]
                self.assertTrue(all('npm install --global npm@12.2.0 --ignore-scripts' in stage for stage in stages))

    def test_migration_overrides_are_lite_only_and_do_not_bypass_the_guard(self):
        source = (DEPLOY / 'compose.mongo-upgrade.yml').read_text()
        self.assertIn('LITE ONLY', source)
        self.assertIn('jic-mongodb-entrypoint.sh', source)
        self.assertIn('--upgrade-from-8.3', source)
        self.assertNotIn('mongodbslave:', source)
        self.assertNotIn('/usr/local/bin/docker-entrypoint.sh', source)


if __name__ == '__main__':
    unittest.main()
