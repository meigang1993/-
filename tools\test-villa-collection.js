const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

global.window = global;
global.GameData = {
  cardCodex: [
    { name: "规范牌A", type: "tactic", suitsText: "♠×1", text: "A", source: "测试" },
    { name: "规范牌A", type: "tactic", suitsText: "♥×1", text: "A", source: "测试" },
    { name: "规范牌B", type: "slash", suitsText: "♦×1", text: "B", source: "测试" },
  ],
};

vm.runInThisContext(fs.readFileSync("src/original/unlock-event-progress.js", "utf8"));
vm.runInThisContext(fs.readFileSync("src/original/store-save-schema.js", "utf8"));
vm.runInThisContext(fs.readFileSync("src/original/store-save-validation.js", "utf8"));
vm.runInThisContext(fs.readFileSync("src/original/store-save-limits.js", "utf8"));
vm.runInThisContext(fs.readFileSync("src/original/villa-collection.js", "utf8"));

const U = { esc: value => String(value ?? "") };
const collection = VillaCollectionUI({ U, cardTypeLabel: card => card?.type || "card" });
const state = {
  deckFilter: "all",
  cardCodex: true,
  selectedCodexCard: "规范牌A",
  deck: [
    { name: "规范牌A", type: "tactic", suit: "♠", text: "A" },
    { name: "规范牌A", type: "tactic", suit: "♥", text: "A" },
    { name: "未知旧卡", type: "tactic", suit: "♣", text: "legacy" },
  ],
};
const html = collection.deck(state);

assert.strictEqual((html.match(/已收集种类：1\/2/g) || []).length, 2,
  "deck and codex must count only unique canonical card names");
assert.strictEqual((html.match(/实体卡总数：3/g) || []).length, 2,
  "physical count must retain every permanent deck entity");
assert(html.includes(`实体卡总数：3/${GameStoreSaveLimits.limits.lists.deck}`),
  "deck view must display the validated save capacity");
assert(html.includes("持有×2"), "grouped duplicate canonical cards must show their entity count");
assert(!html.includes("已收集种类：2/"), "unknown legacy names must not increase collection progress");

console.log("villa collection tests passed");
