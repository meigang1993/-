// 【反击类触发口径】真实浏览器回归（306 版）。
//
// 覆盖：通用反击面板 4 类（复仇反击 / 刺刀AK47 / 终焉回旋斩 / 血色刺伞）
// 在「实体杀 / 虚拟杀」触发、「战术牌 / 技能载荷 / 反击生成杀」不触发；
// 血色刺伞的响应上下文（responseTo / triggerCard）传递；统一判据在真实
// 装配下的矩阵；以及真实 useCard 完整杀链路不崩。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle, collectErrors, relevantErrors } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const passed = [];
const T = (n, ok, d = "") => {
  passed.push(!!ok);
  console.log(`${ok ? "✅" : "❌"} ${n}${ok ? "" : "  ← " + JSON.stringify(d)}`);
  return !!ok;
};

// 复位 + 场景构造 + 调用 + 快照必须在**同一个 evaluate 作用域**里跑，
// 否则 extra 里 `const e = ...` 在第二个 evaluate 中不可见。
const RESET_BODY = extra => `
  const st = window.state, b = st.battle;
  b.locked = false; b.animQueue = []; b._damageDepth = 0; b.phase = 4;
  ['counterTrigger','counterTriggerQueue','thunderHammer','manualDodge',
   'karunaBubble','dimensionTransfer','opheliaGuard','crazySlaughterResume']
    .forEach(k => { b[k] = null; });
  b.skillCaptions = []; b.skillCaption = null; b.relicCaptions = []; b.relicCaption = null;
  st.battleLog = []; st.log = [];
  window.__fires = [];
  b.allies = []; b.enemies = [];
  ${extra || ""}
  window.render && window.render();
`;

const UNIT = (name, over = {}) => `Object.assign({
  uid: "u_${name}", name: "${name}", side: "ally", hp: 100, maxHp: 100,
  hand: [], discard: [], consumed: [], statuses: [], skills: [], battleRelics: [],
}, ${JSON.stringify(over)})`;

const CARDS = `
  const E = { name: "杀（普攻）", type: "slash", suit: "♠", scale: "attack" };
  const V = { ...E, virtual: true };
  const T = { name: "魔弹特攻", type: "tactic", suit: "♥" };
  const S = { name: "燃烧", type: "skill", burningTick: true };
  const C = { ...E, virtual: true, counterattack: true };
`;

const FIRES = `({ fires: window.__fires || [], counter: window.state.battle.counterTrigger?.skill || null,
  log: window.state.battleLog.slice(0, 6) })`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = collectErrors(page);
  await openGame(page);
  await startRegressionBattle(page);

  // 只包一次 open，收集每次「可发动」面板的技能名
  await page.evaluate(`(() => {
    const b = window.state.battle;
    // 保存开战时的完整单位模板：后面的场景会替换 allies/enemies 为精简构造体，
    // F 段跑真实 useCard 需要 stats / ref 等完整字段。
    window.__tplAllies = JSON.parse(JSON.stringify(b.allies));
    window.__tplEnemies = JSON.parse(JSON.stringify(b.enemies));
    const orig = window.BattleCounterTriggers.open;
    window.BattleCounterTriggers.open = function (...args) {
      (window.__fires ||= []).push(args[1]?.skill || "?");
      return orig.apply(this, args);
    };
    return true;
  })()`);

  const run = async (label, extra, expr) => page.evaluate(`(() => {
    ${CARDS}
    ${RESET_BODY(extra)}
    ${expr};
    return ${FIRES};
  })()`);

  // ── A. 复仇反击（afterDodge：成为杀目标并使用闪） ──
  const revengeSetup = `
    const g = ${UNIT("格洛特", { ref: "gerlot", skills: [{ name: "复仇反击" }] })};
    const e = ${UNIT("敌人", { side: "enemy" })};
    b.allies = [g]; b.enemies = [e];
  `;
  for (const [label, card, want] of [
    ["实体杀", "E", true], ["虚拟杀", "V", true],
    ["战术牌", "T", false], ["技能载荷", "S", false], ["反击生成杀", "C", false],
  ]) {
    const r = await run(label, revengeSetup,
      `window.BertisGerlotSkills.afterDodge(state, e, g, ${card}, { damage: () => {} })`);
    T(`A 复仇反击 / ${label}：${want ? "触发" : "不触发"}`, (r.fires.includes("复仇反击")) === want, r);
  }

  // ── B. 刺刀AK47（afterDamage：受击后反击） ──
  const mannySetup = `
    const m = ${UNIT("曼妮", { ref: "manny", mannyWeapon: "ak47" })};
    const e = ${UNIT("敌人", { side: "enemy" })};
    b.allies = [m]; b.enemies = [e];
  `;
  for (const [label, card, want] of [
    ["实体杀", "E", true], ["虚拟杀", "V", true],
    ["战术牌", "T", false], ["技能载荷", "S", false], ["反击生成杀", "C", false],
  ]) {
    const r = await run(label, mannySetup,
      `window.MannySkills.afterDamage(state, e, m, ${card}, 5, () => {}, () => {})`);
    T(`B 刺刀AK47 / ${label}：${want ? "触发" : "不触发"}`, (r.fires.includes("刺刀AK47")) === want, r);
  }

  // ── C. 终焉回旋斩（afterDodge：闪抵消杀） ──
  const bestaSetup = `
    const be = ${UNIT("贝丝妲", { ref: "besta", hand: [{ name: "魔杀", type: "slash", suit: "♠", scale: "attack" }] })};
    const e = ${UNIT("敌人", { side: "enemy" })};
    b.allies = [be]; b.enemies = [e];
  `;
  for (const [label, card, want] of [
    ["实体杀", "E", true], ["虚拟杀", "V", true],
    ["战术牌", "T", false], ["技能载荷", "S", false], ["反击生成杀", "C", false],
  ]) {
    const r = await run(label, bestaSetup,
      `window.GuestCharacterSkills.afterDodge(state, e, be, ${card}, { damage: () => {} })`);
    T(`C 终焉回旋斩 / ${label}：${want ? "触发" : "不触发"}`, (r.fires.includes("终焉回旋斩")) === want, r);
  }

  // ── D. 血色刺伞（响应上下文：只有响应杀才发动） ──
  const umbrellaSetup = `
    const u = ${UNIT("丽莎", { battleRelics: ["血色刺伞"] })};
    const e = ${UNIT("敌人", { side: "enemy" })};
    b.allies = [u]; b.enemies = [e];
  `;
  for (const [label, api, want] of [
    ["响应实体杀", "{ responseTo: E, useCard: () => {}, damage: () => {} }", true],
    ["响应虚拟杀", "{ responseTo: V, useCard: () => {}, damage: () => {} }", true],
    ["triggerCard 实体杀", "{ triggerCard: E, useCard: () => {}, damage: () => {} }", true],
    ["响应战术牌", "{ responseTo: T, useCard: () => {}, damage: () => {} }", false],
    ["响应技能载荷", "{ responseTo: S, useCard: () => {}, damage: () => {} }", false],
    ["无响应上下文", "{ useCard: () => {}, damage: () => {} }", false],
  ]) {
    const r = await run(label, umbrellaSetup,
      `window.SakuraRisaSkills.afterResponse(state, u, { name: "闪", type: "response" }, ${api})`);
    T(`D 血色刺伞 / ${label}：${want ? "触发" : "不触发"}`, (r.fires.includes("血色刺伞")) === want, r);
  }

  // ── E. 真实装配下的统一判据矩阵 ──
  const matrix = await page.evaluate(`(() => {
    const R = window.BattleCounterattackRules;
    const E = { name: "杀（普攻）", type: "slash", suit: "♠" };
    const rows = [
      ["实体单体杀", { ...E }, true, true],
      ["虚拟单体杀", { ...E, virtual: true }, true, true],
      ["虚拟群体杀", { ...E, virtual: true, sweep: true }, true, false],
      ["战术牌", { name: "魔弹特攻", type: "tactic" }, false, false],
      ["技能载荷(名字带杀)", { name: "锁魂杀", type: "skill" }, false, false],
      ["状态DOT", { name: "燃烧", type: "skill", burningTick: true }, false, false],
      ["反击生成杀", { ...E, virtual: true, counterattack: true }, false, false],
      ["undefined", undefined, false, false],
    ];
    return rows.map(([label, card, want, wantSingle]) => ({
      label, got: R.isTriggerCard(card), want,
      gotSingle: R.isSingleTriggerCard(card), wantSingle,
    }));
  })()`);
  T("E 真实页面装配：8 类伤害载荷判据矩阵全部符合口径",
    matrix.every(r => r.got === r.want && r.gotSingle === r.wantSingle), matrix);

  // ── F. 完整杀链路冒烟：实体杀正常结算、无 JS 错误 ──
  const smoke = await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    b.locked = false; b.animQueue = []; b.phase = 4;
    const a = JSON.parse(JSON.stringify(window.__tplAllies[0]));
    const e = JSON.parse(JSON.stringify(window.__tplEnemies[0]));
    b.allies = [a]; b.enemies = [e]; b.activeUid = a.uid;
    a.hp = 100; a.maxHp = 100; e.hp = 100; e.maxHp = 100;
    const slash = { name: "杀（普攻）", type: "slash", suit: "♠", scale: "attack", power: 1 };
    a.hand = [slash];
    window.BattleSystem.useCard(st, a, e, slash);
    return { hp: e.hp, locked: b.locked };
  })()`);
  T("F 真实 useCard 实体杀链路可结算（无异常抛出）",
    typeof smoke.hp === "number" && smoke.hp <= 100, smoke);

  const rel = relevantErrors(errors);
  T("G 全程无 pageerror / console error", rel.length === 0, rel.slice(0, 3));
  console.log(`\nRESULT ${passed.filter(Boolean).length}/${passed.length}`);
  await browser.close();
  process.exit(passed.every(Boolean) ? 0 : 1);
})().catch(e => { console.error("LIVE_FAIL", e.message); process.exit(2); });
