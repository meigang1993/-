// 怪面诺亚【魅力改造】【改造副作用】严格检查（Node 直调，不依赖浏览器）
// 覆盖：角色模板 / 台词 / 皮肤 / 免杀意 / 手牌恒等 / 动态手牌上限 /
//       结束阶段男性伤害 / 无男性时的虚拟咬杀与跳过出牌 / 解锁链路静态装配。
// 反向验证：撤掉任一技能判据后，对应断言必须立刻变红。
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SRC = f => path.join(__dirname, "..", "src", "original", f);
const read = f => fs.readFileSync(SRC(f), "utf8");
const ctx = { console };
ctx.window = ctx;
vm.createContext(ctx);

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return !!cond;
};

// ---------- 最小运行时 ----------
const logs = [], lines = [], discarded = [];
const unit = (ref, gender, hp = 50, extra = {}) => ({
  uid: ref, ref, name: ref, gender, hp, maxHp: 65, side: "ally",
  hand: [], stats: { attack: 3, magic: 2, speed: 4, maxHp: 65, bloodlust: 1, handLimit: 4 },
  skills: [], ...extra,
});
const noaSkills = [
  { name: "魅力改造", type: "passive", text: "锁定技，你的手牌数始终等于你的手牌上限（少于则摸至上限，多于则弃至上限）。你使用【杀】牌不消耗杀意。" },
  { name: "改造副作用", type: "passive", text: "锁定技，结束阶段，你对我方其他所有存活男性角色各造成等同于你攻击力的伤害。队伍里每有一名男性角色，你的手牌上限+1。若队伍中没有存活的男性角色，出牌阶段开始时，你随机对一名角色（不分敌我）视为使用一张虚拟【咬杀】，之后跳过本回合的出牌阶段。" },
];
ctx.CardUtils = {
  isKillCard: c => c?.type === "slash" || /杀(?:（[^）]*）)?$/.test(c?.name || ""),
  fromEntity: (name, extra) => ({ name, type: "slash", power: 0, scale: "attack", ...extra }),
};
ctx.BattleLog = { add: (state, text) => logs.push(text) };
ctx.BattleLines = { skill: (state, u, name) => lines.push({ unit: u?.ref, name }) };
ctx.BattleCards = { put: (b, u, card, pile) => discarded.push({ u: u?.ref, card: card?.name, pile }) };
ctx.GameRandom = { sample: list => list[0] };
ctx.BattleSystem = { useVirtualKill: (state, actor, target, card) => { ctx.__virtual = { target: target?.uid, card }; } };
ctx.BattleLineData = { skillLines: {}, allyIntroLines: {} };

// ---------- 载入新角色数据与两个技能文件 ----------
// window 即 ctx，数据文件里的 window.GameDataNewCharacters 会落到 ctx 上。
vm.runInContext(read("data-new-characters.js"), ctx, { filename: "data-new-characters.js" });
const templates = ctx.GameDataNewCharacters;
ctx.GameData = { characters: templates };
vm.runInContext(read("noa-charm-skills.js"), ctx, { filename: "noa-charm-skills.js" });
vm.runInContext(read("noa-side-effect-skills.js"), ctx, { filename: "noa-side-effect-skills.js" });
vm.runInContext(read("new-character-line-data.js"), ctx, { filename: "new-character-line-data.js" });

const tpl = templates.find(c => c.id === "noa");
const Charm = ctx.NoaCharmSkills, Side = ctx.NoaSideEffectSkills;

// ---------- A 角色模板 ----------
T("A1 角色栏含怪面诺亚且性别女", tpl?.name === "怪面诺亚" && tpl?.gender === "female", tpl?.name);
T("A2 身份为魅力改造者", tpl?.role === "魅力改造者", tpl?.role);
T("A3 0级属性正确（203版全角色翻倍后）", JSON.stringify(tpl?.stats) === JSON.stringify({ attack: 6, magic: 4, speed: 8, maxHp: 130, bloodlust: 1, handLimit: 4, drawPerTurn: 1, initialDraw: 1 }), tpl?.stats);
T("A4 每回合摸牌=基础2+1、初始摸牌=基础4+1", tpl?.stats?.drawPerTurn === 1 && tpl?.stats?.initialDraw === 1, tpl?.stats);
T("A5 锁定且殿堂价100、解锁旗标正确", tpl?.locked === true && tpl?.unlockCost === 100 && tpl?.unlockFlag === "noaNurseryUnlocked", tpl);
T("A6 两个技能描述与设定一致", tpl?.skills?.length === 2 && tpl.skills[0].text === noaSkills[0].text && tpl.skills[1].text === noaSkills[1].text, tpl?.skills?.map(s => s.name));
T("A7 主立绘指向已接入的文件", (tpl?.art || "").includes("noa.470b1881.webp"), tpl?.art);
T("A8 登场台词与设定一致", tpl?.entrance === "啊啊……身体好热！杀光敌人！别忘了……给我……雄性……淫气改造把我变成了淫荡的怪物！！！", tpl?.entrance);

// ---------- B 台词 ----------
const sl = ctx.BattleLineData.skillLines.noa || {};
T("B1 使用杀台词", sl["使用杀"] === "杀！杀杀杀杀！！！", sl);
T("B2 对男性造成伤害台词", sl["改造副作用"] === "全部！全部进来！！", sl);
T("B3 登场台词进入 allyIntroLines", ctx.BattleLineData.allyIntroLines.noa === tpl.entrance, ctx.BattleLineData.allyIntroLines.noa);

// ---------- C 魅力改造（仅出牌阶段生效 + 玩家弃置任意张） ----------
const noa = (hand = [], extra = {}) => unit("noa", "female", 50, { skills: noaSkills, hand, ...extra });
const slash = { name: "杀（普攻）", type: "slash" }, tactic = { name: "拆解", type: "tactic" };
const battleOf = (allies, phase = 4) => ({ allies, enemies: [], turn: 1, phase });
const inPhase = (allies, phase = 4) => { ctx.state = { battle: battleOf(allies, phase) }; return ctx.state.battle; };
let drawn = 0;
const draw = (u, n) => { drawn += n; for (let i = 0; i < n; i++) u.hand.push({ name: "摸" + i, type: "tactic" }); };

inPhase([noa()]);
T("C1 出牌阶段：诺亚的杀牌免杀意", Charm.noIntentCost(noa(), slash) === true);
T("C2 出牌阶段：诺亚的非杀牌不免杀意", Charm.noIntentCost(noa(), tactic) === false);
T("C3 出牌阶段：别人打杀不免杀意", Charm.noIntentCost(unit("lokar", "male", 50, { skills: noaSkills }), slash) === false);
T("C4 出牌阶段：没学过技能不免杀意", Charm.noIntentCost(unit("noa", "female", 50, { skills: [] }), slash) === false);
lines.length = 0;
Charm.playKillLine(ctx.state, noa(), slash);
T("C5 出牌阶段：使用杀台词在出杀时播放", lines.length === 1 && lines[0].name === "使用杀", lines);
lines.length = 0;
Charm.playKillLine(ctx.state, noa(), tactic);
T("C6 出牌阶段：非杀牌不播使用杀台词", lines.length === 0, lines);

// 非出牌阶段（准备/判定/摸牌/弃牌/结束）三项一律不生效。
[1, 2, 3, 5, 6].forEach((phase, idx) => {
  inPhase([noa()], phase);
  const free = Charm.noIntentCost(noa(), slash);
  lines.length = 0; Charm.playKillLine(ctx.state, noa(), slash);
  const n = noa([{ name: "1", type: "tactic" }]);
  ctx.state = { battle: battleOf([n], phase) };
  drawn = 0; discarded.length = 0;
  const changed = Charm.balanceHand(ctx.state, n, draw);
  T(`C7.${idx + 1} 阶段${phase}不生效（免杀意/台词/补牌全停）`,
    free === false && lines.length === 0 && changed === 0 && drawn === 0 && n.hand.length === 1,
    { phase, free, lines: lines.length, changed, drawn, hand: n.hand.length });
});

// 出牌阶段：少于上限摸至上限。
let n1 = noa([{ name: "1", type: "tactic" }]);
ctx.state = { battle: battleOf([n1]) };
drawn = 0; Charm.balanceHand(ctx.state, n1, draw);
T("C8 出牌阶段：少于上限摸至上限（4）", drawn === 3 && n1.hand.length === 4, { drawn, hand: n1.hand.length });

// 出牌阶段：多于上限 → 开「弃牌阶段同款」挂起，绝不替玩家自动弃、也不弹专用选牌窗。
let n2 = noa(Array.from({ length: 6 }, (_, i) => ({ name: "c" + i, type: "tactic" })));
const charmB = battleOf([n2]);
charmB.activeUid = n2.uid;   // 玩家弃牌选择只在诺亚自己的出牌阶段开启
ctx.state = { battle: charmB };
discarded.length = 0; drawn = 0;
const r2 = Charm.balanceHand(ctx.state, n2, draw);
T("C9 多于上限：不自动弃牌", discarded.length === 0 && n2.hand.length === 6 && r2 === 0, { hand: n2.hand.length, discarded: discarded.length });
T("C10 多于上限：只挂 noaCharmDiscard（无弹窗、不锁战斗）",
  charmB.noaCharmDiscard?.need === 2 && charmB.noaCharmDiscard?.unitUid === n2.uid
  && !charmB.handReveal && !charmB.locked, { charm: charmB.noaCharmDiscard, locked: charmB.locked });
T("C11 挂起只记张数、不限定选哪张（玩家可弃任意张）",
  charmB.noaCharmDiscard?.validIndexes === undefined
  && charmB.noaCharmDiscard?.indexes === undefined
  && charmB.discardPick === null, charmB.noaCharmDiscard);
// 挂起期间重复调用保持幂等：不补牌、不弃牌、不再挂起。
const r2b = Charm.balanceHand(ctx.state, n2, draw);
T("C12 挂起期间重复调用幂等（不重复摸牌/弃牌）",
  r2b === 0 && drawn === 0 && discarded.length === 0 && charmB.noaCharmDiscard?.need === 2,
  { r2b, drawn, discarded: discarded.length });
// 模拟标准弃牌流程（selectDiscardIndexes → confirmDiscard → discardCards 一次性结算）：
// 玩家故意挑第 0 张、再挑中间第 2 张，证明不是固定弃末尾。
const picked = [n2.hand.splice(0, 1)[0], n2.hand.splice(2, 1)[0]];
picked.forEach(card => discarded.push({ u: n2.ref, card: card.name, pile: "discard" }));
charmB.noaCharmDiscard = null;
charmB.discardPick = null;
const r3 = Charm.balanceHand(ctx.state, n2, draw);
T("C13 确认弃置后手牌回到上限、挂起清除、不补牌",
  r3 === 0 && n2.hand.length === 4 && !charmB.noaCharmDiscard && drawn === 0,
  { r3, hand: n2.hand.length, drawn });
T("C14 弃的是玩家挑的任意两张（c0、c3，不是末尾两张）",
  discarded.map(d => d.card).join(",") === "c0,c3", discarded.map(d => d.card));

let n3 = noa(Array.from({ length: 4 }, (_, i) => ({ name: "c" + i, type: "tactic" })));
ctx.state = { battle: battleOf([n3]) };
drawn = 0; discarded.length = 0;
T("C15 恰好等于上限时不动", Charm.balanceHand(ctx.state, n3, draw) === 0 && drawn === 0 && discarded.length === 0 && n3.hand.length === 4);

// 出牌阶段内他人出牌仍会把诺亚补到上限（onlySelf 只用于「阶段开始」那一处）。
let n4 = noa([{ name: "1", type: "tactic" }]);
const other = unit("loki", "female", 50, { hand: [{ name: "x", type: "tactic" }] });
ctx.state = { battle: battleOf([other, n4]) };
drawn = 0; Charm.balanceHand(ctx.state, other, draw);
T("C16 出牌阶段内他人出牌也能把诺亚补到上限", drawn === 3 && n4.hand.length === 4, { drawn, hand: n4.hand.length });
n4.hand = Array.from({ length: 6 }, (_, i) => ({ name: "z" + i, type: "tactic" }));
ctx.state = { battle: battleOf([other, n4]) };
const selfOnly = Charm.balanceHand(ctx.state, other, draw, { onlySelf: true });
T("C17 onlySelf：别家回合不替诺亚开弃牌选择", selfOnly === 0 && !ctx.state.battle.locked
  && !ctx.state.battle.handReveal && !ctx.state.battle.noaCharmDiscard,
  { selfOnly, locked: ctx.state.battle.locked, charm: ctx.state.battle.noaCharmDiscard });

// 可见牌不足 need 时走自动弃兜底，避免弹窗里选不完导致回合挂死。
let n5 = noa([{ name: "v0", type: "tactic" }]
  .concat(Array.from({ length: 5 }, (_, i) => ({ name: "p" + i, type: "tactic", _pendingDraw: true }))));
ctx.state = { battle: battleOf([n5]) };
discarded.length = 0;
Charm.balanceHand(ctx.state, n5, draw);
T("C18 可见牌不足时自动弃兜底、不会卡住回合",
  discarded.length === 2 && n5.hand.length === 4 && !ctx.state.battle.locked
  && !ctx.state.battle.noaCharmDiscard,
  { discarded: discarded.length, hand: n5.hand.length, locked: !!ctx.state.battle.locked });

// ---------- D 改造副作用 ----------
const male = (uid, hp = 50) => unit(uid, "male", hp);
const female = (uid, hp = 50) => unit(uid, "female", hp);
let a = noa();
ctx.state = { battle: { allies: [a], enemies: [], turn: 2 } };
T("D1 无男性队友时手牌上限=基础4", Side.handLimit(a) === 4, Side.handLimit(a));
ctx.state.battle.allies.push(male("m1"));
T("D2 每有一名存活男性手牌上限+1", Side.handLimit(a) === 5, Side.handLimit(a));
ctx.state.battle.allies.push(male("m2", 0), female("f1"));
T("D3 阵亡男性不计入、女性不计入", Side.handLimit(a) === 5, Side.handLimit(a));
T("D4 非诺亚返回 null", Side.handLimit(female("f1")) === null);

let hits = [];
const damage = (state, target, amount, source, actor, card) => hits.push({ target: target.uid, amount, source, actor: actor?.uid });
a = noa(); a.tempAttack = 2;
ctx.state = { battle: { allies: [a, male("m1"), male("m2"), male("dead", 0), female("f1"), male("selfish", 50)], enemies: [], turn: 3 } };
// 让 selfish 成为另一个诺亚？不，性别男即可；排除自身按 uid 判定。
ctx.state.battle.allies = [a, male("m1"), male("m2"), male("dead", 0), female("f1")];
lines.length = 0; logs.length = 0;
Side.endTurn(ctx.state, a, { damage });
T("D5 结束阶段只打其他存活男性", hits.length === 2 && hits.every(h => h.target.startsWith("m") && h.amount === 5), hits);
T("D6 伤害数值=攻击力+临时攻击(3+2)", hits.length === 2 && hits.every(h => h.amount === 5), hits);
T("D7 播放对男性伤害台词", lines.some(l => l.unit === "noa" && l.name === "改造副作用"), lines);
hits = []; Side.endTurn(ctx.state, female("f1"), { damage });
T("D8 非诺亚不触发", hits.length === 0, hits);

a = noa();
ctx.state = { battle: { allies: [a, female("f1")], enemies: [unit("e1", "male", 40)], turn: 7 } };
ctx.__virtual = null;
const fired = Side.beginPlayPhase(ctx.state, a);
T("D9 无存活男性时触发狂暴", fired === true, fired);
T("D10 目标可为友方或敌方（不含自己）", ctx.__virtual?.target === "f1" && ctx.state.battle.enemies.some(e => e.uid === "e1"), ctx.__virtual);
T("D11 虚拟牌为【咬杀】", ctx.__virtual?.card?.name === "咬杀" && ctx.__virtual?.card?.generatedBySkill === "改造副作用", ctx.__virtual?.card);
T("D12 之后跳过本回合出牌阶段", a.skipPlayPhase === true && a.skipPlayReason === "改造副作用", { skip: a.skipPlayPhase, reason: a.skipPlayReason });
ctx.__virtual = null;
Side.beginPlayPhase(ctx.state, a);
T("D13 同一回合不重复触发", ctx.__virtual === null, ctx.__virtual);
const b2 = noa();
ctx.state = { battle: { allies: [b2, male("m1")], enemies: [], turn: 8 } };
ctx.__virtual = null;
Side.beginPlayPhase(ctx.state, b2);
T("D14 有存活男性时不狂暴、不跳过", ctx.__virtual === null && !b2.skipPlayPhase, { virtual: ctx.__virtual, skip: b2.skipPlayPhase });

// ---------- E 解锁链路静态装配 ----------
const vill = read("villa-defeat-events.js"), villaJs = read("villa.js");
const dungeon = read("local-core-dungeon.js"), charCore = read("local-core-character.js");
const progress = read("unlock-event-progress.js"), hints = read("data.js");
const skins = read("data-skins.js"), bundles = fs.readFileSync(path.join(__dirname, "publish-bundles.json"), "utf8");
const thirdView = vill.slice(vill.indexOf("function thirdDefeat"), vill.indexOf("function thirdDefeat") + 1400);
T("E1 第三次全军覆没对话完整且正好8句", ["罗卡尔，你又失败了。", "多给她男人，不然她会发狂的。", "好的，妈妈，有了我会试试。"].every(s => thirdView.includes(s)) && (thirdView.match(/\["贝丝妲"|\["罗卡尔"/g) || []).length === 8, (thirdView.match(/\["贝丝妲"|\["罗卡尔"/g) || []).length);
T("E2 事件按钮与弹窗映射齐备", vill.includes("data-third-defeat-complete") && read("app-hall-bindings.js").includes("data-third-defeat-complete") && villaJs.includes("thirdDefeat: window.VillaEvents.thirdDefeat"));
T("E3 第三次全军覆没计数", dungeon.includes("defeatCount >= 3") && dungeon.includes("thirdDefeatSeen"));
T("E4 事件只开放兑换不直接解锁", read("hall-unlock-events.js").includes('noUnlock: true') && read("local-core-events.js").includes('id === "noa_nursery"'));
T("E5 殿堂兑换校验旗标与100宝珠", charCore.includes('id === "noa" && !core.flags.noaNurseryUnlocked') && hints.includes('noa: "首次第三次全军覆没后触发剧情，消耗精华宝珠 ×100"'));
T("E6 解锁进度与存档恢复登记", progress.includes('"noa_nursery"') && read("store-unlock-recovery.js").includes('state.hallModal = "thirdDefeat"'));
T("E7 皮肤含默认与10级特殊", skins.includes("noa_default") && skins.includes("noa_level_10_special") && skins.includes("noa-level-10-special.e3c6be5c.webp"));
T("E8 两个技能文件已进构建清单", bundles.includes("noa-charm-skills.js") && bundles.includes("noa-side-effect-skills.js"));
T("E9 管家手册清单已同步", fs.readFileSync(path.join(__dirname, "test-butler-manual-goals-live.js"), "utf8").includes('"怪面诺亚"'));
T("E10 免杀意/使用杀台词挂接入主流程", read("battle-card-playability.js").includes("NoaCharmSkills?.noIntentCost") && read("battle-combat.js").includes("NoaCharmSkills?.playKillLine"));
T("E11 手牌平衡只在出牌阶段生效（统一入口 + 出牌后钩子）",
  read("battle-turn-input.js").includes("NoaCharmSkills?.enterPlayPhase")
  && read("noa-charm-skills.js").includes("function enterPlayPhase")
  && read("noa-charm-skills.js").includes("balanceHand(state, unit, draw || window.BattleSystem?.draw, { onlySelf: true })")
  && read("battle-card-resume-hooks.js").includes("NoaCharmSkills?.balanceHand")
  && !read("battle-turn-start.js").includes("NoaCharmSkills?.balanceHand")
  && !read("battle-end-phase.js").includes("NoaCharmSkills?.balanceHand"));
T("E14 出牌阶段开始以 onlySelf 调用且 draw 已装配",
  read("noa-charm-skills.js").includes("{ onlySelf: true }")
  && read("noa-charm-skills.js").includes("draw || window.BattleSystem?.draw")
  && read("battle-turn-preparation.js").includes("combat, draw, record")
  && read("noa-charm-skills.js").includes("opts?.onlySelf"));
T("E15 溢出弃牌复用弃牌阶段同款（手牌区选牌 + confirmDiscard → discardCards）",
  read("ui-hand-state.js").includes("modes.charmDiscard")
  && read("battle-action-hand-bindings.js").includes("noaCharmDiscard")
  && read("battle-discard-flow.js").includes("if (charm)")
  && read("battle-discard-flow.js").includes("discardCards(state, unit, cards)")
  && read("battle-discard-flow.js").includes("NoaCharmSkills?.balanceHand"));
T("E16 不再有专用弹窗/强制模式，也不再锁战斗",
  !read("battle-response-ui.js").includes('"noaCharmDiscard"')
  && !read("battle-action-special-bindings.js").includes('"noaCharmDiscard"')
  && !read("battle-combat-responses.js").includes('p.mode === "noaCharmDiscard"')
  && read("noa-charm-skills.js").includes("b.noaCharmDiscard = { unitUid: owner.uid, need }"));
T("E17 三个生效判据都带出牌阶段守卫",
  read("noa-charm-skills.js").includes("const PLAY_PHASE = 4")
  && read("noa-charm-skills.js").includes("inPlayPhase")
  && read("noa-charm-skills.js").includes("b.phase !== PLAY_PHASE"));
T("E12 结束阶段与狂暴挂接入主流程", read("battle-end-phase.js").includes("NoaSideEffectSkills?.endTurn") && read("battle-turn-start.js").includes("NoaSideEffectSkills?.beginPlayPhase"));
T("E13 动态手牌上限被三处消费", ["ui-common.js", "battle-runtime-helpers.js", "battle-ai-helpers.js"].every(f => read(f).includes("NoaSideEffectSkills?.handLimit")));

console.log(`\nRESULT ${pass}/${total}`);
if (pass !== total) process.exit(1);
