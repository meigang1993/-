// 【霹雳之锤】「放弃发动」按钮真实点击回归
//
// 玩家触发锤子后若不想弃牌，应能点底部提示条里的「放弃发动」取消。
// 本用例全程走真实鼠标点击（非 DOM click），并对按钮做命中测试，
// 确认最顶层命中的确实是按钮本身（而不是被置灰层挡住）。
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const {
  openGame, startRegressionBattle, collectErrors, relevantErrors,
} = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
};

const setupTpl = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false; b.phase = 4;
  delete b.thunderHammer; delete b.greenGatlingResume;
  delete b.demonInvasionResume; delete b.manualDodgeResume;
  const carlos = b.allies[0];
  carlos.name = "卡洛斯"; carlos.ref = "carlos"; carlos.id = "carlos";
  carlos.gender = "male";
  carlos.stats = { attack: 6, magic: 3, speed: 5 };
  carlos.hp = carlos.maxHp = 100; carlos.block = 0;
  b.activeUid = carlos.uid;
  st.equipment = st.equipment || {};
  st.equipment.carlos = ["霹雳之锤"];
  st.testEquipment = st.testEquipment || {};
  st.testEquipment.carlos = ["霹雳之锤"];
  carlos.battleRelics = ["霹雳之锤"];
  b.enemies.forEach((e, i) => {
    e.hp = e.maxHp = 60; e.block = 0; e.statuses = [];
    e.hand = i === 0 ? [{ name: "闪", type: "response", suit: "♠", text: "" }] : [];
    e.noResponse = false;
  });
  carlos.hand = [
    { name: "杀（普攻）", type: "slash", scale: "attack",
      responseKind: "dodge", suit: "♦", text: "" },
    { name: "弃牌A", type: "consume", suit: "♥", text: "" },
    { name: "弃牌B", type: "consume", suit: "♣", text: "" },
  ];
  st.log = []; st.battleLog = [];
  window.render();
  return { foes: b.enemies.length,
    hasHammer: !!window.RelicSystem?.hasEquipped?.(st, carlos, "霹雳之锤") };
})()`;

const snapTpl = `(() => {
  const b = window.state.battle, carlos = b.allies[0];
  const btn = document.querySelector("[data-cancel-hammer]");
  let box = null, hit = null, opacity = null, pe = null, visible = false;
  if (btn) {
    const r = btn.getBoundingClientRect();
    box = { x: Math.round(r.x), y: Math.round(r.y),
            w: Math.round(r.width), h: Math.round(r.height) };
    opacity = getComputedStyle(btn).opacity;
    pe = getComputedStyle(btn).pointerEvents;
    const cs = getComputedStyle(btn);
    visible = r.width > 0 && r.height > 0 && cs.visibility !== "hidden"
      && cs.display !== "none";
    // 命中测试：按钮中心点最顶层元素是谁
    if (r.width > 0 && r.height > 0) {
      const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
      const el = document.elementFromPoint(cx, cy);
      hit = el ? (el === btn ? "SELF" :
        (el.tagName + "." + (el.className || "").toString().slice(0, 60))) : "NULL";
      const stack = document.elementsFromPoint(cx, cy).slice(0, 4)
        .map(e => e.tagName + (e.dataset && e.dataset.cancelHammer ? "[cancel-hammer]" : ""));
      hit = { top: hit, stack };
    }
  }
  return {
    hp: b.enemies.map(e => e.hp), locked: !!b.locked, hammer: !!b.thunderHammer,
    phase: b.phase, hand: carlos.hand.map(c => c.name), handLen: carlos.hand.length,
    btnExists: !!btn,
    btnText: btn ? btn.textContent.trim() : "",
    box, opacity, pe, visible, hit,
    prompt: document.querySelector(".discard-prompt")?.textContent || "",
  };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = collectErrors(page);
  await openGame(page);
  await startRegressionBattle(page);

  const setup = await page.evaluate(setupTpl);
  T("前置：霹雳之锤已装备", setup.hasHammer === true, setup);
  T("前置：敌人 2 名", setup.foes === 2, setup);

  // ---- 触发锤子：出单体杀，敌人自动打闪 ----
  await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    const carlos = b.allies[0];
    const card = carlos.hand.find(c => c.name === "杀（普攻）");
    window.BattleSystem.useCard(st, carlos, b.enemies[0], card);
    return true;
  })()`);
  await page.waitForTimeout(1200);
  await page.evaluate("window.BattleEffects?.whenIdle?.()");
  await page.waitForTimeout(600);

  const s1 = await page.evaluate(snapTpl);
  console.log("  锤子挂起后:", JSON.stringify(s1));
  T("1 锤子已挂起", s1.hammer === true, s1);
  T("2 战斗进入锁定", s1.locked === true, s1);
  T("3 提示条为霹雳之锤", s1.prompt.includes("霹雳之锤"), s1);

  // ---- 放弃按钮的可见性与命中 ----
  T("4 放弃按钮已渲染", s1.btnExists === true, s1);
  T("5 按钮文案为「放弃发动」", s1.btnText === "放弃发动", s1);
  T("6 按钮有非零尺寸且可见", s1.visible === true, s1);
  T("7 按钮 pointer-events 未被禁用", s1.pe !== "none", s1);
  T("7b 按钮未被置灰规则压暗（opacity 应为 1）",
    Number(s1.opacity) === 1, { opacity: s1.opacity });
  T("8 命中测试：中心点最顶层就是按钮本身",
    s1.hit && s1.hit.top === "SELF", s1.hit);

  // ---- 真实鼠标点击 ----
  await page.locator("[data-cancel-hammer]").click({ timeout: 3000 });
  await page.waitForTimeout(1200);
  await page.evaluate("window.BattleEffects?.whenIdle?.()");
  await page.waitForTimeout(500);

  const s2 = await page.evaluate(snapTpl);
  console.log("  点击放弃后:", JSON.stringify(s2));
  T("9 点击后锁定解除", s2.locked === false, s2);
  T("10 锤子已清空", s2.hammer === false, s2);
  T("11 手牌一张未弃（与弃置路径相反）",
    s2.handLen === s1.handLen, { before: s1.handLen, after: s2.handLen });
  T("12 手牌内容不变", JSON.stringify(s2.hand) === JSON.stringify(s1.hand),
    { before: s1.hand, after: s2.hand });
  T("13 敌人未被强制补伤（仍为 60）", s2.hp[0] === 60, s2);
  T("14 提示条已消失", s2.prompt === "" || !s2.prompt.includes("霹雳之锤"), s2);
  T("15 放弃按钮已移除", s2.btnExists === false, s2);

  const errs = relevantErrors(errors);
  T("16 全程无 JS 错误", errs.length === 0, errs.slice(0, 3));

  await browser.close();
  console.log(`\n通过 ${pass}/${total}`);
  process.exit(pass === total ? 0 : 1);
})().catch(e => { console.error("FATAL", e); process.exit(2); });
