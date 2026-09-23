// 专项实战：头像徽章不得遮挡「手牌数/手牌上限」（真实浏览器 + 真实 DOM 测量）
//   曾出现：机械AI龙【死亡音波】徽章（bottom:4px）与梅尔卡坦克【炮弹】徽章（top:70px）
//   压在左下角 .unit-hand（left:3px bottom:3px）之上，手牌数被盖住。
//   修复：两者统一移到头像上方；大头像面板 overflow:hidden 需改用面板内 top，否则会被裁剪。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

function check(name, cond, extra) {
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return cond ? 1 : 0;
}

const tpl = `(() => {
  const b = window.state.battle;
  const dragon = b.enemies[0];
  dragon.ai = "ruins_dragon"; dragon.name = "机械AI龙";
  dragon.ruinsDeathWaveSuits = ["♥", "♦", "♠"]; dragon.ruinsDeathWaveSuit = null;
  const tank = b.enemies[1];
  tank.name = "梅尔卡坦克"; tank.ruinsTankShellReady = true;
  window.render();

  const rect = el => { if (!el) return null; const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
  const overlapArea = (a, c) => {
    if (!a || !c) return null;
    const ox = Math.max(0, Math.min(a.x + a.w, c.x + c.w) - Math.max(a.x, c.x));
    const oy = Math.max(0, Math.min(a.y + a.h, c.y + c.h) - Math.max(a.y, c.y));
    return { ox, oy, hit: ox > 0 && oy > 0 };
  };
  // 徽章所属容器内的手牌数元素
  const ownHand = badge => {
    if (!badge) return null;
    const box = badge.closest(".unit-frame") || badge.closest(".active-portrait-shell");
    const h = box ? box.querySelector(".unit-hand") : null;
    return h ? Object.assign(rect(h), { text: h.textContent.trim() }) : null;
  };
  const out = {};

  // --- 战场单位：死亡音波 ---
  const dw = document.querySelector(".unit-frame .death-wave-badge");
  out.dw = rect(dw);
  out.dwHand = ownHand(dw);
  out.dwOverlap = overlapArea(out.dw, out.dwHand);
  // 徽章须在头像上方：底边不高于手牌顶边，且整体位于 frame 上半部
  const frame = dw ? dw.closest(".unit-frame") : null;
  out.frame = frame ? rect(frame) : null;
  if (out.dw && out.frame) {
    out.dwAbove = out.dw.y + out.dw.h <= out.frame.y + 24;
    out.dwInViewport = out.dw.y >= 0;
  }
  out.dwText = dw ? dw.textContent.trim() : null;

  // --- 战场单位：炮弹标记 ---
  const ts = document.querySelector(".unit-frame .tank-shell-badge");
  out.ts = rect(ts);
  out.tsHand = ownHand(ts);
  out.tsOverlap = overlapArea(out.ts, out.tsHand);
  const tframe = ts ? ts.closest(".unit-frame") : null;
  out.tframe = tframe ? rect(tframe) : null;
  if (out.ts && out.tframe) {
    out.tsAbove = out.ts.y + out.ts.h <= out.tframe.y + 24;
    out.tsInViewport = out.ts.y >= 0;
  }
  out.tsText = ts ? ts.textContent.trim() : null;

  // --- 大头像面板（overflow:hidden）：死亡音波不得被裁剪 ---
  const prev = b.activeUid;
  b.activeUid = dragon.uid;
  window.render();
  const shell = document.querySelector(".active-portrait-shell");
  out.shell = rect(shell);
  out.shownIsDragon = shell ? shell.getAttribute("data-active-info") === dragon.uid : false;
  if (shell) {
    const sdw = shell.querySelector(".death-wave-badge");
    out.shellDw = rect(sdw);
    out.shellHand = ownHand(sdw);
    out.shellOverlap = overlapArea(out.shellDw, out.shellHand);
    if (out.shellDw && out.shell) {
      // 被裁剪判定：顶边低于面板顶边即被 overflow:hidden 切掉
      out.shellDwClipped = out.shellDw.y < out.shell.y;
      out.shellDwInside = out.shellDw.x >= out.shell.x
        && out.shellDw.x + out.shellDw.w <= out.shell.x + out.shell.w;
    }
    const sts = shell.querySelector(".tank-shell-badge");
    out.shellTs = rect(sts);
  }
  b.activeUid = prev;
  window.render();
  return out;
})()`;

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", e => errors.push(String(e)));
  await startRegressionBattle(page);

  let pass = 0, total = 0;
  const T = (n, c, x) => { total++; pass += check(n, c, x); };

  const r = await page.evaluate(tpl);
  console.log("实测:", JSON.stringify({
    dw: r.dw, dwHand: r.dwHand, dwOverlap: r.dwOverlap,
    ts: r.ts, tsHand: r.tsHand, tsOverlap: r.tsOverlap,
    shellDw: r.shellDw, shellHand: r.shellHand, shellOverlap: r.shellOverlap,
  }));
  console.log("--- 徽章不得遮挡手牌数 ---");

  T("死亡音波徽章已渲染", !!r.dw && r.dwText.indexOf("音波") === 0, r.dwText);
  T("死亡音波不遮挡手牌数", r.dwOverlap && r.dwOverlap.hit === false, r.dwOverlap);
  T("死亡音波位于头像上方", r.dwAbove === true, { dw: r.dw, frame: r.frame });
  T("死亡音波未被视口裁掉", r.dwInViewport === true, r.dw);

  T("炮弹徽章已渲染", !!r.ts && r.tsText.indexOf("炮弹") === 0, r.tsText);
  T("炮弹不遮挡手牌数", r.tsOverlap && r.tsOverlap.hit === false, r.tsOverlap);
  T("炮弹位于头像上方", r.tsAbove === true, { ts: r.ts, frame: r.tframe });
  T("炮弹未被视口裁掉", r.tsInViewport === true, r.ts);

  T("大头像显示的是机械龙", r.shownIsDragon === true, r.shownIsDragon);
  T("大头像内音波徽章已渲染", !!r.shellDw, r.shellDw);
  T("大头像内音波不遮挡手牌数", r.shellOverlap && r.shellOverlap.hit === false, r.shellOverlap);
  T("大头像内音波未被 overflow 裁剪", r.shellDwClipped === false,
    { shellDw: r.shellDw, shell: r.shell });
  T("大头像内音波横向未溢出", r.shellDwInside === true, { shellDw: r.shellDw, shell: r.shell });
  T("页面无 JS 错误", errors.length === 0, errors.slice(0, 3));

  console.log(`\n=== ${pass}/${total} 通过 ===`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})();
