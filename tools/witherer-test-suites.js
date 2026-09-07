function runSplitAndRelicTests(assert) {
  const splitActor = {
    id: "witherer_1124_split", ai: "witherer_1124", uid: "e2", side: "enemy",
    name: "凋零者1124号分裂体", hp: 142, maxHp: 142, intent: 1,
    stats: { attack: 10, magic: 8, bloodlust: 1, handLimit: 4 }, statuses: [],
    skills: [{ name: "杀欲窥视", type: "active" }, { name: "鲜血之忆", type: "passive" }], hand: [],
  };
  const splitTarget = { uid: "a0", side: "ally", name: "测试目标", hp: 20, maxHp: 20, stats: {}, hand: [{ name: "杀（普攻）", type: "slash", suit: "♥" }] };
  const splitState = { log: [], lines: [], battle: { allies: [splitTarget], enemies: [splitActor], animQueue: [] } };
  window.state = splitState;
  let splitMove = window.BattleAI.choose(splitState.battle, splitActor, () => true);
  assert(splitMove?.card?.withererPeek && splitMove.target === splitTarget, "split AI should use 杀欲窥视");
  assert(window.WithererSkills.usePeek(splitState, splitActor, splitTarget), "split should execute 杀欲窥视");
  assert(splitActor.hand.some(c => c.withererPeekSlash && c.name === "杀（普攻）"), "split should gain a free copied slash");
  assert(splitActor.hand.every(c => c.generatedBySkill === "杀欲窥视"), "peek copies should retain their generated skill source");
  assert(!window.WithererSkills.canShift(splitActor) && !splitActor.withererMode, "split must not use 暴走与极速");

  splitActor.usedWithererPeek = true;
  splitActor.intent = 0;
  splitActor.hand = [
    window.CardUtils.cloneEntity("战争号角", { suit: "♠" }),
    window.CardUtils.cloneEntity("勒杀", { suit: "♥" }),
  ];
  splitMove = window.BattleAI.choose(splitState.battle, splitActor, (_unit, card) => card.type !== "slash");
  assert(splitMove?.card?.warHorn, "split AI should use 战争号角 at zero intent even while holding a slash");
  assert(window.RelicSystem.enemyRelics("witherer_1124_split").sort().join("|") === ["凋零者胸部", "凋零者长舌头"].sort().join("|"), "heroic split should carry both split relics");

  const chestWearer = { uid: "split-a", side: "enemy", name: "分裂体A", hp: 100, maxHp: 100, stats: { magic: 8, handLimit: 4 }, battleRelics: ["凋零者胸部"], hand: [] };
  const chestMate = { uid: "split-b", side: "enemy", name: "分裂体B", hp: 50, maxHp: 100, stats: { magic: 8, handLimit: 4 }, hand: [] };
  const chestAttacker = { uid: "hero", side: "ally", name: "测试攻击者", stats: { handLimit: 4 }, hand: [] };
  const chestState = { log: [], battle: { allies: [chestAttacker], enemies: [chestWearer, chestMate] } };
  let healFloats = 0, afterHealCount = 0, arroganceRefreshCount = 0;
  window.ElranaAceNanaliSkills = { afterHeal() { afterHealCount += 1; } };
  window.BertisGerlotSkills = { refreshArrogance() { arroganceRefreshCount += 1; } };
  window.EnemySkills = { beforeHeal() { return null; }, clearHolyScar() {}, onHeal() {} };
  window.WithererSkills.afterDamage(chestState, chestAttacker, chestWearer, { type: "tactic" }, 5, null, null, (_battle, _uid, type, value) => { if (type === "heal") healFloats += value; });
  assert(chestMate.hp === 58 && healFloats === 8, "chest should heal another living ally by the wearer's magic");
  assert(afterHealCount === 1 && arroganceRefreshCount === 1, "chest recovery should run normal after-heal triggers");
  chestWearer.hp = 0;
  window.WithererSkills.afterDamage(chestState, chestAttacker, chestWearer, { type: "tactic" }, 100, null, null, () => {});
  assert(chestMate.hp === 58, "a defeated chest wearer must not heal an ally");
  chestWearer.hp = 100;
  let nestedChestChecks = 0;
  window.EnemySkills.beforeHeal = () => {
    nestedChestChecks += 1;
    window.WithererSkills.afterDamage(chestState, chestAttacker, chestWearer, { type: "slash" }, 1);
    return 0;
  };
  window.WithererSkills.afterDamage(chestState, chestAttacker, chestWearer, { type: "tactic" }, 5, () => {}, null, () => {});
  assert(chestMate.hp === 58, "chest healing must respect recovery prevention");
  assert(nestedChestChecks === 1, "recovery counter damage must not recursively retrigger chest healing");

  const tongueWearer = { uid: "tongue", side: "enemy", name: "长舌分裂体", stats: { handLimit: 4 }, battleRelics: ["凋零者长舌头"], hand: [] };
  const tongueTarget = { uid: "tongue-target", side: "ally", name: "长舌目标", hp: 20, stats: { handLimit: 2 }, hand: [] };
  const tongueState = { log: [], battle: { allies: [tongueTarget], enemies: [tongueWearer] } };
  window.WithererSkills.afterDamage(tongueState, tongueWearer, tongueTarget, { type: "tactic" }, 3);
  assert(tongueWearer.stats.handLimit === 4 && tongueTarget.stats.handLimit === 2, "non-kill damage must not trigger the tongue");
  window.WithererSkills.afterDamage(tongueState, tongueWearer, tongueTarget, { type: "slash" }, 3);
  assert(tongueWearer.stats.handLimit === 5 && tongueTarget.stats.handLimit === 1, "kill damage should transfer one hand limit");
  window.WithererSkills.afterDamage(tongueState, tongueWearer, tongueTarget, { type: "slash" }, 3);
  window.WithererSkills.afterDamage(tongueState, tongueWearer, tongueTarget, { type: "slash" }, 3);
  assert(tongueWearer.stats.handLimit === 6 && tongueTarget.stats.handLimit === 0, "tongue must stop when the target reaches zero hand limit");
}

function runResponseTests(assert) {
  const flash = { name: "闪", type: "response", suit: "♥" };
  const loki = { uid: "a1", ref: "loki", name: "洛基", hp: 20, hand: [flash] };
  const nonoka = { uid: "a2", ref: "nonoka", name: "野乃花", hp: 20, hand: [] };
  const attacker = { uid: "e1", side: "enemy", name: "攻击者" };
  const proxyState = { battle: { allies: [loki, nonoka], enemies: [attacker], animQueue: [] } };
  const protectedTarget = window.NonokaLokiSkills.protectNonoka(proxyState, attacker, nonoka, { name: "黑杀", type: "slash", ignoreResponse: true }, { nextAnim: () => 1 });
  assert(protectedTarget === loki, "unresponsive slash may redirect to Loki but cannot be dodged");
  assert(loki.hand.includes(flash), "Loki proxy flash must not be consumed by an unresponsive slash");
  const proxyDodge = window.NonokaLokiSkills.protectNonoka(
    proxyState, attacker, nonoka, { name: "普通杀", type: "slash" },
    { nextAnim: () => 2 });
  const proxyEvent = proxyState.battle.animQueue.at(-1);
  assert(proxyDodge === null && loki.hand.length === 0
    && proxyEvent?.visualHandBefore === 1
    && proxyEvent?.visualHandCount === 0,
  "Loki proxy dodge must animate its hand count from one to zero");

  const guardApi = window.GuestOpheliaGuard({
    alive: unit => unit?.hp > 0, visible: unit => unit?.hand || [],
    isSlash: card => card?.type === "slash", line() {},
  });
  const ophelia = { uid: "a3", ref: "ophelia", side: "ally", name: "奥菲莉亚", hp: 20, hand: [] };
  const guard = { uid: "a4", ref: "lokar", side: "ally", name: "罗卡尔", hp: 20, hand: [flash] };
  const guardState = { battle: { allies: [ophelia, guard], enemies: [attacker], animQueue: [], opheliaGuardUid: guard.uid } };
  let guardHit = null;
  const guarded = guardApi.guardOphelia(guardState, attacker, ophelia, 5, "黑杀", { name: "黑杀", type: "slash", ignoreResponse: true }, {
    canDodge: () => true, draw() {}, afterDodged() {},
    hitWithoutDodge(_, __, target) { guardHit = target; return { dodged: false, hpLoss: 5 }; },
  });
  assert(guarded?.hpLoss === 5 && guardHit === guard, "Ophelia guard must take unresponsive damage instead of using flash");
  assert(guard.hand.includes(flash), "Ophelia proxy flash must not be consumed by an unresponsive slash");
  guardState.battle.opheliaGuardUid = guard.uid;
  const guardedDodge = guardApi.guardOphelia(
    guardState, attacker, ophelia, 5, "普通杀",
    { name: "普通杀", type: "slash" }, {
      canDodge: () => true, draw() {}, afterDodged() {},
      hitWithoutDodge() { return { dodged: false, hpLoss: 5 }; },
    });
  const guardEvent = guardState.battle.animQueue.at(-1);
  assert(guardedDodge?.dodged && guard.hand.length === 0
    && guardEvent?.visualHandBefore === 1
    && guardEvent?.visualHandCount === 0,
  "Ophelia proxy dodge must animate its guard's hand count from one to zero");
}

module.exports = { runSplitAndRelicTests, runResponseTests };
