window.GameBundles = (() => {
  const state = window.GameBundlesState;
  const { loadStyle, activateStyles } = window.GameBundlesStyles;
  const { loadScript } = window.GameBundlesScripts;

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
