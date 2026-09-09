window.GameBundles = (() => {
  const state = window.GameBundlesState;
  const {
    load: loadStyle, activate: activateStyles,
  } = window.RuntimeStyleLoader({
    versioned: state.versioned,
    loadedStyles: state.loadedStyles,
    styleLinks: state.styleLinks,
    pendingStyles: state.pendingStyles,
  });
  const { load: loadScript } = window.RuntimeScriptLoader({
    versioned: state.versioned,
    loadedScripts: state.loadedScripts,
    pendingScripts: state.pendingScripts,
    scripts: state.scripts,
    runtimeReady: state.runtimeReady,
  });

  function load(name, context = {}) {
    if (!state.scripts[name]) return Promise.reject(new Error(`Unknown game bundle: ${name}`));
    const hrefs = state.requestedStyles(name, context);
    if (state.isReady(name, context)) {
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

  return { load, ensureState, isReady: state.isReady };
})();
