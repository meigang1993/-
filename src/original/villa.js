window.VillaUI = (() => {
  const U = window.UICommon;
  const cardType = { slash: "杀牌", response: "响应", tactic: "战术", consume: "消耗", obstacle: "障碍" };
  const cardTypeLabel = c => cardType[c?.type] || "卡牌";
  let collection;
  function collectionUI() {
    collection ||= window.VillaCollectionUI({ U, cardTypeLabel });
    return collection;
  }
  function portrait(c) {
    const art = c.avatar || c.art;
    const title = U.esc(U.skillSummary(c));
    return art ? `<div class="portrait" title="${title}" data-art-src="${U.esc(art)}" data-art-name="${U.esc(c.name || "")}"><img src="${U.esc(art)}" alt="${U.esc(c.name || "角色")}" loading="lazy" decoding="async"></div>` : `<div class="portrait" title="${title}">${U.esc(c.face)}</div>`;
  }
  const test = window.VillaTestUI({ U, portrait });
  function hall(state) {
    if (state.succubusCodex) return SuccubusCodex.render(state);
    const blocked = state.hallModal ? " inert" : "";
    return `<div class="villa-hall"><div class="hall-bg" aria-hidden="true"></div><button class="hall-update-button" data-open-modal="updates" title="查看更新公告"${blocked}><span>更新公告</span><small>2026.09.11</small></button>${hallSide(blocked)}<section class="villa-main"${blocked}>${hallMainActions(state)}</section>${modal(state)}</div>`;
  }
  function hallSide(blocked = "") {
    return `<aside class="villa-actions"${blocked}><button data-open-modal="relics"><span>饰品库</span><small>库存与装备</small></button><button data-open-modal="shop"><span>商店</span><small>购买与删牌</small></button><button data-open-modal="deck"><span>牌库</span><small>卡牌收藏</small></button><button data-open-modal="bounty"><span>任务</span><small>悬赏与目标</small></button><button data-save-game="1"><span>存档</span><small>保存当前进度</small></button></aside>`;
  }
  function hallMainActions(state) {
    const first = !state.flags?.firstExpeditionStarted;
    const objective = first ? `<div class="hall-first-objective" role="status"><span>首次目标</span><b>前往魔国机械工厂</b><small>初始队伍已就绪</small></div>` : "";
    return `${objective}<div class="hall-main-actions"><button class="primary" data-open-modal="team">${first ? "开始首次远征" : "准备启程"}</button></div>`;
  }
  function modal(state) {
    if (!state.hallModal) return "";
    const map = {
      shop: state => collectionUI().shop(state), team: window.VillaTeamUI.team, teamRoster: window.VillaTeamUI.teamRoster,
      bounty: state => window.BountySystem?.render?.(state) || "", deck: state => collectionUI().deck(state),
      relics: state => collectionUI().relics(state), skins: state => collectionUI().skins(state), testBattle: test.testBattle,
      updates: () => window.UpdateNotice?.render?.() || "",
      deleteDeck: state => collectionUI().deleteDeck(state), firstDefeat: window.VillaEvents.firstDefeat,
      secondDefeat: window.VillaEvents.secondDefeat, millerUnlock: window.VillaEvents.millerUnlock,
      gerlotUnlock: window.VillaEvents.gerlotUnlock, cadicisUnlock: window.VillaEvents.cadicisUnlock,
      lukaUnlock: window.VillaEvents.lukaUnlock,
      littleElranaUnlock: state => window.ExtraUnlockEvents?.littleElranaUnlock?.(state) || "",
      aceUnlock: state => window.ExtraUnlockEvents?.aceUnlock?.(state) || "",
      underwaterTrainUnlock: state => window.ExtraUnlockEvents?.underwaterTrainUnlock?.(state) || "",
      opheliaUnlock: state => window.ExtraUnlockEvents?.opheliaUnlock?.(state) || "",
      bestaNurseryUnlock: state => window.ExtraUnlockEvents?.bestaNurseryUnlock?.(state) || "",
      orcDungeonUnlock: state => window.OrcUnlockEvents?.orcDungeonUnlock?.(state) || "",
      soniaNurseryUnlock: state => window.RecruitUnlockEvents?.soniaUnlock?.(state) || "",
      chiyoRecruitUnlock: state => window.RecruitUnlockEvents?.chiyoUnlock?.(state) || "",
      gerdaNurseryUnlock: state => window.NewCharacterUnlockEvents?.gerdaUnlock?.(state) || "",
      hoshinoFamilyUnlock: state => window.NewCharacterUnlockEvents?.hoshinoUnlock?.(state) || "",
    };
    if (!map[state.hallModal]) { state.hallModal = null; return ""; }
    const close = state.hallModal === "teamRoster" ? `data-open-modal="team" title="返回准备启程"` : `data-close-modal="1"`;
    const eventModals = new Set([
      "firstDefeat", "secondDefeat", "millerUnlock", "gerlotUnlock", "cadicisUnlock",
      "lukaUnlock", "littleElranaUnlock", "aceUnlock", "underwaterTrainUnlock",
      "opheliaUnlock", "bestaNurseryUnlock", "orcDungeonUnlock", "soniaNurseryUnlock",
      "chiyoRecruitUnlock", "gerdaNurseryUnlock", "hoshinoFamilyUnlock",
    ]);
    const modalClass = state.hallModal === "updates"
      ? " update-modal"
      : eventModals.has(state.hallModal) ? " event-modal" : "";
    return `<div class="villa-modal" role="dialog" aria-modal="true" aria-label="据点面板"><div class="modal-card${modalClass}"><button class="info-close" ${close} aria-label="关闭">×</button>${map[state.hallModal](state)}</div></div>`;
  }
  return {
    hall,
    inventoryCards: state => collectionUI().deleteDeck(state, { inventoryRecovery: true }),
  };
})();
