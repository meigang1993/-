// 专项：【物资补给】多人队伍（2/3/4 人）逐个角色打出的摸牌动画检查
//
// 背景：用户报告"使用者自己摸牌没有飞入动画，其他角色都有"。此前测试只覆盖
// 2 人队伍且只由 allies[0] 打出，无法排除"队伍规模"或"打出者身份"的影响。
// 本用例把队伍补到 4 人，并让**每个角色**各打一次物资补给，逐次检查：
//   · 每个存活友方都有自己那一份飞牌（总数 == 存活人数 × 每张摸牌数）
//   · 每一张牌都真的发生了位移（防"元素创建了但没动"）
//   · 打出者本人那一份也在其中（用户报告的可疑点）
//
// 防假通过：
//  1) 断言飞行元素**创建数**（hook 运行时调用的 BattleEffectCardDOM.back），
//     而不是某一瞬间的 DOM 快照——快照会漏掉短时元素；
//  2) 逐个角色遍历，而不是只测 allies[0]；
//  3) 每张牌都断言位移 > 20px，防止"创建了但原地不动"被算作通过。
//
// 构造陷阱（实测，改动前务必知悉）：
//  在驱动前强改 battle.phase / battle.activeUid 会让 drain 循环停摆——
//  队列不清空、draining 恒为 true、飞行元素一个都不创建，看起来极像
//  "摸牌动画丢失"，实际是测试构造把动画管线卡死了。本用例因此**不**改
//  phase / activeUid，只补牌堆与清空手牌。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const TEAM = Number(process.env.SUPPLY_TEAM || 4);
const DRAW = 2;

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass += 1; console.log(`✅ ${name}${extra ? " — " + extra : ""}`); }
  else { fail += 1; console.log(`❌ ${name}${extra ? " — " + extra : ""}`); }
}

// 把队伍补到 n 人（以 allies[0] 为模板克隆，仅改 uid/name/手牌/牌堆）
async function growTeam(page, n) {
  return page.evaluate(`(() => {
    const b = window.state.battle, base = b.allies[0];
    let i = b.allies.length;
    while (b.allies.length < ${n}) {
      const c = JSON.parse(JSON.stringify(base));
      c.uid = "a" + i;
      i += 1;
      c.name = "友方" + c.uid;
      c.hand = [];
      c.statuses = [];
      c.pileStats = { deck: [], discard: [], consumed: [] };
      b.allies.push(c);
    }
    return b.allies.map(a => a.uid);
  })()`);
}

// 打出一次物资补给，返回本次的动画与飞行元素数据
async function driveOnce(page, actorIndex) {
  return page.evaluate(`(() => {
    const state = window.state, b = state.battle;
    // 只补牌堆/清手牌；不动 phase 与 activeUid（见文件头"构造陷阱"）
    b.locked = false; b.animQueue = []; b.reactionQueue = [];
    window.BattleLog.clear(state);
    const actor = b.allies[${actorIndex}];
    actor.hp = 999; actor.maxHp = 999;
    b.allies.forEach(a => {
      a.pileStats = a.pileStats || {};
      a.pileStats.deck = a.pileStats.deck || [];
      while (a.pileStats.deck.length < 10) {
        a.pileStats.deck.push(
          window.CardUtils.fromEntity("杀（普攻）", { virtual: false }));
      }
      a.hand = [];
    });
    window.__fly = [];
    // 只基于**最初**的实现包装一层：每次驱动都重新包装会把 hook 叠成多层，
    // 第 n 次驱动时每个元素被记 n 遍（实测第 2/3/4 次变成 16/24/32），
    // 那是测试自身的假象，不是动画真的翻倍。
    window.__origBack = window.__origBack || window.BattleEffectCardDOM.back;
    const origBack = window.__origBack;
    window.BattleEffectCardDOM.back = function (data, enemy, cls) {
      const el = origBack.call(this, data, enemy, cls);
      try {
        const rec = { cls, el, start: null, move: 0, last: null };
        window.__fly.push(rec);
        requestAnimationFrame(() => {
          const r = el.getBoundingClientRect();
          rec.start = { x: Math.round(r.x + r.width / 2),
            y: Math.round(r.y + r.height / 2) };
          rec.last = rec.start;
        });
      } catch (e) { /* 元素已脱离文档则忽略 */ }
      return el;
    };
    window.__samp = setInterval(() => {
      window.__fly.forEach(rec => {
        if (!rec.el || !rec.el.isConnected || !rec.start) return;
        const r = rec.el.getBoundingClientRect();
        const c = { x: Math.round(r.x + r.width / 2),
          y: Math.round(r.y + r.height / 2) };
        const d = Math.hypot(c.x - rec.start.x, c.y - rec.start.y);
        if (d > rec.move) { rec.move = d; rec.last = c; }
        // 遮挡探测：飞行元素多为 pointer-events:none，elementsFromPoint 会直接
        // 穿透它，所以临时打开再取栈——若栈顶不是飞行元素本身，说明它被
        // 别的层（典型：底部手牌面板）盖住了，玩家就会觉得"没有飞入动画"。
        if (!rec.occl && d > 60) {
          const old = rec.el.style.pointerEvents;
          rec.el.style.pointerEvents = "auto";
          const stack = document.elementsFromPoint(c.x, c.y).slice(0, 3)
            .map(n => (n.tagName + "." + String(n.className || "").split(" ")[0])
              .slice(0, 28));
          rec.el.style.pointerEvents = old;
          rec.occl = { at: c, top: stack[0], stack,
            visible: String(stack[0]).includes("card-flight") };
        }
      });
    }, 16);
    window.BattleSystem.useCard(state, actor, null,
      window.CardUtils.fromEntity("物资补给", { virtual: false }));
    try { window.BattleEffects.recover(window.state); } catch (e) {}
    try { window.render?.(); } catch (e) {}
    const q = b.animQueue || [];
    return {
      alive: b.allies.filter(a => a.hp > 0).length,
      types: q.map(e => e && e.type),
      groups: q.filter(e => e && e.type === "drawGroup")
        .map(g => (g.batches || []).map(x => ({ uid: x.uid, count: x.count }))),
      hands: b.allies.map(a => (a.hand || []).length),
    };
  })()`);
}

async function collect(page) {
  await page.waitForTimeout(2200);
  return page.evaluate(`(() => {
    clearInterval(window.__samp);
    const origBack = window.__fly;
    return {
      created: origBack.length,
      moves: origBack.map(r => Math.round(r.move)),
      ends: origBack.map(r => r.last),
      occl: origBack.map(r => r.occl || null),
      hands: window.state.battle.allies.map(a => (a.hand || []).length),
      queue: (window.state.battle.animQueue || []).map(e => e.type),
    };
  })()`);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await startRegressionBattle(page);

  const uids = await growTeam(page, TEAM);
  console.log(`队伍 ${uids.length} 人：${uids.join(",")}`);
  check("前置：队伍人数符合预期", uids.length === TEAM, `${uids.length}`);

  for (let i = 0; i < TEAM; i += 1) {
    const r = await driveOnce(page, i);
    const c = await collect(page);
    const expect = TEAM * DRAW;
    console.log(`--- 由 ${uids[i]} 打出 ---`);
    console.log(`  队列 ${JSON.stringify(r.types)} · drawGroup batches `
      + `${JSON.stringify(r.groups)}`);
    console.log(`  飞行元素 ${c.created}（期望 ${expect}）· 位移 `
      + `${JSON.stringify(c.moves)}`);
    console.log(`  遮挡探测 `
      + `${JSON.stringify(c.occl.map(o => o && { at: o.at, top: o.top, vis: o.visible }))}`);
    check(`${uids[i]}：只产生 1 条 drawGroup 且 batches == 存活人数`,
      r.groups.length === 1 && (r.groups[0] || []).length === TEAM,
      `groups=${r.groups.length} batches=${(r.groups[0] || []).length}`);
    check(`${uids[i]}：飞行元素数 == 人数 × ${DRAW}`,
      c.created === expect, `实际 ${c.created}`);
    // 阈值取 100px：修复前紧邻牌堆的友方只飞 73px，肉眼几乎看不出飞入，
    // 这正是"使用者自己没有飞入动画"的来源。低于 100 就失去可辨识度。
    check(`${uids[i]}：每张牌都有可辨识的飞行距离（> 100px）`,
      c.moves.length === expect && c.moves.every(m => m > 100),
      JSON.stringify(c.moves));
    check(`${uids[i]}：每个存活友方都摸到 ${DRAW} 张`,
      c.hands.every(h => h === DRAW), JSON.stringify(c.hands));
    check(`${uids[i]}：动画结束后队列已清空（无卡死）`,
      c.queue.length === 0, JSON.stringify(c.queue));
  }

  check("无页面错误", errors.length === 0, errors.slice(0, 2).join(" | "));
  console.log(`\n通过 ${pass} / 失败 ${fail}`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
