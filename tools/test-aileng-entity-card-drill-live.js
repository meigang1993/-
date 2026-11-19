// 248 版实机：【妖刀村雨】虚拟杀不得触发【战斗演练】交牌挂起；实体牌仍正常触发并可解锁。
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
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
};
const setupTpl = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false; b.ailengDrillPicker = null;
  b.selectedCardIndex = null; b.selectedSkillCard = null; b.pendingTargetUid = null;
  b.allies.forEach((a, i) => {
    a.hp = 300; a.maxHp = 300; a.block = 0; a.hand = []; a.discard = []; a.consumed = [];
    a.ref = i === 0 ? "aileng" : "lokar";
    a.name = i === 0 ? "艾伦格" : "队友" + i;
    a.skills = i === 0 ? [{ name: "战斗演练", type: "passive" }] : [];
  });
  b.enemies.forEach(e => { e.hp = 100; e.maxHp = 100; e.hand = []; });
  b.activeUid = b.allies[0].uid;
  st.log = [];
  return { actorUid: b.allies[0].uid, mateUid: b.allies[1].uid,
    cardUtils: typeof window.CardUtils?.isEntityCard,
    relicPrepare: typeof window.BattleRelicTurns?.prepare,
    guestHook: typeof window.GuestCharacterSkills?.afterCardPlayed };
})()`;

function caseRunner(kind) {
  return page => page.evaluate(kind => {
    const st = window.state, b = st.battle;
    const reset = () => {
      b.animQueue = []; b.locked = false; b.ailengDrillPicker = null;
      b.allies.forEach(a => { a.hand = []; a.discard = []; a.consumed = []; });
      b.allies[0].ref = "aileng"; b.allies[0].name = "艾伦格";
      b.allies[0].skills = [{ name: "战斗演练", type: "passive" }];
      b.enemies.forEach(e => { e.hp = 100; e.maxHp = 100; e.hand = []; });
      st.log = [];
    };
    reset();
    const actor = b.allies[0], mate = b.allies[1];
    const out = { kind };
    if (kind === "muramasa") {
      const orig = window.RelicSystem?.hasEquipped;
      if (window.RelicSystem) window.RelicSystem.hasEquipped = () => true;
      out.prepareOk = !!window.BattleRelicTurns?.prepare?.(st, actor,
        (s, u, t, c) => {
          window.GuestCharacterSkills?.afterCardPlayed?.(s, u, t, c, {});
          return true;
        }, () => {});
      if (window.RelicSystem) window.RelicSystem.hasEquipped = orig;
    } else {
      const c = kind === "virtual"
        ? window.CardUtils.fromEntity("杀（普攻）", { noIntentCost: true, sourceName: "妖刀村雨", _skipUseKillTriggers: true })
        : kind === "generated"
          ? window.CardUtils.cloneEntity("杀（普攻）", { suit: "♠", generatedBySkill: "测试技能", _skill: true })
          : window.CardUtils.cloneEntity("杀（普攻）", { suit: "♠" });
      actor.hand.push(c);
      out.cardVirtual = !!c.virtual;
      out.cardGenerated = !!c.generatedBySkill;
      window.GuestAilengSkills.afterCardPlayed(st, actor, c);
    }
    window.render?.();
    out.prompt = !!b.ailengDrillPicker;
    out.locked = !!b.locked;
    out.cardName = b.ailengDrillPicker?.card?.name || null;
    out.skip = !!document.querySelector("[data-aileng-drill-skip]");
    out.selectable = [...document.querySelectorAll("[data-target]")]
      .filter(node => node.classList.contains("selectable-target"))
      .map(node => node.dataset.target);
    out.mateUid = mate.uid;
    return out;
  }, kind);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e.message || e)));
  await openGame(page);
  await startRegressionBattle(page);

  const setup = await page.evaluate(setupTpl);
  T("前置：CardUtils.isEntityCard 已装配", setup.cardUtils === "function", setup);
  T("前置：妖刀村雨 prepare 已装配", setup.relicPrepare === "function", setup);
  T("前置：出牌后聚合钩子已装配", setup.guestHook === "function", setup);

  const virtual = await caseRunner("virtual")(page);
  console.log(`[虚拟杀] ${JSON.stringify(virtual)}`);
  T("妖刀村雨式虚拟杀不弹交牌提示", virtual.prompt === false, virtual);
  T("妖刀村雨式虚拟杀不锁界面", virtual.locked === false, virtual);
  T("虚拟杀后无「不交」按钮", virtual.skip === false, virtual);

  const generated = await caseRunner("generated")(page);
  T("技能生成牌不弹交牌提示", generated.prompt === false, generated);
  T("技能生成牌不锁界面", generated.locked === false, generated);

  const muramasa = await caseRunner("muramasa")(page);
  console.log(`[真实妖刀村雨 prepare] ${JSON.stringify(muramasa)}`);
  T("真实 prepare 自动斩入口可用", muramasa.prepareOk === true, muramasa);
  T("真实 prepare 生成虚拟杀后不弹交牌提示", muramasa.prompt === false, muramasa);
  T("真实 prepare 生成虚拟杀后不锁界面", muramasa.locked === false, muramasa);

  const entity = await caseRunner("entity")(page);
  console.log(`[实体杀] ${JSON.stringify(entity)}`);
  T("实体杀仍触发交牌提示", entity.prompt === true && entity.cardName === "杀（普攻）", entity);
  T("实体杀触发后等待队友选择而锁定", entity.locked === true, entity);
  T("实体杀仍显示「不交」按钮", entity.skip === true, entity);
  T("实体杀仍把队友标为可选目标", entity.selectable.includes(entity.mateUid), entity);

  await page.click("[data-aileng-drill-skip]");
  await page.waitForTimeout(250);
  const unlocked = await page.evaluate(() => ({
    prompt: !!window.state.battle?.ailengDrillPicker,
    locked: !!window.state.battle?.locked,
  }));
  T("实体杀选择链可点击「不交」并解锁", unlocked.prompt === false && unlocked.locked === false, unlocked);
  T("无页面错误", errors.length === 0, errors.slice(0, 3));

  console.log(`\n汇总：${pass} 通过 / ${total - pass} 失败`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})();
