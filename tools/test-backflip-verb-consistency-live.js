// 响应牌「使用/打出」口径一致性：后空翻
// 卡牌描述为「你可以打出此牌」，故出牌区与战报都必须是「打出」。
// 此前出牌区按 backflip 标记兜底得「打出了」，战报却硬编码「使用后空翻」，
// 两处不同源 → 出牌区显示与牌局记录不符（与闪响应 AOE 是同类 BUG）。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const backflipTpl = `(() => {
  const st = window.state;
  const b = st.battle;
  const a0 = b.allies[0], e0 = b.enemies[0];
  const backflip = { name: "后空翻", type: "response", backflip: true,
                     suit: "♠", drawCards: 2 };
  e0.hand = [backflip];
  e0.hp = 90;
  const tactic = { name: "顺手牵羊", type: "tactic", suit: "♥" };
  tactic._targetUids = [e0.uid];
  b.played = [];
  const inst = window.SakuraRisaCombatSkills({
    isRisa: () => true, responseCount: () => 0, foesOf: () => [],
    battleSettling: () => false, hasRelic: () => false, sameSide: () => false,
    pendingRevival: () => null,
  });
  const ok = inst.resolveBackflip(st, e0, a0, e0, tactic, backflip,
    { draw: () => 2 });
  // queueResponse 只把事件推入 animQueue，b.played 要等动画播放才落账，
  // 故此处直接读队列里的 action（出牌区 _playedAction 的取值来源）。
  const played = (b.animQueue || [])
    .filter(e => e?.type === "response")
    .map(e => ({ name: e?.card?.name, action: e?.action }));
  const logs = (window.state.log || []).map(String);
  const bfLog = logs.filter(l => l.includes("后空翻"));
  return { ok, played, bfLog: bfLog.slice(-3),
           diag: { unitName: e0?.name, handLen: e0?.hand?.length,
                   hasCard: !!e0?.hand?.includes(backflip),
                   cardBackflip: !!backflip?.backflip,
                   queueResp: typeof window.BattleCards?.queueResponse,
                   logAdd: typeof window.BattleLog?.add,
                   logLen: logs.length } };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  const out = { pass: [], fail: [] };
  const t = (name, ok, info) => (ok ? out.pass : out.fail)
    .push({ name, ...(info || {}) });
  try {
    await startRegressionBattle(page);
    await page.waitForTimeout(600);

    const r = await page.evaluate(backflipTpl);
    t("后空翻：出牌区记为「打出了」", r.played?.[0]?.action === "打出了", r);
    t("后空翻：战报记为「打出」（与出牌区同口径）",
      r.bfLog.some(l => l.includes("打出后空翻")), r);
    t("后空翻：不再出现「使用后空翻」旧文案",
      !r.bfLog.some(l => l.includes("使用后空翻")), r);
    t("页面无 JS 错误", errors.length === 0, { errors: errors.slice(0, 3) });
  } catch (e) {
    t("执行异常", false, { error: String(e).slice(0, 300) });
  } finally {
    await browser.close();
  }
  out.pass.forEach(p => console.log(`✅ ${p.name}`));
  out.fail.forEach(p => console.log(`❌ ${p.name} — ${JSON.stringify(p)}`));
  console.log(`\n通过 ${out.pass.length} / ${out.pass.length + out.fail.length}`);
  process.exit(out.fail.length ? 1 : 0);
})();
