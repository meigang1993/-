window.GameStoreSlotsData = ({ main }) => {
  const { key, slotKey, slotIds, validSlotId, getRawDetails, putRawDetailed, delRaw } = window.GameStoreIO;
  const { load, requireReadable, inspectCopy, prepareSaveSnapshot, queueMainSave } = main;
  const reads = window.GameStoreSlotReads({
    key, slotKey, slotIds, validSlotId, getRawDetails,
    load, requireReadable, inspectCopy,
  });
  let pendingSave = null;
  function requiredCopies(results) {
    return [results?.slot, results?.main].flatMap(group => {
      if (!group) return [{ attempted: true, ok: false }];
      if (group.stale) return [];
      const required = group.cloud?.attempted ? group.cloud : group.local;
      return required?.attempted ? [required] : [];
    });
  }
  function anyCopySaved(results) {
    return [results?.slot?.local, results?.slot?.cloud, results?.main?.local, results?.main?.cloud]
      .some(copy => copy?.attempted && copy.ok);
  }
  function groupSaved(group) { if (!group || group.stale) return !!group?.stale;
    const required = group.cloud?.attempted ? group.cloud : group.local;
    return !!required?.attempted && required.ok; }
  function compareMeta(left, right) {
    const version = Number(left?._saveVersion || 0) - Number(right?._saveVersion || 0);
    return version || Number(left?.updatedAt || 0) - Number(right?.updatedAt || 0);
  }
  async function writeSaveTransaction(id, data, previous = null) {
    let slot = groupSaved(previous?.slot) ? previous.slot : null;
    if (!slot) {
      slot = await putRawDetailed(slotKey(id), data, { flush: true });
      if (!groupSaved(slot)) {
        const error = new Error("SAVE_FAILED");
        error.code = "SAVE_FAILED";
        error.results = { slot, main: previous?.main || null };
        error.recoverable = false;
        throw error;
      }
    }
    let mainResults = groupSaved(previous?.main) ? previous.main : null;
    if (!mainResults) {
      try {
        mainResults = await queueMainSave(data, { flush: true });
      } catch (error) {
        mainResults = error.results;
      }
    }
    const results = { slot, main: mainResults };
    const attempted = requiredCopies(results);
    if (attempted.length && attempted.every(copy => copy.ok)) return { status: "complete", results };
    const saved = anyCopySaved(results);
    const error = new Error(saved ? "SAVE_PARTIAL" : "SAVE_FAILED");
    error.code = error.message;
    error.results = results;
    error.recoverable = saved;
    throw error;
  }
  async function saveSlotNow(id, state) {
    id = validSlotId(id);
    pendingSave = null;
    const previousSlot = state.currentSaveSlot;
    const previousUpdatedAt = state.updatedAt;
    const previousVersion = state._saveVersion;
    let data = null;
    try {
      state.currentSaveSlot = id;
      data = prepareSaveSnapshot(state);
      const result = await writeSaveTransaction(id, data);
      pendingSave = null;
      return result;
    } catch (error) {
      if (data) pendingSave = { id, data, results: error.results };
      if (!error.recoverable) {
        state.currentSaveSlot = previousSlot;
        state.updatedAt = previousUpdatedAt;
        state._saveVersion = previousVersion;
      }
      throw error;
    }
  }
  async function retrySlotSaveNow(state) {
    if (!pendingSave) return { status: "complete", results: null };
    const transaction = pendingSave;
    let result;
    try {
      result = await writeSaveTransaction(transaction.id, transaction.data, transaction.results);
    } catch (error) {
      pendingSave = { ...transaction, results: error.results };
      throw error;
    }
    if (compareMeta(state, transaction.data) <= 0) {
      state.currentSaveSlot = transaction.id;
      state.updatedAt = transaction.data.updatedAt;
      state._saveVersion = transaction.data._saveVersion;
    }
    pendingSave = null; return result;
  }
  async function deleteSlotNow(id) {
    id = validSlotId(id); await delRaw(slotKey(id));
    if (pendingSave?.id === id) pendingSave = null;
  }
  const queue = window.GameStorePauseQueue(task => {
    if (task.method === "save") return saveSlotNow(task.id, task.state);
    if (task.method === "retry") return retrySlotSaveNow(task.state);
    if (task.method === "delete") return deleteSlotNow(task.id);
    throw new Error("invalid slot task");
  });
  const saveSlot = (id, state) => queue.enqueue({ method: "save", id, state });
  const retrySlotSave = state => queue.enqueue({ method: "retry", state });
  const deleteSlot = id => queue.enqueue({ method: "delete", id });
  const status = () => ({ pending: !!pendingSave, id: pendingSave?.id || null, results: pendingSave?.results || null });
  return {
    ...reads, saveSlot, retrySlotSave, deleteSlot, status,
    pause: queue.pause,
    resume: queue.resume,
  };
};
