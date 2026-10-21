// 专项：【魔之连杀】的额外连锁不应以「主目标造成生命值伤害」为前提
//
// 描述：「指定一名敌方角色，造成等同于魔力值的伤害；根据你【杀】牌数量，
//       额外随机指定等量目标。」
// 即：只要这张牌指定了目标，就按【杀】牌数额外随机指定等量目标。
//
// 旧实现的触发点挂在 afterDamage（命中后才跑）。主目标一旦被【闪】抵消、
// 被守护，或结算瞬间战斗已锁定，afterDamage 根本不会执行 → 额外目标全部
// 不结算，与描述不符。现改由 battle-damage.js 的伤害出口统一触发。
//
// 判据：主目标被【闪】抵消（hpLoss=0）时，额外目标是否仍然结算。
// 防假通过：先跑「正常命中」对照，证明链路本身会连锁，再比对闪避场景。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass += 1; console.log(`✅ ${name}${extra ? " — " + extra : ""}`); }
  else { fail += 1; console.log(`❌ ${name}${extra ? " — " + extra : ""}`); }
}

const MAGIC = 10;

// 返回每个友方单位的掉血量与战报文本
async function play(page, { giveFlash }) {
  await startRegressionBattle(page);
  const setup = await page.evaluate(`(() => {
    const state = window.state, b = state.battle;
    const actor = b.enemies[0];
    actor.hp = 500; actor.maxHp = 500; actor.intent = 9;
    actor.stats = actor.stats || {};
    actor.stats.attack = ${MAGIC}; actor.stats.magic = ${MAGIC};
    actor.tempAttack = 0; actor.tempMagic = 0;
    const names = b.allies.map(a => a.name);
    b.allies.forEach(a => {
      a.hand = []; a.hp = 999; a.maxHp = 999; a.block = 0;
      // 摸牌堆剔除响应牌：避免随机摸到【闪】让额外目标也闪掉，判据才稳定
      const deck = a.pileStats?.deck || a.deck || [];
      const kept = deck.filter(c => c && c.type !== "response" && c.name !== "闪");
      if (a.pileStats?.deck) a.pileStats.deck = kept;
      if (a.deck) a.deck = kept;
    });
    const target = b.allies[0];
    if (${giveFlash}) target.hand = [window.CardUtils.fromEntity("闪", { virtual: false })];
    const card = window.CardUtils.fromEntity("魔之连杀", { virtual: false });
    actor.hand = [card];
    b.locked = false; b.animQueue = []; b.reactionQueue = [];
    window.BattleLog.clear(state);
    const before = b.allies.map(a => a.hp);
    window.BattleSystem.useCard(state, actor, target, card);
    return { names, before };
  })()`);
  await page.waitForTimeout(2500);
  const after = await page.evaluate(
    `(() => window.state.battle.allies.map(a => a.hp))()`);
  const logs = await page.evaluate(
    `(() => (window.state.log || []).map(l => String(l.text || l)))()`);
  return {
    names: setup.names,
    lost: setup.before.map((hp, i) => hp - after[i]),
    logs,
  };
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));

  // ===== 对照：主目标正常命中 → 主目标 + 额外目标各掉魔力值 =====
  const a = await play(page, { giveFlash: false });
  console.log(`[对照] ${a.names.map((n, i) => `${n} Δ${a.lost[i]}`).join(" | ")}`);
  const aChain = a.logs.filter(t => /魔之连杀触发/.test(t));
  check("对照 正常命中时触发额外指定", aChain.length === 1,
    `触发 ${aChain.length} 次`);
  check("对照 主目标掉血 = 魔力值", a.lost[0] === MAGIC,
    `主目标 Δ${a.lost[0]}，期望 ${MAGIC}`);
  check("对照 额外目标掉血 = 魔力值", a.lost[1] === MAGIC,
    `额外目标 Δ${a.lost[1]}，期望 ${MAGIC}`);

  // ===== 实验：主目标被【闪】抵消（hpLoss=0）→ 额外目标仍应结算 =====
  const b = await play(page, { giveFlash: true });
  console.log(`[实验] ${b.names.map((n, i) => `${n} Δ${b.lost[i]}`).join(" | ")}`);
  const bFlash = b.logs.filter(t => /自动使用闪/.test(t));
  const bChain = b.logs.filter(t => /魔之连杀触发/.test(t));
  check("实验 主目标确实被闪抵消（未掉血）", b.lost[0] === 0 && bFlash.length >= 1,
    `主目标 Δ${b.lost[0]}，闪记录 ${bFlash.length}`);
  check("实验 被闪后仍触发额外指定", bChain.length === 1,
    `触发 ${bChain.length} 次`);
  check("实验 被闪后额外目标仍掉血 = 魔力值", b.lost[1] === MAGIC,
    `额外目标 Δ${b.lost[1]}，期望 ${MAGIC}（0 表示连锁仍以生命值伤害为前提）`);

  check("无页面报错", errors.length === 0, errors.join(" / "));
  await browser.close();
  console.log(`\n通过 ${pass} / 失败 ${fail}`);
  process.exit(fail ? 1 : 0);
})();
