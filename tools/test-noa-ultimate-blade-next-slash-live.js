// 【终极刀魔】实机：真实 bundle 装配下连续打出 4 张实体单体【杀】，确认
// 「只有发动后的下一张触发一次，第 2 张以上不再触发」，且敌人血量/战报同步。
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
};

const setupTpl = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false; b.ended = false; b.turn = 9;
  b.phase = 4; b.activeUid = b.allies[0].uid;
  b.discardPick = null; b.selectedCardIndex = null; b.selectedSkillCard = null;
  st.log = []; st.battleLog = [];
  const noa = b.allies[0];
  noa.ref = "noa"; noa.name = "怪面诺亚"; noa.side = "ally";
  noa.hp = 100; noa.maxHp = 130; noa.block = 0;
  noa.stats = noa.stats || {}; noa.stats.attack = 10;
  noa.hand = []; noa.usedUltimateBlade = false;
  delete noa.noaUltimateBladePending; delete noa.noaUltimateBladeTurn;
  delete noa.noaSlashCount; delete noa.noaSlashTurn;
  noa.skills = [
    { name: "淫气改造", type: "passive", icon: "⭐", text: "" },
    { name: "终极刀魔", type: "active", icon: "⚔️", text: "",
      card: { name: "终极刀魔", type: "tactic", ultimateBlade: true,
        targetless: true, icon: "⚔️", text: "" } },
  ];
  b.enemies = [
    { uid: "foe0", name: "高血敌人A", side: "enemy", hp: 200, maxHp: 200,
      block: 0, hand: [], stats: { attack: 10 } },
    { uid: "foe1", name: "高血敌人B", side: "enemy", hp: 200, maxHp: 200,
      block: 0, hand: [], stats: { attack: 10 } },
  ];
  window.render();
  return {
    wired: typeof window.NoaUltimateBladeSkills?.handleSpecialCard === "function"
      && typeof window.NoaUltimateBladeSkills?.afterCardPlayed === "function"
      && typeof window.ChiyoChainSkills?.run === "function"
      && typeof window.BattleSystem?.useVirtualKill === "function",
    hooksFactory: typeof window.BattleCardResumeHooks === "function",
    hooksSource: /NoaUltimateBladeSkills/.test(String(window.BattleCardResumeHooks || "")),
  };
})()`;

const flowTpl = `(() => {
  const st = window.state, b = st.battle;
  const F = window.NoaUltimateBladeSkills;
  const noa = b.allies[0], foe0 = b.enemies[0];
  const slash = (over) => Object.assign({ name: "杀（普攻）", type: "slash",
    scale: "attack", suit: "♠", _playedFromHand: true }, over || {});
  const hp = () => b.enemies.map(e => e.hp);
  const extras = () => {
    // BattleLog.add 同时写 state.battleLog 与 state.log，只能读一个数组，
    // 否则同一条战报会被数两次（夹具问题，不是技能重复触发）。
    const arr = Array.isArray(st.battleLog) ? st.battleLog
      : (Array.isArray(st.log) ? st.log : []);
    return arr.filter(x => typeof x === "string" && /额外结算\\d+次/.test(x));
  };
  F.handleSpecialCard(st, noa, noa,
    { name: "终极刀魔", _skill: true, ultimateBlade: true });
  const afterActivate = { pending: !!noa.noaUltimateBladePending, hp: hp(), extras: extras().length };

  F.afterCardPlayed(st, noa, foe0, { name: "蓄力", type: "tactic", suit: "" });
  F.afterCardPlayed(st, noa, foe0, slash({ sweep: true, allTargets: ["foe0", "foe1"] }));
  const afterSkipped = { pending: !!noa.noaUltimateBladePending, hp: hp(), extras: extras().length };

  F.afterCardPlayed(st, noa, foe0, slash());   // 第 1 张实体单体杀
  const afterFirst = {
    pending: !!noa.noaUltimateBladePending, hp: hp(), extras: extras(),
    count: noa.noaSlashCount, chain: b.noaUltimateChain || null,
  };

  F.afterCardPlayed(st, noa, foe0, slash());   // 第 2 张
  F.afterCardPlayed(st, noa, foe0, slash());   // 第 3 张
  F.afterCardPlayed(st, noa, foe0, slash());   // 第 4 张
  const afterRest = {
    pending: !!noa.noaUltimateBladePending, hp: hp(), extras: extras(),
    count: noa.noaSlashCount, chain: b.noaUltimateChain || null,
  };
  return { afterActivate, afterSkipped, afterFirst, afterRest,
    used: noa.usedUltimateBlade === true,
    blocked: window.SkillOncePerTurn?.blocked?.(noa,
      { name: "终极刀魔", _skill: true, ultimateBlade: true }, b) === true };
})()`;

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", e => errors.push(String(e.message || e)));
  await openGame(page);
  await startRegressionBattle(page);

  const setup = await page.evaluate(setupTpl);
  T("实机：终极刀魔与通用链执行器、虚拟杀入口全部装配", setup.wired, setup);
  T("实机：真实出牌后钩子 factory 登记了终极刀魔",
    setup.hooksFactory && setup.hooksSource, setup);

  const r = await page.evaluate(flowTpl);
  T("实机：发动只挂预约、不立刻结算",
    r.afterActivate.pending === true && r.afterActivate.hp.every(h => h === 200)
    && r.afterActivate.extras === 0, r.afterActivate);
  T("实机：战术牌与群体实体杀不消耗预约、不触发",
    r.afterSkipped.pending === true && r.afterSkipped.hp.every(h => h === 200)
    && r.afterSkipped.extras === 0, r.afterSkipped);
  T("实机：下一张实体单体杀触发一次，X=1",
    r.afterFirst.extras.length === 1 && /额外结算1次/.test(r.afterFirst.extras[0])
    && r.afterFirst.count === 1, r.afterFirst);
  T("实机：额外结算真实扣血（只扣 1 次）",
    r.afterFirst.hp[0] < 200 && r.afterFirst.hp[1] === 200, r.afterFirst.hp);
  T("实机：触发后预约已消耗、链不残留",
    !r.afterFirst.pending && r.afterFirst.chain === null, r.afterFirst);
  T("实机：第 2/3/4 张不再追加额外结算战报",
    r.afterRest.extras.length === 1, r.afterRest.extras);
  T("实机：第 2/3/4 张不再扣血（血量保持首张后的值）",
    JSON.stringify(r.afterRest.hp) === JSON.stringify(r.afterFirst.hp),
    { first: r.afterFirst.hp, rest: r.afterRest.hp });
  T("实机：预约保持未挂、链仍未残留",
    !r.afterRest.pending && r.afterRest.chain === null, r.afterRest);
  T("实机：X 计数继续累加到 4（不因消耗而停摆）", r.afterRest.count === 4, r.afterRest);
  T("实机：发动一次后置灰依据成立", r.used === true && r.blocked === true, r);
  T("全程无 JS 错误", errors.length === 0, errors.slice(0, 3));

  console.log(`\n通过 ${pass} / ${total}`);
  await browser.close();
  if (pass !== total) process.exit(1);
})().catch(e => {
  console.error("FATAL", e);
  process.exit(1);
});
