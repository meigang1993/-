// 霹雳之锤 × 格林机枪 冲突严格检查
//
// 两者都作用在「实体单体【杀】」上，且都依赖「挂起 → 解锁后续跑」：
//   · 格林机枪：锁定技，每回合限一次，把手里剩余的单体【杀】依次追加打出；
//     中途若战斗被挂起（locked），剩余段存进 greenGatlingResume 待续跑。
//   · 霹雳之锤：【杀】被【闪】抵消后挂起，等玩家弃一张手牌令该杀强制造成伤害。
// 于是二者的挂起会互相嵌套：机枪链中某张杀被闪 → 锤子挂起 → 玩家弃牌/取消
// 之后，机枪剩余的那几张杀还能不能接着打完？本测试逐段验证。
//
//   A 段：机枪第 1 张就被【闪】→ 锤子弃牌 → 剩余杀补跑
//   B 段：机枪链中途（第 2 张）被【闪】→ 锤子弃牌 → 剩余杀补跑
//   C 段：锤子「取消」（不发动）→ 剩余杀补跑
//   D 段：敌方 AI 侧（自动弃牌）→ 剩余杀补跑
//   E 段：每回合限一次守恒 + 无锤子对照
//
// 分批：HAMMER_GT=A|B|C|D|E，不设则跑全部。
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const {
  openGame, startRegressionBattle, collectErrors, relevantErrors,
} = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const PART = (process.env.HAMMER_GT || "ALL").toUpperCase();
const want = p => PART === "ALL" || PART.split(",").includes(p);

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}`
    + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
};

const evalT = async (page, expr, ms = 15000, label = "evaluate") => {
  let timer;
  const guard = new Promise((_, rej) => {
    timer = setTimeout(() => rej(new Error(`${label} timeout ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([page.evaluate(expr), guard]);
  } catch (e) {
    console.log(`⚠️  ${label}: ${e.message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
};

// 实体单体【杀】
const SLASH = n => ({ name: `杀${n}`, type: "slash", scale: "attack",
  responseKind: "dodge", suit: "♠", text: "", targetless: false });
// 非杀手牌，专供霹雳之锤弃置（避免弃掉格林机枪队列里的杀）
const FILLER = n => ({ name: `弃牌${n}`, type: "tactic", suit: "♣",
  text: "", targetless: true });
const DODGE = { name: "闪", type: "response", suit: "♠", text: "" };

const setup = (cards, relics, foeHand, opts = {}) => `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false; b.phase = 4;
  delete b.karunaBubble; delete b.karunaBubblePending; delete b.thunderHammer;
  delete b.selectedSkillCard; delete b.greenGatlingResume; delete b.endPhaseStep;
  delete b.endPhaseUnitUid; delete b.manualDodge; delete b.manualDodgeResume;
  const u = b.allies[0];
  u.name = "安倍卡露娜"; u.ref = "abe_karuna"; u.id = "abe_karuna";
  u.gender = "female";
  // 不带技能：避免【战斗之勇】摸牌改变手牌、【记忆泡泡】再插一脚
  u.skills = [];
  u.stats = { attack: 5, magic: 2, speed: 9, maxHp: 80, bloodlust: 3, handLimit: 20 };
  u.hp = u.maxHp = 80; u.block = 0; u.intent = 3; u.bloodlustMax = 3;
  u.battleRelics = ${JSON.stringify(relics)};
  st.equipment = st.equipment || {};
  st.equipment[u.ref] = ${JSON.stringify(relics)};
  st.testEquipment = st.testEquipment || {};
  st.testEquipment[u.ref] = ${JSON.stringify(relics)};
  u.hand = ${JSON.stringify(cards)};
  delete u.usedGreenGatling; delete u.usedKrowRecord; delete u.playedSlashThisTurn;
  delete u.bubbleCards;
  u.pileStats = u.pileStats || {};
  u.pileStats.discard = []; u.pileStats.consumed = [];
  u.discard = u.pileStats.discard; u.consumed = u.pileStats.consumed;
  b.activeUid = u.uid;
  b.selectedCardIndex = -1;
  b.enemies.forEach((e, i) => {
    e.hp = e.maxHp = 300; e.block = 0; e.statuses = [];
    e.hand = i === 0 ? ${JSON.stringify(foeHand)} : [];
    e.noResponse = false;
    e.battleRelics = ${JSON.stringify(opts.foeRelics || [])};
  });
  st.log = []; st.battleLog = [];
  window.render();
  return { hand: u.hand.length, enemyHp: b.enemies[0].hp,
    hasHammer: !!window.RelicSystem?.hasEquipped?.(st, u, "霹雳之锤"),
    hasGatling: !!window.RelicSystem?.hasEquipped?.(st, u, "格林机枪") };
})()`;

const snap = `(() => {
  const st = window.state, b = st.battle, u = b.allies[0];
  return {
    hand: (u.hand || []).map(c => c.name),
    discard: (u.pileStats?.discard || u.discard || []).map(c => c.name),
    locked: !!b.locked,
    hammer: !!b.thunderHammer,
    greenResume: !!b.greenGatlingResume,
    usedGatling: !!u.usedGreenGatling,
    enemyHp: b.enemies[0].hp,
    enemyHand: (b.enemies[0].hand || []).map(c => c.name),
    logs: (st.battleLog || []).join(" | "),
  };
})()`;

const playTpl = name => `(() => {
  const st = window.state, b = st.battle, u = b.allies[0];
  const card = u.hand.find(c => c.name === ${JSON.stringify(name)});
  if (!card) return false;
  window.BattleSystem.useCard(st, u, b.enemies[0], card);
  return true;
})()`;

const settle = async page => {
  await evalT(page, "window.BattleEffects?.whenIdle?.()", 8000, "idle");
  await page.waitForTimeout(250);
};

// 锤子挂起时点一张名字含 namePart 的手牌弃置；点不动就重试，返回是否真的解除
const discardForHammer = async (page, namePart, maxTry = 4) => {
  for (let i = 0; i < maxTry; i++) {
    const has = await evalT(page, "!!window.state.battle.thunderHammer",
      15000, `probe${i}`);
    if (has !== true) return true;
    await settle(page);
    await evalT(page, "window.render()", 15000, "render");
    const idx = await evalT(page, `(() => {
      const u = window.state.battle.allies[0];
      return u.hand.findIndex(c => c.name.indexOf(${JSON.stringify(namePart)}) >= 0);
    })()`, 15000, `idx${i}`);
    if (idx < 0) return false;
    try {
      await page.waitForSelector(`.play-card[data-card-index="${idx}"]`,
        { timeout: 8000 });
      await page.locator(`.play-card[data-card-index="${idx}"]`)
        .click({ timeout: 8000, force: true });
    } catch (e) {
      console.log(`   ⚠️ 第${i}次点击失败: ${e.message}`);
      continue;
    }
    await page.waitForTimeout(900);
  }
  const left = await evalT(page, "!!window.state.battle.thunderHammer",
    15000, "probeEnd");
  return left !== true;
};

const cancelHammer = async page => {
  try {
    await page.waitForSelector("[data-cancel-hammer]", { timeout: 8000 });
    await page.locator("[data-cancel-hammer]")
      .click({ timeout: 8000, force: true });
  } catch (e) {
    console.log(`   ⚠️ 取消按钮点击失败: ${e.message}`);
    return false;
  }
  await page.waitForTimeout(900);
  return true;
};

const countSlashUsed = logs => (logs.match(/使用♠杀\d/g) || []).length;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = collectErrors(page);
  await openGame(page);
  await startRegressionBattle(page);

  // ---------- A 段：机枪第 1 张就被闪 ----------
  if (want("A")) {
    console.log("\n--- A 段：格林机枪第1张被【闪】→ 锤子弃牌 → 剩余杀补跑 ---");
    const cards = [SLASH(1), SLASH(2), SLASH(3), FILLER(1), FILLER(2)];
    const st0 = await evalT(page,
      setup(cards, ["格林机枪", "霹雳之锤"], [DODGE]), 15000, "setupA");
    T("A0 两件饰品均已装备", st0?.hasHammer === true && st0?.hasGatling === true, st0);

    await evalT(page, playTpl("杀1"), 15000, "playA");
    await page.waitForTimeout(1200);
    let s = await evalT(page, snap, 15000, "snapA1");
    T("A1 杀1 被闪后锤子挂起", s?.hammer === true, s);
    const qLen = await evalT(page, `(() => {
      const h = window.state.battle?.thunderHammer;
      return (h?.card?.greenGatlingQueue || []).length;
    })()`, 15000, "qlenA");
    T("A2 锤子挂起时机枪剩余两张杀仍在队列待续跑", qLen === 2, { qLen });

    const ok = await discardForHammer(page, "弃牌");
    T("A3 弃牌后锤子已解除", ok === true, await evalT(page, snap, 15000, "snapA2"));
    await settle(page);
    s = await evalT(page, snap, 15000, "snapA3");
    const used = countSlashUsed(s.logs);
    T("A4 三张杀全部打出", used === 3, { used, logs: s.logs.slice(0, 200) });
    T("A5 剩余杀未被吞掉（杀2/杀3 进弃牌堆）",
      s.discard.includes("杀2") && s.discard.includes("杀3"), { discard: s.discard });
    T("A6 锤子补伤生效（敌人共掉 15）", s.enemyHp === 285,
      { enemyHp: s.enemyHp });
    T("A7 战斗未残留锁定", s.locked === false && s.greenResume === false, s);
  }

  // ---------- B 段：机枪链中途（第2张）被闪 ----------
  if (want("B")) {
    console.log("\n--- B 段：格林机枪链中途第2张被【闪】→ 锤子弃牌 → 剩余杀补跑 ---");
    const cards = [SLASH(1), SLASH(2), SLASH(3), FILLER(1), FILLER(2), FILLER(3)];
    await evalT(page, setup(cards, ["格林机枪", "霹雳之锤"], [DODGE, DODGE]),
      15000, "setupB");
    await evalT(page, playTpl("杀1"), 15000, "playB");
    await page.waitForTimeout(1200);

    // 链中可能连续挂起两次锤子（杀1、杀2 各被闪一次），逐个弃牌解决
    let rounds = 0;
    for (let i = 0; i < 4; i++) {
      const has = await evalT(page, "!!window.state.battle.thunderHammer",
        15000, `bProbe${i}`);
      if (has !== true) break;
      const hc = await evalT(page,
        "window.state.battle.thunderHammer?.card?.name || \"\"", 15000, "hc");
      console.log(`   第${i}次挂起，是哪张杀: ${hc}`);
      const done = await discardForHammer(page, "弃牌");
      rounds++;
      if (!done) break;
      await settle(page);
    }
    await settle(page);
    const s = await evalT(page, snap, 15000, "snapB");
    const hammerCount = (s.logs.match(/发动霹雳之锤/g) || []).length;
    const dodgeCount = (s.logs.match(/自动使用闪/g) || []).length;
    T("B1 链中两次锤子均发动（确为中途被打断）", hammerCount === 2,
      { hammerCount, dodgeCount });
    const used = countSlashUsed(s.logs);
    T("B2 三张杀全部打出", used === 3, { used, logs: s.logs.slice(0, 240) });
    T("B3 中途被打断的剩余杀未被吞掉",
      s.discard.includes("杀2") && s.discard.includes("杀3"), { discard: s.discard });
    T("B4 两次锤子补伤均生效（敌人共掉 15）", s.enemyHp === 285,
      { enemyHp: s.enemyHp });
    T("B5 战斗未残留锁定", s.locked === false && s.greenResume === false, s);
  }

  // ---------- C 段：锤子取消（不发动） ----------
  if (want("C")) {
    console.log("\n--- C 段：锤子取消（不弃牌）→ 剩余杀补跑 ---");
    const cards = [SLASH(1), SLASH(2), SLASH(3), FILLER(1)];
    await evalT(page, setup(cards, ["格林机枪", "霹雳之锤"], [DODGE]),
      15000, "setupC");
    await evalT(page, playTpl("杀1"), 15000, "playC");
    await page.waitForTimeout(1200);
    let s = await evalT(page, snap, 15000, "snapC1");
    T("C1 杀1 被闪后锤子挂起", s?.hammer === true, s);
    await cancelHammer(page);
    await settle(page);
    s = await evalT(page, snap, 15000, "snapC2");
    T("C2 取消后锤子已解除", s.hammer === false, s);
    const used = countSlashUsed(s.logs);
    T("C3 剩余两张杀仍补跑", used === 3, { used, logs: s.logs.slice(0, 200) });
    T("C4 取消不补伤（杀1 未造成伤害，敌人只掉 10）", s.enemyHp === 290,
      { enemyHp: s.enemyHp });
    T("C5 战斗未残留锁定", s.locked === false && s.greenResume === false, s);
  }

  // ---------- D 段：敌方 AI 侧（锤子走自动弃牌分支） ----------
  if (want("D")) {
    console.log("\n--- D 段：敌方装备两件饰品 → 自动弃牌 → 剩余杀补跑 ---");
    const cards = [SLASH(1), SLASH(2), SLASH(3), FILLER(1)];
    // 我方（被攻击方）持一张【闪】；敌方装备两件饰品
    await evalT(page, setup(cards, [], [], { foeRelics: ["格林机枪", "霹雳之锤"] }),
      15000, "setupD");
    await evalT(page, `(() => {
      const st = window.state, b = st.battle;
      const u = b.allies[0];
      u.hand = [{ name: "闪", type: "response", suit: "♠", text: "" }];
      const foe = b.enemies[0];
      foe.hand = ${JSON.stringify(cards)};
      st.equipment = st.equipment || {};
      st.equipment[foe.ref || foe.id || "foe"] = ["格林机枪", "霹雳之锤"];
      st.testEquipment = st.testEquipment || {};
      st.testEquipment[foe.ref || foe.id || "foe"] = ["格林机枪", "霹雳之锤"];
      delete foe.usedGreenGatling;
      st.log = []; st.battleLog = [];
      window.render();
      return true;
    })()`, 15000, "setupD2");
    const okPlay = await evalT(page, `(() => {
      const st = window.state, b = st.battle;
      const foe = b.enemies[0], me = b.allies[0];
      const card = foe.hand.find(c => c.name === "杀1");
      if (!card) return false;
      window.BattleSystem.useCard(st, foe, me, card);
      return true;
    })()`, 15000, "playD");
    T("D0 敌方已出牌", okPlay === true, { okPlay });
    await page.waitForTimeout(1500);
    await settle(page);
    const s = await evalT(page, snap, 15000, "snapD");
    const foeUsed = (s.logs.match(/使用♠杀\d/g) || []).length;
    const foeHammer = (s.logs.match(/发动霹雳之锤/g) || []).length;
    T("D1 敌方锤子已自动发动", foeHammer >= 1,
      { foeHammer, logs: s.logs.slice(0, 300) });
    T("D2 敌方机枪剩余杀未被吞掉", foeUsed === 3,
      { foeUsed, logs: s.logs.slice(0, 300) });
    T("D3 战斗未残留锁定", s.locked === false && s.greenResume === false, s);
  }

  // ---------- E 段：无锤子对照 + 每回合限一次 ----------
  if (want("E")) {
    console.log("\n--- E 段：无锤子对照 + 格林机枪每回合限一次 ---");
    const cards = [SLASH(1), SLASH(2), SLASH(3), FILLER(1)];
    await evalT(page, setup(cards, ["格林机枪"], [DODGE]), 15000, "setupE");
    await evalT(page, playTpl("杀1"), 15000, "playE");
    await page.waitForTimeout(1500);
    await settle(page);
    const s = await evalT(page, snap, 15000, "snapE");
    T("E1 无锤子时不挂起", s.hammer === false, s);
    const used = countSlashUsed(s.logs);
    T("E2 无锤子时机枪三张杀照常打出", used === 3, { used });
    T("E3 被闪的杀不补伤（敌人只掉 10）", s.enemyHp === 290,
      { enemyHp: s.enemyHp });
    T("E4 格林机枪每回合限一次已标记", s.usedGatling === true, s);
    T("E5 战斗未残留锁定", s.locked === false && s.greenResume === false, s);
  }

  await browser.close();
  const rel = relevantErrors(errors);
  T("无 JS 错误", rel.length === 0, rel.slice(0, 3));
  console.log(`\n合计 ${pass}/${total}`);
  process.exit(pass === total ? 0 : 1);
})();
