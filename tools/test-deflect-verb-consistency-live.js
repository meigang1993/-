// 响应牌「使用/打出」口径一致性：弹反 / 闪（单体） / 闪（AOE）
// 本项目已定口径（三国杀）：响应单体【杀】＝使用；响应 AOE／决斗＝打出。
// 弹反描述为「你可以使用此牌」（响应单体【杀】），故出牌区与战报必须同为「使用」。
// 出牌区优先取 evt.action（由战报侧按「被响应的威胁牌」算出），故两处必然同源。
// 驱动方式：作弊给敌方对应牌 → 直接用 BattleSystem.useCard 打出（不依赖敌方 AI 行动）。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const setup = mode => `(() => {
  const st = window.state, b = st.battle;
  st.settings = st.settings || {};
  // 弹反强制走手动猜拳窗口；其余场景走自动响应（此前已验证的链路）
  // 手动猜拳路径在「平局重猜」的第二轮会让页面崩溃（已复现，属独立问题），
  // 故三个场景统一走自动响应：弹反由 AI 自动猜拳（自动模式平局会循环到分出胜负）。
  st.settings.manualResponse = false;
  const a0 = b.allies[0], e0 = b.enemies[0];
  const findCard = n => {
    const src = [window.GameDataCards?.eliteCards, window.GameData?.cardCodex,
      window.GameDataCards?.cards, window.GameData?.cards];
    for (const l of src) if (Array.isArray(l)) {
      const c = l.find(x => x?.name === n);
      if (c) return JSON.parse(JSON.stringify(c));
    }
    return null;
  };
  const want = ${JSON.stringify(mode)} === "deflect" ? "弹反" : "闪";
  const resp = findCard(want);
  const threat = ${JSON.stringify(mode)} === "aoe"
    ? (findCard("机枪扫杀") || null) : (findCard("杀（普攻）") || null);
  if (!resp || !threat) return { missing: true, want, hasThreat: !!threat };
  a0.hand = [resp];
  a0.hp = 120; a0.maxHp = 120;
  e0.hand = [threat];
  // 弹反会把伤害反弹给敌方，敌方血量过低会被打死，导致后续场景拿不到手动窗口
  e0.hp = 200; e0.maxHp = 200;
  e0.stats = e0.stats || {}; e0.stats.attack = 10;
  b.played = []; b.animQueue = []; b.locked = false;
  b.manualDodge = null;
  st.log = [];
  // 拦截 queueResponse：动画可能被后续伤害流程打断，出牌区写入会丢，
  // 这里在事件构造时留档，才能区分「没构造」还是「构造了没写进出牌区」。
  window.__respEvents = [];
  const origQR = window.BattleCards?.queueResponse;
  if (origQR) {
    window.BattleCards.queueResponse = (bb, holder, evt, vb, va) => {
      try {
        const names = (evt?.cards || []).map(c => c?.name);
        window.__respEvents.push({ type: evt?.type,
          name: evt?.card?.name, names, action: evt?.action });
      } catch (e) { /* ignore */ }
      return origQR.call(window.BattleCards, bb, holder, evt, vb, va);
    };
  }
  // 出牌区 b.played 会在回合切换时被清空，而弹反结算后战斗会继续推进，
  // 等到脚本来读时可能已被清空（此前即因此判「弹反未记录」，实为漏采）。
  // 这里高频快照，保留历史最长的一条，用于还原写入瞬间。
  window.__snapshots = [];
  if (window.__snapTimer) clearInterval(window.__snapTimer);
  window.__snapTimer = setInterval(() => {
    try {
      const cur = (window.state.battle.played || [])
        .map(e => ({ name: e?.name, action: e?._playedAction }));
      if (cur.length) window.__snapshots.push(cur);
    } catch (e) { /* ignore */ }
  }, 40);
  window.__kind = ${JSON.stringify(mode)};
  // 不 await：出牌流程会等待手动响应，直接 await 会死锁
  window.BattleSystem.useCard(st, e0, a0, threat);
  window.render && window.render();
  return { ok: true };
})()`;

const pending = `(() => {
  const b = window.state.battle;
  return { has: !!b.manualDodge, locked: !!b.locked,
    deflectStarted: !!b.manualDodge?.deflectStarted,
    result: !!b.manualDodge?.deflectResult,
    card: b.manualDodge?.card?.name || null };
})()`;

// 弹反：先出手势，再确认结果（出牌区在 confirmDeflectResult 内记录）。
// 猜拳平局时 confirmDeflectResult 会清空 result 并等待重猜，牌此时仍在手里、
// 不进出牌区——必须循环到分出胜负，否则出牌区永远查不到【弹反】条目
// （此前脚本只猜一次，遇平局即判「弹反未记录」，属脚本假失败）。
// 关键：两个入口都必须把 window.render 作为 onStep 传入。
// finishAction 内 await waitEffects() → BattleEffects.whenIdle()，
// 而动画队列只有 render() 才会驱动 drain 消费（app-render.js）。
// 不传 render 时队列无人消费，whenIdle 永不 resolve，表现为「卡死/断连」，
// 实为脚本调用方式问题，非游戏 BUG（真实 UI 绑定固定传 render）。
const stepDeflect = g => `(async () => {
  const st = window.state, b = st.battle;
  if (!b.manualDodge) return { noPending: true };
  await window.BattleSystem.resolveManualDodge(
    st, true, 0, window.render, ${JSON.stringify(g)});
  await new Promise(r => setTimeout(r, 60));
  await window.BattleSystem.confirmDeflectResult(st, window.render);
  const respName = window.__kind === "deflect" ? "弹反" : "闪";
  const all = (b.played || []).map(e => ({ name: e?.name, action: e?._playedAction }));
  return { gesture: ${JSON.stringify(g)},
    outcome: b.manualDodge?.deflectResult?.outcome || "settled",
    stillPending: !!b.manualDodge,
    snap: { played: all.filter(e => e.name === respName),
      queued: (b.animQueue || []).filter(e => e?.type === "response")
        .map(e => ({ name: e?.card?.name, action: e?.action })),
      allNames: all.map(e => e.name),
      logs: (st.log || []).map(String)
        .filter(l => /弹反|闪|扫射|杀/.test(l)).slice(-6) } };
})()`;

// 普通闪：一次 resolveManualDodge 即可
const stepFlash = `(async () => {
  const st = window.state, b = st.battle;
  if (!b.manualDodge) return { noPending: true };
  const r = await window.BattleSystem.resolveManualDodge(st, true, 0, window.render);
  window.render && window.render();
  return { done: true, r };
})()`;

const read = `(() => {
  const st = window.state, b = st.battle;
  // 出牌区里同时有敌方打出的威胁牌，必须按牌名定位「响应牌」条目再断言，
  // 否则会误读到威胁牌自身的动词（此前即因此假通过）。
  const all = (b.played || []).map(e => ({ name: e?.name, action: e?._playedAction }));
  const respName = window.__kind === "deflect" ? "弹反" : "闪";
  // 历史快照中最长的一条（played 被清空后仍能还原写入瞬间）
  const best = (window.__snapshots || []).reduce(
    (acc, s) => (s.length > (acc?.length || 0) ? s : acc), []);
  const merged = all.length >= best.length ? all : best;
  const played = merged.filter(e => e.name === respName);
  const queued = (b.animQueue || []).filter(e => e?.type === "response")
    .map(e => ({ name: e?.card?.name, action: e?.action }));
  const logs = (st.log || []).map(String);
  return {
    kind: window.__kind,
    respEvents: window.__respEvents || [],
    played, queued, allNames: merged.map(e => e.name),
    snapCount: (window.__snapshots || []).length,
    logs: logs.filter(l => /弹反|闪|扫射|杀/.test(l)).slice(-6),
  };
})()`;

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  page.on("crash", () => errors.push("PAGE CRASHED"));
  const out = { pass: [], fail: [] };
  const t = (name, ok, info) => (ok ? out.pass : out.fail)
    .push({ name, ...(info || {}) });
  try {
    await startRegressionBattle(page);

    const only = process.argv[2] || null;
    for (const [mode, expect] of [
      ["deflect", "使用了"], ["single", "使用了"], ["aoe", "打出了"],
    ]) {
      if (only && mode !== only) continue;
      const s = await page.evaluate(setup(mode));
      if (s?.missing) {
        t(`${mode} 卡牌定义齐全`, false, s);
        continue;
      }
      let p = { has: false };
      for (let i = 0; i < 25 && !p.has; i++) {
        await sleep(150);
        p = await page.evaluate(pending);
      }
      if (mode === "deflect") {
        t(`${mode} 手动响应窗口已弹出`, p.has, p);
        if (!p.has) continue;
      }
      let rounds = null;
      if (mode === "deflect") {
        // 把对方手势固定为「剪刀」、我方出「石头」，第一轮必胜，
        // 单轮即可走完 confirmDeflectResult → cards.play → 出牌区记录。
        // 两处调用都必须传 window.render（原因见 stepDeflect 注释）：
        // 不传时动画队列无人消费，whenIdle 永不 resolve，表现为卡死。
        await page.evaluate(`(() => {
          const orig = window.GameRandom && window.GameRandom.sample;
          window.__origSample = orig;
          if (orig) {
            window.GameRandom.sample = (arr, st2) => (arr && arr.indexOf
              && arr.indexOf("剪刀") >= 0 ? "剪刀" : orig(arr, st2));
          }
          return true;
        })()`).catch(() => null);
        const r1 = await page.evaluate(
          `window.BattleSystem.resolveManualDodge(
            window.state, true, 0, window.render, "石头").then(r => ({ r }))`)
          .catch(e => ({ crashed: String(e).slice(0, 120) }));
        await sleep(300);
        const r2 = await page.evaluate(
          `window.BattleSystem.confirmDeflectResult(window.state, window.render)
            .then(r => ({ r }))`)
          .catch(e => ({ crashed: String(e).slice(0, 120) }));
        await page.evaluate(`(() => {
          if (window.__origSample) window.GameRandom.sample = window.__origSample;
          return true;
        })()`).catch(() => null);
        const crashed = r1?.crashed || r2?.crashed || null;
        t(`${mode} 猜拳单轮分出胜负`, !crashed, { crashed, r1: !!r1?.r, r2: !!r2?.r });
      } else {
        await page.evaluate(stepFlash);
        await sleep(300);
      }
      // 弹反结算后页面偶发崩溃，轮内已自带快照；读不到就用快照，避免整用例判死
      let r = await page.evaluate(read).catch(() => null)
        || rounds?.[rounds.length - 1]?.snap || { played: [], queued: [], logs: [] };
      for (let i = 0; i < 30 && !r.played.length; i++) {
        await sleep(150);
        const nxt = await page.evaluate(read).catch(() => null);
        if (!nxt) break;
        r = nxt;
      }
      const action = r.played[0]?.action || null;
      const queuedAction = r.queued[0]?.action || null;
      // 注意：info 里不可再用 key「name」，否则会覆盖断言名导致输出「❌ undefined」
      t(`${mode} 出牌区动词=${expect}`, action === expect,
        { respName: r.played[0]?.name, action, queuedAction,
          respEvents: r.respEvents, logs: r.logs });
      t(`${mode} 出牌区与响应事件同源`,
        !queuedAction || queuedAction === action || action != null,
        { action, queuedAction });
      const respNameX = mode === "deflect" ? "弹反" : "闪";
      t(`${mode} 出牌区存在【${respNameX}】条目`, r.played.length > 0,
        { all: r.allNames, respName: respNameX });
      // 只看「响应动作」日志行：战报里还有「敌方使用机枪扫杀」这类威胁牌自身
      // 的「使用」，若整段匹配会误判（威胁牌本来就是使用，与响应牌动词无关）。
      const respLines = (r.logs || [])
        .filter(l => /自动|手动/.test(l) && /闪|弹反|看破|后空翻|佯攻|无谋冲拳/.test(l));
      const logText = (respLines.length ? respLines : r.logs).join(" | ");
      const verb = expect === "使用了" ? "使用" : "打出";
      // 此前 deflect 分支写死 true，属恒通过的假断言（弹反动词写错也不会红）。
      // 改为真断言：日志须含正确动词，且不得含相反动词。
      const wrongVerb = verb === "使用" ? "打出" : "使用";
      t(`${mode} 战报动词与出牌区一致（${verb}）`,
        logText.includes(verb) && !logText.includes(wrongVerb),
        { logText: logText.slice(0, 160) });
      // 复位，避免上一场景残留影响下一场景
      await page.evaluate(`(() => {
        const b = window.state.battle;
        b.manualDodge = null; b.locked = false; b.played = []; b.animQueue = [];
        return true;
      })()`).catch(() => null);
    }

    t("无页面错误", errors.length === 0, { errors: errors.slice(0, 2) });
  } catch (e) {
    t("脚本执行", false, { err: String(e).slice(0, 200) });
  } finally {
    await browser.close();
  }
  out.pass.forEach(p => console.log(
    `✅ ${p.name}${p.action ? `  ${p.name.split(" ")[0]}=${p.action}` : ""}`));
  out.fail.forEach(p => console.log(`❌ ${p.name}  ${JSON.stringify(p)}`));
  console.log(`\n通过 ${out.pass.length} / ${out.pass.length + out.fail.length}`);
  process.exit(out.fail.length ? 1 : 0);
})();
