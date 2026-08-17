global.window = global;
global.navigator = { connection: {} };
global.document = { baseURI: "https://game.test/" };
const fs = require("fs");
const path = require("path");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

class FailingImage {
  set decoding(_) {}
  set loading(_) {}
  decode() {
    return Promise.resolve();
  }
  set src(_) {
    setTimeout(() => this.onerror?.(new Error("missing")), 0);
  }
}

global.Image = FailingImage;
require("../src/original/assets.js");

(async () => {
  const bootSource = fs.readFileSync(path.join(__dirname, "../src/original/app-boot.js"), "utf8");
  assert(!bootSource.includes('phase: "resource_degraded"'), "startup fallback must not report an unsupported loading phase");
  const fallbackReports = bootSource.match(/phase: "resource_loading", message: "Starting with asset fallback"/g) || [];
  assert(fallbackReports.length === 2, "both startup asset fallback paths should use resource_loading");

  const progress = [];
  const failed = await window.GameAssets.preloadCritical((done, total) => {
    progress.push([done, total]);
  });

  assert(Array.isArray(failed), "preloadCritical should return a failure list");
  assert(failed.length === 2, "critical image failures should be reported");
  assert(progress[0]?.[0] === 0 && progress[0]?.[1] === 2, "critical preload should report initial progress");
  assert(progress.at(-1)?.[0] === 2, "critical preload should report completion progress");

  class SlowImage {
    set decoding(_) {}
    set loading(_) {}
    set src(_) { setTimeout(() => this.onload?.(), 2400); }
  }
  global.navigator.connection.effectiveType = "3g";
  global.Image = SlowImage;
  const slowFailures = await window.GameAssets.preloadBattle(
    "slow-mission", [{ art: "./slow-portrait.webp" }], []
  );
  assert(!slowFailures.length, "slow-network battle portraits must outlive the former 2200ms timeout");

  let createdAfterDeadline = 0;
  class DeadlineImage {
    constructor() { createdAfterDeadline += 1; }
    set decoding(_) {}
    set loading(_) {}
    set src(_) {}
  }
  const originalNow = Date.now;
  let nowCalls = 0;
  global.Image = DeadlineImage;
  let deadlineFailures;
  try {
    Date.now = () => nowCalls++ ? 25000 : 0;
    deadlineFailures = await window.GameAssets.preloadBattle(
      "deadline-mission",
      [{ art: "./deadline-a.webp", avatar: "./deadline-b.webp" }],
      [{ art: "./deadline-c.webp" }]
    );
  } finally {
    Date.now = originalNow;
  }
  assert(deadlineFailures.length === 3, "overall battle preload deadline must fail every unfinished portrait");
  assert(createdAfterDeadline === 0, "overall deadline must stop starting new image requests");

  global.navigator.connection.effectiveType = "";
  const raceUrl = "./overlap-race.webp";
  let raceImages = 0;
  class RaceImage {
    constructor() { raceImages += 1; }
    set decoding(_) {}
    set loading(_) {}
    set src(_) {}
  }
  const realSetTimeout = global.setTimeout;
  global.Image = RaceImage;
  global.window.requestIdleCallback = callback => callback();
  global.setTimeout = (callback, delay, ...args) => {
    const mapped = delay === 2200 ? 40
      : delay > 13000 && delay <= 14000 ? 10
        : delay === 8000 || delay > 19000 ? 100 : delay;
    return realSetTimeout(callback, mapped, ...args);
  };
  try {
    window.GameAssets.warmHall({
      party: ["race"], chars: [{ id: "race", art: raceUrl }],
    });
    const capped = await window.GameAssets.preloadBattle(
      "overlap-mission", [{ art: raceUrl }], []
    );
    assert(capped.includes(raceUrl), "the overlapping preload should respect its overall deadline");
    const firstRetry = window.GameAssets.retryBattle([raceUrl]);
    await new Promise(resolve => realSetTimeout(resolve, 55));
    const overlappingRetry = window.GameAssets.retryBattle([raceUrl]);
    assert(raceImages === 2, "an expired old request must not evict the newer retry promise");
    await Promise.allSettled([firstRetry, overlappingRetry]);
  } finally {
    global.setTimeout = realSetTimeout;
    delete global.window.requestIdleCallback;
  }

  global.Image = FailingImage;
  let skillArtRequests = 0;
  global.UICommon = { skillsOf: unit => unit.skills || [] };
  global.CardArt = { url: () => { skillArtRequests += 1; return "./skill.webp"; } };
  const ally = {
    id: "hero", name: "Hero", face: "H", art: "./hero.webp", avatar: "./hero-avatar.webp",
    skinDamagedArt: "./hero-damaged.webp", skinVictoryArt: "./hero-victory.webp",
    gender: "female", role: "tester", evaluation: "tester", hp: 10,
    stats: { maxHp: 10, attack: 1, magic: 0, speed: 1, bloodlust: 1, handLimit: 5, drawPerTurn: 1 },
    skills: [{ name: "Lazy Skill", type: "active" }],
  };
  const enemy = {
    id: "enemy", name: "Enemy", face: "E", art: "./enemy.webp", type: "boss",
    gender: "male", role: "tester", evaluation: "tester", hp: 10, attack: 1,
    speed: 1, bloodlust: 1, handLimit: 5, drawPerTurn: 1, skills: [],
  };
  const battleFailures = await window.GameAssets.preloadBattle("mission", [ally], [enemy]);
  assert(battleFailures.length === 5, "battle preload should return every failed portrait, damage, and victory URL");
  assert(battleFailures.every(url => window.GameAssets.failed(url)), "failed battle URLs should be tracked for render fallbacks");
  assert(skillArtRequests === 0, "battle preload must leave skill artwork lazy");

  global.GameData = { enemies: { mission: [enemy] }, missions: [{ id: "mission" }], baseDeck: [] };
  global.GameRandom = { shuffle: cards => cards };
  global.RelicSystem = { statsOf: () => ({}), statsForNames: () => ({}) };
  global.SkinSystem = { applyToChar: (_state, char) => char };
  global.BattleStats = { initialize() {} };
  global.AngelicaLukaSkills = { battleStart() {} };
  global.OrcDungeonSkills = { battleStart() {} };
  global.GameBGM = { battleTrack: () => "battle" };
  require("../src/original/battle-setup.js");
  const state = { party: ["hero"], chars: [ally], deck: [], battle: null };
  const setup = window.BattleSetup();
  await setup.create(state, "mission");
  assert(state.battle.assetFailures.length === 5, "battle setup should retain preload failures");
  assert(state.battle.assetCriticalFailures.length === 5, "portrait, damage, and victory failures should be marked critical");
  assert(state.battle.allies[0]._assetFailedUrls.length === 4, "failed ally portraits and variants should activate fallback state");

  global.state = state;
  require("../src/original/ui-common-art.js");
  const art = window.UICommonArt({
    esc: value => String(value), classToken: value => String(value || ""),
    classList: value => String(value || ""), skillSummary: () => "", skillTitle: () => "",
  });
  const fallback = art.artBox(state.battle.allies[0], "unit-art", state.battle.allies[0].avatar, "H");
  assert(fallback.includes("asset-fallback-art"), "failed portraits should render the explicit fallback");
  assert(!fallback.includes("<img"), "failed portraits must not render a broken image element");

  class SuccessImage {
    set decoding(_) {}
    set loading(_) {}
    set src(_) { setTimeout(() => this.onload?.(), 0); }
  }
  global.Image = SuccessImage;
  const retried = await setup.retryAssets(state);
  assert(retried.ok && !state.battle.assetFailures.length, "explicit battle asset retry should clear recovered failures");
  assert(!state.battle.allies[0]._assetFailedUrls, "successful retry should restore normal portrait rendering");

  console.log("GameAssets tests passed");
})().catch(err => {
  console.error(err.message);
  process.exit(1);
});
