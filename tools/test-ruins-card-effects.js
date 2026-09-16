const fs = require("fs");
const vm = require("vm");
const {
  assert, card, unitFromCharacter, installGlobals, loadRuntime,
} = require("./skill-coverage-fixtures");

installGlobals();
loadRuntime();
[
  "battle-status-card-registry.js",
  "battle-status-card-storage.js",
  "battle-status-card-triggers.js",
  "battle-status-cards.js",
  "data-ruins-content.js",
  "ruins-card-skills.js",
].forEach(file => vm.runInThisContext(
  fs.readFileSync(`./src/original/${file}`, "utf8"),
  { filename: file },
));

const cards = window.GameDataRuinsContent.cards;
const find = name => cards.find(item => item.name === name);
const slash = (name = "杀") => card(name, "slash", { suit: "♠" });

// ---------- 1. 拼杀：杀牌数多于目标时不可响应 ----------
{
  const actor = unitFromCharacter(GameData.characters[0], "a0");
  const target = unitFromCharacter(GameData.characters[1], "e0");
  actor.hand = [slash(), slash(), slash()];
  target.hand = [slash()];
  const clash = { ...find("拼杀"), _clashChecked: false };
  window.RuinsCardSkills.beforeResponseCheck({ log: [] }, actor, target, clash);
  assert(clash.ignoreResponse === true, "拼杀：我方杀牌数更多时不可响应");

  const actor2 = unitFromCharacter(GameData.characters[0], "a0");
  const target2 = unitFromCharacter(GameData.characters[1], "e0");
  actor2.hand = [slash()];
  target2.hand = [slash(), slash()];
  const clash2 = { ...find("拼杀"), _clashChecked: false };
  window.RuinsCardSkills.beforeResponseCheck({ log: [] }, actor2, target2, clash2);
  assert(!clash2.ignoreResponse, "拼杀：杀牌数不多于目标时可被响应");
}

// ---------- 2. 魔之连杀：按杀牌数量额外随机指定目标 ----------
{
  const actor = unitFromCharacter(GameData.characters[0], "a0");
  actor.side = "ally";
  const enemies = [0, 1, 2, 3].map(index => {
    const unit = unitFromCharacter(GameData.characters[1], `e${index}`);
    unit.side = "enemy";
    unit.hp = 50;
    return unit;
  });
  const state = { battle: { allies: [actor], enemies, animQueue: [] }, log: [] };
  actor.hand = [slash(), slash(), slash()];
  const hit = [];
  const damage = (_s, target, amount, label) => {
    hit.push(`${target.uid}:${amount}`);
    return { hpLoss: amount };
  };
  const chain = { ...find("魔之连杀"), _chainExtra: false };
  window.RuinsCardSkills.chainExtraTargets(state, actor, enemies[0], chain, damage);
  assert(hit.length === 3, `魔之连杀：3张杀应额外指定3个目标，实际${hit.length}`);
  assert(!hit.some(item => item.startsWith(`${enemies[0].uid}:`)),
    "魔之连杀：额外目标不应包含主目标");
  assert(chain._chainDone === true, "魔之连杀：额外结算只触发一次");
  const before = hit.length;
  window.RuinsCardSkills.chainExtraTargets(state, actor, enemies[0], chain, damage);
  assert(hit.length === before, "魔之连杀：重复调用不重复结算");
}

// ---------- 3. 魅杀：脆弱标记 + 伤害+50% ----------
{
  const actor = unitFromCharacter(GameData.characters[0], "a0");
  const target = unitFromCharacter(GameData.characters[1], "e0");
  target.hp = 50;
  const state = { log: [] };
  assert(!target.vulnerable, "魅杀：目标初始无脆弱标记");
  window.RuinsCardSkills.applyVulnerable(state, actor, target, find("魅杀"));
  assert(target.vulnerable === true, "魅杀：造成伤害后施加脆弱标记");
  const boosted = window.RuinsCardSkills.modifyIncomingDamage(state, target, 20, find("魅杀"));
  assert(boosted === 30, `魅杀：脆弱标记应使20点伤害变为30点，实际${boosted}`);
  const plain = window.RuinsCardSkills.modifyIncomingDamage(state, { vulnerable: false }, 20, find("魅杀"));
  assert(plain === 20, "魅杀：无标记不加成");
  window.RuinsCardSkills.clearVulnerable(state, target);
  assert(!target.vulnerable, "魅杀：回合结束清除脆弱标记");
}

// ---------- 4. 偷袭：响应牌，敌方战术牌后可打出 ----------
{
  const ambush = find("偷袭");
  assert(ambush.type === "response" && ambush.ambush === true,
    "偷袭：必须是带 ambush 的响应牌");
  assert(ambush.price === 1100, "偷袭：售价1100");
}

// ---------- 5. 物资私分：双方各摸3张 ----------
{
  const supply = find("物资私分");
  assert(supply.drawCards === 3 && supply.allyDrawCards === 3,
    "物资私分：需要同时声明 drawCards 与 allyDrawCards");
  assert(supply.allyTarget === true, "物资私分：目标为友方");
}

// ---------- 6. 枪林弹雨：基础1点 + 攻击 + 魔力 ----------
{
  const rain = find("枪林弹雨");
  assert(rain.power === 1, "枪林弹雨：基础伤害1点");
  assert(rain.hybridAttack === true, "枪林弹雨：复合伤害");
  assert(rain.sweep === true && rain.targetless === true, "枪林弹雨：全体目标");
}

// ---------- 7. 魅惑术/混乱：无同伴时自伤并跳过出牌 ----------
{
  const unit = unitFromCharacter(GameData.characters[0], "a0");
  unit.side = "ally";
  unit.hp = 40;
  unit.stats.attack = 6;
  unit.tempAttack = 0;
  // 判定取 unit.deck.pop()，堆顶放黑桃必定命中混乱（♠或♥）
  unit.deck = [card("判定牌", "tactic", { suit: "\u2660" })];
  const state = { battle: { allies: [unit], enemies: [], animQueue: [] }, log: [] };
  unit.hand = [window.BattleStatusCardRegistry.create("confusion")];
  window.BattleStatusCardTriggers.judgement(state, unit);
  assert(unit.skipPlayPhase === true, "混乱：无同伴时必须跳过出牌阶段");
  assert(unit.hp === 34, `混乱：无同伴时必须自伤攻击力6点（40-6=34），实际${unit.hp}`);
}
{
  // 有同伴时：随机对同伴使用虚拟杀，不自伤
  const a = unitFromCharacter(GameData.characters[0], "a0");
  const b = unitFromCharacter(GameData.characters[1], "a1");
  a.side = "ally"; b.side = "ally";
  a.hp = 40; b.hp = 40;
  a.stats.attack = 6; a.tempAttack = 0;
  a.deck = [card("判定牌", "tactic", { suit: "\u2660" })];
  let virtualUsed = 0;
  // 必须保存并还原真实对象：直接 delete 会破坏后续 determinism 组（battle 组先跑）
  const realBattleCombat = window.BattleCombat;
  window.BattleCombat = { useVirtualKill: () => { virtualUsed += 1; } };
  const state = { battle: { allies: [a, b], enemies: [], animQueue: [] }, log: [] };
  a.hand = [window.BattleStatusCardRegistry.create("confusion")];
  window.BattleStatusCardTriggers.judgement(state, a);
  assert(virtualUsed === 1, `混乱：有同伴时应使用1张虚拟杀，实际${virtualUsed}`);
  assert(a.skipPlayPhase !== true, "混乱：有同伴时不跳过出牌阶段");
  assert(a.hp === 40, "混乱：有同伴时不自伤");
  if (realBattleCombat === undefined) delete window.BattleCombat;
  else window.BattleCombat = realBattleCombat;
}

// ---------- 8. 冰冻术：判定♦或♣禁止使用杀 ----------
{
  const freeze = find("冰冻术");
  assert(freeze.statusKey === "freeze", "冰冻术：生成冰冻状态牌");
  const text = window.BattleStatusCardRegistry.create("freeze").text || "";
  assert(/\u2666|方块/.test(text) && /\u2663|梅花/.test(text), "冰冻术：判定花色为方块或梅花");
  assert(/无法使用【杀】/.test(text), "冰冻术：触发后本回合无法使用杀牌");
  assert(window.BattleStatusCardRegistry.keyOf({ freeze: true }) === "freeze",
    "冰冻术：状态牌可识别");

  // 命中：堆顶放方块
  const hit = unitFromCharacter(GameData.characters[0], "f0");
  hit.deck = [card("判定牌", "tactic", { suit: "\u2666" })];
  hit.hand = [window.BattleStatusCardRegistry.create("freeze")];
  window.BattleStatusCardTriggers.judgement(
    { battle: { allies: [hit], enemies: [], animQueue: [] }, log: [] }, hit);
  assert(hit.frozenSlash === true, "冰冻术：判定♦应禁止本回合使用杀牌");

  // 未命中：堆顶放红桃
  const miss = unitFromCharacter(GameData.characters[0], "f1");
  miss.deck = [card("判定牌", "tactic", { suit: "\u2665" })];
  miss.hand = [window.BattleStatusCardRegistry.create("freeze")];
  window.BattleStatusCardTriggers.judgement(
    { battle: { allies: [miss], enemies: [], animQueue: [] }, log: [] }, miss);
  assert(miss.frozenSlash !== true, "冰冻术：判定非♦♣时不触发");
}

// ---------- 9. 流星杀 / 吸魔杀 ----------
{
  const meteor = find("流星杀");
  assert(meteor.sweep && meteor.scale === "magic", "流星杀：全体魔力伤害");
  const drain = find("吸魔杀");
  assert(drain.stealCard === true && drain.scale === "magic", "吸魔杀：魔法伤害并偷牌");
  // 回归：杀牌带 stealCard 不能被战术牌的"只偷牌"分支吃掉，必须继续造成伤害
  const fs2 = require("fs");
  const vm2 = require("vm");
  vm2.runInThisContext(
    fs2.readFileSync("./src/original/battle-combat-card-effects.js", "utf8"),
    { filename: "battle-combat-card-effects.js" },
  );
  const calls = { damage: 0, steal: 0 };
  const api = {
    deps: {
      isKillCard: c => !!c && (c.type === "slash" || /杀(?:（[^）]*）)?$/.test(c.name || "")),
      draw: () => 3, intentMax: () => 5,
    },
    specials: { stealCard: () => { calls.steal += 1; return true; }, repeatTactic: () => {} },
    useCard: () => {}, damage: () => { calls.damage += 1; return { hpLoss: 1 }; },
    statOf: (u, k) => u.stats?.[k] || 0, pushFloat: () => {},
    checkDefeat: () => false, checkEnd: () => false, repeatIfDone: () => {},
    isSingleSlash: () => true,
  };
  const effects = window.BattleCombatCardEffects(api);
  const st = { battle: { locked: false, animQueue: [], allies: [], enemies: [] }, log: [] };
  const a = unitFromCharacter(GameData.characters[0], "a9");
  const t = unitFromCharacter(GameData.characters[1], "e9");
  t.hand = [slash("闪")];
  const claimed = effects.resolve(st, a, t, { ...drain });
  assert(claimed !== true,
    "吸魔杀：杀牌不能被 stealCard 分支独占，必须继续走伤害流程");
  assert(calls.steal === 0,
    `吸魔杀：偷牌应延后到受击结算后，此处不应偷牌（实际${calls.steal}）`);
}

// ---------- 10. 十张卡全部登记到图鉴 ----------
{
  const names = cards.map(item => item.name);
  assert(names.length === 10, `废墟卡牌应为10张，实际${names.length}`);
  const codex = window.GameDataCards.cardCodex.map(item => item.name);
  names.forEach(name => assert(codex.includes(name), `${name} 必须进入卡牌图鉴`));
}

// ---------- 11. 掉落绑定：按敌人ID分组，不能挂副本ID ----------
{
  const unlocks = window.GameDataCards.eliteUnlocks || {};
  const expected = {
    mech_ai_dragon: ["拼杀", "魔之连杀"],
    witherer_1312: ["魅惑术", "魅杀"],
    hilde: ["偷袭", "冰冻术"],
    attack_helicopter: ["流星杀", "吸魔杀"],
    armored_carrier: ["物资私分", "枪林弹雨"],
  };
  // 回归：解锁遍历的是 battle.defeatedEnemyIds（敌人ID），挂副本ID永不命中
  assert(!unlocks.ruins_sand_city,
    "掉落绑定不能挂副本ID ruins_sand_city，defeatedEnemyIds 里只有敌人ID");
  Object.entries(expected).forEach(([enemyId, list]) => {
    const actual = unlocks[enemyId] || [];
    list.forEach(name => assert(actual.includes(name),
      `${name} 应由 ${enemyId} 掉落，实际列表[${actual}]`));
    assert(actual.length === list.length,
      `${enemyId} 应掉落${list.length}张，实际${actual.length}张`);
  });
  // 敌人ID必须真实存在
  const enemyIds = Object.values(GameData.enemies).flat().map(item => item.id);
  Object.keys(expected).forEach(id => assert(enemyIds.includes(id),
    `掉落绑定的敌人ID ${id} 不存在`));
}


// ---------- 12. 偷袭：运行时进入响应候选且伤害含临时加成 ----------
{
  const ambush = find("偷袭");
  const holder = unitFromCharacter(GameData.characters[0], "a0");
  holder.side = "ally";
  holder.hp = 30;
  holder.stats.attack = 7;
  holder.tempAttack = 3;
  holder.hand = [{ ...ambush }];
  const cands = holder.hand.filter(c => (c.counterTactic || c.ambush) && !c._pendingDraw);
  assert(cands.length === 1, "偷袭：必须进入响应牌候选（ambush）");
  const amount = (holder.stats?.attack || 0) + (holder.tempAttack || 0);
  assert(amount === 10, `偷袭：伤害应为攻击7+临时3=10，实际${amount}`);
}

// ---------- 13. 物资私分：运行时双方各摸3张 ----------
{
  const fs3 = require("fs");
  const vm3 = require("vm");
  vm3.runInThisContext(
    fs3.readFileSync("./src/original/battle-combat-card-effects.js", "utf8"),
    { filename: "battle-combat-card-effects.js" },
  );
  const supply = find("物资私分");
  const a = unitFromCharacter(GameData.characters[0], "a0");
  const b = unitFromCharacter(GameData.characters[1], "a1");
  a.side = "ally"; b.side = "ally"; a.hp = 30; b.hp = 30;
  const drawn = [];
  const api = {
    deps: {
      draw: (u, n) => { drawn.push(`${u.uid}:${n}`); return n; },
      isKillCard: c => !!c && (c.type === "slash" || /杀(?:（[^）]*）)?$/.test(c.name || "")),
      intentMax: () => 5,
    },
    specials: { repeatTactic: () => {} }, useCard: () => {},
    damage: () => ({ hpLoss: 1 }), statOf: (u, k) => u.stats?.[k] || 0,
    pushFloat: () => {}, checkDefeat: () => false, checkEnd: () => false,
    repeatIfDone: () => {},
  };
  window.BattleCombatCardEffects(api).resolve(
    { battle: { locked: false, animQueue: [], allies: [a, b], enemies: [] }, log: [] },
    a, b, { ...supply });
  assert(drawn.includes("a0:3"), `物资私分：使用者应摸3张，实际${drawn}`);
  assert(drawn.includes("a1:3"), `物资私分：指定友方也应摸3张，实际${drawn}`);
}

// ---------- 14. 拼杀：正在结算的这张杀也要计入「你的杀牌数」 ----------
{
  const actor = unitFromCharacter(GameData.characters[0], "a0");
  const target = unitFromCharacter(GameData.characters[1], "e0");
  // 手里只剩这张拼杀（出牌后已离手），目标一张杀都没有 → 1 > 0 必须不可响应
  actor.hand = [];
  target.hand = [];
  const clash = { ...find("拼杀"), _clashChecked: false, _playedFromHand: true };
  window.RuinsCardSkills.beforeResponseCheck({ log: [] }, actor, target, clash);
  assert(clash.ignoreResponse === true,
    "拼杀：仅持本牌时点数应为1，多于目标的0，必须不可响应");

  // 牌还在手里（未出牌）时不能重复计数：1 > 1 应可响应
  const held = { ...find("拼杀"), _clashChecked: false };
  const actor2 = unitFromCharacter(GameData.characters[0], "a1");
  const target2 = unitFromCharacter(GameData.characters[1], "e1");
  actor2.hand = [held];
  target2.hand = [slash()];
  window.RuinsCardSkills.beforeResponseCheck({ log: [] }, actor2, target2, held);
  assert(!held.ignoreResponse, "拼杀：点数相同时不应触发不可响应");
}

// ---------- 15. 魔之连杀：本牌同样计入「你的杀牌数」 ----------
{
  const actor = unitFromCharacter(GameData.characters[0], "a0");
  actor.side = "ally";
  const enemies = [0, 1].map(index => {
    const unit = unitFromCharacter(GameData.characters[1], `e${index}`);
    unit.side = "enemy";
    unit.hp = 50;
    return unit;
  });
  const state = { battle: { allies: [actor], enemies, animQueue: [] }, log: [] };
  actor.hand = [];
  const hit = [];
  const damage = (_s, t, amount) => { hit.push(t.uid); return { hpLoss: amount }; };
  const chain = { ...find("魔之连杀"), _playedFromHand: true };
  window.RuinsCardSkills.chainExtraTargets(state, actor, enemies[0], chain, damage);
  assert(hit.length === 1,
    `魔之连杀：只剩本牌时也应额外指定1个目标，实际${hit.length}`);
}

// ---------- 16. 魅杀/吸魔杀：必须等受击动画演完再发放 ----------
{
  const deferred = [];
  const real = window.BattleDamageLifecycle;
  window.BattleDamageLifecycle = {
    delayUntilHitSettled(_state, fn) { deferred.push(fn); return true; },
  };
  try {
    const actor = unitFromCharacter(GameData.characters[0], "a0");
    const target = unitFromCharacter(GameData.characters[1], "e0");
    target.hp = 50;
    const state = { log: [] };
    window.RuinsCardSkills.applyVulnerable(state, actor, target, find("魅杀"));
    assert(!target.vulnerable,
      "魅杀：受击动画未结束时不应提前挂上脆弱标记");
    assert(deferred.length === 1, "魅杀：标记必须挂到受击浮字事件上");
    deferred.shift()();
    assert(target.vulnerable === true, "魅杀：受击动画结束后才施加脆弱标记");

    let stolen = 0;
    const stealCard = find("吸魔杀");
    window.BattleCardStealApi = () => { stolen += 1; };
    window.RuinsCardSkills.stealAfterHit(state, actor, target, stealCard);
    assert(stolen === 0, "吸魔杀：受击动画未结束时不应提前偷牌");
    deferred.shift()();
    assert(stolen === 1, `吸魔杀：受击动画结束后偷1张牌，实际${stolen}`);
    // 重复进入不得二次偷牌
    window.RuinsCardSkills.stealAfterHit(state, actor, target, stealCard);
    deferred.shift()?.();
    assert(stolen === 1, `吸魔杀：同一张牌只能偷一次，实际${stolen}`);
  } finally {
    if (real === undefined) delete window.BattleDamageLifecycle;
    else window.BattleDamageLifecycle = real;
    delete window.BattleCardStealApi;
  }
  // 无动画队列时直接发放，不能因为挂不上就整个不生效
  {
    const actor = unitFromCharacter(GameData.characters[0], "a0");
    const target = unitFromCharacter(GameData.characters[1], "e0");
    target.hp = 50;
    window.RuinsCardSkills.applyVulnerable({ log: [] }, actor, target, find("魅杀"));
    assert(target.vulnerable === true, "魅杀：无动画队列时应立即施加标记");
  }
}

// ---------- 17. 物资私分：不能指定自己 ----------
{
  const supply = find("物资私分");
  assert(supply.excludeSelf === true, "物资私分：必须声明 excludeSelf");
  const fs4 = require("fs");
  const vm4 = require("vm");
  ["ui-common.js", "ui-battle-targeting.js"].forEach(file => vm4.runInThisContext(
    fs4.readFileSync(`./src/original/${file}`, "utf8"), { filename: file }));
  const allies = [0, 1].map(index => {
    const unit = unitFromCharacter(GameData.characters[index], `a${index}`);
    unit.side = "ally";
    return unit;
  });
  // selectedCardIndex 为 null 时 targetAllowed 一律短路，需先模拟已选中手牌
  const battle = { allies, enemies: [], activeUid: allies[0].uid, phase: 4, selectedCardIndex: 0 };
  assert(window.GameUIBattleTargeting.targetAllowed(allies[0], battle, allies[0], supply)
    === false, "物资私分：不能把自己选为目标");
  assert(window.GameUIBattleTargeting.targetAllowed(allies[1], battle, allies[0], supply)
    === true, "物资私分：其他友方必须可选");
  // 未声明 excludeSelf 的友方牌不受影响（不能误伤既有 allyTarget 卡牌）
  const plainAlly = { ...supply, excludeSelf: false };
  assert(window.GameUIBattleTargeting.targetAllowed(allies[0], battle, allies[0], plainAlly)
    === true, "物资私分：excludeSelf 只影响声明了该字段的牌");
  // 目标解析层同样要挡住自己
  const targetSrc = fs4.readFileSync("./src/original/battle-combat-targeting.js", "utf8");
  assert(/allyTarget[\s\S]{0,240}excludeSelf/.test(targetSrc),
    "物资私分：出牌目标解析也应排除自己");
}

console.log("Ruins card effects tests passed");
