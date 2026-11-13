// 【红缨连鬼斩】234 个低血量目标收割压力测试 + 新隐身口径 + 飘浮掩体复查。
// 作弊口径：直接给足 _chiyoExtra（跳过随机判定与动画队列），虚拟杀用桩真实扣血，
// 专门压「目标阵亡 → 转移 → 再转移」这条链在极端规模下的守恒、终止与边界。
// 隐身判定加载真实 RuinsEliteSkills / RuinsEnemySkills，不用自写等价式。
// 新口径：暗幕隐身只挡「实体单体【杀】」，虚拟杀（本连击链 / 妖刀村雨）不受限，
// 故 234 个目标（含 3 个隐身希尔德）全部应被收割。
// REVERT=entity 把判定源撤回旧口径（所有单体杀都拦），应精准打红。
// REVERT=stealth|reason|empty 分别撤掉判定源守卫 / 转移文案 / 终止文案。
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
function hit(before, after, tag) {
  assert.notStrictEqual(after, before, `REVERT=${REVERT} must hit ${tag}`);
  return after;
}
function patched(file) {
  let s = read(file);
  if (REVERT === "entity" && file === "ruins-elite-skills.js") {
    s = hit(s, s.replace(
      "const blocksKillTarget = (unit, card) => entitySingleKill(card) && stealthOn(unit);",
      "const blocksKillTarget = (unit, card) => !!card && !card._skill && stealthOn(unit) && singleKill(card);"),
      "entity-only judgement");
  }
  if (REVERT === "stealth" && file === "chiyo-chain-skills.js") {
    s = hit(s, s.replace(".filter(alive).filter(unit => targetable(unit, probe))",
      ".filter(alive)"), "foesOf filter");
    s = hit(s, s.replace(
      "if (!alive(actor) || !alive(target) || !targetable(target, probe)) return false;",
      "if (!alive(actor) || !alive(target)) return false;"), "useVirtual guard");
  }
  if (REVERT === "reason" && file === "chiyo-chain-skills.js") {
    s = hit(s, s.replace("const reason = alive(previous)", "const reason = false"),
      "transfer reason");
  }
  if (REVERT === "empty" && file === "chiyo-chain-skills.js") {
    s = hit(s, s.replace("红缨连鬼斩已无可指定的存活敌方", "红缨连鬼斩已无存活敌方"),
      "empty text");
  }
  return s;
}

function makeWin(opts = {}) {
  const win = {};
  const calls = [];
  win.BattleLog = { add: (state, text) => { (state.log ||= []).push(text); } };
  win.BattleLines = { skill() {} };
  win.BattleHpValue = { clean: v => Math.round(v * 100) / 100 };
  win.WendyTeacherSkinFX = { cover() {} };
  win.CardUtils = {
    cloneEntity: (name, extra) => Object.assign(
      { name, type: "slash", scale: "attack", suit: "" }, extra),
    // 真实 fromEntity 默认带 virtual:true；虚拟杀不受暗幕隐身限制。
    fromEntity: (name, extra) => Object.assign(
      { name, type: "slash", scale: "attack", suit: "", virtual: true }, extra),
    isKillCard: card => card?.type === "slash" || /杀/.test(card?.name || ""),
    isSingleKill: card => !card?.sweep && !card?.allTargets && !card?.aoeLineShown,
    isEntityCard: card => !!card && card?.type !== "skill"
      && !card.generatedBySkill && !card.virtual
      && (!card._skill || !!card._entityConversion),
  };
  win.MieryulaTimeStop = { isSkillDisabled: unit => !!opts.stopped?.has?.(unit.uid) };
  win.GameData = { cardCodex: [] };
  const ctx = {
    window: win, Math, Number, Array, Object, Set, Map, JSON, String,
    RegExp, Proxy, console, GameData: win.GameData,
  };
  vm.runInNewContext(patched("ruins-elite-skills.js"), ctx, { filename: "ruins-elite-skills.js" });
  vm.runInNewContext(read("ruins-enemy-skills.js"), ctx, { filename: "ruins-enemy-skills.js" });
  // 作弊场景：让判定源在第 N 次调用后翻转，验证 useVirtual 的二次校验不是摆设。
  if (opts.flipAfter != null) {
    const real = win.RuinsEnemySkills.blocksKillTarget;
    let n = 0;
    win.RuinsEnemySkills.blocksKillTarget = (unit, card) => {
      n += 1;
      return n >= opts.flipAfter ? true : real(unit, card);
    };
  }
  win.BattleSystem = {
    useVirtualKill(st, actor, target, card) {
      calls.push({ actorUid: actor.uid, targetUid: target.uid, card });
      const dmg = (actor.stats?.attack || 0) + (actor.tempAttack || 0);
      target.hp = Math.max(0, target.hp - dmg);
      if (opts.lockEvery && calls.length % opts.lockEvery === 0) st.battle.locked = true;
      return true;
    },
  };
  vm.runInNewContext(patched("chiyo-chain-skills.js"), ctx, { filename: "chiyo-chain-skills.js" });
  return { win, ctx, calls, api: win.ChiyoChainSkills };
}

function unit(uid, side, hp, extra = {}) {
  return Object.assign({
    uid, name: uid, side, hp, maxHp: 100, block: 0, hand: [],
    stats: { attack: 10 },
  }, extra);
}
function hilde(uid, hp, extra = {}) {
  return unit(uid, "enemy", hp, Object.assign({
    name: "隐身希尔德", ai: "ruins_hilde",
    hand: [{ name: "黑牌", suit: "♠" }],
  }, extra));
}
function state(allies, enemies, turn = 9) {
  const log = [];
  return { battle: { allies, enemies, turn, locked: false, ended: false, log }, log };
}
function actorOf() {
  return unit("ch", "ally", 100, {
    name: "橘千樱", ai: "invader_chiyo", stats: { attack: 10 },
  });
}

// ---------- A：真实隐身判定源（实体 vs 虚拟）----------
function testJudgeSource() {
  const { win } = makeWin();
  const virtualProbe = win.CardUtils.fromEntity("杀（普攻）", {});
  const entityProbe = win.CardUtils.cloneEntity("杀（普攻）", {});
  const h = hilde("h0", 10);
  const normal = unit("e0", "enemy", 10);
  T("A1 实体单体【杀】被统一判定源拦下",
    win.RuinsEnemySkills.blocksKillTarget(h, entityProbe) === true);
  T("A2 虚拟【杀】不受暗幕隐身限制",
    win.RuinsEnemySkills.blocksKillTarget(h, virtualProbe) === false);
  T("A3 普通敌人实体杀也不被拦",
    win.RuinsEnemySkills.blocksKillTarget(normal, entityProbe) === false);
  T("A4 无黑牌时隐身不成立",
    win.RuinsEnemySkills.blocksKillTarget(hilde("h1", 10, { hand: [] }), entityProbe) === false);
  T("A5 实体群体杀不受隐身限制",
    win.RuinsEnemySkills.blocksKillTarget(h, { ...entityProbe, sweep: true }) === false);
  const stopped = makeWin({ stopped: new Set(["h0"]) });
  T("A6 时停标记后隐身失效（实体杀也可指定）",
    stopped.win.RuinsEnemySkills.blocksKillTarget(hilde("h0", 10),
      stopped.win.CardUtils.cloneEntity("杀（普攻）", {})) === false);
  T("A7 探针牌是合法单体杀且无 _skill",
    !!virtualProbe && !virtualProbe._skill && win.CardUtils.isSingleKill(virtualProbe) === true);
}

// ---------- B：小规模转移（隐身目标同样可被虚拟杀收割）----------
function testSmallTransfer() {
  const { calls, api } = makeWin();
  const a = actorOf(), e0 = unit("e0", "enemy", 10), h = hilde("h0", 10);
  const st = state([a], [e0, h]);
  api.afterCardPlayed(st, a, e0, { _chiyoExtra: 3 });
  T("B1 隐身目标被虚拟杀指定", calls.some(c => c.targetUid === "h0"), calls);
  T("B2 隐身目标阵亡", h.hp === 0, { hp: h.hp });
  T("B3 原目标被收割", e0.hp === 0, { hp: e0.hp });
  T("B4 无可指定目标时终止并写明原因",
    st.log.some(x => /已无可指定的存活敌方/.test(x)), st.log.slice(-3));
  T("B5 链不残留", st.battle.chiyoChain === undefined);

  // 初始目标就是隐身目标：按新口径可直接指定，不应谎报「已阵亡」而转移。
  const w2 = makeWin();
  const a2 = actorOf(), h2 = hilde("h2", 10), e2 = unit("e2", "enemy", 10);
  const st2 = state([a2], [h2, e2]);
  w2.api.afterCardPlayed(st2, a2, h2, { _chiyoExtra: 2 });
  T("B6 初始目标隐身时仍被虚拟杀指定并命中",
    h2.hp === 0 && w2.calls.some(c => c.targetUid === "h2"),
    { calls: w2.calls.map(c => c.targetUid), hp: h2.hp });
  T("B7 战报不把隐身谎报为「不可被单体【杀】指定」",
    !st2.log.some(x => /不可被单体【杀】指定/.test(x))
    && st2.log.some(x => /已阵亡.*转移至/.test(x)), st2.log.slice(-3));
}

// ---------- C：234 个低血量目标收割（作弊压测）----------
function testMassacre() {
  const N = 234, HIDDEN = 3;
  const { calls, api } = makeWin();
  const a = actorOf();
  const enemies = [];
  for (let i = 0; i < N; i += 1) {
    enemies.push(i > 0 && i % 70 === 0
      ? hilde("h" + i, 1, { name: "隐身希尔德" + i })
      : unit("e" + i, "enemy", 1, { name: "残血敌人" + i }));
  }
  const hiddenUids = enemies.filter(e => e.ai === "ruins_hilde").map(e => e.uid);
  const st = state([a], enemies);
  const t0 = Date.now();
  api.afterCardPlayed(st, a, enemies[0], { _chiyoExtra: N + 6 });
  const ms = Date.now() - t0;
  const targets = calls.map(c => c.targetUid);
  T("C1 234 个目标、其中 3 个隐身", enemies.length === N && hiddenUids.length === HIDDEN,
    { total: enemies.length, hidden: hiddenUids.length });
  T("C2 234 个目标各被收割恰好一次",
    calls.length === N && new Set(targets).size === N
    && enemies.every(e => targets.includes(e.uid)),
    { calls: calls.length, distinct: new Set(targets).size });
  T("C3 3 个隐身目标也被虚拟杀指定",
    hiddenUids.every(uid => targets.includes(uid)), { hiddenUids, sample: targets.slice(0, 5) });
  T("C4 隐身目标全部阵亡",
    enemies.filter(e => e.ai === "ruins_hilde").every(e => e.hp === 0),
    enemies.filter(e => e.ai === "ruins_hilde").map(e => e.hp));
  T("C5 全部目标阵亡", enemies.every(e => e.hp === 0));
  T("C6 收割完立即终止并写清「无可指定」原因",
    st.log.some(x => /已无可指定的存活敌方/.test(x)), st.log.slice(-2));
  T("C7 链不残留", st.battle.chiyoChain === undefined);
  T("C8 次数守恒、不重复、不多打",
    calls.length === N && st.battle.locked === false,
    { calls: calls.length });
  T("C9 234 目标耗时可接受（<5s）", ms < 5000, { ms });
  T("C10 战报不含「不可被单体【杀】指定」",
    !st.log.some(x => /不可被单体【杀】指定/.test(x)), st.log.slice(-2));
  T("C11 每张虚拟杀都带防递归标记",
    calls.every(c => c.card?._chiyoChainVirtual === true
      && c.card?.skipAfterCardPlayed === true), calls.length && calls[0]?.card);
}

// ---------- D：分批挂起 / 恢复 ----------
function testResumeBatches() {
  const { calls, api } = makeWin({ lockEvery: 50 });
  const a = actorOf();
  const enemies = [];
  for (let i = 0; i < 120; i += 1) enemies.push(unit("d" + i, "enemy", 1));
  const h = hilde("dh", 1);
  enemies.push(h);
  const st = state([a], enemies, 9);
  api.afterCardPlayed(st, a, enemies[0], { _chiyoExtra: 130 });
  let batches = 0;
  while (st.battle.chiyoChain && batches < 20) {
    batches += 1;
    st.battle.locked = false;
    api.resume(st);
  }
  T("D1 分批恢复后 121 个目标全部收割", calls.length === 121,
    { calls: calls.length, batches });
  T("D2 确实发生多次挂起恢复", batches >= 2, { batches });
  T("D3 隐身目标在恢复链中同样被指定并阵亡",
    calls.some(c => c.targetUid === "dh") && h.hp === 0,
    { calls: calls.filter(c => c.targetUid === "dh").length, hp: h.hp });
  T("D4 链最终删除", st.battle.chiyoChain === undefined);

  // 跨回合残留：resume 必须直接作废，不补打。
  const w2 = makeWin({ lockEvery: 2 });
  const a2 = actorOf();
  const es = [0, 1, 2, 3, 4, 5].map(i => unit("t" + i, "enemy", 1));
  const st2 = state([a2], es, 9);
  w2.api.afterCardPlayed(st2, a2, es[0], { _chiyoExtra: 6 });
  const before = w2.calls.length;
  st2.battle.locked = false;
  st2.battle.turn = 10;
  w2.api.resume(st2);
  T("D5 跨回合残留链作废且不补打",
    w2.calls.length === before && st2.battle.chiyoChain === undefined,
    { before, after: w2.calls.length });
}

// ---------- E：时停与常驻隐身（虚拟杀都不受限）----------
function testTimeStop() {
  const { calls, api } = makeWin({ stopped: new Set(["hs"]) });
  const a = actorOf();
  const stoppedH = hilde("hs", 10, { name: "被时停希尔德" });
  const hiddenH = hilde("hh", 10, { name: "仍隐身希尔德" });
  const e = unit("ee", "enemy", 10);
  const st = state([a], [e, stoppedH, hiddenH]);
  api.afterCardPlayed(st, a, e, { _chiyoExtra: 5 });
  T("E1 时停目标可被收割",
    calls.some(c => c.targetUid === "hs"), calls.map(c => c.targetUid));
  T("E2 未被时停的隐身目标同样可被虚拟杀指定",
    calls.some(c => c.targetUid === "hh"), calls.map(c => c.targetUid));
  T("E3 两名希尔德都被收割、判定源按 uid 区分",
    hiddenH.hp === 0 && stoppedH.hp === 0,
    { hidden: hiddenH.hp, stopped: stoppedH.hp });
}

// ---------- F：全部目标都隐身 ----------
function testAllHidden() {
  const { calls, api } = makeWin();
  const a = actorOf();
  const hs = [hilde("x1", 10), hilde("x2", 10), hilde("x3", 10)];
  const st = state([a], hs);
  api.afterCardPlayed(st, a, hs[0], { _chiyoExtra: 9 });
  T("F1 全隐身时仍正常收割 3 个目标", calls.length === 3, calls.length);
  T("F2 收割完写明「无可指定」原因",
    st.log.some(x => /已无可指定的存活敌方/.test(x)), st.log);
  T("F3 三个隐身目标全部阵亡", hs.every(h => h.hp === 0));
  T("F4 链删除、不残留", st.battle.chiyoChain === undefined);
}

// ---------- G：二次校验防御层（判定源中途翻转）----------
function testFlipGuard() {
  const { calls, api } = makeWin({ flipAfter: 2 });
  const a = actorOf();
  const e = unit("g0", "enemy", 10);
  const st = state([a], [e]);
  api.afterCardPlayed(st, a, e, { _chiyoExtra: 2 });
  T("G1 判定源中途翻转时二次校验挡下虚拟杀",
    calls.length === 0 && e.hp === 10, { calls: calls.length, hp: e.hp });
  T("G2 翻转后链终止且不残留", st.battle.chiyoChain === undefined);
}

// ---------- H：飘浮掩体复查（上一轮技能同步复查）----------
function testWendyCover() {
  const { win, ctx } = makeWin();
  vm.runInNewContext(read("wendy-skills.js"), ctx, { filename: "wendy-skills.js" });
  const api = win.WendySkills;
  const w = unit("w", "ally", 100, { ref: "wendy", name: "温蒂", stats: { magic: 7 } });
  const c = unit("c", "ally", 100, { ref: "cadicis", name: "卡迪西斯" });
  const m = unit("m", "ally", 100, { name: "队友" });
  const st = state([w, c, m], [unit("z", "enemy", 100)], 5);
  T("H1 无弃牌数据也按魔力给全队加甲",
    api.floatingCover(st, w) === true && m.block === 7 && w.block === 7,
    { m: m.block, w: w.block });
  T("H2 卡迪西斯获得 2 倍护甲", c.block === 14, { c: c.block });
  T("H3 同回合幂等不重复加甲",
    api.floatingCover(st, w) === false && m.block === 7);
  const ew = unit("ew", "enemy", 100, { ref: "wendy", name: "敌温蒂", stats: { magic: 5 } });
  const ea = unit("ea", "enemy", 100, { name: "敌队友" });
  const st2 = state([w, c, m], [ew, ea], 6);
  api.floatingCover(st2, ew);
  T("H4 阵营按 side 取，敌方温蒂不加到我方", ea.block === 5 && m.block === 7,
    { ea: ea.block, m: m.block });
  const w3 = unit("w3", "ally", 100, { ref: "wendy", name: "温蒂3", stats: { magic: 4.8 } });
  const m3 = unit("m3", "ally", 100, { name: "队友3" });
  const st3 = state([w3, m3], [unit("z3", "enemy", 100)], 7);
  api.floatingCover(st3, w3);
  T("H5 小数魔力按点收敛、无浮点尾巴",
    m3.block === 5 && String(m3.block).length < 8, { block: m3.block });
  T("H6 战报写明魔力值与 2 倍口径",
    st.log.some(x => /获得7点护甲/.test(x) && /获得2倍护甲/.test(x)), st.log);
}

// ---------- I：静态护栏 ----------
function testStatic() {
  const s = patched("chiyo-chain-skills.js");
  T("I1 候选池接入统一判定源", /targetable\(unit, probe\)/.test(s));
  T("I2 虚拟杀入口保留二次校验",
    /!targetable\(target, probe\)\) return false/.test(s));
  T("I3 探针牌用真实单体【杀（普攻）】实体模板",
    /fromEntity\?\.\("杀（普攻）"/.test(s));
  T("I4 主文件不超 189 行硬约束",
    read("chiyo-chain-skills.js").split("\n").length <= 189,
    read("chiyo-chain-skills.js").split("\n").length);
  const catalog = fs.readFileSync(path.join(__dirname, "qa-test-catalog.js"), "utf8");
  T("I5 本测试已登记 QA 目录", /test-chiyo-chain-massacre\.js/.test(catalog));
  const dataFiles = fs.readdirSync(ROOT)
    .filter(f => f.startsWith("data-") && f.endsWith(".js"))
    .map(f => read(f));
  const withSkill = dataFiles.filter(x => x.includes("红缨连鬼斩"));
  T("I6 可玩角色与精英怪技能描述均含新口径",
    withSkill.length >= 2
    && withSkill.every(x => /剩余未使用的连击次数可指定另一名敌方角色/.test(x)),
    { files: withSkill.length });
  T("I7 飘浮掩体新描述仍在（魔力值口径）",
    dataFiles.some(x => x.includes("飘浮掩体") && /魔力值/.test(x)));
  T("I8 希尔德技能描述写明只挡实体单体【杀】",
    dataFiles.some(x => /不会成为实体单体【杀】牌的目标/.test(x)));
  T("I9 判定源用 CardUtils.isEntityCard 统一实体口径",
    /CardUtils\?\.isEntityCard\?\.\(card\)/.test(patched("ruins-elite-skills.js")));
  T("I10 转移文案按真实状态区分（阵亡 / 不可指定）",
    /const reason = alive\(previous\)/.test(s)
    && /不可被单体【杀】指定/.test(s));
}

testJudgeSource();
testSmallTransfer();
testMassacre();
testResumeBatches();
testTimeStop();
testAllHidden();
testFlipGuard();
testWendyCover();
testStatic();

console.log(`\nRESULT ${pass}/${pass + reds.length} RED=${reds.length} REVERT=${REVERT || "none"}`);
if (reds.length && !REVERT) {
  reds.forEach(r => console.log("  FAILED", r));
  process.exit(1);
}
