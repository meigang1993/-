// 【饰品非锁定技】跳过按键真实可点性 + 「不发动不显示使用了」实机回归。
//
// 覆盖：
//  · 2 件 🔵 非锁定技饰品（霹雳之锤「放弃发动」/ 血色刺伞通用面板「跳过」）
//    在 battle.locked 态下按钮存在、可点、不被遮罩拦截；
//  · 真实点击跳过后：0 处「使用了 / 触发了 / 发动了」字幕、0 处发动战报、
//    0 处角色台词页，页面正文也无该类文案；
//  · 关键（306 轮新增）：把 RelicSystem.isActive 切到 true（字幕文案为「使用了」），
//    「不发动」类日志仍零字幕；真发动才显示「使用了 XX」；
//  · 正向：确认发动仍显示字幕、写发动战报（守门未误杀）。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle, collectErrors, relevantErrors } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const passed = [];
const T = (n, ok, d = "") => {
  passed.push(!!ok);
  console.log(`${ok ? "✅" : "❌"} ${n}${ok ? "" : "  ← " + JSON.stringify(d)}`);
  return !!ok;
};

const RESET = extra => `(() => {
  const st = window.state, b = st.battle;
  b.locked = false; b.animQueue = []; b._damageDepth = 0; b.phase = 4;
  ['thunderHammer','counterTrigger','counterTriggerQueue','karunaBubble',
   'karunaBubblePending','manualDodge','greenGatlingResume'].forEach(k => { b[k] = null; });
  b.skillCaptions = []; b.skillCaption = null;
  b.relicCaptions = []; b.relicCaption = null; b.speech = null;
  st.battleLog = []; st.log = [];
  window.BattleEffects.animating = false; window.BattleEffects.draining = false;
  b.allies.forEach((a, i) => { a.hp = 100; a.maxHp = 100; a.hand = []; a.statuses = [];
    a.battleRelics = []; a.skills = []; a.name = "队友" + i; });
  b.enemies.forEach((e, i) => { e.hp = 100; e.maxHp = 100; e.hand = []; e.name = "敌人" + i; });
  ${extra || ""}
  window.render && window.render();
  return true;
})()`;

const SNAP = `(() => {
  const st = window.state, b = st.battle;
  return {
    locked: b.locked, hammer: !!b.thunderHammer, counter: b.counterTrigger?.skill || null,
    skillCaptions: (b.skillCaptions || []).map(c => c.text),
    relicCaptions: (b.relicCaptions || []).map(c => c.text),
    skillCaption: b.skillCaption?.text || null,
    relicCaption: b.relicCaption?.text || null,
    speech: b.speech?.text || b.speech?.lines?.join("|") || null,
    battleLog: (st.battleLog || []).slice(0, 12),
    bodyUsed: (document.body.innerText.match(/.{0,20}(使用了|触发了|发动了).{0,20}/g) || []).slice(0, 8),
  };
})()`;
// 「不发动」判定：字幕 / 台词 / 发动类战报三者全无
const noLaunch = s => !s.skillCaptions.some(t => /发动了/.test(t))
  && !s.relicCaptions.some(t => /使用了|触发了/.test(t))
  && !/发动了|使用了|触发了/.test(s.skillCaption || "")
  && !/发动了|使用了|触发了/.test(s.relicCaption || "")
  // 「丽莎 可以发动血色刺伞。」是提示、不是发动战报，故用完整结算句而非「发动血色刺伞」子串
  && !s.battleLog.some(t => /发动技能【|触发饰品【|使用饰品【|弃置.{0,20}发动霹雳之锤|发动血色刺伞，视为使用/.test(t))
  && !s.speech && s.bodyUsed.length === 0;

const BTN = sel => `(() => {
  const btn = document.querySelector("${sel}");
  if (!btn) return { exists: false };
  const r = btn.getBoundingClientRect(), cs = getComputedStyle(btn);
  const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
  const hit = document.elementFromPoint(cx, cy);
  return { exists: true, text: btn.textContent.trim(), disabled: btn.disabled,
    pointerEvents: cs.pointerEvents, opacity: cs.opacity, cursor: cs.cursor,
    w: r.width, h: r.height,
    hitSelf: !!hit && (hit === btn || btn.contains(hit) || hit.closest("${sel}") === btn) };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = collectErrors(page);
  await openGame(page);
  await startRegressionBattle(page);

  // ── A. 霹雳之锤：「放弃发动」 ──
  await page.evaluate(RESET(`
    const u = b.allies[0]; u.name = "曼妮"; u.battleRelics = ["霹雳之锤"];
    b.thunderHammer = { actorUid: u.uid, targetUid: b.enemies[0].uid, amount: 7,
      source: "杀", card: { name: "杀（普攻）", type: "slash", suit: "♠", _entitySourceCard: true },
      used: false };
    b.locked = true;
  `));
  const hb = await page.evaluate(BTN("[data-cancel-hammer]"));
  T("A1 霹雳之锤：battle.locked 态下「放弃发动」按钮存在、可点、未被遮罩拦截",
    hb.exists && hb.disabled === false && hb.pointerEvents === "auto"
    && hb.opacity === "1" && hb.cursor === "pointer" && hb.w > 0 && hb.h > 0 && hb.hitSelf
    && hb.text.includes("放弃发动"), hb);
  const hBefore = await page.evaluate(SNAP);
  T("A2 霹雳之锤：挂起阶段零字幕 / 零发动战报 / 零台词", noLaunch(hBefore), hBefore);
  let hClick = "OK";
  try { await page.locator("[data-cancel-hammer]").click({ timeout: 8000 }); }
  catch (e) { hClick = e.message.slice(0, 120); }
  await page.waitForTimeout(600);
  const hAfter = await page.evaluate(SNAP);
  T("A3 霹雳之锤：真实点击「放弃发动」成功，锁定解除、挂起清空",
    hClick === "OK" && hAfter.locked === false && hAfter.hammer === false, { hClick, hAfter });
  T("A4 霹雳之锤：跳过后仍零「使用了/触发了/发动了」字幕 / 发动战报 / 台词",
    noLaunch(hAfter), hAfter);

  // ── B. 血色刺伞：通用反击面板「跳过」 ──
  await page.evaluate(RESET(`
    const u = b.allies[0]; u.name = "丽莎"; u.battleRelics = ["血色刺伞"];
    window.BattleCounterTriggers.open(st, {
      skill: "血色刺伞", unitUid: u.uid, sourceUid: u.uid, targetUid: u.uid,
    });
  `));
  const ub = await page.evaluate(BTN("[data-counter-trigger-skip]"));
  T("B1 血色刺伞：battle.locked 态下通用面板「跳过」按钮存在、可点、未被遮罩拦截",
    ub.exists && ub.disabled === false && ub.pointerEvents === "auto"
    && ub.opacity === "1" && ub.cursor === "pointer" && ub.w > 0 && ub.h > 0 && ub.hitSelf
    && ub.text.includes("跳过"), ub);
  const uBefore = await page.evaluate(SNAP);
  T("B2 血色刺伞：仅「可以发动」提示时零字幕 / 零发动战报 / 零台词",
    noLaunch(uBefore) && uBefore.battleLog.some(t => t.includes("可以发动血色刺伞")), uBefore);
  let uClick = "OK";
  try { await page.locator("[data-counter-trigger-skip]").click({ timeout: 8000 }); }
  catch (e) { uClick = e.message.slice(0, 120); }
  await page.waitForTimeout(600);
  const uAfter = await page.evaluate(SNAP);
  T("B3 血色刺伞：真实点击「跳过」成功，挂起清空、战报写「跳过」而非发动",
    uClick === "OK" && uAfter.counter === null && uAfter.locked === false
    && uAfter.battleLog.some(t => /跳过血色刺伞/.test(t)), { uClick, uAfter });
  T("B4 血色刺伞：跳过后仍零「使用了/触发了/发动了」字幕 / 发动战报 / 台词",
    noLaunch(uAfter), uAfter);

  // ── C. 关键：「使用了」字幕分支（isActive=true）下「不发动」仍零字幕 ──
  const used = await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    const orig = window.RelicSystem.isActive;
    window.RelicSystem.isActive = () => true;   // 字幕文案切到「使用了」
    const cases = [
      "曼妮 的霹雳之锤可发动：选择一张手牌弃置。",
      "曼妮 可以发动血色刺伞。",
      "曼妮 放弃发动霹雳之锤。",
      "曼妮跳过血色刺伞。",
      "曼妮 发动鬼王扑克失败：请选择一张非战术牌。",
    ];
    const out = [];
    for (const text of cases) {
      b.skillCaptions = []; b.skillCaption = null;
      b.relicCaptions = []; b.relicCaption = null; b.speech = null;
      st.battleLog = []; st.log = [];
      b.allies[0].name = "曼妮";
      b.allies[0].battleRelics = ["霹雳之锤", "血色刺伞", "鬼王扑克"];
      window.BattleLog.add(st, text);
      out.push({ text,
        caps: (b.relicCaptions || []).map(c => c.text)
          .concat((b.skillCaptions || []).map(c => c.text)),
        speech: b.speech?.text || b.speech?.lines?.join("|") || null });
    }
    // 正向：真发动仍显示「使用了」
    b.skillCaptions = []; b.skillCaption = null;
    b.relicCaptions = []; b.relicCaption = null; b.speech = null;
    window.BattleLog.add(st, "曼妮 的霹雳之锤触发，该杀强制造成伤害。");
    const positive = (b.relicCaptions || []).map(c => c.text)
      .concat((b.skillCaptions || []).map(c => c.text));
    window.RelicSystem.isActive = orig;
    return { cases: out, positive };
  })()`);
  T("C1 isActive=true（字幕为「使用了」）：5 类「不发动」日志全部 0 字幕、0 台词",
    used.cases.every(c => c.caps.length === 0 && !c.speech
      && !c.caps.some(t => /使用了|触发了|发动了/.test(t))), used.cases);
  T("C2 isActive=true 正向：真发动仍显示「曼妮 使用了 霹雳之锤」字幕（守门未误杀）",
    used.positive.some(t => t.includes("使用了") && t.includes("霹雳之锤")), used.positive);

  // ── D. 正向：确认发动仍播字幕 + 写发动战报 ──
  await page.evaluate(RESET(`
    const u = b.allies[0]; u.name = "丽莎"; u.battleRelics = ["血色刺伞"];
    window.BattleLines.skill(st, u, "血色刺伞", null);
  `));
  await page.waitForTimeout(450);
  const d = await page.evaluate(SNAP);
  T("D1 正向：确认发动血色刺伞仍显示饰品字幕与「触发饰品」战报",
    (d.relicCaptions.some(t => t.includes("血色刺伞"))
      || (d.relicCaption || "").includes("血色刺伞"))
    && d.battleLog.some(t => t.includes("触发饰品【血色刺伞】")), d);

  const rel = relevantErrors(errors);
  T("E1 全程无 pageerror / console error", rel.length === 0, rel.slice(0, 3));
  console.log(`\nRESULT ${passed.filter(Boolean).length}/${passed.length}`);
  await browser.close();
  process.exit(passed.every(Boolean) ? 0 : 1);
})().catch(e => { console.error("LIVE_FAIL", e.message); process.exit(2); });
