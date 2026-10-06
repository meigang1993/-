// 实战：首次击败废墟沙城精英/BOSS 后，10 张卡牌是否解锁并能在商店买到
// 重点：不能只查 unlockedShopCards（名字列表），必须查商店池里的实体牌带不带
// 有效花色 —— 此前 10 张牌就是"名字在池里、实体无花色"，购买后入库 0 张。
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const { openGame } = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const results = [];
const check = (name, cond, info) => {
  results.push({ name, ok: !!cond, info });
  console.log(`${cond ? "✅" : "❌"} ${name}${info !== undefined ? "  " + JSON.stringify(info) : ""}`);
};

// 废墟沙城：3 精英 + 2 BOSS，每张牌归属见 data-ruins-content.js
const TARGETS = [
  { id: "mech_ai_dragon", name: "机械AI龙", kind: "BOSS", cards: ["拼杀", "魔之连杀"] },
  { id: "witherer_1312", name: "XX型凋零者1312号", kind: "BOSS", cards: ["魅惑术", "魅杀"] },
  { id: "hilde", name: "内英组杀手希尔德", kind: "精英", cards: ["偷袭", "冰冻术"] },
  { id: "attack_helicopter", name: "武装直升机", kind: "精英", cards: ["流星杀", "吸魔杀"] },
  { id: "armored_carrier", name: "装甲运输车", kind: "精英", cards: ["物资私分", "枪林弹雨"] },
];
const ALL_CARDS = TARGETS.flatMap(t => t.cards);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push(e.message));
  await openGame(page);
  await page.evaluate(() => Promise.all([
    window.GameBundles?.load?.("battle"),
    window.GameBundles?.load?.("dungeon"),
    window.GameBundles?.load?.("hall"),
  ]));
  await page.click("[data-start-game]");
  await page.waitForTimeout(1500);

  // ===== 1. 前置：初始未解锁 =====
  const initial = await page.evaluate(() => {
    const s = window.state;
    s.battle = null; s.explore = null; s.view = "hall"; s.hallModal = null;
    s.defeatedElites = s.defeatedElites || [];
    s.unlockedShopCards = s.unlockedShopCards || [];
    return {
      unlocked: [...s.unlockedShopCards],
      eliteCards: (window.GameData?.eliteCards || []).length,
      unlockMap: Object.keys(window.GameData?.eliteUnlocks || {}).length,
    };
  });
  check("前置：初始未解锁废墟 10 张牌",
    !ALL_CARDS.some(n => initial.unlocked.includes(n)),
    { 初始解锁数: initial.unlocked.length });
  // ===== 2. 逐个敌人验证 eliteUnlocks 映射 =====
  const mapping = await page.evaluate((targets) => {
    const map = window.GameData?.eliteUnlocks || {};
    return targets.map(t => ({ id: t.id, list: map[t.id] || null }));
  }, TARGETS);
  TARGETS.forEach((t, i) => {
    const got = mapping[i].list || [];
    check(`eliteUnlocks[${t.id}] 含 ${t.cards.join("/")}`,
      t.cards.every(n => got.includes(n)), got);
  });

  // ===== 3. 走真实结算路径：ServerCore settleDungeon =====
  // unlockEliteCards 是模块内部函数、未导出，直接调等于没调；
  // 真实链路是 DungeonNodeRewards.completeBattle → ServerCore.call("settleDungeon")
  // → LocalCoreDungeonOps.settleDungeon 写入 defeatedElites 与 unlockedShopCards。
  const defeated = await page.evaluate(async (targets) => {
    const s = window.state;
    const before = [...(s.unlockedShopCards || [])];
    const s2 = window.state;
    const notices = [];
    const run = {
      missionId: "ruins_sand_city", difficultyId: "normal", focusId: "ruins-test-run",
      activeParty: [], party: [], earned: { gold: 0, essence: 0, relics: [], cards: [] },
      layers: [],
    };
    for (const t of targets) {
      const node = { id: `n-${t.id}`, type: t.kind === "BOSS" ? "boss" : "elite",
        enemies: [{ id: t.id }] };
      run.layers.push([node]);
      const res = await window.ServerCore.call("settleDungeon", {
        run, nodeId: node.id, kind: node.type,
        defeatedEnemyIds: [t.id], participantIds: [],
      }, s2);
      if (!res?.ok) return { error: `settleDungeon 失败 ${t.id}`, res };
      // 服务端产生的提示随 lastLocalReward.notices 回传
      (res.result?.core?.lastLocalReward?.notices || []).forEach(x => notices.push(x));
    }
    window.render?.();
    return {
      before, notices,
      after: [...(s.unlockedShopCards || [])],
      elites: [...(s.defeatedElites || [])],
      logs: (s.log || []).slice(0, 8),
    };
  }, TARGETS);

  if (defeated.error) {
    check("真实结算路径可跑通", false, defeated);
  }

  check("击败后 defeatedElites 记录 5 个精英/BOSS",
    TARGETS.every(t => defeated.elites.includes(t.id)), defeated.elites);
  check("击败后 unlockedShopCards 含全部 10 张牌",
    ALL_CARDS.every(n => defeated.after.includes(n)),
    { 新增: defeated.after.filter(n => !defeated.before.includes(n)) });
  // 服务端路径此前没有任何解锁反馈：牌进了池，玩家却看不到提示。
  // 现由 LocalCoreDungeonOps 随 lastLocalReward.notices 回传，客户端写入日志。
  check("服务端回传 5 条入池提示",
    (defeated.notices || []).length === 5
      && TARGETS.every(t => (defeated.notices || []).some(x => String(x).includes(t.name))),
    defeated.notices);
  check("提示文案含「新卡牌已加入商店池」",
    (defeated.notices || []).filter(x => String(x).includes("新卡牌已加入商店池")).length === 5,
    defeated.notices.slice(0, 2));
  // 客户端消费层：DungeonRewardPayload 拿到奖励后把 notices 写进日志。
  // 真实链路是 completeBattle → rewardFromSettlement，此处直接调该消费点验证。
  const consumed = await page.evaluate((notices) => {
    const s = window.state;
    (s.log || []).length = 0;
    const nodeId = "n-consumed";
    const res = { result: { core: { lastLocalReward: {
      nodeId, gold: 10, essence: 1, experience: 0,
      progression: [], cards: [], relics: [], notices },
    } } };
    const r = window.DungeonRewardPayload.rewardFromSettlement(res, s, nodeId,
      { gold: 0, essence: 0, cards: [], relics: [] });
    return { has: !!r, logs: (s.log || []).slice(0, 8) };
  }, defeated.notices || []);
  check("客户端把提示写入日志（玩家可见）",
    consumed.has && (consumed.logs || []).some(t => String(t).includes("新卡牌已加入商店池")),
    consumed.logs);

  // ===== 4. 商店池：实体牌必须带有效花色（核心回归点）=====
  const pool = await page.evaluate((names) => {
    const s = window.state;
    const set = new Set(s.unlockedShopCards || []);
    const seen = new Map();
    (window.GameData?.eliteCards || []).forEach(c => {
      if (!set.has(c.name)) return;
      if (!seen.has(c.name)) seen.set(c.name, []);
      seen.get(c.name).push(c.suit);
    });
    const rebuild = window.GameStoreSaveSchema?.rebuildCard;
    return names.map(n => {
      const raw = (window.GameData?.eliteCards || []).find(c => c.name === n);
      const suits = seen.get(n) || [];
      return {
        name: n,
        inPool: !!raw,
        suits,
        // 注意：空数组的 every 恒为 true，必须先判长度，否则"池里根本没有"会假通过。
        suitValid: !!raw && suits.length > 0
          && suits.every(s => ["♠", "♥", "♣", "♦"].includes(s)),
        rebuildOk: !!raw && !!rebuild?.(raw),
      };
    });
  }, ALL_CARDS);

  const bad = pool.filter(p => !p.inPool || !p.suitValid || !p.rebuildOk);
  check("商店池含 10 张实体牌且花色有效（rebuildCard 可过）",
    bad.length === 0, bad.length ? bad : pool.map(p => `${p.name}:${p.suits.join("")}`).join(" "));

  // A bounded random sample cannot prove that every pool entry is selectable.
  // Pool membership and purchaseability are checked deterministically below.
  const refreshedStock = await page.evaluate(async () => {
    const s = window.state;
    s.resources.gold = 999999;
    const ok = await window.ShopSystem?.refresh?.(s);
    const list = window.ShopSystem?.ensure?.(s) || s.shopCards || [];
    return {
      ok,
      size: window.GameEconomy?.shop?.stockSize || 4,
      names: (list || []).map(item => item?.card?.name).filter(Boolean),
      allowedNames: [...(s.unlockedShopCards || [])],
    };
  });
  check("刷新生成完整且仅含已解锁牌的库存",
    refreshedStock.ok
      && refreshedStock.names.length === refreshedStock.size
      && refreshedStock.names.every(name => refreshedStock.allowedNames.includes(name)),
    refreshedStock);

  // ===== 6. 实际购买：入库必须真的拿到牌 =====
  // 注意：validShopStock 要求 shopCards.length === stockSize，只塞 1 张会让
  // confirmed() 为假、buy 直接返回 false —— 必须按库存位填满。
  const bought = await page.evaluate(async (names) => {
    const s = window.state;
    const set = new Set(s.unlockedShopCards || []);
    const pool = [...new Map((window.GameData?.eliteCards || [])
      .filter(c => set.has(c.name)).map(c => [c.name + c.suit, c])).values()];
    const size = window.GameEconomy?.shop?.stockSize || 4;
    const out = [];
    for (const n of names) {
      const raw = pool.find(c => c.name === n);
      if (!raw) { out.push({ n, ok: false, why: "池中无此牌" }); continue; }
      const fill = pool.filter(c => c !== raw).slice(0, Math.max(0, size - 1));
      const stock = [raw, ...fill].map(c => ({ card: { ...c }, sold: false }));
      while (stock.length < size) stock.push({ card: { ...fill[0] || raw }, sold: false });
      s.resources.gold = 999999;
      s.shopCards = stock;
      s.shopAuthorityVersion = Math.max(1, Number(s.shopAuthorityVersion) || 0);
      const before = (s.deck || []).length;
      const okBuy = await window.ShopSystem?.buy?.(s, 0);
      const after = (s.deck || []).length;
      out.push({
        n, okBuy, gained: after - before,
        suit: raw.suit,
        inDeck: (s.deck || []).some(c => c.name === n && !!c.suit),
      });
    }
    return out;
  }, ALL_CARDS);
  const failed = bought.filter(b => !b.okBuy || b.gained !== 1 || !b.inDeck);
  check("购买 10 张牌均可正常入库（此前为 0 张）", failed.length === 0,
    failed.length ? failed : bought.map(b => `${b.n}(${b.suit})+${b.gained}`).join(" "));

  // ===== 7. 提示必须对所有副本生效，不能只有废墟沙城 =====
  const mfactory = await page.evaluate(async () => {
    const s = window.state;
    (s.log || []).length = 0;
    const run = { missionId: "machine_factory", difficultyId: "normal", focusId: "ruins-test-run",
      activeParty: [], party: [], earned: { gold: 0, essence: 0, relics: [], cards: [] }, layers: [] };
    const node = { id: "n-elrana", type: "elite", enemies: [{ id: "elrana_clone" }] };
    run.layers.push([node]);
    const res = await window.ServerCore.call("settleDungeon", {
      run, nodeId: node.id, kind: "elite", defeatedEnemyIds: ["elrana_clone"], participantIds: [],
    }, s);
    if (!res?.ok) return { error: "settleDungeon 失败" };
    window.render?.();
    return { notices: res.result?.core?.lastLocalReward?.notices || [],
      logs: (s.log || []).slice(0, 6) };
  });
  check("机械工厂：服务端结算同样回传提示（同步所有副本）",
    !mfactory.error
      && (mfactory.notices || []).some(t => String(t).includes("新卡牌已加入商店池")),
    mfactory.error || mfactory.notices);

  check("无页面错误", errors.length === 0, errors.slice(0, 2));

  await browser.close();
  const pass = results.filter(r => r.ok).length;
  console.log(`\n通过 ${pass}/${results.length}`);
  process.exit(pass === results.length ? 0 : 1);
})();
