/* global assert, captureReject */
/* global cloudReadable: writable, cloudValue: writable, cloudWritable: writable */
module.exports = async function runDirectKvTests(validLocal) {
  localStorage.data.delete(window.GameStoreIO.key);
  cloudReadable = true;
  cloudWritable = true;
  cloudValue = {
    ...validLocal,
    updatedAt: 600,
    _saveVersion: 600,
    resources: { gold: 66, essence: 0, relics: [] },
    _saveHeads: {
      main: {
        revision: 3,
        commit: "11111111-1111-1111",
        digest: "a".repeat(64),
      },
    },
  };
  window.dzmm.fn = {
    async invoke() {
      throw new Error("direct KV storage must not invoke a function");
    },
  };
  const store = window.GameStoreMainSave({
    freshState: window.GameStoreMigrations.freshState,
    migrate: value => value,
  });
  const loaded = await store.load();
  assert(loaded.resources.gold === 66,
    "existing browser KV main saves must remain readable after migration");
  await store.save(loaded, { flush: true });
  assert(cloudValue.resources.gold === 66,
    "main saves must write directly through browser KV");
  assert(!("_saveHeads" in cloudValue),
    "new direct KV snapshots must remove obsolete revision metadata");

  localStorage.data.delete(window.GameStoreIO.key);
  cloudReadable = false;
  const readFailure = await captureReject(
    store.load(),
    "a failed direct KV read without local recovery must not create a fresh save"
  );
  assert(readFailure.code === "CLOUD_LOAD_FAILED",
    "direct KV read failures must remain distinct from an empty save");
  cloudReadable = true;
  delete window.dzmm.fn;
};
