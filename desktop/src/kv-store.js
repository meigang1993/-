const fs = require('node:fs/promises');
const path = require('node:path');
const {
  MAX_BYTES,
  assertKey,
  checksum,
  cloneJson,
  codedError,
  emptyDocument,
  validateDocument,
} = require('./kv-document');
const { readCandidate, writeAtomic } = require('./kv-files');

class DurableKvStore {
  constructor(options) {
    this.directory = options.directory;
    this.filename = path.join(this.directory, options.filename || 'desktop-kv.json');
    this.backup = `${this.filename}.backup`;
    this.corrupt = `${this.filename}.corrupt`;
    this.now = options.now || (() => new Date().toISOString());
    this.document = null;
    this.initializing = null;
    this.tail = Promise.resolve();
  }

  initialize() {
    if (!this.initializing) this.initializing = this._initialize();
    return this.initializing;
  }

  async _initialize() {
    await fs.mkdir(this.directory, { recursive: true });
    const primary = await readCandidate(this.filename, validateDocument);
    if (primary.document) {
      this.document = primary.document;
      return;
    }
    const backup = await readCandidate(this.backup, validateDocument);
    if (backup.document) {
      if (primary.exists) await fs.copyFile(this.filename, this.corrupt).catch(() => {});
      await writeAtomic(this.filename, JSON.stringify(backup.document));
      this.document = backup.document;
      return;
    }
    if (primary.exists || backup.exists) {
      throw codedError('KV_STORE_CORRUPT', 'Local save and backup are both invalid');
    }
    this.document = emptyDocument(this.now);
  }

  _run(operation) {
    const task = this.tail.then(async () => {
      await this.initialize();
      return operation();
    });
    this.tail = task.catch(() => {});
    return task;
  }

  get(key) {
    return this._run(() => {
      assertKey(key);
      const record = this.document.entries[key];
      return record
        ? { value: cloneJson(record.value), updated_at: record.updated_at }
        : { value: null, updated_at: null };
    });
  }

  put(key, value) {
    return this._run(async () => {
      assertKey(key);
      const clean = cloneJson(value);
      const updatedAt = this.now();
      const entries = Object.assign(Object.create(null), this.document.entries);
      entries[key] = { value: clean, updated_at: updatedAt };
      await this._commit(entries, updatedAt);
      return { ok: true, updated_at: updatedAt };
    });
  }

  delete(key) {
    return this._run(async () => {
      assertKey(key);
      if (!Object.prototype.hasOwnProperty.call(this.document.entries, key)) {
        return { ok: true, deleted: false };
      }
      const entries = Object.assign(Object.create(null), this.document.entries);
      delete entries[key];
      await this._commit(entries, this.now());
      return { ok: true, deleted: true };
    });
  }

  async _commit(entries, updatedAt) {
    const next = {
      schemaVersion: 1,
      revision: this.document.revision + 1,
      updatedAt,
      entries,
    };
    next.checksum = checksum(next);
    const serialized = JSON.stringify(next);
    if (Buffer.byteLength(serialized, 'utf8') > MAX_BYTES) {
      throw codedError('VALUE_TOO_LARGE', 'Desktop KV exceeds the 5 MiB limit');
    }
    const current = await readCandidate(this.filename, validateDocument);
    if (current.document) await writeAtomic(this.backup, JSON.stringify(current.document));
    await writeAtomic(this.filename, serialized);
    this.document = next;
  }
}

module.exports = { DurableKvStore, MAX_BYTES, validateDocument };
