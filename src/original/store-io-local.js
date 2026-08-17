window.GameStoreLocalIO = (() => {
  const { limits, serializedBytes, validateRaw } = window.GameStoreSaveLimits;
  let localStorageCache;

  function localStore() {
    if (localStorageCache !== undefined) return localStorageCache;
    try { localStorageCache = window.localStorage || null; }
    catch (_) { localStorageCache = null; }
    return localStorageCache;
  }

  function getLocalDetails(key) {
    try {
      const raw = localStore()?.getItem(key);
      if (!raw) return { value: null, exists: false, corrupt: false };
      if (serializedBytes(raw) > limits.bytes) {
        return { value: null, exists: true, corrupt: true, error: new Error("SAVE_TOO_LARGE") };
      }
      try {
        const value = JSON.parse(raw);
        if (!validateRaw(value)) throw new Error("INVALID_SAVE_STRUCTURE");
        return { value, exists: true, corrupt: false };
      } catch (error) {
        return { value: null, exists: true, corrupt: true, error };
      }
    } catch (error) {
      return { value: null, exists: false, corrupt: false, unavailable: true, error };
    }
  }

  function putLocalRaw(key, value, options = {}) {
    try {
      const storage = localStore();
      if (!storage || !validateRaw(value)) return false;
      storage.setItem(key, JSON.stringify(value));
      return true;
    } catch (_) {
      return false;
    }
  }

  function removeLocalRaw(key) {
    try {
      const storage = localStore();
      if (!storage) return { ok: false, unavailable: true, error: new Error("LOCAL_DELETE_UNAVAILABLE") };
      storage.removeItem(key);
      return { ok: true };
    } catch (error) {
      return { ok: false, error };
    }
  }

  return { getLocalDetails, putLocalRaw, removeLocalRaw };
})();
