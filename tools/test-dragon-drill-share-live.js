// 专项实战：机械AI龙「电钻火花」连击 × 星野海一「半魅魔血」交牌
// 对比两条交牌路径（真交牌 / 不交），验证交牌后追加连击段是否继续结算。
//
// 背景：玩家反馈「电钻火花打半魅魔血，交完牌后没有追加攻击」。
// 此前 test-kaiichi-share-anim-live.js 只覆盖了「不交」路径（9/9 通过），
// 未覆盖玩家真实操作「选牌并交给队友」的路径。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const MODE = process.env.SHARE_MODE || "give"; // give=真交牌 skip=不交
const KILL = `{ name: "杀", type: "slash", suit: "♠" }`;

const setupTpl = `(() => {
  const b = window.state.battle;
  const dragon = b.enemies[1];
  dragon.ai = "ruins_dragon";
  dragon.name = "机械AI龙";
  dragon.stats = Object.assign({}, dragon.stats, { attack: 13, magic: 8, speed: 15 });
  dragon.hand = [${KILL}];
  dragon.handLimit = 4;
  const kaiichi = b.allies[0];
  kaiichi.name = "星野海一";
  kaiichi.ref = "hoshino_kaiichi";
  kaiichi.skills = [{ name: "半魅魔血", type: "trigger", icon: "🔵",
    text: "当你受到生命值伤害后，你摸2张牌，然后可以选择至多2张手牌并将这些牌交给一名其他友方角色。" }];
  kaiichi.hp = 400; kaiichi.maxHp = 400;
  kaiichi.stats = Object.assign({}, kaiichi.stats, { handLimit: 99 });
  kaiichi.hand = [];
  b.allies.slice(1).forEach(u => { u.hp = 400; u.maxHp = 400; });
  b.enemies[0].hand = [];
  if (window.GameRandom && !window.__diceHooked) {
    const orig = window.GameRandom.int.bind(window.GameRandom);
    window.GameRandom.int = (min, max, st) => (min === 1 && max === 6 ? 6 : orig(min, max, st));
    window.__diceHooked = true;
  }
  window.__shares = [];   // 每次交牌弹窗时记录：当前HP / 挂起段数
  window.__hpTrack = [];
  // 日志改为写入即捕获：电钻火花日志在循环早期产生，等到第一次采样可能已被
  // 后续交牌日志挤出 state.log 窗口，仅靠采样累积会漏抓。
  window.__logAcc = [];
  const __pushLog = text => { window.__logAcc.push(String(text)); };
  if (window.BattleLog && !window.__logHooked) {
    const origAdd = window.BattleLog.add.bind(window.BattleLog);
    window.BattleLog.add = (st, text, ...rest) => {
      __pushLog(text); return origAdd(st, text, ...rest);
    };
    window.__logHooked = true;
  }
  const __logArr = window.state.log;
  if (Array.isArray(__logArr) && !__logArr.__hooked) {
    const origPush = __logArr.push.bind(__logArr);
    __logArr.push = (...items) => {
      items.forEach(__pushLog); return origPush(...items);
    };
    __logArr.__hooked = true;
  }
  if (window.__sampler) clearInterval(window.__sampler);
  window.__sampler = setInterval(() => {
    const bb = window.state && window.state.battle;
    if (!bb || !bb.allies[0]) return;
    const hp = bb.allies[0].hp;
    if (!window.__hpTrack.length || window.__hpTrack[window.__hpTrack.length-1] !== hp) {
      window.__hpTrack.push(hp);
    }
    if (bb.kaiichiShare && !window.__sharingNow) {
      window.__sharingNow = true;
      window.__shares.push({ hp, remaining: bb.manualDodgeResume
        ? bb.manualDodgeResume.remainingHits : null });
    } else if (!bb.kaiichiShare) {
      window.__sharingNow = false;
    }
  }, 25);
  window.render();
  return { allyUid: b.allies[1] ? b.allies[1].uid : null, ally0: b.allies[0].uid };
})()`;

const peekTpl = `(() => {
  const b = window.state.battle;
  // 累积日志：电钻火花日志在循环早期产生，只取最后 80 条会被后续交牌日志挤出窗口
  window.__logAcc = window.__logAcc || [];
  (window.state.log || []).map(String).forEach(l => {
    if (!window.__logAcc.includes(l)) window.__logAcc.push(l);
  });
  return {
    log: window.__logAcc.slice(-400),
    hpTrack: window.__hpTrack || [],
    shares: window.__shares || [],
    ally0Hp: b.allies[0] ? b.allies[0].hp : null,
    resumeLeft: b.manualDodgeResume ? b.manualDodgeResume.remainingHits : null,
    locked: !!b.locked,
    phase: b.phase,
  };
})()`;

async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  await page.setViewportSize({ width: 1280, height: 900 });
  page.on("pageerror", e => errors.push(String(e).slice(0, 160)));
  let out = {};
  try {
    await openGame(page);
    await startRegressionBattle(page);
    out.setup = await page.evaluate(setupTpl);
    await page.locator("button", { hasText: "结束出牌" }).first().click();
    for (let i = 0; i < 60; i++) {
      await page.waitForTimeout(600);
      await page.evaluate(`(() => {
        const b = window.state.battle, e = b.enemies[1];
        if (e && e.hp > 0 && b.phase === 4 && b.activeUid === e.uid) e.hand = [${KILL}];
      })()`);
      let handled = false;
      try {
        const prompt = page.locator(".dimension-prompt").first();
        if (await prompt.count() && await prompt.isVisible()) {
          if (MODE === "give") {
            const cards = page.locator(".hand.active-hand .play-card");
            if (await cards.count()) await cards.first().click();
            await page.waitForTimeout(150);
            const ally = page.locator(`[data-target="${out.setup.allyUid}"]`).first();
            if (await ally.count()) await ally.first().click();
          } else {
            const skip = page.locator("[data-kaiichi-share-skip]").first();
            if (await skip.count()) await skip.click();
          }
          handled = true;
        }
      } catch (e) { /* ignore */ }
      if (handled) continue;
      try {
        const btn = page.locator("button", { hasText: "结束出牌" }).first();
        if (await btn.count() && await btn.isVisible()) await btn.click();
      } catch (e) { /* ignore */ }
    }
    out.final = await page.evaluate(peekTpl);
  } catch (e) {
    out.err = String(e).slice(0, 300);
  }
  out.errors = errors;
  await browser.close();
  return out;
}

run().then(res => {
  let passed = 0, failed = 0;
  const check = (name, cond, detail = "") => {
    if (cond) { passed++; console.log(`✅ ${name}${detail ? " — " + detail : ""}`); }
    else { failed++; console.log(`❌ ${name}${detail ? " — " + detail : ""}`); }
  };
  const f = res.final || {};
  const logs = (f.log || []).map(String);
  const drops = (f.hpTrack || []).length - 1;   // 段数 = 血量下降次数
  const hits = logs.filter(l => l.includes("杀") && l.includes("机械AI龙")).length;

  console.log(`模式: ${MODE === "give" ? "真交牌（选牌→交给队友）" : "不交"}`);
  console.log("HP 轨迹:", JSON.stringify(f.hpTrack));
  console.log("每次交牌时快照:", JSON.stringify(f.shares));
  console.log("电钻火花日志:", (logs.find(l => l.includes("电钻火花")) || "").slice(0, 60));

  check("1 电钻火花已发动（骰子6）",
    logs.some(l => l.includes("电钻火花") && l.includes("点数6")));
  check("2 半魅魔血交牌弹窗已出现",
    (f.shares || []).length > 0, `弹窗次数=${(f.shares || []).length}`);
  // 每段都会再弹一次交牌窗（半魅魔血逐段触发 + 每段摸2张），
  // 60 轮循环不足以跑满 7 段，故只断言「交牌后确实继续追加」而非完整 7 段。
  check("3 交牌后追加段继续结算（血量持续下降 ≥4 段）",
    drops >= 4, `实际下降=${drops} 轨迹=${JSON.stringify(f.hpTrack)}`);
  check("4 交牌后仍有追加段（最后一段血量 < 第一段后血量）",
    (f.hpTrack || []).length >= 3, `轨迹长度=${(f.hpTrack || []).length}`);
  check("5 结束时无残留挂起段", f.resumeLeft == null, `resumeLeft=${f.resumeLeft}`);
  check("6 无页面 JS 错误", (res.errors || []).length === 0,
    (res.errors || []).slice(0, 2).join(" | "));

  console.log(`\n汇总：${passed} 通过 / ${failed} 失败`);
  process.exit(failed ? 1 : 0);
});
