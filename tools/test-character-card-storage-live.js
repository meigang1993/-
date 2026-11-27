// 【角色牌存储牌】真实浏览器实机：魔刀阿波罗扣出的牌放到目标自己的角色牌上，
// 头像显示「存×N」、动画以角色牌为起落点、回合结束返还、阵亡直接入弃牌堆、
// 旧存档私有字段自动迁移。机制参考三国杀界徐盛【破军】/「置于武将牌上」规则。
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

const SETUP = `(() => {
  const st = window.state, b = st.battle;
  b.locked = false; b.animQueue = []; b._damageDepth = 0; b.phase = 4;
  ['dimensionTransfer','cadicisResponsibility','kaiichiShare','counterTrigger',
   'counterTriggerQueue','manualDodge','thunderHammer'].forEach(k => { b[k] = null; });
  b.skillCaptions = []; b.skillCaption = null; b.relicCaptions = []; b.relicCaption = null;
  b.speech = null; st.battleLog = []; st.log = [];
  window.BattleEffects.animating = false; window.BattleEffects.draining = false;
  const nanali = b.allies[0], enemy = b.enemies[0];
  Object.assign(nanali, { ref: "nanali", name: "娜娜莉", hp: 100, maxHp: 100,
    hand: [{ name: "杀（普攻）", type: "slash", suit: "♠" }],
    deck: [{ name: "补牌", type: "tactic", suit: "♦" }], discard: [], consumed: [],
    storedCards: [] });
  Object.assign(enemy, { hp: 100, maxHp: 100, block: 0,
    hand: [{ name: "敌方战术", type: "tactic", suit: "♣" },
           { name: "敌方闪", type: "response", suit: "♥" }],
    discard: [], consumed: [], storedCards: [] });
  b.activeUid = nanali.uid;
  window.render && window.render();
  return { nanaliUid: nanali.uid, enemyUid: enemy.uid };
})()`;

const SNAP = (uid) => `(() => {
  const st = window.state, b = st.battle;
  const u = b.allies.concat(b.enemies).find(x => x.uid === ${JSON.stringify(uid)});
  const badge = document.querySelector('[data-target="' + ${JSON.stringify(uid)} + '"] .stored-card-badge');
  return {
    hand: u.hand.map(c => c.name),
    stored: (u.storedCards || []).map(e => ({ name: e.card.name, source: e.source,
      release: e.release, storedTurn: e.storedTurn })),
    discard: u.discard.map(c => c.name),
    badge: badge ? { text: badge.textContent, title: badge.getAttribute("title") } : null,
    sealEvents: b.animQueue.filter(e => e.type === "sealCards")
      .map(e => ({ count: e.count, toCharacterCard: !!e.toCharacterCard, stagger: e.stagger })),
    gainEvents: b.animQueue.filter(e => e.type === "gainCards")
      .map(e => ({ fromZone: e.fromZone, count: e.count, stagger: e.stagger })),
    battleLog: (st.battleLog || []).slice(0, 8),
  };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = collectErrors(page);
  await openGame(page);
  await startRegressionBattle(page);
  const { nanaliUid, enemyUid } = await page.evaluate(SETUP);
  const snap = () => page.evaluate(SNAP(enemyUid));

  // ── A. 扣置：牌放到目标角色牌上 ──
  await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    const nanali = b.allies[0], enemy = b.enemies[0];
    window.ElranaAceNanaliSkills.beforeKillTargeted(st, nanali, enemy,
      { name: "杀（普攻）", type: "slash", suit: "♠" },
      { draw: window.BattleSystem.draw });
    // 立刻取事件快照：动画队列可能马上被 drain 消费，不能等下一次 evaluate。
    window.__ccsSealEvent = b.animQueue.find(e => e.type === "sealCards");
    window.__ccsSealEvents = b.animQueue.filter(e => e.type === "sealCards")
      .map(e => ({ count: e.count, toCharacterCard: !!e.toCharacterCard,
        placeOnce: !!e.placeOnce, stagger: e.stagger }));
    window.render && window.render();
    return true;
  })()`);
  const a = await snap();
  a.sealEvents = await page.evaluate("window.__ccsSealEvents || []");
  console.log("A_扣置", JSON.stringify(a));
  T("A1 魔刀阿波罗扣出的牌进入目标角色牌存储区（storedCards），不再留在手牌",
    a.stored.length === 2 && a.hand.length === 0
    && a.stored.every(x => x.source === "魔刀阿波罗" && x.release === "anyTurnEnd"), a);
  T("A2 头像显示「存×2」徽章，tooltip 写明移出游戏并列出两张牌名",
    a.badge?.text === "存×2" && a.badge.title.includes("角色牌上的存储牌")
    && a.badge.title.includes("移出游戏")
    && a.badge.title.includes("敌方战术") && a.badge.title.includes("敌方闪"), a.badge);
  T("A3 扣置动画整批一次落位且落点为角色牌（toCharacterCard + placeOnce）",
    a.sealEvents.length === 1 && a.sealEvents[0].count === 2
    && a.sealEvents[0].toCharacterCard === true
    && a.sealEvents[0].placeOnce === true
    && a.sealEvents[0].stagger === 0, a.sealEvents);
  // A3b：真实播放一次 sealCards 动画，spy 确认「一次性放牌」不是 N 张并行飞。
  const once = await page.evaluate(async () => {
    // 页面可能还在自动 drain 扣置事件：先排空并清空队列，避免并发动画
    // 让 cardLand spy 数到别人的落位（一次性放牌只应有 1 次）。
    await window.BattleEffects.whenIdle();
    window.state.battle.animQueue = [];
    const ev = window.__ccsSealEvent;
    const origFront = window.BattleEffectCardDOM.front;
    const origLand = window.BattleFX.cardLand;
    let domCount = 0, landCount = 0, lastEl = null;
    window.BattleEffectCardDOM.front = (...args) => {
      lastEl = origFront(...args); domCount++; return lastEl;
    };
    window.BattleFX.cardLand = (...args) => { landCount++; return origLand(...args); };
    const node = document.querySelector('[data-target="' + ev.uid + '"] .unit-art');
    const rect = node?.getBoundingClientRect();
    const end = rect ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } : null;
    await window.BattleEffectHandlers.sealCards(ev, () => {}, () => true);
    window.BattleEffectCardDOM.front = origFront;
    window.BattleFX.cardLand = origLand;
    const start = lastEl
      ? { x: parseFloat(lastEl.style.left), y: parseFloat(lastEl.style.top) } : null;
    return {
      domCount, landCount,
      cls: lastEl?.className || "",
      badge: lastEl?.querySelector(".stored-place-count")?.textContent || "",
      layers: lastEl?.querySelectorAll(".stored-place-layer").length || 0,
      start, end,
      distance: start && end
        ? Math.round(Math.hypot(end.x - start.x, end.y - start.y)) : null,
    };
  });
  console.log("A3b_一次性放牌", JSON.stringify(once));
  T("A3b 一次性放牌实机：整批只 1 个 DOM / 1 次落位 / 叠层 ×2 角标 / 起点与角色牌有位移",
    once.domCount === 1 && once.landCount === 1
    && once.cls.includes("stored-card-place")
    && once.badge === "×2" && once.layers === 1
    && once.distance >= 24, once);
  T("A4 战报写明「扣置于其角色牌上（存储牌）」",
    a.battleLog.some(t => t.includes("扣置于其角色牌上（存储牌）")), a.battleLog);

  // ── B. 回合结束：该角色获得存储牌并置入手牌 ──
  await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    b.animQueue = [];
    window.ElranaAceNanaliSkills.endTurn(st, b.allies[0], {});
    window.__ccsGainEvents = b.animQueue.filter(e => e.type === "gainCards")
      .map(e => ({ fromZone: e.fromZone, count: e.count, stagger: e.stagger }));
    window.render && window.render();
    return true;
  })()`);
  const b = await snap();
  b.gainEvents = await page.evaluate("window.__ccsGainEvents || []");
  console.log("B_返还", JSON.stringify(b));
  T("B1 任意角色回合结束：2 张存储牌回到该角色手牌、存储区清空",
    b.hand.length === 2 && b.stored.length === 0
    && b.hand.includes("敌方战术") && b.hand.includes("敌方闪"), b);
  T("B2 返还动画从角色牌起飞（fromZone=characterCard）、整批一次落位",
    b.gainEvents.length === 1 && b.gainEvents[0].fromZone === "characterCard"
    && b.gainEvents[0].count === 2 && b.gainEvents[0].stagger === 0, b.gainEvents);
  T("B3 头像「存×N」徽章消失，战报写明存储牌回到手中",
    b.badge === null && b.battleLog.some(t => t.includes("存储牌") && t.includes("回到手中")),
    { badge: b.badge, log: b.battleLog });

  // ── C. 阵亡：按破军 FAQ 直接置入弃牌堆，不回手牌 ──
  await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    const nanali = b.allies[0], enemy = b.enemies[0];
    b.animQueue = [];
    enemy.hand = [{ name: "再扣战术", type: "tactic", suit: "♣" },
                  { name: "再扣闪", type: "response", suit: "♥" }];
    enemy.storedCards = [];
    window.ElranaAceNanaliSkills.beforeKillTargeted(st, nanali, enemy,
      { name: "杀（普攻）", type: "slash", suit: "♠" }, { draw: () => [] });
    return true;
  })()`);
  const beforeDeath = await snap();
  T("C1 阵亡前目标角色牌上重新有 2 张存储牌",
    beforeDeath.stored.length === 2 && beforeDeath.hand.length === 0, beforeDeath);
  const death = await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    const enemy = b.enemies[0];
    enemy.hp = 0; enemy.deathDiscarded = true;   // 只测存储牌分支，跳过手牌弃置
    // BattleCards.put 会按 CardOwnership 把牌导向共享弃牌堆，不一定落进
    // unit.discard；用 spy 精确验证「整批以 discard 去向交给出牌系统」。
    const orig = window.BattleCards.putMany;
    const captured = [];
    window.BattleCards.putMany = (bb, u, cards, pile, opts) => {
      captured.push({ pile, count: cards.length, names: cards.map(c => c.name) });
      return orig(bb, u, cards, pile, opts);
    };
    // 走真实阵亡结算接线（battle-combat-defeat.js 的 discardDeadHands）
    const mod = window.BattleCombatDefeat({
      deps: {}, allUnits: bb => bb.allies.concat(bb.enemies || []),
      pendingFatalAnim: () => false, clearSelection: () => {},
    });
    mod.discardDeadHands(st, b);
    window.BattleCards.putMany = orig;
    window.render && window.render();
    return { captured, discard: enemy.discard.length,
      stored: enemy.storedCards?.length || 0, hand: enemy.hand.length,
      badge: !!document.querySelector('.stored-card-badge'),
      log: (st.battleLog || []).slice(0, 3) };
  })()`);
  console.log("C_阵亡", JSON.stringify(death));
  T("C2 阵亡结算把角色牌上的存储牌整批置入弃牌堆，不回手牌、徽章消失",
    death.captured.length === 1 && death.captured[0].pile === "discard"
    && death.captured[0].count === 2 && death.stored === 0
    && death.hand === 0 && death.badge === false
    && death.log.some(x => x.includes("直接置入弃牌堆")), death);

  // ── D. 旧存档兼容 ──
  const legacy = await page.evaluate(`(() => {
    const u = { uid: "legacy_test", name: "旧档", side: "enemy", hp: 20, hand: [],
      nanaliSealed: [{ name: "旧暂存牌", type: "tactic", suit: "♠" }] };
    const cards = window.BattleCharacterCardStorage.cardsOf(u);
    return { count: cards.length, name: cards[0]?.name,
      source: u.storedCards?.[0]?.source, legacy: u.nanaliSealed?.length || 0 };
  })()`);
  console.log("D_旧档", JSON.stringify(legacy));
  T("D1 旧存档 nanaliSealed 自动迁移为角色牌存储区条目",
    legacy.count === 1 && legacy.name === "旧暂存牌"
    && legacy.source === "魔刀阿波罗" && legacy.legacy === 0, legacy);

  // ── E. 正向未坏：魔刀其余规则（虚拟杀不触发） ──
  const virtual = await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    const nanali = b.allies[0], enemy = b.enemies[1] || b.enemies[0];
    enemy.hp = 100; enemy.hand = [{ name: "虚拟场景牌", type: "tactic", suit: "♦" }];
    enemy.storedCards = [];
    window.ElranaAceNanaliSkills.beforeKillTargeted(st, nanali, enemy,
      { name: "杀（普攻）", type: "slash", suit: "♠", virtual: true }, { draw: () => [] });
    return { hand: enemy.hand.length, stored: enemy.storedCards?.length || 0 };
  })()`);
  console.log("E_虚拟杀", JSON.stringify(virtual));
  T("E1 正向：虚拟单体【杀】仍不触发魔刀阿波罗（既有实体口径未坏）",
    virtual.hand === 1 && virtual.stored === 0, virtual);

  const rel = relevantErrors(errors);
  T("F1 全程无 pageerror / console error", rel.length === 0, rel.slice(0, 3));
  console.log(`\nRESULT ${passed.filter(Boolean).length}/${passed.length}`);
  await browser.close();
  process.exit(passed.every(Boolean) ? 0 : 1);
})();
