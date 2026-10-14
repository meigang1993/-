// 实战：【借刀杀人】指定「持状态牌 / 被控住」的队友时不卡死
//
// 玩家反馈：借刀杀人指定有状态牌的角色会直接卡死。
// 本文件只跑借刀杀人的三种分支，每个分支独立开一局（此前与其他用例共用
// 一局时前一个用例的 resume / 手牌残留会让点击静默失效，出现假红）。
//
//   分支 A borrowSlashChoice：队友有【杀】+ 状态牌 → 只有【杀】可点
//   分支 B borrowGainChoice：队友被控、无杀、有普通牌 → 可点且能收场
//   分支 C borrowGainChoice：队友手牌全是状态牌 → 能收场、不永久锁死
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

// 在全新一局里跑一段脚本：彻底隔离，避免用例间相互污染。
async function inFreshBattle(page, fn) {
  await startRegressionBattle(page);
  return page.evaluate(fn);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e.message || e)));

  console.log("\n【A】队友有【杀】+ 状态牌，且被控住 → 只有【杀】可点");
  const rA = await inFreshBattle(page, () => {
    const st = window.state, b = st.battle;
    const a = b.allies[0], partner = b.allies[1];
    const enemy = b.enemies.find(u => u.hp > 0);
    b.enemies.forEach(u => { u.hand = []; u.noResponse = true; });
    b.activeUid = a.uid; b.phase = 4; b.locked = false; b.animQueue = [];
    b.handReveal = null; b.comboPartnerUid = null; st.log = [];
    partner.hand = [
      { name: "杀（普攻）", type: "slash", suit: "♠", scale: "attack", power: 0 },
      window.BattleStatusCards.create("slime"),
      window.BattleStatusCards.create("stun"),
    ];
    partner.skipPlayPhase = true;
    partner.skipPlayReason = "眩晕";
    a.hand = [{ name: "借刀杀人", type: "tactic", suit: "♠", borrowSlash: true }];
    window.BattleSystem.playActiveCard(st, 0, enemy.uid, partner.uid);
    window.render();
    const nodes = [...document.querySelectorAll("[data-card-index]")];
    return {
      mode: b.handReveal?.mode,
      valid: b.handReveal?.validIndexes,
      total: nodes.length,
      clickable: nodes.filter(n => !/disabled/.test(n.className)).length,
    };
  });
  check("进入选杀模式", rA.mode === "borrowSlashChoice", `mode=${rA.mode}`);
  check("只有【杀】是合法选项（状态牌被排除）",
    JSON.stringify(rA.valid) === "[0]", `valid=${JSON.stringify(rA.valid)}`);
  check("界面恰好 1 张可点（不再全灰 → 卡死）",
    rA.clickable === 1, `可点=${rA.clickable}/${rA.total}`);

  console.log("\n【B】队友被控、无杀、有普通牌 → 可获得牌模式也能收场");
  const rB = await inFreshBattle(page, () => {
    const st = window.state, b = st.battle;
    const a = b.allies[0], partner = b.allies[1];
    const enemy = b.enemies.find(u => u.hp > 0);
    b.enemies.forEach(u => { u.hand = []; u.noResponse = true; });
    b.activeUid = a.uid; b.phase = 4; b.locked = false; b.animQueue = [];
    b.handReveal = null; b.comboPartnerUid = null; st.log = [];
    partner.hand = [
      window.BattleStatusCards.create("slime"),
      { name: "闪", type: "response", suit: "♥" },
    ];
    partner.skipPlayPhase = true;
    a.hand = [{ name: "借刀杀人", type: "tactic", suit: "♠", borrowSlash: true }];
    window.BattleSystem.playActiveCard(st, 0, enemy.uid, partner.uid);
    window.render();
    const mode = b.handReveal?.mode;
    const nodes = [...document.querySelectorAll("[data-card-index]")];
    const clickable = nodes.filter(n => !/disabled/.test(n.className)).length;
    nodes.find(n => !/disabled/.test(n.className))?.click();
    window.render();
    return {
      mode, clickable, total: nodes.length,
      afterLocked: !!b.locked, afterReveal: !!b.handReveal,
    };
  });
  check("进入可获得牌模式", rB.mode === "borrowGainChoice", `mode=${rB.mode}`);
  check("被控队友的手牌仍可点（未全灰）",
    rB.clickable >= 1, `可点=${rB.clickable}/${rB.total}`);
  check("点击后能收场（不永久锁死）",
    !rB.afterLocked && !rB.afterReveal,
    `locked=${rB.afterLocked} reveal=${rB.afterReveal}`);

  console.log("\n【C】队友手牌全是状态牌 → 必须能收场、不卡死");
  const rC = await inFreshBattle(page, () => {
    const st = window.state, b = st.battle;
    const a = b.allies[0], partner = b.allies[1];
    const enemy = b.enemies.find(u => u.hp > 0);
    b.enemies.forEach(u => { u.hand = []; u.noResponse = true; });
    b.activeUid = a.uid; b.phase = 4; b.locked = false; b.animQueue = [];
    b.handReveal = null; b.comboPartnerUid = null; st.log = [];
    partner.hand = [
      window.BattleStatusCards.create("slime"),
      window.BattleStatusCards.create("stun"),
    ];
    partner.skipPlayPhase = true;
    a.hand = [{ name: "借刀杀人", type: "tactic", suit: "♠", borrowSlash: true }];
    window.BattleSystem.playActiveCard(st, 0, enemy.uid, partner.uid);
    window.render();
    const mode = b.handReveal?.mode;
    const firstNodes = [...document.querySelectorAll("[data-card-index]")];
    const clickable = firstNodes.filter(n => !/disabled/.test(n.className)).length;
    // 选牌弹窗带 repeatAfter：拿走一张后若队友仍有牌会再次弹出，
    // 故循环点到收场为止（上限 6 次防呆）。
    let clicks = 0;
    const trace = [];
    while (b.handReveal && clicks < 6) {
      const list = [...document.querySelectorAll("[data-card-index]")];
      const btn = list.find(n => !/disabled/.test(n.className));
      trace.push({
        clicks, pH: partner.hand.map(c => c.name),
        pick: btn?.dataset?.cardIndex,
      });
      if (!btn) { window.BattleSystem.resolveHandReveal(st, null); break; }
      btn.click();
      clicks += 1;
      window.render();
    }
    return {
      mode, clickable, total: firstNodes.length, clicks, trace,
      afterLocked: !!b.locked, afterReveal: !!b.handReveal,
      logs: st.log.slice(-3),
    };
  });
  check("全状态牌时也进入可获得牌模式", rC.mode === "borrowGainChoice",
    `mode=${rC.mode}`);
  check("有牌可点（未全灰）", rC.clickable >= 1,
    `可点=${rC.clickable}/${rC.total}`);
  check("循环点击后能收场（不永久锁死）",
    !rC.afterLocked && !rC.afterReveal,
    `locked=${rC.afterLocked} reveal=${rC.afterReveal} 点击${rC.clicks}次 trace=${JSON.stringify(rC.trace)}`);
  check("确有借刀杀人结算日志",
    (rC.logs || []).some(l => /借刀杀人/.test(l)), JSON.stringify(rC.logs));

  console.log(`\n合计 ${pass} 通过 / ${fail} 失败   页面错误 ${errors.length}`);
  if (errors.length) console.log(errors.slice(0, 3));
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
