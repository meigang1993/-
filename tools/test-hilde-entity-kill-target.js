// 【暗幕隐身】口径严格检查：只有「实体单体【杀】牌」不可指定隐身希尔德，
// 虚拟【杀】/ 技能生成牌 / 群体杀 / 技能伤害不受此限。
// REVERT=entity 把判定源撤回旧口径（所有单体杀都拦），应精准打红。
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const ROOT = path.join(__dirname, "../src/original");
const REVERT = process.env.REVERT || "";
let pass = 0;
const reds = [];
function T(name, cond, extra) {
  if (cond) { pass += 1; return; }
  reds.push(name);
  if (REVERT) console.log(`  RED ${name}`, extra === undefined ? "" : JSON.stringify(extra));
}
function read(file) { return fs.readFileSync(path.join(ROOT, file), "utf8"); }
function patched(file) {
  let s = read(file);
  if (REVERT === "entity" && file === "ruins-elite-skills.js") {
    const before = s;
    s = s.replace(
      "const blocksKillTarget = (unit, card) => entitySingleKill(card) && stealthOn(unit);",
      "const blocksKillTarget = (unit, card) => !!card && !card._skill && stealthOn(unit) && singleKill(card);");
    assert.notStrictEqual(s, before, "REVERT=entity must hit blocksKillTarget");
  }
  return s;
}

function makeWin(opts = {}) {
  const win = {
    GameDataCards: {
      cardCodex: [
        { name: "杀（普攻）", type: "slash", scale: "attack", suit: "♠" },
        { name: "雷杀", type: "slash", scale: "attack", suit: "♠" },
        { name: "机枪扫杀", type: "slash", scale: "attack", sweep: true, suit: "♠" },
      ],
      baseDeck: [], eliteCards: [],
    },
    BattleStatusCards: { isStatus: () => false },
    MieryulaTimeStop: { isSkillDisabled: unit => !!opts.stopped?.has?.(unit.uid) },
    BattleLog: { add: (state, text) => { (state.log ||= []).push(text); } },
    BattleLines: { skill() {} },
    console: { warn() {} },
  };
  const ctx = {
    window: win, Math, Number, Array, Object, Set, Map, JSON, String,
    RegExp, Proxy, console: win.console,
  };
  vm.runInNewContext(read("card-utils.js"), ctx, { filename: "card-utils.js" });
  vm.runInNewContext(patched("ruins-elite-skills.js"), ctx, { filename: "ruins-elite-skills.js" });
  vm.runInNewContext(read("ruins-enemy-skills.js"), ctx, { filename: "ruins-enemy-skills.js" });
  return { win, ctx };
}
function hilde(uid = "h0", extra = {}) {
  return Object.assign({
    uid, name: "内英组杀手希尔德", side: "enemy", ai: "ruins_hilde",
    hp: 100, maxHp: 100, block: 0, hand: [{ name: "黑牌", suit: "♠", type: "slash" }],
    stats: { attack: 26 },
  }, extra);
}
const judge = win => (unit, card) => !!win.RuinsEnemySkills.blocksKillTarget(unit, card);
const entityKill = win => win.CardUtils.cloneEntity("杀（普攻）", { suit: "♠" });
const virtualKill = win => win.CardUtils.fromEntity("杀（普攻）", {
  temporary: true, void: true, generatedBySkill: "测试",
});

// ---------- A：判定源口径 ----------
function testJudge() {
  const { win } = makeWin();
  const j = judge(win), h = hilde();
  T("A1 实体单体【杀】不可指定隐身希尔德", j(h, entityKill(win)) === true);
  T("A2 实体衍生单体杀（雷杀）同样不可指定",
    j(h, win.CardUtils.cloneEntity("雷杀", { suit: "♠" })) === true);
  T("A3 实体转换杀（convertedFrom）仍算实体，不可指定",
    j(h, win.CardUtils.convertAs("杀（普攻）", { name: "杀（普攻）", suit: "♠" })) === true);
  T("A4 虚拟【杀】可正常指定", j(h, virtualKill(win)) === false);
  T("A5 useVirtualKill 产物（只置 virtual）可指定",
    j(h, { name: "咬杀", type: "slash", suit: "♠", virtual: true }) === false);
  T("A6 技能生成的实体样牌不算实体牌，可指定",
    j(h, { name: "杀（普攻）", type: "slash", suit: "♠", generatedBySkill: "红缨连鬼斩" }) === false);
  T("A7 实体群体【杀】不受隐身限制",
    j(h, win.CardUtils.cloneEntity("机枪扫杀", { suit: "♠" })) === false);
  T("A8 技能伤害载荷不受隐身限制",
    j(h, { name: "潜影背刺", type: "skill" }) === false);
  T("A9 技能牌（_skill）杀不受隐身限制（与旧口径一致）",
    j(h, { name: "杀（普攻）", type: "slash", suit: "♠", _skill: true }) === false);
  T("A10 无黑色牌时不隐身，实体杀可指定",
    j(hilde("h1", { hand: [] }), entityKill(win)) === false);
  T("A11 普通敌人实体杀可指定",
    j(hilde("h2", { ai: "ruins_soldier" }), entityKill(win)) === false);
  const stopped = makeWin({ stopped: new Set(["h0"]) });
  T("A12 时停令隐身失效，实体杀也可指定",
    judge(stopped.win)(hilde(), entityKill(stopped.win)) === false);
  T("A13 空牌对象不拦（防御性）", j(h, null) === false && j(h, undefined) === false);
}

// ---------- B：三个入口仍接同一判定源 ----------
function testEntryPoints() {
  const targeting = read("battle-combat-targeting.js");
  const ui = read("ui-battle-targeting.js");
  const relic = read("battle-relic-turns.js");
  const chain = read("chiyo-chain-skills.js");
  T("B1 chooseTarget 仍调用 blocksKillTarget", /blocksKillTarget\?\.\(target, card\)/.test(targeting));
  T("B2 UI 高亮仍调用 blocksKillTarget", /blocksKillTarget\?\.\(unitData, card\)/.test(ui));
  T("B3 妖刀村雨自动斩仍调用 blocksKillTarget", /blocksKillTarget\?\.\(enemy, slash\)/.test(relic));
  T("B4 红缨连鬼斩候选池仍调用统一判定源", /targetable\(unit, probe\)/.test(chain));
  T("B5 判定源实现落在技能内部（不在调用点各写一份）",
    /const entitySingleKill = card =>/.test(patched("ruins-elite-skills.js")));
}

// ---------- C：妖刀村雨自动斩（虚拟杀）----------
function testMuramasa() {
  const { win, ctx } = makeWin();
  const calls = [];
  win.RelicSystem = { hasEquipped: () => true };
  vm.runInNewContext(read("battle-relic-turns.js"), ctx, { filename: "battle-relic-turns.js" });
  const hidden = hilde("e0", { hp: 10 });
  const other = hilde("e1", { hp: 90, ai: "ruins_soldier", hand: [] });
  const actor = { uid: "a0", name: "持有者", side: "ally", hp: 100,
    battleStartRelicCaptions: [], stats: { attack: 10 } };
  const state = { battle: { allies: [actor], enemies: [hidden, other] } };
  const ok = win.BattleRelicTurns.prepare(state, actor,
    (s, u, t) => { calls.push(t.uid); return true; }, () => {});
  T("C1 自动斩正常发动", ok === true && calls.length === 1, calls);
  T("C2 隐身希尔德（血量最低）可被虚拟杀指定，不再被跳过",
    calls[0] === "e0", calls);
  // 只剩隐身目标时也应斩她
  calls.length = 0;
  state.battle.enemies = [hidden];
  const ok2 = win.BattleRelicTurns.prepare(state, actor,
    (s, u, t) => { calls.push(t.uid); return true; }, () => {});
  T("C3 只剩隐身目标时仍斩她", ok2 === true && calls[0] === "e0", calls);
}

// ---------- D：红缨连鬼斩转移目标（虚拟杀）----------
function testChiyoChain() {
  const { win, ctx } = makeWin();
  const calls = [];
  win.BattleSystem = {
    useVirtualKill(st, actor, target, card) {
      calls.push(target.uid);
      target.hp = Math.max(0, target.hp - ((actor.stats?.attack || 0) + (actor.tempAttack || 0)));
      return true;
    },
  };
  vm.runInNewContext(read("chiyo-chain-skills.js"), ctx, { filename: "chiyo-chain-skills.js" });
  const a = { uid: "ch", name: "橘千樱", side: "ally", hp: 100, maxHp: 100,
    stats: { attack: 10 }, hand: [] };
  const e0 = hilde("e0", { hp: 10, ai: "ruins_soldier", hand: [] });
  const hidden = hilde("h0", { hp: 1 });
  const state = { battle: { allies: [a], enemies: [e0, hidden], turn: 9,
    locked: false, ended: false, log: [] }, log: [] };
  win.ChiyoChainSkills.afterCardPlayed(state, a, e0, { _chiyoExtra: 2 });
  T("D1 虚拟杀收割普通目标", e0.hp === 0, { hp: e0.hp });
  T("D2 剩余连击转移到隐身希尔德并命中", calls.includes("h0") && hidden.hp === 0,
    { calls, hp: hidden.hp });
  T("D3 链不残留", state.battle.chiyoChain === undefined);
  T("D4 战报不谎报「已阵亡」", !state.battle.log.some(x => /已无可指定的存活敌方/.test(x)),
    state.battle.log);
}

// ---------- E：文案与公告 ----------
function testTexts() {
  const data = fs.readdirSync(ROOT).filter(f => f.startsWith("data-") && f.endsWith(".js"))
    .map(f => read(f)).join("\n");
  const recent = read("update-notice-recent.js");
  const archive = read("update-notice-archive.js");
  T("E1 技能描述写明「实体单体【杀】牌」",
    /暗幕隐身/.test(data) && /不会成为实体单体【杀】牌的目标/.test(data));
  T("E2 技能描述写明虚拟【杀】不受此限", /虚拟【杀】不受此限/.test(data));
  T("E3 今日公告写明本次口径调整",
    /实体单体【杀】牌的目标；虚拟【杀】不受此限/.test(recent));
  T("E4 历史公告保留原文（不篡改既往记录）",
    /不会成为单体【杀】牌的目标/.test(archive));
  const src = patched("ruins-elite-skills.js");
  T("E5 源码使用 CardUtils.isEntityCard 统一实体口径",
    /CardUtils\?\.isEntityCard\?\.\(card\)/.test(src));
}

testJudge();
testEntryPoints();
testMuramasa();
testChiyoChain();
testTexts();

console.log(`\nRESULT ${pass}/${pass + reds.length} RED=${reds.length} REVERT=${REVERT || "none"}`);
if (reds.length && !REVERT) {
  reds.forEach(r => console.log("  FAILED", r));
  process.exit(1);
}
