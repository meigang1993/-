// 英雄级（hell）实战：XX型凋零者1312号
//   1. 英雄级是否为 1312 挂上掉落饰品（魅魔钢叉 / 粉色魅魔装）
//   2. 三技能在真实战斗流程中是否触发：外神之眼 / 魅魔吸精术 / 百眼魅魔
//   3. 两饰品是否生效：魅魔钢叉（主动）/ 粉色魅魔装（被动）
//   4. AI 是否会使用：走真实敌方回合（结束出牌 → 敌方 AI 行动 → 敌方结束阶段）
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  const ok = !!cond;
  if (ok) pass++;
  console.log(`${ok ? "✅" : "❌"} ${name}` + (ok ? "" : `  ← ${JSON.stringify(extra || {})}`));
};

const ENEMY_ID = "witherer_1312";

async function startBattleAt(page, diffId) {
  await openGame(page);
  await page.locator("[data-start-game]").click();
  await page.locator(".villa-hall").waitFor({ state: "visible" });
  await page.evaluate(() => {
    window.state.hallModal = "testBattle";
    window.render();
  });
  await page.locator("[data-start-test-battle]").waitFor({ state: "visible" });
  const idx = await page.evaluate(`(() => window.GameData.testEnemies.findIndex(e => e.id === "${ENEMY_ID}"))()`);
  if (idx < 0) throw new Error(`testEnemies 中未找到 ${ENEMY_ID}`);
  await page.evaluate(d => {
    const i = window.GameData.testEnemies.findIndex(e => e.id === "witherer_1312");
    window.state.testEnemies = [i];
    window.state.testDifficulty = d;
    window.GameAssets.preloadBattle = async () => {};
    window.state.settings.battleSpeed = 2;
    window.BattleFX.playBattleStart = callback => callback?.();
    window.BattleLines.intro = () => 0;
    window.render();
  }, diffId);
  await page.locator("[data-start-test-battle]").click();
  await page.locator(".battle-screen").waitFor({ state: "visible" });
  await page.waitForFunction(() =>
    !window.BattleEffects.animating
    && !window.BattleEffects.draining
    && !window.state?.battle?.animQueue?.length, null, { timeout: 40000 });
  await page.evaluate(() => {
    const b = window.state.battle;
    window.state.settings.battleSpeed = 1;
    b.animQueue = [];
    b.locked = false;
    b.phase = 4;
    b.activeUid = b.allies[0].uid;
    b.allies.concat(b.enemies)
      .forEach(u => u.hand.forEach(c => { delete c._pendingDraw; }));
    window.render();
  });
  return idx;
}

const peekTpl = `(() => {
  const b = window.state.battle;
  const e = (b.enemies || []).find(x => x.id === "witherer_1312") || b.enemies[0];
  return {
    name: e?.name, id: e?.id, type: e?.type, ai: e?.ai, gender: e?.gender,
    battleRelics: e?.battleRelics || [],
    hp: e?.hp, maxHp: e?.maxHp,
    attack: e?.stats?.attack, magic: e?.stats?.magic, speed: e?.stats?.speed,
  };
})()`;

const logsTpl = `(() => ({
  logs: (window.state.log || []).map(String),
}))()`;

// 写入即捕获：state.log 是滚动窗口，敌方回合的日志会被后续我方回合挤掉，
// 事后读取会漏。故 hook BattleLog.add 与 state.log 的 push/unshift 全程累积。
async function hookLogs(page) {
  await page.evaluate(`(() => {
    window.__allLogs = [];
    if (window.BattleLog && typeof window.BattleLog.add === "function") {
      const orig = window.BattleLog.add;
      window.BattleLog.add = function (state, text) {
        try { window.__allLogs.push(String(text)); } catch (e) {}
        return orig.apply(this, arguments);
      };
    }
    const b = window.state?.battle;
    if (b && Array.isArray(b.log)) {
      ["push", "unshift"].forEach(op => {
        const orig = b.log[op];
        if (typeof orig === "function") {
          b.log[op] = function (item) {
            try { window.__allLogs.push(String(item)); } catch (e) {}
            return orig.apply(this, arguments);
          };
        }
      });
    }
    return true;
  })()`);
}

const readLogs = page => page.evaluate(`(() => (window.__allLogs || []).slice())()`);
const clearLogs = page => page.evaluate(`(() => { window.__allLogs = []; return true; })()`);

// 等动画与挂起队列清空
const settle = async page => {
  await page.waitForFunction(() =>
    !window.BattleEffects.animating
    && !window.state?.battle?.animQueue?.length
    && !window.state?.battle?.locked, null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(600);
};

// 真实回合：我方结束出牌 → 敌方 AI 行动 → 敌方结束阶段 → 回到我方。
// 必须先等 activeUid 切到敌方，再等切回我方；只判"在我方"会在点击后立即为真，
// 导致敌方回合还没跑就采样。
async function runEnemyTurn(page, label) {
  // 我方可能有多名角色，逐个「结束出牌」直到轮到敌方
  for (let i = 0; i < 10; i++) {
    const stt = await page.evaluate(`(() => {
      const b = window.state.battle;
      return {
        enemyTurn: !!(b && (b.enemies || []).some(e => e.uid === b.activeUid)),
        phase: b?.phase, locked: !!b?.locked,
        active: (b?.allies || []).concat(b?.enemies || [])
          .find(u => u.uid === b?.activeUid)?.name,
      };
    })()`);
    if (stt.enemyTurn) break;
    // 准备阶段若有「跳过榨取/模仿/神速」提示，先真实点击跳过
    const skip = page.locator("[data-skip-extract]");
    if (await skip.count()) {
      await skip.click();
      await settle(page);
      continue;
    }
    const btn = page.locator("[data-end-play]");
    if (!(await btn.count())) { console.log(`  [回合推进·${label}] 无结束出牌按钮`, JSON.stringify(stt)); break; }
    if (await btn.isDisabled().catch(() => false)) {
      await page.waitForTimeout(1500);
      continue;
    }
    await btn.click();
    await settle(page);
  }
  // 等敌方回合（含结束阶段）跑完并回到我方
  await page.waitForFunction(() => {
    const b = window.state.battle;
    return b && (b.allies || []).some(a => a.uid === b.activeUid);
  }, null, { timeout: 60000 }).catch(() => {});
  await settle(page);
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", e => errors.push(String(e)));

  // ================= 英雄级 =================
  await startBattleAt(page, "hell");
  const hell = await page.evaluate(peekTpl);
  console.log("英雄级1312:", JSON.stringify(hell));

  T("英雄级：1312 已挂上 battleRelics", (hell.battleRelics || []).length > 0, hell);
  T("英雄级：携带 魅魔钢叉", (hell.battleRelics || []).includes("魅魔钢叉"), hell);
  T("英雄级：携带 粉色魅魔装", (hell.battleRelics || []).includes("粉色魅魔装"), hell);
  T("英雄级：1312 为 boss 且 AI=ruins_witherer",
    hell.type === "boss" && hell.ai === "ruins_witherer", hell);

  // ---- 外神之眼：我方 a0 打 1312 → 使 a0 对 a1 虚拟出杀 ----
  await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    const w = b.enemies[0];
    const a0 = b.allies[0], a1 = b.allies[1];
    b.enemies.length = 1;
    w.hp = 300; w.maxHp = 300;
    w.hand = [];            // 清空手牌，避免她用【闪】抵消导致不受伤、外神之眼不触发
    a0.hp = 200; a1.hp = 200;
    a0.hand = [{ name: "杀", type: "kill", suit: "\\u2660", power: 0, scale: "attack" }];
    a0.hand.forEach(c => { delete c._pendingDraw; });
    a1.hand = [];
    b.activeUid = a0.uid; b.phase = 4; b.locked = false; b.animQueue = [];
    st.log = [];
    window.render();
    return true;
  })()`);
  // playActiveCard 签名是 (state, cardIndex, targetUid)，不是 (state, actor, target, card)
  const eyePlay = await page.evaluate(`(async () => {
    const st = window.state, b = st.battle;
    const a0 = b.allies[0], w = b.enemies[0];
    b.activeUid = a0.uid; b.phase = 4; b.locked = false;
    a0.intent = 2;
    const ok = await window.BattleSystem.playActiveCard(st, 0, w.uid);
    return { ok, foeHp: w.hp };
  })()`);
  console.log("[外神之眼·出牌]", JSON.stringify(eyePlay));
  await settle(page);
  const eyeRes = await page.evaluate(`(() => {
    const b = window.state.battle;
    return {
      allyHp: b.allies.map(x => x.hp),
      foeHp: b.enemies[0]?.hp,
      logs: (window.state.log || []).map(String),
    };
  })()`);
  const eyeLog = (eyeRes.logs || []).find(l => l.includes("外神之眼触发"));
  console.log("[外神之眼]", JSON.stringify(eyeRes.allyHp), "|", eyeLog || "无触发日志");
  T("外神之眼：1312 受伤后触发", !!eyeLog, { logs: (eyeRes.logs || []).slice(0, 8) });
  T("外神之眼：我方另一角色被同伴虚拟杀打中（掉血）",
    eyeRes.allyHp[1] < 200, eyeRes.allyHp);

  // ---- 魅魔吸精术：1312 用战术牌打男性 / 女性 / 无性别 ----
  const drainMale = await page.evaluate(`(async () => {
    const st = window.state, b = st.battle;
    const w = b.enemies[0], a0 = b.allies[0];
    b.enemies.length = 1;
    w.hp = 300;
    a0.gender = "male"; a0.hp = 300;
    a0.hand = [{ name: "甲的牌", type: "slash", suit: "\\u2660" }];
    a0.hand.forEach(c => { delete c._pendingDraw; });
    w.hand = [{ name: "战术测试", type: "tactic", suit: "\\u2663", power: 3, scale: "attack" }];
    w.hand.forEach(c => { delete c._pendingDraw; });
    b.activeUid = w.uid; b.phase = 4; b.locked = false; b.animQueue = [];
    st.log = [];
    window.render();
    await window.BattleSystem.useCard(st, w, a0, w.hand[0]);
    return { foeHand: (w.hand||[]).map(c=>c.name), allyHand: (a0.hand||[]).map(c=>c.name) };
  })()`);
  await settle(page);
  const maleLogs = await page.evaluate(logsTpl);
  const stealLog = (maleLogs.logs || []).find(l => l.includes("获得") && l.includes("魅魔吸精术"));
  console.log("[吸精·男性]", JSON.stringify(drainMale), "|", stealLog || "无偷牌日志");
  T("魅魔吸精术：对男性角色获得其一张牌", !!stealLog, drainMale);

  const drainFemale = await page.evaluate(`(async () => {
    const st = window.state, b = st.battle;
    const w = b.enemies[0], a0 = b.allies[0];
    b.enemies.length = 1;
    w.hp = 300;
    a0.gender = "female"; a0.hp = 300;
    a0.hand = [{ name: "乙的牌", type: "slash", suit: "\\u2660" }];
    a0.hand.forEach(c => { delete c._pendingDraw; });
    w.hand = [{ name: "战术测试", type: "tactic", suit: "\\u2663", power: 3, scale: "attack" }];
    w.hand.forEach(c => { delete c._pendingDraw; });
    b.activeUid = w.uid; b.phase = 4; b.locked = false; b.animQueue = [];
    st.log = [];
    window.render();
    await window.BattleSystem.useCard(st, w, a0, w.hand[0]);
    return { allyHand: (a0.hand||[]).map(c=>c.name) };
  })()`);
  await settle(page);
  const femaleLogs = await page.evaluate(logsTpl);
  const discardLog = (femaleLogs.logs || []).find(l => l.includes("弃置") && l.includes("魅魔吸精术"));
  console.log("[吸精·女性]", JSON.stringify(drainFemale), "|", discardLog || "无弃牌日志");
  T("魅魔吸精术：对女性角色弃置其一张牌", !!discardLog, drainFemale);

  // 无性别：伤害翻倍
  const dmgCmp = await page.evaluate(`(async () => {
    const st = window.state, b = st.battle;
    const w = b.enemies[0], a0 = b.allies[0];
    b.enemies.length = 1;
    w.hp = 300;
    const run = async gender => {
      a0.gender = gender; a0.hp = 300; a0.hand = [];
      w.hand = [{ name: "战术测试", type: "tactic", suit: "\\u2663", power: 3, scale: "attack" }];
      w.hand.forEach(c => { delete c._pendingDraw; });
      b.activeUid = w.uid; b.phase = 4; b.locked = false; b.animQueue = [];
      window.render();
      await window.BattleSystem.useCard(st, w, a0, w.hand[0]);
      return 300 - a0.hp;
    };
    const male = await run("male");
    const none = await run(undefined);
    return { male, none };
  })()`);
  await settle(page);
  console.log("[吸精·翻倍] 男性掉血", dmgCmp.male, "→ 无性别掉血", dmgCmp.none);
  T("魅魔吸精术：对无性别角色伤害翻倍",
    dmgCmp.male > 0 && dmgCmp.none === dmgCmp.male * 2, dmgCmp);

  // ---- 粉色魅魔装：红色牌对 1312 无效 ----
  const pinkRes = await page.evaluate(`(async () => {
    const st = window.state, b = st.battle;
    const w = b.enemies[0], a0 = b.allies[0];
    b.enemies.length = 1;
    const run = async suit => {
      w.hp = 300; w.maxHp = 300;
      a0.hp = 300; a0.gender = "male";
      a0.hand = [{ name: "杀", type: "kill", suit, power: 0, scale: "attack" }];
      a0.hand.forEach(c => { delete c._pendingDraw; });
      b.activeUid = a0.uid; b.phase = 4; b.locked = false; b.animQueue = [];
      a0.intent = 2;
      st.log = [];
      window.render();
      await window.BattleSystem.playActiveCard(st, 0, w.uid);
      return 300 - w.hp;
    };
    const red = await run("\\u2665");
    const black = await run("\\u2660");
    return { red, black };
  })()`);
  await settle(page);
  const pinkLogs = await page.evaluate(logsTpl);
  const pinkLog = (pinkLogs.logs || []).find(l => l.includes("粉色魅魔装"));
  console.log("[粉色魅魔装] 红牌伤害", pinkRes.red, "黑牌伤害", pinkRes.black);
  T("粉色魅魔装：红色牌对该角色无效", pinkRes.red === 0, pinkRes);
  T("粉色魅魔装：黑色牌照常生效", pinkRes.black > 0, pinkRes);

  // ---- 百眼魅魔：走真实敌方结束阶段 ----
  await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    const w = b.enemies[0];
    b.enemies.length = 1;
    w.hp = 300;
    // AI 在出牌阶段会把红桃当杀打出（杀意 2 + 钢叉 1 ≈ 用掉 3 张），
    // 故放宽手牌上限并塞 5 张，确保结束阶段仍有红桃可弃。
    (w.stats = w.stats || {}).handLimit = 99;
    w.hand = [
      { name: "红桃A", type: "slash", suit: "\\u2665", power: 0, scale: "attack" },
      { name: "红桃K", type: "slash", suit: "\\u2665", power: 0, scale: "attack" },
      { name: "红桃Q", type: "slash", suit: "\\u2665", power: 0, scale: "attack" },
      { name: "红桃J", type: "slash", suit: "\\u2665", power: 0, scale: "attack" },
      { name: "红桃10", type: "slash", suit: "\\u2665", power: 0, scale: "attack" },
    ];
    w.hand.forEach(c => { delete c._pendingDraw; });
    b.allies.forEach(u => {
      u.hp = 200; u.hand = [];
      (u.stats = u.stats || {}).handLimit = 99;   // 放宽上限，避免进入弃牌阶段卡住回合推进
    });
    b.locked = false; b.animQueue = [];
    st.log = [];
    window.render();
    return true;
  })()`);
  // 真实流程：我方结束出牌 → 敌方回合（AI 出牌 + 结束阶段）→ 回到我方
  await hookLogs(page);
  await clearLogs(page);
  await runEnemyTurn(page, '百眼');
  const hundredHp = await page.evaluate(`(() => window.state.battle.allies.map(x => x.hp))()`);
  const hundredLogs = await readLogs(page);
  const hundredRes = { allyHp: hundredHp, logs: hundredLogs };
  const enemyTurned = hundredLogs.some(l => l.includes("XX型凋零者1312号 可以出牌"));
  console.log("[百眼·敌方回合是否发生]", enemyTurned);
  const hundredLog = (hundredRes.logs || []).find(l => l.includes("发动百眼魅魔"));
  const eyeDriven = (hundredRes.logs || []).filter(l => l.includes("百眼魅魔使"));
  console.log("[百眼魅魔] 我方HP", JSON.stringify(hundredRes.allyHp),
    "|", hundredLog || "无发动日志", "| 驱动", eyeDriven.length, "次");
  T("测试前提：敌方 1312 的回合确实发生", enemyTurned, { logs: (hundredRes.logs || []).slice(0, 6) });
  T("百眼魅魔：真实回合中 AI 进入结束阶段并发动", !!hundredLog,
    { logs: (hundredRes.logs || []).slice(0, 20) });
  T("百眼魅魔：令我方互相视为使用虚拟杀", eyeDriven.length > 0,
    { driven: eyeDriven.length });

  // ---- 魅魔钢叉：真实回合中 AI 是否会使用（主动饰品） ----
  const forkInReal = (hundredRes.logs || []).filter(l => l.includes("魅魔钢叉"));
  console.log("[魅魔钢叉·真实回合] 命中日志", forkInReal.length, forkInReal.slice(0, 2));

  // 单独验证饰品本身可用（给 1312 红桃牌，手动走一次真实回合）
  await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    const w = b.enemies[0];
    b.enemies.length = 1;
    w.hp = 300;
    w.battleRelics = ["魅魔钢叉", "粉色魅魔装"];
    w.hand = [{ name: "红桃Q", type: "slash", suit: "\\u2665", power: 0, scale: "attack" }];
    w.hand.forEach(c => { delete c._pendingDraw; });
    b.allies.forEach(u => { u.hp = 300; u.hand = []; });
    b.activeUid = b.allies[0].uid; b.phase = 4; b.locked = false; b.animQueue = [];
    st.log = [];
    window.render();
    return true;
  })()`);
  await clearLogs(page);
  await runEnemyTurn(page, '钢叉');
  const forkHp = await page.evaluate(`(() => window.state.battle.allies.map(x => x.hp))()`);
  const forkLogs = await readLogs(page);
  const forkRes = { allyHp: forkHp, logs: forkLogs };
  const forkLog = (forkRes.logs || []).find(l => l.includes("魅魔钢叉"));
  console.log("[魅魔钢叉] 我方HP", JSON.stringify(forkRes.allyHp), "|", forkLog || "无钢叉日志");
  console.log("  该回合全部日志:", JSON.stringify(forkRes.logs.slice(0, 12)));

  await page.close();

  // ================= 普通级对照 =================
  const page2 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page2.on("pageerror", e => errors.push(String(e)));
  await startBattleAt(page2, "normal");
  const norm = await page2.evaluate(peekTpl);
  console.log("普通级1312:", JSON.stringify(norm));
  T("普通级：1312 不携带饰品", (norm.battleRelics || []).length === 0, norm);
  T("英雄级属性倍率已生效（HP 高于普通级）", hell.hp > norm.hp,
    { hell: hell.hp, normal: norm.hp });
  await page2.close();

  await browser.close();
  console.log(`\n页面错误: ${errors.length}` + (errors.length ? ` → ${errors.slice(0, 3).join(" | ")}` : ""));
  console.log(`=== ${pass}/${total} 通过 ===`);
  process.exit(pass === total && errors.length === 0 ? 0 : 1);
})().catch(e => { console.error("FATAL", e); process.exit(1); });
