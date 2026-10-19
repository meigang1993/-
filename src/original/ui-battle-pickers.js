window.GameUIBattlePickers = U => {
  const scrollKey = value => `data-battle-picker-scroll="${U.esc(value)}"`;
  function armoryPicker(battle) {
    if (!battle.mannyArmoryPicker) return "";
    const actor = battle.allies.concat(battle.enemies).find(unit => unit.uid === battle.mannyArmoryPicker.uid);
    const current = actor?.mannyWeapon;
    return `<div class="armory-popup"><div class="armory-card"><h2>次元军火库</h2><p class="muted">选择一种重火器激活；会替换当前重火器。</p><div class="armory-options" ${scrollKey(`manny:${actor?.uid || ""}`)}>${MannySkills.weapons.map(weapon => `<button class="armory-option ${current === weapon.id ? "active" : ""}" data-manny-weapon="${weapon.id}"><b>${U.esc(weapon.name)}</b><span>${U.esc(weapon.text)}</span></button>`).join("")}</div></div></div>`;
  }
  function wendyTutorPicker(battle) {
    const picker = battle.wendyTutorPicker;
    if (!picker) return "";
    if (picker.cardName) {
      // 交牌环节统一口径：不渲染居中浮层，只保留手牌区底部提示条
      // （点温蒂自己＝加入自己手牌，点队友＝交给该队友）。
      return "";
    }
    const cards = window.WendyCadicisSkills?.tutorPool?.(window.state) || (GameData.cardCodex || []).filter(card => card.type === "tactic");
    return `<div class="armory-popup"><div class="armory-card"><h2>解答迷惑</h2><p class="muted">从全部${cards.length}张正式战术牌中选择1张，再选择加入自己手牌或交给队友。</p><div class="armory-options" ${scrollKey(`wendy:${picker.uid}:cards`)}>${cards.map(card => `<button class="armory-option" data-wendy-tutor-card="${U.esc(card.name)}"><b>${U.esc(card.name)}</b><span>${U.esc(card.text)}</span></button>`).join("")}</div></div></div>`;
  }
  function mieryulaBloodthirstPicker(battle) {
    const picker = battle.mieryulaBloodthirstPicker;
    if (!picker) return "";
    // 已选牌名后不渲染居中浮层，只保留手牌区底部提示条：
    // 与【解答迷惑】交牌环节同一口径，点击敌方角色即打出虚拟杀牌。
    if (picker.cardName) return "";
    const names = window.MieryulaSkills?.availableSlashNames?.(window.state,
      battle.allies.concat(battle.enemies).find(u => u.uid === picker.uid)) || [];
    const pool = window.MieryulaSkills?.slashPool?.(window.state) || [];
    return `<div class="armory-popup"><div class="armory-card"><h2>渴血杀戮</h2><p class="muted">选择一项“杀”牌的牌名，随后点击一名敌方角色，视为使用一张该牌名的虚拟牌（不消耗杀意）。本回合每项限一次。</p><div class="armory-options" ${scrollKey(`mieryula:${picker.uid}:cards`)}>${pool.map(card => {
      const used = !names.includes(card.name);
      return `<button class="armory-option${used ? " disabled" : ""}" ${used ? "disabled" : ""} data-mieryula-slash="${U.esc(card.name)}"><b>${U.esc(card.name)}</b><span>${U.esc(card.text || "")}</span></button>`;
    }).join("")}</div><button class="armory-skip" data-mieryula-skip="1">不发动</button></div></div>`;
  }
  function ailengDrillPicker(battle) {
    // 交牌类统一口径：不渲染居中浮层，只保留手牌区底部提示条
    // 与【半魅魔血】【新月之歌】【收获分享】【指挥官责任】保持一致。
    return "";
  }
  function catherineStealPicker(battle) {
    // 窃取统一为「先点敌方角色、再点我方角色」：不渲染居中浮层，
    // 只保留手牌区底部提示条（与战斗演练、解答迷惑交牌同一口径）。
    return "";
  }
  function cadicisResponsibilityPicker(battle) {
    // 交牌类统一口径：不渲染居中浮层，只保留手牌区底部提示条。
    return "";
  }
  function dimensionPicker(battle) {
    // 次元转移统一为手牌区底部提示条（与交牌类同一口径），不渲染居中浮层。
    // 两步进度（是否已选黑色牌）改由底部提示条文案承载，见 ui-hand-view.js。
    if (battle.dimensionTransfer) return "";
    return "";
  }
  function opheliaGuardPicker(battle) {
    // 为我护驾统一为底部提示条：护驾发生在敌方回合，当前行动人是敌方单位，
    // 手牌区会渲染空态面板（见 ui-hand.js），居中浮层改由该空态面板承载。
    // 与交牌类（半魅魔血/战斗演练/窃取等）保持同一口径。
    return "";
  }
  function newMoonPicker(battle) {
    // 交牌类统一口径：不渲染居中浮层，只保留手牌区底部提示条。
    return "";
  }
  function gerdaComfortPicker(battle) {
    // 萌虎慰劳统一为手牌区底部提示条（与交牌类同一口径），不渲染居中浮层。
    return "";
  }
  function kaiichiSharePicker(battle) {
    // 交牌类统一口径：不渲染居中浮层，只保留手牌区底部提示条。
    return "";
  }
  function millerSlot(battle) {
    const slot = battle.millerSlot;
    const unit = slot && battle.allies.concat(battle.enemies).find(item => item.uid === slot.uid);
    if (!slot || !unit) return "";
    return `<div class="slot-popup"><div class="slot-card"><b>${U.esc(unit.name)}的贪玩老虎机</b><div class="slot-reels">${slot.rolls.map(value => `<span>${U.esc(value)}</span>`).join("")}</div><p>摸${slot.count}张牌</p></div></div>`;
  }
  return {
    ailengDrillPicker, armoryPicker, catherineStealPicker, mieryulaBloodthirstPicker,
    cadicisResponsibilityPicker,
    dimensionPicker, gerdaComfortPicker, kaiichiSharePicker, millerSlot, newMoonPicker, opheliaGuardPicker,
    wendyTutorPicker,
  };
};
