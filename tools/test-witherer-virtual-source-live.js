// 外神之眼 / 百眼魅魔 虚拟【杀】的「伤害来源」归属 + 希尔德两饰品【刺杀】原牌效果
//
// ① 外神之眼与百眼魅魔都通过 useVirtualKill 让「被驱动的角色」出虚拟杀。
//    被驱动的应当是我方角色、目标是我方另一名角色（同阵营互砍），
//    绝不能变成「敌方凋零者」打我方——那会把伤害来源错记成敌方。
//    验证三件事：actor 是我方、target 是我方、伤害数值取 actor 的攻击力。
// ② 希尔德两件饰品（冰心双刺剑 / 刺客胶衣）转换出的【刺杀】，
//    是否保留原牌【刺杀】的「弃置目标 1 张手牌」效果。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  const ok = !!cond;
  if (ok) pass++;
  console.log(`${ok ? "✅" : "❌"} ${name}` + (ok ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return ok;
};

// 包装 useVirtualKill，同步记录每次驱动的角色/目标/牌
const HOOK_VK = `(() => {
  if (window.__vkHooked) return true;
  const orig = window.BattleSystem.useVirtualKill;
  if (typeof orig !== "function") return false;
  window.__vkLog = [];
  window.BattleSystem.useVirtualKill = function (state, actor, target, card) {
    const rec = {
      actor: actor?.name, actorSide: actor?.side, actorUid: actor?.uid,
      actorAttack: actor?.stats?.attack,
      target: target?.name, targetSide: target?.side, targetUid: target?.uid,
      card: card?.name, gen: card?.generatedBySkill || "", virtual: !!card?.virtual,
    };
    window.__vkLog.push(rec);
    // virtual 标记由 useVirtualKill 内部补上，调用后才是最终值
    const r = orig.apply(this, arguments);
    rec.virtualAfter = !!card?.virtual;
    return r;
  };
  window.__vkHooked = true;
  return true;
})()`;

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", e => errors.push(String(e)));
  await openGame(page);
  await startRegressionBattle(page);
  T("useVirtualKill 钩子安装成功", await page.evaluate(HOOK_VK) === true);

  // =====================================================================
  // ① 外神之眼：我方 A 用实体牌打凋零者 → 驱动 A 对我方 B 出虚拟杀
  // =====================================================================
  const setupEye = `(() => {
    const st = window.state, b = st.battle;
    const a0 = b.allies[0], a1 = b.allies[1];
    const w = b.enemies[0];
    b.enemies.length = 1;
    w.ai = "ruins_witherer"; w.name = "XX型凋零者1312号"; w.gender = "female";
    w.hp = 300; w.maxHp = 300;
    w.stats = Object.assign({}, w.stats, { attack: 12, magic: 11 });
    w.hand = [];
    b.activeUid = a0.uid; b.phase = 4; b.locked = false; b.animQueue = [];
    b.selectedCardIndex = null; b.selectedSkillCard = null; b.pendingTargetUid = null;
    a0.intent = 9; a0.hp = 200; a0.maxHp = 200;
    a0.stats = Object.assign({}, a0.stats, { attack: 5, magic: 3 });
    a1.hp = 200; a1.maxHp = 200; a1.hand = [];
    a1.stats = Object.assign({}, a1.stats, { attack: 7, magic: 3 });
    a0.hand = [{ name: "战术测试", type: "tactic", suit: "♠", power: 3, scale: "attack" },
               { name: "备用牌", type: "tactic", suit: "♦" }];
    a0.hand.forEach(c => { delete c._pendingDraw; });
    st.log = [];
    window.__vkLog = [];
    window.render();
    return { allies: b.allies.map(x => ({ n: x.name, s: x.side, hp: x.hp, atk: x.stats.attack })),
             foe: { n: w.name, s: w.side, hp: w.hp, atk: w.stats.attack } };
  })()`;

  const eyeCtx = await page.evaluate(setupEye);
  console.log(`[构造] 我方=${JSON.stringify(eyeCtx.allies)} 敌方=${JSON.stringify(eyeCtx.foe)}`);
  T("构造：我方 2 名存活、敌方 1 名凋零者", eyeCtx.allies.length >= 2
    && eyeCtx.allies.every(a => a.hp > 0 && a.s === "ally")
    && eyeCtx.foe.s === "enemy", eyeCtx);

  const eyePlay = await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    const ok = window.BattleSystem.playActiveCard(st, 0, b.enemies[0].uid);
    return { ok, foeHp: b.enemies[0].hp, handLen: b.allies[0].hand.length };
  })()`);
  // 外神之眼的回调经 delayUntilHitSettled 挂在受击动画之后，
  // 固定 sleep 会采到"还没执行"的半成品状态（实测会延迟到下一次 evaluate 才落地）。
  // 必须等钩子真的记录到，否则断言恒假。
  await page.waitForFunction(
    `!!(window.__vkLog || []).some(v => v.gen === "外神之眼")`,
    null, { timeout: 9000 }).catch(() => {});

  const eyeRes = await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    return {
      vk: window.__vkLog || [],
      allyHp: b.allies.map(x => x.hp),
      handLens: b.allies.map(x => (x.hand || []).length),
      logs: (st.log || []).map(String),
    };
  })()`);
  console.log(`[外神之眼] playActiveCard=${JSON.stringify(eyePlay)}`);
  console.log(`[外神之眼] 驱动记录=${JSON.stringify(eyeRes.vk)}`);
  console.log(`[外神之眼] 我方血量=${JSON.stringify(eyeRes.allyHp)}`);
  eyeRes.logs.slice(0, 12).forEach(t => console.log(`   日志: ${t}`));

  const eyeVk = (eyeRes.vk || []).find(v => v.gen === "外神之眼");
  T("外神之眼：确实驱动了一次虚拟杀", !!eyeVk, eyeRes.vk);
  T("外神之眼：出杀者是我方角色（side=ally），不是敌方凋零者",
    !!eyeVk && eyeVk.actorSide === "ally", eyeVk);
  T("外神之眼：目标是我方另一名角色（同阵营互砍）",
    !!eyeVk && eyeVk.targetSide === "ally" && eyeVk.targetUid !== eyeVk.actorUid, eyeVk);
  T("外神之眼：虚拟杀带 generatedBySkill=外神之眼 且 virtual=true",
    !!eyeVk && eyeVk.gen === "外神之眼" && eyeVk.virtualAfter === true, eyeVk);
  const a0 = eyeCtx.allies[0], a1 = eyeCtx.allies[1];
  T("外神之眼：伤害数值取出杀者的攻击力（而非凋零者的 12）",
    eyeRes.allyHp[1] < 200 && (200 - eyeRes.allyHp[1]) === a0.atk,
    { hp: eyeRes.allyHp, a0atk: a0.atk, foeAtk: eyeCtx.foe.atk, loss: 200 - eyeRes.allyHp[1] });
  // 虚拟杀不在手牌里：打出战术牌后应只剩 1 张备用牌。
  // 旧 BUG：resolveCard 里 splice(indexOf=-1, 1) 会把手牌最后一张（备用牌）删掉。
  console.log(`[外神之眼] 出牌后手牌数=${JSON.stringify(eyeRes.handLens)}`);
  T("外神之眼：虚拟杀不消耗出杀者手牌（打出1张后应剩1张）",
    eyeRes.handLens[0] === 1,
    { handLens: eyeRes.handLens, vkCount: (eyeRes.vk || []).length });

  // =====================================================================
  // ② 百眼魅魔：结束阶段弃红桃 → 驱动我方逐一互相出虚拟杀
  // =====================================================================
  const setupHundred = `(() => {
    const st = window.state, b = st.battle;
    const w = b.enemies[0];
    b.enemies.length = 1;
    w.ai = "ruins_witherer"; w.name = "XX型凋零者1312号"; w.gender = "female";
    w.hp = 300; w.maxHp = 300;
    w.stats = Object.assign({}, w.stats, { attack: 12, magic: 11 });
    w.hand = [{ name: "红桃牌A", type: "tactic", suit: "♥" },
              { name: "红桃牌B", type: "tactic", suit: "♥" }];
    w.hand.forEach(c => { delete c._pendingDraw; });
    b.activeUid = w.uid; b.phase = 5; b.locked = false; b.animQueue = [];
    b.allies.forEach(a => {
      a.hp = 200; a.maxHp = 200;
      a.hand = [{ name: "友方备用牌", type: "tactic", suit: "♦" }];
      a.hand.forEach(c => { delete c._pendingDraw; });
    });
    b.allies[0].stats = Object.assign({}, b.allies[0].stats, { attack: 5 });
    b.allies[1].stats = Object.assign({}, b.allies[1].stats, { attack: 7 });
    st.log = [];
    window.__vkLog = [];
    window.render();
    return { allies: b.allies.map(x => ({ n: x.name, hp: x.hp, atk: x.stats.attack })) };
  })()`;

  const hCtx = await page.evaluate(setupHundred);
  console.log(`[构造] 我方=${JSON.stringify(hCtx.allies)}`);
  await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    window.RuinsWithererSkills.endTurn(st, b.enemies[0]);
    return true;
  })()`);
  await page.waitForTimeout(1800);

  const hRes = await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    return { vk: window.__vkLog || [], allyHp: b.allies.map(x => x.hp),
             handLens: b.allies.map(x => (x.hand || []).length),
             logs: (st.log || []).map(String) };
  })()`);
  console.log(`[百眼魅魔] 驱动记录=${JSON.stringify(hRes.vk)}`);
  console.log(`[百眼魅魔] 我方血量=${JSON.stringify(hRes.allyHp)}`);
  hRes.logs.filter(t => /百眼魅魔|使用杀/.test(t)).slice(0, 6)
    .forEach(t => console.log(`   日志: ${t}`));

  const hVk = (hRes.vk || []).filter(v => v.gen === "百眼魅魔");
  T("百眼魅魔：确实驱动了虚拟杀", hVk.length >= 1, hRes.vk);
  T("百眼魅魔：出杀者全部是我方角色（side=ally）",
    hVk.length >= 1 && hVk.every(v => v.actorSide === "ally"), hVk);
  T("百眼魅魔：目标全部是我方角色，且与出杀者不同",
    hVk.length >= 1 && hVk.every(v => v.targetSide === "ally" && v.targetUid !== v.actorUid), hVk);
  T("百眼魅魔：无任何一次由敌方凋零者出手",
    hVk.every(v => v.actor !== "XX型凋零者1312号"), hVk);
  console.log(`[百眼魅魔] 驱动后手牌数=${JSON.stringify(hRes.handLens)}`);
  T("百眼魅魔：虚拟杀不消耗出杀者手牌（每人仍剩1张）",
    hVk.length >= 1 && hRes.handLens.every(n => n === 1),
    { handLens: hRes.handLens, vkCount: hVk.length });

  // =====================================================================
  // ③ 希尔德两饰品转换的【刺杀】是否保留「弃置目标 1 张手牌」
  // =====================================================================
  // 正向对照：真·原牌【刺杀】必须弃牌，否则后面的断言没有基准
  const REAL = { name: "刺杀", type: "slash", suit: "♠", scale: "attack", assassinate: true };

  const setupAssassin = (hand, relics) => `(() => {
    const st = window.state, b = st.battle;
    const a = b.allies[0], e = b.enemies[0];
    b.enemies.length = 1;
    e.ai = "ruins_grunt_soldier"; e.name = "贵族军士兵"; e.gender = "male";
    e.hp = 300; e.maxHp = 300; e.stats = Object.assign({}, e.stats, { attack: 9 });
    e.hand = [{ name: "敌牌1", type: "tactic", suit: "♠" },
              { name: "敌牌2", type: "tactic", suit: "♥" },
              { name: "敌牌3", type: "tactic", suit: "♣" }];
    e.hand.forEach(c => { delete c._pendingDraw; });
    b.activeUid = a.uid; b.phase = 4; b.locked = false; b.animQueue = [];
    b.selectedCardIndex = null; b.selectedSkillCard = null; b.pendingTargetUid = null;
    a.intent = 9; a.hp = 200; a.maxHp = 200;
    a.stats = Object.assign({}, a.stats, { attack: 7, magic: 5 });
    a.battleRelics = ${JSON.stringify(relics)};
    a.hand = ${JSON.stringify(hand)};
    a.hand.forEach(c => { delete c._pendingDraw; });
    // 前面场景若已发动过该饰品，usedAssassinLatex / usedSuccubusFork 会残留。
    // 不重置则 alreadyUsed() 直接失败，发动退化成「打出普通手牌」，
    // 落点同样是「被闪抵消」，断言恒真。
    a.usedAssassinLatex = false;
    a.usedSuccubusFork = false;
    st.log = [];
    window.render();
    return { foeHand: e.hand.length, allyHand: a.hand.map(c => c.name) };
  })()`;

  const peekFoe = `(() => {
    const st = window.state, b = st.battle;
    return { foeHand: b.enemies[0].hand.length, foeHp: b.enemies[0].hp,
             allyHp: b.allies[0].hp,
             logs: (st.log || []).map(String) };
  })()`;

  // --- 对照：原牌【刺杀】 ---
  await page.evaluate(setupAssassin([REAL], []));
  await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    window.BattleSystem.playActiveCard(st, 0, b.enemies[0].uid);
    return true;
  })()`);
  await page.waitForTimeout(1400);
  const realRes = await page.evaluate(peekFoe);
  console.log(`[对照·原牌刺杀] 敌手牌 3→${realRes.foeHand}，敌 hp=${realRes.foeHp}`);
  realRes.logs.filter(t => /刺杀|弃置/.test(t)).slice(0, 4)
    .forEach(t => console.log(`   日志: ${t}`));
  T("对照：原牌【刺杀】应弃置目标 1 张手牌（3→2）",
    realRes.foeHand === 2, realRes);
  T("对照：原牌【刺杀】造成等同攻击力的伤害",
    realRes.foeHp === 300 - 7, realRes);

  // --- 冰心双刺剑：走真实摸牌转换，再打出 ---
  const setupIce = `(() => {
    const st = window.state, b = st.battle;
    const a = b.allies[0], e = b.enemies[0];
    b.enemies.length = 1;
    e.ai = "ruins_grunt_soldier"; e.name = "贵族军士兵"; e.gender = "male";
    e.hp = 300; e.maxHp = 300; e.stats = Object.assign({}, e.stats, { attack: 9 });
    e.hand = [{ name: "敌牌1", type: "tactic", suit: "♠" },
              { name: "敌牌2", type: "tactic", suit: "♥" },
              { name: "敌牌3", type: "tactic", suit: "♣" }];
    e.hand.forEach(c => { delete c._pendingDraw; });
    b.activeUid = a.uid; b.phase = 4; b.locked = false; b.animQueue = [];
    b.selectedCardIndex = null; b.selectedSkillCard = null; b.pendingTargetUid = null;
    a.intent = 9; a.hp = 200; a.maxHp = 200;
    a.stats = Object.assign({}, a.stats, { attack: 7, magic: 5 });
    a.battleRelics = ["冰心双刺剑"];
    a.hand = [];
    // 真实摸牌：转换发生在 afterDraw 钩子内，直接塞手牌测不到。
    // draw 签名为 (unit, count, battle)，第三个参数必须传 battle，
    // 否则 afterDraw 里 window.state.battle === battle 不成立，转换不会执行。
    a.deck = [{ name: "杀", type: "slash", suit: "♠", scale: "attack" }];
    const drawn = window.BattleSystem.draw(a, 1, b);
    a.hand.forEach(c => { delete c._pendingDraw; });
    st.log = [];
    window.render();
    return { drawn: (drawn || []).map(c => c.name),
             hand: a.hand.map(c => ({ n: c.name, assassinate: !!c.assassinate,
                                      convertedFrom: c.convertedFrom || "" })) };
  })()`;
  const iceSetup = await page.evaluate(setupIce);
  console.log(`[冰心双刺剑] 摸到=${JSON.stringify(iceSetup.drawn)} 手牌=${JSON.stringify(iceSetup.hand)}`);
  T("冰心双刺剑：摸到的实体单体【杀】已转换为【刺杀】",
    iceSetup.hand.some(c => c.n === "刺杀"), iceSetup);
  T("冰心双刺剑：转换产物保留 assassinate 标记",
    iceSetup.hand.every(c => c.n !== "刺杀" || c.assassinate === true), iceSetup);

  await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    window.BattleSystem.playActiveCard(st, 0, b.enemies[0].uid);
    return true;
  })()`);
  await page.waitForTimeout(1400);
  const iceRes = await page.evaluate(peekFoe);
  console.log(`[冰心双刺剑] 敌手牌 3→${iceRes.foeHand}，敌 hp=${iceRes.foeHp}`);
  iceRes.logs.filter(t => /刺杀|弃置|冰心/.test(t)).slice(0, 5)
    .forEach(t => console.log(`   日志: ${t}`));
  T("冰心双刺剑：转换的【刺杀】应弃置目标 1 张手牌（3→2）",
    iceRes.foeHand === 2, iceRes);
  T("冰心双刺剑：转换的【刺杀】造成等同攻击力的伤害",
    iceRes.foeHp === 300 - 7, iceRes);

  // --- 刺客胶衣：黑色牌当【刺杀】使用 ---
  await page.evaluate(setupAssassin(
    [{ name: "杀", type: "slash", suit: "♣", scale: "attack" }], ["刺客胶衣"]));
  const latex = await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    const a = b.allies[0], e = b.enemies[0];
    const skills = window.UICommon.skillsOf(a) || [];
    const idx = skills.findIndex(s => s.name === "刺客胶衣");
    if (idx < 0) return { noSkill: true, names: skills.map(s => s.name) };
    const picked = window.BattleSystem.selectSkill(st, idx);
    const cost = window.BattleSystem.selectCard(st, 0);
    const aimed = window.BattleSystem.chooseTarget(st, e.uid);
    const ok = window.BattleSystem.playSelectedCard(st);
    return { picked, cost, aimed, ok };
  })()`);
  await page.waitForTimeout(1400);
  const latexRes = await page.evaluate(peekFoe);
  console.log(`[刺客胶衣] ok=${JSON.stringify(latex)} 敌手牌 3→${latexRes.foeHand}，敌 hp=${latexRes.foeHp}`);
  latexRes.logs.filter(t => /刺杀|弃置|胶衣/.test(t)).slice(0, 5)
    .forEach(t => console.log(`   日志: ${t}`));
  T("刺客胶衣：发动成功", latex.ok === true && latex.noSkill !== true, latex);
  T("刺客胶衣：转换的【刺杀】应弃置目标 1 张手牌（3→2）",
    latexRes.foeHand === 2, latexRes);
  T("刺客胶衣：转换的【刺杀】造成等同攻击力的伤害",
    latexRes.foeHp === 300 - 7, latexRes);

  // 原牌【刺杀】模板不带 ignoreResponse，可被【闪】响应。
  // 刺客胶衣此前在转换参数里硬写了 ignoreResponse: true，与同角色的
  // 冰心双刺剑、也与原牌都不一致，现已统一。这三条是统一后的断言：
  // 三者都不应出现「无法使用响应牌」。
  const latexNoResp = (latexRes.logs || []).some(t => /无法使用响应牌/.test(t));
  const iceNoResp = (iceRes.logs || []).some(t => /无法使用响应牌/.test(t));
  const realNoResp = (realRes.logs || []).some(t => /无法使用响应牌/.test(t));
  console.log(`[响应对比] 原牌刺杀不可响应=${realNoResp} | 冰心双刺剑=${iceNoResp} | 刺客胶衣=${latexNoResp}`);
  T("统一：原牌【刺杀】可被响应（不出现「无法使用响应牌」）",
    realNoResp === false, { realNoResp });
  T("统一：冰心双刺剑转换的【刺杀】与原牌一致，可被响应",
    iceNoResp === false, { iceNoResp });
  T("统一：刺客胶衣转换的【刺杀】与原牌一致，可被响应",
    latexNoResp === false, { latexNoResp });

  // --- 端到端：敌人持【闪】时，胶衣的【刺杀】应被真正抵消（与原牌一致）---
  // battleRelics / hand 必须在 window.render() 之前写入：
  // 若在 render 之后再改，UICommon.skillsOf() 拿不到该饰品，
  // selectSkill(-1) 失败，playSelectedCard 会把手牌当普通【杀】打出——
  // 那样落点也是「被闪抵消 → hp 300」，断言恒真，测不出胶衣本身。
  const setupDodgeFoe = (relics, hand) => `(() => {
    const st = window.state, b = st.battle;
    const a = b.allies[0], e = b.enemies[0];
    b.enemies.length = 1;
    e.ai = "ruins_grunt_soldier"; e.name = "贵族军士兵"; e.gender = "male";
    e.hp = 300; e.maxHp = 300; e.stats = Object.assign({}, e.stats, { attack: 9 });
    // 【刺杀】先弃置目标 1 张手牌（随机），再结算伤害。若只放一张【闪】，
    // 它有可能正好被弃掉，导致「无法响应」的假象。放两张【闪】，
    // 无论弃到哪张都必定还有一张能响应，断言才稳定。
    e.hand = [{ name: "闪", type: "response", suit: "♥" },
              { name: "闪", type: "response", suit: "♦" },
              { name: "敌牌3", type: "tactic", suit: "♣" },
              { name: "敌牌4", type: "tactic", suit: "♠" }];
    e.hand.forEach(c => { delete c._pendingDraw; });
    b.activeUid = a.uid; b.phase = 4; b.locked = false; b.animQueue = [];
    b.selectedCardIndex = null; b.selectedSkillCard = null; b.pendingTargetUid = null;
    a.intent = 9; a.hp = 200; a.maxHp = 200;
    a.stats = Object.assign({}, a.stats, { attack: 7, magic: 5 });
    a.battleRelics = ${JSON.stringify(relics)};
    a.hand = ${JSON.stringify(hand)};
    a.hand.forEach(c => { delete c._pendingDraw; });
    // 前面场景若已发动过该饰品，usedAssassinLatex / usedSuccubusFork 会残留。
    // 不重置则 alreadyUsed() 直接失败，发动退化成「打出普通手牌」，
    // 落点同样是「被闪抵消」，断言恒真。
    a.usedAssassinLatex = false;
    a.usedSuccubusFork = false;
    st.log = [];
    window.render();
    return true;
  })()`;

  // 对照：原牌【刺杀】被【闪】抵消
  await page.evaluate(setupDodgeFoe([], [REAL]));
  await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    window.BattleSystem.playActiveCard(st, 0, b.enemies[0].uid);
    return true;
  })()`);
  await page.waitForTimeout(1400);
  const realDodge = await page.evaluate(peekFoe);
  console.log(`[对照·原牌刺杀 vs 闪] 敌 hp=${realDodge.foeHp}（300=被抵消）`);
  realDodge.logs.filter(t => /闪|刺杀|响应/.test(t)).slice(0, 4)
    .forEach(t => console.log(`   日志: ${t}`));
  T("对照：原牌【刺杀】确实打出（日志含「使用♠刺杀」）",
    (realDodge.logs || []).some(t => /使用♠刺杀/.test(t)), realDodge);
  T("对照：原牌【刺杀】应被敌方【闪】抵消（hp 保持 300）",
    realDodge.foeHp === 300, realDodge);

  // 胶衣：【刺杀】同样应被【闪】抵消
  await page.evaluate(setupDodgeFoe(
    ["刺客胶衣"], [{ name: "杀", type: "slash", suit: "♣", scale: "attack" }]));
  await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    const skills = window.UICommon.skillsOf(b.allies[0]) || [];
    const idx = skills.findIndex(s => s.name === "刺客胶衣");
    if (idx < 0) return false;
    window.BattleSystem.selectSkill(st, idx);
    window.BattleSystem.selectCard(st, 0);
    window.BattleSystem.chooseTarget(st, b.enemies[0].uid);
    return window.BattleSystem.playSelectedCard(st);
  })()`);
  await page.waitForTimeout(1400);
  const latexDodge = await page.evaluate(peekFoe);
  console.log(`[刺客胶衣 vs 闪] 敌 hp=${latexDodge.foeHp}（300=被抵消）`);
  latexDodge.logs.filter(t => /闪|刺杀|胶衣|响应/.test(t)).slice(0, 4)
    .forEach(t => console.log(`   日志: ${t}`));
  // 先确认这一步真的走了胶衣：否则「hp 保持 300」可能只是没打出任何牌。
  T("胶衣端到端：确实发动了刺客胶衣（日志含「发动刺客胶衣」）",
    (latexDodge.logs || []).some(t => /发动刺客胶衣/.test(t)), latexDodge);
  T("胶衣端到端：敌方确实用了【闪】（日志含「自动使用闪」）",
    (latexDodge.logs || []).some(t => /自动使用闪/.test(t)), latexDodge);
  T("统一：刺客胶衣的【刺杀】不出现「无法使用响应牌」",
    (latexDodge.logs || []).every(t => !/无法使用响应牌/.test(t)), latexDodge);
  T("统一：刺客胶衣的【刺杀】同样被敌方【闪】抵消（hp 保持 300）",
    latexDodge.foeHp === 300, latexDodge);

  await page.close();
  await browser.close();
  console.log(`\n页面错误: ${errors.length}${errors.length ? " → " + errors.slice(0, 3).join(" | ") : ""}`);
  console.log(`\n=== ${pass}/${total} 通过 ===`);
  process.exit(pass === total && errors.length === 0 ? 0 : 1);
})();
