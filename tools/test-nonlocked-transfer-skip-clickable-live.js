// 【次元转移】「跳过（不发动）」按钮可点击性实机 + 按键位置截图。
// 重点：挂起时 battle.locked=true，界面处于战斗锁定态；必须证明按钮没被遮罩挡住、
// 真实点击能解除挂起。顺带截出「🔵 次元转移」技能图标作为本次图标调整的实机证据。
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const { startRegressionBattle, collectErrors, relevantErrors } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const OUT = "/data/workspace";
const passed = [];
const T = (n, ok, d = "") => {
  passed.push(ok);
  console.log(`${ok ? "✅" : "❌"} ${n}${ok ? "" : "  ← " + JSON.stringify(d)}`);
  return ok;
};

const SETUP = `(() => {
  const st = window.state, b = st.battle;
  b.locked = false; b.animQueue = []; b.phase = 4; b._damageDepth = 0;
  b.dimensionTransfer = null; b.selectedCardIndex = null; b.selectedSkillCard = null;
  window.BattleEffects.animating = false; window.BattleEffects.draining = false;
  const manny = b.allies[0], victim = b.allies[1] || b.allies[0];
  const src = (window.GameDataCharactersCore || []).find(x => x.id === "manny");
  manny.name = "曼妮"; manny.ref = "manny"; manny.id = "manny";
  manny.hp = 100; manny.maxHp = 100;
  manny.stats = Object.assign({}, manny.stats, { attack: 6, magic: 6 });
  manny.skills = src ? JSON.parse(JSON.stringify(src.skills)) : [];
  manny.hand = [{ name: "杀", type: "slash", suit: "♠", scale: "attack" },
                { name: "闪", type: "response", suit: "♥" }];
  victim.hp = 100; victim.maxHp = 100;
  b.enemies.forEach(e => { e.hp = 100; e.maxHp = 100; });
  b.activeUid = manny.uid;
  st.log = [];
  const fired = window.MannySkills.transferSlash(st, b.enemies[0], victim, 7, "测试杀",
    { name: "杀", type: "slash", suit: "♠", scale: "attack" });
  window.render && window.render();
  return { fired, locked: !!b.locked, pending: !!b.dimensionTransfer,
    icon: manny.skills.find(s => s.name === "次元转移")?.icon };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = collectErrors(page);
  await startRegressionBattle(page);

  // ── 1. 构造真实挂起 ──
  const setup = await page.evaluate(SETUP);
  console.log("SETUP", JSON.stringify(setup));
  T("S1 真实触发次元转移挂起（battle.locked=true）",
    setup.fired && setup.pending && setup.locked, setup);
  T("S2 技能数据源里【次元转移】图标已是 🔵", setup.icon === "🔵", setup.icon);

  const btn = page.locator("[data-dimension-transfer-skip]");
  await btn.waitFor({ state: "visible", timeout: 8000 });
  T("S3 跳过按钮在页面上可见且唯一", await btn.count() === 1 && await btn.isVisible());
  T("S4 按钮文案为「跳过（不发动）」",
    (await btn.innerText()).includes("跳过（不发动）"));

  // ── 2. 可点击性硬证（挂起 / 锁定态下仍可点） ──
  // 游戏在挂起后仍可能因自动推进/定时器重渲染，把按钮节点替换掉；
  // locator 绑定的 el 会变成 detached（rect 全 0、computedStyle 为空）。
  // 因此在页面内重新查询当前节点，并先等它稳定有尺寸。
  await page.waitForFunction(() => {
    const el = document.querySelector("[data-dimension-transfer-skip]");
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 20 && r.height > 12;
  }, { timeout: 8000 });
  const probe = await page.evaluate(() => {
    const el = document.querySelector("[data-dimension-transfer-skip]");
    if (!el) return { missing: true };
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const hit = document.elementFromPoint(cx, cy);
    return {
      rect: { x: r.x, y: r.y, w: r.width, h: r.height },
      disabledAttr: el.hasAttribute("disabled"),
      ariaDisabled: el.getAttribute("aria-disabled"),
      pointerEvents: cs.pointerEvents, opacity: cs.opacity,
      visibility: cs.visibility, cursor: cs.cursor,
      hitTag: hit?.tagName, hitText: (hit?.textContent || "").trim().slice(0, 40),
      hitIsSelfOrChild: !!hit && (hit === el || el.contains(hit)),
      battleLockedClass: document.body.classList.contains("battle-locked")
        || !!document.querySelector(".battle-locked"),
    };
  });
  console.log("PROBE", JSON.stringify(probe));
  fs.writeFileSync(`${OUT}/_skip_probe.json`, JSON.stringify(probe, null, 2));
  T("S5 按钮有实际尺寸且在视口内", probe.rect.w > 20 && probe.rect.h > 12
    && probe.rect.x >= 0 && probe.rect.y >= 0, probe.rect);
  T("S6 无 disabled / aria-disabled", !probe.disabledAttr && !probe.ariaDisabled, probe);
  T("S7 pointer-events / opacity / visibility 均未被禁用",
    probe.pointerEvents !== "none" && Number(probe.opacity) > 0.5
    && probe.visibility === "visible", probe);
  T("S8 中心点 elementFromPoint 命中按钮自身（未被遮罩挡住）",
    probe.hitIsSelfOrChild, { hitTag: probe.hitTag, hitText: probe.hitText });
  T("S9 Playwright 可操作性检查通过（trial click）",
    await btn.click({ trial: true, timeout: 4000 }).then(() => true).catch(() => false));

  // ── 3. 截图：整页 / 按钮特写 / 技能图标 ──
  await page.screenshot({ path: `${OUT}/_skip_full.png` });
  await btn.screenshot({ path: `${OUT}/_skip_btn.png` });
  const skillBtn = page.locator("button.skill").filter({ hasText: "次元转移" }).first();
  if (await skillBtn.count()) {
    await skillBtn.screenshot({ path: `${OUT}/_skip_skill_icon.png` }).catch(() => {});
  }
  fs.writeFileSync(`${OUT}/_skip_boxes.json`, JSON.stringify({
    btn: probe.rect,
    viewport: page.viewportSize(),
    skill: await skillBtn.count() ? await skillBtn.boundingBox() : null,
  }, null, 2));
  console.log("SHOTS", "_skip_full.png / _skip_btn.png / _skip_skill_icon.png");

  // ── 4. 真实点击：能点且确实生效 ──
  await btn.click({ timeout: 5000 });
  await page.waitForTimeout(700);
  const after = await page.evaluate(`(() => {
    const st = window.state, b = st.battle, m = b.allies[0];
    return { locked: !!b.locked, pending: !!b.dimensionTransfer,
      hand: m.hand.map(c => c.name + c.suit),
      log: (st.log || []).join("|"),
      victimHp: (b.allies[1] || b.allies[0]).hp,
      enemyHp: b.enemies.map(e => e.hp) };
  })()`);
  console.log("AFTER", JSON.stringify(after));
  T("S10 真实点击后挂起解除、界面解锁", !after.pending && !after.locked, after);
  T("S11 不弃置黑色手牌", after.hand.includes("杀♠") && after.hand.length === 2, after.hand);
  T("S12 战报写明放弃发动、伤害落回原目标",
    /放弃发动次元转移/.test(after.log) && after.victimHp < 100
    && after.enemyHp.every(hp => hp === 100),
    { log: after.log.slice(-160), victimHp: after.victimHp, enemyHp: after.enemyHp });

  const rel = relevantErrors(errors);
  T("S13 无 pageerror / console error", rel.length === 0, rel.slice(0, 4));
  await browser.close();
  const bad = passed.filter(x => !x).length;
  console.log(`\nRESULT ${passed.length - bad}/${passed.length}`);
  if (bad) process.exit(1);
})().catch(e => { console.error("PROBE_CRASH", e); process.exit(1); });
