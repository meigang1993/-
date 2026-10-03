// 专项实战：麻痹改为「一轮回合无法使用或打出响应牌」。
// 依据三国杀：响应【杀】而出的【闪】属于「使用」，响应南蛮的杀属于「打出」；
// 「无法使用或打出响应牌」应同时封死闪、杀响应、看破、埋伏、后空翻。
// 生命周期：判定成功时置位，该角色下个回合开始时清除（= 一轮回合）。
//
// 场景1 麻痹 + 手握闪 → 敌方杀命中，掉血，闪留在手里（未响应）
// 场景2 对照 无麻痹 + 手握闪 → 不掉血，闪被消耗
// 场景3 真实判定置位（judgement 成功 → noResponse=true）+ 日志文案
// 场景4 面板标签说明「无法使用或打出响应牌」
// 场景5 真实判定后同样无法响应（走真实链路，非仅置位）
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

// 驱动一次敌方对我方 ally 的虚拟杀；paralyze=true 时置上麻痹锁定标记
const probe = paralyze => `(() => {
  const st = window.state, b = st.battle;
  const ally = b.allies[0], foe = (b.enemies || []).find(e => e.hp > 0);
  if (!ally || !foe) return { error: "no units" };
  ally.hand = [{ name: "闪", type: "response", suit: "♥" }];
  ally.hp = 100;
  if (${paralyze}) {
    ally.skipPlayPhase = true; ally.skipPlayReason = "麻痹";
    ally.noResponse = true; ally.noResponseReason = "麻痹";
  } else {
    ally.skipPlayPhase = false; ally.skipPlayReason = null;
    ally.noResponse = false; ally.noResponseReason = null;
  }
  st.settings = Object.assign({}, st.settings || {}, { manualResponse: false });
  window.BattleSystem.useVirtualKill(st, foe, ally,
    { name: "杀（普攻）", type: "kill", suit: "♠" });
  return { before: 100 };
})()`;

const readTpl = `(() => {
  const b = window.state.battle, ally = b.allies[0];
  return {
    hp: ally.hp,
    hand: (ally.hand || []).map(c => c.name),
    noResponse: !!ally.noResponse,
  };
})()`;

// 场景3：强制判定顶牌为 ♥（麻痹必定成功），走准备阶段真实入口
const forceJudgeTpl = `(() => {
  const b = window.state.battle, me = b.allies[0];
  me.hand = me.hand || [];
  if (!me.hand.some(c => c.paralysis)) {
    me.hand.push(window.BattleStatusCardRegistry.create("paralysis"));
    window.BattleStatusCardRegistry.sync(me, b);
  }
  me.deck = me.deck || [];
  me.deck.push({ suit: "♥", name: "判定" });
  return true;
})()`;

const runJudgeTpl = `(() => {
  const st = window.state, b = st.battle, me = b.allies[0];
  window.BattleStatusCards.judgement(st, me);
  return { skip: !!me.skipPlayPhase, noResponse: !!me.noResponse };
})()`;

const logTpl = `(() => {
  const logs = (window.state.log || []).map(String);
  return { judgeLog: logs.find(l => l.includes("麻痹判定")) || null };
})()`;

// 场景4：出牌阶段手牌面板标签
const tagTpl = `(() => {
  const b = window.state.battle, me = b.allies[0];
  me.skipPlayPhase = true; me.skipPlayReason = "麻痹";
  me.noResponse = true;
  b.activeUid = me.uid; b.phase = 4; b.locked = false;
  window.render();
  return {
    tag: document.querySelector(".hand-skip-tag")?.innerText || null,
    icon: document.querySelector(".status-icon.paralysis-locked")?.getAttribute("title") || null,
  };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  const out = { errors, pass: [], fail: [] };
  const t = (name, ok, info) => (ok ? out.pass : out.fail)
    .push({ name, ...(info || {}) });
  try {
    await startRegressionBattle(page);
    await page.waitForTimeout(600);

    // 场景1：麻痹 + 有闪 → 应无法响应，掉血且闪仍在手
    await page.evaluate(probe(true));
    await page.waitForTimeout(1200);
    const p1 = await page.evaluate(readTpl);
    out.paralyzed = p1;
    t("麻痹：手握闪仍被杀命中（掉血）", p1.hp < 100, { hp: p1.hp });
    t("麻痹：闪未被消耗（留在手里）", p1.hand.includes("闪"), { hand: p1.hand });
    t("麻痹：noResponse 标记已置位", p1.noResponse, { v: p1.noResponse });

    // 场景2：对照 无麻痹 + 有闪 → 应正常响应，不掉血
    await page.reload();
    await page.waitForTimeout(1200);
    await startRegressionBattle(page);
    await page.waitForTimeout(600);
    await page.evaluate(probe(false));
    await page.waitForTimeout(1200);
    const p2 = await page.evaluate(readTpl);
    out.normal = p2;
    t("对照（无麻痹）：闪抵消伤害，未掉血", p2.hp === 100, { hp: p2.hp });
    t("对照（无麻痹）：闪已被消耗", !p2.hand.includes("闪"), { hand: p2.hand });

    // 场景3：真实判定置位
    await page.evaluate(forceJudgeTpl);
    out.judge = await page.evaluate(runJudgeTpl);
    const lg = await page.evaluate(logTpl);
    out.judgeLog = lg.judgeLog;
    t("真实判定成功：skipPlayPhase 置位", !!out.judge.skip, out.judge);
    t("真实判定成功：noResponse 置位", !!out.judge.noResponse, out.judge);
    t("判定日志含「无法使用或打出响应牌」",
      /无法使用或打出响应牌/.test(String(lg.judgeLog || "")), { v: lg.judgeLog });

    // 场景4：面板与图标文案
    const tag = await page.evaluate(tagTpl);
    out.tag = tag;
    t("手牌面板标签说明无法响应",
      /无法使用或打出响应牌/.test(String(tag.tag || "")), { v: tag.tag });
    t("单位状态图标 title 说明无法响应",
      /无法使用或打出响应牌/.test(String(tag.icon || "")), { v: tag.icon });

    // 场景5：真实判定后（非仅置位）同样无法响应
    await page.evaluate(`(() => {
      const st = window.state, b = st.battle;
      const ally = b.allies[0], foe = (b.enemies || []).find(e => e.hp > 0);
      ally.hand = [{ name: "闪", type: "response", suit: "♥" }];
      ally.hp = 100;
      window.BattleSystem.useVirtualKill(st, foe, ally,
        { name: "杀（普攻）", type: "kill", suit: "♠" });
      return true;
    })()`);
    await page.waitForTimeout(1200);
    const p5 = await page.evaluate(readTpl);
    out.realAfterJudge = p5;
    t("真实判定后：手握闪仍被命中", p5.hp < 100, { hp: p5.hp });
    t("真实判定后：闪未被消耗", p5.hand.includes("闪"), { hand: p5.hand });
  } catch (e) {
    out.err = String(e).slice(0, 300);
  }
  await page.close();
  await browser.close();
  out.pass.forEach(p => console.log(`✅ ${p.name}`));
  out.fail.forEach(p => console.log(`❌ ${p.name} ${JSON.stringify(p)}`));
  console.log(`\n通过 ${out.pass.length} / ${out.pass.length + out.fail.length}`);
  if (out.err) console.log("ERR:", out.err);
  if (out.errors.length) console.log("PAGEERROR:", out.errors.slice(0, 3));
  process.exit(out.fail.length || out.err ? 1 : 0);
})();
