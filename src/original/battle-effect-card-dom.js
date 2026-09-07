window.BattleEffectCardDOM = (() => {
  const esc = value => String(value ?? "").replace(/[&<>"]/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;",
  }[char]));
  const failed = url => window.GameAssets?.failed?.(url)
    || window.state?.battle?.assetFailures?.includes?.(url);
  const typeClass = card => {
    const type = String(card?.type || "tactic");
    return ["slash", "response", "tactic", "consume", "obstacle", "status"].includes(type)
      ? type : "tactic";
  };
  const faceLabel = card => window.CardArt?.isSkill?.(card) ? "技能"
    : card?.type === "response" ? "响应"
      : card?.type === "consume" ? "消耗"
        : card?.type === "obstacle" ? "障碍"
        : card?.type === "status" ? "状态" : "出牌";
  function artData(card) {
    const primary = window.CardArt?.url(card) || "";
    const fallback = window.CardArt?.fallbackUrl?.(card) || "";
    const url = failed(primary) ? (failed(fallback) ? "" : fallback) : primary;
    return {
      url,
      fallback: fallback && fallback !== url && !failed(fallback) ? fallback : "",
    };
  }
  function bindArt(shell) {
    const image = shell.querySelector(".card-art img");
    if (!image) {
      shell.cardArtReady = Promise.resolve(false);
      return;
    }
    shell.cardArtReady = new Promise(resolve => {
      let settled = false;
      const finish = value => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      const loaded = () => finish(image.complete && image.naturalWidth > 0);
      const failedLoad = () => {
        const current = image.dataset.flightArtPrimary || image.getAttribute("src");
        window.GameAssets?.reportFailure?.(current);
        const fallback = image.dataset.flightArtFallback;
        if (fallback && fallback !== current && !failed(fallback)) {
          image.dataset.flightArtPrimary = fallback;
          image.dataset.flightArtFallback = "";
          image.src = fallback;
          return;
        }
        image.remove();
        finish(false);
      };
      image.addEventListener("load", loaded);
      image.addEventListener("error", failedLoad);
      if (image.complete) queueMicrotask(
        () => image.naturalWidth > 0 ? loaded() : failedLoad());
    });
  }
  function ready(shell, timeout = 1000) {
    const pending = shell?.cardArtReady;
    if (!pending?.then) return Promise.resolve(false);
    return Promise.race([
      pending,
      new Promise(resolve => setTimeout(() => resolve(false), timeout)),
    ]);
  }

  function create(card = {}, options = {}) {
    const enemy = !!options.enemy;
    const faceDown = options.face === "back";
    const shell = document.createElement("div");
    const extra = String(options.className || "").trim();
    const art = artData(card);
    const artClass = window.CardArt?.className(card) || "";
    const suit = card.suit || (window.CardArt?.isSkill?.(card) ? "✦" : "");
    shell.className = [
      "flying-card", "card-flight", faceDown ? "is-back" : "is-front",
      enemy ? "enemy-flying" : "", extra,
    ].filter(Boolean).join(" ");
    shell.dataset.cardFace = faceDown ? "back" : "front";
    shell.innerHTML = `
      <div class="card-flight-inner">
        <div class="card-flight-side card-flight-front play-card ${typeClass(card)} ${window.UICommon?.suitClass?.(card.suit) || ""} ${artClass}">
          <div class="card-title"><span class="card-suit">${esc(suit)}</span><b>${esc(card.name || "技能")}</b></div>
          <div class="card-art" aria-hidden="true">${art.url
            ? `<img src="${esc(art.url)}" data-flight-art-primary="${esc(art.url)}" data-flight-art-fallback="${esc(art.fallback)}" alt="" loading="eager" decoding="async" draggable="false">`
            : ""}</div>
          <div class="card-footer"><span class="card-type">${esc(faceLabel(card))}</span><small class="card-effect">${esc(card.text || "")}</small></div>
        </div>
        <div class="card-flight-side card-flight-back" aria-hidden="true"></div>
      </div>`;
    bindArt(shell);
    document.body.appendChild(shell);
    return shell;
  }

  const front = (card, enemy = false, className = "") =>
    create(card, { face: "front", enemy, className });
  const back = (card, enemy = false, className = "") =>
    create(card, { face: "back", enemy, className });

  return { back, create, front, ready };
})();
