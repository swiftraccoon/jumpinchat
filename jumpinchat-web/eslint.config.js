import { fileURLToPath } from 'url';
import path from 'path';
import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
});

export default [
  ...compat.extends('airbnb'),
  {
    languageOptions: {
      parser: (await import('@babel/eslint-parser')).default,
      ecmaVersion: 2017,
      sourceType: 'module',
      parserOptions: {
        ecmaVersion: 2017,
      },
    },
    rules: {
      // formatting
      indent: ['error', 2, { SwitchCase: 1 }],
      'no-underscore-dangle': 0,
      strict: 0,
      'linebreak-style': 0,
      'no-bitwise': ['error', { int32Hint: true }],

      // import rules
      'import/no-extraneous-dependencies': ['error', { devDependencies: true }],

      // react rules
      'react/forbid-prop-types': 0,
      'react/prefer-es6-class': 0,
      'react/jsx-filename-extension': 0,
      'react/jsx-one-expression-per-line': 0,
      'jsx-a11y/media-has-caption': 0,
    },
  },
  {
    files: ['**/*.spec.js'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
        before: 'readonly',
        beforeEach: 'readonly',
        after: 'readonly',
        afterEach: 'readonly',
        context: 'readonly',
      },
    },
  },
  {
    ignores: ['react-client/js/lib/janus.js'],
  },
];
