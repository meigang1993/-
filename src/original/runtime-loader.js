window.GameBundles = (() => {
  const buildVersion = document.querySelector('meta[name="game-build"]')?.content || "";
  const scripts = {
    hall: ["./bundles/hall.min.js"],
    battle: [
      "./bundles/battle-rules.min.js",
      "./bundles/battle-skills.min.js",
      "./bundles/battle-flow.min.js",
      "./bundles/battle-ai.min.js",
      "./bundles/battle-presentation.min.js",
      "./bundles/battle-ui.min.js",
    ],
    dungeon: ["./bundles/dungeon.min.js"],
  };
  const styles = {
    battle: window.GameBattleStyles.core,
    dungeon: ["./dungeon.css"],
  };
  const loadedStyles = new Set();
  const styleLinks = new Map();
  const pendingStyles = new Map();
  const pendingScripts = new Map();
  const loadedScripts = new Set();
  const versioned = path => buildVersion
    ? `${path}?v=${encodeURIComponent(buildVersion)}`
    : path;
  // Deferred loaders apply versioned(source) and versioned(href) via this helper.
  const styleLoader = window.RuntimeStyleLoader({
    versioned, loadedStyles, styleLinks, pendingStyles,
  });
  const scriptLoader = window.RuntimeScriptLoader({
    versioned, loadedScripts, pendingScripts, scripts, runtimeReady,
  });

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

  function load(name, context = {}) {
    if (!scripts[name]) return Promise.reject(new Error(`Unknown game bundle: ${name}`));
    const hrefs = requestedStyles(name, context);
    if (isReady(name, context)) {
      styleLoader.activate(hrefs);
      return Promise.resolve(true);
    }
    return Promise.all([
      Promise.all(hrefs.map(href => styleLoader.load(name, href))),
      scriptLoader.load(name),
    ]).then(() => {
      styleLoader.activate(hrefs);
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
