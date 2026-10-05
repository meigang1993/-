// 专项：四个副本的掉落率是否正常（概率源 + 真实结算统计）
//
// 掉落链路：DungeonNodeRewards → ServerCore.call("settleDungeon")
//   → LocalCoreDungeonOps.settleDungeon → rareReward：
//     1) 仅 elite / boss 参与掉落，普通怪不掉
//     2) 先按 difficulty.dropRate 判定是否掉落
//     3) 命中后：该敌人有 eliteUnlocks 卡牌 且 再过 50% → 给卡牌；否则给饰品
//
// 关注点：
//   A) 概率源本身是否均匀（GameRandom.chance 基于 cursor 递进哈希，
//      若 mix 有偏，各档 dropRate 都会系统性偏离）
//   B) 真实结算的实测掉落率是否落在配置值附近
//   C) 命中掉落却产出为空的比例 —— 这是真 BUG 指标：
//      「概率已消耗、玩家什么都没拿到」
//   D) 卡牌/饰品分支比例是否约 50/50
//
// 防假通过：
//   1) 概率源统计要求样本 ≥ 20000 且偏差 < 2 个百分点
//   2) 真实结算每档样本 ≥ 240，命中率偏差 < 8 个百分点（小样本放宽）
//   3) 空掉落必须为 0，且断言「至少出现过一次掉落」，避免全 0 蒙混
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, fail = 0;
const check = (name, cond, extra = "") => {
  if (cond) { pass += 1; console.log(`✅ ${name}${extra ? " — " + extra : ""}`); }
  else { fail += 1; console.log(`❌ ${name}${extra ? " — " + extra : ""}`); }
};

const N_PROBE = 20000;   // 概率源样本
const N_RUN = 240;       // 每档真实结算样本

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await openGame(page);

  // ===== A. 概率源均匀性 =====
  const rates = [.2, .4, .5, .6, .7];
  const probe = await page.evaluate(({ rates, n }) => {
    const core = { random: { version: 1, seed: 12345, cursor: 0 } };
    const out = {};
    rates.forEach(p => {
      let hit = 0;
      for (let i = 0; i < n; i += 1)
        if (window.GameRandom.chance(p, core)) hit += 1;
      out[p] = hit / n;
    });
    return out;
  }, { rates, n: N_PROBE });
  console.log("--- A 概率源（样本 " + N_PROBE + "）---");
  rates.forEach(p => console.log(`  chance(${p}) 实测 ${probe[p].toFixed(4)}`
    + ` 偏差 ${((probe[p] - p) * 100).toFixed(2)}pp`));
  const offProbe = rates.filter(p => Math.abs(probe[p] - p) >= 0.02);
  check("A1 概率源均匀：五档偏差均 < 2pp", offProbe.length === 0,
    offProbe.map(p => `${p}→${probe[p].toFixed(4)}`).join(" "));

  // ===== B/C/D. 真实结算统计 =====
  const difficulties = [
    { id: "normal", label: "普通级", rate: .2 },
    { id: "adventure", label: "冒险级", rate: .4 },
    { id: "warrior", label: "勇士级", rate: .5 },
    { id: "king", label: "王者级", rate: .6 },
    { id: "hell", label: "英雄级", rate: .7 },
  ];

  // 取全部 20 个精英/BOSS 敌人 id
  const enemyIds = await page.evaluate(
    "(() => Object.keys(window.GameData?.eliteUnlocks || {}))()");
  check("B0 精英/BOSS 敌人登记数 = 20", enemyIds.length === 20,
    `实际 ${enemyIds.length}`);

  const stats = await page.evaluate(async ({ enemyIds, difficulties, n }) => {
    const s = window.state;
    const out = [];
    for (const d of difficulties) {
      // localRunState.key 一旦绑定 focusId，换 focusId 的后续结算会被判拒；
      // 每档视为一次新的副本征程，先清空。
      let total = 0, hit = 0, rejected = 0, cardHit = 0, relicHit = 0;
      for (const id of enemyIds) {
        for (let i = 0; i < n / enemyIds.length; i += 1) {
          const nodeId = `n-${d.id}-${id}-${i}`;
          const node = { id: nodeId, type: "elite", enemies: [{ id }] };
          const run = {
            missionId: "machine_factory", difficultyId: d.id,
            focusId: "droprate-all", activeParty: [], party: [],
            earned: { gold: 0, essence: 0, relics: [], cards: [] },
            layers: [[node]],
          };
          const res = await window.ServerCore.call("settleDungeon", {
            run, nodeId, kind: "elite",
            defeatedEnemyIds: [id], participantIds: [],
          }, s);
          // lastLocalReward 只挂在 LocalCore 构造的 core 上，不在 apply 的
          // 字段白名单里（operationScope.settleDungeon 不含它），因此读 state
          // 上的同名属性永远是空——必须读 res.result.core。
          const r = res?.result?.core?.lastLocalReward || {};
          const cards = (r.cards || []).length, relics = (r.relics || []).length;
          total += 1;
          if (!res?.ok) { rejected += 1; continue; }
          if (cards || relics) {
            hit += 1;
            if (cards) cardHit += 1;
            if (relics) relicHit += 1;
          }
          s.pendingRun = { gold: 0, essence: 0, cards: [], relics: [] };
        }
      }
      out.push({
        id: d.id, label: d.label, rate: d.rate, total, hit, rejected,
        hitRate: hit / Math.max(1, total - rejected), cardHit, relicHit,
      });
    }
    return out;
  }, { enemyIds, difficulties, n: N_RUN });

  console.log("--- B 真实结算掉落率（每档样本 " + N_RUN + "）---");
  stats.forEach(s => console.log(
    `  ${s.label} 配置 ${(s.rate * 100).toFixed(0)}%`
    + ` 实测 ${(s.hitRate * 100).toFixed(1)}%`
    + ` 偏差 ${((s.hitRate - s.rate) * 100).toFixed(1)}pp`
    + `  卡牌 ${s.cardHit} / 饰品 ${s.relicHit} / 被拒 ${s.rejected}`));

  const badRej = stats.filter(s => s.rejected > 0);
  check("B0b 结算均未被拒（focusId 一致）", badRej.length === 0,
    badRej.map(s => `${s.label} 被拒 ${s.rejected}`).join(" "));
  const noDrop = stats.filter(s => s.hit === 0);
  check("B1 每档都出现过掉落（防全 0 假通过）", noDrop.length === 0,
    noDrop.map(s => s.label).join(" "));

  const offRun = stats.filter(s => Math.abs(s.hitRate - s.rate) >= 0.08);
  check("B2 实测掉落率与配置偏差均 < 8pp", offRun.length === 0,
    offRun.map(s => `${s.label} ${(s.hitRate * 100).toFixed(1)}% vs ${(s.rate * 100).toFixed(0)}%`).join(" | "));

  const mono = stats.every((s, i) => i === 0 || s.hitRate >= stats[i - 1].hitRate - 0.05);
  check("B3 掉落率随难度单调递增", mono,
    stats.map(s => `${s.label} ${(s.hitRate * 100).toFixed(1)}%`).join(" → "));

  const branch = stats[stats.length - 1];
  const ratio = branch.cardHit / (branch.cardHit + branch.relicHit);
  check("D1 卡牌/饰品分支比例接近 50/50",
    Math.abs(ratio - 0.5) < 0.15,
    `卡牌占比 ${(ratio * 100).toFixed(1)}%（卡牌 ${branch.cardHit} / 饰品 ${branch.relicHit}）`);

  // ===== C. 命中却空产出：数据层保证 =====
  const pools = await page.evaluate((ids) => {
    const GD = window.GameData, RS = window.RelicSystem;
    const byName = new Map((GD.eliteCards || []).map(c => [c.name, c]));
    return ids.map(id => {
      const names = (GD.eliteUnlocks?.[id] || []).filter(n => byName.get(n));
      const usable = names.filter(n =>
        ["♠", "♥", "♣", "♦"].includes(byName.get(n)?.suit));
      let relic = null;
      for (let i = 0; i < 30 && !relic; i += 1)
        relic = RS?.randomElite?.(id, new Set(), window.state);
      return { id, names: (GD.eliteUnlocks?.[id] || []).length, usable: usable.length,
        relic: !!relic };
    });
  }, enemyIds);
  const badCard = pools.filter(p => p.names > 0 && p.usable === 0);
  const badRelic = pools.filter(p => !p.relic);
  check("C1 每个有卡牌登记的敌人都能真实发出可用卡牌（防命中却空产出）",
    badCard.length === 0, badCard.map(p => p.id).join(" "));
  check("C2 每个敌人都能真实掉出饰品（防命中却空产出）",
    badRelic.length === 0, badRelic.map(p => p.id).join(" "));

  check("Z 无页面错误", errors.length === 0, errors.slice(0, 2).join(" | "));

  console.log(`\n总计：${pass} 通过 / ${fail} 失败`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
