// 饰品主动技「实体手牌转换牌」的伤害回归
//   背景：魅魔钢叉→【魅杀】、刺客胶衣→【刺杀】此前造成 0 伤害。
//   根因：转换牌保留了 _skill 标记，CardUtils.damageStatKey 走到
//   `if (card?._skill) return null`，攻击力/魔力加成整段归零；而这两张牌
//   基础值本身为 0（杀牌 cardPower=0），最终打出 0。
//   修复：damageStatKey 对「饰品转换牌」按牌面 scale 取键，不落 _skill 分支。
//   口径：魅魔钢叉 scale=magic → 魔力；刺客胶衣 scale=attack → 攻击力；
//         鬼王扑克（战术牌无 scale）沿用默认分支 → 魔力，与修复前默认一致。
//   注意：每个用例都开全新页面。此前复用同一页面时，前一用例残留的状态会
//   污染后一用例（刺客胶衣误测出 8 而非攻击力 5），隔离后复现不到该数值。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const FOE = 0;
const ATTACK = 5, MAGIC = 7;
let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return cond ? 1 : 0;
};

const browser = { launched: null };
async function freshPage() {
  if (!browser.launched) browser.launched = await chromium.launch();
  const page = await browser.launched.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await openGame(page);
  await startRegressionBattle(page);
  return { page, errors };
}

// 统一环境：我方罗卡尔 attack=5/magic=7，敌方 0 号换成希尔德且清空手牌
// （不清空会触发【看破】等自动反击，让战术牌用例变成测反制而非测伤害）
const setupTpl = (allyRelics, allyHand, foeHand) => `(() => {
  const st = window.state, b = st.battle;
  const a = b.allies[0], e = b.enemies[${FOE}];
  b.activeUid = a.uid; b.phase = 4; b.locked = false; b.animQueue = [];
  b.selectedCardIndex = null; b.selectedSkillCard = null; b.pendingTargetUid = null;
  a.intent = 5; a.hp = 200; a.maxHp = 200; a.tempAttack = 0;
  a.stats = Object.assign({}, a.stats, { attack: ${ATTACK}, magic: ${MAGIC} });
  a.battleRelics = ${JSON.stringify(allyRelics || [])};
  a.hand = ${JSON.stringify(allyHand || [])};
  a.hand.forEach(c => { delete c._pendingDraw; });
  b.enemies.forEach(x => { x.hand = []; x.battleRelics = []; });
  // 【魔弹特攻】需要目标有手牌可挑，故允许单独给希尔德塞一张
  e.ai = "ruins_hilde"; e.name = "内英组杀手希尔德";
  e.hp = 400; e.maxHp = 400; e.deck = []; e.discard = [];
  e.hand = ${JSON.stringify(foeHand || [])};
  e.hand.forEach(c => { delete c._pendingDraw; });
  st.log = [];
  window.__hits = [];
  if (!window.__hooked) {
    window.__hooked = true;
    const orig = window.BattleStats.damage;
    window.BattleStats.damage = function (bt, act, tgt, amt) {
      window.__hits.push({ amt, tgt: tgt.name });
      return orig.apply(this, arguments);
    };
  }
  window.render();
  return { ok: true };
})()`;

const readTpl = `(() => {
  const st = window.state, b = st.battle;
  return { hp: b.enemies[${FOE}].hp, hits: window.__hits || [],
           logs: (st.log || []).slice(0, 24).map(String) };
})()`;

// 直接打出手中第 idx 张牌
const playTpl = idx => `(() => {
  const st = window.state, b = st.battle;
  const e = b.enemies[${FOE}];
  const before = e.hp;
  const ok = window.BattleSystem.playActiveCard(st, ${idx}, e.uid);
  return { ok, before };
})()`;

// 发动饰品主动技：选技能 → 选手牌代价 → 选目标 → 打出
const useRelicTpl = skillName => `(() => {
  const st = window.state, b = st.battle;
  const a = b.allies[0], e = b.enemies[${FOE}];
  const skills = window.UICommon.skillsOf(a) || [];
  const idx = skills.findIndex(s => s.name === ${JSON.stringify(skillName)});
  if (idx < 0) return { noSkill: true, names: skills.map(s => s.name) };
  const picked = window.BattleSystem.selectSkill(st, idx);
  const cost = window.BattleSystem.selectCard(st, 0);
  const aimed = window.BattleSystem.chooseTarget(st, e.uid);
  const before = e.hp;
  const ok = window.BattleSystem.playSelectedCard(st);
  return { picked, cost, aimed, ok, before, intent: a.intent };
})()`;

async function runCase(label, fn) {
  const { page, errors } = await freshPage();
  const result = await fn(page);
  await page.close();
  return { ...result, errors };
}

(async () => {
  // ===== 对照：普通实体【杀】应造成 攻击力 伤害 =====
  let r = await runCase("对照", async page => {
    await page.evaluate(setupTpl([], [{ name: "杀", type: "slash", suit: "♠", scale: "attack" }]));
    const played = await page.evaluate(playTpl(0));
    await page.waitForTimeout(900);
    const after = await page.evaluate(readTpl);
    return { played, after, dmg: played.before - after.hp };
  });
  console.log(`[对照·实体杀] 伤害=${r.dmg} hits=${JSON.stringify(r.after.hits)}（攻击力${ATTACK}）`);
  T("对照：普通实体【杀】造成攻击力伤害", r.dmg === ATTACK && r.errors.length === 0, r.after);

  // ===== 魅魔钢叉：红桃牌 → 【魅杀】，scale=magic → 魔力 =====
  r = await runCase("钢叉", async page => {
    await page.evaluate(setupTpl(["魅魔钢叉"], [{ name: "杀", type: "slash", suit: "♥", scale: "attack" }]));
    const played = await page.evaluate(useRelicTpl("魅魔钢叉"));
    await page.waitForTimeout(1200);
    const after = await page.evaluate(readTpl);
    return { played, after, dmg: played.before - after.hp };
  });
  console.log(`[魅魔钢叉] 伤害=${r.dmg} hits=${JSON.stringify(r.after.hits)}（魔力${MAGIC}）`);
  console.log(`  日志 ${JSON.stringify(r.after.logs.filter(t => /魅杀|魅魔钢叉/.test(t)).slice(0, 2))}`);
  T("魅魔钢叉：【魅杀】不再造成 0 伤害",
    r.played.noSkill !== true && r.dmg > 0 && r.errors.length === 0, r);
  T("魅魔钢叉：【魅杀】按魔力结算（scale=magic）", r.dmg === MAGIC, r);

  // ===== 刺客胶衣：黑色牌 → 【刺杀】，scale=attack → 攻击力 =====
  r = await runCase("胶衣", async page => {
    await page.evaluate(setupTpl(["刺客胶衣"], [{ name: "杀", type: "slash", suit: "♣", scale: "attack" }]));
    const played = await page.evaluate(useRelicTpl("刺客胶衣"));
    await page.waitForTimeout(1200);
    const after = await page.evaluate(readTpl);
    return { played, after, dmg: played.before - after.hp };
  });
  console.log(`[刺客胶衣] 伤害=${r.dmg} hits=${JSON.stringify(r.after.hits)}（攻击力${ATTACK}）`);
  console.log(`  日志 ${JSON.stringify(r.after.logs.filter(t => /刺杀|刺客胶衣/.test(t)).slice(0, 2))}`);
  T("刺客胶衣：【刺杀】不再造成 0 伤害",
    r.played.noSkill !== true && r.dmg > 0 && r.errors.length === 0, r);
  T("刺客胶衣：【刺杀】按攻击力结算（scale=attack）", r.dmg === ATTACK, r);

  // ===== 鬼王扑克：手牌 → 战术牌，无 scale → 沿用默认 magic =====
  // 实战数值难以稳定构造（【魔弹特攻】要目标展示牌、自己再弃同花色牌，且会被
  // 【看破】反制），故改为直接校验 damageStatKey 的取值：修复前这里会落到
  // _skill → null（加成归零），修复后应与默认分支一致为 magic。
  r = await runCase("扑克", async page => {
    await page.evaluate(setupTpl(["鬼王扑克"],
      [{ name: "杀", type: "slash", suit: "♠", scale: "attack" }],
      [{ name: "杀", type: "slash", suit: "♠", scale: "attack" }]));
    return page.evaluate(`(() => {
      const b = window.state.battle, a = b.allies[0];
      const cost = { name: "杀", type: "slash", suit: "♠" };
      const converted = window.CardUtils.convertAs("魔法对决", cost, {
        type: "tactic", originalType: cost.type, convertedTactic: true,
        _skill: true, _relicSkill: true, _skipHandMove: true,
        _entitySourceCard: cost, _entityConversion: true,
      });
      const plainTactic = { name: "魔法对决", type: "tactic" };
      return {
        convertedKey: window.CardUtils.damageStatKey(a, converted),
        defaultKey: window.CardUtils.damageStatKey(a, plainTactic),
        hasSkill: !!converted._skill,
      };
    })()`);
  });
  console.log(`[鬼王扑克] 转换牌 statKey=${r.convertedKey}（普通战术牌默认=${r.defaultKey}）`);
  T("鬼王扑克：转换牌不再落到 _skill→null（与默认口径一致）",
    r.convertedKey === r.defaultKey && r.convertedKey === "magic" && r.errors.length === 0, r);

  // ===== 冰心双刺剑（被动转换，本就正常）不应被改坏 =====
  r = await runCase("冰心", async page => {
    await page.evaluate(setupTpl(["冰心双刺剑"], []));
    await page.evaluate(`(() => {
      const b = window.state.battle, a = b.allies[0];
      a.deck = [{ name: "杀", type: "slash", suit: "♠", scale: "attack" }];
      a.discard = []; a.hand = [];
      window.BattleSystem.draw(a, 1, b);
      a.hand.forEach(c => { delete c._pendingDraw; });
      return a.hand.map(c => c.name);
    })()`);
    const played = await page.evaluate(playTpl(0));
    await page.waitForTimeout(900);
    const after = await page.evaluate(readTpl);
    return { played, after, dmg: played.before - after.hp };
  });
  console.log(`[冰心双刺剑] 伤害=${r.dmg} hits=${JSON.stringify(r.after.hits)}（攻击力${ATTACK}）`);
  console.log(`  日志 ${JSON.stringify(r.after.logs.filter(t => /冰心双刺剑|刺杀/.test(t)).slice(0, 2))}`);
  T("冰心双刺剑：【刺杀】仍按攻击力结算（未被改坏）", r.dmg === ATTACK, r);

  if (browser.launched) await browser.launched.close();
  console.log(`\n=== ${pass}/${total} 通过 ===`);
  process.exit(pass === total ? 0 : 1);
})();
