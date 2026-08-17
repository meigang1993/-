import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const desktop = path.resolve(here, '..');
const packageRoot = path.join(desktop, 'out', 'make', 'zip', 'win32', 'x64');
const uploadRoot = path.join(desktop, 'out', 'wormhole-upload');
const sourceZip = (await fs.readdir(packageRoot))
  .filter(name => name.endsWith('.zip'))
  .sort()
  .at(-1);

if (!sourceZip) {
  throw new Error('Windows portable ZIP is missing; run npm run build:desktop:win first');
}

const sourcePath = path.join(packageRoot, sourceZip);
const uploadZip = `Wormhole-${sourceZip}`;
const uploadPath = path.join(uploadRoot, uploadZip);
const releaseManifestPath = path.join(desktop, 'out', 'SuccubusKill-win32-x64', 'desktop-release.json');

async function sha256(filename) {
  const hash = crypto.createHash('sha256');
  const data = await fs.readFile(filename);
  hash.update(data);
  return { digest: hash.digest('hex'), bytes: data.byteLength };
}

await fs.rm(uploadRoot, { recursive: true, force: true });
await fs.mkdir(uploadRoot, { recursive: true });
await fs.copyFile(sourcePath, uploadPath);

const archive = await sha256(uploadPath);
const checksumName = `${uploadZip}.sha256`;
await fs.writeFile(
  path.join(uploadRoot, checksumName),
  `${archive.digest}  ${uploadZip}\n`,
  'utf8',
);

let releaseManifest = null;
try {
  releaseManifest = JSON.parse(await fs.readFile(releaseManifestPath, 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

await fs.writeFile(
  path.join(uploadRoot, 'UPLOAD-README.txt'),
  [
    'Wormhole upload package',
    '',
    `Upload: ${uploadZip}`,
    `Verify with: sha256sum -c ${checksumName}`,
    `Archive size: ${archive.bytes} bytes`,
    '',
    'The ZIP is a Windows x64 portable Electron build.',
    'The checksum and release metadata are verification files; upload them too if the recipient needs independent verification.',
    '',
  ].join('\n'),
  'utf8',
);

if (releaseManifest) {
  await fs.writeFile(
    path.join(uploadRoot, 'desktop-release.json'),
    `${JSON.stringify({ ...releaseManifest, uploadFile: uploadZip, uploadSha256: archive.digest }, null, 2)}\n`,
    'utf8',
  );
}

console.log(JSON.stringify({
  ok: true,
  directory: path.relative(path.resolve(desktop, '..'), uploadRoot),
  upload: path.relative(path.resolve(desktop, '..'), uploadPath),
  checksum: archive.digest,
  bytes: archive.bytes,
}, null, 2));
