// 移牌动画：背面牌从一个角色头像飞到另一个角色头像
// 关注点：
//   1) 起终点是否为「角色头像」(.unit-art) 而非手牌区
//   2) 飞行牌是否全程背面（is-back），不在落位时翻正面
//   3) 对照组：普通摸牌（drawBatch）仍从牌堆起飞、友方仍翻正面——证明改动未波及
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

function check(name, cond, extra) {
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return cond ? 1 : 0;
}

const NEAR = 60; // 头像中心允许的像素误差

// 采样所有 .card-flight 的轨迹与朝向
const probeTpl = `(() => {
  const center = el => { const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
  const unitArt = uid => document.querySelector('[data-target="' + uid + '"] .unit-art');
  window.__art = {};
  ['__from', '__to'].forEach(k => {});
  return { ok: true };
})()`;

async function runCase(page, kind, fromUid, toUid) {
  return page.evaluate(async ({ kind, fromUid, toUid }) => {
    const center = el => {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };
    const unitArt = uid => document.querySelector(`[data-target="${uid}"] .unit-art`);
    const st = window.state, b = st.battle;
    const fromEl = unitArt(fromUid), toEl = unitArt(toUid);
    if (!fromEl || !toEl) return { err: "no-avatar", fromUid, toUid };
    const fromC = center(fromEl), toC = center(toEl);

    // 采样飞行牌轨迹
    const tracks = new Map();
    const timer = setInterval(() => {
      document.querySelectorAll(".card-flight").forEach(el => {
        if (!el.__id) el.__id = Math.random().toString(36).slice(2);
        const c = center(el);
        const rec = tracks.get(el.__id) || { pts: [], back: [], front: [] };
        rec.pts.push(c);
        rec.back.push(el.classList.contains("is-back"));
        rec.front.push(el.classList.contains("is-front"));
        rec.cls = el.className;
        tracks.set(el.__id, rec);
      });
    }, 16);

    const card = { name: "闪", type: "response", suit: "♥" };
    const evt = kind === "drawBatch"
      ? { type: "drawBatch", uid: toUid, side: "ally", count: 1, cards: [card] }
      : { type: kind, fromUid, fromSide: "ally", toUid, toSide: "ally",
        count: 1, cards: [card] };
    b.animQueue = b.animQueue || [];
    b.animQueue.push(evt);
    window.render && window.render();

    await new Promise(r => setTimeout(r, 1600));
    clearInterval(timer);

    const list = [...tracks.values()].filter(t => t.pts.length >= 2);
    const first = list.map(t => t.pts[0]);
    const last = list.map(t => t.pts[t.pts.length - 1]);
    return {
      fromC, toC, count: list.length,
      first: first[0] || null, last: last[0] || null,
      everFront: list.some(t => t.front.some(Boolean)),
      alwaysBack: list.length > 0 && list.every(t => t.back.every(Boolean)),
      cls: list[0]?.cls || "",
    };
  }, { kind, fromUid, toUid });
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  let pass = 0, total = 0;
  try {
    await openGame(page);
    await startRegressionBattle(page);

    const setup = await page.evaluate(() => {
      const b = window.state.battle;
      const arts = [...document.querySelectorAll(".unit-art")].length;
      return {
        arts,
        allies: b.allies.map(u => u.uid),
        enemies: b.enemies.map(u => u.uid),
      };
    });
    total += 1; pass += check("0 战斗内存在角色头像元素", setup.arts > 0
      && setup.allies.length >= 2 && setup.enemies.length >= 1, setup);
    if (setup.arts < 3) { console.log("环境不足，终止"); return; }

    const a0 = setup.allies[0], a1 = setup.allies[1], e0 = setup.enemies[0];

    // A 交牌：友方 -> 友方
    const give = await runCase(page, "giveCards", a0, a1);
    total += 1; pass += check("A1 giveCards 产生了飞行动画", !give.err && give.count >= 1, give);
    if (!give.err && give.count >= 1) {
      const d0 = Math.hypot(give.first.x - give.fromC.x, give.first.y - give.fromC.y);
      const d1 = Math.hypot(give.last.x - give.toC.x, give.last.y - give.toC.y);
      total += 1; pass += check(`A2 起点=来源角色头像 (偏差${d0.toFixed(0)}px)`, d0 <= NEAR,
        { first: give.first, fromC: give.fromC, d: d0 });
      total += 1; pass += check(`A3 终点=目标角色头像 (偏差${d1.toFixed(0)}px)`, d1 <= NEAR,
        { last: give.last, toC: give.toC, d: d1 });
      total += 1; pass += check("A4 飞行牌全程背面（未翻正面）",
        give.alwaysBack && !give.everFront, { cls: give.cls, everFront: give.everFront });
    }

    // B 偷牌：敌方 -> 友方
    const steal = await runCase(page, "stealCard", e0, a0);
    total += 1; pass += check("B1 stealCard 产生了飞行动画", !steal.err && steal.count >= 1, steal);
    if (!steal.err && steal.count >= 1) {
      const d0 = Math.hypot(steal.first.x - steal.fromC.x, steal.first.y - steal.fromC.y);
      const d1 = Math.hypot(steal.last.x - steal.toC.x, steal.last.y - steal.toC.y);
      total += 1; pass += check(`B2 起点=敌方角色头像 (偏差${d0.toFixed(0)}px)`, d0 <= NEAR,
        { first: steal.first, fromC: steal.fromC, d: d0 });
      total += 1; pass += check(`B3 终点=友方角色头像 (偏差${d1.toFixed(0)}px)`, d1 <= NEAR,
        { last: steal.last, toC: steal.toC, d: d1 });
      total += 1; pass += check("B4 飞行牌全程背面（未翻正面）",
        steal.alwaysBack && !steal.everFront, { cls: steal.cls, everFront: steal.everFront });
    }

    // C 对照：普通摸牌仍从牌堆起飞并翻正面（证明改动只作用于角色间移牌）
    const draw = await runCase(page, "drawBatch", a0, a0);
    total += 1; pass += check("C1 对照 drawBatch 仍产生飞行动画",
      !draw.err && draw.count >= 1, draw);
    if (!draw.err && draw.count >= 1) {
      total += 1; pass += check("C2 对照 drawBatch 仍会翻正面（未被改成背面）",
        draw.everFront, { cls: draw.cls, everFront: draw.everFront });
    }

    total += 1; pass += check("D 无页面错误", errors.length === 0, errors);
  } catch (err) {
    console.log("EXCEPTION", err && err.message);
    total += 1;
  } finally {
    await browser.close();
    console.log(`\n通过 ${pass} / ${total}`);
    process.exit(pass === total ? 0 : 1);
  }
})();
