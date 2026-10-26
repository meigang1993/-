// 安倍卡露娜【记忆泡泡】× 饰品 冲突严格检查
//
// 泡泡的核心副作用是「结算后把战斗挂起（locked=true）等待玩家选择」，
// 而凡是需要「挂起 → 解锁后续跑」的饰品（格林机枪 / 霹雳之锤）都依赖
// locked 被解除时被正确续跑。本测试逐个验证这些饰品不会被泡泡吞掉。
//
//   G 段：格林机枪 —— 追加的【杀】是否因泡泡挂起而丢失剩余段
//   W 段：母亲怀表 —— 跳过弃牌阶段后泡泡区是否仍被清空
//   K 段：克罗研究记录 —— 战术牌重复结算与泡泡的先后/互斥
//   S 段：全饰品冒烟 —— 逐个装备后泡泡仍能正常触发且不报错
//
// 分批：KARUNA_RC=G|W|K|S，不设则跑全部。
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const {
  openGame, startRegressionBattle, collectErrors, relevantErrors,
} = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const PART = (process.env.KARUNA_RC || "ALL").toUpperCase();
const want = p => PART === "ALL" || PART.split(",").includes(p);

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
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

// relics: 卡露娜本场装备的饰品名数组
const setupTpl = (cards, relics = []) => `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false; b.phase = 4;
  delete b.karunaBubble; delete b.karunaBubblePending; delete b.thunderHammer;
  delete b.selectedSkillCard; delete b.greenGatlingResume; delete b.endPhaseStep;
  delete b.endPhaseUnitUid;
  const u = b.allies[0];
  u.name = "安倍卡露娜"; u.ref = "abe_karuna"; u.id = "abe_karuna";
  u.gender = "female";
  u.stats = { attack: 2, magic: 4, speed: 3, maxHp: 50, bloodlust: 1, handLimit: 3 };
  u.hp = u.maxHp = 50; u.block = 0; u.intent = 1;
  u.skills = [{ name: "同频歌姬" }, { name: "记忆泡泡" }, { name: "幸运海螺" }];
  u.battleRelics = ${JSON.stringify(relics)};
  delete u.bubbleCards; delete u.karunaLastColor; delete u.karunaLastSuit;
  delete u.usedGreenGatling; delete u.usedKrowRecord; delete u.playedSlashThisTurn;
  u.pileStats = u.pileStats || {};
  u.pileStats.discard = []; u.pileStats.consumed = [];
  u.discard = u.pileStats.discard; u.consumed = u.pileStats.consumed;
  u.hand = ${JSON.stringify(cards)};
  b.activeUid = u.uid;
  b.selectedCardIndex = -1;
  b.enemies.forEach(e => {
    e.hp = e.maxHp = 200; e.block = 0; e.statuses = [];
    e.hand = []; e.noResponse = true;
  });
  st.log = []; st.battleLog = [];
  window.render();
  return { hand: u.hand.length, enemyHp: b.enemies[0].hp };
})()`;

const snapTpl = `(() => {
  const st = window.state, b = st.battle, u = b.allies[0];
  return {
    hand: (u.hand || []).map(c => c.name),
    bubble: (u.bubbleCards || []).map(c => c.name),
    bubbleLen: (u.bubbleCards || []).length,
    discard: (u.pileStats?.discard || u.discard || []).map(c => c.name),
    consumed: (u.pileStats?.consumed || u.consumed || []).map(c => c.name),
    locked: !!b.locked,
    pending: !!b.karunaBubble,
    pendingName: b.karunaBubble?.card?.name || "",
    pendingBubble: !!b.karunaBubblePending,
    greenResume: !!b.greenGatlingResume,
    enemyHp: b.enemies[0].hp,
    enemyMaxHp: b.enemies[0].maxHp,
    logs: (st.battleLog || []).join(" | "),
  };
})()`;

const playTpl = name => `(() => {
  const st = window.state, b = st.battle, u = b.allies[0];
  const card = u.hand.find(c => c.name === ${JSON.stringify(name)});
  if (!card) return false;
  window.BattleSystem.useCard(st, u, card.targetless ? null : b.enemies[0], card);
  return true;
})()`;

const playAndWait = async (page, name) => {
  await evalT(page, playTpl(name), 15000, `play:${name}`);
  await page.waitForTimeout(700);
  const hung = await evalT(page,
    "!!window.state.battle.karunaBubble || !!window.state.battle.thunderHammer"
    + " || !!window.state.battle.locked || !!window.state.battle.selectedSkillCard",
    8000, `probe:${name}`);
  if (hung !== true) {
    await evalT(page, "window.BattleEffects?.whenIdle?.()", 8000, `whenIdle:${name}`);
  }
  await page.waitForTimeout(300);
  return evalT(page, snapTpl, 15000, `snap:${name}`);
};

const clickBubbleBtn = async (page, sel) => {
  await evalT(page, "window.render()", 15000, "renderBeforeClick");
  try {
    await page.waitForSelector(sel, { timeout: 8000 });
    await page.locator(sel).click({ timeout: 8000 });
  } catch (e) {
    console.log(`   ⚠️ 点击失败 ${sel}: ${e.message}`);
    return false;
  }
  await page.waitForTimeout(400);
  return true;
};

const answerAll = async (page, mode = "store", tag = "") => {
  // 反复处理挂起的泡泡提示，直到不再挂起（最多 6 轮，防止死循环）
  const sel = mode === "store" ? "[data-karuna-bubble-store]" : "[data-karuna-bubble-skip]";
  for (let i = 0; i < 6; i++) {
    const has = await evalT(page,
      "!!window.state.battle.karunaBubble", 8000, `answerProbe${i}${tag}`);
    if (has !== true) break;
    const ok = await clickBubbleBtn(page, sel);
    if (!ok) { console.log(`   [${tag}] 第${i}轮按钮不可点，中断`); break; }
    await page.waitForTimeout(1200);
    const s = await evalT(page, snapTpl, 15000, `answerRound${i}${tag}`);
    console.log(`   [${tag}] 第${i}轮后`, JSON.stringify({
      hand: s.hand, bubble: s.bubble, locked: s.locked,
      pending: s.pendingName, greenResume: s.greenResume, enemyHp: s.enemyHp,
    }));
    // 续跑是异步的：解决一次询问后可能又排下一次。再探一次，
    // 只有连续两次都无挂起才认为真的处理完了。
    const again = await evalT(page,
      "!!window.state.battle.karunaBubble", 8000, `answerAgain${i}${tag}`);
    if (again !== true) {
      await page.waitForTimeout(600);
      const third = await evalT(page,
        "!!window.state.battle.karunaBubble", 8000, `answerThird${i}${tag}`);
      if (third === true) continue;
      break;
    }
  }
  await evalT(page, "window.BattleEffects?.whenIdle?.()", 8000, "answerIdle");
  await page.waitForTimeout(300);
  return evalT(page, snapTpl, 15000, "answerSnap");
};

// 实体单体【杀】：type=slash 即 isKillCard，无 sweep 即单体
const SLASH = n => ({ name: `杀${n}`, type: "slash", suit: "♠", text: "", targetless: false });
const TACTIC = { name: "测试战术牌", type: "tactic", suit: "♥", text: "", targetless: true };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = collectErrors(page);
  await openGame(page);
  await startRegressionBattle(page);

  // ---------- G 段：格林机枪 × 记忆泡泡 ----------
  if (want("G")) {
    console.log("\n--- G 段：格林机枪 × 记忆泡泡 ---");

    // G0 对照组：不装备格林机枪，泡泡满 2 张后不再询问，出牌正常完成
    await evalT(page, setupTpl([SLASH("A"), SLASH("B"), SLASH("C")]), 20000, "setupG0");
    let s = await playAndWait(page, "杀A");
    T("G0-1 对照组出杀后泡泡询问", s.pending, { pending: s.pendingName });
    s = await answerAll(page, "store");
    T("G0-2 对照组合入 1 张", s.bubbleLen === 1, { bubble: s.bubble });
    T("G0-3 对照组手牌剩 2 张杀（未追加）",
      s.hand.filter(n => /^杀/.test(n)).length === 2, { hand: s.hand });

    // G1 装备格林机枪：打出杀A → 机枪应把手牌剩余单体杀依次追加使用
    await evalT(page, setupTpl([SLASH("A"), SLASH("B"), SLASH("C")], ["格林机枪"]),
      20000, "setupG1");
    const before = await evalT(page, snapTpl, 15000, "snapG1before");
    s = await playAndWait(page, "杀A");
    console.log("   [G1 打出后]", JSON.stringify({
      hand: s.hand, bubble: s.bubble, locked: s.locked,
      pending: s.pendingName, greenResume: s.greenResume, enemyHp: s.enemyHp,
    }));
    // 处理所有泡泡提示
    s = await answerAll(page, "store");
    console.log("   [G1 处理完]", JSON.stringify({
      hand: s.hand, bubble: s.bubble, locked: s.locked,
      greenResume: s.greenResume, enemyHp: s.enemyHp,
    }));
    const slashLeft = s.hand.filter(n => n === "杀B" || n === "杀C");
    T("G1 机枪追加的剩余【杀】未因泡泡挂起而丢失",
      slashLeft.length === 0, { leftInHand: slashLeft, hand: s.hand });
    // 卡露娜攻击力 2，每张【杀】2 点；三张全部结算应为 6 点。
    // 只看「是否每段都结算」而非绝对数值（伤害数值受技能/状态影响）。
    T("G2 三张【杀】全部结算（敌人掉了三段伤害）",
      before.enemyHp - s.enemyHp >= 6, {
        before: before.enemyHp, after: s.enemyHp, delta: before.enemyHp - s.enemyHp,
      });
    T("G3 剩余【杀】未卡在 greenGatlingResume 里", !s.greenResume, { greenResume: s.greenResume });
    T("G4 战斗未残留锁定", !s.locked, { locked: s.locked });
    // 泡泡上限 2 张，三张【杀】里「哪两张被存入」取决于结算与询问的先后，
    // 故只判守恒：三张都在（泡泡区 2 + 弃牌堆/消耗区 1），不指定具体哪张。
    const gone = [...s.discard, ...s.bubble, ...s.consumed]
      .filter(n => n === "杀A" || n === "杀B" || n === "杀C");
    T("G5 三张【杀】去向守恒（泡泡区2 + 弃牌堆1）",
      s.bubbleLen === 2 && gone.length === 3, {
        discard: s.discard, bubble: s.bubble, consumed: s.consumed,
      });
  }

  // ---------- W 段：母亲怀表（跳过弃牌阶段）× 记忆泡泡 ----------
  if (want("W")) {
    console.log("\n--- W 段：母亲怀表 × 记忆泡泡 ---");
    // 本回合未使用【杀】→ 怀表跳过弃牌阶段 → 直接进结束阶段。
    // 泡泡区清空挂在结束阶段里，跳过弃牌阶段不得把它一并跳掉，
    // 否则存入的牌会永久留在区内（等于无限存储）。
    await evalT(page, setupTpl([TACTIC, { ...TACTIC, name: "备用战术牌" }], ["母亲怀表"]),
      20000, "setupW");
    let s = await playAndWait(page, "测试战术牌");
    T("W1 出战术牌后泡泡询问", s.pending, { pending: s.pendingName });
    s = await answerAll(page, "store", "W");
    T("W2 存入 1 张", s.bubbleLen === 1, { bubble: s.bubble });

    await evalT(page, "window.BattleSystem.endPlay(window.state, window.render)",
      15000, "endPlayW");
    await page.waitForTimeout(1200);
    s = await evalT(page, snapTpl, 15000, "snapW");
    console.log("   [W 结束回合后]", JSON.stringify({
      bubble: s.bubble, discard: s.discard, locked: s.locked,
      logs: s.logs.slice(-160),
    }));
    T("W3 跳过弃牌阶段后泡泡区仍被清空", s.bubbleLen === 0, { bubble: s.bubble });
    T("W4 存入的牌进入弃牌堆", s.discard.includes("测试战术牌"), { discard: s.discard });
    T("W5 日志中出现怀表跳过弃牌阶段", /母亲怀表/.test(s.logs), { logs: s.logs.slice(-120) });
  }

  // ---------- K 段：克罗研究记录（战术牌结算两次）× 记忆泡泡 ----------
  if (want("K")) {
    console.log("\n--- K 段：克罗研究记录 × 记忆泡泡 ---");
    // drawTeam 分支会无条件调用 repeatTactic（battle-combat-card-effects），
    // 用它才能真实走到克罗研究记录的重复结算；纯空壳战术牌不匹配任何效果
    // 分支、根本不会触发重复（测试构造问题，不是产品问题）。
    const KROW_CARD = {
      name: "测试战术牌", type: "tactic", suit: "♥", text: "",
      targetless: true, drawTeam: 1,
    };
    await evalT(page, setupTpl([KROW_CARD, { ...TACTIC, name: "备用战术牌" }], ["克罗研究记录"]),
      20000, "setupK");
    let s = await playAndWait(page, "测试战术牌");
    console.log("   [K 打出后]", JSON.stringify({
      pending: s.pendingName, bubble: s.bubble, locked: s.locked,
      logs: s.logs.slice(-200),
    }));
    T("K1 战术牌仍触发泡泡询问", s.pending, { pending: s.pendingName });
    T("K2 重复结算未被泡泡吞掉", /额外结算一次/.test(s.logs), { logs: s.logs.slice(-160) });
    s = await answerAll(page, "store", "K");
    T("K3 只询问一次（重复的 _repeat 牌不再触发）",
      !s.pending && s.bubbleLen === 1, { bubble: s.bubble, pending: s.pendingName });
    T("K4 战斗未残留锁定", !s.locked, { locked: s.locked });
  }

  // ---------- KZ 段：泡泡区使用战术牌 × 克罗研究记录 ----------
  if (want("KZ")) {
    console.log("\n--- KZ 段：泡泡区使用战术牌 × 克罗研究记录 ---");
    // 克罗描述是「每回合第一张成功结算的战术牌结算两次」。战术牌存入泡泡后
    // 从泡泡区再用一次，若重复结算又触发，就等于一回合结算三次，属超模。
    const KROW_CARD = {
      name: "测试战术牌", type: "tactic", suit: "♥", text: "",
      targetless: true, drawTeam: 1,
    };
    await evalT(page, setupTpl([KROW_CARD, { ...TACTIC, name: "备用战术牌" }], ["克罗研究记录"]),
      20000, "setupKZ");
    let s = await playAndWait(page, "测试战术牌");
    const repeat1 = (s.logs.match(/额外结算一次/g) || []).length;
    console.log("   [KZ 打出后]", JSON.stringify({
      pending: s.pendingName, bubble: s.bubble, repeat: repeat1,
    }));
    T("KZ1 打出战术牌触发一次重复结算", repeat1 === 1, { repeat: repeat1 });
    s = await answerAll(page, "store", "KZ");
    T("KZ2 已存入泡泡区", s.bubbleLen === 1 && s.bubble[0] === "测试战术牌",
      { bubble: s.bubble });
    const picked = await evalT(page,
      "!!window.AbeKarunaBubbleSkills.select(window.state, 0)", 15000, "kzSelect");
    T("KZ3 泡泡区可选中", picked === true, { picked });
    await evalT(page, `(() => {
      const st = window.state, b = st.battle, card = b.selectedSkillCard;
      if (!card) return false;
      window.BattleSystem.useCard(st, b.allies[0], card.targetless ? null : b.enemies[0], card);
      return true;
    })()`, 15000, "kzUse");
    await page.waitForTimeout(900);
    await evalT(page, "window.BattleEffects?.whenIdle?.()", 8000, "kzIdle");
    s = await evalT(page, snapTpl, 15000, "snapKZ");
    const repeat2 = (s.logs.match(/额外结算一次/g) || []).length;
    console.log("   [KZ 泡泡区使用后]", JSON.stringify({
      bubble: s.bubble, hand: s.hand, discard: s.discard,
      repeat: repeat2, locked: s.locked, pending: s.pendingName,
    }));
    T("KZ4 泡泡区使用不再重复结算（一回合仍只两次）", repeat2 === 1, { repeat: repeat2 });
    T("KZ5 用掉后离区", s.bubbleLen === 0, { bubble: s.bubble });
    T("KZ6 用掉后不再询问放入", !s.pending, { pending: s.pendingName });
    T("KZ7 未残留锁定", !s.locked, { locked: s.locked });
  }

  // ---------- Z 段：拆分完整性（abe-karuna-bubble-zone.js 委托是否漏接线） ----------
  if (want("Z")) {
    console.log("\n--- Z 段：拆分完整性 ---");
    const z = await evalT(page, `(() => {
      const S = window.AbeKarunaBubbleSkills, M = window.AbeKarunaBubbleZone;
      const keys = ["afterCardPlayed","store","skip","select","isIntentFree",
        "flushPending","endTurn","render"];
      const zkeys = ["alive","hasSkill","pileOf","consumedOf","bubbleOf","burnOnPlay",
        "isEntityCard","removeFromPile","endTurn","render"];
      return {
        hasZone: !!M,
        max: S?.MAX, zoneMax: M?.MAX,
        methods: keys.map(k => [k, typeof S?.[k]]),
        zoneMethods: zkeys.map(k => [k, typeof M?.[k]]),
      };
    })()`, 15000, "splitIntegrity");
    T("Z1 zone 模块已装配（未在打包中丢失）", z?.hasZone === true, z);
    T("Z2 MAX 委托值一致", z?.max === 2 && z?.zoneMax === 2, z);
    T("Z3 主文件 8 个对外接口齐全",
      !!z && z.methods.every(m => m[1] === "function"), { methods: z?.methods });
    T("Z4 zone 10 个接口齐全",
      !!z && z.zoneMethods.every(m => m[1] === "function"), { zoneMethods: z?.zoneMethods });
    // 端到端：真实走一次「存入 → 界面渲染 → 点击使用」，确认委托没漏接线
    await evalT(page, setupTpl([TACTIC, { ...TACTIC, name: "备用战术牌" }]),
      20000, "setupZ");
    let s = await playAndWait(page, "测试战术牌");
    T("Z5 拆分后仍能触发询问", s.pending, { pending: s.pendingName });
    s = await answerAll(page, "store", "Z");
    T("Z6 拆分后仍能存入", s.bubbleLen === 1, { bubble: s.bubble });
    const dom = await evalT(page, `(() => {
      const zone = document.querySelectorAll(".karuna-bubble-zone");
      const label = document.querySelector(".karuna-bubble-label")?.textContent || "";
      const slots = document.querySelectorAll("[data-bubble-index]").length;
      return { zones: zone.length, label, slots };
    })()`, 15000, "zDom");
    console.log("   [Z 界面]", JSON.stringify(dom));
    T("Z7 泡泡区已渲染（render 委托生效）", dom?.zones === 1, dom);
    T("Z8 标签显示 1/2（MAX 委托生效）", /1\/2/.test(dom?.label || ""), dom);
    T("Z9 渲染出 1 个牌位", dom?.slots === 1, dom);
    // 直接注入一张牌再调 endTurn：不依赖 Z6 是否存入，
    // 否则委托被切断时「本来就是空的」会让这条断言恒真。
    s = await evalT(page, `(() => {
      const st = window.state, u = st.battle.allies[0];
      u.bubbleCards = [{ name: "注入牌", type: "tactic", suit: "♥" }];
      const before = u.bubbleCards.length;
      window.AbeKarunaBubbleSkills.endTurn(st, u);
      window.render();
      return { before, bubble: (u.bubbleCards || []).length };
    })()`, 15000, "zEndTurn");
    T("Z10 endTurn 委托生效（回合结束清空）",
      s?.before === 1 && s?.bubble === 0, s);
  }

  // ---------- P 段：暂存机会的补问（确定触发） ----------
  if (want("P")) {
    console.log("\n--- P 段：karunaBubblePending 补问 ---");
    // 上一次询问尚未处理完时又有牌结算完毕，那次机会只会被暂存。
    // 这里直接注入 pending 以确定性地触发补问路径（自然时序下是竞态）。
    await evalT(page, setupTpl([TACTIC, { ...TACTIC, name: "备用战术牌" }]),
      20000, "setupP");
    let s = await playAndWait(page, "测试战术牌");
    T("P1 首张牌询问建立", s.pending, { pending: s.pendingName });
    const injected = await evalT(page, `(() => {
      const st = window.state, b = st.battle, u = b.allies[0];
      const card = u.hand.find(c => c.name === "备用战术牌");
      if (!card) return false;
      // 真实场景里暂存的牌已经结算完毕、进了弃牌堆（否则 store 摘不到）；
      // 这里把它从手牌移入弃牌堆，才能如实还原。
      u.hand.splice(u.hand.indexOf(card), 1);
      (u.pileStats?.discard || u.discard).push(card);
      b.karunaBubblePending = { actorUid: u.uid, card };
      return true;
    })()`, 15000, "injectPending");
    T("P1b 成功注入暂存机会", injected === true, { injected });
    await clickBubbleBtn(page, "[data-karuna-bubble-store]");
    await page.waitForTimeout(1200);
    s = await evalT(page, snapTpl, 15000, "snapP");
    console.log("   [P 放入后]", JSON.stringify({
      bubble: s.bubble, pending: s.pendingName, pendingBubble: s.pendingBubble,
      locked: s.locked, logs: s.logs.slice(-120),
    }));
    T("P2 解决首张后补问暂存的第二张",
      s.pendingName === "备用战术牌", { pending: s.pendingName, locked: s.locked });
    T("P3 补问时战斗处于挂起（可点按钮）", s.locked, { locked: s.locked });
    // 处理补问后应恢复正常
    s = await answerAll(page, "store", "P2");
    T("P4 补问处理完后不再挂起", !s.locked && !s.pending, {
      locked: s.locked, pending: s.pendingName,
    });
    T("P5 两张都进了泡泡区", s.bubbleLen === 2, { bubble: s.bubble });
  }

  // ---------- S 段：全饰品冒烟 ----------
  if (want("S")) {
    console.log("\n--- S 段：全饰品逐个冒烟 ---");
    const relics = await evalT(page, `(() => {
      const a = Object.keys(window.GameDataRelics || {});
      const b = Object.keys(window.GameDataFutureRelics || {});
      return a.concat(b);
    })()`, 15000, "relicList");
    console.log(`   饰品总数 ${(relics || []).length}`);
    let bad = [];
    for (const relic of (relics || [])) {
      await evalT(page, setupTpl([TACTIC, { ...TACTIC, name: "备用战术牌" }], [relic]),
        20000, `setupS:${relic}`);
      const s0 = await playAndWait(page, "测试战术牌");
      const s1 = await answerAll(page, "store", `S:${relic}`);
      const ok = s0.pending && s1.bubbleLen >= 1 && !s1.locked;
      if (!ok) {
        bad.push({ relic, pending: s0.pendingName, bubble: s1.bubble, locked: s1.locked });
        console.log(`   ❌ ${relic} ← ${JSON.stringify({
          pending: s0.pendingName, bubble: s1.bubble, locked: s1.locked,
        })}`);
      } else {
        console.log(`   ✅ ${relic}`);
      }
    }
    T(`S1 全部 ${(relics || []).length} 个饰品下泡泡均能正常触发并存入`,
      bad.length === 0, { bad });
  }

  await browser.close();
  const rel = relevantErrors(errors);
  T("无相关 JS 错误", rel.length === 0, { errors: rel.slice(0, 3) });
  console.log(`\n通过 ${pass}/${total}`);
  process.exit(pass === total ? 0 : 1);
})().catch(e => { console.error("FATAL", e); process.exit(1); });
