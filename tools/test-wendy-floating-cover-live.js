// 温蒂【飘浮掩体】实机回归（技能调整后）：按温蒂魔力值给全队护甲，卡迪西斯 2 倍。
// 旧断言全部基于「每弃 1 张 → 全体各 1 点、芙萝娅/卡迪西斯双倍」，已整体重写。
// 验证 bundle 真实装配：聚合入口、台词数据、结束阶段挂点、弃牌阶段不再触发、幂等、溢出弃牌排除。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}`
    + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return cond ? 1 : 0;
};

// 布场：allies[0]=温蒂 allies[1]=普通 allies[2]=芙萝娅 allies[3]=卡迪西斯
const setupTpl = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false; b.turn = 7;
  b.discardPick = null; b.selectedCardIndex = null; b.selectedSkillCard = null;
  st.log = []; st.battleLog = [];
  const need = [["wendy", "温蒂"], ["rokar", "罗卡尔"],
    ["flora", "芙萝娅"], ["cadicis", "卡迪西斯"]];
  need.forEach((cfg, i) => {
    if (!b.allies[i]) {
      b.allies.push({ uid: "probe" + i, hp: 100, maxHp: 100, block: 0,
        side: "ally", hand: [], stats: {} });
    }
    const a = b.allies[i];
    a.ref = cfg[0]; a.name = cfg[1]; a.hp = 100; a.maxHp = 100; a.block = 0;
    a.alive = true; a.side = "ally";
    a.hand = []; a.skinTeacherArmor = 0;
    a.stats = a.stats || {};
    a.stats.magic = 5;
    a.tempMagic = 0;
    delete a._floatingCoverTurn;
  });
  b.enemies.forEach(e => { e.hp = 100; e.maxHp = 100; e.hand = []; });
  window.render();
  return {
    allies: b.allies.length,
    wired: typeof window.WendyCadicisSkills?.floatingCover === "function",
    hpValue: typeof window.BattleHpValue?.clean === "function",
  };
})()`;

// 真实聚合入口 floatingCover：与弃牌张数无关
const coverTpl = `(() => {
  const st = window.state, b = st.battle;
  const wendy = b.allies[0];
  window.WendyCadicisSkills.floatingCover(st, wendy, { pushFloat: () => {} });
  window.render();
  return {
    blocks: b.allies.slice(0, 4).map(a => ({ ref: a.ref, block: a.block || 0 })),
    skinArmor: wendy.skinTeacherArmor || 0,
    log: (st.battleLog || st.log || []).filter(x => /飘浮掩体/.test(x)),
  };
})()`;

// 真实 BattleDiscardFlow.enterDiscardOrEnd：改到结束阶段后，弃牌流程不应再结算护甲
const flowTpl = `(() => {
  const st = window.state, b = st.battle;
  const wendy = b.allies[0];
  const flow = window.BattleDiscardFlow({
    active: () => wendy,
    visibleHand: u => u.hand.length,
    handLimit: () => 4,
    canDiscardCard: () => true,
    canDiscardAny: () => true,
    discardNeed: () => 0,
    discardOverflow: () => {},
    enterEndPhase: () => true,
    draw: () => [],
    combat: { pushFloat: () => {} },
    record: () => {},
    advanceToInput: async () => {},
    manualFlow: {},
  });
  flow.enterDiscardOrEnd(st, wendy);
  window.render();
  return {
    blocks: b.allies.slice(0, 4).map(a => ({ ref: a.ref, block: a.block || 0 })),
    log: (st.battleLog || st.log || []).filter(x => /飘浮掩体/.test(x)),
  };
})()`;

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", e => errors.push(String(e.message || e)));
  await openGame(page);
  await startRegressionBattle(page);

  const setup = await page.evaluate(setupTpl);
  T("聚合入口 WendyCadicisSkills.floatingCover 已装配", setup.wired === true, setup);
  T("BattleHpValue.clean 已装配（魔力值收敛可用）", setup.hpValue === true, setup);

  // —— 主体：真实聚合入口 ——
  const r = await page.evaluate(coverTpl);
  const byRef = Object.fromEntries(r.blocks.map(x => [x.ref, x.block]));
  T("全体获得等同于魔力值(5)的护甲", byRef.wendy === 5 && byRef.rokar === 5,
    r.blocks);
  T("芙萝娅不再双倍", byRef.flora === 5, r.blocks);
  T("卡迪西斯获得 2 倍", byRef.cadicis === 10, r.blocks);
  T("教师皮肤累计 = 5+5+5+10 = 25", r.skinArmor === 25, { skinArmor: r.skinArmor });
  T("战报写明飘浮掩体与 5 点护甲、卡迪西斯 2 倍",
    r.log.length >= 1 && /5点护甲/.test(r.log[0] || "")
    && /2倍护甲/.test(r.log[0] || ""), r.log);
  T("旧「每弃1张牌」文案已消失", !/每弃1张牌/.test(r.log.join("")), r.log);

  // —— 台词数据：卡迪西斯在场时是妈妈台词 ——
  const line = await page.evaluate(`(() => {
    const fn = window.BattleLineData?.skillLines?.wendy?.["飘浮掩体"];
    return {
      cadicis: typeof fn === "function" ? fn({ ref: "cadicis" }) : null,
      plain: typeof fn === "function" ? fn(null) : null,
    };
  })()`);
  T("卡迪西斯在场台词为「妈妈的魔法会保护好你的」",
    /妈妈的魔法会保护好你的/.test(line.cadicis || ""), line);
  T("普通台词为「我的魔法是飘浮」",
    /我的魔法是飘浮/.test(line.plain || ""), line);

  // —— 弃牌流程不再触发（技能已改到结束阶段）——
  await page.evaluate(setupTpl);
  const f = await page.evaluate(flowTpl);
  const fByRef = Object.fromEntries(f.blocks.map(x => [x.ref, x.block]));
  T("弃牌流程不再触发飘浮掩体（弃 0 张也不加甲）",
    fByRef.wendy === 0 && fByRef.rokar === 0 && fByRef.cadicis === 0, f.blocks);
  T("弃牌流程不再写飘浮掩体战报", f.log.length === 0, f.log);

  // —— 真实结束阶段运行：隔离其它结束阶段技能，只验温蒂步骤 ——
  await page.evaluate(setupTpl);
  const endRun = await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    const wendy = b.allies[0];
    const keys = ["NonokaLokiSkills", "GuestCharacterSkills", "HoshinoSkills", "GerdaSkills",
      "BertisGerlotSkills", "CharacterSkinFX", "EnemySkills", "UnderwaterTrainSkills",
      "ElranaAceNanaliSkills", "ArtinaMariaSkills", "AbeKarunaDivaSkills", "AbeKarunaBubbleSkills",
      "AngelicaLukaSkills", "NoaSideEffectSkills", "RuinsCardSkills", "MieryulaTimeStop", "BattleTurnState"];
    const saved = {};
    keys.forEach(k => { saved[k] = window[k]; window[k] = undefined; });
    window.BattleTurnState = { cleanupTurn() {} };
    let calls = 0;
    const prev = window.WendyCadicisSkills;
    const orig = prev.floatingCover;
    window.WendyCadicisSkills = Object.assign({}, prev, {
      floatingCover: (...args) => { calls += 1; return orig(...args); },
    });
    let ok = true;
    try {
      window.BattleEndPhase({
        allUnits: () => [],
        combat: { pushFloat() {}, damage() {} },
        draw: () => [],
      }).run(st, wendy);
    } catch (e) { ok = false; }
    keys.forEach(k => { window[k] = saved[k]; });
    window.WendyCadicisSkills = prev;
    return {
      ok, calls,
      stepCleared: b.endPhaseStep === undefined,
      blocks: b.allies.slice(0, 4).map(a => ({ ref: a.ref, block: a.block || 0 })),
    };
  })()`);
  const eByRef = Object.fromEntries(endRun.blocks.map(x => [x.ref, x.block]));
  T("温蒂自己的结束阶段真实触发飘浮掩体（含卡迪西斯 2 倍）",
    endRun.ok && endRun.calls === 1 && eByRef.wendy === 5
    && eByRef.rokar === 5 && eByRef.cadicis === 10, endRun);
  T("结束阶段步骤吞掉返回值、不挂起后续步骤",
    endRun.ok && endRun.stepCleared, endRun);

  // —— 幂等：同一回合重复调用不加第二次 ——
  const idem = await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    const before = b.allies.slice(0, 4).map(a => a.block || 0);
    window.WendyCadicisSkills.floatingCover(st, b.allies[0], { pushFloat: () => {} });
    window.render();
    return { before, after: b.allies.slice(0, 4).map(a => a.block || 0) };
  })()`);
  T("同一回合重复进入不重复加甲",
    JSON.stringify(idem.before) === JSON.stringify(idem.after), idem);

  // —— 对照：非温蒂不触发 ——
  const ctrl = await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    const before = b.allies.slice(0, 4).map(a => a.block || 0);
    window.WendyCadicisSkills.floatingCover(st, b.allies[1], { pushFloat: () => {} });
    window.render();
    return { before, after: b.allies.slice(0, 4).map(a => a.block || 0) };
  })()`);
  T("对照：非温蒂不触发",
    JSON.stringify(ctrl.before) === JSON.stringify(ctrl.after), ctrl);

  // —— 对照：溢出弃牌不触发（技能只在温蒂自己的结束阶段） ——
  const ovf = await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    const wendy = b.allies[0];
    const before = b.allies.slice(0, 4).map(a => a.block || 0);
    const logsBefore = (st.battleLog || []).filter(x => /飘浮掩体/.test(x)).length;
    while (wendy.hand.length < 9) wendy.hand.push({ name: "杀（普攻）", type: "slash", suit: "♠" });
    const tool = window.BattleDiscardOverflow({
      visibleHand: u => u.hand.length,
      handLimit: u => u.handLimit || 5,
    });
    tool.discardOverflow(st, wendy);
    window.render();
    return {
      before,
      after: b.allies.slice(0, 4).map(a => a.block || 0),
      handLeft: wendy.hand.length,
      logsBefore,
      logsAfter: (st.battleLog || []).filter(x => /飘浮掩体/.test(x)).length,
    };
  })()`);
  T("溢出弃牌后手牌被裁到上限", ovf.handLeft <= 5, ovf);
  T("溢出弃牌不加任何护甲",
    JSON.stringify(ovf.before) === JSON.stringify(ovf.after), ovf);
  T("溢出弃牌不写飘浮掩体战报", ovf.logsAfter === ovf.logsBefore, ovf);

  T("全程无 JS 错误", errors.length === 0, errors.slice(0, 3));

  console.log(`\n通过 ${pass} / ${total}`);
  await browser.close();
  if (pass !== total) process.exit(1);
})().catch(e => {
  console.error("FATAL", e);
  process.exit(1);
});
