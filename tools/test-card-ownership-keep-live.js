// 移牌效果 · 二次转移不得改写原归属（stolenFromUid）
//
// 要回答的问题：
//   一张牌已经被夺过一次（带 stolenFromUid 指向原主），
//   再被第二个移牌效果转手时，会不会把原归属覆盖成"当前持牌人"？
//   若覆盖，敌方的牌就会被永久洗成本方资源——即"把别人的牌转成自己的"。
//
// 判定机制（真实浏览器 + 真实弃牌入口）：
//   1. 给持牌者手里塞一张牌，手动设 stolenFromUid = 第三方.uid
//      （第三方 = 不参与本次移牌的单位，模拟"这张牌真正的原主"）
//   2. 触发移牌效果，牌进入接收方手牌
//   3. 断言 stolenFromUid 仍是第三方.uid（未被改写）
//   4. 用 window.BattleCards.put 真实弃置，断言落回第三方牌堆
//
// 覆盖入口（跨阵营双向 + 同阵营借用）：
//   希特威·心血之咒      敌 → 我   原主=我方另一角色
//   凯瑟琳·窃取          敌 → 我   原主=我方另一角色
//   艾斯·勾爪陷阱        敌 → 我   原主=我方另一角色
//   兽人无人机·采精      我 → 敌   原主=敌方另一角色
//   狂鲨·冲锋掠夺        我 → 敌   原主=敌方另一角色
//   凋零者·魅魔吸取      我 → 敌   原主=敌方另一角色
//   借刀杀人(玩家路径)   同阵营     原主=敌方角色（队友手里的敌方牌）
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

// 统一战斗环境；给每个单位分配独立牌堆，才能判断牌最终落在谁那里
const baseTpl = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false; b.pendingVictory = false;
  b.allies.concat(b.enemies).forEach((u, i) => {
    u.hp = 80; u.maxHp = 100; u.block = 0; u.hand = [];
    u.pileStats = { deck: [], discard: [], consumed: [], draw: [] };
  });
  st.log = [];
  window.render();
  window.BattleEffects.recover(st);
  return { allies: b.allies.length, foes: b.enemies.length };
})()`;

// 通用审计：接收方手里那张探针牌，归属是否仍是第三方；弃置后是否落回第三方堆
const auditTpl = `(receiverUid) => {
  const b = window.state.battle;
  const units = b.allies.concat(b.enemies);
  const receiver = units.find(u => u.uid === receiverUid);
  if (!receiver) return { error: "no receiver" };
  const idx = receiver.hand.findIndex(c => c._keepProbe);
  if (idx < 0) return { error: "probe card not received", hand: receiver.hand.map(c => c.name) };
  const card = receiver.hand[idx];
  const stolenUid = card.stolenFromUid || null;
  const kept = stolenUid === window.__KEEP_THIRD_UID;
  // 真实弃置入口
  window.BattleCards.put(b, receiver, card, "discard");
  let landedUid = null, landedSide = null;
  units.forEach(u => {
    const ps = u.pileStats || {};
    ["discard", "consumed"].forEach(k => {
      if ((ps[k] || []).some(c => c._keepProbe)) { landedUid = u.uid; landedSide = u.side; }
    });
  });
  return {
    card: card.name, stolenUid, thirdUid: window.__KEEP_THIRD_UID,
    kept, landedUid, landedSide,
    returned: landedUid === window.__KEEP_THIRD_UID,
  };
}`;

async function runKeep(page, name, prepareTpl, triggerTpl, receiverExpr) {
  await page.evaluate(baseTpl);
  const prepare = await page.evaluate(prepareTpl);
  const setup = await page.evaluate(triggerTpl);
  const receiverUid = await page.evaluate(receiverExpr);
  const audit = await page.evaluate(
    `(${auditTpl})(${JSON.stringify(receiverUid)})`);
  if (audit.error) {
    T(`${name} · 移牌确实发生`, false, { prepare, setup, audit });
    return;
  }
  T(`${name} · 移牌确实发生（收到「${audit.card}」）`, true);
  T(`${name} · 二次转移未改写原归属（stolenFromUid 仍是原主）`,
    audit.kept, audit);
  T(`${name} · 弃置后落回原主牌堆（未永久占有）`, audit.returned, audit);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e.message || e)));
  await openGame(page);
  await startRegressionBattle(page);

  // ── 1. 希特威·心血之咒（敌 → 我），原主 = 我方另一角色 ──
  await runKeep(page, "心血之咒",
    `(() => {
      const b = window.state.battle;
      const t = b.allies[0], src = b.enemies[0], third = b.allies[1];
      window.__KEEP_THIRD_UID = third.uid;
      t.name = "希特威"; t.ref = "hitwell"; t.id = "hitwell";
      t.stats = { attack: 3, magic: 3, speed: 4 };
      t.skills = [{ name: "心血之咒", type: "passive" }];
      // 这张红桃牌真正的原主是 third（我方另一角色），只是暂时在敌方手里
      src.hand = [{ name: "红桃牌", type: "slash", suit: "♥", _keepProbe: true,
        stolenFromUid: third.uid }];
      return { srcHand: src.hand.length, thirdUid: third.uid };
    })()`,
    `(() => {
      const st = window.state, b = st.battle;
      const t = b.allies[0], src = b.enemies[0];
      window.HitwellSkills.afterDamage(st, src, t,
        { name: "攻击", type: "slash", suit: "♠" }, 4,
        { damage: () => {}, directDamage: () => {} });
      return { srcHand: src.hand.length, tHand: t.hand.length };
    })()`,
    `window.state.battle.allies[0].uid`);

  // ── 2. 凯瑟琳·窃取（敌 → 我），原主 = 我方另一角色 ──────
  await runKeep(page, "凯瑟琳窃取",
    `(() => {
      const b = window.state.battle;
      const c = b.allies[0], mate = b.allies[1], victim = b.enemies[0];
      window.__KEEP_THIRD_UID = mate.uid;
      c.name = "凯瑟琳"; c.ref = "catherine"; c.id = "catherine";
      c.skills = [{ name: "窃取", type: "trigger" }];
      c.usedCatherineSteal = false; c.hand = []; mate.hand = [];
      victim.hand = [{ name: "敌方手牌", type: "slash", suit: "♠", _keepProbe: true,
        stolenFromUid: mate.uid }];
      return { victimHand: victim.hand.length };
    })()`,
    `(() => {
      const st = window.state, b = st.battle;
      const c = b.allies[0], mate = b.allies[1], victim = b.enemies[0];
      window.CatherineSkills.handleSpecialCard(st, c, victim,
        { name: "窃取", type: "tactic", catherineSteal: true });
      window.CatherineSkills.chooseReceiver(st, mate.uid);
      const shown = victim.hand[0];
      window.CatherineSkills.resolveSteal(st, c, victim, b.handReveal, shown);
      return { victimHand: victim.hand.length, mateHand: mate.hand.length };
    })()`,
    `window.state.battle.allies[1].uid`);

  // ── 3. 艾斯·勾爪陷阱（敌 → 我），原主 = 我方另一角色 ────
  await runKeep(page, "勾爪陷阱",
    `(() => {
      const b = window.state.battle;
      const responder = b.allies[0], source = b.enemies[0], third = b.allies[1];
      window.__KEEP_THIRD_UID = third.uid;
      responder.name = "艾斯"; responder.ref = "ace";
      responder.skills = [{ name: "勾爪陷阱", type: "passive" }];
      responder.hand = [];
      source.hand = [{ name: "敌牌", type: "slash", suit: "♣", _keepProbe: true,
        stolenFromUid: third.uid }];
      return { srcHand: source.hand.length };
    })()`,
    `(() => {
      const st = window.state, b = st.battle;
      const responder = b.allies[0], source = b.enemies[0];
      const api = { pushFloat: () => {}, damage: () => {}, draw: () => 0 };
      window.ElranaAceNanaliSkills.afterResponse(st, responder, source, api);
      return { srcHand: source.hand.length, selfHand: responder.hand.length };
    })()`,
    `window.state.battle.allies[0].uid`);

  // ── 4. 兽人无人机·采精（我 → 敌），原主 = 敌方另一角色 ──
  await runKeep(page, "无人机采精",
    `(() => {
      const b = window.state.battle;
      const actor = b.enemies[0], target = b.allies[0], third = b.enemies[1];
      window.__KEEP_THIRD_UID = third.uid;
      actor.name = "自杀无人机"; actor.ai = "orc_suicide_drone"; actor.hand = [];
      target.hand = [{ name: "我方牌1", type: "slash", suit: "♠", _keepProbe: true,
        stolenFromUid: third.uid },
        { name: "我方牌2", type: "tactic", suit: "♥" }];
      return { tgtHand: target.hand.length };
    })()`,
    `(() => {
      const st = window.state, b = st.battle;
      const actor = b.enemies[0], target = b.allies[0];
      actor.usedDroneExtract = false;
      actor.deck = [{ name: "亮出的牌", type: "slash", suit: "♣" }];
      window.OrcDungeonSkills?.useDroneExtract?.(st, actor, target);
      return { tgtHand: target.hand.length, selfHand: actor.hand.length };
    })()`,
    `window.state.battle.enemies[0].uid`);

  // ── 5. 狂鲨·冲锋掠夺（我 → 敌），原主 = 敌方另一角色 ────
  await runKeep(page, "冲锋掠夺",
    `(() => {
      const b = window.state.battle;
      const actor = b.enemies[0], target = b.allies[0], third = b.enemies[1];
      window.__KEEP_THIRD_UID = third.uid;
      actor.name = "狂鲨海盗团掠夺者"; actor.ai = "shark_pirate_raider"; actor.hand = [];
      target.hand = [{ name: "我方牌", type: "slash", suit: "♦", _keepProbe: true,
        stolenFromUid: third.uid }];
      return { tgtHand: target.hand.length };
    })()`,
    `(() => {
      const st = window.state, b = st.battle;
      const actor = b.enemies[0], target = b.allies[0];
      const api = { pushFloat: () => {}, damage: () => {}, draw: () => 0 };
      window.UnderwaterTrainSkills?.beforeKillTargeted?.(
        st, actor, target, { name: "杀（普攻）", type: "slash", suit: "♠" }, api);
      return { tgtHand: target.hand.length, selfHand: actor.hand.length };
    })()`,
    `window.state.battle.enemies[0].uid`);

  // ── 6. 凋零者·魅魔吸取（我 → 敌），原主 = 敌方另一角色 ──
  await runKeep(page, "魅魔吸取",
    `(() => {
      const b = window.state.battle;
      const actor = b.enemies[0], target = b.allies[0], third = b.enemies[1];
      window.__KEEP_THIRD_UID = third.uid;
      actor.name = "凋零者"; actor.ai = "ruins_witherer"; actor.hand = [];
      target.hand = [{ name: "我方牌", type: "tactic", suit: "♠", _keepProbe: true,
        stolenFromUid: third.uid }];
      return { tgtHand: target.hand.length };
    })()`,
    `(() => {
      const st = window.state, b = st.battle;
      const actor = b.enemies[0], target = b.allies[0];
      const api = { pushFloat: () => {}, damage: () => {}, draw: () => 0 };
      window.RuinsWithererSkills?.afterDamage?.(st, actor, target,
        { name: "魅魔吸取", type: "tactic", suit: "♠" }, 3, api)
        || window.RuinsWithererSkills?.afterCardPlayed?.(st, actor, target,
          { name: "魅魔吸取", type: "tactic", suit: "♠" }, api);
      return { tgtHand: target.hand.length, selfHand: actor.hand.length };
    })()`,
    `window.state.battle.enemies[0].uid`);

  // ── 7. 借刀杀人·borrowGainChoice（同阵营），原主 = 敌方角色 ──
  // 队友手里拿着一张从敌方夺来的牌；我借走后，归属必须仍是敌方。
  await runKeep(page, "借刀杀人(玩家路径)",
    `(() => {
      const b = window.state.battle;
      const actor = b.allies[0], partner = b.allies[1], third = b.enemies[0];
      window.__KEEP_THIRD_UID = third.uid;
      actor.hand = [];
      partner.hand = [{ name: "队友牌", type: "tactic", suit: "♣", _keepProbe: true,
        stolenFromUid: third.uid }];
      return { partnerHand: partner.hand.length };
    })()`,
    `(() => {
      const st = window.state, b = st.battle;
      const actor = b.allies[0], partner = b.allies[1], target = b.enemies[0];
      b.comboPartnerUid = partner.uid;
      b.handReveal = {
        mode: "borrowGainChoice", actorUid: actor.uid, targetUid: partner.uid,
        card: { name: "借刀杀人", type: "tactic" },
        attackTargetUid: target.uid, validIndexes: [0], repeatAfter: false,
      };
      return (async () => {
        await window.BattleSystem?.resolveHandReveal?.(st, 0);
        let guard = 0;
        while ((window.BattleEffects.animating || window.BattleEffects.draining)
          && guard++ < 200) await new Promise(r => setTimeout(r, 25));
        return { actorHand: actor.hand.length, partnerHand: partner.hand.length };
      })();
    })()`,
    `window.state.battle.allies[0].uid`);

  T("页面无 JS 错误", errors.length === 0, errors.slice(0, 3));

  await browser.close();
  console.log(`\n通过 ${pass}/${total}`);
  process.exit(pass === total ? 0 : 1);
})();
