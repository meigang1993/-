// 1312 外神之眼：全代码库虚拟牌 / 技能伤害 / 生成牌 穷尽审计
//   背景：芙萝娅【神速之袭】由 CardUtils.fromEntity 生成（强制 virtual:true 且额外挂
//   _entitySourceCard），曾因「带 _entitySourceCard 就算实体牌」的例外被误判成实体牌，
//   导致外神之眼被虚拟杀触发并自激循环。本脚本穷尽覆盖源码里全部造牌点，确认口径一致。
//
//   外神之眼：仅实体牌伤害可触发（virtual / _skill / generatedBySkill / type:"skill" 均不触发）
//   魅魔吸精术：仅实体战术牌可触发
//
// 检测方式：挂钩 BattleLines.skill("外神之眼") 同步置位，避免依赖动画播完（曾出现假通过）；
// 每个用例同时校验掉血，掉血为 0 的用例判无效（防止空跑假通过）。
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
};

// 构造方式：
//   direct     —— 直接给出卡牌对象字面量
//   fromEntity —— 走 CardUtils.fromEntity(name, extra)（源码里 11 处调用点）
//   cloneEntity—— 走 CardUtils.cloneEntity(name, extra)
//   copyPlayable —— 走 CardUtils.copyPlayable(base, extra)
// asVirtualKill —— 是否用 useVirtualKill 而非 damage
// 用例：[名称, 方式, 参数1, 参数2, 期望外神之眼触发, asVirtualKill]
const CASES = [
  // ===== 正向对照：实体牌必须触发 =====
  ["实体杀", "direct", { name: "杀（普攻）", type: "slash", suit: "♠", power: 0, scale: "attack" }, null, true, false],
  ["实体战术牌·火球", "direct", { name: "火球", type: "tactic", suit: "♠", power: 3, scale: "attack" }, null, true, false],
  ["转换杀·魅魔钢叉", "direct", { name: "魅杀", type: "slash", suit: "♥", convertedFrom: "杀（普攻）" }, null, true, false],

  // ===== fromEntity 全部调用点（强制 virtual:true）=====
  ["fromEntity·幻影剑舞(阿部麦克)", "fromEntity", "杀（普攻）", { ignoreResponse: true }, false, false],
  ["fromEntity·妖刀村雨(饰品)", "fromEntity", "杀（普攻）", { noIntentCost: true, sourceName: "妖刀村雨", _skipUseKillTriggers: true }, false, false],
  ["fromEntity·黑暗机枪扫杀(艾迪斯)", "fromEntity", "机枪扫杀", { allTargets: ["x"], aoeLineShown: true, responseKind: "dodge" }, false, false],
  ["fromEntity·芙萝娅刺杀", "fromEntity", "刺杀", { _floraBlade: true }, false, false],
  ["fromEntity·神速之袭(带_entitySourceCard)", "fromEntity", "刺杀", { _entitySourceCard: { name: "杀（普攻）", type: "slash" }, _speedAssaultSettlement: {} }, false, false],
  ["fromEntity·机枪扫杀(机械工厂)", "fromEntity", "机枪扫杀", { allTargets: ["x"], aoeLineShown: true }, false, false],
  ["fromEntity·血色刺伞", "fromEntity", "机枪扫杀", { _skipHandMove: true, skipAfterCardPlayed: true, skipMvpCardCount: true, bloodUmbrella: true, forceAutoResponse: true }, false, false],
  ["fromEntity·控神魔眼·与我一战", "fromEntity", "与我一战", { _skipHandMove: true, skillName: "控神魔眼" }, false, false],
  ["fromEntity·贝尔蒂丝virtualCard", "fromEntity", "杀（普攻）", {}, false, false],
  ["fromEntity·曼尼virtualCard", "fromEntity", "杀（普攻）", {}, false, false],
  ["fromEntity·嘉宾virtualCard", "fromEntity", "杀（普攻）", {}, false, false],

  // ===== cloneEntity + virtual（与神速之袭同模式：挂 _entitySourceCard）=====
  ["cloneEntity·1124号长舌头(饰品)", "cloneEntity", "勒杀", { virtual: true, _skill: true, noIntentCost: true, _entitySourceCard: { name: "杀（普攻）", type: "slash" } }, false, false],
  ["cloneEntity·军令状(饰品)", "cloneEntity", "魔王军入侵", { suit: "♠", virtual: true, _skill: true, _relicSkill: true, _skipHandMove: true, sourceName: "军令状", generatedBySkill: "军令状", skillName: "军令状", bakarTalentSkip: true }, false, false],

  // ===== virtual:true 字面量造牌点 =====
  ["虚拟杀·坦克炮弹(小兵)", "direct", { name: "坦克炮弹", type: "skill", sweep: true, targetless: true, virtual: true, scale: "attack", responseKind: "dodge", twoDodgesRequired: true }, null, false, false],
  ["虚拟杀·鲨影鱼雷", "direct", { name: "鲨影鱼雷", type: "slash", virtual: true, ignoreResponse: true, _torpedoSplash: true, allTargets: ["x"] }, null, false, false],
  ["虚拟杀·圣剑无双反击(莫娜)", "direct", { name: "杀（普攻）", type: "slash", virtual: true, holy: true, twoDodgesRequired: true }, null, false, true],
  ["虚拟杀·战场扫射(精英)", "direct", { name: "战场扫射", _skill: true, ruinsSweep: true, sweep: true, noIntentCost: true, virtual: true }, null, false, false],
  ["虚拟杀·组合进攻", "direct", { name: "杀（普攻）", type: "slash", power: 0, scale: "attack", virtual: true, noIntentCost: true, comboAttackVirtual: true }, null, false, true],
  ["虚拟杀·追魂之刃", "direct", { name: "杀（普攻）", type: "slash", virtual: true, _soulBladeRepeat: true, _skipHandMove: true }, null, false, true],
  ["虚拟杀·拷贝魔眼(艾迪斯)", "direct", { name: "杀（普攻）", type: "slash", virtual: true, edisChain: false, _edisVirtualSlash: true, ignoreBlock: true }, null, false, true],
  ["虚拟杀·魔弹特攻(兽人)", "direct", { name: "魔弹特攻", type: "tactic", magicBullet: true, _skill: true, virtual: true }, null, false, false],
  ["虚拟杀·锁魂镰刀", "direct", { name: "锁魂镰刀", type: "slash", virtual: true, targetless: true }, null, false, false],

  // ===== copyPlayable + generatedBySkill（生成牌）=====
  ["生成牌·偷袭", "copyPlayable", { name: "杀（普攻）", type: "slash", power: 0, scale: "attack", suit: "" }, { temporary: true, void: true, noIntentCost: true, generatedBySkill: "偷袭" }, false, true],
  ["生成牌·混乱", "copyPlayable", { name: "杀（普攻）", type: "slash", power: 0, scale: "attack", suit: "" }, { temporary: true, void: true, noIntentCost: true, generatedBySkill: "混乱" }, false, true],
  ["生成牌·螺旋桨(饰品)", "copyPlayable", { name: "杀（普攻）", type: "slash", power: 0, scale: "attack", suit: "" }, { temporary: true, void: true, noIntentCost: true, generatedBySkill: "螺旋桨" }, false, true],
  ["生成牌·外神之眼自产", "copyPlayable", { name: "杀（普攻）", type: "slash", power: 0, scale: "attack", suit: "" }, { temporary: true, void: true, noIntentCost: true, generatedBySkill: "外神之眼" }, false, true],
  ["生成牌·百眼魅魔自产", "copyPlayable", { name: "杀（普攻）", type: "slash", power: 0, scale: "attack", suit: "" }, { temporary: true, void: true, noIntentCost: true, generatedBySkill: "百眼魅魔" }, false, true],
  ["生成牌·拷贝魔眼", "direct", { name: "杀（普攻）", type: "slash", copiedByEdis: true, temporary: true, void: true, generatedBySkill: "拷贝魔眼" }, null, false, false],
  ["生成牌·影舞步", "direct", { name: "杀（普攻）", type: "slash", temporary: true, void: true, generatedBySkill: "影舞步" }, null, false, false],
  ["生成牌·杀欲窥视", "direct", { name: "杀（普攻）", type: "slash", temporary: true, void: true, noIntentCost: true, withererPeekSlash: true, generatedBySkill: "杀欲窥视" }, null, false, true],

  // ===== 技能伤害（type:"skill"）=====
  ["技能伤害·魔之连杀", "direct", { name: "魔之连杀", type: "slash", scale: "magic", attackType: "magic", magicDamage: true, _chainExtra: true, _skill: true }, null, false, false],
  ["技能伤害·燃烧", "direct", { name: "燃烧", type: "skill", fire: true, burningTick: true, skipDamageModify: true }, null, false, false],
  ["技能伤害·机尾机枪", "direct", { name: "机尾机枪", type: "skill", sweep: true, ignoreResponse: true }, null, false, false],
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await openGame(page);
  await startRegressionBattle(page);

  await page.evaluate(`(() => {
    const b = window.state.battle, w = b.enemies[0];
    w.ai = "ruins_witherer"; w.name = "XX型凋零者1312号"; w.gender = "female";
    b.enemies.length = 1;
    window.__logs = []; window.__eye = false; window.__drain = false;
    if (!window.__origLogAdd) {
      window.__origLogAdd = window.BattleLog.add;
      window.BattleLog.add = function (...args) {
        try {
          const t = String(args[1] ?? args[0]);
          window.__logs.push(t);
          if (t.includes("吸精术触发")) window.__drain = true;
        } catch (e) {}
        return window.__origLogAdd.apply(this, args);
      };
    }
    // 外神之眼在 eyeOfOuterGod 开头同步播台词，用它做同步检测
    if (!window.__origLines) {
      window.__origLines = window.BattleLines.skill;
      window.BattleLines.skill = function (state, unit, name, ...rest) {
        try { if (name === "外神之眼") window.__eye = true; } catch (e) {}
        return window.__origLines.call(this, state, unit, name, ...rest);
      };
    }
    return true;
  })()`);

  const reset = `(() => {
    const st = window.state, b = st.battle, w = b.enemies[0];
    w.hp = 900; w.hand = [];
    b.allies.forEach(a => { a.hp = 900; a.hand = []; a.intent = 9; });
    b.allies.slice(2).forEach(a => { a.hp = 0; });
    b.locked = false; b.activeUid = b.allies[0].uid; b.phase = 4;
    window.__logs = []; window.__eye = false; window.__drain = false;
    window.__hpBefore = w.hp; st.log = [];
    return true;
  })()`;

  console.log("=== 外神之眼：全代码库虚拟牌穷尽审计 ===");
  const only = process.env.ONLY || "";
  for (const [name, mode, arg1, arg2, expect, asVirtualKill] of CASES) {
    if (only && !name.includes(only)) continue;
    await page.evaluate(reset);
    await page.evaluate(`(() => {
      const st = window.state, b = st.battle;
      const a0 = b.allies[0], w = b.enemies[0];
      let card;
      if (${JSON.stringify(mode)} === "fromEntity") {
        card = window.CardUtils.fromEntity(${JSON.stringify(arg1)}, ${JSON.stringify(arg2 || {})});
      } else if (${JSON.stringify(mode)} === "cloneEntity") {
        card = window.CardUtils.cloneEntity(${JSON.stringify(arg1)}, ${JSON.stringify(arg2 || {})});
      } else if (${JSON.stringify(mode)} === "copyPlayable") {
        card = window.CardUtils.copyPlayable(${JSON.stringify(arg1)}, ${JSON.stringify(arg2 || {})});
      } else {
        card = ${JSON.stringify(arg1)};
      }
      if (${asVirtualKill}) window.BattleSystem.useVirtualKill(st, a0, w, card);
      else window.BattleSystem.damage(st, w, 5, ${JSON.stringify(name)}, a0, card);
      window.__cardVirtual = !!card?.virtual;
      window.__cardSkill = !!card?._skill;
      window.__cardGen = card?.generatedBySkill || null;
      return true;
    })()`);
    // 同步检测：外神之眼台词一旦播出立即置位
    await page.waitForFunction(`window.__eye === true`, null, { timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(300);
    const r = await page.evaluate(`(() => ({
      eye: window.__eye, before: window.__hpBefore,
      now: window.state.battle.enemies[0].hp, logs: window.__logs.slice(),
      v: window.__cardVirtual, s: window.__cardSkill, g: window.__cardGen }))()`);
    const loss = r.before - r.now;
    T(`${name} → ${expect ? "应触发" : "不应触发"}（掉血${loss}）`,
      loss > 0 && r.eye === expect,
      { fired: r.eye, expect, loss, virtual: r.v, skill: r.s, gen: r.g, logs: r.logs.slice(0, 3) });
  }

  console.log(`\n页面错误: ${errors.length}${errors.length ? " → " + errors.slice(0, 3).join(" | ") : ""}`);
  console.log(`\n=== ${pass}/${total} 通过 ===`);
  await page.close();
  await browser.close();
  process.exit(pass === total && errors.length === 0 ? 0 : 1);
})();
