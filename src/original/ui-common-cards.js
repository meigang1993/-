window.UICommonCards = deps => {
  const { esc, classToken, statValue } = deps;
  const typeName = {
    slash: "杀", response: "响应", tactic: "战术", consume: "消耗",
    obstacle: "障碍", status: "状态",
  };
  const suitClass = suit => !suit ? ""
    : suit === "♥" || suit === "♦" ? "red-suit" : "black-suit";
  const artHtml = window.UICommonCardArt({ esc }).html;
  const { combatBar, previewDamage } = window.UICommonCardCombat({ statValue });

  function card(value, hidden, opts = {}) {
    if (hidden) return `<div class="play-card back" aria-label="隐藏手牌"></div>`;
    const current = window.CardUtils?.battleView?.(window.state, opts.actor, value)
      || window.WithererSkills?.displayCard?.(opts.actor, value) || value;
    const rawType = String(current?.type || "tactic");
    const type = typeName[rawType] ? rawType : "tactic";
    const suit = String(current?.suit || "");
    const index = Number(opts.index);
    const locked = opts.disabled ? "disabled" : "";
    const selected = opts.selected ? "selected" : "";
    const discard = opts.discard ? "discardable" : "";
    const extra = `${opts.extraClass || ""} ${current?.burning ? "burning-status" : ""}`
      .split(/\s+/).map(classToken).filter(Boolean).join(" ");
    const data = opts.index != null && Number.isInteger(index)
      ? `data-card-index="${index}"` : "";
    const preview = previewDamage(opts.actor, current);
    const conversion = current?.convertedFrom
      ? `<small class="card-conversion">转换自：${esc(current.convertedFrom)}</small>` : "";
    const artClass = window.CardArt?.className(current) || "";
    return `<div class="play-card ${classToken(type)} ${suitClass(suit)} ${locked} ${selected} ${discard} ${extra} ${artClass}" title="${esc(current?.text || "")}" ${data}><div class="card-title"><span class="card-suit">${esc(suit)}</span><b>${esc(current?.name || "")}</b></div>${artHtml(current)}<div class="card-footer"><span class="card-type">${esc(typeName[type] || type)}</span><small class="card-effect">${esc(current?.text || "")}</small>${conversion}${preview}</div></div>`;
  }

  function trailCard(card) {
    const rawType = String(card?.type || "tactic");
    const type = typeName[rawType] ? rawType : "tactic";
    const generated = window.CardUtils?.generatedSource?.(card);
    const kind = card?.comboAttackVirtual ? "协攻" : card?.dismantled ? "被拆"
      : card?.convertedFrom ? "转换" : card?.virtual ? "虚拟" : "";
    const skill = !kind ? card?.skillName || "" : "";
    const by = card?._playedByName
      ? `<em>${esc(card._playedByName)} ${esc(card._playedAction || "发动了")}</em>` : "";
    const kindClass = kind === "转换" ? "converted" : kind === "被拆" ? "dismantled"
        : kind === "协攻" ? "combo" : "virtual";
    const kindTag = kind
      ? `<span class="trail-kind ${kindClass}">${kind}</span>` : "";
    const detail = skill
      ? `<span class="trail-type">技能</span>`
      : !kind ? `<span class="trail-type">${esc(typeName[type] || type)}</span>` : "";
    const note = [
      card?.comboAttackVirtual ? "由组合进攻生成的虚拟【杀（普攻）】"
        : card?.dismantled ? "被其他角色强制弃置"
        : card?.convertedFrom ? `转换自：${card.convertedFrom}`
          : card?.virtual ? "虚拟牌" : "",
      skill ? `技能：${skill}` : "",
      generated ? `由${generated}生成` : "",
      card?.text || "",
    ].filter(Boolean).join("\n");
    const artClass = window.CardArt?.className(card) || "";
    return `<div class="card-trail play-card ${classToken(type)} ${suitClass(card?.suit)} ${card?.burning ? "burning-status" : ""} ${artClass}" title="${esc(note)}"><div class="card-title"><span class="card-suit">${esc(card?.suit || "")}</span><b>${esc(card?.name || "")}</b></div>${artHtml(card)}<div class="trail-meta">${kindTag}${detail}</div><small class="trail-effect">${esc(card?.text || "")}</small>${by}</div>`;
  }

  return { combatBar, card, trailCard, suitClass };
};
