window.GameUIBattleScene = (U, I) => {
  let battlePickers;
  let battleUnits;
  const trail = window.GameUIBattleTrail(U);
  const overlays = window.GameUIBattleOverlays(U);

  function battleModules() {
    battlePickers ||= window.GameUIBattlePickers?.(U);
    battleUnits ||= window.GameUIBattleUnits?.(U, I);
    if (!battlePickers || !battleUnits) throw new Error("Battle UI bundle unavailable");
    return { P: battlePickers, Units: battleUnits };
  }

  function battleTools() {
    return `<div class="battle-tools"><button data-open-battle-log="1" class="battle-tool-button" title="牌局记录" aria-label="牌局记录">☷</button><button data-open-settings="1" class="battle-tool-button" title="设置" aria-label="设置">⚙</button></div>`;
  }
  function battleAssetWarning(battle) {
    const count = battle.assetFailures?.length || 0;
    if (!count) return "";
    const progress = battle.assetRetryProgress;
    const text = battle.assetRetrying
      ? `正在重试战斗素材${progress ? ` ${progress.done}/${progress.total}` : ""}`
      : battle.assetCriticalFailures?.length
        ? `${battle.assetCriticalFailures.length}项关键立绘加载失败，已使用备用立绘`
        : `${count}项战斗插画加载失败，已使用备用图`;
    return `<div class="battle-asset-warning" role="status"><span>${U.esc(text)}</span><button data-retry-battle-assets="1" ${battle.assetRetrying ? "disabled" : ""}>${battle.assetRetrying ? "重试中…" : "重试素材"}</button></div>`;
  }
  function battleLogPanel(state) {
    if (!window.battleLogOpen) return "";
    const entries = state.battleLog || [];
    return `<aside class="battle-log-panel" aria-label="牌局记录"><header><div><b>牌局记录</b><small>${entries.length}条</small></div><button data-close-battle-log="1" title="关闭牌局记录" aria-label="关闭牌局记录">×</button></header><div class="battle-log-list" role="log">${entries.length ? entries.map((text, index) => `<div class="battle-log-entry"><i>${entries.length - index}</i><span>${U.esc(text)}</span></div>`).join("") : `<p class="muted">暂无行动记录</p>`}</div></aside>`;
  }
  const syncPlayedTrail = trail.sync;
  function render(state) {
    const { P, Units } = battleModules();
    const current = state.battle;
    const played = trail.cards(current);
    const mission = GameData.missions.find(item => item.id === current.missionId);
    const round = current.roundNo || 1;
    if (current.victoryScreen) return window.BattleVictory.render(state);
    const kaiichiVisible = !!current.kaiichiShare
      && (window.HoshinoSkills?.shareVisible?.(current) ?? true);
    const kaiichiPending = !!current.kaiichiShare && !kaiichiVisible;
    const dimensionVisible = !!current.dimensionTransfer
      && (window.MannySkills?.dimensionTransferVisible?.(current) ?? true);
    const guardVisible = !!current.opheliaGuard
      && (window.GuestCharacterSkills?.guardVisible?.(current) ?? true);
    const responsibilityVisible = !!current.cadicisResponsibility
      && (window.WendyCadicisSkills?.responsibilityVisible?.(current) ?? true);
    const reactionPending = kaiichiPending
      || !!current.dimensionTransfer && !dimensionVisible
      || !!current.opheliaGuard && !guardVisible
      || !!current.cadicisResponsibility && !responsibilityVisible;
    const lockedClass = battleClasses(current, {
      kaiichiVisible, dimensionVisible, guardVisible,
      responsibilityVisible, reactionPending,
    });
    const retreat = current.test || mission?.kind === "dungeon" && !current.defeat && !current.exploration
      ? `<button class="battle-retreat ${current.test ? "test-retreat" : ""}" data-retreat="1">撤退</button>`
      : "";
    const enemies = current.enemies.map(unit => Units.unit(unit, current)).join("");
    const allies = current.allies.map(unit => Units.unit(unit, current)).join("");
    const trailKey = U.esc(`${current.turn || 0}:${current.activeUid || ""}`);
    const overlayHtml = overlays.render(state, current, P);
    return `<div class="battle-screen ${lockedClass}">${retreat}${battleTools()}${battleAssetWarning(current)}<div class="unit-row enemy-row">${enemies}</div>${BattlePileStats.render("怪物", current.enemies, "enemy")}<div class="public-zone">${skillCaption(current)}${relicCaption(current)}<span class="public-round">第${round}回合</span><div class="public-cards stack" data-trail-key="${trailKey}" aria-label="本回合出牌">${played.map(U.trailCard).join("")}</div></div>${BattlePileStats.render("玩家", current.allies, "ally")}<div class="unit-row ally-row">${allies}</div>${Units.activeInfo(state)}${window.GameUIHand.render(state, U)}<div class="target-line"></div>${overlayHtml}${battleLogPanel(state)}</div>`;
  }
  function battleClasses(battle, visible) {
    const borrowChoice = ["borrowSlashChoice", "borrowGainChoice"]
      .includes(battle.handReveal?.mode);
    const handSharing = visible.kaiichiVisible || visible.responsibilityVisible
      || visible.dimensionVisible || borrowChoice;
    const headshotPending = battle.judgement?.skill === "爆头一击"
      || battle.animQueue?.some(event => event.type === "judgement" && event.skill === "爆头一击");
    return `${battle.locked ? "battle-locked" : ""} ${headshotPending ? "headshot-pending" : ""} ${visible.dimensionVisible ? "dimension-transfering" : ""} ${visible.guardVisible ? "ophelia-guarding" : ""} ${battle.gerdaComfort ? "gerda-comforting" : ""} ${visible.kaiichiVisible ? "kaiichi-sharing" : ""} ${visible.reactionPending ? "reaction-prompt-pending" : ""} ${handSharing ? "hand-sharing" : ""} ${battle.manualDodge || battle.manualCounter || battle.counterTrigger || battle.recklessPrompt || battle.risaEyePrompt || ["magicBullet", "magicBulletReveal"].includes(battle.handReveal?.mode) ? "manual-dodge-active" : ""}`;
  }
  function skillCaption(battle) {
    const captions = battle.skillCaptions || (battle.skillCaption ? [battle.skillCaption] : []);
    return captions.map((caption, index) =>
      `<div class="skill-caption ${caption.side === "enemy" ? "enemy" : "ally"}" style="--caption-index:${index}" data-caption-id="${U.esc(caption.id || "")}">${U.esc(caption.text)}</div>`
    ).join("");
  }
  function relicCaption(battle) {
    const caption = battle.relicCaption;
    return caption
      ? `<div class="skill-caption relic-caption ${caption.side === "enemy" ? "enemy" : "ally"}">${U.esc(caption.text)}</div>`
      : "";
  }
  return { render, syncPlayedTrail };
};
