// 实战：两个 AI / 饰品逻辑 BUG 的回归验证
// BUG1：AI 使用【拆解】/【偷窃】指向玩家角色时，优先移除状态牌（如【粘液】）。
//       状态牌是负面负担（粘液：不能弃置、打出需消耗杀意、可被判定致死），
//       替对手清掉等于反向帮忙。修复：只有对同阵营角色才优先清理状态牌。
// BUG2：【妖刀村雨】准备阶段自动斩只按血量升序取目标，未走 blocksKillTarget，
//       于是绕过希尔德「暗幕隐身」（持有黑色牌时不可被单体【杀】指定）这一锁定技。
//       修复：按血量升序取第一个「可被指定」的目标；若无人可被指定则不斩。
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

  const diag = await page.evaluate(() => ({
    useCard: typeof window.BattleSystem?.useCard,
    relic: typeof window.BattleRelicTurns?.prepare,
  }));
  console.log(`  诊断 useCard=${diag.useCard} relicPrepare=${diag.relic}`);

  console.log("\n【一】AI 拆解 / 偷窃：不得替对手清理状态牌");
  const r1 = await page.evaluate(() => {
    const state = window.state, b = state.battle;
    const api = window.BattleCardSpecials || window.BattleCardInteractions
      || window.BattleCardHandInteractions || {};
    const slime = () => ({ name: "粘液", type: "status" });
    const dodge = () => ({ name: "闪", type: "response" });
    const out = {};
    const ally = b.allies[0], enemy = b.enemies[0];
    const mate = b.enemies.find(u => u.uid !== enemy.uid) || enemy;

    // 走真实出牌入口（BattleSystem.useCard），与 AI 实际出牌同一条结算链
    const use = (actor, target, card) => {
      actor.hand = [card];
      return window.BattleSystem.useCard(state, actor, target, card);
    };
    const left = u => (u.hand || []).filter(c => !c._pendingDraw).map(c => c.name);
    const dismantle = () => ({ name: "拆解", type: "tactic", discardTarget: true });
    const steal = () => ({ name: "偷窃", type: "tactic", stealCard: true });

    // A：AI 拆解玩家角色 → 应弃【闪】，保留【粘液】
    window.BattleTurnState?.cleanupPrompts?.(state.battle);
    state.battle.locked = false;
    ally.noResponse = true;
    ally.hand = [slime(), dodge()];
    const okA = use(enemy, ally, dismantle());
    out.a = { ok: okA, left: left(ally), locked: state.battle.locked,
      anim: (state.battle.animQueue || []).length,
      reveal: !!state.battle.handReveal, handLen: ally.hand.length };

    // B：AI 偷窃玩家角色 → 应偷【闪】，保留【粘液】
    ally.hand = [slime(), dodge()];
    const okB = use(enemy, ally, steal());
    out.b = { ok: okB, left: left(ally) };

    // C：对照组 AI 对自己队友 → 仍应优先清理状态牌
    mate.hand = [slime(), dodge()];
    const okC = use(enemy, mate, dismantle());
    out.c = { ok: okC, left: left(mate) };

    out.sides = { ally: ally.side, enemy: enemy.side, mate: mate.side };
    out.isStatusOk = !!window.BattleStatusCards?.isStatus?.(slime());
    return out;
  });
  check("前置：状态牌可被 isStatus 识别", r1.isStatusOk);
  check("前置：阵营正确（AI=enemy / 玩家=ally）",
    r1.sides.enemy === "enemy" && r1.sides.ally === "ally", JSON.stringify(r1.sides));
  check("A 拆解玩家：不移除状态牌", JSON.stringify(r1.a.left) === JSON.stringify(["粘液"]),
    `left=${JSON.stringify(r1.a.left)} ok=${r1.a.ok}`);
  check("B 偷窃玩家：不偷走状态牌", JSON.stringify(r1.b.left) === JSON.stringify(["粘液"]),
    `left=${JSON.stringify(r1.b.left)} ok=${r1.b.ok}`);
  check("C 对照组：对同阵营仍优先清状态牌",
    JSON.stringify(r1.c.left) === JSON.stringify(["闪"]),
    `left=${JSON.stringify(r1.c.left)} ok=${r1.c.ok}`);

  console.log("\n【二】妖刀村雨：必须遵守暗幕隐身锁定技");
  const r2 = await page.evaluate(() => {
    const state = window.state, b = state.battle;
    const orig = window.RelicSystem.hasEquipped;
    window.RelicSystem.hasEquipped = () => true;
    const out = {};
    const black = () => ({ name: "杀", suit: "♠", type: "slash" });
    const [e0, e1] = b.enemies;
    const run = () => {
      let used = null;
      const ok = window.BattleRelicTurns.prepare(state, b.allies[0],
        (s, u, t) => { used = t.uid; return true; }, () => {});
      return { ok, used };
    };

    // D：e0=隐身希尔德且血量最低，e1=普通 → 应跳过 e0 斩 e1
    e0.ai = "ruins_hilde"; e0.hp = 10; e0.hand = [black()];
    e1.ai = "plain"; e1.hp = 90; e1.hand = [];
    out.d = run();
    out.dStealth = !!window.RuinsEnemySkills?.blocksKillTarget?.(e0,
      window.CardUtils.fromEntity("杀（普攻）", {}));

    // E：只剩隐身希尔德 → 无人可被指定，不斩
    e1.hp = 0;
    out.e = run();

    // F：希尔德无黑色牌（未隐身）→ 正常斩血量最低的她
    e1.hp = 90;
    e0.hand = [];
    out.f = run();
    out.fStealth = !!window.RuinsEnemySkills?.blocksKillTarget?.(e0,
      window.CardUtils.fromEntity("杀（普攻）", {}));

    out.uids = { e0: e0.uid, e1: e1.uid };
    window.RelicSystem.hasEquipped = orig;
    return out;
  });
  check("前置：隐身中希尔德确实 blocksKillTarget", r2.dStealth === true);
  check("D 隐身希尔德血量最低：跳过她，斩另一敌人",
    r2.d.ok === true && r2.d.used === r2.uids.e1,
    `ok=${r2.d.ok} used=${r2.d.used} e0=${r2.uids.e0} e1=${r2.uids.e1}`);
  check("E 只剩隐身目标：不斩", r2.e.ok === false && r2.e.used === null,
    `ok=${r2.e.ok} used=${r2.e.used}`);
  check("F 未隐身（无黑色牌）：正常斩血量最低者",
    r2.f.ok === true && r2.f.used === r2.uids.e0,
    `ok=${r2.f.ok} used=${r2.f.used} stealth=${r2.fStealth}`);

  check("无页面错误", errors.length === 0, errors.slice(0, 3).join(";"));
  console.log(`\n汇总：${pass} 通过 / ${fail} 失败`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
