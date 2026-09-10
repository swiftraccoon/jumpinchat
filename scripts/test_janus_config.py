from pathlib import Path
import os
import re
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parent.parent
BOOTSTRAP = ROOT / 'jumpinchat-deploy/janus/bootstrap.sh'
CONFIG_NAMES = (
    'janus.jcfg',
    'janus.transport.http.jcfg',
    'janus.transport.websockets.jcfg',
    'janus.eventhandler.sampleevh.jcfg',
    'janus.plugin.videoroom.jcfg',
)


class JanusConfigurationTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.janus_dir = Path(temporary.name) / 'janus'
        self.config_dir = self.janus_dir / 'etc/janus'
        self.config_dir.mkdir(parents=True)
        self.environment = {
            'PATH': os.environ['PATH'],
            'JANUS_DIR': str(self.janus_dir),
            'JANUS_TOKEN_SECRET': 'isolated-configuration-fixture',
            'SERVER_NAME': 'local-media-fixture',
            'NAT_1_1_IP': '127.0.0.1',
            'STUN_SERVER': '',
        }

    def render(self, **overrides):
        return subprocess.run(
            ['bash', str(BOOTSTRAP)],
            env={**self.environment, **overrides},
            capture_output=True, text=True, timeout=10,
        )

    def section(self, config, name):
        match = re.search(rf'^{re.escape(name)}:\s*\{{(.*?)^\}}', config,
                          re.MULTILINE | re.DOTALL)
        self.assertIsNotNone(match, f'Missing Janus {name} configuration block')
        return match.group(1)

    def test_custom_rtp_range_is_scoped_to_media(self):
        result = self.render(RTP_PORT_MIN='24120', RTP_PORT_MAX='24179')
        self.assertEqual(result.returncode, 0, result.stderr)
        config = (self.config_dir / 'janus.jcfg').read_text()
        self.assertIn('rtp_port_range = "24120-24179"', self.section(config, 'media'))
        self.assertNotIn('rtp_port_range', self.section(config, 'nat'))
        self.assertEqual(config.count('rtp_port_range'), 1)
        self.assertEqual({p.name for p in self.config_dir.iterdir()}, set(CONFIG_NAMES))

    def test_loopback_mapping_retains_private_ice_candidates_when_enabled(self):
        result = self.render(KEEP_PRIVATE_HOST='true')
        self.assertEqual(result.returncode, 0, result.stderr)
        config = (self.config_dir / 'janus.jcfg').read_text()
        nat = self.section(config, 'nat')
        self.assertIn('nat_1_1_mapping = "127.0.0.1"', nat)
        self.assertIn('keep_private_host = true', nat)
        self.assertNotIn('stun_server', nat)
        self.assertNotIn('keep_private_host', self.section(config, 'media'))

    def test_defaults_preserve_existing_range_and_disable_private_candidates(self):
        result = self.render()
        self.assertEqual(result.returncode, 0, result.stderr)
        config = (self.config_dir / 'janus.jcfg').read_text()
        self.assertIn('rtp_port_range = "20000-20100"', self.section(config, 'media'))
        self.assertIn('keep_private_host = false', self.section(config, 'nat'))

    def test_invalid_range_or_boolean_cannot_overwrite_existing_configuration(self):
        originals = {name: f'existing {name}\n'.encode() for name in CONFIG_NAMES}
        for name, content in originals.items():
            (self.config_dir / name).write_bytes(content)
        cases = (
            {'RTP_PORT_MIN': '1023'},
            {'RTP_PORT_MAX': '65536'},
            {'RTP_PORT_MIN': '24001', 'RTP_PORT_MAX': '24000'},
            {'RTP_PORT_MIN': 'not-a-port'},
            {'RTP_PORT_MAX': '24000.5'},
            {'KEEP_PRIVATE_HOST': 'yes'},
            {'KEEP_PRIVATE_HOST': 'TRUE'},
        )
        for overrides in cases:
            with self.subTest(overrides=overrides):
                result = self.render(**overrides)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('Invalid private-host or RTP port-range configuration',
                              result.stderr)
                self.assertEqual(
                    {p.name: p.read_bytes() for p in self.config_dir.iterdir()}, originals,
                    'Invalid input must fail before changing any Janus configuration',
                )


if __name__ == '__main__':
    unittest.main()
