/* 刷新任务的「副作用」回归：存档合法性、已接取任务保留、连续刷新稳定性。
   与 test-bounty-refresh-cost-live.js / -click-live.js 的分工：
   那两个分别测核心逻辑与 UI 绑定，这个测持久化与副作用面。

   判据必须是真实存在的 API（validBountyTask / validPersistedState）与真实字段
   （id / type / accepted / targetName / charName / missionId）——
   任务对象没有 progress 字段，用可选字段做判据会恒真造成假绿。

   反向验证：把 server-core-apply.js 的 applyBounties 去掉，
   S5/S6 应变红（刷新后的任务写不回 state）。 */
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const { chromium } = require("playwright");
const { openGame, startFreshGame } = require("../tests/helpers/preview-game.js");

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else console.log(`❌ ${name}  ← ${JSON.stringify(extra || {})}`.slice(0, 300));
  return !!cond;
};
// 注意：page.evaluate 运行在浏览器上下文，访问不到 Node 侧常量，
// 因此字段列表必须在每个 evaluate 内部内联。

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  try {
    await openGame(page);
    await startFreshGame(page);
    await page.evaluate(() => {
      window.state.resources.gold = 5000;
      document.querySelector(".info-close")?.click();
    });
    await page.waitForTimeout(1000);

    // S0 先确认判据 API 真实存在，避免可选调用造成假绿
    const api = await page.evaluate(() => ({
      validBountyTask: typeof window.GameStoreSaveSchema?.validBountyTask,
      validPersistedState: typeof window.GameStoreSaveSchema?.validPersistedState,
    }));
    T("S0 判据 API 存在（非假绿）",
      api.validBountyTask === "function" && api.validPersistedState === "function", api);

    // A. 存档合法性：刷新生成的新任务必须能存进存档
    const a = await page.evaluate(async () => {
      window.BountyTasks.ensure(window.state);
      // 关键：记录「state 层面」刷新前的未接取任务 id。
      // 只有这条能证明 applyBounties 的写回确实生效——
      // 若只断言「已接取任务没被破坏」，写回被去掉时任务原样不动也会全绿。
      const beforeIdle = window.state.bounties.filter(t => !t.accepted).map(t => t.id);
      await window.ServerCore.call("refreshBounty", {}, window.state);
      const afterIdle = window.state.bounties.filter(t => !t.accepted).map(t => t.id);
      const bad = (window.state.bounties || []).filter(
        t => window.GameStoreSaveSchema.validBountyTask(t) !== true);
      return {
        count: window.state.bounties.length,
        badCount: bad.length,
        rewritten: JSON.stringify(beforeIdle) !== JSON.stringify(afterIdle),
        beforeIdle,
        afterIdle,
        persisted: window.GameStoreSaveSchema.validPersistedState(window.state),
      };
    });
    T("A0 刷新后未接取任务在 state 层确实被重摇（写回生效）", a.rewritten === true, a);
    T("A1 刷新后任务全部通过 validBountyTask", a.badCount === 0, a);
    T("A2 刷新后整体存档校验 validPersistedState 通过", a.persisted === true, a);

    // A3/A4 存档压缩往返：任务 id 不丢失、压缩后仍合法
    const a34 = await page.evaluate(() => {
      const before = window.state.bounties.map(t => t.id);
      const compacted = window.GameStoreCompact?.compact?.(window.state);
      if (!compacted) return { skipped: true };
      return {
        skipped: false,
        same: JSON.stringify(before) === JSON.stringify((compacted.bounties || []).map(t => t.id)),
        okSchema: window.GameStoreSaveSchema.validPersistedState(compacted),
      };
    });
    T("A3 刷新后任务经存档压缩仍保持", a34.skipped || a34.same === true, a34);
    T("A4 压缩后存档仍合法", a34.skipped || a34.okSchema === true, a34);

    // B. 已接取任务必须完整保留（核心字段一字不变）
    const b = await page.evaluate(async () => {
      window.state.resources.gold = 5000;
      window.BountyTasks.ensure(window.state);
      const target = window.state.bounties.find(t => !t.accepted);
      if (!target) return { skipped: true };
      window.BountySystem.acceptTask(window.state, target.id);
      const FIELDS = ["id", "type", "missionId", "targetName", "charName"];
      const acc = window.state.bounties.find(t => t.accepted);
      if (!acc) return { skipped: true };
      const before = { id: acc.id, core: FIELDS.map(k => String(acc[k] ?? "")).join("|") };
      await window.ServerCore.call("refreshBounty", {}, window.state);
      const still = window.state.bounties.find(t => t.id === before.id);
      return {
        skipped: false,
        before,
        kept: !!still,
        accepted: still?.accepted === true,
        coreSame: still ? FIELDS.map(k => String(still[k] ?? "")).join("|") === before.core : false,
      };
    });
    T("B1 刷新后已接取任务仍在", b.skipped || b.kept === true, b);
    T("B2 已接取任务仍为已接取状态", b.skipped || b.accepted === true, b);
    T("B3 已接取任务核心字段未变", b.skipped || b.coreSame === true, b);

    // C. 连续刷新稳定性与精确扣费
    const c = await page.evaluate(async () => {
      const start = 5000;
      window.state.resources.gold = start;
      const rounds = [];
      for (let i = 0; i < 3; i++) {
        const r = await window.ServerCore.call("refreshBounty", {}, window.state);
        rounds.push({ ok: r?.ok === true, n: window.state.bounties.length });
      }
      const keys = window.state.bounties
        .map(t => t.targetName || t.charName).filter(Boolean);
      return {
        start,
        rounds,
        dup: keys.length !== new Set(keys).size,
        gold: window.state.resources.gold,
      };
    });
    T("C1 连续 3 次刷新全部成功", c.rounds.every(r => r.ok), c.rounds);
    T("C2 每次刷新后任务数均 >0", c.rounds.every(r => r.n > 0), c.rounds);
    T("C3 刷新后无重复目标", c.dup === false, c);
    T("C4 连续刷新扣费精确（500×3）", c.gold === c.start - 1500,
      { start: c.start, gold: c.gold });

    // D. 刷新后的新任务可以正常接取
    const d = await page.evaluate(() => {
      const t = window.state.bounties.find(x => !x.accepted);
      if (!t) return { skipped: true };
      const r = window.BountySystem.acceptTask(window.state, t.id);
      return { skipped: false, ok: !!r };
    });
    T("D1 刷新后的新任务可正常接取", d.skipped || d.ok === true, d);

    T("E1 无页面错误", errors.length === 0, errors.slice(0, 3));
    console.log(`\n总计 ${pass}/${total}`);
    if (pass !== total) process.exitCode = 1;
  } catch (err) {
    console.error("测试异常：", err.message);
    console.log(`\n总计 ${pass}/${total}`);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
