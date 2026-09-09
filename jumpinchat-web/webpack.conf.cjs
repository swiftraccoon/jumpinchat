const path = require('node:path');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = ({ esNext = true, production = false, outputPath }) => ({
  mode: production ? 'production' : 'development',
  target: ['web', 'es2020'],
  devtool: production ? 'hidden-source-map' : 'inline-cheap-module-source-map',
  entry: { bundle: path.resolve(__dirname, 'react-client/js/app.js') },
  output: {
    filename: `[name]${production ? '.[contenthash:12]' : ''}.${esNext ? 'mjs' : 'js'}`,
    chunkFilename: `[name]${production ? '.[contenthash:12]' : ''}.${esNext ? 'mjs' : 'js'}`,
    path: path.resolve(outputPath, 'js'),
    publicPath: '/js/',
    uniqueName: `jumpinchat_${esNext ? 'module' : 'classic'}`,
  },
  optimization: {
    minimize: production,
    minimizer: [new TerserPlugin({ extractComments: /@license|@preserve|^!/i })],
    splitChunks: { cacheGroups: {
      commons: { test: /[\\/]node_modules[\\/]/, name: 'vendors', chunks: 'all' },
    } },
  },
  resolve: { extensions: ['.js', '.jsx'] },
  module: { rules: [
    { test: /\.m?js$/, resolve: { fullySpecified: false } },
    { test: /\.jsx?$/, exclude: /node_modules/, use: 'babel-loader' },
  ] },
});
