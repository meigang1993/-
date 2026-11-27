// 「角色牌存储牌」机制护栏：装配、UI、动画、描述、vm 行为一次性拦全。
// 正向：node tools/check-character-card-storage.js
// 反向：REVERT=zone|return|death|ui|anim|legacy node tools/check-character-card-storage.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ROOT = path.resolve(__dirname, "..");
const SRC = "src/original/";
const REVERT = String(process.env.REVERT || "").trim();
const results = [];
const check = (id, name, ok, extra) => {
  results.push({ id, ok: !!ok });
  console.log(`${ok ? "✅" : "❌"} ${id} ${name}${ok ? "" : "  ← " + JSON.stringify(extra || {})}`);
};
const read = rel => {
  let t = fs.readFileSync(path.join(ROOT, rel), "utf8");
  const M = SRC + "battle-character-card-storage.js";
  const N = SRC + "nanali-skills.js";
  const U = SRC + "ui-battle-units.js";
  const X = SRC + "battle-effect-card-transfers-exit.js";
  if (REVERT === "zone" && rel === N) {
    t = t.replace(/window\.BattleCharacterCardStorage\.store\(state, target, cards, \{[\s\S]*?\}\);/,
      "target.nanaliSealed = [...(target.nanaliSealed || []), ...cards];", 1);
  }
  if (REVERT === "return" && rel === M) {
    t = t.replace("  function endTurn(state) {", "  function endTurn(state) { return 0;", 1);
  }
  if (REVERT === "death" && rel === M) {
    t = t.replace("  function discardForDead(state, unit) {", "  function discardForDead(state, unit) { return [];", 1);
  }
  if (REVERT === "ui" && rel === U) {
    t = t.replace("${storedCardBadge(unitData)}", "", 1);
  }
  if (REVERT === "anim" && rel === X) {
    t = t.replace("    const destination = event.toCharacterCard", "    const destination = false && event.toCharacterCard", 1);
  }
  if (REVERT === "legacy" && rel === M) {
    t = t.replace(/const legacy = Array\.isArray\(unit\.nanaliSealed\) \? unit\.nanaliSealed : \[\];/,
      "const legacy = [];", 1);
  }
  if (REVERT === "timestop" && rel === SRC + "battle-end-phase.js") {
    t = t.replace(/    window\.BattleCharacterCardStorage\?\.endTurn\?\.\(state\);\n/, "", 1);
  }
  if (REVERT === "once" && rel === SRC + "battle-effect-card-motion.js") {
    t = t.replace("  async function placeStoredCards(options) {",
      "  async function placeStoredCards(options) {\n    await flyFrontCards({ ...options, className: \"seal-card-fly\" }); return;", 1);
  }
  if (REVERT === "handDelta" && rel === N) {
    t = t.replace(/\s*visualHandDelta: -cards\.length,/, "", 1);
  }
  if (REVERT === "absCover" && rel === SRC + "battle-effect-card-transfers-exit.js") {
    t = t.replace(/      const current = unit\.visualHandCount[\s\S]*?: Math\.max\(0, current \+ event\.visualHandDelta\);/,
      "      unit.visualHandCount = event.visualHandCount;", 1);
  }
  if (REVERT === "idempotent" && rel === SRC + "battle-effect-card-transfers-exit.js") {
    t = t.replace(/ && !\(event\.visualHandDelta != null && event\._handDeltaApplied\)/, "", 1);
    t = t.replace(/\s*if \(event\.visualHandDelta != null\) event\._handDeltaApplied = true;/, "", 1);
  }
  return t;
};
const src = rel => read(SRC + rel);
const allSource = () => fs.readdirSync(path.join(ROOT, SRC))
  .filter(f => f.endsWith(".js"));
const codeOnly = t => t.split("\n")
  .filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

// ── A. 静态装配 ──
const mod = src("battle-character-card-storage.js");
check("A0", "模块存在、全局名正确、行数未超硬约束",
  mod.includes("window.BattleCharacterCardStorage = (() => {")
  && mod.split("\n").length < 189, { lines: mod.split("\n").length });
const manifest = JSON.parse(read("tools/publish-bundles.json"));
const groups = Object.values(manifest).flat();
const idxMod = groups.indexOf("battle-character-card-storage.js");
const idxSkills = groups.indexOf("nanali-skills.js");
const idxSealed = groups.indexOf("nanali-sealed.js");
check("A1", "bundle 顺序登记：模块在 nanali-sealed.js / nanali-skills.js 之前",
  idxMod >= 0 && idxMod < idxSealed && idxMod < idxSkills,
  { idxMod, idxSealed, idxSkills });
check("A2", "runtime-globals / harness / fixtures 三处装配登记齐备",
  src("runtime-globals.js").includes('"BattleCharacterCardStorage"')
  && read("tools/kaiichi-reaction-harness.js").includes("battle-character-card-storage.js")
  && read("tools/skill-coverage-fixtures.js").includes("battle-character-card-storage.js"));
const nanali = codeOnly(src("nanali-skills.js"));
check("A3", "魔刀阿波罗扣置改走 store()，动画带 toCharacterCard，战报写明角色牌",
  nanali.includes("BattleCharacterCardStorage.store(state, target, cards")
  && nanali.includes('source: "魔刀阿波罗"')
  && nanali.includes("release: \"anyTurnEnd\"")
  && nanali.includes("toCharacterCard: true")
  && nanali.includes("扣置于其角色牌上（存储牌）")
  && !/target\.nanaliSealed\s*=/.test(nanali));
const sealed = codeOnly(src("nanali-sealed.js"));
check("A4", "回合结束归还转发 BattleCharacterCardStorage.endTurn，无私有字段残留",
  sealed.includes("BattleCharacterCardStorage?.endTurn?.(state)")
  && !sealed.includes("nanaliSealed"));
const defeat = codeOnly(src("battle-combat-defeat.js"));
check("A5", "阵亡结算接 discardForDead（手牌为空也清存储牌，带 storedDiscarded 去重）",
  defeat.includes("discardForDead?.(state, u)")
  && defeat.includes("storedDiscarded"));
const exit = codeOnly(src("battle-effect-card-transfers-exit.js"));
const transfers = codeOnly(src("battle-effect-card-transfers.js"));
const motion = codeOnly(src("battle-effect-card-motion.js"));
const motionCss = read("publish/battle-card-motion.css");
check("A6", "扣置动画落点=角色牌；返还动画起点=角色牌；一次性放牌分支接线齐备",
  /const destination = event\.toCharacterCard\s*\n\s*\? \(unitArt\(event\.uid\)/.test(exit)
  && transfers.includes('event.fromZone === "characterCard"')
  && mod.includes('fromZone: ZONE')
  && exit.includes("flight.placeStoredCards(")
  && motion.includes("async function placeStoredCards")
  && nanali.includes("placeOnce: true")
  && motionCss.includes(".stored-place-count"));
const ui = codeOnly(src("ui-battle-units.js"));
const css = read("publish/battle-units.css");
check("A7", "单位头像与详情头像都显示「存×N」徽章，CSS 有对应样式",
  (ui.match(/storedCardBadge\(/g) || []).length >= 3
  && ui.includes('class="stored-card-badge"')
  && css.includes(".stored-card-badge {"));
const data = src("data-characters-extra.js");
const settings = read("docs/original/game-settings.md");
const notice = read("src/original/update-notice-recent.js");
const roleDoc = read("docs/03-角色与角色技能.txt");
check("A8", "技能公开描述 / 设定契约 / 公告 / 角色文档都写明角色牌存储牌与阵亡口径",
  /魔刀阿波罗[\s\S]{0,400}角色牌上（存储牌/.test(data)
  && settings.includes("battle-character-card-storage.js")
  && settings.includes("界徐盛")
  && notice.includes("角色牌存储牌")
  && roleDoc.includes("扣置于该角色的角色牌上（存储牌")
  && roleDoc.includes("存储牌直接置入弃牌堆"));
const privateWrites = allSource()
  .filter(f => f !== "battle-character-card-storage.js")
  .filter(f => /nanaliSealed/.test(codeOnly(src(f))));
check("A9", "除旧档迁移外，全库 src/original 不再有 nanaliSealed 私有字段读写",
  privateWrites.length === 0, privateWrites);
check("A10", "既有工具测试与预览 spec 已改用 storedCards / characterCard 口径",
  read("tools/test-nanali-skills.js").includes('fromZone === "characterCard"')
  && read("tools/test-nanali-skills.js").includes("toCharacterCard === true")
  && read("tools/test-nanali-skills.js").includes("placeOnce === true")
  && !read("tests/preview-nanali-battle.spec.js").includes("nanaliSealed"));
const endPhase = codeOnly(src("battle-end-phase.js"));
check("A11", "存储牌返还在结束步骤之后无条件执行：时停清空 steps 也照样返还",
  endPhase.includes("window.BattleCharacterCardStorage?.endTurn?.(state)")
  && !endPhase.includes("window.ElranaAceNanaliSkills?.endTurn?.(state, unit")
  && endPhase.indexOf("BattleCharacterCardStorage?.endTurn")
    > endPhase.indexOf("while (index < steps.length)"));
const onceBody = motion.slice(motion.indexOf("async function placeStoredCards"));
check("A12", "一次性放牌函数：1 个 DOM、1 次落位音效、不逐张飞、起点终点重合时抬起",
  (onceBody.match(/BattleEffectCardDOM\.front\(/g) || []).length === 1
  && (onceBody.match(/cardLand\?\.\(\)/g) || []).length === 1
  && !/flyFrontCards\(|Promise\.all/.test(onceBody)
  && onceBody.includes("Math.hypot(end.x - start.x, end.y - start.y) < 24"));
const responseHandler = codeOnly(src("battle-effect-handlers.js"));
check("A13", "【BUG 修复】sealCards 手牌数按相对增量推进，不再用绝对快照覆盖",
  nanali.includes("visualHandDelta: -cards.length")
  && exit.includes("current + event.visualHandDelta")
  && exit.includes("Math.max(0, current + event.visualHandDelta)")
  && !/unit\.visualHandCount = event\.visualHandCount;/.test(exit)
  // 与响应事件的既定口径完全一致（queueResponse / battle-effect-handlers.response）
  && responseHandler.includes("Math.max(0, current + evt.visualHandDelta)"));
check("A14", "扣牌数显示矩阵实机与 QA 目录登记齐备",
  read("tools/qa-test-catalog.js").includes("test-apollo-handcount-matrix-live.js")
  && read("tools/test-apollo-handcount-matrix-live.js").includes("RESULT")
  && read("tools/test-apollo-handcount-matrix-live.js").includes("旧 BUG 会显示 1"));
check("A15", "【幂等】同一 sealCards 事件重播不重复扣减（绝对快照分支保持兼容）",
  exit.includes("&& !(event.visualHandDelta != null && event._handDeltaApplied)")
  && exit.includes("if (event.visualHandDelta != null) event._handDeltaApplied = true")
  && read("tools/test-apollo-handcount-matrix-live.js").includes("幂等"));

// ── B. vm 真实模块行为 ──
const logs = [];
const putCalls = [];
const syncCalls = [];
const ctx = {
  console, Math, Object, Array, String, Number, Boolean, JSON, Error,
  SakuraRisaSkills: { pendingRevival: () => false },
  BattleLog: { add: (state, text) => logs.push(text) },
  BattleCards: {
    putMany: (b, unit, cards, pile) => putCalls.push({ pile, cards: [...cards] }),
    put: (b, unit, card, pile) => putCalls.push({ pile, cards: [card] }),
    syncStatusCards: unit => syncCalls.push(unit.uid),
  },
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(mod, ctx, { filename: "battle-character-card-storage.js" });
const S = ctx.BattleCharacterCardStorage;
const mkUnit = (uid, extra = {}) => ({
  uid, name: uid, side: "enemy", hp: 30, hand: [], ...extra,
});
const mkState = units => ({
  battle: { allies: [units[0]], enemies: units.slice(1), animQueue: [], turn: 7 },
});
const card = (name, type = "tactic") => ({ name, type, suit: "♠" });

try {
  // B1 store：移出游戏，不进手牌，条目带来源/时机
  const a = mkUnit("a"), e = mkUnit("e", { hand: [card("闪", "response"), card("调度")] });
  const st = mkState([a, e]);
  const taken = e.hand.splice(0);
  S.store(st, e, taken, { source: "魔刀阿波罗", ownerUid: a.uid, release: "anyTurnEnd" });
  check("B1", "store：牌进入角色牌存储区、不在手牌、条目带来源/归属/返还时机/回合",
    S.count(e) === 2 && e.hand.length === 0
    && e.storedCards[0].source === "魔刀阿波罗"
    && e.storedCards[0].ownerUid === "a"
    && e.storedCards[0].release === "anyTurnEnd"
    && e.storedCards[0].storedTurn === 7
    && S.cardsOf(e).length === 2, e.storedCards);
  check("B2", "namesOf 输出花色+牌名，供头像 tooltip 公开查看",
    S.namesOf(S.cardsOf(e)).includes("♠闪") && S.namesOf(S.cardsOf(e)).includes("♠调度"));

  // B3 release：回到手牌 + 动画 + 状态牌同步 + 清空存储区
  logs.length = 0; syncCalls.length = 0;
  const back = S.release(st, e, () => true, "测试返还");
  check("B3", "release：牌回手牌、_pendingDraw、gainCards 从 characterCard 起飞、存储区清空",
    back.length === 2 && e.hand.length === 2 && S.count(e) === 0
    && e.hand.every(c => c._pendingDraw)
    && syncCalls.includes("e")
    && st.battle.animQueue.some(ev => ev.type === "gainCards"
      && ev.fromZone === "characterCard" && ev.stagger === 0 && ev.count === 2)
    && logs.some(t => t.includes("角色牌上的2张存储牌") && t.includes("回到手中")),
    { hand: e.hand.length, count: S.count(e), anim: st.battle.animQueue, logs });

  // B4 endTurn：只返还 anyTurnEnd；其它口径与阵亡者保留
  const a2 = mkUnit("a2");
  const aliveUnit = mkUnit("alive", { hand: [] });
  const deadUnit = mkUnit("dead", { hp: 0, hand: [] });
  const st2 = mkState([a2, aliveUnit, deadUnit]);
  S.store(st2, aliveUnit, [card("牌A"), card("牌B")],
    { source: "测试技", release: "anyTurnEnd" });
  S.store(st2, aliveUnit, [card("牌C")],
    { source: "测试技2", release: "manual" });
  S.store(st2, deadUnit, [card("牌D")],
    { source: "测试技", release: "anyTurnEnd" });
  const total = S.endTurn(st2);
  check("B4", "endTurn：只返还 anyTurnEnd 且只返还存活者，manual/阵亡者保留",
    total === 2 && aliveUnit.hand.length === 2 && S.count(aliveUnit) === 1
    && S.cardsOf(aliveUnit)[0].name === "牌C"
    && deadUnit.hand.length === 0 && S.count(deadUnit) === 1,
    { total, aliveHand: aliveUnit.hand.length, aliveStored: S.count(aliveUnit), deadStored: S.count(deadUnit) });

  // B5 阵亡：直接入弃牌堆，不回手牌
  logs.length = 0; putCalls.length = 0;
  const dead = mkUnit("dead2", { hp: 0, hand: [] });
  const st3 = mkState([mkUnit("a3"), dead]);
  S.store(st3, dead, [card("牌E"), card("牌F")], { source: "测试技" });
  const discarded = S.discardForDead(st3, dead);
  check("B5", "discardForDead：存储牌整批置入弃牌堆、不回手牌、存储区清空、写战报",
    discarded.length === 2 && dead.hand.length === 0 && S.count(dead) === 0
    && putCalls.length === 1 && putCalls[0].pile === "discard"
    && putCalls[0].cards.length === 2
    && logs.some(t => t.includes("直接置入弃牌堆")), { putCalls, logs });

  // B6 旧档迁移
  const legacy = { uid: "old", name: "旧档", side: "enemy", hp: 20, hand: [], nanaliSealed: [card("旧牌")] };
  const migrated = S.cardsOf(legacy);
  check("B6", "旧存档 nanaliSealed 自动迁移为 storedCards 条目",
    migrated.length === 1 && migrated[0].name === "旧牌"
    && legacy.storedCards[0].source === "魔刀阿波罗"
    && legacy.nanaliSealed.length === 0, legacy);

  // B7 clear + 多来源隔离（按 predicate 精确返还）
  const multi = mkUnit("multi", { hand: [] });
  const st4 = mkState([mkUnit("a4"), multi]);
  S.store(st4, multi, [card("来源甲")], { source: "甲" });
  S.store(st4, multi, [card("来源乙")], { source: "乙" });
  const onlyB = S.release(st4, multi, entry => entry.source === "乙", "按来源返还");
  check("B7", "release(predicate) 精确隔离不同来源的存储牌",
    onlyB.length === 1 && onlyB[0].name === "来源乙"
    && S.count(multi) === 1 && S.cardsOf(multi)[0].name === "来源甲");
  check("B8", "clear 战斗收尾清空所有角色存储区",
    S.clear(st4) === 1 && S.count(multi) === 0
    && S.clear(st4) === 0);
} catch (e) {
  check("B0", "vm 行为用例未抛异常", false, { error: String(e).slice(0, 200) });
}

const red = results.filter(r => !r.ok).map(r => r.id);
console.log(`\nREVERT=${REVERT || "none"} RED=${JSON.stringify(red)}`);
if (!REVERT) {
  console.log(`RESULT ${results.length - red.length}/${results.length}`);
  process.exit(red.length ? 1 : 0);
}
const EXPECT = {
  zone: ["A3", "A9"], return: ["B4"], death: ["B5"],
  ui: ["A7"], anim: ["A6"], legacy: ["B6"],
  timestop: ["A11"], once: ["A12"],
  handDelta: ["A13"], absCover: ["A13"], idempotent: ["A15"],
}[REVERT] || [];
const same = JSON.stringify(red) === JSON.stringify(EXPECT);
console.log(`EXPECTED=${JSON.stringify(EXPECT)} ${same ? "PRECISE_OK" : "PRECISE_FAIL"}`);
process.exit(same ? 0 : 1);
