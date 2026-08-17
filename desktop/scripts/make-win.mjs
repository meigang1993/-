import { ZipArchive } from 'archiver';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const desktop = path.resolve(here, '..');
const root = path.resolve(desktop, '..');
const packageJson = require('../package.json');
const freeze = require('../../docs/original-runtime-freeze.json');
const forgeCli = require.resolve('@electron-forge/cli/dist/electron-forge.js');
const packageDir = path.join(desktop, 'out', 'SuccubusKill-win32-x64');
const sourcePublish = path.join(root, 'publish');
const packagedPublish = path.join(packageDir, 'resources', 'publish');
const archiveDir = path.join(desktop, 'out', 'make', 'zip', 'win32', 'x64');
const archiveName = `SuccubusKill-win32-x64-${packageJson.version}.zip`;
const archivePath = path.join(archiveDir, archiveName);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || root,
    encoding: options.capture ? 'utf8' : undefined,
    stdio: options.capture ? 'pipe' : 'inherit',
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with status ${result.status}`);
  }
  return options.capture ? result.stdout.trim() : '';
}

async function filesUnder(directory, prefix = '') {
  const names = await fsp.readdir(directory, { withFileTypes: true });
  const output = [];
  for (const entry of names.sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await filesUnder(filename, relative));
    else if (entry.isFile()) output.push(relative);
    else throw new Error(`Unsupported packaged entry: ${relative}`);
  }
  return output;
}

async function fileHash(filename) {
  const hash = crypto.createHash('sha256');
  const stream = fs.createReadStream(filename);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest('hex');
}

async function verifyPublishCopy() {
  const sourceFiles = await filesUnder(sourcePublish);
  const packagedFiles = await filesUnder(packagedPublish);
  if (JSON.stringify(sourceFiles) !== JSON.stringify(packagedFiles)) {
    throw new Error('Packaged publish file list differs from the current approved source');
  }
  const aggregate = crypto.createHash('sha256');
  for (const relative of sourceFiles) {
    const [sourceHash, packagedHash] = await Promise.all([
      fileHash(path.join(sourcePublish, relative)),
      fileHash(path.join(packagedPublish, relative)),
    ]);
    if (sourceHash !== packagedHash) {
      throw new Error(`Packaged publish digest differs: ${relative}`);
    }
    aggregate.update(`${relative}\0${sourceHash}\n`);
  }
  return { fileCount: sourceFiles.length, digest: aggregate.digest('hex') };
}

async function writeReleaseManifest(publish) {
  const manifest = {
    formatVersion: 1,
    product: 'SuccubusKill',
    version: packageJson.version,
    platform: 'win32',
    arch: 'x64',
    electron: packageJson.devDependencies.electron,
    sourceCommit: run('git', ['rev-parse', 'HEAD'], { capture: true }),
    sourceDirty: Boolean(run('git', ['status', '--porcelain'], { capture: true })),
    originalBaselineSourceCommit: freeze.baselineSourceCommit,
    originalBaselineTree: freeze.baselineTree,
    originalFreezeActive: freeze.active === true,
    publishFileCount: publish.fileCount,
    publishDigest: publish.digest,
    builtAt: new Date().toISOString(),
  };
  await fsp.writeFile(
    path.join(packageDir, 'desktop-release.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
}

async function createArchive() {
  await fsp.mkdir(archiveDir, { recursive: true });
  await fsp.rm(archivePath, { force: true });
  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(archivePath);
    const archive = new ZipArchive({ zlib: { level: 9 } });
    output.on('close', resolve);
    output.on('error', reject);
    archive.on('warning', error => {
      if (error.code === 'ENOENT') console.warn(error.message);
      else reject(error);
    });
    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(packageDir, path.basename(packageDir));
    archive.finalize();
  });
  const digest = await fileHash(archivePath);
  await fsp.writeFile(`${archivePath}.sha256`, `${digest}  ${archiveName}\n`, 'utf8');
  return { digest, bytes: (await fsp.stat(archivePath)).size };
}

run(process.execPath, [forgeCli, 'package', '--platform=win32', '--arch=x64'], {
  cwd: desktop,
});
const publish = await verifyPublishCopy();
await writeReleaseManifest(publish);
const archive = await createArchive();
console.log(JSON.stringify({
  ok: true,
  archive: path.relative(root, archivePath),
  archiveSha256: archive.digest,
  archiveBytes: archive.bytes,
  publish,
}, null, 2));
