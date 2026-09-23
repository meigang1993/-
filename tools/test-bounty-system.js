const assert = require("assert");

global.window = global;
require("../src/original/game-random.js");
window.GameData = {
  missions: [
    { id: "machine_factory", kind: "dungeon", reward: { bountyGoldRange: [500, 900] } },
    { id: "underwater_train", kind: "dungeon", requiresFlag: "underwaterTrainUnlocked", reward: { bountyGoldRange: [800, 1400] } },
    { id: "orc_dungeon", kind: "dungeon", requiresFlag: "orcDungeonUnlocked", reward: { bountyGoldRange: [1200, 2000] } },
  ],
  enemies: {
    machine_factory: [
      { id: "machine_boss", name: "机械王", type: "boss" },
      { id: "machine_elite", name: "机械精英", type: "elite" },
    ],
    underwater_train: [
      { id: "shark_captain_mordio", name: "莫迪奥", type: "boss" },
      { id: "train_elite", name: "列车精英", type: "elite" },
    ],
    orc_dungeon: [
      { id: "orc_boss", name: "兽人领主", type: "boss" },
      { id: "orc_elite", name: "兽人精英", type: "elite" },
    ],
  },
  eliteUnlocks: {
    machine_boss: ["机械牌"], machine_elite: ["精英牌"],
    shark_captain_mordio: ["鲨鱼牌"], train_elite: ["列车牌"],
    orc_boss: ["兽人牌"], orc_elite: ["兽人精英牌"],
  },
  eliteCards: [
    { name: "机械牌", type: "tactic", suit: "♠" },
    { name: "精英牌", type: "tactic", suit: "♣" },
    { name: "鲨鱼牌", type: "tactic", suit: "♥" },
    { name: "列车牌", type: "tactic", suit: "♦" },
    { name: "兽人牌", type: "tactic", suit: "♠" },
    { name: "兽人精英牌", type: "tactic", suit: "♣" },
  ],
  baseDeck: [],
};
window.RelicSystem = { randomElite: () => null, data: () => null };

require("../src/original/store-save-schema.js");
require("../src/original/bounty-render.js");
require("../src/original/bounty-rewards.js");
require("../src/original/bounty-task-rewards.js");
require("../src/original/bounty-task-generator.js");
require("../src/original/bounty-task-repair.js");
require("../src/original/bounty-tasks.js");
require("../src/original/bounty.js");

const originalRandom = Math.random;
Math.random = () => 0;

function state(overrides = {}) {
  return {
    flags: { underwaterTrainUnlocked: true },
    defeatedElites: [],
    chars: [
      { id: "hero", name: "勇者", locked: false },
      { id: "mage", name: "法师", locked: false },
      { id: "princess", name: "公主", locked: true },
    ],
    bounties: [],
    pendingBountyRewards: [],
    log: [],
    ...overrides,
  };
}

try {
  {
    const current = state();
    BountySystem.ensure(current);
    const bosses = current.bounties.filter(task => task.targetType === "boss");
    assert.strictEqual(bosses.length, 1, "before Mordio, only one dungeon may offer a boss hunt");
  }

  {
    const malformed = state({ defeatedElites: ["shark_captain_mordio"] });
    BountySystem.ensure(malformed);
    assert.strictEqual(BountyTasks.maxCount(malformed), 7,
      "manual Mordio defeat flag still expands the configured task limit");
    assert.strictEqual(malformed.bounties.length, 6,
      "an impossible partial progression state may exhaust its six valid unique offers");

    const current = state({ defeatedElites: ["shark_captain_mordio"] });
    current.chars.find(character => character.id === "princess").locked = false;
    BountySystem.ensure(current);
    assert.strictEqual(current.bounties.length, 7,
      "reachable post-Mordio progression must fill all seven task slots");
    const bossMissions = new Set(current.bounties.filter(task => task.targetType === "boss").map(task => task.missionId));
    assert.deepStrictEqual([...bossMissions].sort(), ["machine_factory", "underwater_train"],
      "after Mordio, boss hunts may coexist across different dungeons");
  }

  {
    const accepted = {
      id: "accepted-boss", type: "hunt", accepted: true, missionId: "underwater_train",
      targetId: "shark_captain_mordio", targetName: "旧名称", targetType: "boss",
      reward: {
        type: "card",
        card: { name: "鲨鱼牌", suit: "♥", power: 999, injectedSkill: true },
      },
      bonusGold: 900,
      injectedHtml: "<img src=x onerror=alert(1)>",
    };
    const current = state({ bounties: [
      {
        id: "offered-boss", type: "hunt", accepted: false, missionId: "machine_factory",
        targetId: "machine_boss", targetName: "机械王", targetType: "boss",
        reward: { type: "card", card: { name: "机械牌", suit: "♠" } }, bonusGold: 600,
      },
      accepted,
      { id: "broken", type: "unknown", accepted: false },
      {
        id: "wrong-mission", type: "hunt", accepted: false, missionId: "underwater_train",
        targetId: "machine_elite", targetName: "错配目标", targetType: "elite",
      },
    ] });
    BountySystem.ensure(current);
    const retained = current.bounties.find(task => task.id === accepted.id);
    assert(retained?.accepted, "accepted boss task must take priority during repair");
    assert.strictEqual(retained.targetName, "莫迪奥", "task identity should refresh from canonical enemy data");
    assert(!("injectedHtml" in retained) && !("injectedSkill" in retained.reward.card),
      "task repair must drop non-whitelisted task and card fields");
    assert(!current.bounties.some(task => task.id === "broken" || task.id === "wrong-mission"),
      "unknown and mission-mismatched tasks must be replaced");
    assert(current.bounties.every(task => ["hunt", "bond"].includes(task.type)),
      "repaired task list must contain only supported task types");
  }

  {
    const hunt = {
      id: "hunt-1", type: "hunt", accepted: true, missionId: "machine_factory",
      targetId: "machine_elite", targetName: "机械精英", targetType: "elite",
      reward: { type: "card", card: { name: "精英牌", suit: "♣" } }, bonusGold: 700,
    };
    const current = state({ bounties: [hunt] });
    const run = { focusId: "run-hunt", missionId: "machine_factory" };
    BountySystem.completeBattle(current, { defeatedEnemyIds: ["machine_elite"] }, run);
    BountySystem.completeBattle(current, { defeatedEnemyIds: ["machine_elite"] }, run);
    assert.strictEqual(current.pendingBountyRewards.length, 1, "hunt completion must queue its reward exactly once");
    assert(!current.bounties.includes(hunt), "completed hunt must be replaced with a new offer");
  }

  {
    const bond = {
      id: "bond-fail", type: "bond", accepted: true, missionId: "machine_factory",
      charId: "hero", charName: "勇者", reward: { type: "essence", essence: 3 }, bonusGold: 700,
    };
    const current = state({
      bounties: [bond],
      explore: { focusId: "run-fail", missionId: "machine_factory", party: ["hero"], activeParty: ["hero"] },
    });
    BountySystem.markFallen(current, ["hero"]);
    BountySystem.completeDungeon(current, { ...current.explore, complete: true, activeParty: [] });
    const failed = current.bounties.find(task => task.id === bond.id);
    assert.strictEqual(failed?.accepted, false);
    assert.strictEqual(failed?.failed, true);
    assert.strictEqual(current.pendingBountyRewards.length, 0, "fallen bond target must not receive a completion reward");
  }

  {
    const machineHunt = {
      id: "retreat-hunt", type: "hunt", accepted: true, missionId: "machine_factory",
      targetId: "machine_elite", targetName: "机械精英", targetType: "elite",
      reward: { type: "card", card: { name: "精英牌", suit: "♣" } }, bonusGold: 700,
    };
    const machineBond = {
      id: "retreat-bond", type: "bond", accepted: true, missionId: "machine_factory",
      charId: "hero", charName: "勇者",
      reward: { type: "essence", essence: 3 }, bonusGold: 700,
    };
    const trainHunt = {
      id: "other-run-hunt", type: "hunt", accepted: true, missionId: "underwater_train",
      targetId: "train_elite", targetName: "列车精英", targetType: "elite",
      reward: { type: "card", card: { name: "列车牌", suit: "♦" } }, bonusGold: 900,
    };
    const fallenBond = {
      id: "fallen-bond", type: "bond", accepted: false, failed: true,
      missionId: "machine_factory", charId: "mage", charName: "法师",
      reward: { type: "essence", essence: 2 }, bonusGold: 650,
    };
    const current = state({
      bounties: [machineHunt, machineBond, trainHunt, fallenBond],
    });
    BountySystem.failRun(current, "machine_factory", [], "", "撤退");
    assert(!current.bounties.some(task =>
      [machineHunt.id, machineBond.id, fallenBond.id].includes(task.id)),
    "retreat must replace accepted and already-failed tasks for the abandoned dungeon");
    assert(current.bounties.some(task =>
      task.id === trainHunt.id && task.accepted),
    "retreat must preserve accepted tasks for other dungeons");
    assert.strictEqual(current.bounties.length, BountyTasks.maxCount(current),
      "retreat task refresh must refill every available task slot");
    assert(current.log.filter(message =>
      message.includes("任务失败") && message.includes("撤退")).length === 2,
    "retreat must report each accepted task failure");
  }

  {
    const bond = {
      id: "bond-win", type: "bond", accepted: true, missionId: "machine_factory",
      charId: "hero", charName: "勇者", reward: { type: "essence", essence: 3 }, bonusGold: 700,
    };
    const current = state({ bounties: [bond] });
    const run = { focusId: "run-win", missionId: "machine_factory", complete: true, party: ["hero"], activeParty: ["hero"] };
    BountySystem.completeDungeon(current, run);
    assert.strictEqual(current.pendingBountyRewards.length, 1, "surviving bond target must complete the task");
    assert(!current.bounties.some(task => task.id === bond.id),
      "completed bond task must be replaced with a fresh offer");
    assert.strictEqual(current.bounties.length, BountyTasks.maxCount(current),
      "dungeon completion must refill every available task slot");
  }

  {
    const hunt = {
      id: "orc-hunt", type: "hunt", accepted: true, missionId: "orc_dungeon",
      targetId: "orc_elite", targetName: "兽人精英", targetType: "elite",
      reward: { type: "card", card: { name: "兽人精英牌", suit: "♣" } }, bonusGold: 1600,
    };
    const bond = {
      id: "orc-bond", type: "bond", accepted: true, missionId: "orc_dungeon",
      charId: "hero", charName: "勇者", reward: { type: "essence", essence: 3 }, bonusGold: 1700,
    };
    const current = state({
      flags: { underwaterTrainUnlocked: true, orcDungeonUnlocked: true },
      defeatedElites: ["shark_captain_mordio"],
      bounties: [hunt, bond],
    });
    const run = {
      focusId: "run-orc", missionId: "orc_dungeon", complete: true,
      party: ["hero"], activeParty: ["hero"],
    };
    BountySystem.completeBattle(current, { defeatedEnemyIds: ["orc_elite"] }, run);
    BountySystem.completeDungeon(current, run);
    assert.strictEqual(current.pendingBountyRewards.length, 2,
      "orc dungeon hunt and bond tasks must both complete");
    assert(current.pendingBountyRewards.every(item =>
      item.bonusGold >= 1200 && item.bonusGold <= 2000),
    "orc dungeon task bonuses must stay within the canonical range");
  }

  {
    const malicious = state({
      bounties: [{
        id: "x\" onclick=\"alert(1)",
        type: "hunt",
        accepted: false,
        failed: false,
        missionId: "machine_factory",
        targetId: "machine_elite",
        targetName: "<img src=x onerror=alert(1)>",
        targetType: "elite",
        reward: { type: "card", card: { name: "<script>alert(1)</script>" } },
        bonusGold: 500,
      }],
    });
    const html = BountyRender.render(malicious, {
      ensure() {},
      accepted() { return []; },
      maxCount() { return 4; },
      ensureReward() {},
    });
    assert(!html.includes("<script>") && !html.includes("<img src=x"),
      "bounty rendering must not emit stored HTML as markup");
    assert(html.includes("&lt;script&gt;") && html.includes("&quot; onclick=&quot;"),
      "bounty rendering must escape reward text and task attribute values");
  }
} finally {
  Math.random = originalRandom;
}

console.log("Bounty system regression tests passed");
