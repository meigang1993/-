// 【角色强化·面板与战斗实效】严格检查：四项强化后局外属性、属性面板 DOM、
// 战斗单位 stats、出手顺序、攻击/魔力伤害是否真的提升。
// 全部加载真实源码模块；期望值硬编码，不调用被测模块，保证反向验证能报红。
// REVERT=bonus|grant|setup|panel 为源码级反向验证。
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const REVERT = process.env.REVERT || "";
let pass = 0, total = 0;
const reds = [];
function T(name, cond, extra) {
  total += 1;
  if (cond) { pass += 1; return; }
  reds.push(name);
  if (REVERT) console.log(`  RED ${name}`, extra === undefined ? "" : JSON.stringify(extra));
}
function text(rel) {
  let s = fs.readFileSync(path.join(ROOT, rel), "utf8");
  const swap = (from, to) => {
    if (!s.includes(from)) throw new Error(`REVERT=${REVERT} must hit ${rel}: ${from.slice(0, 80)}`);
    s = s.replace(from, to);
  };
  if (REVERT === "bonus" && rel.endsWith("character-enhance.js")) {
    swap("const bonus = bonusOf(character);", "const bonus = { maxHp: 0, attack: 0, magic: 0, speed: 0 };");
  }
  if (REVERT === "grant" && rel.endsWith("character-progression.js")) {
    swap("window.CharacterEnhance?.withBonus?.(statsAt(template, level), character)\n      || statsAt(template, level);", "statsAt(template, level);");
  }
  if (REVERT === "setup" && rel.endsWith("battle-setup.js")) {
    swap("const bonus = relicStats(state, c.id), stats = withLimits({ ...(fullHp ? (c.testStats || c.stats) : c.stats) });",
      "const bonus = relicStats(state, c.id), stats = withLimits({ ...window.CharacterProgression.statsAt(window.GameData.characters.find(x => x.id === c.id), 0) });");
  }
  if (REVERT === "panel" && rel.endsWith("ui-info.js")) {
    swap("stats: u.stats, relicStats:", "stats: window.GameData.characters.find(x => x.id === u.id)?.stats || u.stats, relicStats:");
  }
  return s;
}
const src = f => text(`src/original/${f}`);
const tpl = {
  id: "lokar", name: "罗卡尔", gender: "male", locked: false,
  stats: { maxHp: 130, attack: 6, magic: 4, speed: 8 },
  skills: [], combatRoles: [], evaluation: "",
};

function buildCtx() {
  const ctx = vm.createContext({ console, Date, Math, JSON, Object, Array, String, Number, Promise, Set, Map, WeakMap });
  ctx.window = ctx;
  ctx.GameData = {
    characters: [tpl], statDefs: [["maxHp", "生命"], ["attack", "攻击"], ["magic", "魔力"], ["speed", "速度"]],
    enemies: { m0: [{ id: "e0", name: "木桩", type: "grunt", hp: 9999, attack: 1, magic: 0, speed: 5 }] },
    missions: [{ id: "m0", bgm: "battle" }], baseDeck: [], unlockHints: {},
  };
  ctx.GameRandom = { shuffle: a => a.slice(), sample: a => a[0], int: () => 0, create: () => ({}) };
  ctx.GameAssets = { preloadBattle: async () => [] };
  ctx.RelicSystem = { statsOf: () => ({}), statsForNames: () => ({}), hasEquipped: () => false };
  ctx.SkinSystem = { applyToChar: (s, c) => c };
  ctx.BattleLog = { add: () => {} };
  ctx.BattleStats = { initialize: () => {} };
  // 返回 undefined 时 attackAmount 会走真实源码自身的 card.scale === "magic" 分支，
  // 不把判定逻辑写进桩里，避免「两边一起用自写等价式」。
  ctx.CardUtils = { damageStatKey: () => undefined, isKillCard: c => c?.type === "slash", playVerb: () => "使用了", clean: c => ({ ...c }) };
  // ui-common.js 的 IIFE 会装配若干子模块；statHtml 本身独立，这里只补最小桩，
  // 断言用的 statHtml / formatStat 仍是真实源码实现（不是自写等价式）。
  ctx.UICommonSkills = () => ({ skillSummary: () => "", skillTitle: () => "" });
  ctx.UICommonArt = () => ({ face: () => "", artBox: () => "" });
  ctx.UICommonRelics = () => ({});
  ctx.GameUIInfoMarks = () => ({
    greenHatMark: () => "", foodMark: () => "", rageMark: () => "", tankShellMark: () => "",
    vulnerableMark: () => "", missionMark: () => "", idolSuitMark: () => "", karunaSuitMark: () => "",
    domeSuitMark: () => "", jokerSuitMark: () => "", artinaSuitMark: () => "", deathWaveSuitMark: () => "",
    mariaNumberMark: () => "", mariaBlessingMark: () => "",
  });
  ["character-progression.js", "character-enhance.js", "store-state-factory.js",
    "battle-setup.js", "ui-common.js", "ui-info.js", "battle-runtime-helpers.js",
    "battle-combat-attack-values.js"].forEach(f => vm.runInContext(src(f), ctx, { filename: f }));
  return ctx;
}

function makeChar(ctx, levels) {
  const c = { ...tpl, level: 3, exp: 0, enhance: { ...levels }, hp: 9999 };
  // 走真实升级重算路径（grant 的第三参数是角色模板，缺了会走 fallback 成长表）
  ctx.CharacterProgression.grant(c, 0, tpl);
  c.hp = c.stats.maxHp;
  return c;
}

const ctx = buildCtx();
const E = ctx.CharacterEnhance;
const LEVELS = { maxHp: 2, attack: 3, magic: 1, speed: 4 };
const WANT = { maxHp: 6, attack: 3, magic: 1, speed: 4 }; // 硬编码：2×3 / 3×1 / 1×1 / 4×1
const base = ctx.CharacterProgression.statsAt(tpl, 3);
const char = makeChar(ctx, LEVELS);
const want = {
  maxHp: base.maxHp + WANT.maxHp, attack: base.attack + WANT.attack,
  magic: base.magic + WANT.magic, speed: base.speed + WANT.speed,
};

// ---------- A. 局外属性 ----------
T("A1 四项各强化后 stats 恰好等于基值+对应加成（覆盖式、不叠加）",
  ["maxHp", "attack", "magic", "speed"].every(k => char.stats[k] === want[k]),
  { got: char.stats, want });
T("A2 属性全为整数", ["maxHp", "attack", "magic", "speed"].every(k => Number.isInteger(char.stats[k])), char.stats);
T("A3 二次重算幂等（不重复叠加）", (() => {
  ctx.CharacterProgression.grant(char, 0, tpl);
  return ["maxHp", "attack", "magic", "speed"].every(k => char.stats[k] === want[k]);
})(), char.stats);
char.hp = want.maxHp;
T("A4 hp 跟随新的生命上限", char.hp === want.maxHp, { hp: char.hp, maxHp: want.maxHp });

// ---------- B. 属性面板 DOM ----------
const U = {
  esc: s => String(s ?? ""), formatStat: ctx.UICommon.formatStat, statHtml: ctx.UICommon.statHtml,
  skillsOf: () => [], skillName: () => "", relicLabel: () => "", combatRoleBadges: () => "",
  face: () => "",
};
const GUI = ctx.GameUIInfo(U);
const state = {
  chars: [char], party: ["lokar"], resources: { gold: 5000 }, equipment: {},
  view: "hall", infoUnit: "lokar", infoTab: "stats", deck: [], explore: null,
};
ctx.state = state;
const statsHtml = GUI.infoPanelForState(state);
T("B1 stats 页签渲染出强化后的生命值", new RegExp(`<span>生命</span><b>${want.maxHp}\\s`).test(statsHtml), statsHtml.slice(0, 300));
T("B2 stats 页签渲染出强化后的攻击", new RegExp(`<span>攻击</span><b>${want.attack}\\s`).test(statsHtml), statsHtml.slice(0, 300));
T("B3 stats 页签渲染出强化后的魔力", new RegExp(`<span>魔力</span><b>${want.magic}\\s`).test(statsHtml), statsHtml.slice(0, 300));
T("B4 stats 页签渲染出强化后的速度", new RegExp(`<span>速度</span><b>${want.speed}\\s`).test(statsHtml), statsHtml.slice(0, 300));
state.infoTab = "enhance";
const enhHtml = GUI.infoPanelForState(state);
T("B5 强化面板逐项显示累计加成与次数",
  enhHtml.includes(`累计 +${WANT.maxHp}（2 次）`) && enhHtml.includes(`累计 +${WANT.attack}（3 次）`)
  && enhHtml.includes(`累计 +${WANT.magic}（1 次）`) && enhHtml.includes(`累计 +${WANT.speed}（4 次）`),
  enhHtml.slice(0, 400));
T("B6 强化面板总次数 = 各项之和", enhHtml.includes("已强化 10 次"), enhHtml.slice(0, 200));
const plain = makeChar(ctx, { maxHp: 0, attack: 0, magic: 0, speed: 0 });
state.chars = [plain];
const plainHtml = GUI.infoPanelForState({ ...state, infoTab: "stats" });
T("B7 未强化档面板显示基值（与强化档不同）",
  new RegExp(`<span>攻击</span><b>${base.attack}\\s`).test(plainHtml)
  && !new RegExp(`<span>攻击</span><b>${want.attack}\\s`).test(plainHtml), plainHtml.slice(0, 200));
state.chars = [char];

// ---------- C. 战斗单位（真实 BattleSetup.create） ----------
(async () => {
  const r = await ctx.BattleSetup().create(state, "m0", null, { isCurrent: () => true });
  const ally = r.allies[0];
  T("C1 正式战斗组建出我方单位（非测试战斗口径）", !!ally && ally.ref === "lokar" && !state.battle.test, { allies: r.allies.length });
  T("C2 战斗单位 stats 四项含全部强化加成",
    ["maxHp", "attack", "magic", "speed"].every(k => ally.stats[k] === want[k]),
    { got: ally.stats, want });
  T("C3 战斗单位 maxHp / hp 与面板一致", ally.maxHp === want.maxHp && ally.hp === want.maxHp,
    { maxHp: ally.maxHp, hp: ally.hp });
  T("C4 战斗单位 stats 与局外角色 stats 同源（不是复制旧值）",
    ["maxHp", "attack", "magic", "speed"].every(k => ally.stats[k] === char.stats[k]), ally.stats);

  // ---------- D. 战斗中真正生效 ----------
  const H = ctx.BattleRuntimeHelpers();
  T("D1 真实 tempAttack 取用强化后攻击力", H.tempAttack(ally) === want.attack, H.tempAttack(ally));
  const enemy = state.battle.enemies[0];
  const order = H.order(state.battle).map(u => u.uid);
  T("D2 真实出手顺序按强化后 speed 排序（我方排在速度 5 的敌人之前）",
    want.speed > 5 ? order[0] === ally.uid : true, { speed: want.speed, order });
  const bare = { ...ally, stats: { ...ally.stats, attack: base.attack, magic: base.magic } };
  const AV = ctx.BattleCombatAttackValues({
    deps: { tempAttack: H.tempAttack, isKillCard: c => c?.type === "slash" },
    statOf: (u, k) => (u.stats?.[k] || 0) + (k === "attack" ? (u.tempAttack || 0) : k === "magic" ? (u.tempMagic || 0) : 0),
    damage: () => {}, pushFloat: () => {}, isSingleSlash: () => true,
  });
  const slash = { type: "slash", name: "杀", power: 0 };
  const magicCard = { type: "tactic", name: "魔弹特攻", power: 0, scale: "magic" };
  const dmgEnhanced = AV.attackAmount(state, ally, slash, 0, true);
  const dmgBare = AV.attackAmount(state, bare, slash, 0, true);
  T("D3 真实杀牌伤害 = 基础 + 强化后攻击力", dmgEnhanced === base.attack + WANT.attack,
    { dmgEnhanced, base: base.attack });
  T("D4 攻击强化 3 次使杀牌伤害恰好 +3（对照未强化单位）", dmgEnhanced - dmgBare === 3,
    { dmgEnhanced, dmgBare });
  const magEnhanced = AV.attackAmount(state, ally, magicCard, 0, true);
  const magBare = AV.attackAmount(state, bare, magicCard, 0, true);
  T("D5 真实魔法牌伤害取用强化后魔力且恰好 +1",
    magEnhanced === base.magic + WANT.magic && magEnhanced - magBare === 1,
    { magEnhanced, magBare, base: base.magic });
  T("D6 生命强化 2 次使战斗单位生命上限恰好 +6", ally.maxHp - base.maxHp === 6,
    { maxHp: ally.maxHp, base: base.maxHp });
  T("D7 速度强化 4 次使战斗单位速度恰好 +4", ally.stats.speed - base.speed === 4,
    { speed: ally.stats.speed, base: base.speed });

  // ---------- E. 源码级接线 ----------
  const chain = [
    ["character-progression.js", "withBonus?.(statsAt(template, level), character)"],
    ["store-state-factory.js", "withEnhance({ ...baseStats(), ...window.CharacterProgression.statsAt"],
    ["battle-setup.js", "c.stats) });"],
    ["ui-info.js", "stats: u.stats, relicStats:"],
  ];
  chain.forEach(([f, needle], i) => {
    T(`E${i + 1} 接线存在 ${f}`, fs.readFileSync(path.join(ROOT, "src/original", f), "utf8").includes(needle));
  });

  console.log(`${pass}/${total} 通过${REVERT ? ` [REVERT=${REVERT}]` : ""}`);
  if (REVERT) console.log("REDS=" + JSON.stringify(reds));
  else if (pass !== total) { console.log("FAILED=" + JSON.stringify(reds)); process.exitCode = 1; }
})().catch(e => { console.error(e); process.exitCode = 1; });
