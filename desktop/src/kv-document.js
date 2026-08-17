const crypto = require('node:crypto');

const SCHEMA_VERSION = 1;
const MAX_BYTES = 5 * 1024 * 1024;

function codedError(code, message, cause) {
  const error = new Error(message);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function assertKey(key) {
  if (typeof key !== 'string' || !key.length) {
    throw codedError('INVALID_KEY', 'KV key must be a non-empty string');
  }
}

function assertJsonSafe(value, seen = new Set(), label = 'value') {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (typeof value !== 'object') {
    throw codedError('INVALID_VALUE', `${label} is not JSON-safe`);
  }
  if (seen.has(value)) throw codedError('INVALID_VALUE', `${label} contains a cycle`);
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJsonSafe(item, seen, `${label}[${index}]`));
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw codedError('INVALID_VALUE', `${label} must contain plain objects`);
    }
    Object.entries(value).forEach(([key, item]) => {
      assertJsonSafe(item, seen, `${label}.${key}`);
    });
  }
  seen.delete(value);
}

function cloneJson(value) {
  assertJsonSafe(value);
  return JSON.parse(JSON.stringify(value));
}

function checksum(document) {
  const payload = {
    schemaVersion: document.schemaVersion,
    revision: document.revision,
    updatedAt: document.updatedAt,
    entries: document.entries,
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function emptyDocument(now) {
  const document = {
    schemaVersion: SCHEMA_VERSION,
    revision: 0,
    updatedAt: now(),
    entries: Object.create(null),
  };
  document.checksum = checksum(document);
  return document;
}

function validateDocument(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (value.schemaVersion !== SCHEMA_VERSION) return null;
  if (!Number.isSafeInteger(value.revision) || value.revision < 0) return null;
  if (!Number.isFinite(Date.parse(value.updatedAt))) return null;
  if (!value.entries || typeof value.entries !== 'object' || Array.isArray(value.entries)) {
    return null;
  }
  const entries = Object.create(null);
  for (const [key, record] of Object.entries(value.entries)) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
    if (!Object.prototype.hasOwnProperty.call(record, 'value')) return null;
    if (!Number.isFinite(Date.parse(record.updated_at))) return null;
    try {
      assertKey(key);
      entries[key] = { value: cloneJson(record.value), updated_at: record.updated_at };
    } catch (_) {
      return null;
    }
  }
  const document = {
    schemaVersion: value.schemaVersion,
    revision: value.revision,
    updatedAt: value.updatedAt,
    entries,
    checksum: value.checksum,
  };
  return typeof value.checksum === 'string' && checksum(document) === value.checksum
    ? document
    : null;
}

module.exports = {
  MAX_BYTES,
  assertKey,
  checksum,
  cloneJson,
  codedError,
  emptyDocument,
  validateDocument,
};
