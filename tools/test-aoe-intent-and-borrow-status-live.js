// 实战：群体【杀】杀意消耗全覆盖 + 借刀杀人「状态牌/被控」补测
//
// 背景（玩家反馈）：
//   1) 罗卡尔【狂风绝息斩】把群体【杀】也卷进去；
//   2) 【机枪扫杀】这类 AOE 杀仍扣杀意 —— 要求「检查所有 AOE 杀」；
//   3) 【借刀杀人】指定「有状态牌」的队友会卡死。
//
// 前两个已有 test-lokar-ultimate-and-aoe-intent-live.js 覆盖（机枪扫杀/流星杀/
// 疯狂射击）。本文件补齐「其余所有 AOE 杀来源」与借刀杀人的状态牌分支：
//   · 疯狂屠戮（虚拟【机枪扫杀】）
//   · 战场扫射（fromEntity 机枪扫杀 + allTargets）
//   · 无限暗刃（fromEntity 机枪扫杀 + allTargets）
//   · 兽人「火力压制」把单体杀转成机枪扫杀
//   · 借刀杀人：队友手牌含状态牌 / 全为状态牌 / 被控且含状态牌
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "✅" : "❌"} ${name}${detail ? `  ← ${detail}` : ""}`);
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e.message || e)));
  await startRegressionBattle(page);
  // 用例之间必须彻底隔离：前一个用例可能留下 resume（疯狂屠戮/魔王军入侵等
  // 多段续作）或手牌残留，会让后续用例的点击静默失效，出现假红。
  const reset = () => page.evaluate(() => {
    const st = window.state, b = st.battle;
    b.enemies.forEach(u => { u.hand = []; u.noResponse = true; });
    Object.assign(b, {
      locked: false, animQueue: [], handReveal: null, comboPartnerUid: null,
      crazySlaughterResume: null, demonInvasionResume: null,
      comboAttackResume: null, greenGatlingResume: null,
      bakarInvasionCapture: null,
    });
    b.allies.forEach(u => { u.hand = []; u.statuses = []; u.skipPlayPhase = false; });
    st.log = [];
    window.render();
  });

  console.log("\n【一】判据层：所有 AOE 杀都被判为群体【杀】、不被判为单体【杀】");
  const r1 = await page.evaluate(() => {
    const C = window.CardUtils;
    const mk = {
      "机枪扫杀（实体）": C.fromEntity("机枪扫杀"),
      "机枪扫杀（allTargets）": C.fromEntity("机枪扫杀", { allTargets: ["e0", "e1"] }),
      "疯狂屠戮虚拟牌": C.fromEntity("机枪扫杀", { _skipHandMove: true }),
      "战场扫射产物": C.fromEntity("机枪扫杀", {
        allTargets: ["e0", "e1"], aoeLineShown: true, responseKind: "dodge",
      }),
      "火力压制转化": C.convertAs("机枪扫杀", { suit: "♠", name: "杀（普攻）" }),
    };
    return Object.entries(mk).map(([label, card]) => ({
      label,
      group: !!C.isGroupKillCard(card),
      single: !!C.isSingleKill(card),
      sweep: !!card.sweep,
    }));
  });
  r1.forEach(row => {
    check(`${row.label} → 群体杀=true / 单体杀=false`,
      row.group && !row.single, `group=${row.group} single=${row.single}`);
  });
  check("对照组：实体单体杀仍判为单体杀", await page.evaluate(() => {
    const c = window.CardUtils.fromEntity("杀（普攻）");
    return !!window.CardUtils.isSingleKill(c) && !window.CardUtils.isGroupKillCard(c);
  }));

    await reset();
  await reset();
  console.log("\n【二】行为层：实体全体【杀】不消耗杀意（含技能转化产物）");
  const r2 = await page.evaluate(() => {
    const st = window.state, b = st.battle, a = b.allies[0];
    b.enemies.forEach(u => { u.hand = []; u.noResponse = true; });
    b.activeUid = a.uid; b.phase = 4; b.locked = false; b.animQueue = [];
    b.handReveal = null; st.log = [];
    a.intent = 3;
    const run = card => {
      a.intent = 3;
      a.hand = [card];
      const ok = window.BattleSystem.playActiveCard(st, 0);
      const after = a.intent;
      b.locked = false; b.animQueue = []; b.handReveal = null;
      a.hand = [];
      return { ok, after };
    };
    const C = window.CardUtils;
    const entitySweep = C.fromEntity("机枪扫杀");
    delete entitySweep.virtual;              // 还原为实体牌（data-cards 原牌本就不带 virtual）
    const converted = C.convertAs("机枪扫杀", { suit: "♠", name: "杀（普攻）" });
    return {
      sweep: run(entitySweep),
      converted: run(converted),
      convertedVirtual: !!converted.virtual,
      sweepVirtual: !!entitySweep.virtual,
    };
  });
  check("实体【机枪扫杀】不消耗杀意", r2.sweep.after === 3, `杀意=${r2.sweep.after}`);
  check("技能转化的实体【机枪扫杀】不消耗杀意（火力压制范式）",
    r2.converted.after === 3 && !r2.convertedVirtual,
    `杀意=${r2.converted.after} virtual=${r2.convertedVirtual}`);
  check("对照组：两者都是群体杀且非虚拟（用例确实走杀意链路）",
    r2.convertedVirtual === false && r2.sweepVirtual === false,
    `sweepVirtual=${r2.sweepVirtual} convertedVirtual=${r2.convertedVirtual}`);

// 借刀杀人的三种「状态牌 / 被控」分支另起一个文件
  // （test-borrow-slash-status-cards-live.js），每个分支独立开一局：
  // 此前与 AOE 用例共用一局时会被前一个用例的残留污染，点击静默失效，出现假红。


  console.log(`\n合计 ${pass} 通过 / ${fail} 失败   页面错误 ${errors.length}`);
  if (errors.length) console.log(errors.slice(0, 3));
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
