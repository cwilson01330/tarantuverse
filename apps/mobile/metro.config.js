const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

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

config.resolver = {
  ...config.resolver,
  // Cache resolutions for faster rebuilds
  hasteMapCacheDirectory: require('path').join(__dirname, '.cache', 'metro'),
};

// Increase worker count for parallel processing
config.maxWorkers = 4;

// Enable better caching
config.cacheStores = [
  new (require('metro-cache'))({
    root: require('path').join(__dirname, '.cache', 'metro-cache'),
  }),
];

module.exports = config;
