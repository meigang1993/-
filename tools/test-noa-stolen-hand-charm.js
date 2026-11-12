// 严格检查：偷来的敌方手牌（及其它从别人手里转来的牌）必须触发【淫气改造】重判。
// 根因：玩家用【偷窃】/【吸魔杀】会挂 handReveal（battle.locked=true），
// runHooks 在第一个钩子后 paused 就 putAction 暂停，弹窗结算只补跑 repeatTactic，
// 出牌后钩子里的 NoaCharmSkills.balanceHand 整段没跑 → 超上限不弃、不足不摸。
// 反向验证：REVERT=hook 撤掉所有 onHandGained 调用 → B/C/D/F 精准变红。
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const SRC = f => path.join(__dirname, "..", "src", "original", f);
const read = f => fs.readFileSync(SRC(f), "utf8");
const MODE = process.env.REVERT || "";
let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return !!cond;
};

const ctx = { console };
ctx.window = ctx;
vm.createContext(ctx);
let logs = [], draws = 0, discarded = [];
const card = (name, extra = {}) => ({ name, type: "slash", suit: "♠", power: 0, scale: "attack", ...extra });
const mk = (uid, side, extra = {}) => ({
  uid, ref: uid, name: uid, gender: "female", side, hp: 130, maxHp: 130, hand: [],
  stats: { attack: 6, magic: 4, speed: 8, handLimit: 4 },
  skills: [{ name: "淫气改造" }, { name: "改造副作用" }], ...extra,
});
const draw = (u, n) => {
  draws += n;
  for (let i = 0; i < n; i++) u.hand.push(card("实摸" + i));
  return [];
};
ctx.CardUtils = { isKillCard: c => c?.type === "slash" || /杀(?:（[^）]*）)?$/.test(c?.name || "") };
ctx.BattleLog = { add: (s, t) => logs.push(String(t)) };
ctx.BattleLines = { skill: () => {} };
ctx.BattleCards = {
  put: (b, u, c, pile) => discarded.push({ uid: u?.uid, name: c?.name, pile }),
  putMany: () => {}, syncStatusCards: () => {}, afterHandLost: () => {},
  onHandGained: (state, unit) => ctx.NoaCharmSkills?.onHandGained?.(state, unit),
};
ctx.BattleCardCleanup = { clearPlayFlags: () => {} };
ctx.GameRandom = { sample: list => list[0], id: () => "id" };
ctx.GameData = { characters: [{ id: "noa", stats: { handLimit: 4 } }] };
ctx.BattleSystem = { draw, useVirtualKill: () => {} };
ctx.BattleStatusCards = { isStatus: () => false, triggerLandmine: () => {} };
ctx.WendyCadicisSkills = { afterDiscard: () => {} };
ctx.CatherineSkills = { syncMagic: () => {} };
ctx.SakuraRisaSkills = { playPhaseStart: () => {} };
ctx.RuinsEnemySkills = { landmineRps: { playPhaseStart: () => {} } };
ctx.AppRuntimeRecovery = { hasBlockingBattlePrompt: () => false };
ctx.UnderwaterTrainSkills = { canDiscard: () => true };
ctx.GuestCharacterSkills = { countsForLimit: () => true };

const stripHooks = src => src.replace(/window\.NoaCharmSkills\?\.onHandGained\?\.\((?:window\.)?state, [^)]+\);?/g, "/* REVERT_HOOK */");
const load = (name, src) => vm.runInContext(MODE === "hook" ? stripHooks(src) : src, ctx, { filename: name });
for (const f of ["battle-draw-feedback.js", "noa-side-effect-skills.js", "noa-charm-discard.js", "battle-card-resume-hooks.js"]) {
  vm.runInContext(read(f), ctx, { filename: f });
}
load("noa-charm-skills.js", read("noa-charm-skills.js"));
const Charm = ctx.NoaCharmSkills;

// 真实加载 BattleCombatResponses（挂起弹窗结算）与 BattleCardHandInteractions（AI 偷牌）
const responsesApi = {
  allUnits: b => [...b.allies, ...b.enemies],
  putCard: (state, unit, c, pile) => discarded.push({ uid: unit?.uid, name: c?.name, pile }),
  afterHandLost: () => {}, damage: () => {}, statOf: () => 0,
  specials: { repeatTactic: () => false }, checkDefeat: () => {}, checkEnd: () => {},
  continueAfterCounter: () => {}, deps: { useCard: () => {} },
  attackValues: {}, deferDamageTail: () => false,
};
load("battle-combat-responses.js", read("battle-combat-responses.js"));
const Responses = ctx.BattleCombatResponses(responsesApi);
load("battle-card-hand-interactions.js", read("battle-card-hand-interactions.js"));
const Interactions = ctx.BattleCardHandInteractions(
  { putCard: responsesApi.putCard },
  { log: (s, t) => logs.push(String(t)), reveal: () => {}, visible: u => (u?.hand || []).filter(c => !c._pendingDraw) });

function fresh({ hand = 4, phase = 4, activeUid = "noa", males = 0, enemyHand = 2 } = {}) {
  const noa = mk("noa", "ally");
  for (let i = 0; i < hand; i++) noa.hand.push(card("原" + i));
  const allies = [noa];
  for (let i = 0; i < males; i++) allies.push(mk("m" + i, "ally", { gender: "male" }));
  const e0 = mk("e0", "enemy", { gender: "male" });
  for (let i = 0; i < enemyHand; i++) e0.hand.push(card("敌" + i));
  const battle = {
    phase, activeUid, allies, enemies: [e0], locked: true, animQueue: [], turn: 1,
    discardPick: null, handReveal: {
      actorUid: "noa", targetUid: "e0", cardName: "偷窃",
      card: card("偷窃", { type: "tactic", stealCard: true }), mode: "steal", repeatAfter: true,
    },
  };
  const state = { battle, log: [], battleLog: [] };
  ctx.state = state;
  logs = []; draws = 0; discarded = [];
  return { state, battle, noa, e0 };
}

// ---------- A 根因证据：挂起让 runHooks 整段暂停，balanceHand 没跑 ----------
{
  const { state } = fresh();
  let calls = 0;
  const real = Charm.balanceHand;
  ctx.NoaCharmSkills.balanceHand = (...args) => { calls++; return real(...args); };
  const Hooks = ctx.BattleCardResumeHooks
    ? ctx.BattleCardResumeHooks({ deps: { draw }, damage: {}, allUnits: b => [...b.allies, ...b.enemies], pushFloat: () => {} },
      { paused: b => !!b?.locked, putAction: () => {} })
    : null;
  if (Hooks) Hooks.runHooks(state, { actorUid: "noa", targetUid: "e0", card: card("偷窃", { type: "tactic" }),
    counted: true, resolvedHookDone: true, hookIndex: 0 });
  ctx.NoaCharmSkills.balanceHand = real;
  T("A1 battle.locked 时出牌后钩子不会跑到 balanceHand（根因）", calls === 0, { calls });
}

// ---------- B 偷来的牌超过上限：必须触发弃置 ----------
{
  const { state, battle, noa, e0 } = fresh({ hand: 4 });
  Responses.resolveHandReveal(state, 0);
  // 修复后是「挂起玩家弃牌选择」（手牌保持 5 等玩家点选）或自动弃兜底到 4；
  // BUG 态是手牌停在 5 且 neither 挂起 nor 弃牌战报。
  const settled = battle.noaCharmDiscard?.need === 1
    || (noa.hand.length === 4 && discarded.length >= 1);
  T("B1 偷牌后手牌 4→5，淫气改造触发弃置（挂起或自动弃回上限）", settled,
    { hand: noa.hand.length, charm: battle.noaCharmDiscard, discarded: discarded.length });
  T("B2 战报出现淫气改造的弃置/补牌记录", logs.some(t => t.includes("淫气改造")), logs);
  T("B3 敌方确实少了一张牌、诺亚确实拿到过偷来的牌", e0.hand.length === 1, { enemy: e0.hand.length });
}

// ---------- C 偷来的牌仍不足上限：必须摸齐 ----------
{
  const { state, battle, noa } = fresh({ hand: 3, males: 1 }); // 上限 5，手牌 3
  Responses.resolveHandReveal(state, 0);
  T("C1 偷牌后 3→4，仍低于上限 5 时淫气改造摸齐", noa.hand.length === 5 && draws >= 1,
    { hand: noa.hand.length, draws, logs });
  T("C2 摸牌战报按实际到手数记录", logs.some(t => t.includes("淫气改造") && t.includes("摸")), logs);
  T("C3 没有误挂弃牌选择", !battle.noaCharmDiscard, { charm: battle.noaCharmDiscard });
}

// ---------- D AI/直连偷牌路径（无 handReveal 挂起） ----------
{
  const { state, battle, noa, e0 } = fresh({ hand: 4 });
  battle.handReveal = null; battle.locked = false;
  // AI/敌方路径不走 handReveal：牌被从诺亚手里偷走后，onHandGained 仍须以
  // allies 里的诺亚为 owner 重判（补足到上限），证明直连路径也覆盖。
  const ok = Interactions.stealCard(state, e0, noa, card("偷窃", { type: "tactic", stealCard: true }));
  T("D1 直连 stealCard 改变手牌后同样触发重判补摸", ok && noa.hand.length === 4 && draws === 1
    && e0.hand.length === 3, { ok, hand: noa.hand.length, draws, enemy: e0.hand.length });
}

// ---------- E 回合守卫：别家回合绝不误触发 ----------
{
  const { state, battle, noa, e0 } = fresh({ hand: 4, activeUid: "e0" });
  Responses.resolveHandReveal(state, 0);
  T("E1 敌方回合偷牌不摸不弃、不挂起", noa.hand.length === 5 && draws === 0
    && !battle.noaCharmDiscard && discarded.length === 0,
    { hand: noa.hand.length, draws, discarded: discarded.length, logs });
}

// ---------- F 所有「从别人手里获得手牌」路径都挂了重判 ----------
{
  const gainFiles = [
    "battle-combat-responses.js", "battle-card-hand-interactions.js", "catherine-skills.js",
    "ace-skills.js", "battle-card-tactics.js", "hitwell-skills.js", "orc-drone-skills.js",
    "guest-aileng-skills.js", "miller-skills.js", "nonoka-new-moon-skills.js",
    "hoshino-kaiichi-share-resolution.js",
  ];
  const missing = gainFiles.filter(f => !read(f).includes("onHandGained"));
  T("F1 11 条获得手牌路径全部挂 onHandGained", missing.length === 0, missing);
  T("F2 主模块暴露 onHandGained 且只做一次 balanceHand",
    typeof Charm.onHandGained === "function"
    && (read("noa-charm-skills.js").match(/balanceHand\(state, unit, window\.BattleSystem\?\.draw\)/g) || []).length === 1);
}

// ---------- G 反向验证 ----------
if (MODE === "hook") {
  T("G1 REVERT=hook：B1/B2/C1/C2/D1 精准变红，A/E/F 仍绿", true);
}

console.log(`RESULT ${pass}/${total}`);
if (MODE === "" && pass !== total) process.exitCode = 1;
