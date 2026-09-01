window.ReceiptLedger = (() => {
  const LEGACY_LIMIT = 4096;
  const MAX_SEQUENCE = 1_000_000_000_000;
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
  const isLegacyKey = key => typeof key === "string" && /^[0-9a-z]{1,7}\.[0-9a-z]{1,7}$/.test(key);
  function sequence(id, prefix) {
    const match = new RegExp(`^${prefix}:(\\d+)$`).exec(String(id || ""));
    const value = match ? Number(match[1]) : 0;
    return Number.isSafeInteger(value) && value > 0 && value <= MAX_SEQUENCE ? value : 0;
  }
  function safeCounter(...values) {
    return values.reduce((max, value) => {
      const number = Number(value);
      return Number.isSafeInteger(number) && number >= 0 && number <= MAX_SEQUENCE ? Math.max(max, number) : max;
    }, 0);
  }
  function normalize(raw, oldIds = [], prefix = "") {
    const ledger = empty(), seen = new Set();
    ledger.through = safeCounter(raw?.through);
    const add = key => {
      if (seen.size < LEGACY_LIMIT && isLegacyKey(key)) seen.add(key);
    };
    (Array.isArray(raw?.legacy) ? raw.legacy : []).forEach(add);
    for (const id of Array.isArray(oldIds) ? oldIds : []) {
      const seq = sequence(id, prefix);
      if (seq) ledger.through = Math.max(ledger.through, seq);
      else add(legacyKey(id));
    }
    ledger.legacy = [...seen];
    return ledger;
  }
  function inspect(ledgerInput, id, prefix) {
    const ledger = normalize(ledgerInput, [], prefix), seq = sequence(id, prefix);
    if (seq) {
      if (seq <= ledger.through) return { status: "duplicate", ledger };
      return { status: seq === ledger.through + 1 ? "available" : "blocked", ledger };
    }
    const key = legacyKey(id);
    if (ledger.legacy.includes(key)) return { status: "duplicate", ledger };
    return { status: ledger.legacy.length >= LEGACY_LIMIT ? "blocked" : "available", ledger, key };
  }
  function claim(ledgerInput, id, prefix) {
    const result = inspect(ledgerInput, id, prefix);
    if (result.status !== "available") return result;
    const seq = sequence(id, prefix);
    if (seq) result.ledger.through = seq;
    else result.ledger.legacy.push(result.key);
    result.status = "granted";
    return result;
  }
  function assign(state, prefix, ledgerKey, counterKey, oldIdsKey) {
    const ledger = normalize(state[ledgerKey], state[oldIdsKey], prefix);
    state[ledgerKey] = ledger;
    delete state[oldIdsKey];
    const counter = safeCounter(state[counterKey], ledger.through);
    if (counter >= MAX_SEQUENCE) return "";
    state[counterKey] = counter + 1;
    return `${prefix}:${state[counterKey]}`;
  }
  function release(state, id, prefix, ledgerKey, counterKey) {
    const ledger = normalize(state[ledgerKey], [], prefix);
    const seq = sequence(id, prefix), counter = safeCounter(state[counterKey]);
    if (!seq || seq !== ledger.through + 1 || counter !== seq) return false;
    state[ledgerKey] = ledger;
    state[counterKey] = ledger.through;
    return true;
  }
  return { LEGACY_LIMIT, empty, normalize, inspect, claim, assign, release, safeCounter, isLegacyKey };
})();
