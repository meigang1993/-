window.UICommonCardArt = ({ esc }) => {
  function bindFallbacks() {
    if (typeof document === "undefined" || window.UICommonCardArt.fallbackBound) {
      return;
    }
    window.UICommonCardArt.fallbackBound = true;
    document.addEventListener("error", event => {
      const image = event.target;
      if (!image?.matches?.(".card-art img[data-card-art-primary]")) return;
      window.GameAssets?.reportFailure?.(image.dataset.cardArtPrimary);
      const fallback = image.dataset.cardArtFallback;
      if (!fallback) {
        image.remove();
        return;
      }
      image.dataset.cardArtPrimary = fallback;
      image.dataset.cardArtFallback = "";
      image.src = fallback;
    }, true);
  }

  function html(card) {
    const primary = window.CardArt?.url(card) || "";
    const failed = url => window.GameAssets?.failed?.(url)
      || window.state?.battle?.assetFailures?.includes?.(url);
    const fallback = window.CardArt?.fallbackUrl?.(card) || "";
    const url = failed(primary) ? (failed(fallback) ? "" : fallback) : primary;
    const fallbackTarget = fallback && fallback !== url && !failed(fallback)
      ? fallback : "";
    const image = url
      ? `<img src="${esc(url)}" data-card-art-primary="${esc(url)}" data-card-art-fallback="${esc(fallbackTarget)}" alt="" loading="eager" decoding="async" draggable="false">`
      : "";
    return `<div class="card-art" aria-hidden="true">${image}</div>`;
  }

  bindFallbacks();
  return { html };
};
