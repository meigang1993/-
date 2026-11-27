// 非锁定技 / 饰品「不发动也不该有台词和『发动了』字幕」实机回归。
// 走真实页面装配：挂起提示阶段不得出现技能字幕、发动战报、角色台词页；
// 确认发动后才允许出现。修复前 A/B/C 组应打红，修复后全绿。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle, collectErrors, relevantErrors } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const passed = [];
const T = (n, ok, d = "") => {
  passed.push(!!ok);
  console.log(`${ok ? "✅" : "❌"} ${n}${ok ? "" : "  ← " + JSON.stringify(d)}`);
  return !!ok;
};

// 每个场景独立复位 battle，清掉上一场景残留的字幕 / 台词 / 战报。
const RESET = (extra) => `(() => {
  const st = window.state, b = st.battle;
  b.locked = false; b.animQueue = []; b._damageDepth = 0; b.phase = 4;
  ['dimensionTransfer','cadicisResponsibility','kaiichiShare','ailengDrillPicker',
   'thunderHammer','gerdaComfort','karunaBubble','newMoonShare','counterTrigger',
   'opheliaGuard','manualDodgeResume','cadicisResponsibilityResume',
   'counterTriggerQueue','risaUmbrellaResolvingUids'].forEach(k => { b[k] = null; });
  b.skillCaptions = []; b.skillCaption = null;
  b.relicCaptions = []; b.relicCaption = null; b.speech = null;
  st.battleLog = []; st.log = [];
  window.BattleEffects.animating = false; window.BattleEffects.draining = false;
  b.allies.forEach((a, i) => { a.hp = 100; a.maxHp = 100; a.hand = []; a.statuses = [];
    a.battleRelics = []; a.skills = []; a.ref = "ally" + i; a.name = "队友" + i; });
  b.enemies.forEach((e, i) => { e.hp = 100; e.maxHp = 100; e.hand = []; e.name = "敌人" + i; });
  ${extra || ""}
  window.render && window.render();
  return true;
})()`;

const SNAP = `(() => {
  const st = window.state, b = st.battle;
  const captions = (b.skillCaptions || []).map(c => c.text);
  const relics = (b.relicCaptions || []).map(c => c.text);
  return {
    captions, relics, skillCaption: b.skillCaption?.text || null,
    relicCaption: b.relicCaption?.text || null,
    speech: b.speech?.text || b.speech?.lines?.join("|") || null,
    battleLog: (st.battleLog || []).slice(0, 8),
  };
})()`;

const noLaunch = s => !s.captions.some(t => /发动了/.test(t))
  && !s.relics.some(t => /触发了|使用了/.test(t))
  && !s.battleLog.some(t => /发动技能【|触发饰品【|使用饰品【/.test(t))
  && !s.speech;

async function snap(page) {
  await page.waitForTimeout(450);   // 等 requestAnimationFrame / setTimeout(0) 台词页
  return page.evaluate(SNAP);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = collectErrors(page);
  await openGame(page);
  await startRegressionBattle(page);

  // ── A. 次元转移：挂起提示阶段 ──
  await page.evaluate(RESET(`
b.allies[0].name = "曼妮"; b.allies[0].ref = "manny";
    b.allies[0].hand = [{ name: "杀", type: "slash", suit: "♠", scale: "attack" },
                        { name: "闪", type: "response", suit: "♥" }];
    b.allies[1].name = "被保护者";
    b.activeUid = b.allies[0].uid;
    window.MannySkills.transferSlash(st, b.enemies[0], b.allies[1], 7, "测试杀",
      { name: "杀", type: "slash", suit: "♠", scale: "attack" });
  `));
  const a = await snap(page);
  console.log("A_次元转移挂起", JSON.stringify(a));
  T("A1 次元转移：只挂起、未发动时无台词/无「发动了」字幕/无发动战报", noLaunch(a), a);

  // 点「跳过（不发动）」后仍不得残留
  const skipBtn = page.locator("[data-dimension-transfer-skip]").first();
  if (await skipBtn.count()) await skipBtn.click().catch(() => {});
  const a2 = await snap(page);
  console.log("A_次元转移跳过", JSON.stringify(a2));
  T("A2 次元转移：跳过之后依然没有台词/发动字幕", noLaunch(a2), a2);

  // ── A3 正向：确认发动时才允许出现台词与字幕 ──
  await page.evaluate(RESET(`
const u = b.allies[0]; u.name = "曼妮"; u.ref = "manny";
    u.skills = [{ name: "次元转移" }];
    window.BattleLines.skill(st, u, "次元转移", b.enemies[0]);
  `));
  const a3 = await snap(page);
  console.log("A_确认发动正向", JSON.stringify(a3));
  T("A3 正向：显式确认发动仍会显示台词与「发动了」字幕（机制未被改坏）",
    a3.captions.some(t => t.includes("发动了 次元转移"))
    && a3.battleLog.some(t => t.includes("发动技能【次元转移】")), a3);

  // ── A4/A5 正向：走真实确认发动路径，台词与字幕要回来 ──
  await page.evaluate(RESET(`
    b.allies[0].name = "曼妮"; b.allies[0].ref = "manny";
    b.allies[0].hand = [{ name: "杀", type: "slash", suit: "♠", scale: "attack" }];
    b.allies[1].name = "被保护者"; b.activeUid = b.allies[0].uid;
    window.MannySkills.transferSlash(st, b.enemies[0], b.allies[1], 7, "测试杀",
      { name: "杀", type: "slash", suit: "♠", scale: "attack" });
    b.dimensionTransfer.costIndex = 0;
    window.MannySkills.resolveDimensionTransfer(st, b.enemies[0].uid,
      (ss, t, amt) => ({ hpLoss: amt }));
  `));
  const a4 = await snap(page);
  console.log("A_次元转移确认发动", JSON.stringify(a4));
  T("A4 正向：确认发动次元转移后台词与「发动了」字幕照常出现",
    a4.captions.some(t => t.includes("发动了 次元转移"))
    // BattleLog.add 的 _pendingBattleSkillLog 会把「发动技能【X】」替换成更具体的
    // 结果战报（既有设计），所以这里只要求战报确实写到「发动次元转移」。
    && a4.battleLog.some(t => t.includes("发动次元转移")), a4);

  await page.evaluate(RESET(`
    b.allies[0].name = "卡迪西斯"; b.allies[0].ref = "cadicis";
    b.allies[0].hand = [{ name: "闪", type: "response", suit: "♥" }];
    b.allies[1].name = "被指定者";
    window.CadicisResponsibility.beforeKillTargeted(st, b.enemies[0], b.allies[1],
      { name: "杀", type: "slash", suit: "♠" },
      { draw: () => [{ name: "闪", type: "response", suit: "♥" }] });
    window.CadicisResponsibility.resolveResponsibility(st, 0);
  `));
  const a5 = await snap(page);
  console.log("A_指挥官责任确认交牌", JSON.stringify(a5));
  T("A5 正向：确认交牌后指挥官责任台词与字幕照常出现",
    a5.captions.some(t => t.includes("发动了 指挥官责任"))
    && a5.battleLog.some(t => t.includes("发动技能【指挥官责任】")), a5);

  await page.evaluate(RESET(`
    const u = b.allies[0]; u.name = "星野一"; u.ref = "hoshino_kaiichi";
    u.skills = [{ name: "半魅魔血" }]; u.hand = [
      { name: "闪", type: "response", suit: "♥" },
      { name: "闪", type: "response", suit: "♥" }];
    b.allies[1].name = "接收者";
    const share = window.HoshinoKaiichiShare({
      alive: x => !!x && x.hp > 0,
      allUnits: bb => bb.allies.concat(bb.enemies || []),
    });
    share.queueShare(st, u, b.enemies[0]);
    share.toggleShareCard(st, 0);   // 必须先选牌，resolveShare 才认作确认交牌
    share.resolveShare(st, b.allies[1].uid);
  `));
  const a6 = await snap(page);
  console.log("A_半魅魔血确认交牌", JSON.stringify(a6));
  T("A6 正向：确认交牌后半魅魔血台词与字幕照常出现",
    a6.captions.some(t => t.includes("发动了 半魅魔血"))
    && a6.battleLog.some(t => t.includes("发动技能【半魅魔血】")), a6);

  await page.evaluate(RESET(`
    const u = b.allies[0]; u.name = "艾伦格"; u.ref = "aileng";
    u.skills = [{ name: "战斗演练" }]; b.allies[1].name = "接收者";
    window.GuestAilengSkills.afterCardPlayed(st, u,
      { name: "杀", type: "slash", suit: "♠", scale: "attack" });
    window.GuestAilengSkills.resolveBattleDrill(st, b.allies[1].uid);
  `));
  const a7 = await snap(page);
  console.log("A_战斗演练确认交牌", JSON.stringify(a7));
  T("A7 正向：确认交牌后战斗演练台词与字幕照常出现",
    a7.captions.some(t => t.includes("发动了 战斗演练"))
    && a7.battleLog.some(t => t.includes("发动战斗演练")), a7);

  // ── B. 饰品：提示性日志不得自动弹字幕 ──
  await page.evaluate(RESET(`
const u = b.allies[0]; u.name = "曼妮"; u.battleRelics = ["霹雳之锤"];
    window.BattleLog.add(st, "曼妮 的霹雳之锤可发动：选择一张手牌弃置，令该杀强制造成伤害。");
  `));
  const b1 = await snap(page);
  console.log("B_霹雳之锤可发动", JSON.stringify(b1));
  T("B1 霹雳之锤：仅「可发动」提示日志不得显示「触发了饰品」字幕/战报", noLaunch(b1), b1);

  await page.evaluate(RESET(`
const u = b.allies[0]; u.name = "曼妮"; u.battleRelics = ["霹雳之锤"];
    window.BattleLog.add(st, "曼妮 的霹雳之锤触发，该杀强制造成伤害。");
  `));
  const b2 = await snap(page);
  console.log("B_霹雳之锤真触发", JSON.stringify(b2));
  T("B2 正向：饰品真触发日志仍显示字幕（机制未被改坏）",
    b2.relics.some(t => t.includes("霹雳之锤")) || b2.relicCaption?.includes("霹雳之锤"), b2);

  await page.evaluate(RESET(`
const u = b.allies[0]; u.name = "曼妮"; u.battleRelics = ["鬼王扑克"];
    window.BattleLog.add(st, "曼妮 发动鬼王扑克失败：请选择一张非战术牌和一名敌方目标。");
  `));
  const b3 = await snap(page);
  console.log("B_鬼王扑克发动失败", JSON.stringify(b3));
  T("B3 「发动饰品失败」日志不得显示触发字幕/战报", noLaunch(b3), b3);

  // ── C. 指挥官责任 / 半魅魔血 / 战斗演练：挂起阶段 ──
  await page.evaluate(RESET(`
b.allies[0].name = "卡迪西斯"; b.allies[0].ref = "cadicis";
    b.allies[1].name = "被指定者";
    window.CadicisResponsibility.beforeKillTargeted(st, b.enemies[0], b.allies[1],
      { name: "杀", type: "slash", suit: "♠" },
      { draw: () => [{ name: "闪", type: "response", suit: "♥" }] });
  `));
  const c1 = await snap(page);
  console.log("C_指挥官责任挂起", JSON.stringify(c1));
  T("C1 指挥官责任：挂起未发动时无台词/无发动字幕/无发动战报", noLaunch(c1), c1);

  await page.evaluate(RESET(`
const u = b.allies[0]; u.name = "星野一"; u.ref = "hoshino_kaiichi";
    u.skills = [{ name: "半魅魔血" }]; u.hand = [
      { name: "闪", type: "response", suit: "♥" },
      { name: "闪", type: "response", suit: "♥" }];
    b.allies[1].name = "接收者";
    window.HoshinoKaiichiShare({
      alive: x => !!x && x.hp > 0,
      allUnits: bb => bb.allies.concat(bb.enemies || []),
    }).queueShare(st, u, b.enemies[0]);
  `));
  const c2 = await snap(page);
  console.log("C_半魅魔血挂起", JSON.stringify(c2));
  T("C2 半魅魔血：交牌提示挂起时无台词/无发动字幕/无发动战报", noLaunch(c2), c2);

  await page.evaluate(RESET(`
const u = b.allies[0]; u.name = "艾伦格"; u.skills = [{ name: "战斗演练" }];
    b.allies[1].name = "接收者";
    window.GuestAilengSkills.afterCardPlayed(st, u,
      { name: "杀", type: "slash", suit: "♠", scale: "attack" });
  `));
  const c3 = await snap(page);
  console.log("C_战斗演练挂起", JSON.stringify(c3));
  T("C3 战斗演练：挂起未交牌时无台词/无发动字幕/无发动战报", noLaunch(c3), c3);

  // ── E. 全库饰品标签 / 图标实机（用户点名「检查所有饰品、图标可能没改」） ──
  const icons = await page.evaluate(`(() => {
    const R = window.RelicSystem;
    const locked = ["推进器","智能大脑","粉色魅魔装","冰心双刺剑","导弹发射器","物资货物"];
    const blue = ["霹雳之锤","血色刺伞"];
    const active = ["鬼王扑克","魅魔钢叉","刺客胶衣","武器库","1124号长舌头","军令状"];
    return {
      umbrella: { icon: R.skillIcon("血色刺伞"), type: R.typeName("血色刺伞"),
        hint: R.useHint("血色刺伞"), stat: R.statText("血色刺伞"),
        skill: R.skillsForNames(["血色刺伞"])[0] },
      lockedOk: locked.every(n => R.skillIcon(n) === "⭐"
        && R.data(n).effect.startsWith("锁定技，")),
      blueOk: blue.every(n => R.skillIcon(n) === "🔵"
        && R.data(n).effect.startsWith("非锁定技，")),
      activeOk: active.every(n => R.skillIcon(n) === "⚔️"
        && !/^(锁定技|非锁定技)，/.test(R.data(n).effect)),
      propeller: { icon: R.skillIcon("螺旋桨"), effect: R.data("螺旋桨").effect },
    };
  })()`);
  console.log("E_饰品图标", JSON.stringify(icons));
  T("E1 【血色刺伞】实机显示 🔵 / 触发饰品 / 「非锁定技，」前缀（此前一直 ⭐ 且无前缀）",
    icons.umbrella.icon === "🔵" && icons.umbrella.type === "触发"
    && icons.umbrella.stat.includes("非锁定技，")
    && icons.umbrella.hint.includes("弹出响应选择")
    && icons.umbrella.skill?.icon === "🔵"
    && icons.umbrella.skill?.text?.startsWith("非锁定技，"), icons.umbrella);
  T("E2 全库三类饰品实机一致：6 件废墟锁定技 ⭐ + 2 件 🔵 非锁定技 + 6 件主动技 ⚔️ + 螺旋桨仍 ⭐",
    icons.lockedOk && icons.blueOk && icons.activeOk
    && icons.propeller.icon === "⭐"
    && icons.propeller.effect.startsWith("锁定技，"), icons);

  // E3/E4：血色刺伞挂起「可以发动」与点「跳过」都不得有台词/字幕/发动战报
  await page.evaluate(RESET(`
    const u = b.allies[0]; u.name = "丽莎"; u.ref = "sakura_risa";
    u.battleRelics = ["血色刺伞"];
    window.BattleCounterTriggers.open(st, {
      skill: "血色刺伞", unitUid: u.uid, sourceUid: u.uid, targetUid: u.uid,
    });
  `));
  const e3 = await snap(page);
  console.log("E_血色刺伞挂起", JSON.stringify(e3));
  T("E3 血色刺伞：只挂起「可以发动」时无台词/无「发动了」字幕/无发动战报", noLaunch(e3), e3);
  await page.evaluate(`(() => {
    window.BattleCounterTriggers.resolve(window.state, false, { checkDefeat() {}, checkEnd() {} });
    return true;
  })()`);
  const e4 = await snap(page);
  console.log("E_血色刺伞跳过", JSON.stringify(e4));
  T("E4 血色刺伞：点「跳过」后仍无台词/发动字幕", noLaunch(e4), e4);

  // E5 正向：确认发动分支仍会播台词与字幕
  await page.evaluate(RESET(`
    const u = b.allies[0]; u.name = "丽莎"; u.battleRelics = ["血色刺伞"];
    window.BattleLines.skill(st, u, "血色刺伞", null);
  `));
  const e5 = await snap(page);
  console.log("E_血色刺伞确认发动", JSON.stringify(e5));
  // 饰品走 RelicSystem.isKnown → showRelicCaption，文案是「触发了 XX」而非角色技能的「发动了」。
  T("E5 正向：确认发动血色刺伞仍显示饰品字幕与「触发饰品」战报（机制未被改坏）",
    e5.relics.some(t => t.includes("血色刺伞"))
    && e5.battleLog.some(t => t.includes("触发饰品【血色刺伞】")), e5);

  const rel = relevantErrors(errors);
  T("D1 全程无 pageerror / console error", rel.length === 0, rel.slice(0, 3));
  console.log(`\nRESULT ${passed.filter(Boolean).length}/${passed.length}`);
  await browser.close();
  process.exit(passed.every(Boolean) ? 0 : 1);
})();
