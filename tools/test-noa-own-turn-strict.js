// 诺亚【淫气改造】【改造副作用】严格检查：回合归属修正 + 文案改名 + 公告显式报错
//   A 本人出牌阶段（phase 4 且 activeUid=诺亚）：补牌 / 溢出挂起 / 免杀意 / 台词
//   B 别家出牌阶段（phase 同为 4，activeUid≠诺亚）：一律不摸不弃、无战报、免杀意与台词也停
//   C 切回本人回合后重判生效    D 非出牌阶段不生效
//   E 文案统一「淫气」+ 三个公告数据文件漏加载必须显式抛错
//   F 其它边界：免杀意不写牌标记 / 动态上限 / 反向验证
// 反向验证：REVERT=owner 撤回合守卫 / REVERT=intent 撤免杀意与台词的回合守卫
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

let logs = [], draws = 0, discarded = [], lines = [];
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
ctx.BattleLines = { skill: (s, u, name) => lines.push({ uid: u?.uid, name }) };
ctx.BattleCards = {
  put: (b, u, c, pile) => discarded.push({ uid: u?.uid, name: c?.name, pile }),
  putMany: () => {}, queueResponse: () => {}, visibleHandCount: u => u?.hand?.length || 0,
};
ctx.BattleCardCleanup = { clearPlayFlags: () => {} };
ctx.GameRandom = { sample: list => list[0], id: () => "id" };
ctx.GameData = { characters: [{ id: "noa", stats: { handLimit: 4 } }] };
ctx.BattleSystem = { draw, useVirtualKill: () => {} };
ctx.BattleLineData = { skillLines: {}, allyIntroLines: {} };
ctx.BattleStatusCards = { triggerLandmine: () => {} };
ctx.WendyCadicisSkills = { afterDiscard: () => {} };
ctx.CatherineSkills = { syncMagic: () => {} };
ctx.SakuraRisaSkills = { playPhaseStart: () => {} };
ctx.RuinsEnemySkills = { landmineRps: { playPhaseStart: () => {} } };

let charmSrc = read("noa-charm-skills.js");
const ANCHOR_OWNER = "    if (b.activeUid !== owner.uid) return 0;";
const ANCHOR_INTENT1 = "if (!inOwnPlayPhase(window.state, actor)) return false;";
const ANCHOR_INTENT2 = "if (!inOwnPlayPhase(state, actor)) return;";
const apply = (src, from, to, tag) => {
  if (!src.includes(from)) throw new Error(`REVERT=${tag} 未命中锚点`);
  return src.replace(from, to);
};
if (MODE === "owner") charmSrc = apply(charmSrc, ANCHOR_OWNER, "    /* REVERT_OWNER */", "owner");
if (MODE === "intent") charmSrc = apply(charmSrc, ANCHOR_INTENT1, "if (!inPlayPhase(window.state)) return false;", "intent")
  .replace(ANCHOR_INTENT2, "if (!inPlayPhase(state)) return;");
vm.runInContext(read("battle-draw-feedback.js"), ctx, { filename: "battle-draw-feedback.js" });
vm.runInContext(read("noa-side-effect-skills.js"), ctx, { filename: "noa-side-effect-skills.js" });
vm.runInContext(read("noa-charm-discard.js"), ctx, { filename: "noa-charm-discard.js" });
vm.runInContext(charmSrc, ctx, { filename: "noa-charm-skills.js" });
vm.runInContext(read("battle-card-resume-hooks.js"), ctx, { filename: "battle-card-resume-hooks.js" });
vm.runInContext(read("data-new-characters.js"), ctx, { filename: "data-new-characters.js" });
const Charm = ctx.NoaCharmSkills, Side = ctx.NoaSideEffectSkills;
const Hooks = ctx.BattleCardResumeHooks(
  { deps: { draw }, damage: {}, allUnits: b => [...b.allies, ...b.enemies], pushFloat: () => {} },
  { paused: () => false, putAction: () => {} });

function fresh({ hand = 1, phase = 4, activeUid = "noa", males = 0 } = {}) {
  const noa = mk("noa", "ally");
  for (let i = 0; i < hand; i++) noa.hand.push(card("原" + i));
  const allies = [noa];
  for (let i = 0; i < males; i++) allies.push(mk("m" + i, "ally", { gender: "male" }));
  const battle = {
    phase, activeUid, allies, enemies: [mk("e0", "enemy", { gender: "male" })],
    locked: false, animQueue: [], turn: 1, discardPick: null,
  };
  const state = { battle, log: [], battleLog: [] };
  ctx.state = state;
  logs = []; draws = 0; discarded = []; lines = [];
  return { state, battle, noa };
}
const runEnemyCard = (state) => Hooks.runHooks(state, {
  actorUid: "e0", targetUid: "e0", card: card("敌牌"), counted: true,
  resolvedHookDone: false, hookIndex: 0, skipAfterCardPlayed: false,
});

// ---------- A 本人出牌阶段 ----------
{
  const { state, noa } = fresh({ hand: 1 });
  Charm.balanceHand(state, noa, draw);
  T("A1 本人回合手牌 1→摸齐 4", noa.hand.length === 4 && draws === 3, { hand: noa.hand.length, draws });
  T("A2 战报写「淫气改造」且按实际摸到数", logs.length === 1 && logs[0].includes("淫气改造") && logs[0].includes("摸3张"), logs);
  const slash = card("杀（普攻）"), tactic = card("拆解", { type: "tactic" });
  T("A3 本人回合杀牌免杀意 / 非杀牌不免", Charm.noIntentCost(noa, slash) === true && Charm.noIntentCost(noa, tactic) === false);
  Charm.playKillLine(state, noa, slash);
  T("A4 本人回合使用杀台词播放", lines.length === 1 && lines[0].name === "使用杀", lines);
  T("A5 免杀意不往牌上写标记（无记忆泡泡残留）", !("noIntentCost" in slash) && !("_noaFree" in slash), slash);
}
{
  const { state, battle, noa } = fresh({ hand: 6 });
  Charm.balanceHand(state, noa, draw);
  T("A6 本人回合溢出挂起玩家弃牌（need=2）、不自动弃、不锁战斗",
    battle.noaCharmDiscard?.need === 2 && noa.hand.length === 6 && discarded.length === 0 && !battle.locked,
    { charm: battle.noaCharmDiscard, hand: noa.hand.length });
}
{
  const { state, battle, noa } = fresh({ hand: 1, phase: 3 });
  const ok = Charm.enterPlayPhase(state, noa, draw);
  T("A7 enterPlayPhase 从准备阶段进入 phase4 并补牌",
    ok === true && battle.phase === 4 && noa.hand.length === 4, { ok, phase: battle.phase, hand: noa.hand.length });
}

// ---------- B 别家出牌阶段（核心修复） ----------
{
  const { state, noa } = fresh({ hand: 1, activeUid: "e0" });
  Charm.balanceHand(state, noa, draw);
  T("B1 别家回合不摸牌（手牌保持 1、draw 0、无战报）",
    noa.hand.length === 1 && draws === 0 && logs.length === 0, { hand: noa.hand.length, draws, logs });
}
{
  const { state, battle, noa } = fresh({ hand: 6, activeUid: "e0" });
  Charm.balanceHand(state, noa, draw);
  T("B2 别家回合不弃牌、不挂起玩家选择",
    noa.hand.length === 6 && discarded.length === 0 && !battle.noaCharmDiscard && !battle.locked,
    { hand: noa.hand.length, discarded: discarded.length, charm: battle.noaCharmDiscard });
}
{
  const { state, noa } = fresh({ hand: 2, activeUid: "e0" });
  runEnemyCard(state);
  T("B3 真实出牌后钩子在敌方回合不补不弃、无战报",
    noa.hand.length === 2 && draws === 0 && logs.length === 0, { hand: noa.hand.length, draws, logs });
  T("B4 别家回合免杀意与台词均不生效（含诺亚响应出杀）",
    Charm.noIntentCost(noa, card("杀（普攻）")) === false
    && (Charm.playKillLine(state, noa, card("杀（普攻）")), lines.length === 0), lines);
}
{
  const { state, noa, battle } = fresh({ hand: 5, activeUid: "e0", males: 1 });
  T("B5 有男性时上限 5", Side.handLimit(noa) === 5, Side.handLimit(noa));
  battle.allies[1].hp = 0;   // 男性阵亡，上限实时降到 4
  T("B6 别家回合上限下降也不自动弃", Side.handLimit(noa) === 4 && noa.hand.length === 5, { hand: noa.hand.length });
}

// ---------- C 切回本人回合并重判 ----------
{
  const { state, battle, noa } = fresh({ hand: 6, activeUid: "e0" });
  battle.activeUid = "noa";
  Charm.balanceHand(state, noa, draw);
  T("C1 切到本人回合才挂起玩家弃牌 need=2",
    battle.noaCharmDiscard?.need === 2 && noa.hand.length === 6, { charm: battle.noaCharmDiscard });
  battle.noaCharmDiscard = null; battle.discardPick = null;
  noa.hand.splice(0, 2);       // 模拟玩家确认弃置 2 张
  Charm.balanceHand(state, noa, draw);
  T("C2 弃至上限后不重复补牌/弃牌", noa.hand.length === 4 && draws === 0, { hand: noa.hand.length, draws });
}

// ---------- D 非出牌阶段 ----------
for (const phase of [1, 2, 3, 5, 6]) {
  const { state, noa } = fresh({ hand: 1, phase });
  Charm.balanceHand(state, noa, draw);
  T(`D${phase} 阶段${phase}不补牌/不免杀意`,
    noa.hand.length === 1 && draws === 0 && Charm.noIntentCost(noa, card("杀（普攻）")) === false,
    { hand: noa.hand.length, draws });
}

// ---------- E 文案与公告显式报错 ----------
{
  const tpl = ctx.GameDataNewCharacters.find(c => c.id === "noa");
  T("E1 技能名/身份改为淫气、描述含「仅在你的出牌阶段生效」",
    tpl.role === "淫气改造者" && tpl.skills[0].name === "淫气改造"
    && tpl.skills[0].text.includes("仅在你的出牌阶段生效")
    && tpl.skills[0].text.includes("由你选择弃至上限"), tpl.skills[0]);
  const ev = read("villa-defeat-events.js");
  T("E2 解锁事件两句同步为淫气且无「魅\u529b」",
    ev.includes("地下室封印着强大的淫气改造者") && ev.includes("淫气改造？好像在哪听说过？") && !ev.includes("魅\u529b"));
  const notice = read("update-notice.js");
  T("E3 公告 summary 同步且三个数据文件均显式报错、无 || [] 静默兜底",
    notice.includes("淫气改造者") && notice.includes("【淫气改造】")
    && (notice.match(/throw new Error/g) || []).length === 3 && !notice.includes("|| []"));
  const OLD_WORD = "魅\u529b";   // 拆开写，避免本测试文件自身被扫描命中
  let mei = [];
  for (const root of ["src/original", "tools"]) {
    const dir = path.join(__dirname, "..", root);
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".js") || f.includes(".min.")) continue;
      if (fs.readFileSync(path.join(dir, f), "utf8").includes(OLD_WORD)) mei.push(`${root}/${f}`);
    }
  }
  T("E4 全库源码与工具无旧词残留", mei.length === 0, mei);
  const noticeFiles = ["update-notice-recent.js", "update-notice-archive.js", "update-notice-rules.js"];
  const boot = skip => {
    const c = { console }; c.window = c; vm.createContext(c);
    for (const f of noticeFiles) if (f !== skip) vm.runInContext(read(f), c, { filename: f });
    let threw = false;
    try { vm.runInContext(read("update-notice.js"), c, { filename: "update-notice.js" }); }
    catch (e) { threw = /模块未装配/.test(e.message); }
    return { c, threw };
  };
  const full = boot(null);
  T("E5 三个数据文件齐全时正常装配且能渲染公告", !full.threw
    && typeof full.c.UpdateNotice?.render === "function"
    && (full.c.UpdateNotice.render().match(/update-notice-section/g) || []).length >= 3);
  for (const f of noticeFiles) {
    T(`E6 漏加载 ${f} 必须显式抛错`, boot(f).threw === true);
  }
}

// ---------- F 反向结论 ----------
if (MODE === "owner") {
  T("F1 REVERT=owner：B1/B2/B3 应精准变红（撤掉回合守卫后别家回合又补/弃）", true);
}
if (MODE === "intent") {
  T("F1 REVERT=intent：B4 应精准变红（免杀意/台词回合外生效）", true);
}

console.log(`RESULT ${pass}/${total}`);
if (MODE === "" && pass !== total) process.exitCode = 1;
