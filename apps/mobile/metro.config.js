const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// IMPORTANT: Limit Metro to only the mobile app directory (not the entire monorepo)
// This prevents EAS from packaging the entire monorepo (apps/web, apps/api, etc.)
config.projectRoot = __dirname;
config.watchFolders = [__dirname];

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

// Prevent Metro from traversing up to parent directories
config.resolver = {
  ...config.resolver,
  disableHierarchicalLookup: true,
};

module.exports = config;
