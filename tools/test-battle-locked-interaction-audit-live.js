// 战斗界面锁定态交互审计
//
// .battle-locked 会置灰并禁用点击，每个"锁定后仍需玩家点击"的交互态都必须
// 在 battle-overlays.css 的白名单里放行。漏一个就会出现"提示照常显示、
// 点了完全没反应"的假死（玩家反馈的「灰屏不能动」）。
//
// 本用例逐态设置 battle 上的 picker/提示字段 + locked=true，然后检查玩家
// 真正需要点击的目标（友方/敌方角色卡、手牌卡、提示条按钮）是否：
//   1) pointer-events 未被禁用
//   2) 命中测试最顶层就是该元素本身
//   3) 未被置灰规则压暗（opacity）
//   4) 真实鼠标点击能推进状态
//
// 只验证 UI 可达性，不重复各技能自身的结算逻辑。
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const {
  openGame, startRegressionBattle, collectErrors, relevantErrors,
} = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, total = 0;
const failed = [];
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  else failed.push(name);
  console.log(`${cond ? "✅" : "❌"} ${name}`
    + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
};

// 每个态：设置片段 + 玩家应该点的目标
const CASES = [
  {
    id: "gerda", label: "萌虎慰劳 gerdaComfort",
    setup: `b.gerdaComfort = { unitUid: b.allies[0].uid };`,
    target: "ally", skip: "[data-gerda-comfort-skip]",
  },
  {
    id: "ophelia", label: "为我护驾 opheliaGuard",
    setup: `b.opheliaGuard = { actorUid: b.allies[0].uid, targetUid: b.allies[0].uid, amount: 3, source: "test", card: {} };`,
    target: "ally",
  },
  {
    id: "kaiichi", label: "半魅魔血 kaiichiShare",
    setup: `b.kaiichiShare = { unitUid: b.allies[0].uid, sourceUid: b.allies[0].uid, maxCount: 3, cards: [] };`,
    target: "ally", skip: "[data-kaiichi-share-skip]",
  },
  {
    id: "aileng", label: "战斗演练 ailengDrillPicker",
    setup: `b.ailengDrillPicker = { actorUid: b.allies[0].uid, card: { name: "杀（普攻）", type: "slash" } };`,
    target: "ally", skip: "[data-aileng-drill-skip]",
  },
  {
    id: "catherine", label: "窃取 catherineStealPicker",
    setup: `b.catherineStealPicker = { actorUid: b.allies[0].uid, targetUid: b.enemies[0].uid };`,
    target: "ally", skip: "[data-catherine-receiver-skip]",
  },
  {
    id: "mieryula", label: "渴血杀戮 mieryulaBloodthirstPicker",
    setup: `b.mieryulaBloodthirstPicker = { uid: b.allies[0].uid, cardName: "杀（普攻）" };`,
    target: "enemy", skip: "[data-mieryula-skip]",
  },
  {
    id: "dimension", label: "次元转移 dimensionTransfer",
    setup: `b.dimensionTransfer = { mannyUid: b.allies[0].uid, card: {} };`,
    target: "enemy", skip: "[data-dimension-transfer-skip]",
  },
  {
    id: "cadicis", label: "指挥官责任 cadicisResponsibility",
    setup: `b.cadicisResponsibility = { cadicisUid: b.allies[0].uid, targetUid: b.allies[1]?.uid || b.allies[0].uid, count: 1, remaining: 1, actorUid: b.enemies[0].uid, card: {} };`,
    target: "hand", skip: "[data-cadicis-responsibility-skip]",
  },
  {
    id: "hammer", label: "霹雳之锤 thunderHammer（已修复，作对照）",
    setup: `b.thunderHammer = { actorUid: b.allies[0].uid, targetUid: b.enemies[0].uid, card: {} };`,
    target: "hand", skip: "[data-cancel-hammer]",
  },
];

const clearTpl = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false; b.phase = 4;
  b.activeUid = b.allies[0].uid;   // 提示条按 actor 渲染，必须激活
  b.selectedCardIndex = null; b.selectedSkillCard = null;
  ["gerdaComfort","kaiichiShare","kaiichiShareQueue","opheliaGuard","opheliaGuardUid",
   "cadicisResponsibility","dimensionTransfer","ailengDrillPicker",
   "catherineStealPicker","mieryulaBloodthirstPicker","thunderHammer",
   "newMoonShare","millerShare","manualDodge","manualCounter","counterTrigger",
   "recklessPrompt","risaEyePrompt","landmineRpsPrompt","judgement"]
    .forEach(k => { delete b[k]; });
  b.handReveal = null;
  b.allies.forEach(u => { u.hand = u.hand || []; });
  if (!b.allies[0].hand.length) {
    b.allies[0].hand = [
      { name: "杀（普攻）", type: "slash", scale: "attack", responseKind: "dodge", suit: "♦", text: "" },
      { name: "闪", type: "response", suit: "♠", text: "" },
      { name: "弃牌A", type: "consume", suit: "♥", text: "" },
    ];
  }
  return true;
})()`;

const probeTpl = `(kind => {
  const b = window.state.battle;
  const sel = kind === "ally" ? ".ally-row .unit"
    : kind === "enemy" ? ".enemy-row .unit"
    : ".hand-panel .play-card";
  const list = Array.from(document.querySelectorAll(sel));
  // 友方要避开自己（第一个），取另一个可点目标
  const idx = kind === "ally" && list.length > 1 ? 1 : 0;
  const el = list[idx];
  const out = { kind, count: list.length, idx, screenClass: "" };
  const scr = document.querySelector(".battle-screen");
  out.screenClass = scr ? scr.className : "";
  if (!el) { out.missing = true; return out; }
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  out.box = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  out.pe = cs.pointerEvents;
  out.opacity = cs.opacity;
  out.filter = cs.filter;
  const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
  const top = document.elementFromPoint(cx, cy);
  out.hitSelf = !!top && (top === el || el.contains(top));
  out.hitTop = top ? top.tagName + "." + String(top.className || "").slice(0, 70) : "NULL";
  // 面板级：容器自身是否被禁
  const panel = kind === "hand" ? document.querySelector(".hand-panel")
    : document.querySelector(kind === "ally" ? ".ally-row" : ".enemy-row");
  if (panel) {
    const pcs = getComputedStyle(panel);
    out.panelPE = pcs.pointerEvents;
    out.panelOpacity = pcs.opacity;
    out.panelFilter = pcs.filter;
  }
  // 手牌卡自身会因「当前不可打出」而置灰，属于正常反馈，
  // 故手牌只断言面板级可达性；角色卡则直接断言元素级。
  if (kind === "hand") {
    out.checkPE = out.panelPE; out.checkOpacity = out.panelOpacity;
    out.checkFilter = out.panelFilter;
  } else {
    out.checkPE = out.pe; out.checkOpacity = out.opacity; out.checkFilter = out.filter;
  }
  return out;
})`;

const skipProbeTpl = `(sel => {
  const btn = document.querySelector(sel);
  if (!btn) return { exists: false };
  const r = btn.getBoundingClientRect();
  const cs = getComputedStyle(btn);
  const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
  return {
    exists: true, text: btn.textContent.trim(),
    box: { w: Math.round(r.width), h: Math.round(r.height) },
    pe: cs.pointerEvents, opacity: cs.opacity,
    hitSelf: !!top && (top === btn || btn.contains(top)),
    hitTop: top ? top.tagName + "." + String(top.className || "").slice(0, 70) : "NULL",
  };
})`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = collectErrors(page);
  await openGame(page);
  await startRegressionBattle(page);

  const base = await page.evaluate(`(() => {
    const b = window.state.battle;
    return { allies: b.allies.length, enemies: b.enemies.length };
  })()`);
  console.log(`  战场：友方 ${base.allies} / 敌方 ${base.enemies}`);

  for (const c of CASES) {
    console.log(`\n── ${c.label} ──`);
    await page.evaluate(clearTpl);
    await page.evaluate(`(() => {
      const b = window.state.battle;
      ${c.setup}
      b.locked = true;
      window.render();
      return true;
    })()`);
    await page.waitForTimeout(350);

    const p = await page.evaluate(`(${probeTpl})(${JSON.stringify(c.target)})`);
    console.log("  探针:", JSON.stringify(p));

    T(`${c.id} 目标元素已渲染`, !p.missing && p.count > 0, p);
    T(`${c.id} 目标 pointer-events 未被禁用`, p.checkPE !== "none", { pe: p.checkPE, panelPE: p.panelPE });
    T(`${c.id} 命中测试最顶层是目标自身`, p.hitSelf === true, { hitTop: p.hitTop });
    T(`${c.id} 目标未被置灰`, p.checkFilter === "none" || !p.checkFilter.includes("grayscale"),
      { filter: p.checkFilter });
    T(`${c.id} 目标未被压暗`, Number(p.checkOpacity) === 1, { opacity: p.checkOpacity });

    if (c.skip) {
      const s = await page.evaluate(`(${skipProbeTpl})(${JSON.stringify(c.skip)})`);
      console.log("  放弃按钮:", JSON.stringify(s));
      T(`${c.id} 放弃入口已渲染`, s.exists === true, s);
      if (s.exists) {
        T(`${c.id} 放弃按钮 pointer-events 未被禁用`, s.pe !== "none", s);
        T(`${c.id} 放弃按钮命中测试通过`, s.hitSelf === true, s);
        T(`${c.id} 放弃按钮未被压暗`, Number(s.opacity) === 1, s);
      }
    }
  }

  // ---- 萌虎慰劳：可点性之外，还要验证真实点击能推进结算 ----
  console.log("\n── 萌虎慰劳 真实点击推进 ──");
  await page.evaluate(clearTpl);
  await page.evaluate(`(() => {
    const b = window.state.battle;
    b.gerdaComfort = { unitUid: b.allies[0].uid };
    b.locked = true;
    window.render();
    return true;
  })()`);
  await page.waitForTimeout(300);
  const g1 = await page.evaluate(`(() => {
    const b = window.state.battle;
    return { locked: !!b.locked, comfort: !!b.gerdaComfort,
      hand0: b.allies[0].hand.length, hand1: b.allies[1]?.hand.length ?? -1 };
  })()`);
  T("慰劳挂起：已锁定", g1.locked === true && g1.comfort === true, g1);

  await page.locator(".ally-row .unit").nth(1).click({ timeout: 3000 });
  await page.waitForTimeout(800);
  await page.evaluate("window.BattleEffects?.whenIdle?.()").catch(() => {});
  await page.waitForTimeout(400);
  const g2 = await page.evaluate(`(() => {
    const b = window.state.battle;
    return { locked: !!b.locked, comfort: !!b.gerdaComfort,
      hand0: b.allies[0].hand.length, hand1: b.allies[1]?.hand.length ?? -1 };
  })()`);
  console.log("  点击后:", JSON.stringify(g2));
  T("真实点击友方后慰劳已结算", g2.comfort === false, g2);
  T("真实点击友方后锁定解除", g2.locked === false, g2);
  T("双方各摸 2 张", g2.hand0 === g1.hand0 + 2 && g2.hand1 === g1.hand1 + 2,
    { before: g1, after: g2 });

  await browser.close();
  const real = relevantErrors(errors);
  console.log(`\nJS 错误 ${real.length} 条`);
  real.slice(0, 5).forEach(e => console.log("   ", e));
  console.log(`\n通过 ${pass}/${total}`);
  if (failed.length) console.log("失败项：\n  " + failed.join("\n  "));
  process.exit(pass === total && real.length === 0 ? 0 : 1);
})();
