// 截图：量出「魔弹特攻」展示手牌面板（magicBulletHand）里每张牌的真实渲染尺寸。
// 渲染路径：battle-response-ui.js magicBulletHand()，卡片同时带 hand-reveal-card + hand-response-card。
// 目的：核对 AOE 牌（魔王军入侵）与非 AOE 牌在该面板里是否尺寸一致。
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const {
  openGame, startRegressionBattle, collectErrors, relevantErrors,
} = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

// 我方「娜娜莉」手牌与用户截图一致：拆解、灵魂锁链、毒杀、借刀杀人、魔王军入侵、蓄力
const setupTpl = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false; b.phase = 4;
  const card = (name, type, suit, text, extra) => Object.assign({
    name, type, suit, text, id: name + suit,
  }, extra || {});
  // 除主目标外清空敌人手牌并禁用自动响应
  b.enemies.forEach((e, i) => { if (i > 0) { e.hand = []; e.noResponse = true; } });
  const foe = b.enemies[0];
  foe.name = "狂鲨海盗团潜水艇"; foe.ai = "shark_pirate_submarine";
  foe.noResponse = true; foe.hand = [];
  const ally = b.allies[0];
  ally.name = "娜娜莉";
  ally.hand = [
    card("拆解", "tactic", "♠", "指定一名有手牌的其他角色为目标，弃置其1张手牌；状态牌被拆除后立即进入消耗牌堆。", { discardTarget: true }),
    card("灵魂锁链", "tactic", "♥", "指定2名敌方角色为目标；若敌方仅剩1名角色，则指定该角色。目标获得“锁魂”标记，持续1轮。", { soulChain: true }),
    card("毒杀", "slash", "♣", "指定一名敌方角色为目标，对其造成等同于你的攻击力的毒属性伤害。若此牌造成生命值伤害，目标获得1层“毒”。", { scale: "attack", poison: true }),
    card("借刀杀人", "tactic", "♦", "选择一名其他友方角色，再指定一名敌方角色为目标，选择前者1张单体【杀】对后者使用。", { borrowSlash: true }),
    card("魔王军入侵", "tactic", "♠", "指定所有敌方角色为目标，对其各发动兼具物理与魔法属性的复合攻击，造成等同于你的攻击力与魔力之和的伤害。每名目标可打出1张单体【杀】，抵消其受到的此次伤害；开启手动响应时，由玩家选择是否打出。", { attackType: "magic", hybridAttack: true, demonInvasion: true, targetless: true }),
    card("蓄力", "tactic", "♣", "本回合内，你使用的下一张【杀】造成的伤害×2。此效果可叠加。", { charge: 1, targetless: true }),
  ];
  b.activeUid = ally.uid;
  st.log = []; st.battleLog = [];
  window.render();
  return { allyUid: ally.uid, foeUid: foe.uid, hand: ally.hand.length };
})()`;

// 敌人对我方使用魔弹特攻 → mode = magicBulletReveal（真实渲染路径）
const openTpl = `(() => {
  const st = window.state, b = st.battle;
  const ally = b.allies[0], foe = b.enemies[0];
  b.animQueue = [];
  b.handReveal = {
    actorUid: foe.uid, targetUid: ally.uid, cardName: "魔弹特攻",
    card: { name: "魔弹特攻", type: "tactic", suit: "♠", magicBullet: true, attackType: "magic" },
    mode: "magicBulletReveal", repeatAfter: true,
  };
  b.locked = true;
  window.render();
  return { hasReveal: !!b.handReveal, mode: b.handReveal.mode, locked: b.locked };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
  const errList = collectErrors(page);
  await openGame(page);
  await startRegressionBattle(page);
  const setup = await page.evaluate(setupTpl);
  await page.waitForTimeout(400);
  const opened = await page.evaluate(openTpl);
  await page.waitForTimeout(600);
  console.log("setup:", JSON.stringify(setup), " opened:", JSON.stringify(opened));

  const m = await page.evaluate(`(() => {
    const r = el => { const b = el.getBoundingClientRect();
      return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
    const out = { cards: [] };
    const panels = [".response-hand-panel", ".hand-reveal-panel", ".hand"];
    out.panels = {};
    panels.forEach(sel => { const el = document.querySelector(sel); if (el) out.panels[sel] = r(el); });
    const wrap = document.querySelector(".hand-reveal-cards") || document.querySelector(".response-hand-panel .hand");
    out.wrap = wrap ? r(wrap) : null;
    document.querySelectorAll(".hand-response-card").forEach(el => {
      const inner = el.querySelector(".play-card");
      const nameEl = el.querySelector(".card-title b") || el.querySelector("b");
      out.cards.push({
        name: (nameEl && nameEl.textContent || "").trim(),
        cls: el.className,
        outer: r(el),
        inner: inner ? r(inner) : null,
        disabled: el.classList.contains("disabled"),
      });
    });
    out.count = out.cards.length;
    // 诊断：AOE 牌为什么被撑宽
    const odd = Array.from(document.querySelectorAll(".hand-response-card")).find(el => {
      const b = el.querySelector(".card-title b") || el.querySelector("b");
      return (b && b.textContent || "").trim() === "魔王军入侵";
    });
    const norm = Array.from(document.querySelectorAll(".hand-response-card")).find(el => {
      const b = el.querySelector(".card-title b") || el.querySelector("b");
      return (b && b.textContent || "").trim() === "拆解";
    });
    const dump = el => {
      if (!el) return null;
      const cs = getComputedStyle(el);
      const inner = el.querySelector(".play-card");
      const ics = inner ? getComputedStyle(inner) : null;
      return {
        cls: el.className,
        maxW: cs.maxWidth, width: cs.width, flex: cs.flex, boxSizing: cs.boxSizing,
        varRW: cs.getPropertyValue("--response-card-width"),
        scrollW: el.scrollWidth, offsetW: el.offsetWidth,
        innerCls: inner ? inner.className : null,
        innerMaxW: ics && ics.maxWidth, innerW: ics && ics.width, innerScrollW: inner && inner.scrollWidth,
        children: inner ? Array.from(inner.children).map(ch => ({
          cls: ch.className, w: Math.round(ch.getBoundingClientRect().width), sw: ch.scrollWidth,
        })) : [],
      };
    };
    out.aoe = dump(odd);
    out.normal = dump(norm);
    return out;
  })()`);

  console.log("=== 魔弹特攻 · 展示手牌尺寸实测 ===");
  console.log("面板:", JSON.stringify(m.panels));
  console.log("卡片容器:", JSON.stringify(m.wrap));
  m.cards.forEach(c => console.log(
    `  ${c.name.padEnd(7)} 外框 ${JSON.stringify(c.outer)} 内卡 ${JSON.stringify(c.inner)}${c.disabled ? " [disabled]" : ""}`));

  console.log("AOE 牌诊断:", JSON.stringify(m.aoe, null, 1));
  console.log("普通牌诊断:", JSON.stringify(m.normal, null, 1));

  await page.screenshot({ path: "/data/workspace/magicbullet_aoe_full.png" });
  const p = m.panels[".response-hand-panel"] || m.wrap;
  if (p) {
    await page.screenshot({
      path: "/data/workspace/magicbullet_aoe_zone.png",
      clip: { x: Math.max(0, p.x), y: Math.max(0, p.y - 10), width: p.w, height: p.h + 20 },
    });
  }
  console.log("errors:", relevantErrors(errList).length);
  await browser.close();
})().catch(e => { console.error("FATAL", e && e.message); process.exit(1); });
