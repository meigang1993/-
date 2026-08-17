/* global assert, cloudReadable, cloudValue, cloudWritable, controlledPuts, deletedCloudKeys, lastPutOptions, localWritable, localWriteCount */
global.window = global;
global.GameData = {
  characters: [{ id: "a", name: "A" }],
  baseDeck: [
    { name: "杀", suit: "♠", type: "slash", power: 1 },
    { name: "云端商店购买牌", suit: "♥", type: "tactic" },
    { name: "商店购买牌", suit: "♥", type: "tactic" },
  ],
  eliteCards: [
    { name: "云端BOSS掉落牌", suit: "♠", type: "slash" },
    { name: "精英掉落牌", suit: "♠", type: "slash" },
    { name: "BOSS掉落牌", suit: "♦", type: "response" },
  ],
};
window.GameStoreMigrations = {
  freshState: () => ({
    updatedAt: 1,
    _saveVersion: 0,
    log: [],
    party: [],
    chars: [],
    deck: [],
    shopCards: [],
    settings: { sfxVolume: 80, musicVolume: 80, manualResponse: false },
    resources: { gold: 0, essence: 0, relics: [] },
  }),
  migrate: value => value,
  baseStats: () => ({}),
};

global.localWritable = false;
global.cloudWritable = false;
global.cloudReadable = true;
global.cloudValue = null;
global.lastPutOptions = null;
global.controlledPuts = null;
global.localWriteCount = 0;
global.deletedCloudKeys = [];

global.localStorage = {
  data: new Map(),
  setItem(key, value) {
    if (!localWritable) throw new Error("local blocked");
    global.localWriteCount += 1;
    this.data.set(key, value);
  },
  getItem(key) {
    return this.data.get(key) || null;
  },
  removeItem(key) {
    if (!localWritable) throw new Error("local blocked");
    this.data.delete(key);
  },
};

window.dzmm = {
  kv: {
    async put(key, value, options) {
      if (controlledPuts) {
        return new Promise((resolve, reject) => {
          controlledPuts.push({
            key,
            value,
            options,
            succeed() {
              global.cloudValue = value;
              global.lastPutOptions = options;
              resolve();
            },
            fail() { reject(new Error("controlled cloud failure")); },
          });
        });
      }
      if (!cloudWritable) throw new Error("cloud blocked");
      global.cloudValue = value;
      global.lastPutOptions = options;
    },
    async get() {
      if (!cloudReadable) throw new Error("cloud read blocked");
      return { value: cloudValue };
    },
    async delete(key) { deletedCloudKeys.push(key); },
  },
  save: {
    onAction(handler) { window.__saveActionHandler = handler; },
  },
};
global.testDzmm = window.dzmm;

require("../src/original/data-future-relics.js");
require("../src/original/data-relics.js");
require("../src/original/relics.js");
require("../src/original/skins.js");
require("../src/original/unlock-event-progress.js");
require("../src/original/store-save-schema.js");
require("../src/original/store-save-validation.js");
require("../src/original/store-save-limits.js");
require("../src/original/store-io-local.js");
require("../src/original/store-io-cloud.js");
require("../src/original/store-io-selection.js");
require("../src/original/store-io-mutations.js");
require("../src/original/store-io-recovery.js");
require("../src/original/store-io.js");
require("../src/original/store-pause-queue.js");
require("../src/original/store-settings-schema.js");
require("../src/original/store-settings-state.js");
require("../src/original/store-settings-writer.js");
require("../src/original/store-settings.js");
require("../src/original/store-compact.js");
require("../src/original/store-main-copy-inspection.js");
require("../src/original/store-main-load.js");
require("../src/original/store-main-save-support.js");
require("../src/original/store-main-save-writer.js");
require("../src/original/store-main-save-timer.js");
require("../src/original/store-main-save-scheduler.js");
require("../src/original/store-main-save-queue.js");
require("../src/original/store-main-save-meta.js");
require("../src/original/store-main-snapshot.js");
require("../src/original/store-main-recovery.js");
require("../src/original/store-main-save.js");
require("../src/original/store-slots-read.js");
require("../src/original/store-slots-data.js");
require("../src/original/store.js");
require("../src/original/store-lifecycle.js");

global.assert = function assert(condition, message) {
  if (!condition) throw new Error(message);
}

global.tick = () => new Promise(resolve => setImmediate(resolve));

global.expectRejects = async function expectRejects(task, message) {
  let rejected = false;
  try {
    await task;
  } catch (_) {
    rejected = true;
  }
  assert(rejected, message);
}
global.captureReject = async function captureReject(task, message) {
  try {
    await task;
  } catch (error) {
    return error;
  }
  throw new Error(message);
}
