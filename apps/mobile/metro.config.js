const { getDefaultConfig } = require('expo/metro-config');
const { withUniwindConfig } = require('uniwind/metro');

const config = getDefaultConfig(__dirname);

module.exports = withUniwindConfig(config, {
  // Entry CSS that imports tailwind, uniwind, and HeroUI styles
  cssEntryFile: './global.css',
});
