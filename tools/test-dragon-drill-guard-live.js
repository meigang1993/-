// 实战回归：机械AI龙「电钻火花」连击 × 奥菲莉亚「为我护驾」× 星野海一「半魅魔血」
//
// 背景（玩家反馈）：电钻火花打半魅魔血时，若中间经过奥菲莉亚护驾，
//   交完牌后不再出现追加攻击，7 段连击只打出 1 段。
//
// 根因：第 1 段打奥菲莉亚时被护驾弹窗打断，此时尚未造成任何伤害，
//   电钻火花（造成伤害后才摇骰）还没执行，gatlingRepeats 仍为 1，
//   于是 captureHitContinuation 存下的 remainingHits = 1-1 = 0；
//   护驾者承担伤害后虽摇出 6 次追加，却已无剩余段可续跑。
//
// 修复（玩家选定方案 A）：护驾只在整张杀的第 1 段触发，追加段直接结算给护驾者；
//   且护驾结算后按最新总段数重新计算追加段，不再沿用弹窗时的旧值。
//
// 断言：护驾只弹一次 / 追加段走反应队列 / 7 段全部结算给护驾者 /
//       奥菲莉亚全程未掉血 / 半魅魔血逐段触发 / 结束时无残留 / 无 JS 错误。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const setupTpl = `(() => {
  const st = window.state, b = st.battle;
  const dragon = b.enemies[0];
  dragon.ai = "ruins_dragon"; dragon.name = "机械AI龙";
  dragon.stats = Object.assign({}, dragon.stats, { attack: 13, magic: 8, speed: 15 });
  dragon.hp = 500; dragon.maxHp = 500; dragon.handLimit = 4;
  dragon.hand = [{ name: "杀", type: "slash", suit: "♠", scale: "attack" }];
  dragon.hand.forEach(c => { delete c._pendingDraw; });

  const ophelia = b.allies[0];
  ophelia.ref = "ophelia"; ophelia.name = "奥菲莉亚";
  ophelia.hp = 400; ophelia.maxHp = 400;
  ophelia.hand = [];   // 无闪 → 必定走护驾

  const kaiichi = b.allies[1];
  kaiichi.ref = "hoshino_kaiichi"; kaiichi.name = "星野海一";
  kaiichi.hp = 400; kaiichi.maxHp = 400;
  kaiichi.stats = Object.assign({}, kaiichi.stats, { handLimit: 99 });
  kaiichi.hand = [];
  kaiichi.skills = [{ name: "半魅魔血", type: "trigger", icon: "🔵",
    text: "当你受到生命值伤害后，你摸2张牌，然后可以选择至多2张手牌并将这些牌交给一名其他友方角色。" }];

  b.allies.slice(2).forEach(u => { u.hp = 0; });
  b.enemies.slice(1).forEach(u => { u.hp = 0; });
  b.phase = 4; b.activeUid = dragon.uid; b.locked = false; b.animQueue = [];
  b.opheliaGuard = null; b.opheliaGuardUid = null;
  b.opheliaGuardRedirectUid = null; b.opheliaGuardRepeats = 0;
  b.manualDodgeResume = null;
  window.state.settings = window.state.settings || {};
  window.state.settings.manualResponse = false;
  window.state.settings.manualDodge = false;

  // 骰子固定 6 → 电钻火花追加 6 段，共 7 段
  if (window.GameRandom && !window.__diceHooked) {
    const orig = window.GameRandom.int.bind(window.GameRandom);
    window.GameRandom.int = (min, max, s) => (min === 1 && max === 6 ? 6 : orig(min, max, s));
    window.__diceHooked = true;
  }

  window.__p = { guardPrompts: 0, resumeAfterGuard: null, shares: 0,
    hpTrack: [400], opheliaTrack: [400] };
  window.__tl = [];
  if (window.__s) clearInterval(window.__s);
  window.__s = setInterval(() => {
    const bb = window.state && window.state.battle;
    if (!bb) return;
    if (bb.opheliaGuard && !window.__p._g) { window.__p._g = true; window.__p.guardPrompts++; }
    else if (!bb.opheliaGuard) window.__p._g = false;
    if (bb.kaiichiShare && !window.__p._sh) { window.__p._sh = true; window.__p.shares++; }
    else if (!bb.kaiichiShare) window.__p._sh = false;
    // 护驾结算后的第一次挂起段数（修复前为 null）
    if (bb.manualDodgeResume && window.__p.resumeAfterGuard === null) {
      window.__p.resumeAfterGuard = bb.manualDodgeResume.remainingHits;
    }
    const hp = bb.allies[1] ? bb.allies[1].hp : null;
    if (hp != null && window.__p.hpTrack[window.__p.hpTrack.length-1] !== hp) {
      window.__p.hpTrack.push(hp);
    }
    const oh = bb.allies[0] ? bb.allies[0].hp : null;
    if (oh != null && window.__p.opheliaTrack[window.__p.opheliaTrack.length-1] !== oh) {
      window.__p.opheliaTrack.push(oh);
    }
  }, 20);
  window.render();
  return { kaiichiUid: kaiichi.uid, dragonUid: dragon.uid };
})()`;

const playTpl = `(() => {
  const st = window.state, b = st.battle;
  const dragon = b.enemies[0], ophelia = b.allies[0];
  st.log = [];
  const card = dragon.hand.filter(c => c.type === "slash")[0];
  if (!card) return { err: "dragon no slash" };
  window.BattleSystem.useCard(st, dragon, ophelia, card);
  return { log: (st.log || []).slice(0, 30) };
})()`;

async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e).slice(0, 200)));
  const out = {};
  try {
    await openGame(page);
    await startRegressionBattle(page);
    await page.waitForTimeout(800);
    out.setup = await page.evaluate(setupTpl);
    out.play = await page.evaluate(playTpl);
    await page.waitForTimeout(500);
    let stable = 0, lastHp = null;
    for (let i = 0; i < 90; i++) {
      await page.waitForTimeout(400);
      const st = await page.evaluate(`(() => {
        const b = window.state.battle;
        return { guard: !!b.opheliaGuard, share: !!b.kaiichiShare, locked: !!b.locked,
          kaiichiHp: b.allies[1] ? b.allies[1].hp : null,
          resumeLeft: b.manualDodgeResume ? b.manualDodgeResume.remainingHits : null };
      })()`);
      if (st.guard) {
        const target = page.locator(`[data-target="${out.setup.kaiichiUid}"]`).first();
        if (await target.count()) await target.click().catch(() => {});
        continue;
      }
      if (st.share) {
        const skip = page.locator("[data-kaiichi-share-skip]").first();
        if (await skip.count()) await skip.click().catch(() => {});
        continue;
      }
      if (!st.locked && st.resumeLeft == null && st.kaiichiHp === lastHp) {
        stable += 1;
        if (stable >= 6) break;
      } else { stable = 0; lastHp = st.kaiichiHp; }
    }
    out.final = await page.evaluate(`(() => {
      const b = window.state.battle;
      return { p: window.__p, log: (window.state.log || []).slice(-40),
        kaiichiHp: b.allies[1] ? b.allies[1].hp : null,
        opheliaHp: b.allies[0] ? b.allies[0].hp : null,
        resumeLeft: b.manualDodgeResume ? b.manualDodgeResume.remainingHits : null };
    })()`);
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
  const p = f.p || {};
  const logs = (f.log || []).map(String);
  const hp = p.hpTrack || [];
  const drops = hp.length - 1;

  console.log(`护驾弹窗次数=${p.guardPrompts}  护驾后挂起段=${p.resumeAfterGuard}`);
  console.log(`海一HP轨迹=${JSON.stringify(hp)}  奥菲莉亚HP轨迹=${JSON.stringify(p.opheliaTrack)}`);
  console.log(`交牌弹窗次数=${p.shares}`);

  check("1 电钻火花已发动（骰子6）",
    logs.some(l => l.includes("电钻火花") && l.includes("点数6")));
  check("2 护驾已触发且只弹一次（追加段不再护驾）",
    p.guardPrompts === 1, `实际=${p.guardPrompts}`);
  // 电钻火花改为「追加多段伤害」后，追加段走反应队列而非 remainingHits 挂起：
  // 不再依赖 manualDodgeResume.remainingHits，故挂起值本就应为 null/未设置，
  // 追加段是否结算改由断言 4（护驾者掉血段数）验证。
  check("3 追加段走反应队列（不再依赖 remainingHits 挂起）",
    p.resumeAfterGuard == null, `挂起=${p.resumeAfterGuard}`);
  check("4 追加段继续结算给护驾者（掉血 ≥5 段）",
    drops >= 5, `掉血段数=${drops} 轨迹=${JSON.stringify(hp)}`);
  check("5 奥菲莉亚全程未掉血（伤害全部转移给护驾者）",
    (p.opheliaTrack || []).every(v => v === 400),
    `轨迹=${JSON.stringify(p.opheliaTrack)}`);
  // 交牌弹窗出现很快，20ms 轮询采样会漏；改用日志计数（每段各触发一次摸牌）
  const shareHits = logs.filter(l => l.includes("半魅魔血令其摸2张牌")).length;
  check("6 半魅魔血逐段触发（摸牌次数 ≥5）",
    shareHits >= 5, `摸牌次数=${shareHits} 弹窗采样=${p.shares}`);
  check("7 结束时无残留挂起段", f.resumeLeft == null, `resumeLeft=${f.resumeLeft}`);
  check("8 无页面 JS 错误", (res.errors || []).length === 0,
    (res.errors || []).slice(0, 2).join(" | "));

  console.log(`\n汇总：${passed} 通过 / ${failed} 失败`);
  process.exit(failed ? 1 : 0);
});
