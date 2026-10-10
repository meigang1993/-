/* 核查「讨伐任务奖励」与「副本精英/BOSS 掉落」两条奖励链路。
   关注点：
   1) 每个精英/BOSS 目标的讨伐奖励是否卡牌与两种饰品都能出现（roll 分布）
   2) 讨伐奖励是否能真实发放到账（卡牌进 deckAdditions、饰品进 relicAdditions）
   3) 副本内精英/BOSS 掉落在「已拥有 0 / 1 / 2 件该敌人饰品」三种状态下的实际掉落
      —— 用于定位「只有一种饰品、刷新后还是同一种」的现象。 */
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const { chromium } = require("playwright");
const { openGame, startFreshGame } = require("../tests/helpers/preview-game.js");

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else console.log(`❌ ${name}  ← ${JSON.stringify(extra || {})}`);
  return !!cond;
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  try {
    await openGame(page);
    await startFreshGame(page);

    // ===== A. 讨伐奖励 roll 分布 =====
    const roll = await page.evaluate(() => {
      const targets = [];
      for (const m of (window.GameData.missions || []).filter(x => x.kind === "dungeon")) {
        for (const e of (window.GameData.enemies[m.id] || [])) {
          if (["elite", "boss"].includes(e.type)) targets.push({ ...e, missionId: m.id });
        }
      }
      const out = {};
      for (const t of targets) {
        const kinds = { card: 0, relic: 0 }, relics = {};
        for (let i = 0; i < 120; i++) {
          const st = { random: { version: 1, seed: (i * 2654435761) >>> 0, cursor: 0 } };
          const r = window.BountyRewards.rollReward({ type: "hunt", targetId: t.id }, st);
          if (r?.type === "card") kinds.card += 1;
          if (r?.type === "relic") { kinds.relic += 1; relics[r.relic] = (relics[r.relic] || 0) + 1; }
        }
        out[`${t.missionId}/${t.id}`] = { kinds, relics, count: Object.keys(relics).length };
      }
      return out;
    });

    const keys = Object.keys(roll);
    T("A1 存在精英/BOSS 讨伐目标", keys.length > 0, keys.length);
    const noCard = keys.filter(k => roll[k].kinds.card === 0);
    const oneRelic = keys.filter(k => roll[k].count < 2);
    T("A2 每个目标的讨伐奖励都会出现卡牌", noCard.length === 0, noCard);
    T("A3 每个目标的讨伐奖励两种饰品都会出现", oneRelic.length === 0,
      oneRelic.map(k => `${k}:${JSON.stringify(roll[k].relics)}`));

    // ===== B. 讨伐奖励真实发放 =====
    const claim = await page.evaluate(async () => {
      const mk = () => ({
        chars: [], resources: { gold: 0, essence: 0, relics: [] },
        relicCollection: [], bountyLedger: window.BountyLedger.empty(),
        deckAdditions: [], relicAdditions: [],
        random: { version: 1, seed: 12345, cursor: 0 },
      });
      const seen = { card: 0, relic: 0 }, names = new Set();
      for (let i = 0; i < 60; i++) {
        const core = mk();
        core.random = { version: 1, seed: (i * 7919 + 3) >>> 0, cursor: 0 };
        const r = window.BountyRewards.rollReward({ type: "hunt", targetId: "elrana_clone" }, core);
        if (!r) continue;
        if (r.type === "card") seen.card += 1;
        if (r.type === "relic") { seen.relic += 1; names.add(r.relic); }
        // 每批 core 都是新账本（through=0），claimId 必须恒为 bounty:1，
        // 否则序列号与账本脱节会被判 blocked——这是夹具约束，不是产品行为。
        const out = window.LocalCoreBountyOps.claimBounty(core, {
          items: [{ claimId: "bounty:1", reward: r, bonusGold: 0, taskTitle: "讨伐 X" }],
        });
        if (out?.accepted === false) return { error: "claim 被拒", i, r };
      }
      // 单独核一次入库
      const core = mk();
      const card = window.BountyRewards.rollReward({ type: "hunt", targetId: "elrana_clone" }, core);
      window.LocalCoreBountyOps.claimBounty(core, {
        items: [{ claimId: "bounty:1", reward: card, bonusGold: 0, taskTitle: "讨伐 X" }],
      });
      return {
        seen, relicNames: [...names],
        lastType: card?.type,
        deck: (core.deckAdditions || []).length,
        relicAdd: (core.relicAdditions || []).length,
      };
    });
    T("B1 讨伐奖励 claim 未被拒", !claim.error, claim);
    T("B2 卡牌与饰品奖励都会产生", claim.seen?.card > 0 && claim.seen?.relic > 0, claim.seen);
    T("B3 饰品奖励两种都会产生", (claim.relicNames || []).length >= 2, claim.relicNames);

    // ===== C. 副本精英/BOSS 掉落：已拥有 0 / 1 / 2 件 =====
    const drop = await page.evaluate(() => {
      const Ops = window.LocalCoreDungeonOps;
      const normal = window.GameData.difficulties.normal;
      const origin = normal.dropRate;
      normal.dropRate = 1; // 夹具：必掉，便于统计分布
      const mk = owned => ({
        chars: [], resources: { gold: 0, essence: 0, relics: owned },
        pendingRun: { gold: 0, essence: 0, cards: [], relics: [] },
        defeatedElites: [], unlockedShopCards: [], localRunState: { rewards: {} },
      });
      const run = {
        missionId: "machine_factory", difficultyId: "normal", focusId: "focus1",
        layers: [[{ id: "n1", type: "elite", enemies: [{ id: "elrana_clone" }] }]],
        party: [], activeParty: [],
      };
      const stat = owned => {
        const relics = {}, kinds = { card: 0, relic: 0, none: 0 };
        for (let i = 0; i < 80; i++) {
          const core = mk(owned);
          core.random = { version: 1, seed: (i * 2654435761) >>> 0, cursor: 0 };
          Ops.settleDungeon(core, { run, nodeId: "n1", defeatedEnemyIds: ["elrana_clone"] });
          const lr = core.lastLocalReward || {};
          if ((lr.relics || []).length) {
            kinds.relic += 1;
            lr.relics.forEach(x => { relics[x] = (relics[x] || 0) + 1; });
          } else if ((lr.cards || []).length) kinds.card += 1;
          else kinds.none += 1;
        }
        return { relics, kinds };
      };
      const res = {
        own0: stat([]),
        own1: stat(["母亲照片"]),
        own2: stat(["母亲照片", "艾尔拉娜大型注射器"]),
      };
      normal.dropRate = origin;
      return res;
    });
    console.log("   拥有0件:", JSON.stringify(drop.own0.relics), JSON.stringify(drop.own0.kinds));
    console.log("   拥有1件:", JSON.stringify(drop.own1.relics), JSON.stringify(drop.own1.kinds));
    console.log("   拥有2件:", JSON.stringify(drop.own2.relics), JSON.stringify(drop.own2.kinds));
    T("C1 拥有0件时两种饰品都会掉落", Object.keys(drop.own0.relics).length === 2, drop.own0.relics);
    T("C2 拥有1件时仍能掉出饰品", drop.own1.kinds.relic > 0, drop.own1.kinds);
    // 「已拥有不再重复掉落」是有意设计（randomElite 排除 exclude 集合），此处记录为基线，
    // 不是缺陷：拥有1件时只掉另一种，属预期。
    T("C3 拥有1件时只掉未拥有的那件（不重复策略基线）",
      Object.keys(drop.own1.relics).length === 1, drop.own1.relics);
    T("C4 拥有全部饰品时不会静默无奖励", drop.own2.kinds.none === 0, drop.own2.kinds);
    // 判据需能区分「回退生效」与「原本就抽到卡牌」：回退后原本落空的 relic 次数
    // 应全部转为卡牌，故 own2 的卡牌次数 = own0 的卡牌次数 + own0 的饰品次数。
    T("C5 拥有全部饰品时原本落空的饰品位全部回退为卡牌",
      drop.own2.kinds.card === drop.own0.kinds.card + drop.own0.kinds.relic,
      { own2: drop.own2.kinds, expect: drop.own0.kinds.card + drop.own0.kinds.relic });
  } catch (err) {
    console.log(`❌ 执行异常: ${err.message}`);
    total++;
  } finally {
    await browser.close();
  }
  console.log(`\n通过 ${pass}/${total}`);
  process.exit(pass === total ? 0 : 1);
})();
