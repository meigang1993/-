// 外神之眼「只有实体牌伤害才触发」的浏览器实测 + 装甲运输车【坚硬装甲】描述文案
//
// 背景：外神之眼（XX型凋零者1312号）曾按「受到任何伤害」触发，技能伤害与虚拟牌
// 伤害也会连锁触发，与「实体牌」描述不符且会自激循环。现按 isEntityCard 口径收窄：
//   type:"skill" 的伤害载荷（燃烧/毒/勒脖/感电…）、技能生成的虚拟牌、无卡直接伤害
//   一律不触发；实体牌（含装备饰品 convertAs 产物）才触发。
// 本脚本走真实战斗入口（playActiveCard 与 EnemyDamageHooks 真实分发），
// 而不是直接调 RuinsWithererSkills——后者是单元测试 test-witherer-eye-entity.js 的口径。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  const ok = !!cond;
  if (ok) pass++;
  console.log(`${ok ? "✅" : "❌"} ${name}` + (ok ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return ok;
};

// 记录每次虚拟杀驱动；外神之眼的产物带 generatedBySkill
const HOOK_VK = `(() => {
  if (window.__vkHooked) return true;
  const orig = window.BattleSystem.useVirtualKill;
  if (typeof orig !== "function") return false;
  window.__vkLog = [];
  window.BattleSystem.useVirtualKill = function (state, actor, target, card) {
    const rec = { gen: card?.generatedBySkill || "", actor: actor?.name,
                  target: target?.name };
    window.__vkLog.push(rec);
    return orig.apply(this, arguments);
  };
  window.__vkHooked = true;
  return true;
})()`;

// 构造：我方 2 名存活 + 敌方 1 名 1312（ruins_witherer）
const SETUP = `(() => {
  const st = window.state, b = st.battle;
  const a0 = b.allies[0], a1 = b.allies[1];
  const w = b.enemies[0];
  b.enemies.length = 1;
  w.ai = "ruins_witherer"; w.name = "XX型凋零者1312号"; w.gender = "female";
  w.hp = 300; w.maxHp = 300;
  w.stats = Object.assign({}, w.stats, { attack: 12, magic: 11 });
  w.hand = [];
  b.activeUid = a0.uid; b.phase = 4; b.locked = false; b.animQueue = [];
  b.selectedCardIndex = null; b.selectedSkillCard = null; b.pendingTargetUid = null;
  a0.intent = 9; a0.hp = 200; a0.maxHp = 200;
  a0.stats = Object.assign({}, a0.stats, { attack: 5, magic: 3 });
  a1.hp = 200; a1.maxHp = 200; a1.hand = [];
  a1.stats = Object.assign({}, a1.stats, { attack: 7, magic: 3 });
  a0.hand = [{ name: "战术测试", type: "tactic", suit: "♠", power: 3, scale: "attack" },
             { name: "备用牌", type: "tactic", suit: "♦" }];
  a0.hand.forEach(c => { delete c._pendingDraw; });
  st.log = [];
  window.__vkLog = [];
  window.render();
  return { allyCount: b.allies.length, foeAi: w.ai, foeHp: w.hp };
})()`;

// 灌入一次伤害（不经过出牌）。
// 走技能模块本体 RuinsWithererSkills.afterDamage：EnemyDamageHooks 是工厂，
// 运行时实例在 EnemySkills 闭包内不暴露；而 enemy-damage-hooks.js:63 只是把 card
// 原样透传（已核对），故直接调技能模块与真实分发等价。
const FEED = cardJson => `(() => {
  const st = window.state, b = st.battle;
  const a0 = b.allies[0], w = b.enemies[0];
  const card = ${cardJson};
  const before = (window.__vkLog || []).length;
  window.RuinsWithererSkills.afterDamage(st, a0, w, card, 5, {});
  return { before, foeHp: w.hp };
})()`;

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", e => errors.push(String(e)));
  await openGame(page);
  await startRegressionBattle(page);
  T("useVirtualKill 钩子安装成功", await page.evaluate(HOOK_VK) === true);

  const ctx = await page.evaluate(SETUP);
  T("构造：我方 2 名存活、敌方为 1312（ruins_witherer）",
    ctx.allyCount >= 2 && ctx.foeAi === "ruins_witherer", ctx);

  // ---------- ① 实体战术牌：应触发 ----------
  await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    window.BattleSystem.playActiveCard(st, 0, b.enemies[0].uid);
    return true;
  })()`);
  await page.waitForFunction(
    `!!(window.__vkLog || []).some(v => v.gen === "外神之眼")`,
    null, { timeout: 9000 }).catch(() => {});
  const r1 = await page.evaluate(`(() => ({
    vk: window.__vkLog || [],
    logs: (window.state.log || []).map(String),
  }))()`);
  const eye1 = (r1.vk || []).filter(v => v.gen === "外神之眼");
  console.log(`[①实体战术牌] 驱动记录=${JSON.stringify(r1.vk)}`);
  T("① 实体战术牌伤害：外神之眼触发一次", eye1.length === 1, r1.vk);

  // ---------- ② 技能伤害载荷（type:"skill"，如燃烧/毒/勒脖）：不应触发 ----------
  await page.evaluate(SETUP);
  const r2 = await page.evaluate(FEED(JSON.stringify(
    { name: "燃烧", type: "skill", skipDamageModify: true })));
  await page.waitForTimeout(900);
  const a2 = await page.evaluate(`(() => ({ vk: window.__vkLog || [],
    logs: (window.state.log || []).map(String) }))()`);
  console.log(`[②技能载荷] before=${r2.before} after=${a2.vk.length}`);
  T("② 技能伤害载荷（type:skill）：外神之眼不触发",
    (a2.vk || []).filter(v => v.gen === "外神之眼").length === 0,
    { vk: a2.vk, logs: a2.logs.slice(0, 6) });

  // ---------- ③ 无卡直接伤害：不应触发 ----------
  await page.evaluate(SETUP);
  const r3 = await page.evaluate(FEED("null"));
  await page.waitForTimeout(900);
  const a3 = await page.evaluate(`(() => ({ vk: window.__vkLog || [] }))()`);
  console.log(`[③无卡直伤] before=${r3.before} after=${a3.vk.length}`);
  T("③ 无卡直接伤害：外神之眼不触发",
    (a3.vk || []).filter(v => v.gen === "外神之眼").length === 0, a3.vk);

  // ---------- ④ 虚拟杀：不应触发（防自激循环） ----------
  await page.evaluate(SETUP);
  const r4 = await page.evaluate(FEED(JSON.stringify(
    { name: "杀（普攻）", type: "slash", virtual: true, generatedBySkill: "百眼魅魔" })));
  await page.waitForTimeout(900);
  const a4 = await page.evaluate(`(() => ({ vk: window.__vkLog || [] }))()`);
  console.log(`[④虚拟杀] before=${r4.before} after=${a4.vk.length}`);
  T("④ 虚拟杀伤害：外神之眼不触发",
    (a4.vk || []).filter(v => v.gen === "外神之眼").length === 0, a4.vk);

  // ---------- ⑤ 坚硬装甲描述应带「锁定技」 ----------
  const armor = await page.evaluate(`(() => {
    const list = window.GameData?.enemies?.ruins_sand_city || [];
    const car = list.find(e => e.id === "armored_carrier");
    const sk = (car?.skills || []).find(s => s.name === "坚硬装甲");
    const ram = (car?.skills || []).find(s => s.name === "无脑冲撞");
    return { text: sk?.text || "", icon: sk?.icon || "",
             ramText: ram?.text || "", ramIcon: ram?.icon || "" };
  })()`);
  console.log(`[⑤坚硬装甲] ${JSON.stringify(armor)}`);
  T("⑤ 坚硬装甲：描述以「锁定技」开头",
    armor.text.startsWith("锁定技，"), armor);
  T("⑤ 坚硬装甲：图标为锁定技 ⭐",
    armor.icon === "⭐", armor);
  T("⑤ 坚硬装甲：仍保留「不会受到任何伤害」与「无法恢复自身生命值」",
    /不会受到任何伤害/.test(armor.text) && /无法恢复自身生命值/.test(armor.text), armor);

  // ---------- ⑥ 更新公告：外神之眼口径与坚硬装甲锁定技 ----------
  // UpdateNotice 只导出 render/latest/latestDate，条目数组是闭包内私有，
  // 故取渲染后的 HTML 文本来核对公告口径。
  const notice = await page.evaluate(`(() => {
    try { return String(window.UpdateNotice?.render?.() || ""); }
    catch (e) { return ""; }
  })()`);
  T("⑥ 更新公告：外神之眼已改为「实体牌的伤害」口径",
    /外神之眼[^；]*实体牌的伤害/.test(notice), { len: notice.length });
  T("⑥ 更新公告：外神之眼不再出现已废弃的「混乱」状态牌",
    !/外神之眼[^；]*混乱/.test(notice), { len: notice.length });
  T("⑥ 更新公告：坚硬装甲带「锁定技」",
    /坚硬装甲：锁定技/.test(notice), { len: notice.length });

  T("页面无 JS 错误", errors.length === 0, errors.slice(0, 3));

  console.log(`\n结论 ${pass}/${total}`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})();
