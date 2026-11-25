// 复查两件事：① 技能牌能不能删 / 飞牌动画是否还有漏网；② 研究所普通战斗 BGM 在测试战斗里是否生效。
// 数据层判定：_skill 牌是技能结算载体（战报 / 存档 / 飘字都依赖），不能删对象；
// 能删的是全部视觉呈现。本脚本用真实模块 + stub DOM 验证「技能牌不调用 projectile」，
// 并验证测试战斗按所选敌人推断 missionId，让 battleBgm / mission.bgm 落到新 OGG。
// REVERT=<组> 改真实源码后重载，要求对应组精准打红、其它组保持绿。
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const DIR = path.join(ROOT, "src", "original");
const REVERT = process.env.REVERT || "";
const raw = n => fs.readFileSync(path.join(DIR, n), "utf8");

const REPL = {
  flight: ["battle-effect-play.js",
    "    if (isSkillCard(playedSource) || isSkillCard(played)) return commit();\n", ""],
  enemy: ["battle-effect-card-plays.js",
    "    if (!isSkillCard(event.card)) {\n      if (from && targets.length) {\n        await flight.flyPlayAoe(event.card, from, targets, zone, true, event, active);",
    "    if (true) {\n      if (from && targets.length) {\n        await flight.flyPlayAoe(event.card, from, targets, zone, true, event, active);"],
  virtual: ["battle-effect-card-plays.js",
    "    if (!isSkillCard(event.card)) {\n      if (from && targets.length) {\n        await flight.flyPlayAoe(\n          event.card, from, targets, zone, enemyLine, event, active);",
    "    if (true) {\n      if (from && targets.length) {\n        await flight.flyPlayAoe(\n          event.card, from, targets, zone, enemyLine, event, active);"],
  bgm: ["hall-test-actions.js",
    '  const missionId = testBattleMissionId(actionState.testEnemies || []);',
    '  const missionId = "machine_factory";'],
};
const EXPECT = { flight: ["A"], enemy: ["B"], virtual: ["C"], bgm: ["D"] };

const patched = n => {
  let s = raw(n);
  const r = REPL[REVERT];
  if (r && r[0] === n) {
    if (!s.includes(r[1])) throw new Error(`REVERT=${REVERT} 目标未命中: ${r[1].slice(0, 80)}`);
    s = s.replace(r[1], r[2], 1);
  }
  return s;
};
const load = n => vm.runInThisContext(patched(n), { filename: n });

const results = [];
const put = (g, n, ok, d = "") => results.push({ g, n, ok: !!ok, d });

// ---------------- 公共环境 ----------------
global.window = global;
const DOM = () => ({ style: {}, classList: { add() {}, remove() {} }, remove() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 10, height: 10 }) });
global.document = { querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {}, body: { classList: { remove() {}, add() {} } } };
global.performance = { now: () => 0 };
global.requestAnimationFrame = cb => cb(0);
global.Audio = class { constructor() { this.loop = false; this.volume = .42; this.preload = ""; this.paused = true; this.src = ""; } play() { return Promise.resolve(); } pause() {} load() {} removeAttribute() {} addEventListener() {} };
global.BGMWebAudio = { create: () => null };

let frontCalls = 0;
window.CardArt = { isSkill: card => !!card && !card.virtual && !card.convertedFrom && !!(card._skill || card.skillName), url: () => "", fallbackUrl: () => "" };
window.CardUtils = {
  isKillCard: c => c?.type === "slash", isSingleKill: c => c?.type === "slash" && !c.sweep,
  isEntityCard: c => !c?.virtual && !c?._skill, playVerb: () => "使用了",
  clean: (c) => ({ ...c }), copyPlayable: c => ({ ...c }),
};
window.BattleEffectCardDOM = {
  front: () => { frontCalls += 1; const el = DOM(); el.cardArtReady = Promise.resolve(false); return el; },
  ready: async () => false,
};
window.BattleFX = { cardMove() {}, cardLand() {}, unlockAudio() {}, leave() {} };
window.WithererSkills = { displayCard: (_a, c) => c };
window.TenriInstituteSkills = { plannedTarget: () => null };
window.OrcDungeonSkills = { beastSuppressionConverts: () => false };
window.BattleSystem = {
  active: () => ({ uid: "a1", side: "ally", name: "玩家", hand: [NORMAL] }),
  revealPlayed() {}, hidePlayed() {},
};
window.BattleEffectUtils = {
  center: () => ({ x: 0, y: 0 }), selectedCard: () => DOM(), targetArt: () => DOM(),
  actionArt: () => DOM(), effectArt: () => DOM(), publicZone: () => DOM(),
  pileZone: () => DOM(), drawOrigin: () => DOM(), unitEl: () => DOM(), unitArt: () => DOM(),
  handSpot: () => DOM(), setLine() {}, setLines() {}, setComboLines() {}, flashComboPartner() {},
  hideLine() {}, targetOfCard: () => ({ uid: "t1", side: "enemy" }),
  projectile: c => { frontCalls += 1; const el = DOM(); el.cardArtReady = Promise.resolve(false); return el; },
  wait: async () => {}, waitHold: async () => {}, nextFrame: async () => {},
  runAnim: async () => {},
};
window.BattleEffectHandlers = { slashText() {} };
window.GameRandom = { id: () => "id", sample: l => l?.[0], value: () => .5 };

const SKILL = { name: "测试主动技", type: "tactic", _skill: true, skillName: "测试主动技", power: 0 };
const NORMAL = { name: "杀", type: "slash", power: 0, scale: "attack", suit: "♠" };

// ---------------- A：playCard 技能牌不飞 ----------------
(async () => {
  load("battle-effect-play.js");
  const P = window.BattleEffectPlay;

  async function play(card, asSkill) {
    frontCalls = 0;
    let commits = 0;
    const state = {
      battle: {
        selectedCardIndex: asSkill ? null : 0,
        selectedSkillCard: asSkill ? card : null,
        pendingTargetUids: [], pendingTargetUid: null,
        allies: [{ uid: "a1", side: "ally", hp: 100 }],
        enemies: [{ uid: "t1", side: "enemy", hp: 100 }],
        animQueue: [], locked: false,
      },
    };
    const ok = await P.playCard(state, () => { commits += 1; return true; },
      () => {}, () => {}, () => {}, () => true);
    return { front: frontCalls, commits, ok };
  }

  const a1 = await play(SKILL, true);
  put("A", "A1 发动技能不生成飞行牌（projectile 调用 0）", a1.front === 0, `front=${a1.front}`);
  put("A", "A2 技能仍正常 commit 结算（数据链不断）", a1.commits === 1 && a1.ok === true, `commits=${a1.commits} ok=${a1.ok}`);
  const a2 = await play(NORMAL, false);
  put("A", "A3 普通实体牌仍照常飞出（未误伤）", a2.front === 1 && a2.commits === 1, `front=${a2.front} commits=${a2.commits}`);

  // ---------------- B/C：敌方 / 虚拟出牌链也过滤技能牌 ----------------
  let aoeCalls = 0, flyCalls = 0;
  window.BattleEffectPlayedCardFlight = () => ({
    flyPlayAoe: async () => { aoeCalls += 1; }, flyPlay: async () => { flyCalls += 1; },
  });
  load("battle-effect-card-plays.js");
  const CP = window.BattleEffectCardPlays(window.BattleEffectUtils);
  const battle = { allies: [{ uid: "a1", side: "ally", hp: 100 }], enemies: [{ uid: "e1", side: "enemy", hp: 100 }], animQueue: [] };
  const state2 = { battle };
  const reset = () => { aoeCalls = 0; flyCalls = 0; };
  const ev = card => ({ uid: "e1", side: "enemy", targetUid: "a1", card, show: true, hide: false, commit: () => {} });

  reset();
  await CP.enemyPlay(state2, ev(SKILL), () => {}, () => {}, () => true);
  put("B", "B1 enemyPlay 技能牌不飞牌", aoeCalls + flyCalls === 0, `aoe=${aoeCalls} fly=${flyCalls}`);
  reset();
  await CP.enemyPlay(state2, ev({ ...NORMAL, virtual: true }), () => {}, () => {}, () => true);
  put("B", "B2 enemyPlay 普通虚拟杀仍飞牌", aoeCalls + flyCalls === 1, `aoe=${aoeCalls} fly=${flyCalls}`);
  reset();
  await CP.virtualPlay(state2, ev(SKILL), () => {}, () => true);
  put("C", "C1 virtualPlay 技能牌不飞牌", aoeCalls + flyCalls === 0, `aoe=${aoeCalls} fly=${flyCalls}`);
  reset();
  await CP.virtualPlay(state2, ev({ ...NORMAL, virtual: true }), () => {}, () => true);
  put("C", "C2 virtualPlay 普通虚拟杀仍飞牌", aoeCalls + flyCalls === 1, `aoe=${aoeCalls} fly=${flyCalls}`);

  // 数据层不能删：_skill 仍被结算链依赖
  const deps = ["battle-combat.js", "battle-runtime-helpers.js", "battle-combat-trail.js", "card-art.js"];
  put("A", "A4 技能牌数据对象保留（_skill 结算/战报链仍引用，删不得）",
    deps.every(f => raw(f).includes("_skill")) && /isSkill = card =>/.test(raw("card-art.js")));

  // ---------------- D：测试战斗 BGM ----------------
  load("data-tenri-institute-enemies.js");
  load("data-tenri-institute.js");
  const tenri = window.GameDataTenriInstituteEnemies;
  const tenriMission = window.GameDataTenriInstitute.mission;
  const mf = { id: "mf_grunt", name: "机械工厂小怪", type: "normal" };
  window.GameDataWorld = {
    enemies: { machine_factory: [mf], tenri_institute: tenri },
    testEnemies: [mf, ...tenri],
  };
  window.GameData = {
    missions: [tenriMission, { id: "machine_factory", bgm: "./assets/sounds/machine-factory-battle.ogg" }],
    testEnemies: window.GameDataWorld.testEnemies,
    difficulties: { normal: {} }, scaleEnemyStats: e => ({ ...e }),
  };
  load("bgm.js"); // 真实 battleTrack
  put("D", "D1 研究所怪无各自 bgm，靠 mission.bgm 回落到新曲",
    tenri.every(e => !e.bgm) && tenriMission.bgm.includes("tenri-institute-battle"));
  put("D", "D2 battleTrack(tenri_institute, 4 怪) 返回新无缝战斗曲",
    window.GameBGM.battleTrack("tenri_institute", tenri) === tenriMission.bgm,
    window.GameBGM.battleTrack("tenri_institute", tenri));
  put("D", "D3 battleTrack(machine_factory) 仍是机械工厂曲（既有默认不变）",
    window.GameBGM.battleTrack("machine_factory", [mf]) === "./assets/sounds/machine-factory-battle.ogg");
  put("D", "D4 新 BGM 资源文件确实存在",
    fs.existsSync(path.join(ROOT, "publish", tenriMission.bgm.replace("./", ""))));

  // 真实 startTestBattle 捕获 missionId / primeBattle track
  let captured = null, primed = null;
  window.BattleSystem.start = async (_s, missionId) => { captured = missionId; return true; };
  window.GameBGM.primeBattle = track => { primed = track; };
  window.GameBundles = { load: async () => true };
  window.RelicSystem = { normalizeSlots: x => x, enemyRelics: () => [] };
  window.GameBGM.unlock = () => {};
  window.persist = () => {};
  window.render = () => {};
  window.BattleFX.unlockAudio = () => {};
  load("hall-test-actions.js");

  async function runTest(selected) {
    captured = null; primed = null;
    const s = { testEnemies: selected, testAllies: [], testCards: [], testDifficulty: "normal", testEquipment: {}, deck: [], relicCollection: [], resources: { relics: [] }, equipment: {} };
    window.state = s; global.state = s;
    await global.startTestBattle(() => true);
    return { mission: captured, track: primed };
  }
  const d1 = await runTest([1, 2, 3, 4]);
  put("D", "D5 测试战斗选 4 只研究所新怪 → missionId=tenri_institute",
    d1.mission === "tenri_institute", `mission=${d1.mission}`);
  put("D", "D6 primeBattle 预载的是新 OGG（不再是机械工厂曲）",
    d1.track === tenriMission.bgm, `track=${d1.track}`);
  put("D", "D7 battle.missionId 与 battleBgm 同源（battle-setup 会据此设 battleBgm）",
    /battleBgm: battleBgm\(enemies, missionId\)/.test(raw("battle-setup.js"))
    && /window\.GameBGM\?\.battleTrack\?\.\(missionId, enemies\)/.test(raw("hall-test-actions.js")));
  const d2 = await runTest([0, 1]);
  put("D", "D8 混合选择（机械工厂 + 研究所）退回既有 machine_factory",
    d2.mission === "machine_factory", `mission=${d2.mission}`);
  const d3 = await runTest([]);
  put("D", "D9 未选敌人仍退回既有 machine_factory",
    d3.mission === "machine_factory", `mission=${d3.mission}`);

  // 源码级：三条视觉链的同源判据与既有出牌区过滤一致
  put("B", "B3 三处过滤都用 CardArt.isSkill 单一判据（与出牌区同源）",
    ["battle-effect-play.js", "battle-effect-card-plays.js"].every(f => (patched(f).match(/CardArt\?\.isSkill/g) || []).length >= 1)
    && /isSkillCard\(card\)/.test(raw("ui-battle-trail.js")));
  put("D", "D10 测试战斗不再写死 machine_factory（两处调用均用推断值）",
    !/battleTrack\?\.\("machine_factory"/.test(patched("hall-test-actions.js"))
    && !/BattleSystem\.start\(actionState, "machine_factory"/.test(patched("hall-test-actions.js")));

  const failed = results.filter(r => !r.ok);
  if (REVERT) {
    const want = EXPECT[REVERT] || [];
    const own = failed.filter(r => want.includes(r.g)).length;
    const other = failed.filter(r => !want.includes(r.g)).length;
    console.log(`REVERT=${REVERT} ${own > 0 && other === 0 ? "OK" : "IMPRECISE"} own=${own} other=${other}`);
    failed.forEach(r => console.log(`  ❌ ${r.g} ${r.n} ${r.d}`));
    process.exit(own > 0 && other === 0 ? 0 : 1);
  }
  results.forEach(r => console.log(`  ${r.ok ? "✅" : "❌"} ${r.g} ${r.n}${r.d ? " — " + r.d : ""}`));
  console.log(`RESULT ${results.length - failed.length}/${results.length} · 反向组 ${Object.keys(REPL).join("/")}`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error("CHECK_FAIL", e.stack); process.exit(1); });
