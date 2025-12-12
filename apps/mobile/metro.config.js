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

module.exports = config;
