// 1312 触发口径审计（虚拟牌 / 技能伤害 / 生成牌 一律不触发）
//   外神之眼：仅实体牌伤害可触发
//   魅魔吸精术：仅实体战术牌可触发
// 检测方式：挂钩 BattleLines.skill 同步置位，避免依赖动画播完（曾出现假通过）；
// 每个用例同时校验掉血，掉血为 0 的用例判无效。
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

const virtualKill = (skill) => ({
  name: "杀（普攻）", type: "slash", power: 0, scale: "attack", suit: "",
  temporary: true, void: true, noIntentCost: true, generatedBySkill: skill,
});
const skillHit = (name, extra = {}) => ({ name, type: "skill", ...extra });

// [用例名, 卡牌对象, 期望外神之眼是否触发, 是否走 useVirtualKill]
const CASES = [
  ["实体杀", { name: "杀（普攻）", type: "slash", suit: "♠", power: 0, scale: "attack" }, true, false],
  ["实体战术牌", { name: "火球", type: "tactic", suit: "♠", power: 3, scale: "attack" }, true, false],
  ["转换杀·魅魔钢叉", { name: "魅杀", type: "slash", suit: "♥", convertedFrom: "杀（普攻）" }, true, false],
  ["虚拟杀·螺旋桨", virtualKill("螺旋桨"), false, true],
  ["虚拟杀·混乱", virtualKill("混乱"), false, true],
  ["虚拟杀·偷袭", virtualKill("偷袭"), false, true],
  ["虚拟杀·外神之眼自产", virtualKill("外神之眼"), false, true],
  ["虚拟杀·百眼魅魔自产", virtualKill("百眼魅魔"), false, true],
  ["虚拟杀·妖刀村雨", { name: "杀（普攻）", type: "slash", virtual: true, sourceName: "妖刀村雨" }, false, true],
  ["组合进攻虚拟杀", { name: "杀（普攻）", type: "slash", virtual: true, comboAttackVirtual: true }, false, true],
  ["追魂之刃虚拟杀", { name: "杀（普攻）", type: "slash", virtual: true, _soulBladeRepeat: true }, false, true],
  ["坦克炮弹", { name: "坦克炮弹", type: "skill", sweep: true, targetless: true, virtual: true, scale: "attack" }, false, false],
  ["技能伤害·燃烧", skillHit("燃烧", { fire: true, burningTick: true, skipDamageModify: true }), false, false],
  ["技能伤害·毒", skillHit("毒", { poison: true, poisonTick: true }), false, false],
  ["技能伤害·感电", skillHit("感电", { shockBonus: true, ignoreResponse: true }), false, false],
  ["技能伤害·勒脖", skillHit("勒脖", { ignoreResponse: true, skipDamageModify: true }), false, false],
  ["技能伤害·锁魂镰刀", skillHit("锁魂镰刀", { soulScythe: true, magicDamage: true, ignoreBlock: true }), false, false],
  ["技能伤害·机尾机枪", skillHit("机尾机枪", { sweep: true, ignoreResponse: true }), false, false],
  ["技能伤害·星光拔刀斩", skillHit("星光拔刀斩", { ignoreResponse: true, skipDamageModify: true }), false, false],
  ["技能伤害·爱之鞭挞", skillHit("爱之鞭挞", { magicDamage: true, ignoreResponse: true }), false, false],
  ["技能伤害·恐怖巨锤", skillHit("恐怖巨锤", { ignoreResponse: true }), false, false],
  ["技能伤害·苦肉鞭笞", skillHit("苦肉鞭笞", { ignoreResponse: true, skipDamageModify: true }), false, false],
  ["技能伤害·潜影背刺", skillHit("潜影背刺", { ignoreResponse: true, skipDamageModify: true }), false, false],
  ["技能伤害·充能精华", skillHit("充能精华", { magicDamage: true, ignoreResponse: true }), false, false],
  ["技能伤害·刺弹爆炸", skillHit("刺弹爆炸", { spikeExplosion: true }), false, false],
  ["技能伤害·自爆倒计时", skillHit("自爆倒计时", { magicDamage: true }), false, false],
  ["虚拟战术牌·与我一战", { name: "与我一战", type: "tactic", virtual: true, skillName: "控神魔眼" }, false, false],
  ["生成牌·拷贝魔眼", { name: "杀（普攻）", type: "slash", copiedByEdis: true, temporary: true, void: true, generatedBySkill: "拷贝魔眼" }, false, false],
  // 芙萝娅【神速之袭】：由 CardUtils.fromEntity 生成，强制 virtual:true 且额外挂
  // _entitySourceCard。曾因「带 _entitySourceCard 就算实体牌」的例外被误判成实体。
  ["虚拟杀·神速之袭(fromEntity)", "刺杀", false, false, true],
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

  console.log("=== 外神之眼：触发口径审计 ===");
  const only = process.env.ONLY || "";
  for (const [name, card, expect, asVirtualKill, fromEntity] of CASES) {
    if (only && !name.includes(only)) continue;
    await page.evaluate(reset);
    await page.evaluate(`(() => {
      const st = window.state, b = st.battle;
      const a0 = b.allies[0], w = b.enemies[0];
      const card = ${fromEntity
        ? `window.CardUtils.fromEntity(${JSON.stringify(card)}, { _entitySourceCard: { name: "杀（普攻）", type: "slash" }, _speedAssaultSettlement: {} })`
        : JSON.stringify(card)};
      if (${asVirtualKill}) window.BattleSystem.useVirtualKill(st, a0, w, card);
      else window.BattleSystem.damage(st, w, 5, "${name}", a0, card);
      return true;
    })()`);
    // 同步检测：外神之眼台词一旦播出立即置位，最多等 4 秒
    await page.waitForFunction(`window.__eye === true`, null, { timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(300);
    const r = await page.evaluate(`(() => ({
      eye: window.__eye, before: window.__hpBefore,
      now: window.state.battle.enemies[0].hp, logs: window.__logs.slice() }))()`);
    const loss = r.before - r.now;
    T(`外神之眼 · ${name} → ${expect ? "应触发" : "不应触发"}（掉血${loss}）`,
      loss > 0 && r.eye === expect, { fired: r.eye, expect, loss, logs: r.logs.slice(0, 3) });
  }

  console.log("\n=== 魅魔吸精术：触发口径审计 ===");
  const drainCases = [
    ["实体战术牌", { name: "火球", type: "tactic", suit: "♠", power: 3, scale: "attack" }, true],
    ["虚拟战术牌·与我一战", { name: "与我一战", type: "tactic", virtual: true, skillName: "控神魔眼" }, false],
    ["虚拟杀", { name: "杀（普攻）", type: "slash", virtual: true }, false],
    ["技能伤害·燃烧", skillHit("燃烧", { fire: true, burningTick: true }), false],
    ["生成牌·拷贝魔眼战术", { name: "与我一战", type: "tactic", copiedByEdis: true, generatedBySkill: "拷贝魔眼" }, false],
  ];
  for (const [name, card, expect] of drainCases) {
    await page.evaluate(reset);
    await page.evaluate(`(() => {
      const st = window.state, b = st.battle;
      const w = b.enemies[0], a0 = b.allies[0];
      a0.gender = "male";
      a0.hand = [{ name: "甲", type: "slash", suit: "♠" }];
      a0.hand.forEach(c => { delete c._pendingDraw; });
      window.__hpBefore = a0.hp;
      const card = ${JSON.stringify(card)};
      window.BattleSystem.damage(st, a0, 5, "${name}", w, card);
      return true;
    })()`);
    await page.waitForFunction(`window.__drain === true`, null, { timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(300);
    const r = await page.evaluate(`(() => ({
      drain: window.__drain, before: window.__hpBefore,
      now: window.state.battle.allies[0].hp, logs: window.__logs.slice() }))()`);
    const loss = r.before - r.now;
    T(`魅魔吸精术 · ${name} → ${expect ? "应触发" : "不应触发"}（掉血${loss}）`,
      loss > 0 && r.drain === expect, { fired: r.drain, expect, loss, logs: r.logs.slice(0, 3) });
  }

  console.log(`\n页面错误: ${errors.length}${errors.length ? " → " + errors.slice(0, 3).join(" | ") : ""}`);
  console.log(`\n=== ${pass}/${total} 通过 ===`);
  await page.close();
  await browser.close();
  process.exit(pass === total && errors.length === 0 ? 0 : 1);
})();
