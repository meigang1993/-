window.LocalCoreBountyOps = (() => {
  const { outcomes, addResource, assertInventoryCapacity } = window.LocalCoreUtils;

  function claimBounty(core, args) {
    if ((args.items || []).some(item => item.reward?.type === "relic"
      && !window.RelicSystem?.isFormalId?.(item.reward.relic))) {
      return outcomes.rejected;
    }
    let ledger = window.BountyLedger.normalize(core.bountyLedger);
    const returned = new Set(), granted = [];
    let changed = false;
    assertInventoryCapacity(core, inventoryAdditions(ledger, args.items || []));
    (args.items || []).forEach(item => {
      const claimId = String(item.claimId || "");
      if (!claimId || returned.has(claimId)) return;
      returned.add(claimId);
      const result = window.BountyLedger.claim(ledger, claimId);
      ledger = result.ledger;
      if (result.status === "duplicate") {
        granted.push(item);
        return;
      }
      if (result.status !== "granted") return;
      changed = true;
      const reward = item.reward || {};
      if (reward.type === "essence") {
        core.resources.essence = addResource(
          core.resources.essence, reward.essence);
      }
      if (item.bonusGold) {
        core.resources.gold = addResource(core.resources.gold, item.bonusGold);
      }
      if (reward.type === "card" && reward.card) {
        (core.deckAdditions ||= []).push(reward.card);
      }
      if (reward.type === "relic" && reward.relic) {
        (core.relicAdditions ||= []).push(reward.relic);
      }
      granted.push(item);
    });
    core.bountyLedger = ledger;
    core.lastBountyRewards = granted;
    if (changed) return outcomes.changed;
    return granted.length ? outcomes.reconciled : outcomes.rejected;
  }

  function inventoryAdditions(ledgerInput, items) {
    let ledger = window.BountyLedger.normalize(ledgerInput);
    const returned = new Set(), additions = { cards: 0, relics: 0 };
    items.forEach(item => {
      const claimId = String(item.claimId || "");
      if (!claimId || returned.has(claimId)) return;
      returned.add(claimId);
      const result = window.BountyLedger.claim(ledger, claimId);
      ledger = result.ledger;
      if (result.status !== "granted") return;
      if (item.reward?.type === "card" && item.reward.card) additions.cards += 1;
      if (item.reward?.type === "relic" && item.reward.relic) additions.relics += 1;
    });
    return additions;
  }

  return { claimBounty };
})();
