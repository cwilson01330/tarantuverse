const { getDefaultConfig } = require('expo/metro-config');
const fs = require('fs');
const path = require('path');

// The folder's REAL spelling (2026-10-27). On Windows a terminal opened at
// "C:\users\..." gives __dirname that casing, while pnpm's links (and
// tools/metro-singletons.js, which follows them) resolve to "C:\Users\...".
// Metro's file map is case-sensitive, so the two spellings miss each other:
// "Failed to get the SHA-1 for ... @expo/cli/.../metro-require/require.js"
// during `eas update`. realpathSync.native returns the on-disk casing.
const projectRoot = fs.realpathSync.native(__dirname);

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

// Monorepo support: Allow Metro to access workspace root
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
