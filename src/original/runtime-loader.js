window.GameBundles = (() => {
  const buildVersion = document.querySelector('meta[name="game-build"]')?.content || "";
  const scripts = {
    hall: "./bundles/hall.min.js",
    battle: "./bundles/battle.min.js",
    dungeon: "./bundles/dungeon.min.js",
  };
  const styles = {
    battle: window.GameBattleStyles.core,
    dungeon: ["./dungeon.css"],
  };
  const loadedStyles = new Set();
  const styleLinks = new Map();
  const pendingStyles = new Map();
  const pendingScripts = new Map();
  const STYLE_RETRY_DELAY_MS = 160;
  const versioned = path => buildVersion
    ? `${path}?v=${encodeURIComponent(buildVersion)}`
    : path;

  function runtimeReady(name) {
    if (name === "hall") return !!window.VillaCollectionUI;
    if (name === "battle") return !!window.BattleSystem;
    if (name === "dungeon") return !!window.DungeonSystem;
    return false;
  }

  function requestedStyles(name, context) {
    const optional = name === "battle"
      ? window.GameBattleStyles.optionalFor(context)
      : [];
    return [...new Set([...(styles[name] || []), ...optional])];
  }

  function isReady(name, context) {
    return runtimeReady(name)
      && requestedStyles(name, context).every(href => loadedStyles.has(href));
  }

  function loadStyle(name, href) {
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
          if (retries < 1) {
            retries += 1;
            setTimeout(attempt, STYLE_RETRY_DELAY_MS);
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

  function activateStyles(hrefs) {
    hrefs.forEach(href => {
      const link = styleLinks.get(href);
      if (link) link.media = "all";
    });
  }

  function loadScript(name) {
    if (runtimeReady(name)) return Promise.resolve(true);
    if (pendingScripts.has(name)) return pendingScripts.get(name);
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = versioned(scripts[name]);
      script.async = true;
      script.dataset.gameBundle = name;
      script.onload = () => {
        pendingScripts.delete(name);
        if (!runtimeReady(name)) {
          script.remove();
          const error = new Error(`${name} bundle loaded without its runtime`);
          error.code = "BUNDLE_INVALID";
          reject(error);
          return;
        }
        resolve(true);
      };
      script.onerror = () => {
        pendingScripts.delete(name);
        script.remove();
        const error = new Error(`${name} bundle failed to load`);
        error.code = "BUNDLE_LOAD_FAILED";
        reject(error);
      };
      document.head.append(script);
    });
    pendingScripts.set(name, promise);
    return promise;
  }

  function load(name, context = {}) {
    if (!scripts[name]) return Promise.reject(new Error(`Unknown game bundle: ${name}`));
    const hrefs = requestedStyles(name, context);
    if (isReady(name, context)) {
      activateStyles(hrefs);
      return Promise.resolve(true);
    }
    return Promise.all([
      Promise.all(hrefs.map(href => loadStyle(name, href))),
      loadScript(name),
    ]).then(() => {
      activateStyles(hrefs);
      return true;
    });
  }

  async function ensureState(nextState) {
    await load("hall");
    const needsDungeon = nextState?.explore
      || nextState?._pendingSettlementActions?.length
      || ["dungeon", "dungeonConfirm"].includes(nextState?.view);
    if (needsDungeon) await load("dungeon");
    if (nextState?.battle || ["battle", "battleLoading"].includes(nextState?.view)) {
      await load("battle", { state: nextState });
    }
    return true;
  }

  return { load, ensureState, isReady };
})();
