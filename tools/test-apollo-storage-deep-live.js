// 【魔刀阿波罗 / 角色牌存储牌】实际效果深查实机。
// 本轮查出并修复两个真实 BUG：
//   ① 敌方 handSpot 退化成 unitArt，扣置动画起点终点重合（原地闪、N 张并行飞）；
//   ② 时停清空 battle-end-phase 的 steps，导致回合结束返还被吞、存储牌滞留。
// 这里用真实浏览器逐项回归，其余效果（移出游戏 / 存档 / 连击 / 阵亡 / 复活 /
// 手牌上限 / 旧档迁移）一并做断言，防止以后改坏。
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

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = collectErrors(page);
  await openGame(page);
  await startRegressionBattle(page);

  const r = await page.evaluate(() => {
    const st = window.state, b = st.battle;
    const R = {};
    const nanali = b.allies[0], enemy = b.enemies[0];
    const S = window.BattleCharacterCardStorage;
    const mkCard = (n, type = "tactic") => ({ name: n, type, suit: "♣" });
    b.locked = false; b.animQueue = []; b.phase = 4;
    ["dimensionTransfer", "cadicisResponsibility", "counterTrigger",
      "counterTriggerQueue", "manualDodge"].forEach(k => { b[k] = null; });
    st.battleLog = []; st.log = [];
    Object.assign(nanali, { ref: "nanali", name: "娜娜莉", hp: 100, maxHp: 100,
      hand: [mkCard("杀（普攻）", "slash")], deck: [], discard: [], consumed: [],
      storedCards: [] });
    Object.assign(enemy, { hp: 100, maxHp: 100, block: 0,
      hand: [mkCard("扣A"), mkCard("扣B")], discard: [], consumed: [],
      storedCards: [], storedDiscarded: false });
    b.activeUid = nanali.uid;
    window.render && window.render();

    // ① 扣置后：牌真的移出所有常规区域
    window.ElranaAceNanaliSkills.beforeKillTargeted(st, nanali, enemy,
      mkCard("杀（普攻）", "slash"), { draw: () => [] });
    const ev = b.animQueue.find(e => e.type === "sealCards");
    R.seal = {
      stored: S.cardsOf(enemy).map(c => c.name),
      hand: enemy.hand.map(c => c.name),
      discard: enemy.discard.map(c => c.name),
      consumed: (enemy.consumed || []).map(c => c.name),
      event: ev ? { count: ev.count, toCharacterCard: !!ev.toCharacterCard,
        placeOnce: !!ev.placeOnce, visualHandCount: ev.visualHandCount } : null,
    };

    // ② 几何退化：敌方 handSpot === unitArt（一次性放牌必须自己抬起起点）
    const geo = window.BattleEffectGeometry;
    R.geometry = geo ? (() => {
      const from = geo.handSpot(enemy.uid, enemy.side) || geo.unitArt(enemy.uid);
      const to = geo.unitArt(enemy.uid);
      return { sameNode: from === to, hasArt: !!to };
    })() : { note: "geometry 未暴露" };

    // ③ 存档 checkpoint：storedCards 随 JSON 深拷贝保留、ensure 可读
    const clone = JSON.parse(JSON.stringify(st.battle));
    const cloned = clone.enemies.find(u => u.uid === enemy.uid);
    const restored = { uid: "r", name: "读档", hand: [], hp: 20,
      storedCards: cloned?.storedCards || [] };
    R.save = { inClone: cloned?.storedCards?.length ?? null,
      names: (cloned?.storedCards || []).map(e => e.card?.name),
      afterEnsure: S.cardsOf(restored).length };

    // ④ 时停回合结束：返还链路不得被 steps.length=0 吞掉
    const realIsDisabled = window.MieryulaTimeStop?.isSkillDisabled;
    const realReturn = window.NanaliSealed.returnSealed;
    let legacyReturnCalls = 0;
    window.NanaliSealed.returnSealed = (...args) => {
      legacyReturnCalls++; return realReturn(...args);
    };
    if (window.MieryulaTimeStop) window.MieryulaTimeStop.isSkillDisabled = () => true;
    const beforeStop = S.count(enemy);
    const endPhase = window.BattleEndPhase({
      allUnits: bb => bb.allies.concat(bb.enemies || []),
      combat: { damage: () => 0, pushFloat: () => {} },
      draw: () => [],
    });
    let endErr = null;
    try { endPhase.run(st, nanali); } catch (e) { endErr = String(e).slice(0, 160); }
    R.timestop = { beforeStored: beforeStop, afterStored: S.count(enemy),
      hand: enemy.hand.map(c => c.name), legacyReturnCalls, error: endErr,
      gainEvents: b.animQueue.filter(e => e.type === "gainCards"
        && e.fromZone === "characterCard").length };
    window.NanaliSealed.returnSealed = realReturn;
    if (window.MieryulaTimeStop) window.MieryulaTimeStop.isSkillDisabled = realIsDisabled;

    // ⑤ 连击多次扣置，一次返还
    enemy.hp = 100; enemy.storedCards = [];
    enemy.hand = [mkCard("连1"), mkCard("连2"), mkCard("连3")];
    b.animQueue = [];
    for (let i = 0; i < 2; i++) {
      window.ElranaAceNanaliSkills.beforeKillTargeted(st, nanali, enemy,
        mkCard("杀（普攻）", "slash"), { draw: () => [] });
    }
    const comboBefore = S.count(enemy);
    const comboEvents = b.animQueue.filter(e => e.type === "sealCards").length;
    window.NanaliSealed.returnSealed(st);
    R.combo = { before: comboBefore, sealEvents: comboEvents,
      after: S.count(enemy), hand: enemy.hand.length };

    // ⑥ 阵亡：无手牌也清存储牌
    enemy.storedCards = []; enemy.hand = [mkCard("亡1")]; enemy.hp = 100;
    window.ElranaAceNanaliSkills.beforeKillTargeted(st, nanali, enemy,
      mkCard("杀（普攻）", "slash"), { draw: () => [] });
    enemy.hp = 0; enemy.deathDiscarded = true; enemy.storedDiscarded = false;
    const putSpy = [];
    const origPut = window.BattleCards.putMany;
    window.BattleCards.putMany = (bb, u, cards, pile, opts) => {
      putSpy.push({ pile, count: cards.length }); return origPut(bb, u, cards, pile, opts);
    };
    const defeat = window.BattleCombatDefeat({
      deps: {}, allUnits: bb => bb.allies.concat(bb.enemies || []),
      pendingFatalAnim: () => false, clearSelection: () => {},
    });
    defeat.discardDeadHands(st, b);
    window.BattleCards.putMany = origPut;
    R.death = { stored: S.count(enemy), hand: enemy.hand.length, putSpy };

    // ⑦ 复活判定：pendingRevival 为真时不提前清
    const realPending = window.SakuraRisaSkills?.pendingRevival;
    if (window.SakuraRisaSkills) window.SakuraRisaSkills.pendingRevival = () => true;
    enemy.hp = 0; enemy.storedDiscarded = false;
    enemy.storedCards = [{ card: mkCard("复活牌"), source: "测试", release: "anyTurnEnd" }];
    defeat.discardDeadHands(st, b);
    R.revival = { stored: S.count(enemy) };
    if (window.SakuraRisaSkills) window.SakuraRisaSkills.pendingRevival = realPending;

    // ⑧ 手牌上限：按三国杀「获得这些牌」口径整批进手牌（弃牌阶段已过）
    enemy.hp = 100; enemy.storedCards = []; enemy.hand = [];
    S.store(st, enemy, [mkCard("超1"), mkCard("超2"), mkCard("超3"),
      mkCard("超4"), mkCard("超5")], { source: "测试", release: "anyTurnEnd" });
    R.limit = { handLimit: enemy.stats?.handLimit ?? enemy.handLimit ?? null,
      before: enemy.hand.length, stored: S.count(enemy) };
    S.release(st, enemy, () => true, "上限测试");
    R.limit.after = enemy.hand.length;
    R.limit.storedAfter = S.count(enemy);

    // ⑨ 旧档迁移
    const legacy = { uid: "legacy", name: "旧档", side: "enemy", hp: 20, hand: [],
      nanaliSealed: [mkCard("旧暂存")] };
    R.legacy = { cards: S.cardsOf(legacy).length,
      source: legacy.storedCards?.[0]?.source, left: legacy.nanaliSealed?.length || 0 };

    return R;
  });

  console.log(JSON.stringify(r, null, 2));
  T("D1 扣置牌移出游戏：只存在角色牌存储区，手牌/弃牌/消耗区都没有",
    r.seal.stored.length === 2 && r.seal.hand.length === 0
    && r.seal.discard.length === 0 && r.seal.consumed.length === 0, r.seal);
  T("D2 扣置事件带 toCharacterCard + placeOnce，视觉手牌数按扣后快照",
    r.seal.event?.toCharacterCard === true && r.seal.event?.placeOnce === true
    && r.seal.event?.count === 2 && r.seal.event?.visualHandCount === 0, r.seal.event);
  T("D3 几何：敌方 handSpot 确实退化成角色牌（证实 BUG 成因）",
    r.geometry.sameNode === true && r.geometry.hasArt === true, r.geometry);
  T("D4 【BUG 修复】时停清空结束步骤后，存储牌仍无条件返还并回到手牌",
    r.timestop.beforeStored === 2 && r.timestop.afterStored === 0
    && r.timestop.hand.length === 2 && r.timestop.error === null
    && r.timestop.gainEvents >= 1, r.timestop);
  T("D5 存档 JSON 深拷贝保留存储牌，读档 ensure 可读",
    r.save.inClone === 2 && r.save.afterEnsure === 2
    && r.save.names.includes("扣A"), r.save);
  T("D6 连击 2 次扣置共 3 张，回合结束一次性全部返还",
    r.combo.before === 3 && r.combo.sealEvents === 2
    && r.combo.after === 0 && r.combo.hand === 3, r.combo);
  T("D7 阵亡：存储牌整批置入弃牌堆，即使手牌已空",
    r.death.stored === 0 && r.death.hand === 0
    && r.death.putSpy.length === 1 && r.death.putSpy[0].pile === "discard"
    && r.death.putSpy[0].count === 1, r.death);
  T("D8 复活判定中的角色不提前清理存储牌",
    r.revival.stored === 1, r.revival);
  T("D9 返还按「获得这些牌」整批进手牌（弃牌阶段已过，允许暂超上限）",
    r.limit.before === 0 && r.limit.stored === 5
    && r.limit.after === 5 && r.limit.storedAfter === 0, r.limit);
  T("D10 旧存档 nanaliSealed 自动迁移",
    r.legacy.cards === 1 && r.legacy.source === "魔刀阿波罗"
    && r.legacy.left === 0, r.legacy);
  const rel = relevantErrors(errors);
  T("D11 全程无 pageerror / console error", rel.length === 0, rel.slice(0, 3));
  console.log(`\nRESULT ${passed.filter(Boolean).length}/${passed.length}`);
  await browser.close();
  process.exit(passed.every(Boolean) ? 0 : 1);
})();
