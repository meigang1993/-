// 【红缨连鬼斩】/【飘浮掩体】调整后严格检查：存档残留、恢复路径、阵营、公告日期。
// REVERT=store|turnguard|resume|side|notice 为源码级反向验证，撤掉对应修复后应精准打红。
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
function lines(file) { return read(file).split("\n").length; }
function patched(file) {
  let s = read(file);
  const hit = (before, after, tag) => {
    assert.notStrictEqual(after, before, `REVERT=${REVERT} must hit ${tag}`);
    return after;
  };
  if (REVERT === "store") {
    if (file === "store-compact.js") return hit(s,
      s.replace(/\n\s*\/\/ 【红缨连鬼斩】挂起的虚拟杀链[^\n]*\n\s*"chiyoChain",/, ""),
      "transientStateKeys");
    if (file === "battle-save-checkpoint-validation.js") return hit(s,
      s.replace(/\n\s*"chiyoChain",/, ""), "blockingKeys");
  }
  if (REVERT === "turnguard" && file === "chiyo-chain-skills.js") return hit(s,
    s.replace(/    \/\/ 链只在挂起[\s\S]*?    run\(state, chain\);/, "    run(state, chain);"),
    "resume turn guard");
  if (REVERT === "resume" && file === "battle-manual-continuation.js") {
    const needle = "    // 挂起不一定来自玩家手动响应（交牌、泡泡、锤子等也走中断恢复），\n"
      + "    // 统一在这里补跑【红缨连鬼斩】剩余链；resume 自带回合守卫，重复调用幂等。\n"
      + "    window.ChiyoChainSkills?.resume?.(state);\n";
    return hit(s, s.replace(needle, ""), "continuation resume");
  }
  if (REVERT === "side" && file === "wendy-skills.js") return hit(s,
    s.replace('const team = (unit.side === "enemy" ? battle.enemies : battle.allies) || [];',
      "const team = (battle.allies || []);"), "side-aware team");
  if (REVERT === "notice") {
    if (file === "update-notice.js") return hit(s,
      s.replace('iso: "2026-11-13", label: "2026年11月13日", badge: "2026.11.13"',
        'iso: "2026-11-10", label: "2026年11月10日", badge: "2026.11.10"'), "latest date");
    if (file === "update-notice-recent.js") return hit(s,
      s.replace('title: "2026年11月13日 · 今日更新"', 'title: "2026年11月10日 · 今日更新"'),
      "first section title");
  }
  return s;
}

function makeWin() {
  const win = {};
  win.BattleLog = { add: (state, text) => (state.log ||= []).push(text) };
  win.BattleLines = { skill: (state, unit, name, target) => (state.lines ||= []).push({ unit, name, target }) };
  win.BattleHpValue = { clean: value => Math.round(value * 100) / 100 };
  win.WendyTeacherSkinFX = { cover() {} };
  win.CardUtils = { fromEntity: (name, extra) => Object.assign({ name, type: "slash", scale: "attack", suit: "" }, extra) };
  return win;
}
function load(win, file) {
  const ctx = { window: win, Math, Number, Array, Object, Set, Map, JSON, String, RegExp, console };
  vm.runInNewContext(patched(file), ctx, { filename: file });
}
function unit(uid, side, hp, extra = {}) {
  return Object.assign({ uid, name: uid, side, hp, maxHp: hp, hand: [], block: 0 }, extra);
}
function state(allies, enemies, turn = 7) {
  const log = [], battleLog = [], lines = [];
  return { battle: { allies, enemies, turn, log, battleLog, lines }, log, battleLog, lines };
}

// ---------- A：连击链不得跨存档 / 跨回合残留 ----------
function testChainStore() {
  T("A1 存档瞬时态清单含 chiyoChain",
    /transientStateKeys[\s\S]{0,3000}"chiyoChain"/.test(patched("store-compact.js")));
  T("A2 稳定存档点阻塞键含 chiyoChain",
    /blockingKeys[\s\S]{0,2000}"chiyoChain"/.test(patched("battle-save-checkpoint-validation.js")));
  const win = {};
  const ctx = { window: win, Math, Number, Array, Object, Set, JSON, String, RegExp, console };
  vm.runInNewContext(patched("store-compact.js"), ctx, { filename: "store-compact.js" });
  const battle = {
    turn: 7, chiyoChain: { remaining: 2, turn: 7, actorUid: "ch", side: "ally" },
    animQueue: [{ type: "float" }], shownPlayed: [], played: [], discardPick: { indexes: [1] },
  };
  win.GameStoreCompact.stripBattleTransientCards(battle);
  T("A3 压缩路径真清掉链且不误伤其它瞬时态",
    battle.chiyoChain === undefined && battle.animQueue.length === 0
    && battle.discardPick === undefined, battle);
  T("A4 主快照路径复用同一清理函数",
    /stripBattleTransientCards\(battle\)/.test(read("store-main-snapshot.js")));
}

function makeChain(win, opts = {}) {
  const calls = [];
  win.BattleSystem = {
    useVirtualKill(st, actor, target, card) {
      calls.push({ actorUid: actor.uid, targetUid: target.uid, card });
      if (opts.lockAfter && calls.length === opts.lockAfter) st.battle.locked = true;
      return true;
    },
  };
  load(win, "chiyo-chain-skills.js");
  return { calls, api: win.ChiyoChainSkills };
}

function testChainResume() {
  {
    const win = makeWin();
    const { calls, api } = makeChain(win, { lockAfter: 1 });
    const a = unit("ch", "ally", 100), e0 = unit("e0", "enemy", 100), e1 = unit("e1", "enemy", 100);
    const st = state([a], [e0, e1]);
    api.afterCardPlayed(st, a, e0, { _chiyoExtra: 3 });
    T("A9 同回合挂起的链带回合号",
      calls.length === 1 && st.battle.chiyoChain?.remaining === 2
      && st.battle.chiyoChain?.turn === 7, st.battle.chiyoChain);
    st.battle.locked = false;
    api.resume(st);
    T("A9b 同回合恢复补完剩余虚拟杀",
      calls.length === 3 && st.battle.chiyoChain === undefined, calls.map(c => c.targetUid));
  }
  {
    const win = makeWin();
    const { calls, api } = makeChain(win, { lockAfter: 1 });
    const a = unit("ch", "ally", 100), e0 = unit("e0", "enemy", 100);
    const st = state([a], [e0]);
    api.afterCardPlayed(st, a, e0, { _chiyoExtra: 3 });
    st.battle.locked = false; st.battle.turn = 8;
    api.resume(st);
    T("A5 跨回合旧链作废且不补跑",
      calls.length === 1 && st.battle.chiyoChain === undefined, calls.length);
  }
  {
    const win = makeWin();
    const { calls, api } = makeChain(win, { lockAfter: 1 });
    const a = unit("ch", "ally", 100), e0 = unit("e0", "enemy", 100);
    const st = state([a], [e0]);
    api.afterCardPlayed(st, a, e0, { _chiyoExtra: 3 });
    st.battle.locked = false; st.battle.ended = true;
    api.resume(st);
    T("A6 战斗结束后不补跑并清链",
      calls.length === 1 && st.battle.chiyoChain === undefined, calls.length);
  }
  {
    const win = makeWin();
    const { calls, api } = makeChain(win, { lockAfter: 1 });
    const a = unit("ch", "ally", 100), e0 = unit("e0", "enemy", 100);
    const st = state([a], [e0]);
    api.afterCardPlayed(st, a, e0, { _chiyoExtra: 3 });
    st.battle.locked = false; a.hp = 0;
    api.resume(st);
    T("A7 出牌者阵亡后不补跑并清链",
      calls.length === 1 && st.battle.chiyoChain === undefined, calls.length);
  }
  T("A8 两条恢复路径都调用 resume",
    (patched("battle-manual-continuation.js").match(/ChiyoChainSkills\?\.resume\?\.\(state\)/g) || []).length >= 2);
}

// ---------- B：飘浮掩体阵营与魔力口径 ----------
function makeWendy(win) {
  load(win, "wendy-skills.js");
  const floats = [];
  return { api: win.WendySkills, deps: { pushFloat: (b, uid, kind, gain) => floats.push({ uid, gain }) }, floats };
}
function testWendy() {
  {
    const win = makeWin();
    const { api, deps } = makeWendy(win);
    const w = unit("w", "enemy", 100, { ref: "wendy", stats: { magic: 5 } });
    const e1 = unit("e1", "enemy", 100), a0 = unit("a0", "ally", 100);
    const st = state([a0], [w, e1]);
    api.floatingCover(st, w, deps);
    T("B1 敌方持有者只给同阵营加甲，不给玩家加甲",
      w.block === 5 && e1.block === 5 && a0.block === 0,
      { w: w.block, e1: e1.block, a0: a0.block });
  }
  {
    const win = makeWin();
    const { api, deps, floats } = makeWendy(win);
    const w = unit("w", "ally", 100, { ref: "wendy", stats: { magic: 4.8 }, tempMagic: 2 });
    const cad = unit("c", "ally", 100, { ref: "cadicis" });
    const dead = unit("d", "ally", 0);
    const st = state([w, cad, dead], [unit("e", "enemy", 100)]);
    api.floatingCover(st, w, deps);
    T("B2 我方正常结算：魔力收敛、卡迪西斯 2 倍、阵亡不给甲",
      w.block === 7 && cad.block === 14 && dead.block === 0,
      { w: w.block, cad: cad.block, dead: dead.block });
    T("B3 飘字按各自实得护甲", floats.length === 2
      && floats.some(x => x.uid === "c" && x.gain === 14));
    const before = w.block;
    api.floatingCover(st, w, deps);
    T("B4 同回合重复进入不重复加甲", w.block === before);
    st.battle.turn = 8;
    api.floatingCover(st, w, deps);
    T("B5 换回合后重新触发（幂等标记按回合号）", w.block === before + 7, w.block);
  }
  {
    const win = makeWin();
    const { api, deps } = makeWendy(win);
    const w = unit("w", "ally", 100, { ref: "wendy", stats: { magic: 9.6 } });
    const st = state([w], []);
    api.floatingCover(st, w, deps);
    T("B6 小数魔力按项目同一口径收敛为整数", w.block === 10, w.block);
  }
}

// ---------- C：公告日期与技能条目 ----------
function testNotice() {
  const main = patched("update-notice.js");
  const recent = patched("update-notice-recent.js");
  const archive = read("update-notice-archive.js");
  T("C1 最新日期为 2026-11-13（iso / label / badge 三处一致）",
    /iso: "2026-11-13"/.test(main) && /label: "2026年11月13日"/.test(main)
    && /badge: "2026\.11\.13"/.test(main));
  const firstTitle = recent.indexOf('title: "2026年11月13日 · 今日更新"');
  const oldTitle = recent.indexOf('title: "2026年11月10日 · 今日更新"');
  T("C2 首期标题为今天且排在 11月10 历史期之前",
    firstTitle >= 0 && oldTitle > firstTitle, { firstTitle, oldTitle });
  const firstItems = recent.slice(firstTitle, oldTitle);
  T("C3 首期写进两个技能调整与用户原文关键句",
    firstItems.includes("技能调整【红缨连鬼斩】")
    && firstItems.includes("技能调整【飘浮掩体】")
    && firstItems.includes("剩余未使用的连击次数可指定另一名敌方角色为目标")
    && firstItems.includes("卡迪西斯获得 2 倍护甲值")
    && firstItems.includes("让你们见识一下我的绝技。")
    && firstItems.includes("妈妈的魔法会保护好你的"));
  T("C4 summary 含技能调整且保留既有诺亚口径",
    main.includes("红缨连鬼斩") && main.includes("飘浮掩体")
    && main.includes("淫气改造者") && main.includes("【淫气改造】"));
  T("C5 行数未触发归档阈值且期数注释同步",
    lines("update-notice-recent.js") <= 150 && lines("update-notice-archive.js") <= 189
    && recent.includes("2026年10月11日 ~ 11月13日十三期"),
    { recent: lines("update-notice-recent.js"), archive: lines("update-notice-archive.js") });
  T("C6 10月10 期已按规则归档，历史期仍在",
    archive.includes('title: "2026年10月10日 · 今日更新"')
    && !recent.includes('title: "2026年10月10日 · 今日更新"')
    && archive.includes("2026年10月10日及更早"));
  const c = { console }; c.window = c; vm.createContext(c);
  ["update-notice-recent.js", "update-notice-archive.js", "update-notice-rules.js"]
    .forEach(f => vm.runInContext(read(f), c, { filename: f }));
  vm.runInContext(main, c, { filename: "update-notice.js" });
  const html = c.UpdateNotice.render();
  T("C7 三个数据文件装配后公告可渲染且含两技能",
    (html.match(/update-notice-section/g) || []).length >= 3
    && html.includes("红缨连鬼斩") && html.includes("飘浮掩体")
    && html.includes('datetime="2026-11-13"'));
}

// ---------- D：描述与台词防回归 ----------
function testTextSync() {
  const playable = read("data-future-characters.js");
  const elite = read("data-machine-factory-enemies.js");
  const core = read("data-characters-core.js");
  const lineData = read("battle-line-data.js");
  T("D1 橘千樱可玩角色与精英怪描述同步为用户原文",
    playable.includes("剩余未使用的连击次数可指定另一名敌方角色为目标")
    && elite.includes("剩余未使用的连击次数可指定另一名敌方角色为目标"));
  T("D2 温蒂描述为魔力值口径且旧弃牌口径清零",
    core.includes("我方全体角色获得等同于你魔力值的护甲值")
    && !core.includes("每弃置1张手牌"));
  T("D3 台词两处仍为原文（含卡迪西斯分支）",
    (lineData.match(/让你们见识一下我的绝技。/g) || []).length === 2
    && lineData.includes("妈妈的魔法会保护好你的，孩子来妈妈怀里吧。"));
}

function main() {
  testChainStore();
  testChainResume();
  testWendy();
  testNotice();
  testTextSync();
  console.log(`RESULT ${pass}/${pass + reds.length} RED=${reds.length}`,
    REVERT ? `REVERT=${REVERT}` : "none");
  if (REVERT) {
    console.log(reds.length
      ? `REVERT_OK ${REVERT}: ${reds.length} targeted red(s)`
      : `REVERT_FAIL ${REVERT}: no red`);
    process.exitCode = reds.length ? 1 : 2;
  } else if (reds.length) {
    reds.forEach(name => console.log("  FAILED", name));
    process.exitCode = 1;
  }
}
main();
