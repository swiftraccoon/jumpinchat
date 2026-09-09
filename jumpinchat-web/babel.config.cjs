module.exports = {
  presets: [
    ['@babel/preset-env', { modules: false, targets: 'defaults' }],
    ['@babel/preset-react', { runtime: 'automatic' }],
  ],
  plugins: [['babel-plugin-polyfill-corejs3', { method: 'usage-global', version: '3.50' }]],
  sourceMaps: true,
};
