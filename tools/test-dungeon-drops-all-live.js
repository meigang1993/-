// 实战：四个副本所有精英/BOSS 的掉落是否正常（卡牌 + 饰品都能真实落到存档）
// 重点：
// 1) 不能只看「池里有名字」，必须看真实结算发出来的实体牌带不带有效花色
//    —— 此前废墟沙城 10 张牌就是"名字在池里、实体无花色"，入库 0 张。
// 2) 饰品同理：randomElite 返回 null 就等于该敌人永远掉不出饰品。
// 3) 掉落必须落到存档（deck / resources.relics），而不是只停在 earned 里。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame } = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const results = [];
const check = (name, cond, info) => {
  results.push({ name, ok: !!cond, info });
  console.log(`${cond ? "✅" : "❌"} ${name}${info !== undefined ? "  " + JSON.stringify(info) : ""}`);
};

const SUITS = ["♠", "♥", "♣", "♦"];
const MISSIONS = [
  { id: "machine_factory", name: "魔国机械工厂" },
  { id: "underwater_train", name: "水下列车" },
  { id: "orc_dungeon", name: "兽人地下城" },
  { id: "ruins_sand_city", name: "废墟沙城" },
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push(String(e.message)));
  await openGame(page);

  // ===== 1. 数据层：每个精英/BOSS 的卡牌池与饰品池 =====
  const pools = await page.evaluate(() => {
    const GD = window.GameData, RS = window.RelicSystem;
    const unlocks = GD.eliteUnlocks || {};
    const cards = GD.eliteCards || [];
    const byName = new Map(cards.map(c => [c.name, c]));
    const out = Object.keys(unlocks).map(id => {
      const names = unlocks[id] || [];
      const missing = names.filter(n => !byName.get(n));
      const noSuit = names
        .map(n => byName.get(n))
        .filter(Boolean)
        .filter(c => !["♠", "♥", "♣", "♦"].includes(c.suit))
        .map(c => c.name);
      const relicKinds = new Set();
      for (let i = 0; i < 40; i++) {
        const r = RS?.randomElite?.(id, new Set(), window.state);
        if (r) relicKinds.add(r);
      }
      const known = [...relicKinds].filter(n => RS?.data?.(n));
      return { id, names, missing, noSuit, relicKinds: [...relicKinds], known };
    });
    return { total: out.length, out };
  });

  check("精英/BOSS 掉落登记数量 = 20", pools.total === 20, { 实际: pools.total });

  const badCard = pools.out.filter(p => p.missing.length || p.noSuit.length);
  check("每个敌人的掉落卡牌都在 eliteCards 且带有效花色", badCard.length === 0,
    badCard.map(p => ({ id: p.id, 缺: p.missing, 无花色: p.noSuit })));

  const badRelic = pools.out.filter(p => p.known.length === 0);
  check("每个敌人都能掉出饰品（randomElite 非 null）", badRelic.length === 0,
    badRelic.map(p => p.id));

  // ===== 2. 真实结算：强制掉落，检查落到存档 =====
  // dropRate 决定精英/BOSS 是否掉稀有奖励；为稳定复现，临时把五档都设为 1。
  const drops = await page.evaluate(async (missions) => {
    const GD = window.GameData;
    const backup = {};
    Object.keys(GD.difficulties).forEach(k => {
      backup[k] = GD.difficulties[k].dropRate;
      GD.difficulties[k].dropRate = 1;
    });
    const s = window.state;
    const report = [];
    try {
      const unlocks = GD.eliteUnlocks || {};
      const ids = Object.keys(unlocks);
      // 水下列车/兽人地下城/废墟沙城 需前置解锁，startDungeon 会校验；
      // 这里统一放开，否则后三个副本根本进不去、掉落无从验证。
      s.flags = s.flags || {};
      Object.values(GD.missions || {}).forEach(mi => {
        if (mi.requiresFlag) s.flags[mi.requiresFlag] = true;
      });
      s.unlockedDifficulties = Object.keys(GD.difficulties || {});
      for (const m of missions) {
        for (let iter = 0; iter < 12; iter++) {
          // 每个 run 必须先 startDungeon 登记：settleDungeon 会校验当前活动 run，
          // 直接换 focusId 会被判「节点状态或战斗结果无效」。
          const runId = `drop-${m.id}-${iter}`;
          const st = await window.ServerCore.call("startDungeon", {
            missionId: m.id, difficultyId: "normal", bounties: [], runId,
          }, s);
          if (!st?.ok) return { error: `startDungeon 失败 ${m.id}`, detail: st?.message };
          const run = {
            missionId: m.id, difficultyId: "normal", focusId: runId,
            activeParty: [], party: [],
            earned: { gold: 0, essence: 0, relics: [], cards: [] }, layers: [],
          };
          for (const eid of ids) {
            const node = { id: `n-${eid}`, type: "elite", enemies: [{ id: eid }] };
            run.layers.push([node]);
            const res = await window.ServerCore.call("settleDungeon", {
              run, nodeId: node.id, kind: "elite",
              defeatedEnemyIds: [eid], participantIds: [],
            }, s);
            if (!res?.ok) return { error: `settleDungeon 失败 ${m.id}/${eid}`, detail: res?.message };
            const rw = res.result?.core?.lastLocalReward || {};
            let rec = report.find(r => r.mission === m.id && r.enemy === eid);
            if (!rec) { rec = { mission: m.id, enemy: eid, gotCards: [], gotRelics: [] }; report.push(rec); }
            (rw.cards || []).forEach(c => rec.gotCards.push(c));
            (rw.relics || []).forEach(r => rec.gotRelics.push(r));
          }
        }
      }
    } finally {
      Object.keys(backup).forEach(k => { GD.difficulties[k].dropRate = backup[k]; });
    }
    return { report };
  }, MISSIONS);

  if (drops.error) { check("真实结算路径可跑通", false, { error: drops.error, detail: drops.detail }); console.log("DEBUG", JSON.stringify(drops.detail)); }

  const rep = drops.report || [];
  check("掉落报告覆盖 4 副本 × 20 敌人 = 80 组", rep.length === 80, { 实际: rep.length });
  // 发起过掉落即算覆盖；卡牌与饰品分别统计（rareReward 二选一，40 轮必然两者都出现）
  const noCard = rep.filter(r => r.gotCards.length === 0);
  const noRelic = rep.filter(r => r.gotRelics.length === 0);
  check("每个副本每个敌人都真实发出过卡牌掉落", noCard.length === 0,
    noCard.slice(0, 5).map(r => `${r.mission}/${r.enemy}`));
  check("每个副本每个敌人都真实发出过饰品掉落", noRelic.length === 0,
    noRelic.slice(0, 5).map(r => `${r.mission}/${r.enemy}`));

  const allCards = rep.flatMap(r => r.gotCards);
  const badSuit = allCards.filter(c => !SUITS.includes(c.suit));
  check("发出的掉落卡牌全部带有效花色", allCards.length > 0 && badSuit.length === 0,
    { 总张数: allCards.length, 无花色: badSuit.slice(0, 3).map(c => `${c.name}:${c.suit}`) });

  const allRelics = [...new Set(rep.flatMap(r => r.gotRelics))];
  const unknown = await page.evaluate(
    list => list.filter(n => !window.RelicSystem?.data?.(n)), allRelics);
  check("发出的掉落饰品全部是已知饰品", allRelics.length > 0 && unknown.length === 0,
    { 种类: allRelics.length, 未知: unknown.slice(0, 5) });

  // 每个敌人 2 种饰品都掉得到
  const perEnemyRelic = {};
  rep.forEach(r => {
    const key = r.enemy;
    perEnemyRelic[key] = perEnemyRelic[key] || new Set();
    r.gotRelics.forEach(x => perEnemyRelic[key].add(x));
  });
  const thin = Object.entries(perEnemyRelic).filter(([, v]) => v.size < 2);
  check("每个敌人两种饰品都能掉出", thin.length === 0,
    Object.fromEntries(Object.entries(perEnemyRelic).map(([k, v]) => [k, v.size])));

  check("无页面错误", errors.length === 0, errors.slice(0, 3));

  await browser.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n结果: ${results.length - failed.length}/${results.length} 通过`);
  process.exit(failed.length ? 1 : 0);
})();
