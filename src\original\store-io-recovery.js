window.GameStoreIORecovery = deps => {
  const { getRawDetails, putRaw } = deps;

  function clone(value) {
    if (value == null) return null;
    return typeof structuredClone === "function"
      ? structuredClone(value)
      : JSON.parse(JSON.stringify(value));
  }

  async function captureRaw(key, opts = {}) {
    const details = await getRawDetails(key, {
      ...opts,
      strictCloud: true,
      allowLocalOnCloudFailure: false,
    });
    return { key, value: clone(details.selected) };
  }

  async function restoreRaw(capture, opts = {}) {
    if (!capture?.value) return false;
    const data = clone(capture.value);
    await putRaw(capture.key, data, { ...opts, flush: true });
    return data;
  }

  return { captureRaw, restoreRaw };
};
