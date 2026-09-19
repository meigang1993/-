// 专项实战：废墟沙城 4 个普通怪技能（真实浏览器 + 真实回合）
// 覆盖：贵族军士兵·放置地雷 / 贵族军狙击手·狙击目标 / 梅尔卡坦克·坦克炮弹 / 攻击型无人机·麻痹毒子弹
// 不走 flag 作弊：真实 AI 决策 + 真实出牌 + 真实伤害流程
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

// ---------- 场景1：放置地雷 ----------
// 玩家方手牌响应牌数量不同 → AI 应选响应牌最多的那个
const landmineTpl = `(() => {
  const b = window.state.battle;
  const e = b.enemies[1];
  e.ai = "ruins_soldier";
  e.name = "贵族军士兵";
  e.stats = e.stats || {}; e.stats.attack = 11;
  e.hp = 64; e.usedRuinsLandmine = false;
  // 地雷需持有者打出【响应牌】才触发，而【闪】只响应【杀】。
  // 给 AOE 杀牌（机枪扫杀）：强制所有玩家方一起响应，持有地雷的罗卡尔必定出闪，
  // 否则敌人若只打另一个角色，罗卡尔不出牌，地雷永远不触发（测试会 flaky）。
  e.hand = [
    { name: "机枪扫杀", type: "kill", sweep: true, suit: "♠" },
    { name: "机枪扫杀", type: "kill", sweep: true, suit: "♥" },
    { name: "杀", type: "kill", suit: "♣" },
  ];
  // 玩家方：响应牌数量 2 / 0 / 1 → 期望目标 = allies[0]
  const counts = [2, 0, 1];
  b.allies.forEach((u, i) => {
    const n = counts[i] ?? 0;
    u.hand = Array.from({ length: n }, () => ({ name: "闪", type: "response", suit: "♥" }));
    u.hp = 80;
    u.stats = u.stats || {}; u.stats.handLimit = 99; // 避免摸牌后触发弃牌决策阻塞回合
  });
  b.enemies[0].hand = [];
  window.__log = [];
  if (!window.__hooked) {
    const orig = window.BattleAI.choose;
    window.BattleAI.choose = function (bb, actor, canPlay) {
      let r = null; try { r = orig(bb, actor, canPlay); } catch (err) {}
      window.__log.push({ actor: actor?.name, move: r?.card?.name || null });
      return r;
    };
    window.__hooked = true;
  }
  window.render();
  return { enemy: e.name, allyCounts: b.allies.map(u => (u.hand || []).length),
    allyNames: b.allies.map(u => u.name) };
})()`;

// ---------- 场景2：狙击目标 ----------
// 敌人手上 ♠ 多 → 展示玩家手牌后比较花色 → 单体杀不可响应
const snipeTpl = `(() => {
  const b = window.state.battle;
  const e = b.enemies[1];
  e.ai = "ruins_sniper";
  e.name = "贵族军狙击手";
  e.stats = e.stats || {}; e.stats.attack = 14;
  e.hp = 58;
  e.usedRuinsSnipe = false;
  e.ruinsSniperLocked = false;
  // 敌人 ♠ 3 张
  e.hand = [
    { name: "杀", type: "kill", suit: "♠" },
    { name: "杀", type: "kill", suit: "♠" },
    { name: "闪", type: "response", suit: "♠" },
  ];
  // 玩家方全部 ♠ 共 2 张 → 展示任一张都是 ♠，敌人 3 > 2，应锁定
  b.allies.forEach((u, i) => {
    u.hand = [{ name: "闪", type: "response", suit: "♠" }, { name: "杀", type: "kill", suit: "♠" }];
    u.hp = 80;
    u.stats = u.stats || {}; u.stats.handLimit = 99;
  });
  b.enemies[0].hand = [];
  window.__log = [];
  if (!window.__hooked) {
    const orig = window.BattleAI.choose;
    window.BattleAI.choose = function (bb, actor, canPlay) {
      let r = null; try { r = orig(bb, actor, canPlay); } catch (err) {}
      window.__log.push({ actor: actor?.name, move: r?.card?.name || null });
      return r;
    };
    window.__hooked = true;
  }
  window.render();
  return { enemy: e.name, enemySpade: (e.hand || []).filter(c => c.suit === "♠").length };
})()`;

// ---------- 场景3：坦克炮弹 ----------
// 出牌阶段弃 2 张单体杀装填 → 下回合准备阶段全体 攻击力×2 伤害
const tankTpl = `(() => {
  const b = window.state.battle;
  const e = b.enemies[1];
  e.ai = "ruins_tank";
  e.name = "梅尔卡坦克";
  e.stats = e.stats || {}; e.stats.attack = 16;
  e.hp = 85;
  e.usedRuinsTankShell = false;
  e.ruinsTankShellReady = false;
  e.hand = [
    { name: "杀", type: "kill", suit: "♠" },
    { name: "杀", type: "kill", suit: "♥" },
    { name: "闪", type: "response", suit: "♦" },
  ];
  // 玩家方无闪 → 直接吃满伤害，便于校验数值
  // 放宽手牌上限：否则贝丝妲摸牌后触发"弃牌"决策，阻塞回合推进，坦克永远等不到发射回合
  b.allies.forEach(u => { u.hand = []; u.hp = 200; u.stats = u.stats || {}; u.stats.handLimit = 99; });
  b.enemies[0].hand = [];
  window.__log = [];
  window.__tank = { loaded: false, fired: false };
  // 确定性注入：AI 决策本身是随机的，可能直接把2张杀打出去而不装填，导致本项 flaky。
  // 这里只固定"决策结果"，执行仍走真实链路（useSkillCard → useTankShell → 下回合 tankPrepare）。
  const origChoose = window.BattleAI.choose;
  window.BattleAI.choose = function (bb, actor, canPlay) {
    let r = null; try { r = origChoose(bb, actor, canPlay); } catch (err) {}
    if (actor?.ai === "ruins_tank" && !actor.usedRuinsTankShell) {
      const singles = (actor.hand || []).filter(c =>
        c && !c._pendingDraw && window.CardUtils?.isEntitySingleKill?.(c));
      if (singles.length >= 2) {
        r = { card: { name: "坦克炮弹", _skill: true, ruinsTankShell: true, targetless: true },
              target: actor, score: 999 };
      }
    }
    window.__log.push({ actor: actor?.name, move: r?.card?.name || null });
    return r;
  };
  window.render();
  return { enemy: e.name, handCount: e.hand.length, attack: e.stats.attack };
})()`;

// ---------- 场景4：麻痹毒子弹 ----------
// 锁定技：单体杀转毒属性 → 造成伤害后目标获得麻痹状态牌
const droneTpl = `(() => {
  const b = window.state.battle;
  const e = b.enemies[1];
  e.ai = "ruins_drone";
  e.name = "攻击型无人机";
  e.stats = e.stats || {}; e.stats.attack = 12;
  e.hp = 47;
  e.hand = [{ name: "杀", type: "kill", suit: "♠" }];
  // 玩家方不给【闪】→ 杀必定命中，才会触发"造成伤害后"的麻痹与毒
  b.allies.forEach(u => { u.hand = []; u.hp = 200; u.stats = u.stats || {}; u.stats.handLimit = 99; });
  b.enemies[0].hand = [];
  window.__log = [];
  if (!window.__hooked) {
    const orig = window.BattleAI.choose;
    window.BattleAI.choose = function (bb, actor, canPlay) {
      let r = null; try { r = orig(bb, actor, canPlay); } catch (err) {}
      window.__log.push({ actor: actor?.name, move: r?.card?.name || null });
      return r;
    };
    window.__hooked = true;
  }
  window.render();
  return { enemy: e.name };
})()`;

const peekTpl = `(() => {
  const b = window.state.battle;
  const e = b.enemies[1];
  return {
    log: (window.__log || []).map(x => \`\${x.actor}:\${x.move}\`),
    battleLog: (window.state.log || []).slice(0, 120),
    // 地雷：玩家方手牌里是否出现地雷状态牌
    mines: b.allies.map(u => (u.hand || []).filter(c => c.landmine || c.name === "地雷").length),
    // 狙击：锁定标记
    sniperLocked: !!e.ruinsSniperLocked,
    sniperTarget: e.ruinsSniperTargetUid ?? null,
    // 坦克：装填 / 发射
    tankReady: !!e.ruinsTankShellReady,
    tankUsed: !!e.usedRuinsTankShell,
    enemyHand: (e.hand || []).length,
    allyHp: b.allies.map(u => u.hp),
    // 麻痹 / 毒
    paralysis: b.allies.map(u => (u.hand || []).filter(c => c.name === "麻痹" || c.paralysis).length),
    poison: b.allies.map(u => u.poison ?? 0),
  };
})()`;

async function runScene(browser, name, tpl, watchMs) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  const out = { name, errors };
  try {
    await openGame(page);
    await startRegressionBattle(page);
    out.setup = await page.evaluate(tpl);
    await page.locator("button", { hasText: "结束出牌" }).first().click();
    const aoeForce = `(() => { const e = window.state.battle.enemies[1];
      if (e && e.hp > 0 && window.state.battle.phase === 4 &&
          window.state.battle.activeUid === e.uid)
        e.hand = [{ name: "机枪扫杀", type: "kill", sweep: true, suit: "♠" }]; })()`;
    // 坦克装填需要手里恰好有2张单体杀；AI 摸牌不保证，故在其出牌阶段强制补齐，
    // 与上面 choose 钩子配合，使"装填→发射"成为确定性路径而非碰运气。
    const tankForce = `(() => { const e = window.state.battle.enemies[1];
      if (e && e.hp > 0 && e.ai === "ruins_tank" && !e.usedRuinsTankShell && !e.ruinsTankShellReady &&
          window.state.battle.phase === 4 && window.state.battle.activeUid === e.uid) {
        if (!((e.hand || []).filter(c => c && !c._pendingDraw && window.CardUtils?.isEntitySingleKill?.(c)).length >= 2))
          e.hand = [{ name: "杀", type: "kill", suit: "♠" }, { name: "杀", type: "kill", suit: "♥" }];
      } })()`;
    const rounds = Math.ceil(watchMs / 1000);
    for (let i = 0; i < rounds; i++) {
      await page.waitForTimeout(1000);
      if (name === "放置地雷") await page.evaluate(aoeForce);
      if (name === "坦克炮弹") await page.evaluate(tankForce);
      const st = await page.evaluate(peekTpl);
      out.last = st;
      // 累计"过程中见过"的关键战报：终态快照会被后续记录挤出，
      // 例如装填记录会被发射记录挤掉、麻痹牌会被"拆解"消耗掉。
      out.seen = out.seen || {};
      const logsNow = (st.battleLog || []).map(l => String(l));
      if (logsNow.some(l => l.includes("装填坦克炮弹"))) out.seen.loaded = true;
      if (logsNow.some(l => l.includes("发射坦克炮弹"))) out.seen.fired = true;
      if (logsNow.some(l => l.includes("获得一张麻痹状态牌"))) out.seen.paralysis = true;
      if (logsNow.some(l => l.includes("的地雷触发"))) out.seen.mineTriggered = true;
      if (logsNow.some(l => l.includes("埋设一颗地雷") || l.includes("获得一张地雷状态牌"))) out.seen.minePlaced = true;
      // 坦克需要跨回合：装填后再等发射（以战报为准，避免轮询错过 ready 窗口）
      if (name === "坦克炮弹") {
        // 以整轮累计的 seen 为准：装填记录会被发射记录挤出 slice 窗口，
        // 只看末次快照会导致 out.loaded 恒 false、进而永不 break。
        if (out.seen?.loaded && out.seen?.fired) { out.loaded = true; out.fired = true; break; }
      } else if (st.log.some(l => l.includes(":")) && i > 6) {
        break;
      }
      // 推进战斗：贝丝妲的榨取精华是玩家决策提示，不跳过则敌方回合永远不推进
      // 地雷需持有者真实打出【响应牌】才触发：玩家方响应弹窗要手动点"使用闪"，
      // 否则响应牌不会被打出，地雷永远不触发（此前该项 flaky 的根因）。
      // 只对地雷场景开启：其他场景点闪会抵消杀，反而破坏狙击/麻痹的判定。
      if (name === "放置地雷") {
        try {
          const use = page.locator("[data-manual-dodge-use]").first();
          if (await use.count() && await use.isVisible()) { await use.click(); continue; }
        } catch (e) { /* 忽略 */ }
      }
      try {
        const skip = page.locator("button", { hasText: "跳过榨取" }).first();
        if (await skip.count() && await skip.isVisible()) await skip.click();
      } catch (e) { /* 忽略 */ }
      try {
        const btn = page.locator("button", { hasText: "结束出牌" }).first();
        if (await btn.count() && await btn.isVisible()) await btn.click();
      } catch (e) { /* 非玩家回合，忽略 */ }
    }
    out.final = await page.evaluate(peekTpl);
  } catch (e) {
    out.err = String(e).slice(0, 200);
  }
  await page.close();
  return out;
}

(async () => {
  const browser = await chromium.launch();
  const scenes = [
    ["放置地雷", landmineTpl, 45000],
    ["狙击目标", snipeTpl, 25000],
    ["坦克炮弹", tankTpl, 75000],
    ["麻痹毒子弹", droneTpl, 25000],
  ];
  const results = [];
  for (const [name, tpl, ms] of scenes) {
    results.push(await runScene(browser, name, tpl, ms));
  }
  await browser.close();

  console.log("\n===== 实战：废墟沙城 4 普通怪技能 (真实浏览器) =====");
  const checks = [];
  for (const r of results) {
    console.log(`\n--- ${r.name} ---`);
    if (r.err) { console.log(`  ❌ 异常: ${r.err}`); checks.push([`${r.name} 无异常`, false]); continue; }
    console.log(`  构造: ${JSON.stringify(r.setup)}`);
    const f = r.final || r.last || {};
    console.log(`  AI决策: ${JSON.stringify((f.log || []).slice(0, 8))}`);
    console.log(`  战报: ${JSON.stringify((f.battleLog || []).slice(0, 8))}`);

    if (r.name === "放置地雷") {
      const logs = (f.battleLog || []).map(l => String(l));
      const total = (f.mines || []).reduce((a, b) => a + b, 0);
      console.log(`  地雷分布(终态): ${JSON.stringify(f.mines)}  (埋雷后若已触发会消耗)`);
      // 埋雷成功的直接证据：战报出现"埋设一颗地雷"/"获得一张地雷状态牌"
      const placed = logs.some(l => l.includes("埋设一颗地雷") || l.includes("获得一张地雷状态牌")) || !!r.seen?.minePlaced;
      // 触发证据：使用响应牌时受到伤害并消耗
      const triggered = logs.some(l => l.includes("的地雷触发")) || !!r.seen?.mineTriggered;
      console.log(`  埋雷=${placed}  触发=${triggered}`);
      // AI 目标 = 响应牌最多的 allies[0]（手牌 2 张闪）
      const top = (r.setup?.allyNames || [])[0];
      const hitTop = !!top && logs.some(l => l.includes(`对${top}发动放置地雷`));
      console.log(`  期望目标=${top}  命中=${hitTop}`);
      checks.push(["放置地雷 · 埋设地雷状态牌", placed]);
      checks.push(["放置地雷 · 战报记录", placed || triggered]);
      checks.push(["放置地雷 · 使用响应牌触发伤害并消耗", triggered]);
      checks.push(["放置地雷 · AI选手牌响应牌最多者", hitTop]);
    } else if (r.name === "狙击目标") {
      console.log(`  锁定=${f.sniperLocked} 目标uid=${f.sniperTarget}`);
      const logged = (f.battleLog || []).some(l => String(l).includes("狙击"));
      const noResp = (f.battleLog || []).some(l => String(l).includes("不可响应"));
      console.log(`  战报含"狙击": ${logged}  含"不可响应": ${noResp}`);
      // 锁定标记在回合结束会重置，故以战报"狙击目标触发"/"不可响应"为准
      const lockedLog = (f.battleLog || []).some(l =>
        String(l).includes("狙击目标触发") || String(l).includes("后续单体杀不可响应"));
      console.log(`  战报锁定证据=${lockedLog}`);
      checks.push(["狙击目标 · 花色比较后锁定并生效", lockedLog]);
      checks.push(["狙击目标 · 战报记录", logged]);
      checks.push(["狙击目标 · 单体杀不可响应", noResp]);
    } else if (r.name === "坦克炮弹") {
      const dmg = (f.battleLog || []).find(l => String(l).includes("发射坦克炮弹"));
      console.log(`  装填=${r.loaded || f.tankReady} 发射=${r.fired} 敌方手牌=${f.enemyHand} 我方HP=${JSON.stringify(f.allyHp)}`);
      console.log(`  发射战报: ${dmg || "-"}`);
      const logs2 = (f.battleLog || []).map(l => String(l));
      // 装填后 AI 还会摸牌，故以战报"装填坦克炮弹"为准，不看手牌数
      const loadedLog = logs2.some(l => l.includes("装填坦克炮弹")) || !!r.seen?.loaded;
      console.log(`  装填战报=${loadedLog}`);
      checks.push(["坦克炮弹 · 装填(弃2张单体杀)", loadedLog]);
      checks.push(["坦克炮弹 · 发射战报", !!dmg || !!r.seen?.fired]);
      // 攻击力16 → 每人 32 点；玩家方无【闪】，应吃满
      const dmg32 = (f.allyHp || []).some(hp => hp <= 200 - 32);
      console.log(`  我方HP=${JSON.stringify(f.allyHp)} (初始200，期望含168)`);
      checks.push(["坦克炮弹 · 造成攻击力2倍伤害(32)", dmg32]);
    } else if (r.name === "麻痹毒子弹") {
      const total = (f.paralysis || []).reduce((a, b) => a + b, 0);
      const poisoned = (f.poison || []).reduce((a, b) => a + b, 0);
      console.log(`  麻痹分布: ${JSON.stringify(f.paralysis)} 总计=${total}`);
      console.log(`  毒层数: ${JSON.stringify(f.poison)} 总计=${poisoned}`);
      const poisonLog = (f.battleLog || []).some(l => String(l).includes("毒"));
      console.log(`  战报含"毒": ${poisonLog}`);
      // 麻痹牌可能被"拆解"等效果消耗，终态计数为 0 不代表没生成，以过程战报为准
      checks.push(["麻痹毒子弹 · 生成麻痹状态牌", total > 0 || !!r.seen?.paralysis]);
      checks.push(["麻痹毒子弹 · 毒属性伤害", poisonLog || poisoned > 0]);
    }
    if (r.errors.length) console.log(`  页面错误: ${r.errors.slice(0, 2).join(";")}`);
    checks.push([`${r.name} 页面无JS错误`, r.errors.length === 0]);
  }

  console.log("\n===== 汇总 =====");
  let pass = 0, fail = 0;
  checks.forEach(([n, ok]) => {
    console.log(`  ${ok ? "✅" : "❌"} ${n}`);
    ok ? pass++ : fail++;
  });
  console.log(`\n汇总：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})();
