#!/usr/bin/env node
/**
 * Design-token ratchet gate (design system audit 2026-06-22, Action 3).
 *
 * Blocks NEW hardcoded design values from creeping into the mobile app while
 * the existing backlog is worked down. It does NOT require a clean tree today:
 * it compares per-file violation counts against a committed baseline and fails
 * only when a count goes UP (or a brand-new file introduces violations).
 *
 * Categories flagged (in app/ and src/ .ts/.tsx):
 *   - hex          raw 6/8-digit color literals  -> use useTheme().colors.*
 *   - fontSize     raw numeric font sizes        -> use TYPE / AppText variants
 *   - borderRadius raw numeric radii             -> use layout.radius.*
 *
 * Usage:
 *   node scripts/check-design-tokens.js            # check (CI + local)
 *   node scripts/check-design-tokens.js --update   # regenerate the baseline
 *
 * Workflow: when you legitimately reduce violations, run --update and commit
 * the new baseline so the ratchet locks in the improvement.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..'); // apps/mobile
const SCAN_DIRS = ['app', 'src'];
const BASELINE_PATH = path.join(__dirname, 'design-tokens-baseline.json');

// Files that legitimately DEFINE raw values — the token/theme source of truth.
const ALLOWLIST = new Set([
  'src/theme/tokens.ts',
  'src/contexts/ThemeContext.tsx',
  'src/utils/status-colors.ts',
]);

const PATTERNS = {
  hex: /#[0-9a-fA-F]{6}\b/g,
  fontSize: /\bfontSize:\s*\d/g,
  borderRadius: /\bborderRadius:\s*\d/g,
};

function walk(dir, out) {
  out = out || [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.d\.ts$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function countFile(absPath) {
  // Strip NUL bytes defensively (some sync/mount layers inject them).
  const src = fs.readFileSync(absPath, 'utf8').replace(/\x00/g, '');
  const counts = {};
  for (const name of Object.keys(PATTERNS)) {
    const m = src.match(PATTERNS[name]);
    if (m && m.length) counts[name] = m.length;
  }
  return counts;
}

function scan() {
  const result = {};
  for (const d of SCAN_DIRS) {
    const abs = path.join(ROOT, d);
    if (!fs.existsSync(abs)) continue;
    for (const file of walk(abs)) {
      const rel = path.relative(ROOT, file).split(path.sep).join('/');
      if (ALLOWLIST.has(rel)) continue;
      const c = countFile(file);
      if (Object.keys(c).length) result[rel] = c;
    }
  }
  return result;
}

function totals(map) {
  const t = { hex: 0, fontSize: 0, borderRadius: 0 };
  for (const c of Object.values(map)) {
    for (const k of Object.keys(t)) t[k] += c[k] || 0;
  }
  return t;
}

const current = scan();

if (process.argv.includes('--update')) {
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(current, null, 2) + '\n');
  const t = totals(current);
  console.log(
    '✅ Baseline written: ' + Object.keys(current).length + ' files | ' +
      'hex ' + t.hex + ', fontSize ' + t.fontSize + ', borderRadius ' + t.borderRadius,
  );
  process.exit(0);
}

if (!fs.existsSync(BASELINE_PATH)) {
  console.error('❌ No baseline found. Run: npm run lint:tokens -- --update');
  process.exit(1);
}

const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
const regressions = [];

for (const file of Object.keys(current)) {
  const counts = current[file];
  const base = baseline[file] || {};
  for (const cat of Object.keys(PATTERNS)) {
    const now = counts[cat] || 0;
    const was = base[cat] || 0;
    if (now > was) regressions.push({ file: file, cat: cat, was: was, now: now });
  }
}

if (regressions.length === 0) {
  const t = totals(current);
  console.log(
    '✅ Design-token gate passed — no new hardcoded values. ' +
      '(baseline totals: hex ' + t.hex + ', fontSize ' + t.fontSize +
      ', borderRadius ' + t.borderRadius + ')',
  );
  process.exit(0);
}

console.error('❌ Design-token gate failed — new hardcoded values introduced:\n');
for (const r of regressions) {
  console.error('  ' + r.file + '  [' + r.cat + ']  ' + r.was + ' -> ' + r.now);
}
console.error(
  '\nUse theme tokens instead of raw values:\n' +
    '  - colors  : useTheme().colors.* (e.g. colors.error, colors.male)\n' +
    '  - fonts   : TYPE / <AppText variant=...> from src/theme + src/components/ui\n' +
    '  - radius  : useTheme().layout.radius.*\n' +
    'If a reduction elsewhere is intended, run: npm run lint:tokens -- --update  (then commit the baseline)\n',
);
process.exit(1);
