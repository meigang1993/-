// 专项：死亡动画只播一次 + 【疯狂射击】不再画指向自己的目标线
//
// 问题一（用户报）：角色死亡有时会播放 3 次死亡动画（含敌方角色）。
//   根因：ui-battle-units 在死亡且 deathAnimationPending 期间持续挂 death-anim，
//   而 app-render 用 setHTML 整块重建 DOM，death-anim 不在
//   app-render-preservation 的 repeatableEntryAnimations 白名单里，于是每次
//   重建都从 0% 重新播放。死亡结算常伴多条日志 → 多次 render → 多次重启。
//   实测禁掉续播后，重建瞬间 currentTime 从 117ms 归零（即重播）。
//   修法：preserveDeathAnim 按 uid 记录/写回 currentTime，动画跨重建续播。
//   判据不用 animationstart 计数 —— 该事件只看"动画对象是否新建"，
//   即使 currentTime 已写回也照样触发，会得出"仍播 3 次"的假象。
//
// 问题二（用户报）：疯狂射击选择后出现目标线，指向自己头像。
//   根因：疯狂射击是 target:"self"，pendingTargetUid 被设成自己；未选定红色
//   手牌时 convertedGroupAttack 为 false，走不到群体分支，落到单体兜底
//   setLine(card, 自己头像)。修复前沿线终点距自己头像仅 11px。
//   修法：单体兜底分支遇到 uid === actor.uid 直接 hideLine。
//
// 问题三（用户报）：删除"保留原牌"文案 —— 实际文案是"保留该牌原有花色"与
//   "保留原花色"，已从技能 text 与卡牌 text 中移除。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass += 1; console.log(`✅ ${name}${extra ? " — " + extra : ""}`); }
  else { fail += 1; console.log(`❌ ${name}${extra ? " — " + extra : ""}`); }
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await startRegressionBattle(page);

  // ---------- A：死亡动画跨整屏重建续播 ----------
  const death = await page.evaluate(`(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const state = window.state, b = state.battle;
    b.locked = false; b.animQueue = []; b.reactionQueue = [];
    const uid = b.enemies[0].uid;
    b.enemies[0].hp = 0;
    window.render();
    const read = () => {
      const el = document.querySelector('.unit.death-anim[data-target="' + uid + '"]');
      if (!el) return null;
      const anim = (el.getAnimations ? el.getAnimations() : [])
        .find(a => a.animationName === "deathFade");
      return anim ? Math.round(anim.currentTime) : null;
    };
    const before = read();
    await wait(150);
    const during = read();
    // 制造一次整屏 HTML 变化（死亡结算期真实的日志变化即属此类）
    window.BattleLog.add(state, "死亡结算附加日志");
    window.render();
    const afterRebuild = read();
    return { uid, before, during, afterRebuild };
  })()`);

  console.log(`--- 死亡动画 --- currentTime: 起 ${death.before} → 播中 ${death.during} → 重建后 ${death.afterRebuild}`);
  check("A1 死亡后动画确实启动", death.before === 0, `起始 ${death.before}`);
  check("A2 动画在推进（播中 > 0）", death.during > 0, `${death.during}ms`);
  check("A3 重建后不归零（核心：不重播）", death.afterRebuild > 0,
    `重建后 ${death.afterRebuild}ms`);
  check("A4 重建后进度连续（≥ 播中的 80%）",
    death.afterRebuild >= death.during * 0.8,
    `${death.during} → ${death.afterRebuild}`);

  // 动画结束后应收尾：death-anim 摘掉、pending 清空
  await page.waitForTimeout(1200);
  const settled = await page.evaluate(`(() => {
    const b = window.state.battle;
    return {
      pending: !!b.enemies[0].deathAnimationPending,
      hasAnim: !!document.querySelector(".unit.death-anim"),
      hasDead: !!document.querySelector(".unit.dead"),
    };
  })()`);
  check("A5 动画结束后 pending 已清空", !settled.pending);
  check("A6 动画结束后 death-anim 已摘除", !settled.hasAnim);
  check("A7 单位仍保持死亡态（未被误复活）", settled.hasDead);

  // ---------- B：疯狂射击未选定手牌时不得画出指向自己的线 ----------
  const setup = `(() => {
    const state = window.state, b = state.battle;
    b.locked = false; b.animQueue = []; b.reactionQueue = [];
    const actor = b.allies[0];
    actor.ref = "carlos"; actor.hp = 999; actor.maxHp = 999;
    actor.usedCrazyShooting = false;
    actor.skills = [{ name: "疯狂射击", type: "active", icon: "⚔️",
      text: "疯狂射击", card: { name: "疯狂射击", type: "tactic",
        crazyShooting: true, targetless: true, icon: "⚔️", text: "疯狂射击" } }];
    actor.hand = [
      window.CardUtils.fromEntity("杀（普攻）", { suit: "♥", virtual: false }),
      window.CardUtils.fromEntity("杀（普攻）", { suit: "♠", virtual: false }),
    ];
    b.phase = 4; b.activeUid = actor.uid;
    b.selectedSkillCard = { name: "疯狂射击", type: "tactic",
      crazyShooting: true, targetless: true, icon: "⚔️", text: "疯狂射击" };
    b.pendingTargetUid = actor.uid;
    return actor.uid;
  })()`;

  const probe = `(activeUid => {
    const centers = {};
    document.querySelectorAll(".unit").forEach(el => {
      const r = el.getBoundingClientRect();
      centers[el.dataset.target] = {
        x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2),
      };
    });
    const parse = line => {
      const left = parseFloat(line.style.left) || 0;
      const top = parseFloat(line.style.top) || 0;
      const width = parseFloat(line.style.width) || 0;
      const m = /rotate\\(([-\\d.]+)rad\\)/.exec(line.style.transform || "");
      const rad = m ? parseFloat(m[1]) : 0;
      return { x: Math.round(left + width * Math.cos(rad)),
        y: Math.round(top + width * Math.sin(rad)) };
    };
    const nearest = pt => {
      let best = null, bd = 1e9;
      Object.entries(centers).forEach(([uid, c]) => {
        const d = Math.hypot(c.x - pt.x, c.y - pt.y);
        if (d < bd) { bd = d; best = uid; }
      });
      return { uid: best, dist: Math.round(bd) };
    };
    const aoe = [...document.querySelectorAll(".target-line.aoe-line")];
    const main = document.querySelector(".target-line:not(.aoe-line)");
    const mainShown = !!main && main.classList.contains("show");
    const ends = [
      ...aoe.map(parse),
      ...(mainShown ? [parse(main)] : []),
    ].map(pt => ({ ...pt, near: nearest(pt) }));
    return {
      activeUid,
      ends,
      selfEnds: ends.filter(e => e.near.uid === activeUid && e.near.dist <= 40),
      enemyEnds: ends.filter(e => String(e.near.uid || "").startsWith("e")),
    };
  })($1)`;

  // B：未选定红色手牌（selectedCardIndex = null）
  await page.evaluate(setup.replace(
    "b.pendingTargetUid = actor.uid;",
    "b.pendingTargetUid = actor.uid; b.selectedCardIndex = null;"));
  await page.evaluate("window.render(); window.BattleEffects?.sync?.(window.state);");
  await page.waitForTimeout(200);
  const bRes = await page.evaluate(probe.replace("$1", "(window.state.battle.allies[0].uid)"));
  console.log(`--- 疯狂射击（未选定手牌）--- 线端点 ${bRes.ends.length} 个`);
  check("B1 未选定手牌时不画线指向自己头像",
    bRes.selfEnds.length === 0, JSON.stringify(bRes.selfEnds));
  check("B2 未选定手牌时完全没有多余目标线",
    bRes.ends.length === 0, `端点 ${bRes.ends.length}`);

  // C：选定红色手牌后，群体线仍应指向全体敌方（防止过度修复）
  await page.evaluate(setup.replace(
    "b.pendingTargetUid = actor.uid;",
    "b.pendingTargetUid = actor.uid; b.selectedCardIndex = 0;"));
  await page.evaluate("window.render(); window.BattleEffects?.sync?.(window.state);");
  await page.waitForTimeout(200);
  const cRes = await page.evaluate(probe.replace("$1", "(window.state.battle.allies[0].uid)"));
  console.log(`--- 疯狂射击（已选定红色手牌）--- 线端点 ${cRes.ends.length} 个`);
  check("C1 选定转化牌后仍绘制群体目标线", cRes.enemyEnds.length > 0,
    `指向敌方 ${cRes.enemyEnds.length} 条`);
  check("C2 群体线不含指向自己的端点", cRes.selfEnds.length === 0,
    JSON.stringify(cRes.selfEnds));

  // ---------- D：描述文案已移除 ----------
  const text = await page.evaluate(`(() => {
    const chars = window.GameDataCharactersCore || [];
    const hit = [];
    const collect = (obj, out) => {
      if (!obj) return out;
      if (typeof obj === "string") { out.push(obj); return out; }
      if (Array.isArray(obj)) { obj.forEach(v => collect(v, out)); return out; }
      if (typeof obj === "object") {
        Object.values(obj).forEach(v => collect(v, out));
      }
      return out;
    };
    collect(chars, hit);
    const joined = hit.join("|");
    return {
      hasCrazy: joined.includes("疯狂射击"),
      keepText: /保留原牌|保留原花色|保留该牌原有花色/.test(joined),
      sample: joined.match(/将1张红色手牌[^|]*/)?.[0] || "",
    };
  })()`);
  check("D1 角色数据可读取（前置）", text.hasCrazy);
  check("D2 描述中已无『保留原牌/保留原花色』文案", !text.keepText);
  if (text.sample) console.log(`   现行文案：${text.sample}`);

  check("E1 页面无 JS 错误", errors.length === 0, errors.slice(0, 2).join(" | "));

  await browser.close();
  console.log(`\n总计 ${pass + fail} 项，通过 ${pass}，失败 ${fail}`);
  process.exit(fail ? 1 : 0);
})();
