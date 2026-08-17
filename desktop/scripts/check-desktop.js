const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const desktop = path.join(root, 'desktop');
const required = [
  'package.json',
  'forge.config.js',
  'src/main.js',
  'src/preload.js',
  'src/kv-document.js',
  'src/kv-files.js',
  'src/kv-store.js',
  'src/runtime-paths.js',
  'scripts/make-win.mjs',
];

for (const relative of required) {
  if (!fs.existsSync(path.join(desktop, relative))) {
    throw new Error(`Missing desktop file: ${relative}`);
  }
}
if (!fs.existsSync(path.join(root, 'publish/index.html'))) {
  throw new Error('Approved publish/index.html is missing');
}

const config = fs.readFileSync(path.join(desktop, 'forge.config.js'), 'utf8');
if (!config.includes("../publish") || !config.includes('extraResource')) {
  throw new Error('Desktop package must include publish as a read-only extra resource');
}

const main = fs.readFileSync(path.join(desktop, 'src/main.js'), 'utf8');
for (const contract of [
  'contextIsolation: true',
  'nodeIntegration: false',
  'sandbox: true',
  "protocol.handle('game'",
]) {
  if (!main.includes(contract)) throw new Error(`Missing security contract: ${contract}`);
}
if (/\b(?:createServer|listen)\s*\(/.test(main)) {
  throw new Error('Desktop runtime must not start a server or listen on a port');
}

for (const relative of required.filter(file => /\.m?js$/.test(file))) {
  const result = spawnSync(process.execPath, ['--check', path.join(desktop, relative)], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status || 1);
  }
}

console.log('desktop static checks passed');
