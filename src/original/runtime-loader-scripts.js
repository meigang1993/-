window.GameBundlesScripts = (() => {
  const state = window.GameBundlesState;

  function loadScriptPart(name, source) {
    if (state.loadedScripts.has(source)) return Promise.resolve(true);
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = state.versioned(source);
      script.async = false;
      script.dataset.gameBundle = name;
      script.dataset.gameBundlePart = source;
      script.onload = () => {
        state.loadedScripts.add(source);
        resolve(true);
      };
      script.onerror = () => {
        script.remove();
        const error = new Error(`${name} bundle part failed to load: ${source}`);
        error.code = "BUNDLE_LOAD_FAILED";
        reject(error);
      };
      document.head.append(script);
    });
  }

  function resetScriptParts(name) {
    state.scripts[name].forEach(source => state.loadedScripts.delete(source));
    document.querySelectorAll(`script[data-game-bundle="${name}"]`).forEach(script => script.remove());
  }

  function loadScript(name) {
    if (state.runtimeReady(name)) return Promise.resolve(true);
    if (state.pendingScripts.has(name)) return state.pendingScripts.get(name);
    const promise = state.scripts[name].reduce(
      (chain, source) => chain.then(() => loadScriptPart(name, source)),
      Promise.resolve()
    ).then(() => {
      if (!state.runtimeReady(name)) {
        resetScriptParts(name);
        const error = new Error(`${name} bundles loaded without their runtime`);
        error.code = "BUNDLE_INVALID";
        throw error;
      }
      return true;
    }).finally(() => state.pendingScripts.delete(name));
    state.pendingScripts.set(name, promise);
    return promise;
  }

  return { loadScript };
})();
