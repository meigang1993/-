// 交牌 / 移牌效果 · 牌归属（ownership）严格审计
//
// 要回答的问题：
//   从对方阵营拿到的牌，用完之后会不会永久留在本方牌库里？
//
// 判定机制（不是看代码里有没有写 stolenFromUid，而是看牌最终进了谁的堆）：
//   1. 开局给每个单位的每张牌打上 _originSide / _originUid（出生阵营）
//   2. 触发移牌效果，让牌进入接收方手牌
//   3. 用真实弃牌入口 window.BattleCards.put 把这张牌弃掉
//   4. 看它最终落在谁的 pileStats.discard
//      - 落在原主堆里  = 正确归还（有 stolenFromUid）
//      - 留在接收方堆里 = BUG：本方永久获得对方阵营的牌
//
// 覆盖的移牌入口（跨阵营优先，同阵营兼测一致性）：
//   希特威·心血之咒（敌 → 我）
//   凯瑟琳·窃取（敌 → 我）
//   艾斯·勾爪陷阱（敌 → 我）
//   狂鲨海盗团掠夺者·冲锋掠夺（我 → 敌）
//   废墟·凋零者·魅魔吸取（我 → 敌）
//   兽人·自杀无人机·采精（我 → 敌）
//   借刀杀人·borrowGainChoice（同阵营；AI 路径会归还，玩家路径必须一致）
//   樱丽莎·吸魔邪眼 drawRecipient（敌 → 我）
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

// 统一战斗环境 + 出生阵营打标
const baseTpl = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false; b.pendingVictory = false;
  b.allies.concat(b.enemies).forEach(u => {
    u.hp = 80; u.maxHp = 100; u.block = 0; u.hand = [];
    u.pileStats = u.pileStats || { deck: [], discard: [], consumed: [], draw: [] };
    ["deck", "discard", "consumed", "draw"].forEach(k => { u.pileStats[k] = u.pileStats[k] || []; });
  });
  st.log = [];
  window.render();
  window.BattleEffects.recover(st);
  return { allies: b.allies.length, foes: b.enemies.length };
})()`;

// 给全场所有牌打出生标记；之后新生成的牌没有标记（自然不会误判）
const tagTpl = `(() => {
  const b = window.state.battle;
  let n = 0;
  // 同阵营单位可能共享同一个 pileStats（同一份牌堆），先到先得，
  // 否则后一个单位会把标记覆盖掉，导致"原主"认错。
  const mark = (c, u) => {
    if (!c || c._originUid) return;
    c._originSide = u.side; c._originUid = u.uid; n++;
  };
  b.allies.concat(b.enemies).forEach(u => {
    ["hand", "deck", "discard", "consumed"].forEach(k => {
      (u[k] || []).forEach(c => mark(c, u));
    });
    const ps = u.pileStats;
    if (ps) ["deck", "discard", "consumed", "draw"].forEach(k => {
      (ps[k] || []).forEach(c => mark(c, u));
    });
  });
  return n;
})()`;

// 把接收方手牌里「不是本阵营出生」的牌全部弃掉，返回每张牌的最终落点
const auditTpl = `((receiverUid) => {
  const st = window.state, b = st.battle;
  const units = b.allies.concat(b.enemies);
  const receiver = units.find(u => u.uid === receiverUid);
  if (!receiver) return { error: "no receiver" };
  // 只要「不是自己出生的牌」都算移牌所得：跨阵营的牌必须归还，
  // 同阵营借来的牌也要与 AI 路径一致（借刀杀人两条路径必须同行为）。
  const foreign = (receiver.hand || []).filter(c => c._originUid && c._originUid !== receiver.uid);
  const results = foreign.map(card => {
    const originUid = card._originUid;
    const hadMark = !!card.stolenFromUid;
    window.BattleCards.put(b, receiver, card, "discard", { skipAnim: true });
    const locations = units.flatMap(u => {
      const ps = u.pileStats || u, hits = [];
      if ((u.hand || []).includes(card)) hits.push("hand:" + u.uid);
      ["deck", "discard", "consumed", "draw"].forEach(k => {
        if ((ps[k] || []).includes(card)) hits.push(k + ":" + u.uid);
      });
      return hits;
    });
    const where = units.filter(u => {
      const ps = u.pileStats || u;
      return (ps.discard || []).includes(card) || (ps.consumed || []).includes(card);
    }).map(u => ({ name: u.name, side: u.side, uid: u.uid }));
    const landed = where[0] || null;
    return {
      card: card.name,
      originUid,
      originSide: card._originSide,
      receiverSide: receiver.side,
      hadMark,
      landedUid: landed ? landed.uid : null,
      landedSide: landed ? landed.side : null,
      returned: !!landed && landed.uid === originUid,
      kept: !!landed && landed.uid !== originUid,
      stolenUid: card.stolenFromUid || null,
      locations,
    };
  });
  return { count: foreign.length, results };
})`;

async function runScenario(page, name, prepareTpl, triggerTpl, receiverExpr) {
  await page.evaluate(baseTpl);
  const prepare = await page.evaluate(prepareTpl);
  await page.evaluate(tagTpl);
  const setup = await page.evaluate(triggerTpl);
  const receiverUid = await page.evaluate(receiverExpr);
  const audit = await page.evaluate(
    `(${auditTpl})(${JSON.stringify(receiverUid)})`);
  return { name, prepare, setup, audit };
}

// 通用断言：所有跨阵营转移的牌都必须归还原主
function assertReturned(scenario) {
  const { name, prepare, setup, audit } = scenario;
  if (audit.error) {
    T(`${name} · 取到接收方`, false, { prepare, setup, audit });
    return;
  }
  if (!audit.count) {
    T(`${name} · 确实发生了跨阵营移牌`, false, { prepare, setup, audit });
    return;
  }
  T(`${name} · 确实发生了跨阵营移牌（${audit.count} 张）`, true);
  audit.results.forEach((r, i) => {
    T(`${name} · 第${i + 1}张「${r.card}」带 stolenFromUid 且指向原主`,
      r.hadMark && r.stolenUid === r.originUid, r);
    // 跨阵营时两侧牌堆独立，可以直接验证弃置后真的落回原主堆；
    // 同阵营（如借刀杀人）牌堆可能共享，位置判据不可用，只验标记。
    if (r.originSide !== r.receiverSide) {
      T(`${name} · 第${i + 1}张弃置后落回原主牌堆（${r.originSide}）`,
        r.returned && !r.kept, r);
    }
  });
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e.message || e)));
  await openGame(page);
  await startRegressionBattle(page);

  // ── 1. 希特威·心血之咒（敌方受伤者交牌给我方） ──────────
  assertReturned(await runScenario(page, "心血之咒",
    `(() => {
      const b = window.state.battle;
      const t = b.allies[0], src = b.enemies[0];
      t.name = "希特威"; t.ref = "hitwell"; t.id = "hitwell";
      t.stats = { attack: 3, magic: 3, speed: 4 };
      t.tempAttack = 0; t.tempMagic = 0;
      t.skills = [{ name: "心血之咒", type: "passive" }];
      src.hand = [{ name: "红桃牌", type: "slash", suit: "♥" }];
      return { srcHand: src.hand.length, tHand: t.hand.length };
    })()`,
    `(() => {
      const st = window.state, b = st.battle;
      const t = b.allies[0], src = b.enemies[0];
      window.HitwellSkills.afterDamage(st, src, t,
        { name: "攻击", type: "slash", suit: "♠" }, 4,
        { damage: () => {}, directDamage: () => {} });
      return { srcHand: src.hand.length, tHand: t.hand.length };
    })()`,
    `window.state.battle.allies[0].uid`));

  // ── 2. 凯瑟琳·窃取（敌方 → 我方队友） ──────────────────
  assertReturned(await runScenario(page, "凯瑟琳窃取",
    `(() => {
      const st = window.state, b = st.battle;
      const c = b.allies[0], mate = b.allies[1], victim = b.enemies[0];
      c.name = "凯瑟琳"; c.ref = "catherine"; c.id = "catherine";
      c.skills = [{ name: "窃取", type: "trigger" }];
      c.usedCatherineSteal = false; c.hand = [];
      mate.hand = [];
      victim.hand = [{ name: "敌方手牌", type: "slash", suit: "♠" }];
      return { victimHand: victim.hand.length, mateHand: mate.hand.length };
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
    `window.state.battle.allies[1].uid`));

  // ── 3. 艾斯·勾爪陷阱（敌方 → 我方） ────────────────────
  assertReturned(await runScenario(page, "勾爪陷阱",
    `(() => {
      const b = window.state.battle;
      const responder = b.allies[0], source = b.enemies[0];
      responder.name = "艾斯"; responder.ref = "ace";
      responder.skills = [{ name: "勾爪陷阱", type: "passive" }];
      responder.hand = [];
      source.hand = [{ name: "敌牌", type: "slash", suit: "♣" }];
      return { srcHand: source.hand.length };
    })()`,
    `(() => {
      const st = window.state, b = st.battle;
      const responder = b.allies[0], source = b.enemies[0];
      const api = { pushFloat: () => {}, damage: () => {}, draw: () => 0 };
      window.ElranaAceNanaliSkills.afterResponse(st, responder, source, api);
      return { srcHand: source.hand.length, selfHand: responder.hand.length };
    })()`,
    `window.state.battle.allies[0].uid`));

  // ── 4. 狂鲨掠夺（我方 → 敌方） ─────────────────────────
  assertReturned(await runScenario(page, "冲锋掠夺",
    `(() => {
      const b = window.state.battle;
      const actor = b.enemies[0], target = b.allies[0];
      actor.name = "狂鲨海盗团掠夺者"; actor.ai = "shark_pirate_raider";
      actor.hand = [];
      target.hand = [{ name: "我方牌", type: "slash", suit: "♦" }];
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
    `window.state.battle.enemies[0].uid`));

  // ── 5. 凋零者·魅魔吸取（我方 → 敌方） ──────────────────
  assertReturned(await runScenario(page, "魅魔吸取",
    `(() => {
      const b = window.state.battle;
      const actor = b.enemies[0], target = b.allies[0];
      actor.name = "凋零者"; actor.ai = "ruins_witherer";
      actor.hand = [];
      target.hand = [{ name: "我方牌", type: "tactic", suit: "♠" }];
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
    `window.state.battle.enemies[0].uid`));

  // ── 6. 兽人·自杀无人机·采精（我方 → 敌方） ─────────────
  assertReturned(await runScenario(page, "无人机采精",
    `(() => {
      const b = window.state.battle;
      const actor = b.enemies[0], target = b.allies[0];
      actor.name = "自杀无人机"; actor.ai = "orc_suicide_drone";
      actor.hand = [];
      target.hand = [{ name: "我方牌1", type: "slash", suit: "♠" },
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
    `window.state.battle.enemies[0].uid`));

  // ── 7. 借刀杀人 · borrowGainChoice（玩家路径） ──────────
  // 同阵营，但 AI 路径 gainBorrowedCard 会写 stolenFromUid；
  // 玩家走 openBorrowPrompt → resolveHandReveal 必须行为一致。
  {
    const s = await runScenario(page, "借刀杀人(玩家路径)",
      `(() => {
        const b = window.state.battle;
        const actor = b.allies[0], partner = b.allies[1], target = b.enemies[0];
        actor.hand = [];
        partner.hand = [{ name: "队友牌", type: "tactic", suit: "♣" }];
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
          return { actorHand: actor.hand.length, partnerHand: partner.hand.length,
            mode: b.handReveal ? b.handReveal.mode : null,
            logs: st.log.slice(-2) };
        })();
      })()`,
      `window.state.battle.allies[0].uid`);
    const r = s.audit.results?.[0];
    T("借刀杀人(玩家路径) · 确实发生了移牌", (s.audit.count || 0) > 0,
      { prepare: s.prepare, setup: s.setup, audit: s.audit });
    if (r) {
      T("借刀杀人(玩家路径) · 与 AI 路径一致：写 stolenFromUid", r.hadMark, r);
      T("借刀杀人(玩家路径) · 标记指向队友（与 AI 路径一致）",
        r.stolenUid === r.originUid, r);
    }
  }

  // ── 8. 樱丽莎·吸魔邪眼（敌方摸牌被转交给我方） ─────────
  {
    const s = await runScenario(page, "吸魔邪眼",
      `(() => {
        const st = window.state, b = st.battle;
        const risa = b.allies[0], foe = b.enemies[0];
        risa.name = "樱丽莎"; risa.ref = "sakura_risa"; risa.hand = [];
        foe.hand = [];
        foe.deck = [{ name: "敌方摸到的牌", type: "slash", suit: "♠" }];
        const ps = foe.pileStats || (foe.pileStats = {});
        ps.deck = foe.deck; ps.discard = ps.discard || [];
        ps.consumed = ps.consumed || []; ps.draw = ps.draw || [];
        return { foeDeck: foe.deck.length };
      })()`,
      `(() => {
        const st = window.state, b = st.battle;
        const risa = b.allies[0], foe = b.enemies[0];
        b.phase = 4; b.activeUid = foe.uid;
        b.risaEye = { ownerUid: risa.uid, targetUid: foe.uid };
        const draw = window.BattleSystem?.draw || window.__draw;
        if (!draw) return { skipped: "no draw api" };
        draw(foe, 1, b);
        return { risaHand: risa.hand.length, foeHand: foe.hand.length };
      })()`,
      `window.state.battle.allies[0].uid`);
    if (s.setup.skipped) {
      T("吸魔邪眼 · 能取到摸牌入口", false, s.setup);
    } else {
      const r = s.audit.results?.[0];
      T("吸魔邪眼 · 确实把敌方摸到的牌转交给我方", (s.audit.count || 0) > 0,
        { setup: s.setup, audit: s.audit });
      if (r) {
        T("吸魔邪眼 · 转交的牌写 stolenFromUid", r.hadMark, r);
        T("吸魔邪眼 · 弃置后归还敌方（不永久占有）", r.returned && !r.kept, r);
      }
    }
  }

  // ── 9. 卡牌「偷窃」（我方 → 敌，走 openHandReveal + resolveHandReveal） ──
  assertReturned(await runScenario(page, "偷窃牌",
    `(() => {
      const b = window.state.battle;
      const actor = b.allies[0], victim = b.enemies[0];
      actor.hand = [];
      victim.hand = [{ name: "敌方手牌", type: "slash", suit: "♠" }];
      return { victimHand: victim.hand.length };
    })()`,
    `(() => {
      const st = window.state, b = st.battle;
      const actor = b.allies[0], victim = b.enemies[0];
      // 走真实出牌入口：BattleCardStealApi 只有走一次 card.stealCard 分支才会初始化
      window.BattleSystem?.useCard?.(st, actor, victim,
        { name: "偷窃", type: "tactic", stealCard: true, suit: "♠" });
      return (async () => {
        await window.BattleSystem?.resolveHandReveal?.(st, 0);
        let guard = 0;
        while ((window.BattleEffects.animating || window.BattleEffects.draining)
          && guard++ < 200) await new Promise(r => setTimeout(r, 25));
        return { victimHand: victim.hand.length, selfHand: actor.hand.length };
      })();
    })()`,
    `window.state.battle.allies[0].uid`));

  // ── 10. 卡牌「吸魔杀」（敌方直接偷，走 BattleCardStealApi 非玩家分支） ──
  assertReturned(await runScenario(page, "吸魔杀",
    `(() => {
      const b = window.state.battle;
      const actor = b.enemies[0], target = b.allies[0];
      actor.hand = [];
      target.hand = [{ name: "我方手牌", type: "slash", suit: "♥" }];
      return { tgtHand: target.hand.length };
    })()`,
    `(() => {
      const st = window.state, b = st.battle;
      const actor = b.enemies[0], target = b.allies[0];
      // 前面的「偷窃」场景已把 BattleCardStealApi 挂上；敌方用牌走非玩家分支
      window.BattleCardStealApi?.(st, actor, target,
        { name: "吸魔杀", type: "slash", stealCard: true, suit: "♥" });
      return { tgtHand: target.hand.length, selfHand: actor.hand.length,
        api: typeof window.BattleCardStealApi };
    })()`,
    `window.state.battle.enemies[0].uid`));

  T("页面无 JS 错误", errors.length === 0, errors.slice(0, 3));
  await browser.close();
  console.log(`\n结果：${pass}/${total}`);
  process.exit(pass === total ? 0 : 1);
})();
