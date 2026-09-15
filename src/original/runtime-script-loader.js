window.RuntimeScriptLoader = ({
  versioned, loadedScripts, pendingScripts, scripts, runtimeReady,
}) => {
  function loadPart(name, source) {
    if (loadedScripts.has(source)) return Promise.resolve(true);
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = versioned(source);
      script.async = false;
      script.dataset.gameBundle = name;
      script.dataset.gameBundlePart = source;
      script.onload = () => {
        loadedScripts.add(source);
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

  function reset(name) {
    scripts[name].forEach(source => loadedScripts.delete(source));
    document.querySelectorAll(`script[data-game-bundle="${name}"]`)
      .forEach(script => script.remove());
  }

  function load(name) {
    if (runtimeReady(name)) return Promise.resolve(true);
    if (pendingScripts.has(name)) return pendingScripts.get(name);
    const promise = scripts[name].reduce(
      (chain, source) => chain.then(() => loadPart(name, source)),
      Promise.resolve(),
    ).then(() => {
      if (!runtimeReady(name)) {
        reset(name);
        const error = new Error(`${name} bundles loaded without their runtime`);
        error.code = "BUNDLE_INVALID";
        throw error;
      }
      return true;
    }).finally(() => pendingScripts.delete(name));
    pendingScripts.set(name, promise);
    return promise;
  }

  return { load };
};
