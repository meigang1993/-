const {
  assert, fs, vm,
} = require("./battle-resume-save-fixtures");

const localContext = {
  validationCalls: 0,
  window: {
    localStorage: null,
    GameStoreSaveLimits: {
      limits: { bytes: 2 * 1024 * 1024 },
      serializedBytes: value => JSON.stringify(value).length,
      validateRaw() {
        localContext.validationCalls += 1;
        return true;
      },
    },
  },
};
localContext.window.window = localContext.window;
vm.runInNewContext(
  fs.readFileSync("./src/original/store-io-local.js", "utf8"),
  localContext,
  { filename: "store-io-local.js" },
);
assert.strictEqual(
  localContext.window.GameStoreLocalIO.putLocalRaw("save", {}), false,
  "unavailable local storage must report a failed fallback");
assert.strictEqual(localContext.validationCalls, 0,
  "unavailable local storage must skip full snapshot validation");

const validatedLocalContext = {
  validationCalls: 0,
  window: {
    localStorage: {
      setItem() {},
      getItem() { return null; },
      removeItem() {},
    },
    GameStoreSaveLimits: {
      limits: { bytes: 2 * 1024 * 1024 },
      serializedBytes: value => JSON.stringify(value).length,
      validateRaw() {
        validatedLocalContext.validationCalls += 1;
        return true;
      },
    },
  },
};
validatedLocalContext.window.window = validatedLocalContext.window;
vm.runInNewContext(
  fs.readFileSync("./src/original/store-io-local.js", "utf8"),
  validatedLocalContext,
  { filename: "store-io-local.js" },
);
assert(validatedLocalContext.window.GameStoreLocalIO.putLocalRaw(
  "save", {}, { validated: true }),
"an already-validated local snapshot must remain writable");
assert.strictEqual(validatedLocalContext.validationCalls, 1,
  "local raw writes must validate even when validated is forged");
assert(validatedLocalContext.window.GameStoreLocalIO.putLocalRaw("save", {}),
  "a direct raw local snapshot must remain writable after validation");
assert.strictEqual(validatedLocalContext.validationCalls, 2,
  "a direct raw local snapshot must still be validated");

const cloudContext = {
  validationCalls: 0,
  window: { dzmm: { kv: { async put() {} } } },
};
cloudContext.window.window = cloudContext.window;
vm.runInNewContext(
  fs.readFileSync("./src/original/store-io-mutations.js", "utf8"),
  cloudContext,
  { filename: "store-io-mutations.js" },
);
const cloudMutations = cloudContext.window.GameStoreIOMutations({
  validateRaw() {
    cloudContext.validationCalls += 1;
    return !cloudContext.reject;
  },
  putLocalRaw() { return true; },
  removeLocalRaw() { return { ok: true }; },
  runMutation(_key, task) { return task(); },
});

(async () => {
  assert(await cloudMutations.putCloudRaw("save", {}, { validated: true }),
    "an already-validated cloud snapshot must remain writable");
  assert.strictEqual(cloudContext.validationCalls, 1,
    "cloud raw writes must validate even when validated is forged");
  assert(await cloudMutations.putCloudRaw("save", {}),
    "a direct raw cloud snapshot must remain writable after validation");
  assert.strictEqual(cloudContext.validationCalls, 2,
    "a direct raw cloud snapshot must still be validated");
  cloudContext.reject = true;
  assert(!await cloudMutations.putCloudRaw(
    "invalid", {}, { validated: true }),
  "forged validated cloud writes must reject invalid snapshots");
  console.log("Battle save IO contracts passed");
})().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
