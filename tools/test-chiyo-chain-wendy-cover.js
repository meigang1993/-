// 【红缨连鬼斩】/【飘浮掩体】技能调整严格检查。
// REVERT=chain|retarget|magic|phase 为源码级反向验证，撤掉对应修复后应精准打红。
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "../src/original");
const REVERT = process.env.REVERT || "";
const CHIYO_DESC = "锁定技，当你使用单体【杀】牌指定目标时，你进行连续判定：若判定为红色牌，你继续判定；若判定为黑色牌，则停止判定。停止判定后，你使用的此【杀】牌根据本次判定出的红色牌数量，额外对目标使用等量的虚拟【杀（普攻）】。若连击过程中目标死亡，剩余未使用的连击次数可指定另一名敌方角色为目标。";
const WENDY_DESC = "锁定技，弃牌阶段，我方全体角色获得等同于你魔力值的护甲值。若卡迪西斯在队伍中，卡迪西斯获得2倍护甲值。";

let pass = 0;
const reds = [];
function T(name, cond, extra) {
  if (cond) { pass += 1; return; }
  reds.push(name);
  if (REVERT) console.log(`  RED ${name}`, extra === undefined ? "" : JSON.stringify(extra));
}
function read(file) { return fs.readFileSync(path.join(ROOT, file), "utf8"); }
function repo(file) { return fs.readFileSync(path.join(__dirname, "..", file), "utf8"); }

function patched(file) {
  const src = read(file);
  if (REVERT === "chain" && file === "enemy-kill-hooks.js") {
    let out = src.replace("card._chiyoExtra = red;",
      "card.gatlingRepeats = (card.gatlingRepeats || 1) + red;");
    out = out.replace("`${actor.name} 本次杀将额外使用${red}张虚拟【杀（普攻）】。`",
      "`${actor.name} 本次杀额外结算${red}次。`");
    assert.notStrictEqual(out, src, "REVERT=chain must hit chiyoSlash");
    assert.ok(out.includes("本次杀额外结算"), "REVERT=chain must also restore old log text");
    return out;
  }
  if (REVERT === "retarget" && file === "chiyo-chain-skills.js") {
    const out = src.replace("target = foes.slice().sort((a, z) => a.hp - z.hp)[0];",
      "break;");
    assert.notStrictEqual(out, src, "REVERT=retarget must hit chain retarget");
    return out;
  }
  if (REVERT === "magic" && file === "wendy-skills.js") {
    const out = src.replace("const magic = Math.max(0, Math.round(\n      window.BattleHpValue?.clean?.(rawMagic) ?? rawMagic));",
      "const magic = 1;");
    assert.notStrictEqual(out, src, "REVERT=magic must hit magic computation");
    return out;
  }
  if (REVERT === "phase" && file === "battle-discard-flow.js") {
    const out = src.replace("window.WendyCadicisSkills?.floatingCover?.(state, unit, { pushFloat: combat.pushFloat });",
      "void 0;");
    assert.notStrictEqual(out, src, "REVERT=phase must hit discard-phase hook");
    return out;
  }
  return src;
}

function makeWin() {
  const win = {};
  win.BattleLog = { add: (state, text) => (state.log ||= []).push(text) };
  win.BattleLines = { skill: (state, unit, name, target) => (state.lines ||= []).push({ unit, name, target }) };
  win.BattleHpValue = { clean: value => Math.round(value * 100) / 100 };
  win.WendyTeacherSkinFX = { cover() {} };
  win.CatherineSkills = { syncMagic() {} };
  return win;
}

function load(win, file) {
  const ctx = { window: win, Math, Number, Array, Object, Set, Map, JSON, String, RegExp, console };
  vm.runInNewContext(patched(file), ctx, { filename: file });
}

function unit(uid, side, hp, extra = {}) {
  return Object.assign({ uid, name: uid, side, hp, maxHp: hp, hand: [], block: 0 }, extra);
}
function state(allies, enemies) {
  const log = [], lines = [];
  return { battle: { allies, enemies, turn: 7, log, lines }, log, lines };
}

// ---------- A：橘千樱判定改为记录虚拟杀张数 ----------
function testChiyoJudge() {
  const win = makeWin();
  const judgeCards = ["♥红", "♦红", "♥红", "♠黑"];
  let judgeIndex = 0;
  win.CardUtils = {
    isSingleKill: card => card?.type === "slash" && !card.sweep,
    fromEntity: (name, extra) => Object.assign({ name, type: "slash", scale: "attack", suit: "" }, extra),
  };
  load(win, "enemy-kill-hooks.js");
  const hooks = win.EnemyKillHooks({
    black: item => /♠|♣/.test(item?.suit || ""),
    hasSkill: (actor, name) => ["红缨连鬼斩", "心眼拔刀术"].includes(name),
    drawJudge: () => {
      const suit = judgeCards[judgeIndex++] || "♠黑";
      return { card: { suit, name: "判定牌" }, success: !/♠|♣/.test(suit) };
    },
  });
  const actor = unit("ch", "ally", 100, { stats: { attack: 10 }, ai: "invader_chiyo" });
  const target = unit("e0", "enemy", 100);
  const card = { name: "杀（普攻）", type: "slash" };
  const st = state([actor], [target]);
  hooks.beforeKillTargeted(st, actor, target, card);
  T("A1 红色判定数写入 _chiyoExtra 而非 gatlingRepeats",
    card._chiyoExtra === 3 && card.gatlingRepeats === undefined,
    { extra: card._chiyoExtra, repeats: card.gatlingRepeats });
  T("A2 战报写明额外虚拟杀张数",
    st.battle.log.some(text => /额外使用3张虚拟【杀（普攻）】/.test(text)), st.battle.log);
  T("A3 播报红缨连鬼斩台词",
    st.battle.lines.some(item => item.name === "红缨连鬼斩"));
  const virtual = { name: "杀（普攻）", type: "slash", _chiyoChainVirtual: true };
  hooks.beforeKillTargeted(st, actor, target, virtual);
  T("A4 连击虚拟杀不重复判定、不触发封闪",
    virtual._chiyoExtra === undefined && virtual.ignoreResponse === undefined && judgeIndex === 4,
    { judgeIndex });
  judgeIndex = 3;
  const blackCard = { name: "杀（普攻）", type: "slash" };
  hooks.beforeKillTargeted(st, actor, target, blackCard);
  T("A5 首判黑色不产生额外连击", blackCard._chiyoExtra === undefined);
}

// ---------- B：虚拟杀链 + 目标死亡转移 ----------
function makeChain(win, opts = {}) {
  const calls = [];
  win.CardUtils = {
    fromEntity: (name, extra) => Object.assign({ name, type: "slash", scale: "attack", suit: "" }, extra),
  };
  win.BattleSystem = {
    useVirtualKill(st, actor, target, card) {
      calls.push({ actorUid: actor.uid, targetUid: target.uid, card });
      if (opts.killAfter && calls.length === opts.killAfter) target.hp = 0;
      if (opts.lockAfter && calls.length === opts.lockAfter) st.battle.locked = true;
      return true;
    },
  };
  load(win, "chiyo-chain-skills.js");
  return { calls, api: win.ChiyoChainSkills };
}

function testChain() {
  // B1/B2：原目标存活，3 张虚拟杀全打原目标
  {
    const win = makeWin();
    const { calls, api } = makeChain(win);
    const a = unit("ch", "ally", 100), e0 = unit("e0", "enemy", 100), e1 = unit("e1", "enemy", 100);
    const st = state([a], [e0, e1]);
    const card = { _chiyoExtra: 3 };
    api.afterCardPlayed(st, a, e0, card);
    T("B1 原目标存活时 3 张虚拟杀全部打原目标",
      calls.length === 3 && calls.every(c => c.targetUid === "e0"), calls.map(c => c.targetUid));
    T("B2 虚拟杀为杀（普攻）且关闭响应/钩子链/杀意消耗",
      calls.every(c => c.card.name === "杀（普攻）" && c.card.noIntentCost && c.card.ignoreResponse
        && c.card.skipAfterCardPlayed && c.card._chiyoChainVirtual && c.card.void));
    T("B2b 链标记用完即清，不残留进存档",
      card._chiyoExtra === undefined && st.battle.chiyoChain === undefined);
    api.afterCardPlayed(st, a, e0, card);
    T("B2c 同一张牌重复进入钩子不重复结算", calls.length === 3);
  }
  // B3/B4：第 2 张后原目标阵亡 → 第 3 张转移给血量最低的另一名敌方
  {
    const win = makeWin();
    const { calls, api } = makeChain(win, { killAfter: 2 });
    const a = unit("ch", "ally", 100);
    const e0 = unit("e0", "enemy", 100), low = unit("low", "enemy", 12), high = unit("high", "enemy", 80);
    const st = state([a], [e0, high, low]);
    api.afterCardPlayed(st, a, e0, { _chiyoExtra: 3 });
    T("B3 目标阵亡后剩余次数转移给另一名存活敌方",
      calls.length === 3 && calls[2].targetUid === "low", calls.map(c => c.targetUid));
    T("B4 转移写战报且标明剩余次数",
      st.battle.log.some(t => /剩余1次连击转移至low/.test(t)), st.battle.log);
  }
  // B5：无「可被单体杀指定」的存活敌方（含全部阵亡）
  {
    const win = makeWin();
    const { calls, api } = makeChain(win);
    const a = unit("ch", "ally", 100), e0 = unit("e0", "enemy", 0);
    const st = state([a], [e0]);
    api.afterCardPlayed(st, a, e0, { _chiyoExtra: 2 });
    T("B5 无存活敌方时终止并如实写战报",
      calls.length === 0 && st.battle.log.some(t => /已无可指定的存活敌方/.test(t)));
  }
  // B5b：统一判定源明确判为「不可指定」的存活目标不计入候选池（防御层）
  {
    const win = makeWin();
    win.RuinsEnemySkills = { blocksKillTarget: () => true };
    const { calls, api } = makeChain(win);
    const a = unit("ch", "ally", 100), h = unit("h", "enemy", 100);
    const st = state([a], [h]);
    api.afterCardPlayed(st, a, h, { _chiyoExtra: 2 });
    T("B5b 判定源拒绝的存活目标不被指定、链如实终止",
      calls.length === 0 && h.hp === 100
      && st.battle.log.some(t => /已无可指定的存活敌方/.test(t)),
      { calls: calls.length, hp: h.hp, log: st.battle.log });
  }
  // B6：挂起兜底
  {
    const win = makeWin();
    const { calls, api } = makeChain(win, { lockAfter: 1 });
    const a = unit("ch", "ally", 100), e0 = unit("e0", "enemy", 100);
    const st = state([a], [e0]);
    api.afterCardPlayed(st, a, e0, { _chiyoExtra: 3 });
    T("B6 挂起时保存剩余链", calls.length === 1 && st.battle.chiyoChain?.remaining === 2,
      { calls: calls.length, chain: st.battle.chiyoChain });
    st.battle.locked = false;
    api.resume(st);
    T("B6b 恢复后补完剩余虚拟杀", calls.length === 3 && st.battle.chiyoChain === undefined);
  }
  // B7：战斗已结束不跑
  {
    const win = makeWin();
    const { calls, api } = makeChain(win);
    const a = unit("ch", "ally", 100), e0 = unit("e0", "enemy", 100);
    const st = state([a], [e0]);
    st.battle.ended = true;
    api.afterCardPlayed(st, a, e0, { _chiyoExtra: 2 });
    T("B7 战斗已结束不再发动虚拟杀", calls.length === 0);
  }
}

// ---------- C：橘千樱描述同步 ----------
function testChiyoText() {
  const playable = read("data-future-characters.js");
  const elite = read("data-machine-factory-enemies.js");
  T("C1 可玩角色技能文本为用户原文", playable.includes(`text: "${CHIYO_DESC}"`));
  T("C2 精英怪技能文本同步", elite.includes(`text: "${CHIYO_DESC}"`));
  T("C3 旧「结算X+1次」描述清零",
    !playable.includes("结算X+1次") && !elite.includes("结算X+1次"));
  const lines = read("battle-line-data.js");
  T("C4 台词「让你们见识一下我的绝技」在两处条目里",
    (lines.match(/让你们见识一下我的绝技。/g) || []).length === 2);
}

// ---------- D：温蒂按魔力值给护甲 ----------
function makeWendy(win) {
  load(win, "wendy-skills.js");
  const floats = [];
  return { api: win.WendySkills, deps: { pushFloat: (b, uid, kind, gain) => floats.push({ uid, gain }) }, floats };
}

function testWendy() {
  {
    const win = makeWin();
    const { api, deps, floats } = makeWendy(win);
    const wendy = unit("w", "ally", 100, { ref: "wendy", stats: { magic: 5 }, tempMagic: 2 });
    const flora = unit("f", "ally", 100, { ref: "flora" });
    const cad = unit("c", "ally", 100, { ref: "cadicis" });
    const st = state([wendy, flora, cad], [unit("e", "enemy", 100)]);
    api.floatingCover(st, wendy, deps);
    T("D1 全体获得等同于魔力值(5+2=7)的护甲",
      wendy.block === 7 && flora.block === 7, { w: wendy.block, f: flora.block });
    T("D2 卡迪西斯获得 2 倍", cad.block === 14, cad.block);
    T("D3 芙萝娅不再双倍", flora.block === 7);
    T("D4 飘字按实际增量", floats.length === 3 && floats.some(x => x.uid === "c" && x.gain === 14));
    const before = wendy.block;
    api.floatingCover(st, wendy, deps);
    T("D5 同一回合只结算一次", wendy.block === before);
    T("D6 卡迪西斯在队时台词目标是卡迪西斯",
      st.battle.lines.some(x => x.name === "飘浮掩体" && x.target?.uid === "c"));
  }
  {
    const win = makeWin();
    const { api, deps } = makeWendy(win);
    const wendy = unit("w", "ally", 100, { ref: "wendy", stats: { magic: 4.8 } });
    const dead = unit("d", "ally", 0, { ref: "dead" });
    const st = state([wendy, dead], []);
    api.floatingCover(st, wendy, deps);
    T("D7 小数魔力收敛为整数且无浮点尾巴",
      Number.isInteger(wendy.block) && wendy.block === 5, wendy.block);
    T("D8 阵亡队友不获得护甲", dead.block === 0);
    T("D9 卡迪西斯不在队时台词无目标",
      st.battle.lines.some(x => x.name === "飘浮掩体" && !x.target));
    T("D10 非温蒂/阵亡温蒂不触发",
      api.floatingCover(st, dead, deps) === false
      && api.floatingCover(st, Object.assign({}, wendy, { hp: 0 }), deps) === false);
  }
}

// ---------- E：弃牌阶段挂点 ----------
function testDiscardPhase() {
  const flowSrc = patched("battle-discard-flow.js");
  const noaSrc = read("noa-charm-discard.js");
  T("E1 弃牌阶段入口调用 floatingCover",
    /enterDiscardOrEnd[\s\S]{0,700}floatingCover/.test(flowSrc)
    && flowSrc.includes("window.WendyCadicisSkills?.floatingCover?.("));
  T("E2 discardCards 不再按弃牌数调 afterDiscard",
    !flowSrc.includes("afterDiscard?.("));
  T("E3 淫气改造溢出弃牌不触发飘浮掩体",
    !noaSrc.includes("afterDiscard?.("));

  function runFlow(need, opts = {}) {
    const win = makeWin();
    const calls = [];
    win.WendyCadicisSkills = { floatingCover: (st, u) => { calls.push(u.uid); return true; } };
    win.SakuraRisaSkills = { pendingRevival: () => false };
    win.RelicSystem = { hasEquipped: () => !!opts.watch };
    load(win, "battle-discard-flow.js");
    const wendy = unit("w", "ally", 100, { ref: "wendy", hand: [] });
    win.BattleDiscardFlow({
      active: () => wendy,
      visibleHand: u => u.hand.length,
      handLimit: () => 4,
      canDiscardCard: () => true,
      canDiscardAny: () => true,
      discardNeed: () => need,
      discardOverflow: () => {},
      enterEndPhase: () => true,
      draw: () => [],
      combat: { pushFloat() {} },
      record: () => {},
      advanceToInput: async () => {},
      manualFlow: {},
    }).enterDiscardOrEnd(state([wendy], []), wendy);
    return calls;
  }
  T("E4 温蒂无需弃牌(need=0)的回合也触发", runFlow(0).length === 1);
  T("E5 温蒂需要弃牌的回合同样触发一次", runFlow(2).length === 1);
  T("E6 母亲怀表跳过弃牌阶段时不触发", runFlow(0, { watch: true }).length === 0);
}

// ---------- F/G：台词、描述、公告、文档 ----------
function testTextSync() {
  const core = read("data-characters-core.js");
  const lineData = read("battle-line-data.js");
  T("F1 温蒂技能文本为用户原文", core.includes(`text: "${WENDY_DESC}"`));
  T("F2 旧「每弃置1张手牌」描述清零", !core.includes("每弃置1张手牌"));
  T("F3 旧「芙萝娅与卡迪西斯改为各获得2点护甲」清零",
    !core.includes("芙萝娅与卡迪西斯改为各获得2点护甲"));
  const win = { BattleLineData: null };
  const ctx = { window: win, Math, Object, Array };
  vm.runInNewContext(read("battle-line-data.js"), ctx, { filename: "battle-line-data.js" });
  const wendyLine = win.BattleLineData?.skillLines?.wendy?.["飘浮掩体"];
  T("F4 台词函数按卡迪西斯返回妈妈台词",
    typeof wendyLine === "function"
    && /妈妈的魔法会保护好你的/.test(wendyLine({ ref: "cadicis" }))
    && /我的魔法是飘浮/.test(wendyLine(null)));
  T("G1 视觉文档同步为 2 倍护甲且移除芙萝娅双倍旧描述",
    repo("docs/original/game-settings.md").includes("卡迪西斯在队伍中时获得 2 倍护甲")
    && !repo("docs/original/game-settings.md").includes("芙萝娅仍按当前技能规则显示双倍护甲"));
  const notice = read("update-notice-recent.js");
  T("G2 公告含红缨连鬼斩调整", notice.includes("技能调整【红缨连鬼斩】"));
  T("G3 公告含飘浮掩体调整", notice.includes("技能调整【飘浮掩体】"));
}

function main() {
  testChiyoJudge();
  testChain();
  testChiyoText();
  testWendy();
  testDiscardPhase();
  testTextSync();
  console.log(`RESULT ${pass}/${pass + reds.length} RED=${reds.length}`,
    REVERT ? `REVERT=${REVERT}` : "none");
  if (REVERT) {
    console.log(reds.length ? `REVERT_OK ${REVERT}: ${reds.length} targeted red(s)` : `REVERT_FAIL ${REVERT}: no red`);
    process.exitCode = reds.length ? 1 : 2;
  } else if (reds.length) {
    reds.forEach(name => console.log("  FAILED", name));
    process.exitCode = 1;
  }
}
main();
