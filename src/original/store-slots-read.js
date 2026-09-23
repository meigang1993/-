window.GameStoreSlotReads = deps => {
  const {
    key, slotKey, slotIds, validSlotId, getRawDetails,
    load, requireReadable, inspectCopy,
  } = deps;

  function inspectDetails(details) {
    const local = details.localCorrupt
      ? { data: null, summary: null, corrupt: true, error: details.localError }
      : inspectCopy(details.local);
    const cloud = details.cloudCorrupt
      ? { data: null, summary: null, corrupt: true, error: details.cloudInvalidError }
      : inspectCopy(details.cloud);
    return { local, cloud };
  }

  function chooseCopy(details, copies, source = null) {
    let selectedSource = source || details.source;
    let selected = selectedSource === "local" ? copies.local : copies.cloud;
    if (!source && !selected.data) {
      const alternateSource = selectedSource === "local" ? "cloud" : "local";
      const alternate = alternateSource === "local" ? copies.local : copies.cloud;
      if (alternate.data) {
        selected = alternate;
        selectedSource = alternateSource;
      }
    }
    return { selected, selectedSource };
  }

  function describeSlot(id, details, automatic = false) {
    const copies = inspectDetails(details);
    const { selected, selectedSource } = chooseCopy(details, copies);
    [copies.local, copies.cloud].filter(copy => copy.error)
      .forEach(copy => console.warn("slot copy invalid:", copy.error.message));
    return {
      id, automatic, summary: selected.summary,
      corrupt: !!((details.localExists || details.cloudExists) && !selected.data),
      conflict: details.conflict, selectedSource,
      localSummary: copies.local.summary, cloudSummary: copies.cloud.summary,
      localCorrupt: copies.local.corrupt, cloudCorrupt: copies.cloud.corrupt,
      cloudUnknown: details.cloudReadFailed,
      localAvailable: !!copies.local.data, cloudAvailable: !!copies.cloud.data,
    };
  }

  async function getSlots() {
    const entries = [{ id: "auto", automatic: true, storageKey: key }]
      .concat(slotIds.map(id => ({ id, automatic: false, storageKey: slotKey(id) })));
    const data = await Promise.all(entries.map(async entry => ({
      ...entry,
      details: requireReadable(await getRawDetails(entry.storageKey, {
        strictCloud: true, allowLocalOnCloudFailure: true,
      })),
    })));
    return data.map(entry => describeSlot(entry.id, entry.details, entry.automatic));
  }

  async function loadAuto(source = null) {
    if (!source) return load();
    if (source !== "local" && source !== "cloud") throw new Error("无效的存档副本来源");
    const details = requireReadable(await getRawDetails(key, {
      strictCloud: true, allowLocalOnCloudFailure: true,
    }));
    const copies = inspectDetails(details);
    if (source === "cloud" && details.cloudReadFailed) throw details.cloudError;
    const { selected } = chooseCopy(details, copies, source);
    if (selected.corrupt) throw new Error(`${source === "local" ? "本地" : "云端"}自动存档副本损坏`);
    if (!selected.data) throw new Error(`${source === "local" ? "本地" : "云端"}自动存档副本不存在`);
    const loaded = selected.data;
    if (details.cloudReadFailed) Object.defineProperty(loaded, "__slotCloudUnknown",
      { value: true, configurable: true });
    return loaded;
  }

  async function loadSlot(id, source = null) {
    id = validSlotId(id);
    if (source && source !== "local" && source !== "cloud") throw new Error("无效的存档副本来源");
    const details = requireReadable(await getRawDetails(slotKey(id), {
      strictCloud: true, allowLocalOnCloudFailure: true,
    }));
    const copies = inspectDetails(details);
    if (source === "cloud" && details.cloudReadFailed) throw details.cloudError;
    let chosen = source === "local" ? copies.local
      : source === "cloud" ? copies.cloud
        : details.source === "local" ? copies.local : copies.cloud;
    if (source && chosen.corrupt) throw new Error(`${source === "local" ? "本地" : "云端"}存档副本损坏`);
    if (source && !chosen.data) throw new Error(`${source === "local" ? "本地" : "云端"}存档副本不存在`);
    if (!chosen.data) chosen = chosen === copies.local ? copies.cloud : copies.local;
    if (!chosen.data) {
      if (details.cloudReadFailed) throw details.cloudError;
      if (details.localExists || details.cloudExists) throw new Error("存档位的本地和云端副本均已损坏");
      return null;
    }
    const loaded = chosen.data;
    loaded.currentSaveSlot = id;
    if (details.cloudReadFailed) Object.defineProperty(loaded, "__slotCloudUnknown",
      { value: true, configurable: true });
    return loaded;
  }

  return { getSlots, loadAuto, loadSlot };
};
