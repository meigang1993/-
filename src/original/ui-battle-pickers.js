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
      const actor = battle.allies.concat(battle.enemies).find(unit => unit.uid === picker.uid);
      const targets = [actor, ...battle.allies.filter(unit => unit.uid !== actor?.uid && unit.hp > 0)].filter(Boolean);
      return `<div class="armory-popup"><div class="armory-card"><h2>解答迷惑</h2><p class="muted">已选择${U.esc(picker.cardName)}，请选择加入自己手牌或交给一名队友。</p><div class="armory-options" ${scrollKey(`wendy:${picker.uid}:targets`)}>${targets.map(unit => `<button class="armory-option" data-wendy-tutor-target="${U.esc(unit.uid)}"><b>${U.esc(unit.name)}</b><span>${unit.uid === actor?.uid ? "加入自己手牌" : "交给该队友"}</span></button>`).join("")}</div></div></div>`;
    }
    const cards = window.WendyCadicisSkills?.tutorPool?.(window.state) || (GameData.cardCodex || []).filter(card => card.type === "tactic");
    return `<div class="armory-popup"><div class="armory-card"><h2>解答迷惑</h2><p class="muted">从全部${cards.length}张正式战术牌中选择1张，再选择加入自己手牌或交给队友。</p><div class="armory-options" ${scrollKey(`wendy:${picker.uid}:cards`)}>${cards.map(card => `<button class="armory-option" data-wendy-tutor-card="${U.esc(card.name)}"><b>${U.esc(card.name)}</b><span>${U.esc(card.text)}</span></button>`).join("")}</div></div></div>`;
  }
  function ailengDrillPicker(battle) {
    const picker = battle.ailengDrillPicker;
    if (!picker) return "";
    const actor = battle.allies.find(unit => unit.uid === picker.actorUid);
    const targets = battle.allies.filter(unit => unit.uid !== picker.actorUid && unit.hp > 0);
    return `<div class="armory-popup"><div class="armory-card"><h2>战斗演练</h2><p class="muted">${U.esc(actor?.name || "艾伦格")}使用了${U.esc(picker.card?.name || "卡牌")}，请选择交给哪名队友，也可以不交。</p><div class="armory-options" ${scrollKey(`aileng:${picker.actorUid}`)}>${targets.map(unit => `<button class="armory-option" data-aileng-drill-target="${U.esc(unit.uid)}"><b>${U.esc(unit.name)}</b><span>获得这张牌</span></button>`).join("")}<button class="armory-option ghost" data-aileng-drill-skip="1"><b>不交出</b><span>保留结算结果</span></button></div></div></div>`;
  }
  function cadicisResponsibilityPicker(battle) {
    const picker = battle.cadicisResponsibility;
    if (!picker || window.WendyCadicisSkills?.responsibilityVisible?.(battle) === false) return "";
    const cadicis = battle.allies.find(unit => unit.uid === picker.cadicisUid);
    const target = battle.allies.find(unit => unit.uid === picker.targetUid);
    return `<div class="dimension-prompt"><b>指挥官责任</b><span>${U.esc(cadicis?.name || "卡迪西斯")}还需从手牌区选择${picker.remaining || 1}张牌交给${U.esc(target?.name || "目标")}。</span></div>`;
  }
  function dimensionPicker(battle) {
    if (!battle.dimensionTransfer
      || window.MannySkills?.dimensionTransferVisible?.(battle) === false) return "";
    return `<div class="dimension-prompt"><b>次元转移</b><span>${battle.dimensionTransfer.costIndex == null ? "请先从曼妮手牌中选择1张黑色牌" : "已选择黑色牌，请指定一名敌人承受本次伤害"}</span></div>`;
  }
  function opheliaGuardPicker(battle) {
    return battle.opheliaGuard
      && window.GuestCharacterSkills?.guardVisible?.(battle) !== false
      ? `<div class="dimension-prompt"><b>为我护驾</b><span>请选择一名其他我方角色替奥菲莉亚护驾</span></div>`
      : "";
  }
  function newMoonPicker(battle) {
    const picker = battle.newMoonShare;
    const unit = picker && battle.allies.find(item => item.uid === picker.unitUid);
    if (!picker || !unit) return "";
    const selected = (picker.indexes || []).length;
    return `<div class="dimension-prompt"><b>新月之歌</b><span>${U.esc(unit.name)}已选${selected}/${picker.count}张牌；选满后点击队友交出，或选择不交。</span></div>`;
  }
  function gerdaComfortPicker(battle) {
    const picker = battle.gerdaComfort;
    const unit = picker && battle.allies.find(item => item.uid === picker.unitUid);
    return picker && unit ? `<div class="dimension-prompt gerda-comfort-prompt"><b>萌虎慰劳</b><span>请选择一名其他队友，双方各摸2张牌；也可以放弃。</span><button data-gerda-comfort-skip="1">放弃</button></div>` : "";
  }
  function kaiichiSharePicker(battle) {
    const picker = battle.kaiichiShare;
    const unit = picker && battle.allies.find(item => item.uid === picker.unitUid);
    if (!picker || !unit || window.HoshinoSkills?.shareVisible?.(battle) === false) return "";
    const selected = (picker.indexes || []).length;
    return `<div class="dimension-prompt"><b>半魅魔血</b><span>选择至多${picker.maxCount}张手牌，再点击一名其他队友一次性交出；当前已选${selected}张。</span><button data-kaiichi-share-skip="1">不交</button></div>`;
  }
  function millerSlot(battle) {
    const slot = battle.millerSlot;
    const unit = slot && battle.allies.concat(battle.enemies).find(item => item.uid === slot.uid);
    if (!slot || !unit) return "";
    return `<div class="slot-popup"><div class="slot-card"><b>${U.esc(unit.name)}的贪玩老虎机</b><div class="slot-reels">${slot.rolls.map(value => `<span>${U.esc(value)}</span>`).join("")}</div><p>摸${slot.count}张牌</p></div></div>`;
  }
  return {
    ailengDrillPicker, armoryPicker, cadicisResponsibilityPicker,
    dimensionPicker, gerdaComfortPicker, kaiichiSharePicker, millerSlot, newMoonPicker, opheliaGuardPicker,
    wendyTutorPicker,
  };
};
