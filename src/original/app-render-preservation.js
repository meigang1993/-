const repeatableEntryAnimations = [
  [".villa-modal", "fadeIn"], [".modal-card", "modalIn"],
  [".dungeon-screen", "dungeonRise"], [".judgement-popup", "judgePop"],
  [".judge-card-wrap", "judgeFlip"], [".reveal-card-wrap", "judgeFlip"],
  [".clash-popup", "popIn"], [".reveal-popup", "revealPopIn"],
  [".defeat-card", "popIn"],
  [".slot-card", "popIn"],
  [".manual-dodge-box", "popIn"],
  [".hand-reveal-panel", "popIn"],
  [".slot-reels span", "slotBounce"],
  [".battle-log-panel", "battleLogIn"],
  [".victory-stats", "modalIn"],
  [".credits-overlay", "credits-dim"],
  [".credits-panel", "credits-slide-in"],
];
const {
  preserveControlFocus,
  preserveModalFocus,
} = window.AppRenderFocusPreservation;
function preserveMedia(root) {
  const cache = new Map(), keep = selector => root?.querySelectorAll?.(selector).forEach(media => {
    if (media.tagName === "IMG" && media.complete && !media.naturalWidth || media.error) return;
    const key = media.outerHTML, list = cache.get(key) || [];
    list.push({ media, playing: media.tagName === "VIDEO" && !media.paused });
    cache.set(key, list); media.remove();
  });
  keep(".team-card .portrait, .party-avatar .portrait"); keep("img, video");
  return () => {
    const restore = selector => root?.querySelectorAll?.(selector).forEach(media => {
      const list = cache.get(media.outerHTML), kept = list?.shift();
      if (!kept) return;
      media.replaceWith(kept.media);
      if (kept.playing) kept.media.play?.().catch?.(() => {});
    });
    restore(".team-card .portrait, .party-avatar .portrait"); restore("img, video");
  };
}
function repeatedAnimations(root) {
  return repeatableEntryAnimations.filter(([selector]) => root?.querySelector?.(selector));
}
function finishRepeatedAnimations(root, repeated) {
  if (!repeated.length) return;
  void root.offsetHeight;
  repeated.forEach(([selector, name]) => {
    root.querySelectorAll(selector).forEach(element => {
      (element.getAnimations?.() || []).filter(animation => animation.animationName === name).forEach(animation => {
        animation.currentTime = animation.effect.getComputedTiming().endTime;
        animation.pause();
      });
    });
  });
}
// 死亡动画跨整屏重建续播。
//
// 背景：ui-battle-units 在单位死亡且 deathAnimationPending 期间持续挂
//   death-anim，而 app-render 用 setHTML 整块重建 DOM —— 死亡结算往往伴随
//   多条日志/状态变化，同一次死亡会触发多次 render，于是 deathFade 每次都
//   从 0% 重新播放（实测 3 次），视觉上就是死亡动画反复抽搐。
//
// 不能走 repeatableEntryAnimations：那条路径是"重建后直接把动画跳到末尾并
//   暂停"，用于入场动画；死亡动画必须完整播完，否则玩家看不到渐隐过程。
//
// 做法与 preserveCaptionProgress 同构：按单位 uid 记录重建瞬间的 currentTime，
//   新 DOM 挂载后写回，动画从中断处继续，全程只播一次。
function preserveDeathAnim(root) {
  const cache = new Map();
  root?.querySelectorAll?.(".unit.death-anim").forEach(element => {
    const uid = element.dataset?.target;
    if (uid == null) return;
    const animation = (element.getAnimations?.() || [])
      .find(item => item.animationName === "deathFade");
    const time = animation?.currentTime;
    if (time == null) return;
    cache.set(uid, time);
  });
  return () => {
    if (!cache.size) return;
    void root.offsetHeight;
    root.querySelectorAll(".unit.death-anim").forEach(element => {
      const time = cache.get(element.dataset?.target);
      if (time == null) return;
      const animation = (element.getAnimations?.() || [])
        .find(item => item.animationName === "deathFade");
      // 首次死亡的单位没有旧记录，从头播；已播过的从中断处续。
      if (animation) animation.currentTime = time;
    });
  };
}
function preserveCaptionProgress(root) {
  const cache = new Map();
  root?.querySelectorAll?.(".skill-caption").forEach(element => {
    const list = cache.get(element.outerHTML) || [];
    list.push((element.getAnimations?.() || []).map(animation => ({
      name: animation.animationName, time: animation.currentTime, paused: animation.playState === "paused",
    })));
    cache.set(element.outerHTML, list);
  });
  return () => {
    if (!cache.size) return;
    void root.offsetHeight;
    root.querySelectorAll(".skill-caption").forEach(element => {
      const saved = cache.get(element.outerHTML)?.shift();
      saved?.forEach(item => {
        const animation = (element.getAnimations?.() || []).find(next => next.animationName === item.name);
        if (!animation || item.time == null) return;
        animation.currentTime = item.time;
        if (item.paused) animation.pause();
      });
    });
  };
}
function preserveHandSelection(root) {
  const hand = root?.querySelector?.(".active-hand");
  if (!hand) return () => {};
  const owner = hand.dataset.handOwner || "";
  const selected = new Set([...hand.querySelectorAll(".play-card.selected[data-card-index]")]
    .map(card => card.dataset.cardIndex));
  return () => {
    const nextHand = root?.querySelector?.(".active-hand");
    if (!nextHand || nextHand.dataset.handOwner !== owner) return;
    nextHand.querySelectorAll(".play-card[data-card-index]").forEach(card => {
      const wasSelected = selected.has(card.dataset.cardIndex);
      if (wasSelected && card.classList.contains("selected")) card.classList.add("selection-stable");
      else if (wasSelected) card.classList.add("selection-returning");
    });
  };
}
function setHTML(el, html) {
  if (!el || el.innerHTML === html) return false;
  const repeated = repeatedAnimations(el);
  const restoreCaptions = preserveCaptionProgress(el);
  const restoreDeathAnim = preserveDeathAnim(el);
  const restoreMedia = el.dataset?.skipMediaPreservation === "1"
    ? () => {}
    : preserveMedia(el);
  const restoreHandSelection = preserveHandSelection(el);
  const restoreFocus = preserveControlFocus(el);
  const restoreModalFocus = preserveModalFocus(el);
  el.innerHTML = html;
  restoreHandSelection();
  restoreMedia();
  restoreCaptions();
  restoreDeathAnim();
  restoreFocus();
  restoreModalFocus();
  finishRepeatedAnimations(el, repeated);
  return true;
}
