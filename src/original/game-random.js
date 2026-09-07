window.GameRandom = (() => {
  const UINT32 = 4294967296;
  const nativeRandom = Math.random;
  const nodeTestRuntime = !!globalThis.process?.versions?.node;
  let fallbackCounter = 0;
  let transient = { seed: entropySeed(), cursor: 0 };

  function entropySeed() {
    try {
      if (typeof crypto === "undefined" || !crypto.getRandomValues) throw new Error("crypto unavailable");
      const values = new Uint32Array(1);
      crypto.getRandomValues(values);
      return values[0] >>> 0;
    } catch (err) {
      fallbackCounter += 1;
      const timing = typeof performance !== "undefined" ? performance.now() : 0;
      return mix((Date.now() ^ Math.floor(timing * 1000) ^ fallbackCounter) >>> 0);
    }
  }

  function mix(value) {
    value = (value ^ (value >>> 16)) >>> 0;
    value = Math.imul(value, 0x21f0aaad) >>> 0;
    value = (value ^ (value >>> 15)) >>> 0;
    value = Math.imul(value, 0x735a2d97) >>> 0;
    return (value ^ (value >>> 15)) >>> 0;
  }

  function create(seed = entropySeed()) {
    return { version: 1, seed: Number(seed) >>> 0, cursor: 0 };
  }

  function normalize(owner) {
    if (!owner || typeof owner !== "object") return false;
    const raw = owner.random;
    const valid = raw?.version === 1 && Number.isInteger(raw.seed)
      && raw.seed >= 0 && raw.seed < UINT32
      && Number.isSafeInteger(raw.cursor) && raw.cursor >= 0;
    if (valid) return false;
    owner.random = create();
    return true;
  }

  function stream(owner) {
    if (!owner || typeof owner !== "object" || owner === transient) return transient;
    normalize(owner);
    return owner.random;
  }

  function value(owner = window.state) {
    const current = stream(owner);
    const cursor = current.cursor;
    current.cursor += 1;
    if (nodeTestRuntime && Math.random !== nativeRandom) return Math.random();
    const low = cursor >>> 0;
    const high = Math.floor(cursor / UINT32) >>> 0;
    return mix(current.seed ^ Math.imul(low + 1, 0x9e3779b9) ^ Math.imul(high, 0x85ebca6b)) / UINT32;
  }

  function int(min, max, owner = window.state) {
    const low = Math.ceil(Number(min));
    const high = Math.floor(Number(max));
    if (!Number.isFinite(low) || !Number.isFinite(high) || high < low) return low;
    return low + Math.floor(value(owner) * (high - low + 1));
  }

  function sample(list, owner = window.state) {
    return Array.isArray(list) && list.length ? list[int(0, list.length - 1, owner)] : undefined;
  }

  function chance(probability, owner = window.state) {
    return value(owner) < Math.max(0, Math.min(1, Number(probability) || 0));
  }

  function shuffle(list, owner = window.state) {
    for (let i = list.length - 1; i > 0; i -= 1) {
      const j = int(0, i, owner);
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  function id(prefix = "id") {
    return `${prefix}${Date.now().toString(36)}${int(0, 0xffffff, transient).toString(36)}`;
  }

  function persistentId(prefix = "id", owner = window.state) {
    const current = stream(owner);
    const cursor = current.cursor;
    const low = cursor >>> 0;
    const high = Math.floor(cursor / UINT32) >>> 0;
    const suffix = mix(current.seed ^ Math.imul(low + 1, 0x85ebca6b)
      ^ Math.imul(high, 0x9e3779b9));
    return `${prefix}${current.seed.toString(36)}-${cursor.toString(36)}-${suffix.toString(36)}`;
  }

  function noise() {
    return value(transient);
  }

  function transientSample(list) {
    return sample(list, transient);
  }

  function snapshot(owner) {
    const current = stream(owner);
    return { version: 1, seed: current.seed, cursor: current.cursor };
  }

  return { create, normalize, snapshot, value, int, sample, chance, shuffle, id, persistentId, noise, transientSample };
})();
