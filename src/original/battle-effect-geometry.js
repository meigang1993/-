window.BattleEffectGeometry = (() => {
  const center = element => {
    const rect = element.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  };
  const anchors = () => window.BattleEffectAnchors;
  const lineEl = () => document.querySelector(".target-line");
  const selectedCard = () => {
    const skill = window.state?.battle?.selectedSkillCard;
    if (skill) {
      return document.querySelector(".skill.selected")
        || document.querySelector(".play-card.selected");
    }
    return document.querySelector(".play-card.selected")
      || document.querySelector(".skill.selected");
  };
  const targetArt = uid => anchors()?.battlefield(uid)
    || document.querySelector(`[data-target="${uid}"] .unit-art`);
  const actionArt = uid => anchors()?.action(uid) || null;
  const effectArt = (uid, mode = "battlefield") =>
    anchors()?.resolve(uid, mode) || targetArt(uid);
  const publicZone = () => document.querySelector(".public-zone");
  const pileZone = (side, pile) =>
    document.querySelector(`.pile-stats.${side} [data-pile-zone="${pile}"]`);
  const drawOrigin = (side = "ally") =>
    pileZone(side, "deck") || publicZone() || document.querySelector(".battle-center");
  const unitEl = uid => document.querySelector(`[data-target="${uid}"]`);
  const unitArt = uid => document.querySelector(`[data-target="${uid}"] .unit-art`);
  const handSpot = (uid, side) => {
    if (side !== "ally") return unitArt(uid);
    const shown = [...document.querySelectorAll(".active-hand")]
      .find(hand => hand.dataset.handOwner === String(uid));
    return shown || unitArt(uid);
  };
  let comboPartnerEl = null;

  function applyLineGeometry(line, from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    line.style.left = `${from.x}px`;
    line.style.top = `${from.y}px`;
    line.style.width = `${Math.hypot(dx, dy)}px`;
    line.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
  }

  function appendLine(from, to, className, opacity = null) {
    const line = document.createElement("div");
    line.className = className;
    applyLineGeometry(line, from, to);
    if (opacity != null) line.style.opacity = String(opacity);
    document.body.appendChild(line);
    return line;
  }

  function setLine(from, to, flash = false, enemy = false) {
    const line = lineEl();
    if (!line) return;
    applyLineGeometry(line, from, to);
    line.classList.toggle("show", true);
    line.classList.toggle("flash", flash);
    line.classList.toggle("enemy-line", enemy);
  }

  function setLines(from, targets, flash = false, enemy = false) {
    hideLine();
    targets.forEach((to, index) => appendLine(
      from,
      to,
      `target-line aoe-line show ${flash ? "flash" : ""} ${enemy ? "enemy-line" : ""}`,
      Math.max(.35, .85 - index * .08),
    ));
  }

  function setComboLines(actorPoint, partnerPoint, targetPoint, enemy = false) {
    hideLine();
    appendLine(actorPoint, targetPoint,
      `target-line aoe-line combo-main show flash ${enemy ? "enemy-line" : ""}`);
    appendLine(partnerPoint, targetPoint,
      `target-line aoe-line combo-sub show flash ${enemy ? "enemy-line" : ""}`);
  }

  function flashComboPartner(art) {
    comboPartnerEl?.classList.remove("combo-partner-flash");
    comboPartnerEl = art?.closest?.("[data-target]") || null;
    comboPartnerEl?.classList.add("combo-partner-flash");
  }

  function hideLine() {
    lineEl()?.classList.remove("show", "flash", "enemy-line");
    document.querySelectorAll(".target-line.aoe-line").forEach(element => element.remove());
    comboPartnerEl?.classList.remove("combo-partner-flash");
    comboPartnerEl = null;
  }

  function targetOfCard(state, event) {
    const battle = state.battle;
    const units = battle?.allies.concat(battle.enemies) || [];
    return units.find(unit => unit.uid === event.targetUid) || null;
  }

  function projectile(card, enemy = false) {
    return window.BattleEffectCardDOM.front(card, enemy);
  }

  return {
    center, selectedCard, targetArt, actionArt, effectArt, publicZone,
    pileZone, drawOrigin, unitEl, unitArt, handSpot, setLine, setLines, setComboLines,
    flashComboPartner, hideLine, targetOfCard, projectile,
  };
})();
