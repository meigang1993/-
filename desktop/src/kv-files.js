const fs = require('node:fs/promises');

async function readCandidate(filename, validateDocument) {
  try {
    const raw = await fs.readFile(filename, 'utf8');
    return { exists: true, document: validateDocument(JSON.parse(raw)) };
  } catch (error) {
    if (error.code === 'ENOENT') return { exists: false, document: null };
    if (error instanceof SyntaxError) return { exists: true, document: null };
    throw error;
  }
}

async function replaceFile(source, target) {
  try {
    await fs.rename(source, target);
  } catch (error) {
    if (!['EEXIST', 'EPERM'].includes(error.code)) throw error;
    const displaced = `${target}.replace-old`;
    await fs.rm(displaced, { force: true });
    await fs.rename(target, displaced).catch(inner => {
      if (inner.code !== 'ENOENT') throw inner;
    });
    try {
      await fs.rename(source, target);
      await fs.rm(displaced, { force: true });
    } catch (inner) {
      await fs.rename(displaced, target).catch(() => {});
      throw inner;
    }
  }
}

async function writeAtomic(filename, serialized) {
  const temporary = `${filename}.${process.pid}.${Date.now()}.tmp`;
  const handle = await fs.open(temporary, 'wx', 0o600);
  try {
    await handle.writeFile(serialized, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await replaceFile(temporary, filename);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

module.exports = { readCandidate, writeAtomic };
