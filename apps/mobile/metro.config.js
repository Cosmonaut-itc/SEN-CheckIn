const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withUniwindConfig } = require('uniwind/metro');

const config = getDefaultConfig(__dirname);

config.resolver = config.resolver ?? {};
// Force Metro to resolve React from the workspace root to avoid duplicate React copies in monorepo installs.
config.resolver.disableHierarchicalLookup = true;
config.resolver.nodeModulesPaths = [path.resolve(__dirname, '../../node_modules')];
config.resolver.extraNodeModules = {
  react: path.resolve(__dirname, '../../node_modules/react'),
  'react-dom': path.resolve(__dirname, '../../node_modules/react-dom'),
  'react-native': path.resolve(__dirname, '../../node_modules/react-native'),
};

module.exports = withUniwindConfig(config, {
  cssEntryFile: './global.css',
  dtsFile: './types/uniwind-types.d.ts',
});
