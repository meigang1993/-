// 专项：【疯狂射击】转化出的【机枪扫杀】不消耗杀意
//
// 疯狂射击（卡洛斯主动技）：将 1 张红色手牌当【机枪扫杀】使用，并保留
// 该牌原有花色。本次改动新增"由此转化出的【机枪扫杀】不消耗杀意"。
//
// 实现方式：convertAs 的 extra 带 noIntentCost:true，由 spendIntent 内
//   hasNoIntentCost 读取；判定先于狂战标记抵扣，故不会白白吃掉狂战标记。
//
// 判据（可证伪）：
//   · 疯狂射击发动成功（日志出现"转化为机枪扫杀"）
//   · 敌方确实受到伤害  —— 防止"技能压根没打出、所以没扣杀意"的假通过
//   · 杀意不减少        —— 核心断言
//
// 对照组：直接打出一张真正的【机枪扫杀】手牌，杀意应减少 1。
//   证明引擎确实对【机枪扫杀】收费，A 组的"不减"来自本次改动而非全局免费。
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

async function settle(page, maxMs = 20000) {
  const deadline = Date.now() + maxMs;
  let lastLen = -1, stable = 0;
  while (Date.now() < deadline) {
    await page.evaluate(`(() => {
      const el = document.querySelector(
        "[data-kaiichi-share-skip], [data-dimension-transfer-skip]");
      if (el) el.click();
      return true;
    })()`);
    const s = await page.evaluate(`(() => {
      const b = window.state.battle || {};
      return { locked: !!b.locked, anim: (b.animQueue || []).length,
        queue: (b.reactionQueue || b.pendingActions || []).length,
        len: (window.state.log || []).length };
    })()`);
    const quiet = !s.locked && !s.anim && !s.queue;
    if (quiet && s.len === lastLen) { stable += 1; if (stable >= 3) break; }
    else stable = 0;
    lastLen = s.len;
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(400);
}

// mode: "skill" 走疯狂射击；"raw" 直接打出真正的机枪扫杀（对照组）
async function drive(page, mode) {
  return page.evaluate(`(() => {
    const state = window.state, b = state.battle;
    b.locked = false; b.animQueue = []; b.reactionQueue = [];
    window.BattleLog.clear(state);
    const actor = b.allies[0];
    actor.ref = "carlos";
    actor.hp = 999; actor.maxHp = 999;
    actor.intent = 3; actor.intentMax = 5;
    actor.usedCrazyShooting = false;
    delete actor.rageMarks;
    // 技能归属：canResolve 要求该角色确实拥有【疯狂射击】主动技
    actor.skills = (actor.skills || []).filter(s => s.name !== "疯狂射击").concat([{
      name: "疯狂射击", type: "active", icon: "⚔️",
      text: "出牌阶段限一次，你可以将1张红色手牌当【机枪扫杀】使用，并保留该牌原有花色；由此转化出的【机枪扫杀】不消耗杀意。",
      card: { name: "疯狂射击", type: "tactic", crazyShooting: true,
        targetless: true, icon: "⚔️", text: "转化出的【机枪扫杀】不消耗杀意。" },
    }]);
    b.phase = 4; b.activeUid = actor.uid;
    // 敌方统一血量，便于统计伤害
    const enemies = b.enemies || [];
    enemies.forEach(e => { e.hp = 500; e.maxHp = 500; e.hand = []; });
    const hpBefore = enemies.map(e => e.hp);
    const enemyCount = enemies.length;

    // 手牌：索引 0 放一张红色牌（♥），疯狂射击选中它。
    // 必须 virtual:false —— battle-combat-attack-flow 里只有
    // isKillCard(card) && !card.virtual 才调 spendIntent，
    // virtual 牌根本不走杀意扣减，用它做对照会得出假结论。
    actor.hand = [
      window.CardUtils.fromEntity("杀（普攻）", { suit: "♥", virtual: false }),
      window.CardUtils.fromEntity("杀（普攻）", { suit: "♠", virtual: false }),
    ];
    if ("${mode}" === "raw") {
      // 对照组：手上直接就是一张真正的机枪扫杀（同样必须是实体牌）
      actor.hand = [
        window.CardUtils.fromEntity("机枪扫杀", { suit: "♠", virtual: false }),
        window.CardUtils.fromEntity("杀（普攻）", { suit: "♠", virtual: false }),
      ];
    }
    const intentBefore = actor.intent;
    const redIndex = 0;
    const redSuit = actor.hand[redIndex].suit;
    b.selectedCardIndex = redIndex;

    if ("${mode}" === "skill") {
      const card = { name: "疯狂射击", type: "tactic", crazyShooting: true,
        targetless: true, icon: "⚔️", text: "疯狂射击" };
      const canResolve = window.CharacterSkillAccess?.canResolve?.(
        state, actor, actor, card);
      window.BattleSystem.useCard(state, actor, actor, card);
      const logs = (window.state.log || []).map(l => l && (l.text || l.msg || l)) || [];
      return {
        mode: "${mode}", intentBefore, intentNow: actor.intent,
        hpBefore, hpNow: enemies.map(e => e.hp), enemyCount,
        redSuit, canResolve: !!canResolve,
        converted: logs.some(t => String(t).includes("转化为机枪扫杀")),
        freeLog: logs.some(t => String(t).includes("不消耗杀意")),
      };
    }
    const raw = actor.hand[0];
    window.BattleSystem.useCard(state, actor, actor, raw);
    const logs2 = (window.state.log || []).map(l => l && (l.text || l.msg || l)) || [];
    return {
      mode: "${mode}", intentBefore, intentNow: actor.intent,
      hpBefore, hpNow: enemies.map(e => e.hp), enemyCount,
      redSuit, canResolve: true,
      converted: logs2.some(t => String(t).includes("转化为机枪扫杀")),
      freeLog: logs2.some(t => String(t).includes("不消耗杀意")),
    };
  })()`);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await startRegressionBattle(page);

  // ---- 场景 A：疯狂射击（应免杀意）----
  const a = await drive(page, "skill");
  await settle(page);
  console.log("--- 场景 A：疯狂射击 ---");
  console.log(`  敌方血量 ${JSON.stringify(a.hpBefore)} → ${JSON.stringify(a.hpNow)}`);
  console.log(`  杀意 ${a.intentBefore} → ${a.intentNow}`);

  check("A1 前置：手牌构造出红色牌（♥/♦）", a.redSuit === "♥" || a.redSuit === "♦",
    `suit=${a.redSuit}`);
  check("A2 前置：技能可解析（canResolve 通过）", a.canResolve);
  check("A3 疯狂射击确实发动（日志含转化）", a.converted);
  const aHit = a.hpBefore.reduce((s, v, i) => s + (v - (a.hpNow[i] ?? v)), 0);
  check("A4 敌方确实受到伤害（防'没打出所以没扣杀意'）", aHit > 0, `总掉血 ${aHit}`);
  check("A5 杀意不减少（核心）", a.intentNow === a.intentBefore,
    `${a.intentBefore} → ${a.intentNow}`);

  // ---- 场景 B：对照，直接打出真正的机枪扫杀（应扣 1 点杀意）----
  const b = await drive(page, "raw");
  await settle(page);
  console.log("--- 场景 B：对照组，直接打出【机枪扫杀】 ---");
  console.log(`  敌方血量 ${JSON.stringify(b.hpBefore)} → ${JSON.stringify(b.hpNow)}`);
  console.log(`  杀意 ${b.intentBefore} → ${b.intentNow}`);

  const bHit = b.hpBefore.reduce((s, v, i) => s + (v - (b.hpNow[i] ?? v)), 0);
  check("B1 对照组确实打出并造成伤害", bHit > 0, `总掉血 ${bHit}`);
  check("B2 对照组杀意减少 1（证明引擎对机枪扫杀收费）",
    b.intentNow === b.intentBefore - 1, `${b.intentBefore} → ${b.intentNow}`);
  check("B3 差异成立：疯狂射击免费、原生机枪扫杀收费",
    a.intentNow === a.intentBefore && b.intentNow === b.intentBefore - 1);

  check("C1 页面无 JS 错误", errors.length === 0, errors.slice(0, 2).join(" | "));

  await browser.close();
  console.log(`\n总计 ${pass + fail} 项，通过 ${pass}，失败 ${fail}`);
  process.exit(fail ? 1 : 0);
})();
