window.GameBundlesState = (() => {
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

  return {
    scripts, styles, loadedStyles, styleLinks, pendingStyles,
    pendingScripts, loadedScripts, STYLE_RETRY_DELAY_MS,
    versioned, runtimeReady, requestedStyles, isReady,
  };
})();
