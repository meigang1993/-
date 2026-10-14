// 实战：【借刀杀人】指定被控住（眩晕/麻痹等 skipPlayPhase）的队友会卡死
// 根因：借刀杀人选牌时底部手牌区展示的是「队友」的手牌（handReveal.targetUid），
//       而 ui-hand-view 的 skipLocked 用「面板所属角色」的 skipPlayPhase 把全部牌置灰；
//       队友被控住 → 无牌可点，而 borrowSlashChoice/borrowGainChoice 是强制选择
//       （resolveHandReveal 不允许以 index==null 关闭）→ battle.locked 永久为真。
// 修复：skipLocked 只作用于自己的出牌阶段，借刀杀人/次元转移等转移类模式不置灰。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "✅" : "❌"} ${name}${detail ? `  ← ${detail}` : ""}`);
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e.message || e)));
  await startRegressionBattle(page);

  console.log("\n【一】借刀杀人 · 队友被控住：必须能选牌且能完成");
  const r1 = await page.evaluate(() => {
    const st = window.state, b = st.battle;
    const a = b.allies[0], partner = b.allies[1];
    const enemy = b.enemies.find(u => u.hp > 0);
    b.activeUid = a.uid; b.phase = 4; b.locked = false; b.animQueue = [];
    b.handReveal = null; b.comboPartnerUid = null; st.log = [];
    // 排除敌方【看破】自动响应干扰
    b.enemies.forEach(u => { u.hand = []; u.noResponse = true; });
    partner.hand = [{ name: "杀（普攻）", type: "slash", suit: "♠", scale: "attack", power: 0 }];
    partner.skipPlayPhase = true;          // 被控住
    partner.skipPlayReason = "眩晕";
    a.hand = [{ name: "借刀杀人", type: "tactic", suit: "♠", borrowSlash: true }];
    const ok = window.BattleSystem.playActiveCard(st, 0, enemy.uid, partner.uid);
    window.render();
    const nodes = [...document.querySelectorAll("[data-card-index]")];
    return {
      ok, mode: b.handReveal?.mode, valid: b.handReveal?.validIndexes,
      handOwner: document.querySelector("[data-hand-owner]")?.dataset.handOwner,
      partnerUid: partner.uid, enemyHpBefore: enemy.hp,
      total: nodes.length,
      clickable: nodes.filter(n => !/disabled/.test(n.className)).length,
    };
  });
  check("前置：借刀杀人进入选牌模式", r1.mode === "borrowSlashChoice", `mode=${r1.mode}`);
  check("前置：底部手牌区展示的是队友", r1.handOwner === r1.partnerUid,
    `owner=${r1.handOwner} partner=${r1.partnerUid}`);
  check("队友被控住时，单体杀牌仍可点击", r1.clickable >= 1,
    `可点=${r1.clickable}/${r1.total}`);

  const r2 = await page.evaluate(() => {
    const st = window.state, b = st.battle;
    const node = [...document.querySelectorAll("[data-card-index]")]
      .find(n => !/disabled/.test(n.className));
    if (!node) return { clicked: false };
    node.click();
    return { clicked: true, locked: b.locked, reveal: !!b.handReveal,
      enemyHp: b.enemies.find(u => u.hp > 0)?.hp,
      logs: (st.log || []).map(String).filter(s => /借刀杀人/.test(s)).slice(0, 3) };
  });
  check("真实点击后可正常完成（不再卡死）",
    r2.clicked && r2.locked === false && r2.reveal === false,
    JSON.stringify({ locked: r2.locked, reveal: r2.reveal }));
  check("队友的杀确实打出（敌方受伤）", r2.enemyHp < r1.enemyHpBefore,
    `${r1.enemyHpBefore} → ${r2.enemyHp}`);

  console.log("\n【二】对照组：自己被控住时，出牌阶段自己的手牌仍应置灰");
  const r3 = await page.evaluate(() => {
    const st = window.state, b = st.battle;
    const a = b.allies[0];
    b.activeUid = a.uid; b.phase = 4; b.locked = false; b.animQueue = [];
    b.handReveal = null; b.comboPartnerUid = null;
    a.skipPlayPhase = true; a.skipPlayReason = "眩晕";
    a.hand = [{ name: "杀（普攻）", type: "slash", suit: "♠", scale: "attack", power: 0 },
      { name: "闪", type: "response", suit: "♥" }];
    window.render();
    const nodes = [...document.querySelectorAll("[data-card-index]")];
    return { owner: document.querySelector("[data-hand-owner]")?.dataset.handOwner,
      aUid: a.uid, total: nodes.length,
      clickable: nodes.filter(n => !/disabled/.test(n.className)).length };
  });
  check("自己被控住：出牌阶段手牌置灰（修复未被放宽）",
    r3.total > 0 && r3.clickable === 0, `可点=${r3.clickable}/${r3.total}`);

  console.log("\n【三】兜底：强制选择模式无合法选项时允许关闭");
  const r4 = await page.evaluate(() => {
    const st = window.state, b = st.battle;
    b.allies.forEach(u => { u.skipPlayPhase = false; u.skipPlayReason = ""; });
    b.locked = true;
    b.handReveal = { actorUid: b.allies[0].uid, targetUid: b.allies[1].uid,
      cardName: "借刀杀人", mode: "borrowGainChoice", validIndexes: [] };
    const done = window.BattleSystem.resolveHandReveal(st, null);
    return { done, locked: b.locked, reveal: !!b.handReveal };
  });
  check("无合法选项时可关闭弹窗（不会永久锁死）",
    r4.locked === false && r4.reveal === false,
    JSON.stringify({ locked: r4.locked, reveal: r4.reveal }));

  console.log(`\n合计 ${pass} 通过 / ${fail} 失败   页面错误 ${errors.length}`);
  if (errors.length) console.log(errors.slice(0, 3).join("\n"));
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
