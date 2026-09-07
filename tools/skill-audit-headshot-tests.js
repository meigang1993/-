/* global BertisGerlotSkills */
module.exports = ({ assert, card, unit }) => {
  const gerlot = unit("gerlot-headshot", "ally", {
    ref: "gerlot",
    deck: [card("Headshot Judge", "tactic", { suit: "♥" })],
  });
  const firstTarget = unit("headshot-target-a", "enemy");
  const secondTarget = unit("headshot-target-b", "enemy");
  const state = {
    battle: {
      allies: [gerlot],
      enemies: [firstTarget, secondTarget],
      animQueue: [],
      locked: false,
    },
  };
  const root = card("Virtual Group Slash", "slash", {
    suit: "♦", virtual: true, sweep: true, targetless: true,
  });
  const firstHit = { ...root, _entitySourceCard: root };
  const secondHit = { ...root, _entitySourceCard: root };

  assert(BertisGerlotSkills.queueHeadshot(
    state, gerlot, firstTarget, 5, root.name, firstHit),
  "Headshot must judge for virtual and group Slashes");
  assert(root.headshotMultiplier === 2
    && BertisGerlotSkills.modifyIncomingDamage(state, gerlot, 5, firstHit) === 10,
  "a Slash matching the judgement color must deal exactly double damage");

  state.battle.animQueue[0].commit();
  assert(!BertisGerlotSkills.queueHeadshot(
    state, gerlot, secondTarget, 5, root.name, secondHit),
  "one group Slash must reuse its single Headshot judgement across targets");
  assert(BertisGerlotSkills.modifyIncomingDamage(state, gerlot, 5, secondHit) === 10,
    "all damage from the judged Slash must reuse the same multiplier");
};
