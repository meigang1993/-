// 【麻痹毒子弹】第一回合毒标记 · 浏览器实机回归
// 两个真实回合场景：
//   正常血量：命中后恰好 1 层毒 + 1 张麻痹，不叠 2 层
//   濒死血量：一击把目标打到 hp<=0（随后被"测试模式·生命恢复"救回），
//             毒不再被 addPoison 的存活守卫吞掉，与麻痹同源发放
// 运行：node tools/test-paralysis-poison-first-round-live.js
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const { startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const setupTpl = `(() => {
  const b = window.state.battle;
  const e = b.enemies[1];
  e.ai = "ruins_drone";
  e.name = "攻击型无人机";
  e.stats = e.stats || {}; e.stats.attack = 12;
  e.hp = 104;
  // 只给一张实体单体杀，强制不可响应保证造成伤害
  e.hand = [{ name: "杀（普攻）", type: "slash", suit: "♠", power: 0, scale: "attack",
    ignoreResponse: true }];
  b.allies.forEach(u => {
    u.hand = []; u.hp = window.__probeHp;
    u.noResponse = true; u.noResponseReason = "回归探针";
    u.stats = u.stats || {}; u.stats.handLimit = 99;
    u.poison = 0; u.poisonMarks = []; u.statuses = [];
  });
  b.enemies[0].hand = [];
  window.__probe = { before: [], after: [], poisonAdds: [], paraAdds: [] };
  const origBefore = window.RuinsGruntSkills.beforeKillUsed;
  window.RuinsGruntSkills.beforeKillUsed = function (s, a, c) {
    origBefore(s, a, c);
    window.__probe.before.push({ ai: a?.ai, name: c?.name, type: c?.type,
      poison: c?.poison, single: !!window.RuinsGruntCommon?.isSingleSlash?.(c) });
  };
  const origAfter = window.EnemySkills.afterDamage;
  window.EnemySkills.afterDamage = function (s, a, t, c, hp, ...rest) {
    window.__probe.after.push({ actor: a?.ai, target: t?.name, name: c?.name,
      type: c?.type, poison: c?.poison, hpLoss: hp,
      poisonTick: !!c?.poisonTick, soulChain: !!c?._soulChain });
    return origAfter(s, a, t, c, hp, ...rest);
  };
  const origAddPoison = window.EnemySkills.addPoison;
  window.EnemySkills.addPoison = function (s, t, n, src, allowDowned) {
    window.__probe.poisonAdds.push({ target: t?.name, n, hp: t?.hp, allowDowned: !!allowDowned });
    return origAddPoison(s, t, n, src, allowDowned);
  };
  const origAdd = window.BattleStatusCards.add;
  window.BattleStatusCards.add = function (s, t, card, src) {
    if (card?.name === "麻痹") window.__probe.paraAdds.push({ target: t?.name, hp: t?.hp });
    return origAdd(s, t, card, src);
  };
  // 强制该敌人第一次决策就是这张实体单体杀，避免 AI 先打摸到的战术牌
  if (!window.__origChoose) window.__origChoose = window.BattleAI.choose;
  const origChoose = window.__origChoose;
  window.__droneKillDone = false;
  window.BattleAI.choose = function (bb, actor, canPlay) {
    let r = null;
    if (actor?.ai === "ruins_drone" && !window.__droneKillDone) {
      const kill = (actor.hand || []).find(c => c && !c._pendingDraw && c.name === "杀（普攻）");
      if (kill) {
        r = { card: kill, target: (bb.allies || [])[0], score: 999 };
        window.__droneKillDone = true;
      }
    }
    if (!r) { try { r = origChoose(bb, actor, canPlay); } catch (err) {} }
    return r;
  };
  window.render();
  return { enemy: e.name, hand: (e.hand || []).map(c => c.name), hp: window.__probeHp };
})()`;

const peekTpl = `(() => {
  const b = window.state.battle;
  return {
    roundNo: b.roundNo, probe: window.__probe,
    allies: b.allies.map(u => ({ name: u.name, hp: u.hp, poison: u.poison ?? 0,
      marks: (u.poisonMarks || []).length, statuses: u.statuses || [],
      paralysis: (u.hand || []).filter(c => c.name === "麻痹").length })),
    battleLog: (window.state.log || []).slice(0, 40),
  };
})()`;

async function runScene(browser, hp) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  let out = { errors };
  try {
    await startRegressionBattle(page);
    await page.evaluate(v => { window.__probeHp = v; }, hp);
    out.setup = await page.evaluate(setupTpl);
    await page.locator("button", { hasText: "结束出牌" }).first().click();
    let hitAt = 0;
    for (let i = 0; i < 26; i++) {
      await page.waitForTimeout(1000);
      try {
        const skip = page.locator("button", { hasText: "跳过榨取" }).first();
        if (await skip.count() && await skip.isVisible()) await skip.click();
      } catch (e) { /* ignore */ }
      try {
        const btn = page.locator("button", { hasText: "结束出牌" }).first();
        if (await btn.count() && await btn.isVisible()) await btn.click();
      } catch (e) { /* 非玩家回合 */ }
      const st = await page.evaluate(peekTpl);
      if (st.probe.after.length && !hitAt) hitAt = i + 1;
      if (hitAt && i + 1 - hitAt >= 2) break;
    }
    out.final = await page.evaluate(peekTpl);
  } catch (e) {
    out.err = String(e).slice(0, 300);
  }
  await page.close();
  return out;
}

(async () => {
  const browser = await chromium.launch();
  const scenes = [
    ["正常血量", 300],
    ["濒死被救回", 5],
  ];
  const checks = [];
  for (const [name, hp] of scenes) {
    const r = await runScene(browser, hp);
    console.log(`\n--- ${name} (hp=${hp}) ---`);
    if (r.err) { console.log(`  ❌ 异常: ${r.err}`); checks.push([`${name} 无异常`, false]); continue; }
    const f = r.final || {};
    const hit = (f.probe?.after || []).find(x => x.actor === "ruins_drone");
    const victim = (f.allies || []).find(u => hit && u.name === hit.target) || (f.allies || [])[0];
    const poisonAdds = f.probe?.poisonAdds || [];
    const paraAdds = f.probe?.paraAdds || [];
    console.log(`  命中: ${JSON.stringify(hit)}`);
    console.log(`  目标: ${JSON.stringify(victim)}`);
    console.log(`  发毒: ${JSON.stringify(poisonAdds)}  麻痹: ${JSON.stringify(paraAdds)}`);
    console.log(`  毒战报: ${JSON.stringify((f.battleLog || []).filter(l => String(l).includes("层毒")))}`);
    checks.push([`${name} · 无人机确实打出实体单体杀`, !!hit && hit.poison === true && hit.hpLoss > 0]);
    checks.push([`${name} · 目标恰好 1 层毒`, victim?.poison === 1 && victim?.marks === 1]);
    checks.push([`${name} · 目标恰好 1 张麻痹状态牌`, victim?.paralysis === 1]);
    checks.push([`${name} · statuses 含毒与麻痹`, (victim?.statuses || []).includes("毒")
      && (victim?.statuses || []).includes("麻痹")]);
    checks.push([`${name} · 只发 1 次毒（不叠 2 层）`, poisonAdds.length === 1
      && poisonAdds[0].n === 1 && poisonAdds[0].allowDowned === true]);
    checks.push([`${name} · 麻痹与毒同源（同一时刻）`, paraAdds.length === 1
      && paraAdds[0].hp === poisonAdds[0]?.hp]);
    if (hp <= 5) {
      checks.push([`${name} · 发放瞬间目标 hp<=0（BUG 触发条件成立）`,
        poisonAdds[0]?.hp <= 0 && paraAdds[0]?.hp <= 0]);
      checks.push([`${name} · 目标已被救回（人还活着）`, victim?.hp > 0]);
    }
    checks.push([`${name} 页面无 JS 错误`, (r.errors || []).length === 0]);
  }
  await browser.close();

  console.log("\n===== 汇总 =====");
  let pass = 0, fail = 0;
  checks.forEach(([n, ok]) => {
    console.log(`  ${ok ? "✅" : "❌"} ${n}`);
    if (ok) pass += 1; else fail += 1;
  });
  console.log(`\n结果: ${fail === 0 ? "ALL_OK" : fail + " 项失败"}  通过 ${pass}/${pass + fail}`);
  process.exit(fail ? 1 : 0);
})();
