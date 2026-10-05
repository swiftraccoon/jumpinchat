"""Execute the documented mongosh checks without connecting to any database."""
import json
from pathlib import Path
import re
import subprocess
import unittest


ROOT = Path(__file__).resolve().parent.parent
RUNNER = r'''
const vm = require('node:vm');
const input = JSON.parse(require('node:fs').readFileSync(0, 'utf8'));
const state = input.state;
vm.runInNewContext(input.source, {
  require(name) {
    if (name !== 'node:assert/strict') throw Error('Unexpected module');
    return require(name);
  },
  // mongosh's global assert must not be confused with MongoDB test-harness
  // helpers such as assert.eq or assert.commandWorked.
  assert(condition) { if (!condition) throw Error('Assertion failed'); },
  db: {
    version: () => state.version,
    hello: () => ({isWritablePrimary: state.primary}),
    adminCommand(command) {
      if (command.getParameter === 1) return {featureCompatibilityVersion: state.fcv};
      if (command.setFeatureCompatibilityVersion === '9.0' && command.confirm === true) {
        return {ok: state.commandOk};
      }
      throw Error('Unexpected command');
    },
  },
  rs: {status: () => ({members: [{stateStr: state.primary ? 'PRIMARY' : 'SECONDARY'}]})},
});
'''


class RecoveryRunbookTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        source = (ROOT / 'RECOVERY.md').read_text()
        cls.snippets = re.findall(r"mongosh --quiet --eval '\n(.*?)\n\s*'", source, re.S)
        if len(cls.snippets) != 3:
            raise AssertionError('Expected all three documented upgrade checks')
        cls.states = [
            {'version': '8.3.11', 'fcv': {'version': '8.3'}, 'primary': True, 'commandOk': 1},
            {'version': '9.0.2', 'fcv': {'version': '8.3'}, 'primary': True, 'commandOk': 1},
            {'version': '9.0.2', 'fcv': {'version': '9.0'}, 'primary': True, 'commandOk': 1},
        ]

    def execute(self, source, state):
        return subprocess.run(['node', '-e', RUNNER],
                              input=json.dumps({'source': source, 'state': state}),
                              capture_output=True, text=True, timeout=10)

    def test_documented_checks_work_without_mongodb_test_harness_helpers(self):
        for source, state in zip(self.snippets, self.states):
            with self.subTest(version=state['version'], fcv=state['fcv']):
                self.assertIn('require("node:assert/strict")', source)
                self.assertNotIn("'", source, 'Preserve outer shell single quotes')
                self.assertNotRegex(source, r'assert\.(?:eq|commandWorked)\(')
                result = self.execute(source, state)
                self.assertEqual(result.returncode, 0, result.stderr)

    def test_documented_checks_fail_closed_on_invalid_database_state(self):
        for source, state in zip(self.snippets, self.states):
            invalid = [
                {**state, 'version': '8.3.9'},
                {**state, 'fcv': {'version': 'unexpected'}},
                {**state, 'fcv': {**state['fcv'], 'targetVersion': '9.0'}},
                {**state, 'fcv': {**state['fcv'], 'previousVersion': '8.3'}},
                {**state, 'primary': False},
            ]
            for rejected in invalid:
                with self.subTest(expected=state, rejected=rejected):
                    self.assertNotEqual(self.execute(source, rejected).returncode, 0)

    def test_failed_fcv_command_stops_the_promotion_snippet(self):
        rejected = {**self.states[2], 'commandOk': 0}
        self.assertNotEqual(self.execute(self.snippets[2], rejected).returncode, 0)


if __name__ == '__main__':
    unittest.main()
