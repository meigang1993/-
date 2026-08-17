window.UICommon = (() => {
  const statTemp = (unit, key) =>
    key === "attack" ? (unit.tempAttack || 0)
      : key === "magic" ? (unit.tempMagic || 0) : 0;
  const relicBonus = (unit, key) => unit.relicStats?.[key] || 0;
  const unappliedRelicBonus = (unit, key) =>
    unit.relicStatsApplied ? 0 : relicBonus(unit, key);
  const baseValue = key =>
    key === "initialDraw" ? 4 : key === "drawPerTurn" ? 2 : 0;
  const statValue = (unit, key) => baseValue(key)
    + (unit.stats?.[key] || 0) + statTemp(unit, key)
    + unappliedRelicBonus(unit, key);
  const classToken = value => String(value || "").replace(/[^\w-]/g, "");
  const classList = value => String(value || "").split(/\s+/)
    .map(classToken).filter(Boolean).join(" ");
  const formatStat = value => {
    const number = Number(value) || 0;
    return Number.isInteger(number)
      ? String(number)
      : number.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  };
  const statDelta = value =>
    `<em class="stat-delta ${value > 0 ? "up" : value < 0 ? "down" : "zero"}">(${value >= 0 ? "+" : ""}${formatStat(value)})</em>`;
  const statHtml = character => GameData.statDefs.map(([key, name]) => {
    const delta = statTemp(character, key) + relicBonus(character, key);
    return `<div class="stat"><span>${name}</span><b>${formatStat(statValue(character, key))} ${statDelta(delta)}</b></div>`;
  }).join("")
    + ((character.block || 0) > 0
      ? `<div class="stat"><span>护甲值</span><b>${character.block}</b></div>` : "")
    + ((character.defenseSystem || 0) > 0
      ? `<div class="stat"><span>防御系统</span><b>${character.defenseSystem}</b></div>` : "")
    + ((character.shock || 0) > 0
      ? `<div class="stat"><span>感电</span><b>${character.shock}层</b></div>` : "");
  const handLimit = unit => unit.stats?.handLimit || 5;
  const handCount = unit => unit.visualHandCount
    ?? window.GuestCharacterSkills?.visibleHandCount?.(unit)
    ?? (unit.hand || []).filter(card => !card._pendingDraw).length;
  const statTitle = unit => GameData.statDefs.map(([key, name]) => {
    const delta = statTemp(unit, key) + relicBonus(unit, key);
    return `${name}：${formatStat(statValue(unit, key))} (${delta >= 0 ? "+" : ""}${formatStat(delta)})`;
  }).join("\n");
  function esc(value) {
    return String(value ?? "").replace(/[&<>"]/g, character =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[character]));
  }

  const skills = window.UICommonSkills({ esc, classToken });
  const art = window.UICommonArt({
    esc, classToken, classList,
    skillSummary: skills.skillSummary,
    skillTitle: skills.skillTitle,
  });
  const relics = window.UICommonRelics({ esc });
  let cards;
  const cardModule = () => {
    cards ||= window.UICommonCards?.({ esc, classToken, statValue });
    if (!cards) throw new Error("Battle card UI bundle unavailable");
    return cards;
  };
  const card = (...args) => cardModule().card(...args);
  const trailCard = (...args) => cardModule().trailCard(...args);
  const combatBar = (...args) => cardModule().combatBar(...args);
  const suitClass = (...args) => cardModule().suitClass(...args);

  return {
    statHtml, statValue, formatStat, face: art.face, artBox: art.artBox,
    handLimit, handCount, statTitle,
    ...skills, card, trailCard, combatBar, suitClass, esc, ...relics,
  };
})();
