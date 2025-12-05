const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withUniwindConfig } = require('uniwind/metro');

const config = getDefaultConfig(__dirname);

config.resolver = config.resolver ?? {};

// Ensure Expo defaults remain, while also allowing workspace root resolutions to avoid duplicate React copies.
const workspaceNodeModules = path.resolve(__dirname, '../../node_modules');
config.resolver.nodeModulesPaths = Array.from(
  new Set([...(config.resolver.nodeModulesPaths ?? []), workspaceNodeModules])
);
config.resolver.disableHierarchicalLookup = false;
config.resolver.extraNodeModules = {
  react: path.resolve(__dirname, '../../node_modules/react'),
  'react-dom': path.resolve(__dirname, '../../node_modules/react-dom'),
  'react-native': path.resolve(__dirname, '../../node_modules/react-native'),
};

module.exports = withUniwindConfig(config, {
  cssEntryFile: './global.css',
  dtsFile: './types/uniwind-types.d.ts',
});
