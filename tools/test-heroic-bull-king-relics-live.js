// 英雄级【机械牛头王】是否携带并使用饰品。
//
// 背景：英雄级（hell）难度标注「精英与BOSS携带掉落饰品技能」，
// 装配点为 dungeon-enemies.js / hall-test-actions.js 的
//   if (diff.enemyRelics && ["elite","boss"].includes(base.type))
//     enemy.battleRelics = RelicSystem.enemyRelics(base.id)
// 而机械牛头王掉落的正是【格林机枪】与【霹雳之锤】——这两件描述都以
// 「你使用的实体单体【杀】」开头，是我方口径，需要确认敌方携带时：
//   ① 到底装不装得上
//   ② 装上后会不会真的生效
//   ③ 霹雳之锤走的是不是「敌方自动弃牌」分支（不会弹窗要求玩家点自己的手牌）
//
// 分批：BK=A|B|C|D|E，不设则跑全部。
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startFreshGame, dismissOpeningStory, openTestBattle } = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const PART = (process.env.BK || "ALL").toUpperCase();
const want = p => PART === "ALL" || PART === p;

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
};

const evalT = async (page, expr, ms = 20000, label = "evaluate") => {
  let timer;
  const guard = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`${label} timeout ${ms}ms`)), ms); });
  try { return await Promise.race([page.evaluate(expr), guard]); }
  catch (e) { console.log(`⚠️  ${label}: ${e.message}`); return null; }
  finally { clearTimeout(timer); }
};

const idle = async page => {
  await evalT(page, `(() => new Promise(r => {
    const t0 = Date.now();
    (function step() {
      const b = window.state?.battle;
      if (!b || (!window.BattleEffects?.animating && !window.BattleEffects?.draining && !b.animQueue?.length)) return r(true);
      if (Date.now() - t0 > 8000) return r(false);
      setTimeout(step, 60);
    })();
  })())`, 12000, "idle");
};

// 进入英雄级测试战斗：敌人只放机械牛头王。
async function enterHeroicBullKing(page, difficulty) {
  await openGame(page);
  await startFreshGame(page);
  await dismissOpeningStory(page);
  await openTestBattle(page);
  const idx = await page.evaluate(() => {
    const list = window.GameData.testEnemies || [];
    const i = list.findIndex(e => e && e.id === "mechanical_bull_king");
    return i;
  });
  if (idx < 0) throw new Error("testEnemies 中找不到机械牛头王");
  await page.evaluate(([i, diff]) => {
    window.state.testEnemies = [i];
    window.state.testDifficulty = diff;
    window.state.testAllies = ["abe_karuna", "elrana"];
    window.GameAssets.preloadBattle = async () => {};
    window.state.settings.battleSpeed = 2;
    window.BattleFX.playBattleStart = callback => callback?.();
    window.BattleLines.intro = () => 0;
    window.render();
  }, [idx, difficulty]);
  await page.locator("[data-start-test-battle]").click();
  await page.locator(".battle-screen").waitFor({ state: "visible", timeout: 30000 });
  await idle(page);
  await page.evaluate(() => {
    const b = window.state.battle;
    window.state.settings.battleSpeed = 1;
    b.animQueue = []; b.locked = false; b.phase = 4;
    window.render();
  });
}

const snapEnemies = `(() => {
  const b = window.state.battle;
  return b.enemies.map(e => ({
    name: e.name, id: e.id, type: e.type, ai: e.ai,
    battleRelics: e.battleRelics || [],
    defense: e.defenseSystem || 0, hp: e.hp, maxHp: e.maxHp,
  }));
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));

  try {
    // ── A 段：英雄级是否装配 ────────────────────────────────
    if (want("A")) {
      console.log("\n[A] 英雄级装配");
      await enterHeroicBullKing(page, "hell");
      const es = await evalT(page, snapEnemies);
      const bull = (es || []).find(e => e.id === "mechanical_bull_king");
      T("A1 战斗内存在机械牛头王", !!bull, es);
      T("A2 英雄级为其装配了饰品", (bull?.battleRelics?.length || 0) > 0, bull);
      T("A3 装配的是格林机枪", (bull?.battleRelics || []).includes("格林机枪"), bull?.battleRelics);
      T("A4 装配的是霹雳之锤", (bull?.battleRelics || []).includes("霹雳之锤"), bull?.battleRelics);
      // 界面上应出现「饰×N」徽标
      const badge = await evalT(page, `(() => {
        const el = document.querySelector(".enemy-relic-badge");
        return el ? el.textContent.trim() : null;
      })()`);
      T("A5 界面显示敌方饰品徽标", !!badge && /饰×\d/.test(badge), { badge });
      const logs = await evalT(page, `(() => (window.state.battleLog || []).join(" | "))()`);
      console.log("    战报:", String(logs || "").slice(-200));
    }

    // ── B 段：格林机枪是否真的生效（敌方） ──────────────────
    if (want("B")) {
      console.log("\n[B] 格林机枪（敌方携带）");
      await enterHeroicBullKing(page, "hell");
      const before = await evalT(page, `(() => {
        const st = window.state, b = st.battle;
        const bull = b.enemies.find(e => e.id === "mechanical_bull_king")
          || (b.enemies[0].battleRelics = ["格林机枪"], b.enemies[0]);
        bull.battleRelics = ["格林机枪"];
        bull.defenseSystem = 0; bull.annihilationMode = true; bull.usedGreenGatling = false;
        // 手牌：两张实体单体【杀】
        bull.hand = [
          { name: "杀", type: "kill", suit: "♠", text: "" },
          { name: "杀", type: "kill", suit: "♣", text: "" },
        ];
        const target = b.allies[0];
        target.hp = target.maxHp = 200; target.block = 0; target.hand = [];
        b.activeUid = bull.uid; b.phase = 4; b.locked = false; b.animQueue = [];
        st.battleLog = [];
        window.render();
        return { relics: bull.battleRelics, hand: bull.hand.length, targetHp: target.hp };
      })()`);
      T("B1 已装配格林机枪", (before?.relics || []).includes("格林机枪"), before);

      // 真实出牌路径
      await evalT(page, `(() => {
        const st = window.state, b = st.battle;
        const bull = b.enemies.find(e => e.id === "mechanical_bull_king") || b.enemies[0];
        const target = b.allies[0];
        const card = bull.hand[0];
        window.BattleSystem.useCard(st, bull, target, card);
        return true;
      })()`);
      await idle(page);
      const after = await evalT(page, `(() => {
        const st = window.state, b = st.battle;
        const bull = b.enemies.find(e => e.id === "mechanical_bull_king") || b.enemies[0];
        return {
          usedGreenGatling: !!bull.usedGreenGatling,
          handLeft: (bull.hand || []).length,
          targetHp: b.allies[0].hp,
          logs: (st.battleLog || []).join(" | "),
          locked: !!b.locked,
        };
      })()`);
      T("B2 格林机枪被标记为已发动", after?.usedGreenGatling === true, after);
      T("B3 战报出现格林机枪触发", /格林机枪触发/.test(after?.logs || ""), { logs: (after?.logs || "").slice(-300) });
      T("B4 追加的【杀】也被消耗（手牌清空）", after?.handLeft === 0, after);
      // 取战报里单次伤害的最大值；格林机枪生效时总掉血应为多张杀之和，必然大于单次。
      const maxHit = Math.max(0, ...[...String(after?.logs || "").matchAll(/造成(\d+)伤害/g)].map(m => parseInt(m[1], 10)));
      const totalDmg = 200 - Number(after?.targetHp || 200);
      T("B5 总掉血大于单次伤害（多张杀叠加）", totalDmg > maxHit, { ...after, maxHit, totalDmg });
      T("B6 未残留锁定", after?.locked === false, after);
      console.log("    战报:", String(after?.logs || "").slice(-300));
    }

    // ── C 段：霹雳之锤（敌方自动弃牌，不弹窗） ──────────────
    if (want("C")) {
      console.log("\n[C] 霹雳之锤（敌方携带）");
      await enterHeroicBullKing(page, "hell");
      const c0 = await evalT(page, `(() => {
        const st = window.state, b = st.battle;
        const bull = b.enemies.find(e => e.id === "mechanical_bull_king") || b.enemies[0];
        bull.battleRelics = ["霹雳之锤"];
        bull.defenseSystem = 0; bull.annihilationMode = true;
        const target = b.allies[0];
        target.hp = target.maxHp = 200; target.block = 0; target.statuses = [];
        // 目标手牌只有【闪】，确保这次杀被抵消
        // 用真实牌对象：裸造的 {name:"闪"} 缺 responseKind 等字段，
        // CardUtils.canRespondTo 认不出它是响应牌，闪根本不会被选中。
        const real = n => {
          const found = (window.GameData.baseDeck || []).find(c => c.name === n);
          return found ? { ...found } : { name: n };
        };
        target.hand = [real("闪")];
        bull.hand = [real("杀"), real("战术弃牌")];
        b.activeUid = bull.uid; b.phase = 4; b.locked = false; b.animQueue = [];
        delete b.thunderHammer;
        // 关闭「手动响应」：敌方出杀时我方自动用【闪】抵消，才能走到锤子分支。
        st.settings = st.settings || {}; st.settings.manualResponse = false;
        st.battleLog = [];
        window.render();
        return { relics: bull.battleRelics, dodge: target.hand.length };
      })()`);
      T("C1 已装配霹雳之锤", (c0?.relics || []).includes("霹雳之锤"), c0);

      await evalT(page, `(() => {
        const st = window.state, b = st.battle;
        const bull = b.enemies.find(e => e.id === "mechanical_bull_king") || b.enemies[0];
        const target = b.allies[0];
        window.BattleSystem.useCard(st, bull, target, bull.hand[0]);
        return true;
      })()`);
      await idle(page);
      const c1 = await evalT(page, `(() => {
        const st = window.state, b = st.battle;
        const bull = b.enemies.find(e => e.id === "mechanical_bull_king") || b.enemies[0];
        return {
          hammer: b.thunderHammer ? "pending" : null,
          locked: !!b.locked,
          bullHand: (bull.hand || []).length,
          targetHp: b.allies[0].hp,
          logs: (st.battleLog || []).join(" | "),
        };
      })()`);
      T("C3b 战报出现【闪】抵消", /闪/.test(c1?.logs || ""), { logs: (c1?.logs || "").slice(-300) });
      T("C2 敌方霹雳之锤不弹窗（无挂起）", c1?.hammer === null, c1);
      T("C3 未把战斗锁死", c1?.locked === false, c1);
      T("C4 战报出现敌方发动霹雳之锤", /发动霹雳之锤/.test(c1?.logs || ""), { logs: (c1?.logs || "").slice(-300) });
      T("C5 出掉的杀+锤子弃置共 2 张（2→0）", c1?.bullHand === 0, c1);
      T("C6 补伤已打到目标", c1?.targetHp !== undefined && c1?.targetHp < 200, c1);
      console.log("    战报:", String(c1?.logs || "").slice(-300));
    }

    // ── D 段：普通难度不应装配 ──────────────────────────────
    if (want("D")) {
      console.log("\n[D] 普通难度对照");
      await enterHeroicBullKing(page, "normal");
      const es = await evalT(page, snapEnemies);
      const bull = (es || []).find(e => e.id === "mechanical_bull_king") || es?.[0];
      T("D1 普通难度不装配饰品", (bull?.battleRelics?.length || 0) === 0, bull);
    }

    // ── E 段：非英雄级但敌人自带饰品时也不弹窗（防御） ────────
    if (want("E")) {
      console.log("\n[E] 饰品面板与技能可见性");
      await enterHeroicBullKing(page, "hell");
      const skills = await evalT(page, `(() => {
        const b = window.state.battle;
        const e = b.enemies.find(x => x.id === "mechanical_bull_king") || b.enemies[0];
        return (window.RelicSystem?.skillsForNames?.(e.battleRelics || []) || []).map(s => s.name);
      })()`);
      T("E1 敌方饰品可转成技能条目", (skills || []).length > 0, skills);
      T("E2 无 JS 错误", errors.length === 0, errors.slice(0, 3));
    }
  } catch (e) {
    console.log("FATAL", e && e.message);
  } finally {
    console.log(`\n合计 ${pass}/${total}`);
    await browser.close();
    process.exit(pass === total ? 0 : 1);
  }
})();
