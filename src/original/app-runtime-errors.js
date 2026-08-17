window.AppRuntimeErrors = (() => {
  let currentError = null;
  let recovering = false;
  let generation = 0;
  const recovery = window.AppRuntimeRecovery;
  const attempt = recovery.attempt;
  const hasBlockingBattlePrompt = recovery.hasBlockingBattlePrompt;
  const read = (error, key) => {
    try { return error?.[key]; }
    catch (_) { return null; }
  };
  const text = (value, fallback = "") => {
    try { return value == null ? fallback : String(value); }
    catch (_) { return fallback; }
  };

  function record(error, source) {
    const fallbackCode = source === "unhandledrejection"
      ? "RUNTIME_UNHANDLED_REJECTION" : "RUNTIME_ERROR";
    return {
      source,
      code: text(read(error, "code") || fallbackCode, fallbackCode),
      message: text(read(error, "message")
        || (typeof error === "string" ? error : "Unexpected runtime failure"),
      "Unexpected runtime failure"),
      stack: text(read(error, "stack") || read(error, "serverStack")
        || read(error, "userStack")),
    };
  }

  function reportRecoveryFailure(label, error) {
    try {
      console.error(`${label}:`, read(error, "code"), read(error, "message"),
        read(error, "stack"));
    } catch (_) {}
  }

  function retry() {
    currentError = null;
    attempt("runtime error dialog removal failed",
      () => window.AppRuntimeErrorDialog.remove(false));
    try {
      render();
      attempt("runtime error focus restoration failed",
        () => window.AppRuntimeErrorDialog.restore());
    }
    catch (error) { capture(error, "retry-render"); }
  }

  function guard(expectedState = window.state) {
    const runGeneration = generation;
    return () => runGeneration === generation
      && (expectedState === null || window.state === expectedState);
  }

  function capture(error, source = "unhandledrejection") {
    if (recovering) {
      reportRecoveryFailure("recursive runtime boundary failure", error);
      return;
    }
    recovering = true;
    try {
      generation += 1;
      currentError = record(error, source);
      reportRecoveryFailure("runtime error boundary", currentError);
      attempt("runtime state recovery failed", recovery.recoverState);
      const shown = attempt("runtime error dialog failed",
        () => window.AppRuntimeErrorDialog.show(currentError, retry));
      if (!shown) {
        attempt("runtime emergency dialog failed",
          () => window.AppRuntimeErrorDialog.emergency(currentError, retry));
      }
    } finally {
      recovering = false;
    }
  }

  const current = () => currentError ? { ...currentError } : null;
  const bind = () => window.AppRuntimeErrorDialog.bind(retry);
  const handleKeydown = event => !!currentError
    && window.AppRuntimeErrorDialog.handleKeydown(event);
  const markup = () => window.AppRuntimeErrorDialog.markup(currentError);
  return {
    bind, capture, current, guard, handleKeydown, hasBlockingBattlePrompt,
    markup, retry,
  };
})();

window.addEventListener("error", event => {
  if (isActiveBoot(bootAttempt)) {
    event.preventDefault();
    failBoot(event.error || new Error(event.message || "Game failed to start"), bootAttempt);
    return;
  }
  if (!bootReadyReported) return;
  event.preventDefault();
  window.AppRuntimeErrors.capture(event.error || new Error(event.message), "error");
});

window.addEventListener("unhandledrejection", event => {
  if (isActiveBoot(bootAttempt)) {
    event.preventDefault();
    failBoot(event.reason, bootAttempt);
    return;
  }
  if (!bootReadyReported) return;
  event.preventDefault();
  window.AppRuntimeErrors.capture(event.reason, "unhandledrejection");
});
