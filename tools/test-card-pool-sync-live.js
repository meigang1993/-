// 卡牌池同步 · 严格检查
//
// 问题：玩家获得的所有卡牌，敌方牌库是否同步？
//
// 本脚本不只看「双方牌堆是不是同一份 sharedDeck」，而是逐条覆盖玩家能拿到牌的
// 每一条途径，并断言这些牌真的出现在敌方牌库里：
//   1) 初始牌库（baseDeck）
//   2) 权威表重建（存档保存/读取后字段是否完好 —— 丢字段等于拿到一张假牌）
//   3) 逐张注入 eliteCards 全表，断言敌方牌库真的含这张牌
//   4) 商店购买（真实 ShopSystem.buy 入口）
//   5) 探索中掉落（state.explore.earned.cards，真实 BattleSetup 探索分支）
//   6) 探索结算后（earned 已并入 state.deck 时不能重复计入）
//
// 断言的是「实际牌堆内容」，不是「函数被调用」。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const {
  openGame, startFreshGame, collectErrors, relevantErrors,
} = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  const tail = cond ? "" : `  ← ${JSON.stringify(extra || {}).slice(0, 500)}`;
  console.log(`${cond ? "✅" : "❌"} ${name}${tail}`);
  return !!cond;
};

const INJECT = () => {
  window.__cs = {
    key: card => `${card.suit || "?"}|${card.name}`,
    sig: cards => (cards || []).map(window.__cs.key).sort().join(","),
    has: (sigText, card) => String(sigText).split(",").includes(window.__cs.key(card)),
    count: (sigText, card) => String(sigText).split(",")
      .filter(item => item === window.__cs.key(card)).length,
    async make(ctxPatch) {
      const state = window.state;
      state.battle = null;
      await window.BattleSetup().create(state, "machine_factory", () => {},
        Object.assign({}, ctxPatch || {}));
      const b = state.battle;
      if (!b || !b.allies.length || !b.enemies.length) {
        return { error: "战斗未创建", allies: b?.allies?.length || 0, enemies: b?.enemies?.length || 0 };
      }
      const ap = b.allies[0].pileStats, ep = b.enemies[0].pileStats;
      return {
        ally: window.__cs.sig(ap.deck), enemy: window.__cs.sig(ep.deck),
        allyN: ap.deck.length, enemyN: ep.deck.length,
        deckN: (state.deck || []).length,
        allyShared: b.allies.every(u => u.pileStats === ap),
        enemyShared: b.enemies.every(u => u.pileStats === ep),
        separatePile: ap !== ep,
      };
    },
  };
};

// 场景1：基线 —— 新档双方牌堆内容一致
const BASE = async () => await window.__cs.make({});

// 场景2：权威表重建 —— 每张卡经 rebuildCard 后字段是否完好
const CANONICAL = () => {
  const data = window.GameData || {};
  const base = data.baseDeck || [], elite = data.eliteCards || [];
  const S = window.GameStoreSaveSchema;
  const names = [...new Set([...base, ...elite].map(c => c.name))];
  const missing = [], mismatch = [];
  names.forEach(name => {
    const src = elite.find(c => c.name === name) || base.find(c => c.name === name);
    const rebuilt = S.rebuildCard({ name, suit: "♠" });
    if (!rebuilt) { missing.push(name); return; }
    const keys = new Set([...Object.keys(src), ...Object.keys(rebuilt)]);
    keys.forEach(k => {
      if (k === "suit") return;
      if (JSON.stringify(src[k]) !== JSON.stringify(rebuilt[k])) {
        mismatch.push({ name, key: k, src: src[k], rebuilt: rebuilt[k] });
      }
    });
  });
  // eliteCards 必须是「展开后的单张牌」形态（与 makeDeck 一致，每张带具体 suit）：
  // 带 suits 对象而无 suit 的卡定义会让掉落/赏金发出无花色牌。
  const suitsOk = new Set(["♠", "♥", "♣", "♦"]);
  const noSuit = [...new Set(elite.filter(c => !suitsOk.has(c.suit)).map(c => c.name))];
  const withSuitsObj = [...new Set(elite.filter(c => c.suits).map(c => c.name))];
  return {
    names: names.length, missing,
    mismatchN: mismatch.length, mismatch: mismatch.slice(0, 8),
    eliteN: elite.length, noSuit, noSuitN: noSuit.length,
    withSuitsObj, withSuitsObjN: withSuitsObj.length,
  };
};

// 场景3：逐张注入 —— 每一张可获得卡都必须出现在敌方牌库
const EACH = async () => {
  const state = window.state;
  const elite = window.GameData.eliteCards || [];
  const names = [...new Set(elite.map(c => c.name))];
  const backup = state.deck.slice();
  const bad = [];
  for (const name of names) {
    const card = elite.find(c => c.name === name);
    if (!card) { bad.push({ name, why: "权威表缺卡" }); continue; }
    state.deck = backup.concat([{ ...card }]);
    const r = await window.__cs.make({});
    if (r.error || !window.__cs.has(r.enemy, card)) bad.push({ name, suit: card.suit, why: "敌方牌库无此牌" });
    else if (!window.__cs.has(r.ally, card)) bad.push({ name, suit: card.suit, why: "我方牌库无此牌" });
    else if (r.ally !== r.enemy) bad.push({ name, suit: card.suit, why: "双方牌堆内容不一致" });
  }
  state.deck = backup;
  return { names: names.length, bad: bad.slice(0, 10), badN: bad.length };
};

// 场景4：商店购买 —— 真实购买入口，卡进公共牌库后敌方是否同步
const SHOP = async () => {
  const state = window.state;
  state.resources.gold = 999999;
  state.unlockedShopCards = [...new Set((window.GameData.eliteCards || []).map(c => c.name))];
  let err = null;
  try { await window.ShopSystem.refresh(state); } catch (e) { err = String(e); }
  const slots = state.shopCards || [];
  const idx = slots.findIndex(s => s && !s.sold && s.card);
  if (idx < 0) return { err: err || "商店无货", idx };
  const card = slots[idx].card;
  const before = (state.deck || []).length;
  let bought = false;
  try { bought = await window.ShopSystem.buy(state, idx); } catch (e) { err = String(e); }
  const after = (state.deck || []).length;
  const r = await window.__cs.make({});
  return {
    err, bought, before, after, name: card.name, suit: card.suit,
    inAlly: window.__cs.has(r.ally, card), inEnemy: window.__cs.has(r.enemy, card),
    same: r.ally === r.enemy, allyN: r.allyN, enemyN: r.enemyN, deckN: r.deckN,
  };
};

// 场景5：探索中掉落 —— earned.cards 必须同时进双方牌库
const EXPLORE = async () => {
  const state = window.state;
  const pool = window.GameData.eliteCards || [];
  const card = { ...(pool.find(c => c.name === "火杀") || pool[0]) };
  const backup = state.deck.slice();
  const baseCount = window.__cs.count(window.__cs.sig(backup), card);
  state.explore = state.explore || {};
  state.explore.earned = { gold: 0, essence: 0, relics: [], cards: [card] };
  state.explore.activeParty = (state.party || []).slice();
  state.explore.difficultyId = "normal";
  const withEarned = await window.__cs.make({ exploration: true, nodeId: "n1-0", nodeType: "normal" });
  // 非探索战斗：earned 不参与（否则同一张牌会被算两次）
  const plain = await window.__cs.make({});
  const out = {
    name: card.name, suit: card.suit, baseCount,
    earnedAlly: window.__cs.count(withEarned.ally, card),
    earnedEnemy: window.__cs.count(withEarned.enemy, card),
    earnedSame: withEarned.ally === withEarned.enemy,
    earnedAllyN: withEarned.allyN, earnedEnemyN: withEarned.enemyN,
    plainAlly: window.__cs.count(plain.ally, card),
    plainEnemy: window.__cs.count(plain.enemy, card),
    error: withEarned.error || plain.error || null,
  };
  state.explore.earned.cards = [];
  state.deck = backup;
  return out;
};

// 场景6：掉落卡已并入 state.deck 后，探索战斗不能重复计入
const DOUBLE = async () => {
  const state = window.state;
  const pool = window.GameData.eliteCards || [];
  const card = { ...(pool.find(c => c.name === "火杀") || pool[0]) };
  const backup = state.deck.slice();
  state.deck = backup.concat([{ ...card }]);
  state.explore = state.explore || {};
  // earned 里再放一张同名同花色（模拟：已结算入库，run.earned 仍未清空）
  state.explore.earned = { gold: 0, essence: 0, relics: [], cards: [{ ...card }] };
  state.explore.activeParty = (state.party || []).slice();
  state.explore.difficultyId = "normal";
  const r = await window.__cs.make({ exploration: true, nodeId: "n1-0", nodeType: "normal" });
  const out = {
    name: card.name, suit: card.suit,
    ally: window.__cs.count(r.ally, card), enemy: window.__cs.count(r.enemy, card),
    same: r.ally === r.enemy, allyN: r.allyN, enemyN: r.enemyN, deckN: r.deckN,
  };
  state.explore.earned.cards = [];
  state.deck = backup;
  return out;
};

// 场景7：掉落 / 赏金奖励入库 —— 每张卡都必须真的进玩家牌库（不能被存档校验丢弃）
// 走的是 ServerCoreApply.apply 的真实入库路径（探索结算 bankRun、赏金 claimBounty
// 都汇入 core.deckAdditions → repairCards → state.deck）。
const GRANT = () => {
  const elite = window.GameData.eliteCards || [];
  const names = [...new Set(elite.map(c => c.name))];
  const lost = [];
  names.forEach(name => {
    const card = elite.find(c => c.name === name);
    const st = { deck: [], resources: { gold: 0, essence: 0, relics: [] } };
    window.ServerCoreApply.apply(st, { deckAdditions: [{ ...card }] },
      { method: "bankRun" });
    if (st.deck.length !== 1) lost.push({ name, suit: card.suit, got: st.deck.length });
  });
  return { names: names.length, lost: lost.slice(0, 10), lostN: lost.length };
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = collectErrors(page);
  await openGame(page);
  await startFreshGame(page);
  await page.evaluate(() => {
    window.GameAssets.preloadBattle = async () => {};
    window.BattleFX.playBattleStart = cb => cb?.();
    window.BattleLines.intro = () => 0;
    if (window.Onboarding?.skip) window.Onboarding.skip(window.state);
  });
  await page.evaluate(INJECT);

  console.log("【场景1】基线 —— 新档双方牌堆");
  const base = await page.evaluate(BASE);
  T("战斗创建成功", !base.error, base);
  T("我方全员共用同一牌堆", base.allyShared === true, base);
  T("敌方全员共用同一牌堆", base.enemyShared === true, base);
  T("双方牌堆是两份独立实例（各自洗牌）", base.separatePile === true, base);
  T("双方牌堆张数相同", base.allyN === base.enemyN, base);
  T("双方牌堆内容完全一致", base.ally === base.enemy, base);
  T("双方牌堆 == 玩家牌库（state.deck）", base.allyN === base.deckN, base);

  console.log("\n【场景2】权威表重建 —— 存档往返后字段是否完好");
  const canon = await page.evaluate(CANONICAL);
  T(`全部 ${canon.names} 张卡都能被权威表重建`, canon.missing.length === 0, canon.missing);
  T("重建后字段与原卡完全一致（0 处丢失/变异）",
    canon.mismatchN === 0, canon.mismatch);
  T(`eliteCards ${canon.eliteN} 张均已展开为单张牌（带合法花色）`,
    canon.noSuitN === 0, canon.noSuit);
  T("eliteCards 内无残留的 suits 定义对象", canon.withSuitsObjN === 0, canon.withSuitsObj);

  console.log("\n【场景3】逐张注入 —— 每张可获得卡都要进敌方牌库");
  const each = await page.evaluate(EACH);
  T(`eliteCards 全表 ${each.names} 张，敌方牌库均包含`,
    each.badN === 0, each.bad);

  console.log("\n【场景4】商店购买 —— 真实购买入口");
  const shop = await page.evaluate(SHOP);
  T("购买流程未抛异常", !shop.err, shop);
  T("购买成功，玩家牌库 +1", shop.bought === true && shop.after === shop.before + 1, shop);
  T("新卡进入我方牌堆", shop.inAlly === true, shop);
  T("新卡进入敌方牌库（同步）", shop.inEnemy === true, shop);
  T("购买后双方牌堆仍完全一致", shop.same === true, shop);

  console.log("\n【场景5】探索中掉落 —— earned.cards");
  const ex = await page.evaluate(EXPLORE);
  T("探索战斗创建成功", !ex.error, ex);
  T("掉落卡进入我方牌堆", ex.earnedAlly === ex.baseCount + 1, ex);
  T("掉落卡进入敌方牌库（同步）", ex.earnedEnemy === ex.baseCount + 1, ex);
  T("探索中双方牌堆仍完全一致", ex.earnedSame === true, ex);
  T("非探索战斗不计入 earned（避免重复）", ex.plainAlly === ex.baseCount, ex);
  T("非探索战斗敌方同样不计入", ex.plainEnemy === ex.baseCount, ex);

  console.log("\n【场景6】已入库后再开探索 —— 不能重复计入");
  const dbl = await page.evaluate(DOUBLE);
  T("双方计数一致（deck 1 张 + earned 1 张 = 2）",
    dbl.ally === dbl.enemy && dbl.enemy >= 2, dbl);
  T("双方牌堆仍完全一致", dbl.same === true, dbl);

  console.log("\n【场景7】掉落 / 赏金入库 —— 不能被存档校验静默丢弃");
  const grant = await page.evaluate(GRANT);
  T(`全部 ${grant.names} 张卡发出后都能真正入库`, grant.lostN === 0, grant.lost);

  const bad = relevantErrors(errors);
  T("页面无 JS 错误", bad.length === 0, bad.slice(0, 3));

  console.log(`\n结果：${pass}/${total}`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})();
