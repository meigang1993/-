const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { DurableKvStore } = require('../src/kv-store');

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'desktop-kv-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  let tick = 0;
  const now = () => new Date(Date.UTC(2026, 7, 3, 0, 0, tick++)).toISOString();
  return { directory, now };
}

test('missing keys are explicit misses and values survive restart', async t => {
  const options = await fixture(t);
  const first = new DurableKvStore(options);
  assert.deepEqual(await first.get('main'), { value: null, updated_at: null });
  await first.put('main', { gold: 120, party: ['besta'] });

  const second = new DurableKvStore(options);
  const loaded = await second.get('main');
  assert.deepEqual(loaded.value, { gold: 120, party: ['besta'] });
  assert.match(loaded.updated_at, /^2026-08-03T/);
});

test('delete is durable and idempotent', async t => {
  const options = await fixture(t);
  const store = new DurableKvStore(options);
  await store.put('slot:1', { level: 3 });
  assert.deepEqual(await store.delete('slot:1'), { ok: true, deleted: true });
  assert.deepEqual(await store.delete('slot:1'), { ok: true, deleted: false });

  const restarted = new DurableKvStore(options);
  assert.deepEqual(await restarted.get('slot:1'), { value: null, updated_at: null });
});

test('a corrupt primary recovers the last valid backup', async t => {
  const options = await fixture(t);
  const store = new DurableKvStore(options);
  await store.put('main', { revision: 1 });
  await store.put('main', { revision: 2 });
  await fs.writeFile(path.join(options.directory, 'desktop-kv.json'), '{broken', 'utf8');

  const recovered = new DurableKvStore(options);
  assert.deepEqual((await recovered.get('main')).value, { revision: 1 });
  await fs.access(path.join(options.directory, 'desktop-kv.json.corrupt'));
});

test('invalid JSON values fail before replacing durable data', async t => {
  const options = await fixture(t);
  const store = new DurableKvStore(options);
  await store.put('main', { valid: true });
  await assert.rejects(store.put('main', { bad: undefined }), { code: 'INVALID_VALUE' });

  const restarted = new DurableKvStore(options);
  assert.deepEqual((await restarted.get('main')).value, { valid: true });
});

test('concurrent writes remain ordered', async t => {
  const options = await fixture(t);
  const store = new DurableKvStore(options);
  await Promise.all([
    store.put('main', { revision: 1 }),
    store.put('main', { revision: 2 }),
    store.put('main', { revision: 3 }),
  ]);
  assert.deepEqual((await store.get('main')).value, { revision: 3 });
});
