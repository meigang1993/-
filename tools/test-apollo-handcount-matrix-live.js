// 【魔刀阿波罗】不同扣牌数下目标角色手牌数显示的正式回归。
//
// 本轮查出并修复 1 个真实 BUG：sealCards 动画用「绝对快照」覆盖
// unit.visualHandCount，而项目既定口径（BattleCards.queueResponse /
// battle-effect-handlers.response）是「当前持有显示值 + 相对增量」。
// 当队列里两条 sealCards 之间夹着目标获得牌事件时，后播的 sealCards
// 会把已加上的 +1 抹掉，瞬时显示错误（实测 6→4→3→1，真值应为 4→3→4→2）。
// 修复：事件带 visualHandDelta=-扣牌数，动画按相对增量推进。
//
// 覆盖：扣 0/1/2/3/多张、扣牌数 > 目标手牌数、目标空手、连击不同扣牌数、
// 真实 BattleSystem.useCard 链路、混合事件队列、返还后恢复、存×N 徽章。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle, collectErrors, relevantErrors } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const passed = [];
const T = (name, ok, detail = "") => {
  passed.push(!!ok);
  console.log(`${ok ? "✅" : "❌"} ${name}${ok ? "" : "  ← " + JSON.stringify(detail)}`);
  return !!ok;
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = collectErrors(page);
  await openGame(page);
  await startRegressionBattle(page);

  const out = await page.evaluate(async () => {
    const st = window.state, b = st.battle;
    const nanali = b.allies[0], target = b.enemies[0];
    b.allies = [nanali]; b.enemies = [target];
    b.test = false; b.locked = false; b.phase = 4;
    st.settings.battleSpeed = 2;
    const mk = (n, type = "tactic") => ({ name: n, suit: "♣", type });
    const handText = () => document.querySelector(
      `[data-target="${target.uid}"] .unit-hand`)?.textContent.trim() || null;
    const badge = () => document.querySelector(
      `[data-target="${target.uid}"] .stored-card-badge`)?.textContent || null;
    const handler = mod => window.BattleEffectCards(window.BattleEffectUtils)[mod];

    Object.assign(nanali, { ref: "nanali", name: "娜娜莉", hp: 200, maxHp: 200,
      block: 0, defenseSystem: 0, skills: [], discard: [], consumed: [] });
    Object.assign(target, { ref: "test_enemy", name: "测试敌人", side: "enemy",
      ai: null, hp: 300, maxHp: 300, block: 0, defenseSystem: 0,
      skills: [], discard: [], consumed: [] });

    const reset = targetN => {
      b.animQueue = [];
      window.BattleEffectHandlers.clearVisuals(st);
      delete target.visualHandCount;
      target.storedCards = [];
      target.hp = 300;
      target.hand = Array.from({ length: targetN }, (_, i) => mk(`目标牌${i}`));
      window.render();
    };
    // sealCards 只跑到 renderStep（不播 400ms 动画），用于快速读显示值
    const playSealQuick = async ev => {
      let n = 0;
      await handler("sealCards")(ev, window.render, () => ++n <= 2);
    };

    // ── A. 扣牌数 × 目标手牌数矩阵 ──
    const matrix = [];
    const cases = [
      { label: "扣1/目标3", actorExtra: 0, targetN: 3, taken: 1 },
      { label: "扣2/目标3", actorExtra: 1, targetN: 3, taken: 2 },
      { label: "扣3/目标3", actorExtra: 2, targetN: 3, taken: 3 },
      { label: "扣5>目标2", actorExtra: 4, targetN: 2, taken: 2 },
      { label: "扣3/目标0", actorExtra: 2, targetN: 0, taken: 0 },
      { label: "扣1/目标1", actorExtra: 0, targetN: 1, taken: 1 },
      { label: "扣3/目标5", actorExtra: 2, targetN: 5, taken: 3 },
      { label: "扣0构造/目标3", actorExtra: 0, targetN: 3, taken: 0,
        slashExtra: { _skill: true } },
    ];
    for (const c of cases) {
      reset(c.targetN);
      const before = handText();
      nanali.hand = Array.from({ length: c.actorExtra }, (_, i) => mk(`娜牌${i}`));
      const slash = { name: "杀（普攻）", suit: "♠", type: "slash", power: 1,
        scale: "attack", ignoreResponse: true, ...(c.slashExtra || {}) };
      window.ElranaAceNanaliSkills.beforeKillTargeted(st, nanali, target, slash,
        { draw() {} });
      const stale = handText();
      const snaps = b.animQueue.filter(e => e.type === "sealCards").map(e => ({
        before: e.visualHandBefore, after: e.visualHandCount,
        delta: e.visualHandDelta, count: e.count, cards: e.cards.length,
      }));
      const sealEvents = b.animQueue.filter(e => e.type === "sealCards");
      b.animQueue = [];
      const during = [];
      for (const ev of sealEvents) { await playSealQuick(ev); during.push(handText()); }
      window.BattleEffectHandlers.clearVisuals(st);
      window.render();
      const after = handText();
      const stored = window.BattleCharacterCardStorage.count(target);
      const badgeText = badge();
      window.NanaliSealed.returnSealed(st);
      target.hand.forEach(card => { delete card._pendingDraw; });
      b.animQueue = [];
      window.BattleEffectHandlers.clearVisuals(st);
      window.render();
      matrix.push({ ...c, before, stale, snaps, during, after, stored,
        badgeText, afterReturn: handText(),
        storedAfter: window.BattleCharacterCardStorage.count(target) });
    }

    // B. 连击不同扣牌数（同一目标连续 2/1/2 张）
    reset(5);
    const comboBefore = handText();
    const comboSteps = [{ extra: 1 }, { extra: 0 }, { extra: 2 }];
    for (const step of comboSteps) {
      nanali.hand = Array.from({ length: step.extra }, (_, i) => mk(`连击娜牌${i}`));
      window.ElranaAceNanaliSkills.beforeKillTargeted(st, nanali, target,
        { name: "杀（普攻）", suit: "♠", type: "slash", power: 1,
          scale: "attack", ignoreResponse: true }, { draw() {} });
    }
    const comboStale = handText();
    const comboSnaps = b.animQueue.filter(e => e.type === "sealCards").map(e => ({
      before: e.visualHandBefore, after: e.visualHandCount,
      delta: e.visualHandDelta, count: e.count,
    }));
    const comboEvents = b.animQueue.filter(e => e.type === "sealCards");
    b.animQueue = [];
    const comboDuring = [];
    for (const ev of comboEvents) { await playSealQuick(ev); comboDuring.push(handText()); }
    window.BattleEffectHandlers.clearVisuals(st);
    window.render();
    const combo = { before: comboBefore, stale: comboStale, snaps: comboSnaps,
      during: comboDuring, after: handText(),
      stored: window.BattleCharacterCardStorage.count(target), badge: badge() };

    // C. 真实 BattleSystem.useCard 链路（不同扣牌数）
    const real = [];
    for (const [label, extra, targetN, taken] of [
      ["真实扣1/目标3", 0, 3, 1], ["真实扣2/目标4", 1, 4, 2],
      ["真实扣3/目标3", 2, 3, 3], ["真实扣4>目标2", 3, 2, 2],
      ["真实扣1/目标1", 0, 1, 1],
    ]) {
      reset(targetN);
      const slash = { name: "杀（普攻）", suit: "♠", type: "slash", power: 1,
        scale: "attack", ignoreResponse: true };
      nanali.hand = [slash, ...Array.from({ length: extra }, (_, i) => mk(`娜牌${i}`))];
      const before = handText();
      window.BattleSystem.useCard(st, nanali, target, slash);
      const stale = handText();
      await window.BattleEffects.drain(st, window.render);
      real.push({ label, taken, before, stale, after: handText(),
        realHand: target.hand.filter(c => !c._pendingDraw).length,
        stored: window.BattleCharacterCardStorage.count(target) });
    }

    // D. 混合事件队列（BUG 回归核心）：逐事件读取 unit.visualHandCount
    const mixed = [];
    for (const scenario of ["seal-seal-gain-seal", "seal-gain-seal"]) {
      reset(6);
      const counts = scenario === "seal-seal-gain-seal" ? [2, 1, 2] : [2, 2];
      const seals = [];
      for (const c of counts) {
        nanali.hand = Array.from({ length: c - 1 }, (_, i) => mk(`混合娜牌${i}`));
        window.ElranaAceNanaliSkills.beforeKillTargeted(st, nanali, target,
          { name: "杀（普攻）", suit: "♠", type: "slash", power: 1,
            scale: "attack", ignoreResponse: true }, { draw() {} });
        seals.push(b.animQueue.filter(e => e.type === "sealCards").at(-1));
      }
      b.animQueue = [];
      const gained = mk("中途获得牌");
      gained._pendingDraw = true;
      target.hand.push(gained);
      const gainEv = { type: "gainCards", uid: target.uid, side: target.side,
        fromZone: "characterCard", count: 1, cards: [gained], stagger: 0 };
      const queue = scenario === "seal-seal-gain-seal"
        ? [["sealCards", seals[0]], ["sealCards", seals[1]],
          ["gainCards", gainEv], ["sealCards", seals[2]]]
        : [["sealCards", seals[0]], ["gainCards", gainEv],
          ["sealCards", seals[1]]];
      const held = [];
      for (const [mod, ev] of queue) {
        if (mod === "sealCards") await playSealQuick(ev);
        else await handler("gainCards")(ev, window.render, () => true);
        held.push(target.visualHandCount);
      }
      window.BattleEffectHandlers.clearVisuals(st);
      window.render();
      mixed.push({ scenario, held, final: handText(),
        realHand: target.hand.filter(c => !c._pendingDraw).length,
        stored: window.BattleCharacterCardStorage.count(target),
        deltas: seals.map(e => e?.visualHandDelta) });
    }

    // E. 幂等：同一事件重播两次（后台 drain + 预览夹具会各播一次）
    reset(4);
    nanali.hand = [mk("幂等娜牌")];
    window.ElranaAceNanaliSkills.beforeKillTargeted(st, nanali, target,
      { name: "杀（普攻）", suit: "♠", type: "slash", power: 1,
        scale: "attack", ignoreResponse: true }, { draw() {} });
    const idemEv = b.animQueue.find(e => e.type === "sealCards");
    b.animQueue = [];
    const idemHeld = [target.visualHandCount];
    await playSealQuick(idemEv);
    idemHeld.push(target.visualHandCount);
    await playSealQuick(idemEv);           // 重播同一个事件对象
    idemHeld.push(target.visualHandCount);
    // 旧事件（无 delta）仍走绝对快照，重播也无害
    const legacyEv = { type: "sealCards", uid: target.uid, side: target.side,
      count: 1, cards: [mk("旧事件牌")], visualHandBefore: 4,
      visualHandCount: 1, stagger: 0 };
    await playSealQuick(legacyEv);
    const legacyAfter = target.visualHandCount;
    await playSealQuick(legacyEv);
    const legacyReplay = target.visualHandCount;
    const idempotent = { held: idemHeld, appliedFlag: !!idemEv._handDeltaApplied,
      legacyAfter, legacyReplay };

    return { matrix, combo, real, mixed, idempotent };
  });

  // ── 断言 ──
  for (const c of out.matrix) {
    const expectAfter = `${c.targetN - c.taken}/4`;
    const expectedDuring = c.snaps.map(s => `${s.after}/4`);
    T(`A ${c.label}：扣前/挂起/动画中/动画后/返还 显示一致`,
      c.before === `${c.targetN}/4` && c.stale === c.before
      && JSON.stringify(c.during) === JSON.stringify(expectedDuring)
      && c.after === expectAfter && c.afterReturn === c.before
      && c.stored === c.taken && c.storedAfter === 0
      && (c.taken ? c.badgeText === `存×${c.taken}` : c.badgeText === null), c);
    T(`A ${c.label}：事件 count/快照/相对增量自洽`,
      c.snaps.every(s => s.count === s.cards && s.delta === -s.count
        && s.after === s.before - s.count), c.snaps);
  }
  T("B 连击不同扣牌数 2/1/2：显示逐次 5→3→2→0，不跳到最终值",
    out.combo.before === "5/4" && out.combo.stale === "5/4"
    && JSON.stringify(out.combo.during) === JSON.stringify(["3/4", "2/4", "0/4"])
    && out.combo.after === "0/4" && out.combo.stored === 5
    && out.combo.badge === "存×5"
    && out.combo.snaps.every(s => s.delta === -s.count), out.combo);
  for (const c of out.real) {
    T(`C ${c.label}：真实 useCard 链路显示与真实手牌一致`,
      c.stale === c.before && c.after === `${c.realHand}/4`
      && c.realHand === c.before.split("/")[0] - c.taken
      && c.stored === c.taken, c);
  }
  T("D 混合队列 seal-seal-gain-seal：相对增量不被抹掉（旧 BUG 会显示 1）",
    JSON.stringify(out.mixed[0].held) === JSON.stringify([4, 3, 4, 2])
    && out.mixed[0].final === `${out.mixed[0].realHand}/4`
    && out.mixed[0].deltas.every(d => d < 0), out.mixed[0]);
  T("D 混合队列 seal-gain-seal：相对增量不被抹掉（旧 BUG 会显示 2）",
    JSON.stringify(out.mixed[1].held) === JSON.stringify([4, 5, 3])
    && out.mixed[1].final === `${out.mixed[1].realHand}/4`, out.mixed[1]);
  T("E 幂等：同一扣置事件重播两次只减一次，旧无 delta 事件仍为绝对快照",
    JSON.stringify(out.idempotent.held) === JSON.stringify([4, 2, 2])
    && out.idempotent.appliedFlag === true
    && out.idempotent.legacyAfter === 1
    && out.idempotent.legacyReplay === 1, out.idempotent);
  const rel = relevantErrors(errors);
  T("F 全程无 pageerror / console error", rel.length === 0, rel.slice(0, 3));
  console.log(`\nRESULT ${passed.filter(Boolean).length}/${passed.length}`);
  await browser.close();
  process.exit(passed.every(Boolean) ? 0 : 1);
})();
