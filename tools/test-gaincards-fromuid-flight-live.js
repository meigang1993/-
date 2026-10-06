// 角色间「获得牌」是否走头像飞行
// 关注点：
//   A) gainCards 带 fromUid 且来源≠本人（知识吸收/捕获入侵修复后）→ 起点终点=头像、全程背面
//   B) gainCards 不带 fromUid（从牌堆/公共区获得，如武器库、影舞步）→ 仍从牌堆起飞、仍翻正面
//   C) 静态核对：凯瑟琳知识吸收、巴卡尔捕获入侵 两处推送确实带 fromUid
// 目的：此前这两处是真遗漏——它们是角色间获得牌，却因事件缺 fromUid
//       被 isUnitTransfer 判为 false，起点退回牌堆/公共区而非来源角色头像。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

function check(name, cond, extra) {
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return cond ? 1 : 0;
}

const NEAR = 60;   // 头像中心允许的像素误差
const FAR = 60;    // 判定"不是头像"的最小距离

async function runCase(page, withFrom) {
  return page.evaluate(async ({ withFrom, NEAR, FAR }) => {
    const center = el => {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };
    const unitArt = uid => document.querySelector(`[data-target="${uid}"] .unit-art`);
    const st = window.state, b = st.battle;
    const ally = b.allies.find(u => u.hp > 0);
    const other = b.allies.find(u => u.hp > 0 && u.uid !== ally.uid);
    if (!ally || !other) return { err: "no-units" };
    const fromEl = unitArt(other.uid), toEl = unitArt(ally.uid);
    if (!fromEl || !toEl) return { err: "no-avatar" };
    const fromC = center(fromEl), toC = center(toEl);

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
    const evt = {
      type: "gainCards", uid: ally.uid, side: "ally", count: 1, cards: [card],
    };
    if (withFrom) { evt.fromUid = other.uid; evt.fromSide = "ally"; }
    b.animQueue = b.animQueue || [];
    b.animQueue.push(evt);
    await new Promise(r => setTimeout(r, 2200));
    clearInterval(timer);

    const recs = [...tracks.values()];
    if (!recs.length) return { err: "no-flight" };
    const rec = recs[0];
    const first = rec.pts[0], last = rec.pts[rec.pts.length - 1];
    const dist = (a, c) => Math.hypot(a.x - c.x, a.y - c.y);
    return {
      startDistFromAvatar: Math.round(Math.min(dist(first, fromC), dist(first, toC))),
      endDistToAvatar: Math.round(dist(last, toC)),
      nearestAvatarAtStart: Math.round(Math.min(dist(first, fromC), dist(first, toC))),
      everFront: rec.front.some(Boolean),
      everBack: rec.back.some(Boolean),
      moved: rec.pts.length > 1
        && Math.hypot(last.x - first.x, last.y - first.y) > 5,
      cls: rec.cls,
    };
  }, { withFrom, NEAR, FAR });
}

(async () => {
  let pass = 0, total = 0;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on("pageerror", e => errors.push(String(e)));
    await openGame(page);
    await startRegressionBattle(page);

    // A) 带 fromUid 的角色间获得 → 头像飞行 + 背面
    const a = await runCase(page, true);
    total++; pass += check("A1 带 fromUid 的 gainCards 产生飞行动画", !a.err, a);
    if (!a.err) {
      total++; pass += check("A2 起点=来源角色头像 (偏差0px)", a.startDistFromAvatar <= NEAR, a);
      total++; pass += check("A3 终点=获得者头像", a.endDistToAvatar <= NEAR, a);
      total++; pass += check("A4 全程背面（未翻正面）", a.everBack && !a.everFront, a);
      total++; pass += check("A5 确实发生位移", a.moved, a);
    }

    // B) 不带 fromUid（牌堆/公共区获得）→ 保持原起点、仍翻正面
    // A 跑完后队列驱动已停，需重开一局再推事件
    await page.reload();
    await openGame(page);
    await startRegressionBattle(page);
    const bcase = await runCase(page, false);
    total++; pass += check("B1 不带 fromUid 的 gainCards 仍产生飞行动画", !bcase.err, bcase);
    if (!bcase.err) {
      total++; pass += check("B2 起点不是角色头像（未被改成头像飞行）",
        bcase.nearestAvatarAtStart > FAR, bcase);
      total++; pass += check("B3 仍翻正面（未被改成背面）", bcase.everFront, bcase);
    }

    // C) 静态核对：两处技能推送确实带 fromUid
    const dir = path.join(__dirname, "..", "src", "original");
    const scan = (file, anchor) => {
      const s = fs.readFileSync(path.join(dir, file), "utf8");
      const i = s.lastIndexOf(anchor);
      if (i < 0) return null;
      // 推送在战报之前，需向前回溯查找
      const seg = s.slice(Math.max(0, i - 600), i);
      const j = seg.lastIndexOf("type: \"gainCards\"");
      if (j < 0) return null;
      return /fromUid/.test(seg.slice(j, j + 260));
    };
    total++; pass += check("C1 凯瑟琳【知识吸收】推送带 fromUid",
      scan("catherine-skills.js", "知识吸收触发") === true, { got: scan("catherine-skills.js", "知识吸收触发") });
    total++; pass += check("C2 巴卡尔【捕获入侵】推送带 fromUid",
      scan("bakar-core-skills.js", "魔王军统领触发") === true, { got: scan("bakar-core-skills.js", "魔王军统领触发") });

    total++; pass += check("D 无页面错误", errors.length === 0, errors.slice(0, 3));
  } finally {
    await browser.close();
  }
  console.log(`\n通过 ${pass} / ${total}`);
  process.exit(pass === total ? 0 : 1);
})();
