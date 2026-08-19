'use strict';
/* Electron can't run in CI here, so guard the main<->renderer contract
   statically: every channel the preload bridge calls must be handled, every
   handler must be reachable, and the renderer must only speak through the
   bridge. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

/** Drop block and line comments so prose cannot trip a code-shape check. */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');
}

const preload = read('src/main/preload.js');
const main = read('src/main/main.js');

const invoked = new Set([...preload.matchAll(/invoke\('([^']+)'/g)].map((m) => m[1]));
const handled = new Set([...main.matchAll(/ipcMain\.handle\('([^']+)'/g)].map((m) => m[1]));

test('every channel the preload calls has a handler', () => {
  const missing = [...invoked].filter((c) => !handled.has(c));
  assert.deepEqual(missing, [], `unhandled IPC channels: ${missing.join(', ')}`);
});

test('every handler is reachable from the preload', () => {
  const orphans = [...handled].filter((c) => !invoked.has(c));
  assert.deepEqual(orphans, [], `handlers nothing can call: ${orphans.join(', ')}`);
});

test('the preload exposes exactly one bridge and no raw ipcRenderer', () => {
  assert.match(preload, /contextBridge\.exposeInMainWorld\('cinema'/);
  assert.doesNotMatch(preload, /exposeInMainWorld\('(?!cinema)/);
  // The `on` helper must keep its channel allow-list.
  assert.match(preload, /const allowed = \[/);
});

test('the main window stays locked down', () => {
  assert.match(main, /contextIsolation:\s*true/);
  assert.match(main, /nodeIntegration:\s*false/);
  assert.match(main, /frame:\s*false/);
  assert.match(main, /setPermissionRequestHandler/);
  assert.match(main, /setWindowOpenHandler/);
});

test('the renderer never reaches for Node or Electron directly', () => {
  const dir = path.join(root, 'src', 'renderer', 'js');
  const files = [];
  (function walk(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) files.push(full);
    }
  })(dir);

  assert.ok(files.length >= 10, 'expected the full view set');
  for (const file of files) {
    // Prose mentions the main process; only real code should be scanned.
    const source = stripComments(fs.readFileSync(file, 'utf8'));
    const rel = path.relative(root, file);
    assert.doesNotMatch(source, /\brequire\s*\(/, `${rel} must not use require()`);
    assert.doesNotMatch(source, /\bprocess\.|\bmodule\.exports\b/, `${rel} must not touch Node globals`);
  }
});

test('every script the page loads exists on disk', () => {
  const html = read('src/renderer/index.html');
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]).filter((r) => !/^https?:/.test(r));
  assert.ok(refs.length >= 12);
  for (const ref of refs) {
    assert.ok(fs.existsSync(path.join(root, 'src', 'renderer', ref)), `missing asset: ${ref}`);
  }
});

test('every view registers itself under the id the router uses', () => {
  const dir = path.join(root, 'src', 'renderer', 'js', 'views');
  for (const name of fs.readdirSync(dir)) {
    const source = fs.readFileSync(path.join(dir, name), 'utf8');
    const id = name.replace(/\.js$/, '');
    assert.match(source, new RegExp(`CH\\.views\\.${id}\\s*=`), `${name} does not register CH.views.${id}`);
    assert.match(source, new RegExp(`id:\\s*'${id}'`), `${name} declares the wrong view id`);
  }
});
