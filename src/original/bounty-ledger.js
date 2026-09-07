window.BountyLedger = (() => {
  const LEGACY_LIMIT = 4096;
  const MAX_SEQUENCE = Number.MAX_SAFE_INTEGER;
  const empty = () => ({ version: 1, through: 0, legacy: [] });
  function hash(text, seed) {
    let value = seed >>> 0;
    for (let i = 0; i < text.length; i += 1) {
      value ^= text.charCodeAt(i);
      value = Math.imul(value, 16777619);
    }
    return (value >>> 0).toString(36);
  }
  function legacyKey(id) {
    const text = String(id || "");
    return `${hash(text, 2166136261)}.${hash(text, 3339675911)}`;
  }
  function isLegacyKey(key) {
    return typeof key === "string" && /^[0-9a-z]{1,7}\.[0-9a-z]{1,7}$/.test(key);
  }
  function sequence(id) {
    const match = /^bounty:(\d+)$/.exec(String(id || ""));
    const value = match ? Number(match[1]) : 0;
    return Number.isSafeInteger(value) && value > 0 ? value : 0;
  }
  function safeCounter(...values) {
    return values.reduce((max, value) => {
      const number = Number(value);
      return Number.isSafeInteger(number) && number >= 0 ? Math.max(max, number) : max;
    }, 0);
  }
  function normalize(raw, oldIds = []) {
    const ledger = empty();
    ledger.through = safeCounter(raw?.through);
    const seen = new Set();
    const add = key => {
      if (seen.size >= LEGACY_LIMIT || !isLegacyKey(key)) return;
      seen.add(key);
    };
    for (const key of Array.isArray(raw?.legacy) ? raw.legacy : []) {
      if (seen.size >= LEGACY_LIMIT) break;
      add(key);
    }
    for (const id of Array.isArray(oldIds) ? oldIds : []) {
      if (seen.size >= LEGACY_LIMIT) break;
      add(legacyKey(id));
    }
    ledger.legacy = [...seen];
    return ledger;
  }
  function claim(ledgerInput, id) {
    const ledger = normalize(ledgerInput);
    const seq = sequence(id);
    if (seq) {
      if (seq <= ledger.through) return { status: "duplicate", ledger };
      if (seq !== ledger.through + 1) return { status: "blocked", ledger };
      ledger.through = seq;
      return { status: "granted", ledger };
    }
    const key = legacyKey(id);
    if (ledger.legacy.includes(key)) return { status: "duplicate", ledger };
    if (ledger.legacy.length >= LEGACY_LIMIT) return { status: "blocked", ledger };
    ledger.legacy.push(key);
    return { status: "granted", ledger };
  }
  function assign(state, items) {
    const highest = items.reduce((max, item) => Math.max(max, sequence(item?.claimId)), 0);
    let counter = safeCounter(state._localBountyClaimCounter, highest, state._localBountyLedger?.through);
    const assigned = items.map(item => {
      if (item.claimId) return item;
      if (counter >= MAX_SEQUENCE) return item;
      counter += 1;
      return { ...item, claimId: `bounty:${counter}` };
    });
    state._localBountyClaimCounter = counter;
    return assigned;
  }
  return { LEGACY_LIMIT, empty, normalize, claim, assign, sequence, safeCounter, isLegacyKey };
})();
