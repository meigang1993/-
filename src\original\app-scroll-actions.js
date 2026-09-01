const interactionScrollSelectors = ".content-panel,.villa-hall .villa-actions,.villa-page-scroll,.codex-scroll,.modal-card,.info-popup,.tower-map,.battle-log,.battle-log-list,.hand-scroll-wrap .hand,.vn-lines,.test-pick-list,.settings-menu";

function selectorForScroll(el) {
  if (el.id) return `#${String(el.id).replace(/([^\w-])/g, "\\$1")}`;
  return interactionScrollSelectors.split(",").find(sel => el.matches?.(sel)) || "";
}
function rememberInteractionScroll() {
  return [...document.querySelectorAll(interactionScrollSelectors)]
    .map((el, i) => [i, selectorForScroll(el), el.scrollTop, el.scrollLeft]);
}
function restoreInteractionScroll(points) {
  const apply = () => [...document.querySelectorAll(interactionScrollSelectors)].forEach((el, i) => {
    const item = points.find(p => p[1] && el.matches?.(p[1]))
      || points.find(p => p[0] === i);
    if (item) {
      if (window.restoreScrollInstant) window.restoreScrollInstant(el, item[2], item[3]);
      else { el.scrollTop = item[2]; el.scrollLeft = item[3]; }
    }
  });
  apply(); requestAnimationFrame(apply); setTimeout(apply, 0);
  setTimeout(apply, 80); setTimeout(apply, 180);
}
function preserveInteractionScroll(done) {
  const points = rememberInteractionScroll();
  window.preserveNextScroll?.(10000);
  const finish = () => {
    restoreInteractionScroll(points);
    setTimeout(() => window.releaseScrollLock?.(), 260);
  };
  try {
    const result = done();
    if (result?.then) return result.finally(finish);
    finish();
    return result;
  } catch (err) {
    finish();
    throw err;
  }
}
function preserveClickedCardScroll(card, attr, value, done) {
  const scrollSel = ".modal-card,.villa-page-scroll,.content-panel,.codex-scroll";
  const scroller = card?.closest?.(scrollSel);
  const beforeTop = scroller
    ? card.getBoundingClientRect().top - scroller.getBoundingClientRect().top : 0;
  const beforeScroll = scroller?.scrollTop || 0;
  window.preserveNextScroll?.(10000);
  const apply = () => {
    const next = [...document.querySelectorAll(`[${attr}]`)]
      .find(el => el.getAttribute(attr) === String(value));
    const nextScroller = next?.closest?.(scrollSel) || document.querySelector(scrollSel);
    if (!nextScroller) return;
    if (next) {
      nextScroller.scrollTop += next.getBoundingClientRect().top
        - nextScroller.getBoundingClientRect().top - beforeTop;
    } else nextScroller.scrollTop = beforeScroll;
  };
  const finish = () => {
    apply(); requestAnimationFrame(apply); setTimeout(apply, 0);
    setTimeout(apply, 80); setTimeout(apply, 180);
    setTimeout(() => window.releaseScrollLock?.(), 260);
  };
  try {
    const result = done();
    if (result?.then) return result.finally(finish);
    finish();
    return result;
  } catch (err) {
    finish();
    throw err;
  }
}
let scrollGuardBound = false;
function bindGlobalScrollGuard() {
  if (scrollGuardBound) return;
  scrollGuardBound = true;
  const interactiveSelector = "button,[role='button'],[data-active-info],[data-art-src],[data-target],.team-card,.relic-slot,.save-slot,.play-card,.skill,.unit-art";
  document.addEventListener("pointerdown", e => {
    if (e.target.closest(interactiveSelector)) window.preserveNextScroll?.();
  }, true);
  document.addEventListener("click", e => {
    if (e.target.closest(interactiveSelector)) window.preserveNextScroll?.();
  }, true);
  document.addEventListener("keydown", e => {
    if (!["Enter", " "].includes(e.key)) return;
    const control = e.target.closest?.("[role='button']");
    if (!control || control.tagName === "BUTTON"
      || e.target.closest?.("button,a[href],input,select,textarea")
      || control.getAttribute("aria-disabled") === "true") return;
    e.preventDefault();
    control.click();
  }, true);
}
