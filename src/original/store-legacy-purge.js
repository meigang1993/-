// 旧存档清理：本次更新不再支持旧档，启动时把不兼容的存档整份删除。
// 覆盖范围 = 主存档（自动存档）+ 全部手动存档位，每个 key 的本地与云端副本一起删。
// 清理失败不阻塞启动：云端删除失败时本地通常已删掉，仍视为本次已处理。
window.GameStoreLegacyPurge = deps => {
  const { key, slotKey, slotIds, getRawDetails, getLocalDetails, delRaw, isLegacy } = deps;

  function storageKeys() {
    return [key, ...slotIds.map(slotKey)];
  }

  // 收齐该 key 下实际存在的副本。注意云端副本结构校验失败时 details.cloud
  // 会被置为 null 而 cloudExists 仍为 true，此时要当作「存在但不可用」计入。
  function existingCopies(details) {
    const copies = [];
    if (details?.localExists) copies.push(details.local);
    if (details?.cloudExists) copies.push(details.cloud);
    return copies;
  }

  async function readExists(storageKey) {
    try {
      const details = await getRawDetails(storageKey, {
        strictCloud: true,
        allowLocalOnCloudFailure: true,
      });
      const copies = existingCopies(details);
      // 云端本次读取失败时 cloud 为 null，existingCopies 便完全看不到云端，
      // 若本地恰好是旧档就会被判定成「全部副本皆旧档」而整份删除。但云端
      // 可能正存着当前纪元的进度，只是这次没读到；删 key 会连云端一起清，
      // 属于不可逆损失。因此云端内容无法确认时一律保守保留。
      // 需区分：没有云端 SDK（cloudAvailable=false）时云侧本就不可能有数据，
      // 仍按本地判定，不影响纯本地玩家清理旧档。
      const cloudUnknown = !!(details?.cloudAvailable && details?.cloudReadFailed);
      return {
        exists: copies.length > 0,
        // 必须全部副本都是旧档才删除：只要还有任一副本属于当前纪元，
        // 整份存档就含有有效进度，删 key 会把本地与云端一起清掉。
        // 典型场景：本地残留旧档、云端已是新档 —— 绝不能因此丢掉云端进度。
        // 损坏的副本读不出内容，同样属于不可用存档，一并清掉。
        legacy: copies.length > 0 && !cloudUnknown && copies.every(copy => isLegacy(copy)),
        cloudUnknown,
      };
    } catch (err) {
      // getRawDetails 整体失败时云端状态完全不可确认，此时若按本地旧档删除，
      // 会把云端可能存在的当前纪元进度一起清掉（不可逆）。旧档即使残留也
      // 不会被载入（读取时按纪元拦截、直接给新档），故一律保守保留。
      const local = getLocalDetails ? getLocalDetails(storageKey) : null;
      return {
        exists: !!local?.exists,
        legacy: false,
        cloudUnknown: true,
        cloudUnavailable: true,
      };
    }
  }

  async function purgeOne(storageKey) {
    const found = await readExists(storageKey);
    if (!found.exists || !found.legacy) return { key: storageKey, purged: false, ...found };
    let error = null;
    try {
      await delRaw(storageKey);
    } catch (err) {
      // 云端副本删不掉时 delRaw 不会动本地，两边都还在，本次不算清理成功，
      // 下次启动会重试。旧的「本地已先删除故仍视为已处理」属误报：本地删了
      // 云端还在，下次读取会把云端的旧档重新读回来。
      error = err?.code || err?.message || "DELETE_FAILED";
    }
    return { key: storageKey, purged: !error, error, ...found };
  }

  async function purge() {
    const results = await Promise.all(storageKeys().map(purgeOne));
    return {
      purged: results.filter(item => item.purged).map(item => item.key),
      kept: results.filter(item => item.exists && !item.legacy).map(item => item.key),
      errors: results.filter(item => item.error).map(item => ({ key: item.key, error: item.error })),
    };
  }

  return { purge, purgeOne, storageKeys };
};
