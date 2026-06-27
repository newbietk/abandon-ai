#!/usr/bin/env node
/**
 * Session Diff Tracker — One-command installer.
 *
 * Usage (from project root):
 *   node session-diff-tracker/install.mjs
 *
 * What it does:
 *   1. Ensures .opencode/package.json exists with @opencode-ai/plugin
 *   2. Adds session-diff-tracker as a file: dependency
 *   3. Runs npm install in .opencode/
 *   4. Creates .opencode/plugins/session-diff-tracker.js entry point
 *   5. Verifies everything is wired correctly
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const cwd = process.cwd();
const opencodeDir = path.join(cwd, '.opencode');
const pkgPath = path.join(opencodeDir, 'package.json');
const trackerDir = path.join(cwd, 'session-diff-tracker');
const dependencyName = 'session-diff-tracker';
const dependencyValue = 'file:../session-diff-tracker';

// ── Step 0: Preflight ──────────────────────────────────────────────────────
if (!fs.existsSync(trackerDir)) {
  console.error('✗ session-diff-tracker/ directory not found in project root.');
  console.error('  Make sure the directory exists before running this script.');
  process.exit(1);
}

if (!fs.existsSync(opencodeDir)) {
  console.log('Creating .opencode/ directory...');
  fs.mkdirSync(opencodeDir, { recursive: true });
}

// ── Step 1: Ensure .opencode/package.json ──────────────────────────────────
let pkg;
if (fs.existsSync(pkgPath)) {
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  } catch {
    console.error('✗ Failed to parse .opencode/package.json — check JSON syntax.');
    process.exit(1);
  }
} else {
  pkg = { dependencies: {} };
}

if (!pkg.dependencies) pkg.dependencies = {};

// Ensure @opencode-ai/plugin exists
if (!pkg.dependencies['@opencode-ai/plugin']) {
  // Try to detect current OC version from node_modules, fallback to latest
  const ocPluginPkg = path.join(opencodeDir, 'node_modules', '@opencode-ai', 'plugin', 'package.json');
  let version = '>=1.17.0';
  try {
    const ocPkg = JSON.parse(fs.readFileSync(ocPluginPkg, 'utf-8'));
    version = ocPkg.version;
  } catch { /* use fallback */ }
  pkg.dependencies['@opencode-ai/plugin'] = version;
  console.log(`  + @opencode-ai/plugin @ ${version}`);
}

// Add session-diff-tracker
if (pkg.dependencies[dependencyName] === dependencyValue) {
  console.log('  - session-diff-tracker already registered.');
} else {
  if (pkg.dependencies[dependencyName]) {
    console.log(`  ~ session-diff-tracker: "${pkg.dependencies[dependencyName]}" → "${dependencyValue}"`);
  } else {
    console.log(`  + session-diff-tracker: "${dependencyValue}"`);
  }
  pkg.dependencies[dependencyName] = dependencyValue;
}

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

// ── Step 2: Install ────────────────────────────────────────────────────────
console.log('\nInstalling dependencies...');
try {
  execSync('npm install --no-audit --no-fund', {
    cwd: opencodeDir,
    encoding: 'utf-8',
    stdio: 'inherit',
    timeout: 30000,
  });
} catch (err) {
  console.error('✗ npm install failed. Check the output above for details.');
  process.exit(1);
}

// ── Step 3: Verify ─────────────────────────────────────────────────────────
const symlinkPath = path.join(opencodeDir, 'node_modules', dependencyName);
if (!fs.existsSync(symlinkPath)) {
  console.error('✗ Symlink not found after install. Something went wrong.');
  process.exit(1);
}

const stat = fs.lstatSync(symlinkPath);
if (stat.isSymbolicLink()) {
  const target = fs.readlinkSync(symlinkPath);
  console.log(`✓ Installed — symlink: node_modules/${dependencyName} → ${target}`);
} else {
  console.log(`✓ Installed — directory: node_modules/${dependencyName}`);
}

// ── Step 4: Create .opencode/plugins entry point ──────────────────────────
const pluginsDir = path.join(opencodeDir, 'plugins');
fs.mkdirSync(pluginsDir, { recursive: true });
const pluginEntry = path.join(pluginsDir, 'session-diff-tracker.js');
const entryContent = `import SessionDiffPlugin from '../node_modules/session-diff-tracker/index.mjs';
export default SessionDiffPlugin;
`;
fs.writeFileSync(pluginEntry, entryContent);
console.log(`✓ Plugin entry: .opencode/plugins/session-diff-tracker.js`);

console.log('✓ Session Diff Tracker is ready. Restart OpenCode to activate.\n');
