// 实战：兽人「火力压制」真实路径的杀意口径
//
// 为什么单独开一个文件：
//   test-aoe-intent-and-borrow-status-live.js 里那条「火力压制范式」是手工
//   给卡牌打上 noIntentCost 构造出来的，根本不经过 demon_beast_unit 的转化代码，
//   撤掉任何真实实现它都是绿的 —— 属于恒绿用例。本文件走真实 AI 分支。
//
// 设定依据（data-future-orc-enemies.js）：
//   火力压制：锁定技，你使用的【杀（普攻）】视为【机枪扫杀】；
//   转化为全体【杀】后不消耗杀意。
//
// 收窄背景：此处原用「任意单体杀」判定，会把火杀/雷杀/魔杀/毒杀/刺杀等一并
//   转为全体杀并免杀意，导致杀意为 0 时该单位仍能连续出杀，与「低杀意群体杀牌
//   单位」（杀意上限 1）的定位相悖。现只认【杀（普攻）】。
//
// 关键时序：攻击流程先 spendIntent 再走 prepareSlash，转化发生在扣杀意之后，
// 因此牌上打标来不及，改由 suppressionFreeIntent 预判。本文件即锁死这条时序。
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
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_BIN || undefined,
    args: ["--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e.message || e)));
  await startRegressionBattle(page);

  const reset = () => page.evaluate(() => {
    const st = window.state, b = st.battle;
    Object.assign(b, {
      locked: false, animQueue: [], handReveal: null, comboPartnerUid: null,
      crazySlaughterResume: null, demonInvasionResume: null,
      comboAttackResume: null, greenGatlingResume: null,
      bakarInvasionCapture: null,
    });
    b.enemies.forEach(u => { u.hand = []; u.noResponse = true; u.hp = 60; });
    b.allies.forEach(u => { u.hand = []; u.statuses = []; u.skipPlayPhase = false; });
    st.log = [];
  });

  const run = (ai, entityName) => page.evaluate(([ai, entityName]) => {
    const st = window.state, b = st.battle, a = b.allies[0];
    const card = window.CardUtils.fromEntity(entityName);
    delete card.virtual;
    const target = b.enemies.find(u => u.hp > 0);
    const hpBefore = b.enemies.map(u => u.hp);
    const aliveBefore = b.enemies.filter(u => u.hp > 0).length;
    a.ai = ai; a.intent = 3; a.hand = [card];
    b.activeUid = a.uid; b.phase = 4;
    const ok = window.BattleSystem.useCard(st, a, target, card);
    const res = {
      ok: ok !== false,
      intent: a.intent,
      hpBefore, hpAfter: b.enemies.map(u => u.hp), aliveBefore,
      suppression: (st.log || []).some(l => /火力压制触发/.test(l)),
      freeLog: (st.log || []).some(l => /不消耗杀意/.test(l)),
      costLog: (st.log || []).some(l => /杀意消耗/.test(l)),
    };
    Object.assign(b, { locked: false, animQueue: [], handReveal: null });
    a.hand = []; a.ai = null;
    return res;
  }, [ai, entityName]);

  console.log("\n【一】火力压制：单体杀转全体杀，且不消耗杀意（技能文本）");
  await reset();
  const r1 = await run("demon_beast_unit", "杀（普攻）");
  check("火力压制真实触发（日志命中）", r1.suppression, `suppression=${r1.suppression}`);
  check("转化后打到全部存活敌人（AOE 生效）",
    r1.aliveBefore > 1 && r1.hpAfter.filter((hp, i) => hp < r1.hpBefore[i]).length === r1.aliveBefore,
    `hpBefore=${r1.hpBefore} hpAfter=${r1.hpAfter}`);
  check("转化产物不消耗杀意（3 → 3）", r1.intent === 3 && r1.freeLog && !r1.costLog,
    `杀意=${r1.intent} freeLog=${r1.freeLog} costLog=${r1.costLog}`);

  console.log("\n【二】对照组：不该免费的仍要扣");
  await reset();
  const r2 = await run(null, "杀（普攻）");
  check("非猛兽部队的单体杀仍消耗1点杀意（3 → 2）",
    r2.intent === 2 && r2.costLog, `杀意=${r2.intent} costLog=${r2.costLog}`);
  check("对照组：未触发火力压制", !r2.suppression, `suppression=${r2.suppression}`);

  await reset();
  const r3 = await run("demon_beast_unit", "机枪扫杀");
  check("手牌打出的实体【机枪扫杀】仍消耗1点杀意（设定：不因 AOE 免费）",
    r3.intent === 2 && r3.costLog, `杀意=${r3.intent} costLog=${r3.costLog}`);

  await reset();
  const r4 = await run("demon_beast_unit", "杀（普攻）");
  check("重复验证：火力压制口径稳定", r4.intent === 3 && r4.freeLog, `杀意=${r4.intent}`);

  // 可打出性：杀意耗尽后，除【杀（普攻）】（文本承诺转化后免杀意）外一律不可再出。
  const playable = (intent, entityName) => page.evaluate(([intent, entityName]) => {
    const st = window.state, b = st.battle, a = b.allies[0];
    b.locked = false; b.animQueue = []; b.handReveal = null;
    b.enemies.forEach(u => { u.hand = []; u.noResponse = true; u.hp = 60; });
    b.allies.forEach(u => { u.hand = []; u.statuses = []; });
    a.ai = "demon_beast_unit"; a.intent = intent;
    b.activeUid = a.uid; b.phase = 4;
    const card = window.CardUtils.fromEntity(entityName);
    delete card.virtual;
    a.hand = [card];
    const ok = window.BattleSystem.canPlay(a, card);
    a.hand = []; a.ai = null;
    return ok;
  }, [intent, entityName]);

  console.log("\n【三】收窄：只有【杀（普攻）】被压制转化，其余单体杀维持单体");
  for (const other of ["火杀", "魔杀", "毒杀", "刺杀"]) {
    await reset();
    const ro = await run("demon_beast_unit", other);
    check(`${other} 不触发火力压制（仍单体）`,
      !ro.suppression && ro.hpAfter.filter((hp, i) => hp < ro.hpBefore[i]).length === 1,
      `suppression=${ro.suppression} hpBefore=${ro.hpBefore} hpAfter=${ro.hpAfter}`);
  }

  console.log("\n【四】杀意耗尽后不再连续出杀（杀意上限 1 的定位）");
  await reset();
  check("杀意=0：【杀（普攻）】可出（文本承诺转化后免杀意）",
    await playable(0, "杀（普攻）") === true);
  for (const other of ["火杀", "魔杀", "毒杀", "刺杀"]) {
    check(`杀意=0：${other} 不可出（未被压制转化，需消耗杀意）`,
      await playable(0, other) === false);
  }
  check("杀意=1：各类单体杀均可出",
    await playable(1, "火杀") === true && await playable(1, "魔杀") === true);

  console.log(`\n合计 ${pass} 通过 / ${fail} 失败   页面错误 ${errors.length}`);
  if (errors.length) console.log("页面错误:", errors.slice(0, 3));
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
