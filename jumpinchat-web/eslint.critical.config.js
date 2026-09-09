import babelParser from '@babel/eslint-parser';

// A small blocking check while the historical style-lint backlog is migrated.
// Full lint remains available separately; do not silence undefined variables.
export default [{
  files: ['**/*.js'],
  languageOptions: {
    parser: babelParser,
    parserOptions: { requireConfigFile: false, babelOptions: { configFile: false, babelrc: false } },
    globals: {
      process: 'readonly', console: 'readonly', Buffer: 'readonly',
      setTimeout: 'readonly', clearTimeout: 'readonly',
      setInterval: 'readonly', clearInterval: 'readonly',
      MediaStream: 'readonly',
    },
  },
  rules: { 'no-undef': 'error' },
}];
