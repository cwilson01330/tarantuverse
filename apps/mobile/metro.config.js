const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Monorepo support: Allow Metro to access workspace root
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

config.projectRoot = projectRoot;
config.watchFolders = [workspaceRoot];

// Performance optimizations
config.transformer = {
  ...config.transformer,
  minifierPath: require.resolve('metro-minify-terser'),
  minifierConfig: {
    // Terser options for faster minification
    compress: {
      drop_console: false, // Set to true in production
    },
  },
};

// Increase worker count for parallel processing
config.maxWorkers = 4;

// Support pnpm workspace by allowing Metro to resolve from workspace root
config.resolver = {
  ...config.resolver,
  nodeModulesPaths: [
    path.resolve(projectRoot, 'node_modules'),
    path.resolve(workspaceRoot, 'node_modules'),
  ],
};

// One copy of React Native per bundle (2026-10-20). pnpm keeps two installs
// of react-native (the apps pull different @types/react / @babel/core), and a
// bundle that mixes them crashes on Expo native views ("View config getter
// callback for component `ViewManagerAdapter_ExpoLinearGradient` ..."). See
// tools/metro-singletons.js. Optional so a build that doesn't ship tools/
// (EAS installs flat, with one copy anyway) still bundles.
let withSingletons = (c) => c;
try {
  ({ withSingletons } = require(path.resolve(workspaceRoot, 'tools/metro-singletons.js')));
} catch (e) {
  if (e && e.code !== 'MODULE_NOT_FOUND') throw e;
}

module.exports = withSingletons(config, projectRoot);
