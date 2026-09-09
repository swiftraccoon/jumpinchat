import js from '@eslint/js';
import globals from 'globals';
import react from '@eslint-react/eslint-plugin';
import hooks from 'eslint-plugin-react-hooks';
import importX from 'eslint-plugin-import-x';

export default [
  { ignores: ['dist/**', '.tmp/**', 'coverage/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js', '**/*.cjs'],
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
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs' },
  },
  {
    files: ['react-client/**/*.js'],
    languageOptions: {
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { '@eslint-react': react, 'react-hooks': hooks, 'import-x': importX },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@eslint-react/no-missing-key': 'error',
      '@eslint-react/no-direct-mutation-state': 'error',
      '@eslint-react/dom-no-find-dom-node': 'error',
      '@eslint-react/dom-no-render': 'error',
      '@eslint-react/dom-no-hydrate': 'error',
      '@eslint-react/dom-no-void-elements-with-children': 'error',
      'import-x/no-unresolved': ['error', { ignore: ['^node:'] }],
    },
  },
  { files: ['**/*.spec.js', 'test/**/*.js'], languageOptions: {
    globals: { ...globals.mocha, ...globals.vitest },
  } },
  { files: ['react-client/sw/*.js'], languageOptions: { globals: globals.serviceworker } },
];
