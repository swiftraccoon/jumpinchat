"""Keep clean-install policy and runtime pins aligned across application builds."""
import json
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parent.parent
APPS = ('jumpinchat-web', 'jumpinchat-homepage', 'jumpinchat-email')


class ToolchainTests(unittest.TestCase):
    def test_manifest_and_lock_declarations_match(self):
        for app in APPS:
            with self.subTest(app=app):
                package = json.loads((ROOT / app / 'package.json').read_text())
                lock = json.loads((ROOT / app / 'package-lock.json').read_text())
                self.assertEqual(lock['lockfileVersion'], 3)
                for key in ('dependencies', 'devDependencies', 'engines'):
                    self.assertEqual(package[key], lock['packages'][''][key])

    def test_every_install_script_has_a_reviewed_decision(self):
        for app in APPS:
            package = json.loads((ROOT / app / 'package.json').read_text())
            approvals = package.get('allowScripts', {})
            lock = json.loads((ROOT / app / 'package-lock.json').read_text())
            for key, allowed in approvals.items():
                with self.subTest(app=app, approval=key):
                    self.assertIsInstance(allowed, bool)
                    if allowed:
                        # Denials may cover every version; approvals must not.
                        self.assertRegex(key, r'@\d+\.\d+\.\d+$')
            for path, metadata in lock['packages'].items():
                if not metadata.get('hasInstallScript'):
                    continue
                name = metadata.get('name') or path.rsplit('node_modules/', 1)[-1]
                key = f"{name}@{metadata['version']}"
                with self.subTest(app=app, dependency=key):
                    self.assertTrue(key in approvals or approvals.get(name) is False,
                                    f'Review the install script for {key}')

    def test_strict_project_configs_contain_no_credentials(self):
        for app in APPS:
            with self.subTest(app=app):
                self.assertEqual((ROOT / app / '.npmrc').read_text().strip(),
                                 'strict-allow-scripts=true')
                self.assertIn(f'!{app}/.npmrc', (ROOT / '.gitignore').read_text().splitlines())

    def test_node_and_npm_pins_match_ci_and_docker_builds(self):
        packages = [json.loads((ROOT / app / 'package.json').read_text()) for app in APPS]
        node_versions = {(ROOT / app / '.nvmrc').read_text().strip() for app in APPS}
        npm_versions = {package['packageManager'] for package in packages}
        self.assertEqual(len(node_versions), 1)
        self.assertEqual(len(npm_versions), 1)
        node_version = node_versions.pop()
        npm_version = npm_versions.pop()
        workflow = (ROOT / '.github/workflows/checks.yml').read_text()
        self.assertEqual(set(re.findall(r'node-version: (\S+)', workflow)), {node_version})
        self.assertEqual(set(re.findall(r'npm@\d+\.\d+\.\d+', workflow)), {npm_version})
        for dockerfile in ('jumpinchat-deploy/srv/Dockerfile',
                           'jumpinchat-deploy/home/Dockerfile', 'jumpinchat-email/Dockerfile'):
            with self.subTest(dockerfile=dockerfile):
                source = (ROOT / dockerfile).read_text()
                self.assertEqual(set(re.findall(r'node:(\d+\.\d+\.\d+)', source)), {node_version})
                self.assertEqual(set(re.findall(r'npm@\d+\.\d+\.\d+', source)), {npm_version})
                self.assertIn('.npmrc', source)


if __name__ == '__main__':
    unittest.main()
