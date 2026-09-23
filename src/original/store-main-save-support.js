window.GameStoreMainSaveSupport = ({ key }) => {
  function saveFailure(storage, results = null) {
    const error = new Error("SAVE_FAILED");
    error.code = "SAVE_FAILED";
    error.storage = storage;
    error.results = results;
    return error;
  }

  function staleResult() {
    return {
      key,
      stale: true,
      local: { attempted: false, ok: null },
      cloud: { attempted: false, ok: null },
    };
  }

  function invalidSnapshot() {
    const error = new Error("INVALID_SAVE_STRUCTURE");
    error.code = "INVALID_SAVE_STRUCTURE";
    error.storage = "validation";
    return error;
  }

  return { invalidSnapshot, saveFailure, staleResult };
};
