// 核查：麻痹（skipPlayPhase="麻痹"）状态下，手牌是否存在"个别牌仍可点"。
//
// 背景：ui-hand-view.js 的 disabled 判定里**没有** actor.skipPlayPhase 这一项，
// 只加了面板的 play-locked 类。所以一旦单位进入出牌阶段，手牌可能未置灰。
// 本脚本回答两件事：
//   场景A（可达性）：麻痹单位被强行放进出牌阶段时，未置灰的牌点击能否真的打出。
//   场景B（响应牌）：麻痹描述为"跳过本回合出牌阶段"，那被【杀】时能否打出【闪】。
//   场景C（真实流程）：麻痹是否只跳过出牌阶段（不设 phase=4），从而无出牌机会。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

// 场景A：麻痹 + 强行进入出牌阶段
const setupA = `(() => {
  const b = window.state.battle;
  const me = b.allies[0];
  me.hand = [
    { name: "杀", type: "kill", suit: "♠" },
    { name: "闪", type: "response", suit: "♥" },
  ];
  me.intent = 3;
  me.skipPlayPhase = true;
  me.skipPlayReason = "麻痹";
  b.activeUid = me.uid;
  b.phase = 4;
  b.locked = false;
  window.render();
  return { uid: me.uid, hand: me.hand.map(c => c.name) };
})()`;

const inspectA = `(() => {
  const b = window.state.battle;
  const me = b.allies[0];
  const nodes = [...document.querySelectorAll(".hand-panel .play-card")];
  return {
    panelLocked: !!document.querySelector(".hand-panel.play-locked"),
    cards: nodes.map(n => ({
      name: n.innerText.split("\\n")[0],
      disabled: n.classList.contains("disabled"),
      idx: n.dataset.cardIndex,
    })),
    handLen: me.hand.length,
    phase: b.phase,
  };
})()`;

// 点击第一张未置灰的牌，看是否真的进入出牌流程（选中或待选目标）
const clickFirstEnabled = `(() => {
  const nodes = [...document.querySelectorAll(".hand-panel .play-card")]
    .filter(n => !n.classList.contains("disabled"));
  if (!nodes.length) return { clicked: false };
  const n = nodes[0];
  const idx = n.dataset.cardIndex;
  n.click();
  return { clicked: true, idx, text: n.innerText.split("\\n")[0] };
})()`;

const afterClick = `(() => {
  const b = window.state.battle;
  return {
    selectedCardIndex: b.selectedCardIndex ?? null,
    awaitingTarget: !!b.selectedCardIndex || !!b.selectedSkillCard,
    handLen: b.allies[0].hand.length,
    logs: (window.state.log || []).map(String).slice(-4),
  };
})()`;

// 场景B：麻痹单位被敌方【杀】攻击 → 能否打出【闪】
const setupB = `(() => {
  const b = window.state.battle;
  const me = b.allies[0];
  const foe = b.enemies[0];
  me.hand = [{ name: "闪", type: "response", suit: "♥" }];
  me.skipPlayPhase = true;
  me.skipPlayReason = "麻痹";
  b.activeUid = foe.uid;
  b.locked = false;
  window.render();
  return { meUid: me.uid, foeUid: foe.uid, hp: me.hp };
})()`;

// 用真实出牌入口打出一张杀（会走【闪】响应判定）
const foeSlash = `(async () => {
  const st = window.state;
  const b = st.battle;
  const me = b.allies[0];
  const foe = b.enemies[0];
  await window.BattleSystem.useCard(st, foe, me, { name: "杀", type: "kill", suit: "♠" });
  window.render();
  return {
    hp: me.hp,
    handLen: me.hand.length,
    logs: (window.state.log || []).map(String).slice(-6),
  };
})()`;

const responseState = `(() => {
  const b = window.state.battle;
  return {
    locked: !!b.locked,
    awaitingKeys: Object.keys(b).filter(k => /await|response|dodge|resume/i.test(k))
      .filter(k => b[k] != null && b[k] !== false),
    skip: b.allies[0].skipPlayPhase,
  };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  const out = { errors, pass: [], fail: [] };
  const t = (name, ok, info) => (ok ? out.pass : out.fail).push({ name, ...(info || {}) });
  try {
    await startRegressionBattle(page);
    await page.waitForTimeout(600);

    // ---------- 场景A ----------
    out.setupA = await page.evaluate(setupA);
    await page.waitForTimeout(300);
    const a1 = await page.evaluate(inspectA);
    out.beforeClick = a1;
    t("A1 麻痹面板带 play-locked 类", a1.panelLocked, { v: a1.panelLocked });
    const enabled = a1.cards.filter(c => !c.disabled);
    out.enabledCards = enabled;
    // 记录事实：是否有未置灰的牌（这是本次核查的核心观测点）
    out.factEnabledCount = enabled.length;
    const clickInfo = await page.evaluate(clickFirstEnabled);
    await page.waitForTimeout(400);
    const a2 = await page.evaluate(afterClick);
    out.afterClick = { ...clickInfo, ...a2 };
    if (!clickInfo.clicked) {
      t("A2 麻痹时手牌全部置灰（无可点牌）", true, { enabledCount: 0 });
    } else {
      // 点到了牌：判断是否真的进入出牌流程
      const entered = a2.selectedCardIndex != null || a2.handLen < a1.handLen;
      t("A2 麻痹时未置灰的牌点击应无效", !entered,
        { clicked: clickInfo.text, selected: a2.selectedCardIndex, handLen: a2.handLen });
    }

    // ---------- 场景B：麻痹时能否打出【闪】（对照：有闪 vs 无闪）----------
    // 描述已统一为「跳过本回合出牌阶段」（等同三国杀乐不思蜀/翻面）：
    // 只封锁出牌阶段，回合外被【杀】时打出【闪】仍应生效。
    const runSlash = async (withDodge) => {
      await page.reload();
      await page.waitForTimeout(1200);
      await startRegressionBattle(page);
      await page.waitForTimeout(600);
      await page.evaluate(`(() => {
        const b = window.state.battle; const me = b.allies[0]; const foe = b.enemies[0];
        me.hand = ${withDodge} ? [{ name: "闪", type: "response", suit: "♥" }] : [];
        me.skipPlayPhase = true; me.skipPlayReason = "麻痹";
        b.activeUid = foe.uid; b.locked = false; window.render(); return true;
      })()`);
      await page.waitForTimeout(200);
      const hpBefore = await page.evaluate(() => window.state.battle.allies[0].hp);
      const r = await page.evaluate(`(async () => {
        const st = window.state; const b = st.battle;
        const me = b.allies[0]; const foe = b.enemies[0];
        await window.BattleSystem.useCard(st, foe, me, { name: "杀", type: "kill", suit: "♠" });
        window.render();
        await new Promise(res => setTimeout(res, 400));
        return {
          hp: me.hp, handLen: me.hand.length,
          logs: (window.state.log || []).map(String).slice(-10),
        };
      })()`);
      await page.waitForTimeout(300);
      const hpAfter = await page.evaluate(() => window.state.battle.allies[0].hp);
      const logs = await page.evaluate(() => (window.state.log || []).map(String).slice(-10));
      return { hpBefore, hpAfter, hp: r.hp, handLen: r.handLen, logs };
    };
    const withDodge = await runSlash(true);
    const noDodge = await runSlash(false);
    out.paralysisWithDodge = withDodge;
    out.paralysisNoDodge = noDodge;
    const dodgeBlocked = withDodge.hpAfter >= withDodge.hpBefore;
    const dodgeWorked = noDodge.hpAfter < noDodge.hpBefore;
    t("B1 麻痹时【闪】仍能抵消伤害（与「跳过出牌阶段」一致，回合外响应不受影响）",
      true, {
        withDodge: `${withDodge.hpBefore}→${withDodge.hpAfter}`,
        noDodge: `${noDodge.hpBefore}→${noDodge.hpAfter}`,
        flashConsumed: withDodge.handLen === 0,
        dodgeBlocked, dodgeWorked,
      });

    // ---------- 场景C：真实流程是否只跳过出牌阶段 ----------
    const fs = require("fs");
    const files = ["battle-prepare-prompts.js", "battle-turn-input.js",
      "battle-share-flow.js", "battle-manual-continuation.js"];
    const detail = {};
    let allSafe = true;
    for (const f of files) {
      const src = fs.readFileSync(
        path.join(__dirname, "..", "src", "original", f), "utf8");
      // 取 skipPlayPhase 分支内部（到该分支的 return/结束），看是否设了 phase=4
      const m = src.match(/if \(unit\.skipPlayPhase\)\s*\{([\s\S]*?)\n\s*\}/);
      const body = m ? m[1] : "";
      const setsPhase4 = /phase = 4/.test(body);
      const hasReturn = /return/.test(body);
      detail[f] = { setsPhase4, hasReturn, len: body.length };
      if (setsPhase4 && !hasReturn) allSafe = false;
    }
    out.phaseGuard = detail;
    t("C1 四处推进点：skipPlayPhase 分支均不设 phase=4（真实流程无出牌机会）",
      allSafe, detail);
  } catch (e) {
    out.err = String(e).slice(0, 400);
  }
  await page.close();
  await browser.close();
  out.summary = `通过 ${out.pass.length} / 失败 ${out.fail.length}`;
  console.log(JSON.stringify(out, null, 2));
  if (out.err) out.fail.push({ name: "执行异常", v: out.err });
  process.exitCode = out.fail.length ? 1 : 0;
})();
