import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['public/**', '.tmp/**', 'coverage/**'] },
  js.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    linterOptions: { reportUnusedDisableDirectives: false },
    rules: {
      // Keep existing cleanup debt visible while correctness checks block CI.
      'no-redeclare': ['error', { builtinGlobals: false }],
      'no-useless-catch': 'warn',
      'no-useless-assignment': 'warn',
      'preserve-caught-error': 'warn',
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }] },
  },
  { files: ['**/*.spec.js'], languageOptions: { globals: globals.mocha } },
];
