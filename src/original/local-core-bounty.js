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

  // 手动刷新任务列表：扣除固定莉莉丝元，只重摇「未接取」的任务。
  // 已接取的任务必须保留——玩家花了行动力接下的任务被刷新清空是不可接受的。
  function refreshBounty(core) {
    const cost = Number(window.GameEconomy?.bounty?.refreshCost) || 500;
    const gold = Number(core.resources?.gold) || 0;
    const max = window.BountyTasks?.maxCount?.(core) || 4;
    const current = Array.isArray(core.bounties) ? core.bounties : [];
    const kept = current.filter(task => task?.accepted);
    // 已接取任务已占满上限时无可刷新位置，或莉莉丝元不足：拒绝且不扣费。
    if (kept.length >= max || gold < cost) return outcomes.rejected;
    const next = [...kept];
    // 用「保留下来的任务」计算已占用目标，避免新任务与已接取任务撞目标。
    const used = window.BountyTasks.usedTargets({ ...core, bounties: next });
    while (next.length < max) {
      const task = window.BountyTasks.generate(core, used);
      if (!task) break;
      next.push(task);
    }
    // 一个都没重摇出来时不扣费，避免玩家白白损失莉莉丝元。
    if (next.length <= kept.length) return outcomes.rejected;
    core.bounties = next;
    core.resources.gold = gold - cost;
    core.lastBountyRefresh = { cost, replaced: next.length - kept.length };
    return outcomes.changed;
  }

  return { claimBounty, refreshBounty };
})();
