function bindCardDrag(card) {
  card.onpointerdown = e => {
    if (state.battle?.locked || state.battle?.newMoonShare || state.battle?.millerShare || state.battle?.phase !== 4 || BattleEffects.animating || state.battle?.selectedSkillCard?.elranaBag || state.battle?.selectedSkillCard?.elranaHeal || card.classList.contains("disabled")) return;
    const start = { x: e.clientX, y: e.clientY }, index = Number(card.dataset.cardIndex); let ghost = null, dragging = false, target = null;
    const move = ev => {
      const dist = Math.hypot(ev.clientX - start.x, ev.clientY - start.y);
      if (!dragging && dist > 5) { if (state.battle?.selectedCardIndex !== index && !BattleSystem.selectCard(state, index)) return; dragging = true; card.dataset.dragged = "1"; card.classList.add("selected", "drag-source"); ghost = card.cloneNode(true); ghost.classList.remove("selected", "drag-source"); ghost.classList.add("drag-ghost"); document.body.appendChild(ghost); document.body.classList.add("card-dragging"); }
      if (!dragging) return;
      ev.preventDefault(); ghost.style.left = `${ev.clientX}px`; ghost.style.top = `${ev.clientY}px`; ghost.style.display = "none";
      const activeCard = BattleSystem.active(state.battle)?.hand[index], selector = activeCard?.allyTarget ? ".ally-unit .unit-art" : ".enemy-unit .unit-art";
      const art = document.elementFromPoint(ev.clientX, ev.clientY)?.closest(selector); ghost.style.display = "";
      const uid = art?.closest("[data-target]")?.dataset.target;
      if (uid !== target) { target = uid || null; target ? BattleEffects.choose(state, target) : BattleEffects.clearTarget(state); }
    };
    const up = async ev => {
      document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up); ghost?.remove(); card.classList.remove("drag-source"); document.body.classList.remove("card-dragging");
      const actor = BattleSystem.active(state.battle), activeCard = actor?.hand[index], outsideHand = !document.elementFromPoint(ev.clientX, ev.clientY)?.closest(".hand-panel");
      if (dragging && activeCard?.allyTarget && outsideHand && !target) BattleEffects.choose(state, actor.uid);
      if (dragging && (target || (activeCard?.allyTarget && outsideHand) || (activeCard?.targetless && outsideHand))) await playSelectedCard();
      else if (dragging) { BattleSystem.cancelSelection(state); BattleEffects.clearTarget(state); render(); }
      setTimeout(() => { delete card.dataset.dragged; }, 0);
    };
    document.addEventListener("pointermove", move, { passive: false }); document.addEventListener("pointerup", up, { once: true });
  };
}
