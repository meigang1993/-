// 安倍卡露娜【记忆泡泡】交互严格检查（玩家四问）：
//   1. 触发后是不是由玩家决定放入（提示 + 放入/放弃，不点则不变）
//   2. 手牌区与泡泡手牌区是否需要/存在「切换按键」
//   3. 按键能不能点击（pointer-events / 命中测试 / 遮挡 / 置灰）
//   4. 泡泡手牌区能不能点击牌取回并使用
// 另设 D 段：非出牌阶段（弃牌阶段）能否取回——技能描述限定「出牌阶段」。
//
// 分批：KARUNA_BI=A|B|C|D|E，不设则跑全部。
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const {
  openGame, startRegressionBattle, collectErrors, relevantErrors,
} = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const PART = (process.env.KARUNA_BI || "ALL").toUpperCase();
const want = p => PART === "ALL" || PART === p;

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
};

const evalT = async (page, expr, ms = 15000, label = "evaluate") => {
  let timer;
  const guard = new Promise((_, rej) => {
    timer = setTimeout(() => rej(new Error(`${label} timeout ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([page.evaluate(expr), guard]);
  } catch (e) {
    console.log(`⚠️  ${label}: ${e.message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
};

const setupTpl = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false; b.phase = 4;
  delete b.karunaBubble; delete b.thunderHammer;
  const u = b.allies[0];
  u.name = "安倍卡露娜"; u.ref = "abe_karuna"; u.id = "abe_karuna";
  u.gender = "female";
  u.stats = { attack: 2, magic: 4, speed: 3, maxHp: 50, bloodlust: 1, handLimit: 3 };
  u.hp = u.maxHp = 50; u.block = 0; u.intent = 1;
  u.skills = [{ name: "同频歌姬" }, { name: "记忆泡泡" }, { name: "幸运海螺" }];
  delete u.bubbleCards; delete u.karunaLastColor; delete u.karunaLastSuit;
  u.hand = [
    { name: "泡泡牌1", type: "tactic", suit: "♦", text: "", targetless: true },
    { name: "泡泡牌2", type: "tactic", suit: "♥", text: "", targetless: true },
    { name: "泡泡牌3", type: "tactic", suit: "♠", text: "", targetless: true },
    { name: "泡泡杀", type: "kill", suit: "♦", text: "" },
  ];
  b.activeUid = u.uid;
  b.selectedCardIndex = -1;
  b.enemies.forEach(e => {
    e.hp = e.maxHp = 90; e.block = 0; e.statuses = [];
    e.hand = []; e.noResponse = true;
  });
  st.log = []; st.battleLog = [];
  window.render();
  return { foes: b.enemies.length, hand: u.hand.length, intent: u.intent };
})()`;

const snapTpl = `(() => {
  const st = window.state, b = st.battle, u = b.allies[0];
  return {
    hand: u.hand.map(c => c.name),
    bubble: (u.bubbleCards || []).map(c => c.name),
    bubbleLen: (u.bubbleCards || []).length,
    discard: (u.pileStats?.discard || u.discard || []).map(c => c.name),
    intent: u.intent,
    locked: !!b.locked,
    pending: !!b.karunaBubble,
    pendingName: b.karunaBubble?.card?.name || "",
    slots: document.querySelectorAll("[data-bubble-index]").length,
    selected: b.selectedCardIndex,
    logs: (st.battleLog || []).join(" | "),
  };
})()`;

const playTpl = name => `(() => {
  const st = window.state, b = st.battle, u = b.allies[0];
  const card = u.hand.find(c => c.name === ${JSON.stringify(name)});
  if (!card) return false;
  window.BattleSystem.useCard(st, u, card.targetless ? null : b.enemies[0], card);
  return true;
})()`;

const playAndWait = async (page, name) => {
  await evalT(page, playTpl(name), 15000, `play:${name}`);
  await page.waitForTimeout(700);
  await evalT(page, "window.BattleEffects?.whenIdle?.()", 8000, `whenIdle:${name}`);
  await page.waitForTimeout(300);
  return evalT(page, snapTpl, 15000, `snap:${name}`);
};

// 元素的真实可点性：可见性 + pointer-events + 命中测试（中心点最顶层是否自身）+ 置灰
// scroll=true 时先滚到视口中央再测——避免"元素本身可点、只是当前在视口外"造成误判。
const probeTpl = (sel, scroll) => `(() => {
  const el = document.querySelector(${JSON.stringify(sel)});
  if (!el) return { found: false };
  if (${scroll ? "true" : "false"}) el.scrollIntoView({ block: "center" });
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const top = document.elementFromPoint(cx, cy);
  let hitSelf = false, chain = [];
  for (let n = top; n && chain.length < 6; n = n.parentElement) {
    chain.push(n.className ? String(n.className).slice(0, 40) : n.tagName);
    if (n === el) { hitSelf = true; break; }
  }
  return {
    found: true,
    box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    pe: cs.pointerEvents,
    opacity: Number(cs.opacity),
    filter: cs.filter,
    disabled: !!el.disabled,
    inViewport: r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight,
    hitSelf, topTag: top ? top.tagName + "." + String(top.className || "").slice(0, 40) : null,
    chain,
    overflowBottom: Math.round(r.bottom - innerHeight),
  };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = collectErrors(page);
  await openGame(page);
  await startRegressionBattle(page);

  const setup = await evalT(page, setupTpl, 15000, "setup");
  T("前置：敌人 2 名", setup?.foes === 2, setup);
  T("前置：手牌 4 张", setup?.hand === 4, setup);

  // ── A 段：触发后是否由玩家决定放入 ─────────────────────────────
  if (want("A")) {
    console.log("\n[A] 触发后是否玩家决定放入");
    let s = await playAndWait(page, "泡泡牌1");
    T("A1 出牌后挂起（等待玩家决定）", s?.pending === true, s);
    T("A2 挂起时战斗锁定", s?.locked === true, s);

    // 关键：不点任何按钮，静置后再看——若自动放入则此项红。
    await page.waitForTimeout(1600);
    s = await evalT(page, snapTpl, 15000, "snapA3");
    T("A3 未点击时泡泡区仍为空（不自动放入）", s?.bubbleLen === 0, s);
    T("A4 未点击时牌留在弃牌堆", (s?.discard || []).includes("泡泡牌1"), s);
    T("A5 未点击时仍保持挂起", s?.pending === true && s?.locked === true, s);

    const store = await evalT(page, probeTpl("[data-karuna-bubble-store]"), 15000, "probeStore");
    T("A6 「放入」按钮存在", store?.found === true, store);
    T("A7 「放入」按钮可点（pointer-events）", store?.pe !== "none", store);
    T("A8 「放入」按钮命中测试通过", store?.hitSelf === true, store);
    T("A9 「放入」按钮未被压暗", store?.opacity === 1, store);
    T("A10 「放入」按钮未被置灰", !store?.filter || store.filter === "none", store);
    T("A11 「放入」按钮在视口内", store?.inViewport === true, store);

    const skip = await evalT(page, probeTpl("[data-karuna-bubble-skip]"), 15000, "probeSkip");
    T("A12 「放弃」按钮存在且可点",
      skip?.found === true && skip?.pe !== "none" && skip?.hitSelf === true, skip);
    T("A13 「放弃」按钮未被压暗", skip?.opacity === 1, skip);

    // 真实鼠标点击「放入」
    await page.locator("[data-karuna-bubble-store]").click({ timeout: 5000 });
    await page.waitForTimeout(600);
    s = await evalT(page, snapTpl, 15000, "snapA14");
    T("A14 点击「放入」后存入 1 张", s?.bubbleLen === 1 && s?.bubble[0] === "泡泡牌1", s);
    T("A15 点击「放入」后解除锁定", s?.locked === false, s);
    T("A16 存入后牌离开弃牌堆", !(s?.discard || []).includes("泡泡牌1"), s);

    // 第二张：真实点击「放弃」
    s = await playAndWait(page, "泡泡牌2");
    T("A17 第二张牌再次挂起", s?.pending === true, s);
    await page.locator("[data-karuna-bubble-skip]").click({ timeout: 5000 });
    await page.waitForTimeout(600);
    s = await evalT(page, snapTpl, 15000, "snapA18");
    T("A18 点击「放弃」后未存入", s?.bubbleLen === 1, s);
    T("A19 放弃的牌留在弃牌堆", (s?.discard || []).includes("泡泡牌2"), s);
    T("A20 放弃后解除锁定", s?.locked === false, s);
    T("A21 战报说明放弃发动", (s?.logs || "").includes("放弃发动记忆泡泡"), s);
  }

  // ── B 段：切换按键是否存在 / 两区是否并存 ──────────────────────
  if (want("B")) {
    console.log("\n[B] 手牌区与泡泡区：是否需要切换");
    const both = await evalT(page, `(() => {
      const hand = document.querySelector(".hand-panel .hand");
      const zone = document.querySelector(".karuna-bubble-zone");
      const vis = el => {
        if (!el) return null;
        const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
        return { w: Math.round(r.width), h: Math.round(r.height), display: cs.display,
          visibility: cs.visibility, pe: cs.pointerEvents,
          top: Math.round(r.top), bottom: Math.round(r.bottom) };
      };
      // 全量扫描：是否存在把底部手牌区切到泡泡区的按键。
      // 注意：技能栏里的「⭐记忆泡泡」是技能图标按钮（在 .skill-list 内），
      // 不是区域切换开关，必须排除，否则误报。
      const cands = Array.from(document.querySelectorAll("button, [data-hand-switch], [data-toggle]"))
        .filter(b => !b.closest(".skill-list") && !b.closest(".hand-skills")
          && !b.closest(".unit-skills"))
        .map(b => ({ text: (b.textContent || "").trim().slice(0, 20),
          attrs: Array.from(b.attributes).map(a => a.name).filter(n => n.startsWith("data-")).join(",") }))
        .filter(x => /切换|泡泡|手牌区/.test(x.text + x.attrs));
      return { hand: vis(hand), zone: vis(zone), switchCandidates: cands,
        zoneCount: document.querySelectorAll(".karuna-bubble-zone").length };
    })()`, 15000, "probeBoth");
    T("B1 底部手牌区可见", both?.hand && both.hand.w > 0 && both.hand.h > 0, both);
    T("B2 泡泡手牌区同时可见（无需切换）",
      both?.zone && both.zone.w > 0 && both.zone.h > 0
      && both.zone.display !== "none" && both.zone.visibility !== "hidden", both);
    T("B3 两区并存于同一手牌面板（纵向排布）",
      both?.zone && both?.hand && both.zone.top >= both.hand.top, both);
    T("B4 界面不存在「切换手牌区/泡泡区」按键",
      (both?.switchCandidates || []).length === 0, both?.switchCandidates);
    T("B5 泡泡区实例唯一", both?.zoneCount === 1, both);

    const slotRaw = await evalT(page, probeTpl("[data-bubble-index]", false), 15000, "probeSlotRaw");
    const slot = await evalT(page, probeTpl("[data-bubble-index]", true), 15000, "probeSlot");
    T("B6 泡泡区牌位可点（pointer-events）", slot?.pe !== "none", slot);
    T("B7 泡泡区牌位命中测试通过", slot?.hitSelf === true, slot);
    T("B8 泡泡区牌位未被置灰", !slot?.filter || slot.filter === "none", slot);
    T("B9 滚动后泡泡区牌位在视口内", slot?.inViewport === true, slot);
    // 布局体验：默认不滚动时是否已被截掉（>0 表示超出视口底部）
    T("B10 默认布局下泡泡区完整可见（不溢出视口底部）",
      (slotRaw?.overflowBottom || 0) <= 0, slotRaw);
    // 牌面尺寸必须与手牌一致：曾因 .karuna-bubble-slot 用 inline-block + transform:scale(.72)
    // 导致卡片被内容撑宽到 187px 又被缩到 134×115，比例横向拉伸变形且与手牌大小不齐。
    const size = await evalT(page, `(() => {
      const hand = document.querySelector(".hand .play-card");
      const bub = document.querySelector(".karuna-bubble-slot .play-card");
      const R = el => el ? { w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height) } : null;
      return { hand: R(hand), bubble: R(bub) };
    })()`, 15000, "probeSize");
    T("B11 泡泡区牌面尺寸与手牌一致（不被拉伸/缩放）",
      !!size?.hand && !!size?.bubble
      && size.bubble.w === size.hand.w && size.bubble.h === size.hand.h, size);
  }

  // ── C 段：点击泡泡区的牌取回并使用 ─────────────────────────────
  if (want("C")) {
    console.log("\n[C] 点击泡泡区的牌取回并使用");
    // 先凑够 2 张：出牌3 并放入
    await playAndWait(page, "泡泡牌3");
    await page.locator("[data-karuna-bubble-store]").click({ timeout: 5000 });
    await page.waitForTimeout(600);
    let s = await evalT(page, snapTpl, 15000, "snapC0");
    T("C0 准备：泡泡区 2 张", s?.bubbleLen === 2, s);
    T("C1 泡泡区渲染 2 个牌位", s?.slots === 2, s);

    const before = s.hand.length;
    // 真实鼠标点击第 1 个牌位
    await page.locator("[data-bubble-index='0']").click({ timeout: 5000 });
    await page.waitForTimeout(700);
    s = await evalT(page, snapTpl, 15000, "snapC2");
    T("C2 点击后泡泡区减 1", s?.bubbleLen === 1, s);
    T("C3 取回的牌回到手牌", s?.hand.length === before + 1
      && (s?.bubble || []).indexOf("泡泡牌1") < 0, s);
    T("C4 取回后自动选中该牌", s?.selected >= 0, s);

    const sel = await evalT(page, `(() => {
      const b = window.state.battle, u = b.allies[0];
      const i = b.selectedCardIndex;
      return { idx: i, name: u.hand[i]?.name || "", free: !!u.hand[i]?._bubbleFree };
    })()`, 15000, "snapC5");
    T("C5 选中的正是取回的牌", sel?.name === "泡泡牌1", sel);
    T("C6 取回的牌带免杀意标记", sel?.free === true, sel);

    // 打出取回的牌（目标less 战术牌 → 点「使用」）
    const useBtn = await evalT(page, probeTpl("[data-confirm-target]"), 15000, "probeUse");
    T("C7 「使用」按钮存在且可点",
      useBtn?.found === true && useBtn?.pe !== "none" && useBtn?.hitSelf === true
      && useBtn?.disabled === false, useBtn);
    if (useBtn?.found) {
      await page.locator("[data-confirm-target]").click({ timeout: 5000 });
      await page.waitForTimeout(700);
      await evalT(page, "window.BattleEffects?.whenIdle?.()", 8000, "whenIdle:C8");
      const after = await evalT(page, snapTpl, 15000, "snapC8");
      T("C8 取回的牌成功打出（离开手牌）",
        !(after?.hand || []).includes("泡泡牌1"), after);
      // 打出后记忆泡泡会再次挂起 → 跳过，避免挂死
      await evalT(page, "(() => { window.BattleSystem?.skipKarunaBubble?.(window.state, window.render);"
        + " window.render(); return true; })()", 8000, "skipAfterC8");
      await page.waitForTimeout(300);
    }

    // 第二个牌位也能取回
    const s2 = await evalT(page, snapTpl, 15000, "snapC9");
    if (s2?.slots >= 1) {
      const n0 = s2.bubbleLen;
      await page.locator("[data-bubble-index='0']").click({ timeout: 5000 });
      await page.waitForTimeout(700);
      const s3 = await evalT(page, snapTpl, 15000, "snapC10");
      T("C9 第二个牌位点击同样生效", s3?.bubbleLen === n0 - 1, { n0, s3 });
    } else {
      T("C9 第二个牌位点击同样生效", false, { reason: "no slots", s2 });
    }
  }

  // ── D 段：非出牌阶段能否取回（描述限定「出牌阶段」）─────────────
  if (want("D")) {
    console.log("\n[D] 非出牌阶段取回（描述限定出牌阶段）");
    const d = await evalT(page, `(() => {
      const st = window.state, b = st.battle, u = b.allies[0];
      // 本段自带一张泡泡牌：前面 C 段已把牌取回/打出，bubble 可能已空。
      u.bubbleCards = [{ name: "弃牌阶段测试牌", type: "tactic", suit: "♦", text: "" }];
      b.locked = false; b.phase = 5; b.activeUid = u.uid;
      window.render();
      return { phase: b.phase, bubble: (u.bubbleCards || []).length,
        slots: document.querySelectorAll("[data-bubble-index]").length,
        zoneVisible: !!document.querySelector(".karuna-bubble-zone") };
    })()`, 15000, "snapD0");
    T("D1 已切到弃牌阶段", d?.phase === 5, d);
    T("D2 弃牌阶段泡泡区仍渲染", d?.zoneVisible === true && d?.slots >= 1, d);
    if (d?.slots >= 1) {
      const before = d.bubble;
      // D4 必须先于 D3 探测：D3 若取回成功会清空泡泡区，槽位随之消失，
      // 导致 D4 查不到元素而"假红"，无法独立证明置灰规则存在。
      const idleSlot = await evalT(page, probeTpl("[data-bubble-index]", true), 15000, "probeD4");
      T("D4 弃牌阶段泡泡牌位置灰且不可点",
        idleSlot?.pe === "none" && idleSlot?.opacity < 1, idleSlot);
      const res = await evalT(page, `(() => {
        const st = window.state, b = st.battle, u = b.allies[0];
        const ok = window.BattleSystem.takeKarunaBubble(st, 0, window.render);
        window.render();
        return { ok, bubble: (u.bubbleCards || []).length, hand: u.hand.length };
      })()`, 15000, "snapD3");
      T("D3 弃牌阶段取回被拒绝（符合描述）", res?.ok === false && res?.bubble === before,
        { before, res });
    } else {
      T("D3 弃牌阶段取回被拒绝（符合描述）", false, { reason: "no slots", d });
      T("D4 弃牌阶段泡泡牌位置灰且不可点", false, { reason: "no slots", d });
    }
    // 还原到出牌阶段
    await evalT(page, "(() => { window.state.battle.phase = 4; window.render(); return true; })()",
      8000, "restoreD");
    await page.waitForTimeout(300);
  }

  // ── E 段：挂起（locked）时泡泡槽不可点 ─────────────────────────
  if (want("E")) {
    console.log("\n[E] 挂起态下泡泡槽应不可点（避免误触）");
    const e = await evalT(page, `(() => {
      const st = window.state, b = st.battle, u = b.allies[0];
      u.bubbleCards = [{ name: "挂起态测试牌", type: "tactic", suit: "♥", text: "" }];
      b.phase = 4; b.locked = true;
      b.karunaBubble = { actorUid: u.uid, card: { name: "挂起测试牌", suit: "♦" } };
      window.render();
      const el = document.querySelector("[data-bubble-index]");
      const cs = el ? getComputedStyle(el) : null;
      return { slots: document.querySelectorAll("[data-bubble-index]").length,
        pe: cs?.pointerEvents || null };
    })()`, 15000, "snapE1");
    T("E1 挂起时存在泡泡牌位", (e?.slots || 0) >= 1, e);
    T("E2 挂起时泡泡牌位不可点（pointer-events:none）", e?.pe === "none", e);
    await evalT(page, "(() => { const b = window.state.battle;"
      + " b.karunaBubble = null; b.locked = false; window.render(); return true; })()",
      8000, "restoreE");
    await page.waitForTimeout(300);
  }

  const bad = relevantErrors(errors);
  T("全程无 JS 错误", bad.length === 0, bad.slice(0, 3));

  console.log(`\n通过 ${pass}/${total}`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})();
