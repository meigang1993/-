window.GameBundlesStyles = (() => {
  const state = window.GameBundlesState;

  function loadStyle(name, href) {
    if (state.loadedStyles.has(href)) return Promise.resolve(true);
    if (state.pendingStyles.has(href)) return state.pendingStyles.get(href);
    const promise = new Promise((resolve, reject) => {
      let retries = 0;
      const attempt = () => {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.media = "not all";
        link.href = state.versioned(href);
        link.dataset.gameStyle = name;
        link.dataset.gameStyleSource = href;
        state.styleLinks.set(href, link);
        link.onload = () => {
          state.loadedStyles.add(href);
          state.pendingStyles.delete(href);
          resolve(true);
        };
        link.onerror = () => {
          state.styleLinks.delete(href);
          link.remove();
          if (retries < 1) {
            retries += 1;
            setTimeout(attempt, state.STYLE_RETRY_DELAY_MS);
            return;
          }
          state.pendingStyles.delete(href);
          const error = new Error(`${name} style failed to load: ${href}`);
          error.code = "SCENE_STYLE_LOAD_FAILED";
          reject(error);
        };
        const anchor = document.querySelector(`[data-game-style-anchor="${name}"]`);
        document.head.insertBefore(link, anchor || null);
      };
      attempt();
    });
    state.pendingStyles.set(href, promise);
    return promise;
  }

  function activateStyles(hrefs) {
    hrefs.forEach(href => {
      const link = state.styleLinks.get(href);
      if (link) link.media = "all";
    });
  }

  return { loadStyle, activateStyles };
})();
