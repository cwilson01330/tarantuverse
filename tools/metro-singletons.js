/**
 * One copy of React Native (and its world) per mobile bundle.
 *
 * Why (2026-10-20): pnpm keeps TWO installs of react-native 0.81.5, because
 * the two apps pull different @types/react / @babel/core versions, and a
 * peer dependency is part of a pnpm install's identity. Packages are then
 * split between the two: in the Tarantuverse bundle the app's own screens
 * and expo-linear-gradient used one react-native while expo-router,
 * react-navigation and expo used the other. A native view registered with
 * one copy and rendered through the other "doesn't exist":
 *
 *   View config getter callback for component
 *   `ViewManagerAdapter_ExpoLinearGradient` must be a function
 *
 * (TV Android dashboard, 2026-10-20; the same disease killed HV login through
 * the native Apple button on 2026-10-18). Core View/Text survive because both
 * copies register them, so only Expo-made native views blow up. Store builds
 * are unaffected — EAS installs flat, with one copy — only locally exported
 * OTA bundles carried both.
 *
 * Fix: every import of a React-Native-world package resolves to ONE
 * directory — the copy the app itself (or, for packages it doesn't list,
 * its expo / expo-router) resolves to. We point Metro's lookup at that
 * directory instead of letting each importer find its own install.
 *
 * `tools/check-single-react-native.js` fails when the graph would hold two
 * copies again; run it before `eas update`.
 */
const fs = require('fs');
const path = require('path');

/** Packages that must exist once per bundle even if the app doesn't list them. */
const ALWAYS = [
  'react',
  'react-native',
  'expo',
  'expo-modules-core',
  'expo-router',
  'expo-constants',
  'expo-asset',
  'expo-font',
  'expo-file-system',
  'expo-linking',
  '@expo/vector-icons',
  '@expo/metro-runtime',
  '@react-navigation/native',
  '@react-navigation/core',
  '@react-navigation/elements',
  '@react-navigation/routers',
  '@react-navigation/bottom-tabs',
  '@react-navigation/native-stack',
  'react-native-safe-area-context',
  'react-native-screens',
  'react-native-is-edge-to-edge',
  'react-native-reanimated',
  'react-native-gesture-handler',
];

/** App dependencies that belong to the RN world and so must be single too. */
const RN_WORLD = /^(react|react-dom|react-native|react-native-.+|@react-native\/.+|@react-native-[^/]+\/.+|expo|expo-.+|@expo\/.+|@react-navigation\/.+)$/;

/** "react-native/Libraries/x" -> "react-native"; "@a/b/c" -> "@a/b"; relative/absolute -> null. */
function packageName(request) {
  if (!request || request.startsWith('.') || path.isAbsolute(request)) return null;
  const parts = request.split('/');
  return request.startsWith('@') ? (parts.length > 1 ? `${parts[0]}/${parts[1]}` : null) : parts[0];
}

/** Real directory of `name` as seen from `fromDir`, or null. Works for packages whose "exports" hide package.json. */
function packageDir(name, fromDir) {
  try {
    return fs.realpathSync(path.dirname(require.resolve(`${name}/package.json`, { paths: [fromDir] })));
  } catch {
    // fall through
  }
  try {
    let dir = path.dirname(require.resolve(name, { paths: [fromDir] }));
    while (dir !== path.dirname(dir)) {
      const pj = path.join(dir, 'package.json');
      if (fs.existsSync(pj) && JSON.parse(fs.readFileSync(pj, 'utf8')).name === name) return fs.realpathSync(dir);
      dir = path.dirname(dir);
    }
  } catch {
    // not installed
  }
  return null;
}

/** name -> the one directory every import of it should use. */
function singletonDirs(projectRoot) {
  const pj = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
  const names = new Set([...ALWAYS, ...Object.keys(pj.dependencies || {}).filter((n) => RN_WORLD.test(n))]);
  // The app first; then the packages that bring the rest in.
  const anchors = [projectRoot];
  for (const a of ['expo', 'expo-router']) {
    const d = packageDir(a, projectRoot);
    if (d) anchors.push(d);
  }
  const dirs = new Map();
  for (const name of names) {
    for (const anchor of anchors) {
      const d = packageDir(name, anchor);
      if (d) {
        dirs.set(name, d);
        break;
      }
    }
  }
  return dirs;
}

/** Wrap a Metro config so every RN-world import resolves to its single directory. */
function withSingletons(config, projectRoot) {
  const dirs = singletonDirs(projectRoot);
  const upstream = config.resolver && config.resolver.resolveRequest;
  config.resolver = {
    ...config.resolver,
    resolveRequest(context, moduleName, platform) {
      const name = packageName(moduleName);
      const dir = name ? dirs.get(name) : undefined;
      // Look the module up as if the importer lived inside the chosen copy:
      // Metro's node_modules walk from there lands on exactly that directory,
      // and still applies the package's own main / react-native / exports.
      const ctx = dir ? { ...context, originModulePath: path.join(dir, 'package.json') } : context;
      return upstream ? upstream(ctx, moduleName, platform) : ctx.resolveRequest(ctx, moduleName, platform);
    },
  };
  return config;
}

module.exports = { withSingletons, singletonDirs, packageName, packageDir, ALWAYS, RN_WORLD };
