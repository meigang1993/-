window.GameUIInfo = (U) => {
  function greenHatMark(u) {
    const count = Math.min(5, (u?.greenHat || 0) + (u?.envy || 0));
    return count ? `<span class="green-hat-badge" title="绿帽标记：${count}/5">绿帽×${count}</span>` : "";
  }
  function foodMark(u) { return u.food ? `<span class="green-hat-badge" title="快速生长粮食标记：${u.food}">粮食×${u.food}</span>` : ""; }
  function rageMark(u) {
    const count = Math.max(0, Math.min(10, u?.rageMarks || 0));
    return count
      ? `<span class="green-hat-badge rage-mark-badge" title="狂战标记：${count}/10">狂战×${count}</span>`
      : "";
  }
  function missionMark(u) {
    if (u?.ref !== "hoshino_yi" || u.hoshinoMissionResult) return "";
    const count = Math.max(0, Math.min(20, u.hoshinoMissionCards || 0));
    return `<span class="green-hat-badge mission-badge" title="梦想真理：已使用${count}/20张牌">使命 ${count}/20</span>`;
  }
  function idolSuitMark(u) {
    const suit = ["♥", "♦", "♠", "♣"].includes(u?.hoshinoLastSuit) ? u.hoshinoLastSuit : "";
    return suit ? `<span class="green-hat-badge idol-suit-badge" title="偶像之星：上一张标准花色牌为${suit}">偶像 ${suit}</span>` : "";
  }
  function domeSuitMark(u) {
    if (u?.ref !== "hoshino_yi") return "";
    const suits = ["♥", "♦", "♠", "♣"].filter(suit => (u.hoshinoSuitSet || []).includes(suit));
    return suits.length ? `<span class="green-hat-badge dome-suit-badge" title="巨蛋演出：已记录${suits.join("、")}">巨蛋 ${suits.join("")}</span>` : "";
  }
  function jokerSuitMark(u) {
    if (u?.ai !== "raff_assassin" || !["♥", "♦", "♠", "♣"].includes(u.jokerSuit)) return "";
    const red = u.jokerSuit === "♥" || u.jokerSuit === "♦";
    const mode = u.jokerMode === "red" ? "大鬼牌模式：惩罚红色牌" : "小鬼牌模式：惩罚黑色牌";
    return `<span class="joker-suit-badge ${red ? "red" : "black"}" title="鬼牌狂欢判定：${u.jokerSuit}；${mode}">${u.jokerSuit}</span>`;
  }
  function findInfoUnit(state) {
    const id = state.infoUnit;
    if (!id) return null;
    const b = state.view === "battle" ? state.battle : null;
    return b ? (b.allies.find(u => u.uid === id) || b.enemies.find(u => u.uid === id)) : state.chars.find(c => c.id === id);
  }
  function infoPanel(u, tab = "stats", relicStats = null) {
    if (!u) return ""; const refId = u.id || u.ref, canUseRelics = !!u.id && !!window.state?.chars?.some(c => c.id === u.id), canUseSkins = !!refId && u.side !== "enemy" && !!window.SkinSystem?.forChar?.(refId)?.length;
    const specialArt = !u.side && window.SkinSystem?.forChar?.(refId)
      ?.find(skin => skin.specialIllustration);
    const canUseSpecialArt = !!specialArt;
    const safeTab = tab === "relics" && !canUseRelics ? "stats" : tab === "skins" && !canUseSkins ? "stats" : tab === "specialArt" && !canUseSpecialArt ? "stats" : (["skills", "relics", "skins", "specialArt"].includes(tab) ? tab : "stats");
    const unlock = unlockLine(u);
    const title = `${infoTitle(u)}${u.role ? `<p class="role-line">${U.esc(u.role)}</p>` : ""}${unlock}`;
    const livingRoom = !u.side && window.state?.view === "livingRoom";
    const growth = livingRoom ? progressionPanel(u) : "";
    const body = safeTab === "skills" ? `${title}<h3>技能</h3>${skillList(u)}` : safeTab === "relics" ? relicPanel(u) : safeTab === "skins" ? skinPanel(u, refId) : safeTab === "specialArt" ? specialArtPanel(u, specialArt) : `${title}${growth}${u.side === "enemy" && u.battleRelics?.length ? relicBattlePanel(u) : ""}<div class="stats">${U.statHtml({ stats: u.stats, relicStats: relicStats || u.relicStats || {} })}</div>`;
    const relicButton = canUseRelics ? `<button class="${safeTab === "relics" ? "active" : ""}" data-info-tab="relics">饰品</button>` : "";
    const skinButton = canUseSkins ? `<button class="${safeTab === "skins" ? "active" : ""}" data-info-tab="skins">皮肤</button>` : "";
    const specialArtButton = canUseSpecialArt ? `<button class="${safeTab === "specialArt" ? "active" : ""}" data-info-tab="specialArt">立绘</button>` : "";
    const art = safeTab === "specialArt" ? specialArtPane(u, specialArt) : U.face(u, true);
    return `<div class="info-overlay" data-close-info="1" role="dialog" aria-modal="true" aria-label="${U.esc(u.name)}角色详情"><div class="info-popup"><button class="info-close" data-close-info="1" aria-label="关闭角色详情">×</button><aside><button class="${safeTab === "stats" ? "active" : ""}" data-info-tab="stats">属性</button><button class="${safeTab === "skills" ? "active" : ""}" data-info-tab="skills">技能</button>${relicButton}${skinButton}${specialArtButton}</aside><section>${body}</section><div class="info-art">${art}</div></div></div>`;
  }
  function skillList(u) {
    return U.skillsOf(u).filter(s => s.showInSkillInfo !== false && (s.source !== "relic" || s.showInSkillInfo)).map((s, i) => `<div class="skill-detail ${String(s.type || "").replace(/[^\w-]/g, "")}">${U.skillName(s, i, false, false, true, false, null, u)}<p>${U.esc(U.skillText(s))}</p></div>`).join("") || `<p class="muted">暂无技能。</p>`;
  }
  function progressionPanel(u) {
    const template = GameData.characters.find(character => character.id === u.id);
    if (!template) return "";
    const required = window.CharacterProgression.need(u.level);
    const exp = required ? Math.min(required, u.exp || 0) : 0;
    const percent = required ? Math.round(exp / required * 100) : 100;
    const base = window.CharacterProgression.statsAt(template, 0);
    const final = window.CharacterProgression.statsAt(
      template, window.CharacterProgression.maxLevel);
    const names = { maxHp: "生命", attack: "攻击", magic: "魔力", speed: "速度" };
    const rows = window.CharacterProgression.statKeys.map(key =>
      `<div><span>${names[key]}</span><b>${U.formatStat(base[key])}</b><i>→</i><strong>${U.formatStat(u.stats[key])}</strong><i>→</i><em>${U.formatStat(final[key])}</em></div>`).join("");
    const profile = window.CharacterProgression.profile(u.id);
    const focus = ["attack", "magic", "speed"].sort((a, b) =>
      profile[b] - profile[a])[0];
    const expText = required ? `${exp} / ${required}` : "已满级";
    return `<div class="character-growth"><div class="growth-level"><b>Lv.${u.level}</b><span>经验 ${expText}</span></div><div class="exp-track"><i style="width:${percent}%"></i></div><p class="muted">成长倾向：${names[focus]}；四项核心属性每级自动提升。</p><div class="growth-table"><div class="growth-head"><span>属性</span><b>0级</b><i></i><strong>当前</strong><i></i><em>15级</em></div>${rows}</div></div>`;
  }
  function infoTitle(u) {
    const role = U.combatRoleBadges(u);
    return `<div class="info-title-row"><h2>${U.esc(u.name)}</h2>${role}</div>`;
  }
  function unlockLine(u) {
    if (!u?.id || u.side === "enemy") return "";
    const text = window.GameData?.unlockHints?.[u.id] || (u.unlockCost ? `消耗精华宝珠 ×${u.unlockCost}` : "特殊剧情解锁");
    return `<p class="unlock-line ${u.locked ? "locked" : "owned"}">${u.locked ? "未解锁" : "已解锁"} · ${U.esc(text)}</p>`;
  }
  function relicBattlePanel(u) {
    const items = (u.battleRelics || []).map(name => `<li>${U.relicLabel(name)}</li>`).join("");
    return `<h3>英雄级饰品</h3><ul class="enemy-relic-list">${items}</ul>`;
  }
  function skinPanel(u, refId) {
    const state = window.state, skins = window.SkinSystem?.forChar?.(refId) || [], trial = !!state?.battle?.test;
    const current = trial ? state.testSkins?.[refId] || state.equippedSkins?.[refId] : state?.equippedSkins?.[refId];
    const status = window.GameStore?.status?.().settings || {};
    const saving = !!state?.appearanceSaving;
    const equipAttr = state?.view === "battle"
      ? "data-battle-equip-skin" : "data-equip-skin";
    const items = skins.map(s => {
      const formalOwned = window.SkinSystem.owned(state, s);
      const trialOnly = trial && !formalOwned;
      const available = formalOwned || trialOnly, equipped = current === s.id;
      const disabled = saving || !available || equipped;
      const action = saving && equipped ? "保存中…" : equipped ? (trialOnly ? "试用中" : "已装备") : trialOnly ? "试用" : formalOwned ? "装备" : s.unlockLevel ? `Lv.${s.unlockLevel}解锁` : "未拥有";
      const specialLocked = !trial && s.unlockLevel && !formalOwned;
      const preview = specialLocked && !s.specialIllustration
        ? `<span class="skin-level-lock">Lv.${s.unlockLevel}</span>`
        : `<img src="${U.esc(s.art)}" alt="${U.esc(s.name)}" loading="lazy" decoding="async"${specialLocked ? ' class="locked"' : ''}>`;
      return `<button class="battle-skin-option ${equipped ? "selected" : ""}" ${equipAttr}="${U.esc(s.id)}" ${disabled ? "disabled" : ""}>${preview}<b>${U.esc(s.name)}${s.specialEffect ? " · 专属特效" : ""}</b><span>${action}</span></button>`;
    }).join("");
    const warning = status.state === "error" && status.pending
      ? `<div class="save-warning" role="alert"><span>外观选择尚未保存，刷新后可能恢复为上次选择。</span><button data-retry-settings="1">重试保存</button></div>`
      : "";
    const hint = trial ? "测试战斗中可试用未拥有的皮肤，包含等级特殊立绘。"
      : state?.view === "battle" ? "战斗中可直接切换已拥有皮肤，只改变外观。"
      : "选择已拥有皮肤作为角色外观。";
    return `${infoTitle(u)}<p class="muted">${hint}</p>${warning}<div class="battle-skin-list">${items}</div>`;
  }
  function specialArtPanel(u, item) {
    const unlocked = window.SkinSystem.owned(window.state, item);
    const status = unlocked ? `已解锁 · Lv.${u.level}` : `Lv.${item.unlockLevel} 自动解锁`;
    return `${infoTitle(u)}<h3>${U.esc(item.name)}</h3><div class="special-art-summary ${unlocked ? "unlocked" : "locked"}"><span class="tag">${status}</span></div>`;
  }
  function specialArtPane(u, item) {
    const unlocked = window.SkinSystem.owned(window.state, item);
    const lockedClass = unlocked ? "" : " locked";
    const overlay = unlocked ? "" : `<div class="special-art-lock-overlay"><b>Lv.${item.unlockLevel}</b><span>达到等级后自动解锁</span></div>`;
    return `<div class="portrait large special-art-portrait${lockedClass}" data-art-src="${U.esc(item.art)}" data-art-name="${U.esc(item.name)}"><img src="${U.esc(item.art)}" alt="${U.esc(item.name)}" loading="lazy" decoding="async" draggable="false">${overlay}</div>`;
  }
  function relicPanel(u) {
    const state = window.state, test = state?.hallModal === "testBattle", map = test ? state.testEquipment || {} : state.equipment || {};
    const eq = RelicSystem.normalizeSlots(map[u.id]), rawPool = test ? [...(state.resources?.relics || []), ...(state.testRelics || [])] : state?.resources?.relics || [], pool = [...new Set(RelicSystem.normalizeNames(rawPool))];
    const slot = (i) => `<div class="relic-slot ${eq[i] ? "equipped" : "empty"} ${state.pendingRelicSlot === i ? "selected" : ""}" data-relic-slot="${i}">${eq[i] ? `${U.relicLabel(eq[i])}<em>点击卸下</em>` : `<b>＋</b><span>点击装备饰品</span>`}</div>`;
    return `${infoTitle(u)}${u.role ? `<p class="role-line">${U.esc(u.role)}</p>` : ""}<h3>饰品</h3><div class="relic-slots">${slot(0)}${slot(1)}</div><p class="muted">点击已装备槽位可直接卸下；点击空槽可选择饰品。</p>${state.pendingRelicSlot != null ? relicPicker(u, state.pendingRelicSlot, pool) : ""}`;
  }
  function relicPicker(u, slotIndex, pool) {
    const items = pool.map(r => relicItem(r, `data-relic-pool-item="${U.esc(r)}"`)).join("") || `<span class="muted">暂无可用饰品</span>`;
    return `<div class="relic-picker"><div class="relic-picker-card"><button class="info-close" data-close-relic-picker="1">×</button><h3>${U.esc(u.name)} · ${slotIndex + 1}号槽</h3><p class="muted">选择一个饰品装备到该槽位；同一角色不能佩戴重复饰品。</p><div class="relic-picker-grid" data-relic-pool="1">${items}</div></div></div>`;
  }
  function relicItem(name, data) {
    const owner = window.state && RelicSystem.equippedBy(window.state, name), count = window.state ? RelicSystem.availableCount(window.state, name) : 0, selected = window.state?.selectedRelic === name, used = owner ? " used" : "";
    return `<div class="relic-item${used} ${selected ? "selected" : ""}" draggable="true" ${data}>${U.relicLabel(name)}<em>${owner ? `使用中${count ? ` / 库存×${count}` : ""}` : `库存×${count}`}</em></div>`;
  }
  function infoPanelForState(state) {
    const u = findInfoUnit(state);
    const stats = u?.id && window.RelicSystem ? RelicSystem.statsOf(state, u.id) : null;
    return infoPanel(u, state.infoTab, stats);
  }
  return { greenHatMark, foodMark, rageMark, missionMark, idolSuitMark, domeSuitMark, jokerSuitMark, findInfoUnit, infoPanel, infoPanelForState };
};
