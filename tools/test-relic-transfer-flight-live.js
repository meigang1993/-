// 饰品移牌动画专项：确认饰品路径未被「头像飞行」改动波及
// 关注点：
//   1) 武器库（gainCards 无 fromUid，从各自牌堆摸）仍从牌堆/公共区起飞、友方仍翻正面
//   2) 物资货物 / 战争号角（drawBatch）仍从牌堆起飞
//   3) 对照：giveCards 仍走角色头像——证明改动在位，测试不是空转
// 依据：饰品自身不发起角色间移牌（武器库/物资货物/战争号角均从各自牌堆摸，
//       导弹发射器/魅魔钢叉是弃置，冰心双刺剑只监听事件）。
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

// 用真实事件结构驱动真实 handler，采样飞行牌轨迹
async function runEvent(page, evt, watchUids) {
  return page.evaluate(async ({ evt, watchUids }) => {
    const center = el => {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };
    const unitArt = uid => document.querySelector(`[data-target="${uid}"] .unit-art`);
    const st = window.state, b = st.battle;

    // 记录所有角色头像中心，用于判定起点是否落在头像上
    const artCenters = {};
    watchUids.forEach(uid => {
      const el = unitArt(uid);
      if (el) artCenters[uid] = center(el);
    });

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

    b.animQueue = b.animQueue || [];
    b.animQueue.push(evt);
    window.render && window.render();

    await new Promise(r => setTimeout(r, 1600));
    clearInterval(timer);

    const list = [...tracks.values()].filter(t => t.pts.length >= 2);
    const first = list.map(t => t.pts[0]);
    const last = list.map(t => t.pts[t.pts.length - 1]);
    return {
      artCenters, count: list.length,
      first: first[0] || null, last: last[0] || null,
      everFront: list.some(t => t.front.some(Boolean)),
      alwaysBack: list.length > 0 && list.every(t => t.back.every(Boolean)),
      cls: list[0]?.cls || "",
    };
  }, { evt, watchUids });
}

// 起点与任一角色头像的最小距离
function nearestArt(pt, artCenters) {
  let best = Infinity, who = null;
  Object.entries(artCenters).forEach(([uid, c]) => {
    const d = Math.hypot(pt.x - c.x, pt.y - c.y);
    if (d < best) { best = d; who = uid; }
  });
  return { d: best, who };
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
      return {
        arts: [...document.querySelectorAll(".unit-art")].length,
        allies: b.allies.map(u => u.uid),
        enemies: b.enemies.map(u => u.uid),
      };
    });
    total += 1; pass += check("0 战斗内环境就绪", setup.arts > 0
      && setup.allies.length >= 2 && setup.enemies.length >= 1, setup);
    if (setup.allies.length < 2) { console.log("环境不足，终止"); return; }

    const a0 = setup.allies[0], a1 = setup.allies[1], e0 = setup.enemies[0];
    const uids = [a0, a1, e0];
    const mkCard = name => ({ name, type: "slash", suit: "♠" });

    // A 武器库（饰品）：gainCards 且无 fromUid —— 从各自牌堆摸，不是角色间移牌
    const arsenalEvt = {
      type: "gainCards", uid: a1, side: "ally",
      count: 1, cards: [mkCard("杀（普攻）")], teamArsenal: true,
    };
    const A = await runEvent(page, arsenalEvt, uids);
    total += 1; pass += check("A1 武器库 gainCards 产生飞行动画", A.count >= 1, A);
    if (A.count >= 1) {
      const near = nearestArt(A.first, A.artCenters);
      total += 1; pass += check(
        `A2 武器库起点不是角色头像（最近头像 ${near.who} 距 ${near.d.toFixed(0)}px）`,
        near.d > NEAR, { first: A.first, artCenters: A.artCenters, near });
      total += 1; pass += check("A3 武器库仍翻正面（未被改成背面）",
        A.everFront, { cls: A.cls, everFront: A.everFront });
    }

    // B 物资货物（饰品）：为队友发牌，走 drawBatch
    const cargoEvt = {
      type: "drawBatch", uid: a1, side: "ally", count: 2,
      cards: [mkCard("杀（普攻）"), mkCard("闪")],
    };
    const B = await runEvent(page, cargoEvt, uids);
    total += 1; pass += check("B1 物资货物 drawBatch 产生飞行动画", B.count >= 1, B);
    if (B.count >= 1) {
      const near = nearestArt(B.first, B.artCenters);
      total += 1; pass += check(
        `B2 物资货物起点不是角色头像（距 ${near.d.toFixed(0)}px）`,
        near.d > NEAR, { first: B.first, near });
    }

    // C 战争号角（饰品）：drawRandomSlash，走 drawBatch
    const hornEvt = {
      type: "drawBatch", uid: a0, side: "ally", count: 1, cards: [mkCard("杀（普攻）")],
    };
    const C = await runEvent(page, hornEvt, uids);
    total += 1; pass += check("C1 战争号角 drawBatch 产生飞行动画", C.count >= 1, C);
    if (C.count >= 1) {
      const near = nearestArt(C.first, C.artCenters);
      total += 1; pass += check(
        `C2 战争号角起点不是角色头像（距 ${near.d.toFixed(0)}px）`,
        near.d > NEAR, { first: C.first, near });
    }

    // D 对照：真实角色间移牌仍走头像且背面——证明改动在位
    const giveEvt = {
      type: "giveCards", fromUid: a0, fromSide: "ally",
      toUid: a1, toSide: "ally", count: 1, cards: [mkCard("杀（普攻）")],
    };
    const D = await runEvent(page, giveEvt, uids);
    total += 1; pass += check("D1 对照 giveCards 产生飞行动画", D.count >= 1, D);
    if (D.count >= 1) {
      const d0 = Math.hypot(D.first.x - D.artCenters[a0].x, D.first.y - D.artCenters[a0].y);
      const d1 = Math.hypot(D.last.x - D.artCenters[a1].x, D.last.y - D.artCenters[a1].y);
      total += 1; pass += check(`D2 对照起点=来源头像 (偏差${d0.toFixed(0)}px)`,
        d0 <= NEAR, { first: D.first, from: D.artCenters[a0], d: d0 });
      total += 1; pass += check(`D3 对照终点=目标头像 (偏差${d1.toFixed(0)}px)`,
        d1 <= NEAR, { last: D.last, to: D.artCenters[a1], d: d1 });
      total += 1; pass += check("D4 对照全程背面", D.alwaysBack && !D.everFront,
        { cls: D.cls, everFront: D.everFront });
    }

    total += 1; pass += check("E 无页面错误", errors.length === 0, errors);
  } catch (err) {
    console.log("EXCEPTION", err && err.message);
    total += 1;
  } finally {
    await browser.close();
    console.log(`\n通过 ${pass} / ${total}`);
    process.exit(pass === total ? 0 : 1);
  }
})();
