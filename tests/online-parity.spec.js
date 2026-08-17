const { test, expect } = require("@playwright/test");
const { openOnlineGame } = require("./helpers/online-game");

test("online SDK storage and local core keep progression and balance identical", async ({ page }) => {
  await openOnlineGame(page);
  const result = await page.evaluate(async () => {
    const clone = value => JSON.parse(JSON.stringify(value));
    async function callCore(usePublicCore, method, args, state) {
      if (usePublicCore) return window.ServerCore.call(method, args, state);
      const result = window.LocalCore.handle(method, args, state);
      if (!result || result.error) {
        return { ok: false, changed: false, error: result?.error || new Error("local core failed") };
      }
      if (result.core && result.apply) {
        window.ServerCoreApply.apply(state, result.core, { method, args });
      }
      return { ok: true, changed: !!result.changed, result, offline: true };
    }
    async function exercise(usePublicCore) {
      const next = window.GameStore.freshState();
      next.random = window.GameRandom.create(2971485);
      next.flags.orcDungeonUnlocked = true;
      next.unlockedDifficulties = Object.keys(window.GameData.difficulties);
      const started = await callCore(usePublicCore, "startDungeon", {
        missionId: "orc_dungeon",
        difficultyId: "hell",
      }, next);
      const run = {
        focusId: "online-parity", missionId: "orc_dungeon", difficultyId: "hell",
        activeParty: ["lokar"], pending: "boss",
        layers: [[{
          id: "boss", type: "boss", done: false,
          enemies: [{ id: "demon_king_bakaar" }],
        }]],
      };
      const args = {
        run, nodeId: "boss", kind: "boss",
        defeatedEnemyIds: ["demon_king_bakaar"],
      };
      const settled = await callCore(usePublicCore, "settleDungeon", args, next);
      const repeated = await callCore(usePublicCore, "settleDungeon", args, next);
      const lokar = next.chars.find(character => character.id === "lokar");
      return {
        state: next,
        result: {
          level: lokar.level,
          exp: lokar.exp,
          stats: clone(lokar.stats),
          pendingRun: clone(next._localPendingRun),
          started: started.ok,
          settled: settled.changed,
          repeated: repeated.changed,
          experience: settled.result.core.lastLocalReward.experience,
          localCore: started.offline,
        },
      };
    }
    async function exerciseReconcile(usePublicCore) {
      const next = window.GameStore.freshState();
      next._serverRun = { stale: true };
      const result = await callCore(usePublicCore, "bankRun", {}, next);
      return {
        ok: result.ok,
        changed: result.changed,
        hasServerRun: Object.hasOwn(next, "_serverRun"),
        pendingRun: clone(next._localPendingRun),
      };
    }
    const offline = await exercise(false);
    const online = await exercise(true);
    const offlineReconcile = await exerciseReconcile(false);
    const onlineReconcile = await exerciseReconcile(true);
    await window.GameStore.save(online.state, { flush: true });
    const key = window.GameStoreIO.key;
    const cloud = clone(window.__onlineKv.get(key));
    localStorage.removeItem(key);
    const loaded = await window.GameStore.load();
    const loadedLokar = loaded.chars.find(character => character.id === "lokar");
    const bakaar = window.GameData.enemies.orc_dungeon.find(enemy => enemy.id === "demon_king_bakaar");
    const king = window.GameData.scaleEnemyStats(bakaar, window.GameData.difficulties.king, "boss");
    const heroic = window.GameData.scaleEnemyStats(bakaar, window.GameData.difficulties.hell, "boss");
    return {
      offline: offline.result,
      online: online.result,
      offlineReconcile,
      onlineReconcile,
      cloud: {
        level: cloud.chars.find(character => character.id === "lokar").level,
        exp: cloud.chars.find(character => character.id === "lokar").exp,
        hasSpent: Object.hasOwn(cloud.chars.find(character => character.id === "lokar"), "spent"),
        hasStats: Object.hasOwn(cloud.chars.find(character => character.id === "lokar"), "stats"),
      },
      loaded: {
        level: loadedLokar.level,
        exp: loadedLokar.exp,
        hasSpent: Object.hasOwn(loadedLokar, "spent"),
        stats: loadedLokar.stats,
      },
      scaling: {
        king: { hp: king.hp, attack: king.attack, magic: king.magic },
        heroic: { hp: heroic.hp, attack: heroic.attack, magic: heroic.magic },
      },
      flushed: window.__onlinePuts.some(item => item.key === key && item.options?.flush === true),
      functionCalls: window.__onlineFnInvokes.length,
    };
  });
  expect(result.online).toEqual(result.offline);
  expect(result.onlineReconcile).toEqual(result.offlineReconcile);
  expect(result.onlineReconcile).toEqual({
    ok: true,
    changed: false,
    hasServerRun: false,
    pendingRun: { gold: 0, essence: 0, cards: [], relics: [] },
  });
  expect(result.online).toMatchObject({
    level: 1,
    exp: 147,
    started: true,
    settled: true,
    repeated: false,
    experience: 247,
    localCore: true,
  });
  expect(result.cloud).toEqual({
    level: 1,
    exp: 147,
    hasSpent: false,
    hasStats: false,
  });
  expect(result.loaded).toEqual({
    level: 1,
    exp: 147,
    hasSpent: false,
    stats: result.online.stats,
  });
  expect(result.scaling).toEqual({
    king: { hp: 759, attack: 15, magic: 10 },
    heroic: { hp: 1056, attack: 17, magic: 11 },
  });
  expect(result.flushed).toBe(true);
  expect(result.functionCalls).toBe(0);
});
