const path = require('node:path');

function gameRoot(options) {
  if (options.isPackaged) return path.join(options.resourcesPath, 'publish');
  return path.resolve(options.appPath, '../publish');
}

function resolveGameAsset(root, requestUrl) {
  const url = new URL(requestUrl);
  if (url.protocol !== 'game:' || url.hostname !== 'app') return null;
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch (_) {
    return null;
  }
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  if (relative.includes('\\')) return null;
  const resolved = path.resolve(root, relative);
  const boundary = `${path.resolve(root)}${path.sep}`;
  if (resolved !== path.resolve(root) && !resolved.startsWith(boundary)) return null;
  return resolved;
}

module.exports = { gameRoot, resolveGameAsset };
