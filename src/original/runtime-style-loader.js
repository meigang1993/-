window.RuntimeStyleLoader = ({
  versioned, loadedStyles, styleLinks, pendingStyles,
}) => {
  const retryDelay = 160;
  function load(name, href) {
    if (loadedStyles.has(href)) return Promise.resolve(true);
    if (pendingStyles.has(href)) return pendingStyles.get(href);
    const promise = new Promise((resolve, reject) => {
      let retries = 0;
      const attempt = () => {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.media = "not all";
        link.href = versioned(href);
        link.dataset.gameStyle = name;
        link.dataset.gameStyleSource = href;
        styleLinks.set(href, link);
        link.onload = () => {
          loadedStyles.add(href);
          pendingStyles.delete(href);
          resolve(true);
        };
        link.onerror = () => {
          styleLinks.delete(href);
          link.remove();
          if (retries++ < 1) {
            setTimeout(attempt, retryDelay);
            return;
          }
          pendingStyles.delete(href);
          const error = new Error(`${name} style failed to load: ${href}`);
          error.code = "SCENE_STYLE_LOAD_FAILED";
          reject(error);
        };
        const anchor = document.querySelector(`[data-game-style-anchor="${name}"]`);
        document.head.insertBefore(link, anchor || null);
      };
      attempt();
    });
    pendingStyles.set(href, promise);
    return promise;
  }

  function activate(hrefs) {
    hrefs.forEach(href => {
      const link = styleLinks.get(href);
      if (link) link.media = "all";
    });
  }

  return { activate, load };
};
