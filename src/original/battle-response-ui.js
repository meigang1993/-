window.BattleResponseUI = (() => {
  const U = window.UICommon;
  let lastHandRevealKey = "";
  const gestureIcon = choice => ({ 石头: "✊", 剪刀: "✌", 布: "✋" })[choice] || "?";
  const gestureButtons = attr => `<div class="deflect-choices" aria-label="选择猜拳手势"><button class="deflect-choice" ${attr}="石头" title="石头"><span class="deflect-icon">✊</span><b>石头</b></button><button class="deflect-choice" ${attr}="剪刀" title="剪刀"><span class="deflect-icon">✌</span><b>剪刀</b></button><button class="deflect-choice" ${attr}="布" title="布"><span class="deflect-icon">✋</span><b>布</b></button></div>`;
  const resultReveal = (leftName, leftChoice, rightName, rightChoice, title, attr, nextText) => `<div class="rps-result"><div><b>${U.esc(leftName)}</b><span>${gestureIcon(leftChoice)}</span><em>${U.esc(leftChoice)}</em></div><strong>VS</strong><div><b>${U.esc(rightName)}</b><span>${gestureIcon(rightChoice)}</span><em>${U.esc(rightChoice)}</em></div></div><h3>${U.esc(title)}</h3><button ${attr}="1">${U.esc(nextText)}</button>`;
  const handPanel = (actor, label, controls, cards, tip) => `<div class="hand-panel response-hand-panel"><div class="hand-head"><b>${U.esc(actor?.name || "响应角色")} 的手牌</b><span class="tag">${U.esc(label)}</span>${controls}<span class="muted">${U.esc(tip)}</span></div><div class="hand-body"><div class="hand active-hand" data-hand-owner="${U.esc(actor?.uid || "")}">${cards}</div></div></div>`;
  function counterChoices(b) {
    const p = b.manualCounter, actor = b.enemies.concat(b.allies).find(u => u.uid === p?.actorUid), target = b.allies.find(u => u.uid === p?.targetUid), tactic = p?.card;
    const backflips = (window.SakuraRisaSkills?.backflipCandidates?.(b.allies, actor, target, tactic) || []).map(x => ({ unit: x.unit, card: x.card, responseKind: "backflip" }));
    const counters = b.allies.flatMap(unit => unit.hp > 0 ? unit.hand.filter(card => (card.counterTactic || window.WithererSkills?.canCounterTacticCard?.(unit, card) || window.GuardKellySkills?.canCounterTacticCard?.(unit, card)) && !card._pendingDraw).map(card => ({ unit, card, responseKind: "counter" })) : []);
    return { actor, target, choices: [...backflips, ...counters] };
  }
  function manualCounterHand(b) {
    const { actor: source, choices } = counterChoices(b), selected = Math.max(0, Math.min(b.manualCounter?.selectedIndex || 0, choices.length - 1)), owner = choices[selected]?.unit || choices[0]?.unit || b.allies.find(unit => unit.hp > 0);
    if (!owner) return `<div class="hand-panel response-hand-panel"><span class="muted">等待响应牌。</span></div>`;
    const cards = choices.map((choice, index) => { const label = choice.responseKind === "backflip" ? "后空翻" : choice.card.counterTactic ? choice.card.name : "视为看破"; return `<button class="manual-dodge-card hand-response-card ${index === selected ? "selected" : ""}" data-manual-counter-pick="${index}" aria-label="${U.esc(choice.unit.name)}的${U.esc(label)}"><small class="response-card-owner">${U.esc(choice.unit.name)} · ${U.esc(label)}</small>${U.card(choice.card, false, { actor: choice.unit })}</button>`; }).join("");
    const controls = `<button data-manual-counter-use="1">使用响应牌</button><button class="ghost response-cancel" data-manual-counter-cancel="1">取消</button>`;
    return handPanel(owner, "响应牌", controls, cards, `${source?.name || "敌方"}使用了${b.manualCounter?.card?.name || "战术牌"}；响应牌来自标注角色。`);
  }
  function manualDodgeHand(b) {
    const p = b.manualDodge, actor = b.enemies.concat(b.allies).find(u => u.uid === p?.actorUid), target = b.allies.find(u => u.uid === p?.targetUid);
    if (!p || !target) return "";
    const needKill = p.card?.responseKind === "slash", label = needKill ? "杀" : "闪", verb = needKill ? "打出" : "使用", rule = needKill ? "slash" : { blackDodgeOnly: p.card?.blackDodgeOnly, singleKill: !(p.card?.sweep || p.card?.targetless || p.card?.allTargets || p.card?.aoeLineShown) };
    const choices = target.hand.filter(card => window.CardUtils.canRespondTo(rule, card)), selected = Math.max(0, Math.min(p.deflectStarted ? p.deflectIndex || 0 : p.selectedIndex || 0, choices.length - 1)), locked = !!(p.deflectStarted || p.deflectRequired);
    const cards = choices.map((card, index) => `<button class="manual-dodge-card hand-response-card ${index === selected ? "selected" : ""}" ${locked ? "disabled" : `data-manual-dodge-pick="${index}"`}>${U.card(card, false, { actor: target })}</button>`).join("");
    const selectedCard = choices[selected], use = selectedCard?.deflect ? "" : `<button data-manual-dodge-use="1">${verb}${label}</button>`, cancel = locked ? "" : `<button class="ghost response-cancel" data-manual-dodge-cancel="1">取消</button>`;
    return handPanel(target, "手动响应", `${use}${cancel}`, cards, `${actor?.name || "敌方"}使用了${p.card?.name || "杀"}；选择是否${verb}${label}。`);
  }
  function magicBulletHand(b) {
    const p = b.handReveal;
    if (!["magicBullet", "magicBulletReveal"].includes(p?.mode)) return "";
    const units = b.allies.concat(b.enemies), actor = units.find(u => u.uid === p.actorUid), target = units.find(u => u.uid === p.targetUid), choosingCost = p.mode === "magicBullet", owner = choosingCost ? actor : target, cards = (owner?.hand || []).filter(card => !card._pendingDraw);
    const choices = choosingCost ? cards : window.CardUtils.magicBulletCards(owner);
    const body = choices.map((card, index) => { const valid = !p.validIndexes || p.validIndexes.includes(index); return `<button class="hand-reveal-card hand-response-card ${valid ? "" : "disabled"}" ${valid ? `data-hand-reveal-pick="${index}"` : "disabled"}>${U.card(card, false, { actor: owner, disabled: !valid })}</button>`; }).join("");
    const controls = p.mode === "magicBulletReveal" ? "" : `<button class="ghost response-cancel" data-hand-reveal-close="1">取消</button>`;
    const tip = choosingCost ? `${target?.name || "目标"}展示了${p.shownSuit || ""}${p.shownCard?.name || "手牌"}；选择同花色手牌弃置。` : `${actor?.name || "敌方"}使用魔弹特攻；必须选择一张手牌展示。`;
    return handPanel(owner, "魔弹特攻", controls, body, tip);
  }
  function responseHand(b) {
    if (b.manualDodge) return manualDodgeHand(b);
    if (b.manualCounter) return manualCounterHand(b);
    return magicBulletHand(b);
  }
  function manualDodgePrompt(b) {
    const p = b.manualDodge;
    if (!p) return "";
    const selected = p.deflectStarted ? (p.deflectIndex || 0) : (p.selectedIndex || 0);
    const actor = b.enemies.concat(b.allies).find(u => u.uid === p.actorUid), target = b.allies.find(u => u.uid === p.targetUid);
    const needKill = p.card?.responseKind === "slash";
    const singleKill = !(p.card?.sweep || p.card?.targetless || p.card?.allTargets || p.card?.aoeLineShown);
    const rule = needKill ? "slash" : { blackDodgeOnly: p.card?.blackDodgeOnly, singleKill };
    const dodges = (target?.hand || []).filter(c => window.CardUtils.canRespondTo(rule, c));
    const selectedCard = dodges[Math.max(0, Math.min(selected, dodges.length - 1))];
    if (p.deflectResult) {
      const r = p.deflectResult, title = r.outcome === "tie" ? "平局" : r.outcome === "defender" ? `${target?.name || "守方"}弹反成功` : `${actor?.name || "攻方"}获胜，弹反失败`;
      return `<div class="manual-dodge-overlay"><div class="manual-dodge-box rps-result-box"><h2>弹反猜拳结果</h2>${resultReveal(target?.name || "守方", r.defenderChoice, actor?.name || "攻方", r.actorChoice, title, "data-deflect-result-confirm", r.outcome === "tie" ? "继续猜拳" : "确认结果")}</div></div>`;
    }
    if (!selectedCard?.deflect) return "";
    return `<div class="manual-dodge-overlay hand-response-overlay"><div class="manual-dodge-box"><h2>${p.deflectStarted ? "平局，再次选择手势" : "选择弹反手势"}</h2><p>【${U.esc(actor?.name || "敌方")}】对你使用了</p><b>【${U.esc(p.card?.name || "杀")}】</b>${gestureButtons("data-deflect-choice")}</div></div>`;
  }
  function evilEyePrompt(b) {
    const p = b.risaEyePrompt;
    if (!p) return "";
    const units = b.enemies.concat(b.allies), risa = units.find(u => u.uid === p.risaUids?.[p.index]), target = units.find(u => u.uid === p.targetUid);
    if (p.result) {
      const r = p.result, title = r.outcome === "tie" ? "平局" : r.outcome === "risa" ? `${risa?.name || "丽莎"}获胜` : `${target?.name || "目标"}获胜`;
      return `<div class="manual-dodge-overlay"><div class="manual-dodge-box rps-result-box"><h2>吸魔邪眼猜拳结果</h2>${resultReveal(risa?.name || "丽莎", r.eyeChoice, target?.name || "目标", r.targetChoice, title, "data-risa-eye-result-confirm", r.outcome === "tie" ? "继续猜拳" : "确认结果")}</div></div>`;
    }
    return `<div class="manual-dodge-overlay"><div class="manual-dodge-box"><h2>${p.tied ? "吸魔邪眼：再次选择手势" : "吸魔邪眼：选择手势"}</h2><p>【${U.esc(risa?.name || "丽莎")}】向【${U.esc(target?.name || "目标")}】发起猜拳</p>${gestureButtons("data-risa-eye-choice")}</div></div>`;
  }
  function manualCounterPrompt() {
    return "";
  }
  function handReveal(b) {
    const p = b.handReveal;
    if (!p) { lastHandRevealKey = ""; return ""; }
    if (["magicBullet", "magicBulletReveal", "borrowSlashChoice", "borrowGainChoice"]
      .includes(p.mode)) return "";
    if (b.revealCards || b.animQueue?.some(evt => evt.type === "revealCards")) return "";
    const units = b.allies.concat(b.enemies), actor = units.find(u => u.uid === p.actorUid), target = units.find(u => u.uid === p.targetUid), choosingCost = p.mode === "magicBullet", droneExtract = p.mode === "droneExtract", mandatory = ["magicBulletReveal", "borrowSlashChoice", "borrowGainChoice"].includes(p.mode);
    const cards = ((choosingCost ? actor?.hand : target?.hand) || []).filter(c => !c._pendingDraw), select = p.mode !== "view";
    const key = [p.mode, p.actorUid, p.targetUid, p.cardName, p.shownSuit || "", p.shownCard?.suit || "", p.shownCard?.name || "", cards.length, p.validIndexes?.join(",") || ""].join("|");
    const steady = key === lastHandRevealKey;
    lastHandRevealKey = key;
    const shown = (choosingCost || droneExtract) && p.shownCard ? `<div class="hand-reveal-shown"><span>${U.esc(droneExtract ? actor?.name || "敌方" : target?.name || "目标")}${droneExtract ? "亮出" : "随机展示"}</span>${U.card(p.shownCard, false)}</div>` : "";
    const hideCards = (p.mode === "steal" || p.mode === "discard")
      && actor?.side !== target?.side;
    const body = cards.length ? cards.map((c, i) => { const ok = !p.validIndexes || p.validIndexes.includes(i); return `<button class="hand-reveal-card ${ok ? "" : "disabled"}" ${select && ok ? `data-hand-reveal-pick="${i}"` : ""} title="${hideCards ? "未知手牌" : U.esc(c.text || "")}">${U.card(c, hideCards)}</button>`; }).join("") : `<p class="hand-reveal-empty">无手牌</p>`;
    const title = choosingCost || droneExtract ? `选择弃置${U.esc(p.shownSuit || "同花色")}手牌` : p.mode === "magicBulletReveal" ? `选择展示一张手牌` : `${U.esc(target?.name || "目标")} 的手牌`;
    return `<div class="hand-reveal-overlay"><section class="hand-reveal-panel ${steady ? "steady" : ""}"><h2>${title}</h2><div class="hand-reveal-rose">✦</div>${shown}<div class="hand-reveal-cards">${body}</div>${mandatory ? "" : `<button class="ghost" data-hand-reveal-close="1">关闭</button>`}</section></div>`;
  }
  function recklessPrompt(b) {
    const p = b.recklessPrompt;
    if (!p) return "";
    const actor = b.allies.find(u => u.uid === p.uid), selected = p.selectedIndex || 0;
    const cards = (actor?.hand || []).filter(c => c.reckless && !c._pendingDraw).map((c, i) => `<button class="manual-dodge-card ${i === selected ? "selected" : ""}" data-reckless-pick="${i}">${U.card(c, false)}</button>`).join("");
    return `<div class="manual-dodge-overlay"><div class="manual-dodge-box"><h2>是否打出无谋冲拳？</h2><p>【${U.esc(actor?.name || "角色")}】准备阶段可以打出响应牌</p><b>【无谋冲拳】</b><div class="manual-dodge-cards">${cards}</div><div class="actions"><button data-reckless-use="1">打出</button><button class="ghost" data-reckless-cancel="1">保留</button></div></div></div>`;
  }
  return { responseHand, manualCounterHand, handReveal, manualDodgePrompt, manualCounterPrompt, recklessPrompt, evilEyePrompt };
})();
