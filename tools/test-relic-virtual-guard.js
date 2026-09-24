// 饰品虚拟牌审计：用饰品真实造牌代码生成卡牌对象，检查是否误触发外神之眼
const fs = require("fs");
const vm = require("vm");

function load(file) {
  vm.runInThisContext(fs.readFileSync(file, "utf8"), { filename: file });
}

function setup() {
  global.window = global;
  window.GameData = {
    enemies: {}, statDefs: [],
    eliteCards: [
      { name: "魔法对决", type: "tactic" },
      { name: "魔弹特攻", type: "tactic" },
    ],
  };
  window.BattleLog = { add(state, m) { (state.log ||= []).push(m); } };
  window.BattleLines = { skill(state, unit, name) { (state.lines ||= []).push(`${unit.id}:${name}`); } };
  window.BattleDamageLifecycle = { delayUntilHitSettled(state, fn) { fn(); return true; } };
  window.BattleSystem = {
    pushFloat() {},
    useVirtualKill(state, a, t, card) { (state.virtualKills ||= []).push({ from: a.id, to: t.id }); },
  };
  window.RelicSystem = { hasEquipped: (s, u, r) => (u.relics || []).includes(r) };
  load("./src/original/game-random.js");
  ["economy-config.js", "data-cards.js", "data-ruins-content.js", "card-utils.js", "battle-card-cleanup.js"].forEach(f =>
    load(`./src/original/${f}`));
  load("./src/original/ruins-witherer-skills.js");
  load("./src/original/witherer-relic-skills.js");
  load("./src/original/bakar-relic-skills.js");
  load("./src/original/ruins-relic-effects.js");
  load("./src/original/battle-relic-turns.js");
  load("./src/original/battle-card-active-relics-core.js");
  load("./src/original/battle-card-active-relics-assassin.js");
  load("./src/original/battle-card-active-relics-demon.js");
}

function makeState() {
  const witherer = {
    id: "witherer_1312", name: "1312号", ai: "ruins_witherer",
    side: "enemy", hp: 300, stats: { attack: 12 }, hand: [], relics: [],
  };
  const a1 = {
    id: "a1", name: "罗卡尔", uid: "u1", side: "ally", hp: 200,
    stats: { attack: 10 }, hand: [], relics: [],
  };
  const a2 = {
    id: "a2", name: "贝丝妲", uid: "u2", side: "ally", hp: 200,
    stats: { attack: 10 }, hand: [], relics: [],
  };
  return { battle: { allies: [a1, a2], enemies: [witherer] }, log: [], lines: [], witherer, a1, a2 };
}

function fresh(state) {
  const s = { ...state, log: [], lines: [], virtualKills: [] };
  s.battle = { ...state.battle };
  return s;
}

// 把一张牌喂给外神之眼：a1 打 witherer
function fire(state, card, amount = 5) {
  const s = fresh(state);
  window.RuinsWithererSkills.afterDamage(s, state.a1, state.witherer, card, amount, {});
  return {
    triggered: (s.lines || []).some(l => l.includes("外神之眼")),
    log: s.log || [],
  };
}

// 捕获饰品真实造出的卡牌对象
function captureRelicCard(state, caller) {
  let captured = null;
  const s = fresh(state);
  const useCard = (st, actor, target, card) => { captured = card; };
  caller(s, useCard);
  return captured;
}

function run() {
  setup();
  const results = [];
  const check = (name, shouldTrigger, card, state) => {
    if (!card) { results.push({ name, ok: false, note: "未捕获到卡牌（触发失败）" }); return; }
    const r = fire(state, card);
    const ok = r.triggered === shouldTrigger;
    results.push({
      name, ok, triggered: r.triggered,
      expect: shouldTrigger ? "应触发" : "应不触发",
      virtual: !!card.virtual, skill: !!card._skill,
      gen: card.generatedBySkill || null, type: card.type,
    });
  };

  // ===== 1. 妖刀村雨（饰品）战斗开始自动斩：fromEntity 杀（普攻）=====
  {
    const st = makeState();
    st.a1.relics = ["妖刀村雨"];
    const card = captureRelicCard(st, (s, useCard) => {
      window.BattleRelicTurns.prepare(s, st.a1, useCard, (ss, m) => window.BattleLog.add(ss, m));
    });
    check("饰品·妖刀村雨（fromEntity 虚拟杀）", false, card, st);
  }

  // ===== 2. 1124号长舌头（饰品）：cloneEntity 勒杀 virtual:true =====
  {
    const st = makeState();
    st.a1.relics = ["1124号长舌头"];
    st.a1.intent = 0;
    const card = captureRelicCard(st, (s, useCard) => {
      window.WithererRelicSkills.useTongueActive(s, st.a1, st.witherer, null, useCard);
    });
    check("饰品·1124号长舌头（虚拟勒杀）", false, card, st);
  }

  // ===== 3. 军令状（饰品）：cloneEntity 魔王军入侵 virtual:true =====
  {
    const st = makeState();
    st.a1.relics = ["军令状"];
    // 军令状需弃两张同花色手牌，且第3参是「军令状」主动牌（携带 _bagIndexes）
    st.a1.hand = [
      { name: "杀（普攻）", type: "slash", suit: "♠" },
      { name: "闪", type: "response", suit: "♠" },
    ];
    const armyCard = { name: "军令状", type: "tactic", _bagIndexes: [0, 1] };
    const card = captureRelicCard(st, (s, useCard) => {
      window.BakarRelicSkills.useArmyOrder(s, st.a1, armyCard, useCard);
    });
    check("饰品·军令状（虚拟魔王军入侵）", false, card, st);
  }

  // ===== 4. 螺旋桨（饰品）：copyPlayable + generatedBySkill =====
  {
    const st = makeState();
    st.a1.relics = ["螺旋桨"];
    let captured = null;
    const s = fresh(st);
    s.battle.phase = 4; // 螺旋桨仅在摸牌阶段(phase 4)触发
    window.RuinsRelicEffects.afterDraw(s, st.a1, [{ name: "杀（普攻）", type: "slash" }], () => [], {
      getCombat: () => ({
        useVirtualKill: (ss, a, t, card) => { captured = card; },
      }),
    });
    check("饰品·螺旋桨（虚拟杀 generatedBySkill）", false, captured, st);
  }

  // ===== 5. 魅魔钢叉（饰品）：convertAs 魅杀 + _skill =====
  {
    const st = makeState();
    st.a1.relics = ["魅魔钢叉"];
    st.a1.hand = [{ name: "杀（普攻）", type: "slash", suit: "♥" }];
    const ctx = {
      selectedHand: () => ({ i: 0, card: st.a1.hand[0], ok: true }),
      moveHand: () => {},
      putMany: () => {},
      useCard: () => {},
    };
    const card = captureRelicCard(st, (s, useCard) => {
      const c2 = { ...ctx, useCard };
      const core2 = window.BattleCardActiveRelicsCore({}, c2);
      const m2 = window.BattleCardActiveRelicsAssassin({}, c2, core2);
      m2.succubusFork(s, st.a1, st.witherer, {});
    });
    check("饰品·魅魔钢叉（convertAs 魅杀·实体转换）", true, card, st);
  }

  // ===== 6. 刺客胶衣（饰品）：convertAs 刺杀 + _skill =====
  {
    const st = makeState();
    st.a1.relics = ["刺客胶衣"];
    st.a1.hand = [{ name: "杀（普攻）", type: "slash", suit: "♠" }];
    const card = captureRelicCard(st, (s, useCard) => {
      const c2 = {
        selectedHand: () => ({ i: 0, card: st.a1.hand[0], ok: true }),
        moveHand: () => {}, putMany: () => {}, useCard,
      };
      const core2 = window.BattleCardActiveRelicsCore({}, c2);
      const m2 = window.BattleCardActiveRelicsAssassin({}, c2, core2);
      m2.assassinLatex(s, st.a1, st.witherer, {});
    });
    check("饰品·刺客胶衣（convertAs 刺杀·待完善）", false, card, st);
  }

  // ===== 7. 鬼王扑克（饰品）：convertAs + _skill =====
  {
    const st = makeState();
    st.a1.relics = ["鬼王扑克"];
    st.a1.hand = [{ name: "杀（普攻）", type: "slash", suit: "♠" }];
    const card = captureRelicCard(st, (s, useCard) => {
      const c2 = {
        selectedHand: () => ({ i: 0, card: st.a1.hand[0], ok: true }),
        moveHand: () => {}, putMany: () => {}, useCard,
      };
      const core2 = window.BattleCardActiveRelicsCore({}, c2);
      const m2 = window.BattleCardActiveRelicsDemon({}, c2, core2);
      m2.demonPoker(s, st.a1, st.witherer, {});
    });
    check("饰品·鬼王扑克（convertAs 战术牌·实体转换）", true, card, st);
  }

  // ===== 8. 弹反（饰品技能伤害 type:"skill"）=====
  {
    const st = makeState();
    let captured = null;
    const s = fresh(st);
    // 弹反走猜拳：只有猜赢才真正反弹伤害。此处固定猜拳结果（石头 vs 剪刀），
    // 否则约 1/3 概率猜输 → 不产生伤害 → 捕获不到卡牌 → 用例随机失败。
    const origSample = window.GameRandom.sample;
    let n = 0;
    window.GameRandom.sample = arr => (n += 1) === 1 ? "石头" : "剪刀";
    try {
      window.WithererRelicSkills.deflect(
        s, st.witherer, st.a1, 5, null, {},
        (ss, src, tgt, amt, srcName, card) => { captured = card; },
        null, {});
    } finally {
      window.GameRandom.sample = origSample;
    }
    check("饰品·弹反（技能伤害 type:skill）", false, captured, st);
  }

  // ===== 正向对照：实体牌应触发 =====
  {
    const st = makeState();
    check("对照·实体杀（应触发）", true, { name: "杀（普攻）", type: "slash", suit: "♠" }, st);
    check("对照·实体战术牌（应触发）", true, { name: "火球", type: "tactic", suit: "♥" }, st);
  }

  const pass = results.filter(r => r.ok).length;
  console.log("\n=== 饰品虚拟牌审计 ===");
  results.forEach((r, i) => {
    const tag = r.ok ? "✅" : "❌";
    console.log(`${tag} ${i + 1}. ${r.name} ${r.expect} | 实际=${r.triggered ? "触发" : "不触发"}` +
      (r.virtual !== undefined && r.card !== null ? ` | virtual=${r.virtual} _skill=${r.skill} gen=${r.gen} type=${r.type}` : ""));
  });
  console.log(`\n通过 ${pass}/${results.length}`);
  if (pass !== results.length) process.exit(1);
}

run();
