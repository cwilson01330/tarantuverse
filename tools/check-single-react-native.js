#!/usr/bin/env node
/**
 * Fails when an exported mobile bundle holds two copies of a package that
 * must be single (react-native, expo-modules-core, react-navigation, ...).
 * Two react-natives crash Expo native views at runtime — see
 * tools/metro-singletons.js.
 *
 * Usage (from apps/mobile or apps/mobile-herpetoverse):
 *   npx expo export --platform android --dump-sourcemap --output-dir ../../.bundle-check
 *   node ../../tools/check-single-react-native.js ../../.bundle-check
 *
 * Reads every *.map under the folder, takes the source paths, and groups them
 * by package name and install directory (pnpm puts each install under
 * node_modules/.pnpm/<id>/node_modules/<name>). Exit 1 if any package from the
 * single list appears from more than one install; other duplicates are listed
 * as information only.
 */
const fs = require('fs');
const path = require('path');
const { ALWAYS, RN_WORLD } = require('./metro-singletons');

const root = process.argv[2];
if (!root) {
  console.error('usage: node tools/check-single-react-native.js <export dir>');
  process.exit(2);
}

function maps(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...maps(p));
    else if (e.name.endsWith('.map')) out.push(p);
  }
  return out;
}

/** "…/node_modules/.pnpm/<id>/node_modules/@a/b/lib/x.js" -> ["@a/b", "<id>"]; non-pnpm -> [name, "<path to package>"]. */
function install(source) {
  const s = source.replace(/\\/g, '/');
  const i = s.lastIndexOf('/node_modules/');
  if (i < 0) return null;
  const rest = s.slice(i + '/node_modules/'.length).split('/');
  const name = rest[0].startsWith('@') ? `${rest[0]}/${rest[1]}` : rest[0];
  const pnpm = /\/node_modules\/\.pnpm\/([^/]+)\/node_modules\//.exec(s);
  return [name, pnpm ? pnpm[1] : s.slice(0, i)];
}

const files = maps(root);
if (!files.length) {
  console.error(`No .map files under ${root} — export with --dump-sourcemap.`);
  process.exit(2);
}

const installs = new Map(); // name -> Set(install id)
for (const f of files) {
  const { sources = [] } = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const src of sources) {
    const hit = install(src);
    if (!hit) continue;
    if (!installs.has(hit[0])) installs.set(hit[0], new Set());
    installs.get(hit[0]).add(hit[1]);
  }
}

const mustBeSingle = (name) => ALWAYS.includes(name) || RN_WORLD.test(name);
const bad = [];
const info = [];
for (const [name, set] of [...installs].sort()) {
  if (set.size < 2) continue;
  (mustBeSingle(name) ? bad : info).push(`  ${name}\n${[...set].map((s) => `      ${s}`).join('\n')}`);
}

const rn = installs.get('react-native');
console.log(`${files.length} source map(s); react-native installs in bundle: ${rn ? rn.size : 0}`);
if (info.length) console.log(`Duplicated (allowed, not RN-world):\n${info.join('\n')}`);
if (bad.length) {
  console.error(`\nFAIL — these must be ONE copy per bundle:\n${bad.join('\n')}`);
  console.error('Check metro.config.js still wraps the config with tools/metro-singletons.js.');
  process.exit(1);
}
console.log('OK — one copy of every React-Native-world package.');
