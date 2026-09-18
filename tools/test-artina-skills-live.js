// 实战回归：真实浏览器 + 真实出牌流程，检查亚缇娜两个技能的实际效果
// 1) 狙击目标：展示敌方一张手牌，比较双方该花色手牌数，我方多则下一张实体单体杀不可响应
// 2) 蓄力子弹：本回合记录过的花色数 N，下一张实体单体杀伤害 ×(N+1)
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const slashCard = suit => ({ name: "杀", type: "slash", suit, power: 0, damage: 0 });

// 把 allies[0] 变成亚缇娜，并配置手牌 / 敌方手牌
const setupTpl = opt => `(() => {
  const o = ${JSON.stringify(opt)};
  const b = window.state.battle;
  const me = b.allies[0];
  me.ref = "artina"; me.name = "亚缇娜";
  me.skills = [{
    name: "狙击目标", type: "active", icon: "⚔️",
    text: "出牌阶段限一次，展示敌方一张手牌。",
    card: { name: "狙击目标", type: "tactic", artinaSniper: true, enemyTarget: true,
            artName: "狙击目标", icon: "⚔️", text: "选择一名敌方角色，展示其一张手牌。" },
  }];
  me.stats.attack = o.attack; me.stats.magic = 0; me.stats.speed = 99;
  me.hp = 200; me.maxHp = 200;
  // 杀牌需要 intent > 0 才可打出，否则手牌会被渲染为 disabled
  me.intent = 99; me.frozenSlash = false; me.usedSlashCount = 0;
  me.artinaSuits = {}; me.artinaChargedTargetUid = null;
  me.usedArtinaSniper = false;
  // 保留 sweep / targetless 等全部字段：丢弃会让群体杀被判定为单体杀，
  // 从而提前消耗蓄力加成，导致倍率验证失真。
  me.hand = o.hand.map(c => ({ ...c, power: 0, damage: 0 }));
  me.hand.forEach(c => { delete c._pendingDraw; });
  // 敌人：高血量、0 护甲，便于精确读取伤害
  const foe = b.enemies[0];
  foe.hp = 500; foe.maxHp = 500; foe.armor = 0; foe.stats.attack = 0; foe.stats.magic = 0;
  if (foe.stats.armor) foe.stats.armor = 0;
  foe.hand = o.foeHand.map(c => ({ name: c.name, type: c.type, suit: c.suit }));
  foe.hand.forEach(c => { delete c._pendingDraw; });
  b.enemies.slice(1).forEach(e => { e.hp = 0; });
  b.phase = 4; b.activeUid = me.uid; b.locked = false; b.animQueue = [];
  window.state.log = [];
  window.render();
  return { me: me.name, meUid: me.uid, foe: foe.name, foeUid: foe.uid,
           foeHp: foe.hp, handCount: me.hand.length };
})()`;

const readTpl = `(() => {
  const b = window.state.battle;
  const me = b.allies[0], foe = b.enemies[0];
  return {
    foeHp: foe.hp,
    artinaSuits: Object.keys(me.artinaSuits || {}),
    charged: me.artinaChargedTargetUid || null,
    foeUid: foe.uid,
    usedSniper: !!me.usedArtinaSniper,
    log: (window.state.log || []).slice(0, 12),
    handNames: (me.hand || []).map(c => c.name + c.suit),
  };
})()`;

async function clickCard(page, index) {
  await page.locator(`[data-card-index="${index}"]`).first().click();
}
async function clickSkill(page, index) {
  await page.locator(`[data-skill-index="${index}"]`).first().click();
}
async function clickTarget(page, uid, confirm) {
  await page.locator(`[data-target="${uid}"]`).first().click();
  if (confirm !== false) {
    const btn = page.locator("[data-confirm-target]").first();
    if (await btn.count()) await btn.click();
  }
}
async function settle(page) {
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const b = window.state.battle;
    b.animQueue = []; b.locked = false;
    window.BattleEffects.recover(window.state);
    window.render();
  });
  await page.waitForTimeout(400);
}

(async () => {
  const browser = await chromium.launch();
  const out = {};

  // ========== 场景 A：狙击目标 ==========
  // 敌方手牌全为 ♦（展示第一张必为 ♦），亚缇娜手牌含 2 张 ♦ → 我方多 → 标记目标
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on("pageerror", e => errors.push(String(e)));
    try {
      await openGame(page);
      await startRegressionBattle(page);
      const setup = await page.evaluate(setupTpl({
        attack: 3,
        hand: [{ name: "闪", type: "response", suit: "♦" },
               { name: "看破", type: "response", suit: "♦" }],
        foeHand: [{ name: "甲", type: "tactic", suit: "♦" },
                  { name: "乙", type: "tactic", suit: "♥" }],
      }));
      // 发动主动技能「狙击目标」→ 选敌方
      await clickSkill(page, 0);
      await page.waitForTimeout(500);
      await clickTarget(page, setup.foeUid);
      await settle(page);
      const after = await page.evaluate(readTpl);
      // 继续验证：狙击后的单体杀应当不可响应（敌方手持【闪】也无法抵消）
      await page.evaluate(`(() => {
        const b = window.state.battle, me = b.allies[0], foe = b.enemies[0];
        me.hand = [{ name: "杀", type: "slash", suit: "♣", power: 0, damage: 0 }];
        me.hand.forEach(c => { delete c._pendingDraw; });
        me.intent = 99;
        foe.hand = [{ name: "闪", type: "response", suit: "♥" }];
        foe.hand.forEach(c => { delete c._pendingDraw; });
        window.state.settings.manualResponse = true;
        window.state.log = [];
        b.phase = 4; b.activeUid = me.uid; b.locked = false;
        window.render();
      })()`);
      const hpBefore = await page.evaluate(() => window.state.battle.enemies[0].hp);
      await clickCard(page, 0);
      await page.waitForTimeout(400);
      await clickTarget(page, setup.foeUid);
      await settle(page);
      const post = await page.evaluate(`(() => {
        const b = window.state.battle, foe = b.enemies[0];
        return { hp: foe.hp, foeHand: (foe.hand || []).map(c => c.name),
          log: (window.state.log || []).slice(0, 10),
          charged: b.allies[0].artinaChargedTargetUid || null };
      })()`);
      out.sniper = { setup, after, chargedMatches: after.charged === setup.foeUid,
        hpBefore, post, errors: errors.slice(0, 2) };
    } catch (e) { out.sniper = { err: String(e).slice(0, 200) }; }
    await page.close();
  }

  // ========== 场景 C：狙击目标反向（我方花色不多 → 不标记）==========
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on("pageerror", e => errors.push(String(e)));
    try {
      await openGame(page);
      await startRegressionBattle(page);
      // 敌方 3 张 ♦，我方仅 1 张 ♦ → 我方不多 → 不应标记
      const setup = await page.evaluate(setupTpl({
        attack: 3,
        hand: [{ name: "闪", type: "response", suit: "♦" }],
        foeHand: [{ name: "甲", type: "tactic", suit: "♦" },
                  { name: "乙", type: "tactic", suit: "♦" },
                  { name: "丙", type: "tactic", suit: "♦" }],
      }));
      await clickSkill(page, 0);
      await page.waitForTimeout(500);
      await clickTarget(page, setup.foeUid);
      await settle(page);
      const after = await page.evaluate(readTpl);
      out.sniperNeg = { setup, after, notCharged: !after.charged,
        errors: errors.slice(0, 2) };
    } catch (e) { out.sniperNeg = { err: String(e).slice(0, 200) }; }
    await page.close();
  }

  // ========== 场景 B：蓄力子弹（2 花色 → ×3）==========
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on("pageerror", e => errors.push(String(e)));
    try {
      await openGame(page);
      await startRegressionBattle(page);
      const setup = await page.evaluate(setupTpl({
        attack: 3,
        // 记录 ♥、♦ 两个花色后，第 3 张 ♠ 杀应 ×3
        hand: [{ name: "杀", type: "slash", suit: "♥" },
               { name: "杀", type: "slash", suit: "♦" },
               { name: "杀", type: "slash", suit: "♠" }],
        foeHand: [{ name: "甲", type: "tactic", suit: "♣" }],
      }));
      const hp0 = setup.foeHp;
      await clickCard(page, 0);
      await page.waitForTimeout(400);
      await clickTarget(page, setup.foeUid);
      await settle(page);
      const hp1 = (await page.evaluate(readTpl)).foeHp;

      await clickCard(page, 0);
      await page.waitForTimeout(400);
      await clickTarget(page, setup.foeUid);
      await settle(page);
      const st2 = await page.evaluate(readTpl);
      const hp2 = st2.foeHp;

      await clickCard(page, 0);
      await page.waitForTimeout(400);
      await clickTarget(page, setup.foeUid);
      await settle(page);
      const st3 = await page.evaluate(readTpl);
      const hp3 = st3.foeHp;

      out.charged = {
        setup, hp0, hp1, hp2, hp3,
        dmg1: hp0 - hp1, dmg2: hp1 - hp2, dmg3: hp2 - hp3,
        suitsAfter2: st2.artinaSuits, suitsAfter3: st3.artinaSuits,
        log: st3.log, errors: errors.slice(0, 2),
      };
    } catch (e) { out.charged = { err: String(e).slice(0, 200) }; }
    await page.close();
  }

  // ========== 场景 D：蓄力子弹倍率（2 花色 → ×3）==========
  // 先用两张不同花色的战术牌记录花色，再打杀；同时挂钩 modifySlashDamage 读取真实进出值
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on("pageerror", e => errors.push(String(e)));
    try {
      await openGame(page);
      await startRegressionBattle(page);
      const setup = await page.evaluate(setupTpl({
        attack: 3,
        // 群体杀（sweep）会记录花色但不消耗加成；先打两张不同花色群体杀，
        // 再用单体杀触发倍率：记录 ♥+♦ 两张 → 应为 ×3
        hand: [{ name: "流星杀", type: "slash", suit: "♥", sweep: true, targetless: true,
                 scale: "magic", attackType: "magic" },
               { name: "流星杀", type: "slash", suit: "♦", sweep: true, targetless: true,
                 scale: "magic", attackType: "magic" },
               { name: "杀", type: "slash", suit: "♠" }],
        foeHand: [{ name: "甲", type: "tactic", suit: "♣" }],
      }));
      // 挂钩真实倍率函数（只读记录，不改变行为）
      await page.evaluate(`(() => {
        window.__ratio = [];
        const orig = window.ArtinaMariaSkills.modifySlashDamage;
        window.ArtinaMariaSkills.modifySlashDamage = function (s, a, t, amount, card) {
          const out = orig(s, a, t, amount, card);
          window.__ratio.push({ in: amount, out,
            suits: Object.keys(a.artinaSuits || {}).length });
          return out;
        };
      })()`);
      // 两张群体杀（花色 ♥ / ♦）：记录花色但不消耗
      for (let i = 0; i < 2; i++) {
        await clickCard(page, 0);
        await page.waitForTimeout(500);
        const btn = page.locator("[data-confirm-target]").first();
        if (await btn.count() && !(await btn.isDisabled())) await btn.click();
        else await clickTarget(page, setup.foeUid, false);
        await settle(page);
      }
      const midSuits = await page.evaluate(() => Object.keys(
        window.state.battle.allies[0].artinaSuits || {}));
      const hp0 = await page.evaluate(() => window.state.battle.enemies[0].hp);
      await clickCard(page, 0);
      await page.waitForTimeout(400);
      await clickTarget(page, setup.foeUid);
      await settle(page);
      const end = await page.evaluate(`(() => ({
        hp: window.state.battle.enemies[0].hp,
        ratio: window.__ratio || [],
        log: (window.state.log || []).slice(0, 6),
      }))()`);
      out.ratio = { setup, hp0, midSuits, end, errors: errors.slice(0, 2) };
    } catch (e) { out.ratio = { err: String(e).slice(0, 200) }; }
    await page.close();
  }

  await browser.close();

  console.log("\n===== 实战：亚缇娜技能 =====");
  if (out.sniper?.err) console.log("  [狙击目标] ❌", out.sniper.err);
  else {
    const s = out.sniper;
    console.log(`  [狙击目标] 展示敌方手牌后标记=${s.chargedMatches ? "✅ 已标记" : "❌ 未标记"}`
      + ` (charged=${s.after.charged} foeUid=${s.setup.foeUid})`);
    console.log(`       用过一次=${s.after.usedSniper}  战报=${JSON.stringify(s.after.log)}`);
    console.log(`       狙击后杀：敌方HP ${s.hpBefore}→${s.post.hp}（掉${s.hpBefore - s.post.hp}）`
      + ` 敌方剩手牌=${JSON.stringify(s.post.foeHand)} 标记已消耗=${s.post.charged === null ? "✅" : "❌"}`);
    console.log(`       战报=${JSON.stringify(s.post.log)}`);
    if (s.errors.length) console.log(`       页面错误=${s.errors.join(";")}`);
  }
  if (out.sniperNeg?.err) console.log("  [狙击目标-反向] ❌", out.sniperNeg.err);
  else {
    const n = out.sniperNeg;
    console.log(`  [狙击目标-反向] 我方花色不多时=${n.notCharged ? "✅ 未标记" : "❌ 仍被标记"}`
      + ` (charged=${n.after.charged})`);
    console.log(`       战报=${JSON.stringify(n.after.log)}`);
  }
  if (out.charged?.err) console.log("  [蓄力子弹] ❌", out.charged.err);
  else {
    const c = out.charged;
    console.log(`  [蓄力子弹] 三次杀伤害: ${c.dmg1} / ${c.dmg2} / ${c.dmg3}`);
    console.log(`       第2次后已记录花色=${JSON.stringify(c.suitsAfter2)}`
      + ` 第3次后=${JSON.stringify(c.suitsAfter3)}`);
    console.log(`       战报=${JSON.stringify(c.log)}`);
    if (c.errors.length) console.log(`       页面错误=${c.errors.join(";")}`);
  }
  if (out.ratio?.err) console.log("  [蓄力倍率] ❌", out.ratio.err);
  else {
    const r = out.ratio;
    console.log(`  [蓄力倍率] 记录花色=${JSON.stringify(r.midSuits)}`
      + ` 敌方HP ${r.hp0}→${r.end.hp}（掉${r.hp0 - r.end.hp}）`);
    console.log(`       倍率函数进出=${JSON.stringify(r.end.ratio)}`);
    console.log(`       战报=${JSON.stringify(r.end.log)}`);
  }
  process.exit(0);
})();
