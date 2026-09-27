window.ButlerManualProgress = (() => {
  const BUTLER_NAME = "凯瑟琳";
  const MAX_LEVEL = 20;
  const DIFFS = ["normal", "adventure", "warrior", "king", "hell"];
  // 成果记录形如 "boss:mechanical_bull_king@normal"，三类前缀：boss / elite / clear。
  const KINDS = ["boss", "elite", "clear"];

  function feats(state) {
    const raw = Array.isArray(state?.butlerFeats) ? state.butlerFeats : [];
    const seen = new Set();
    return raw.filter(item => {
      const key = String(item || "");
      if (!valid(key)) return false;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  function valid(key) {
    const [head, diff] = String(key).split("@");
    const [kind, id] = String(head).split(":");
    return KINDS.includes(kind) && !!id && DIFFS.includes(diff);
  }
  function key(kind, id, difficulty) { return `${kind}:${id}@${difficulty}`; }

  function has(state, kind, id, difficulty) {
    return feats(state).includes(key(kind, id, difficulty));
  }
  function record(state, kind, id, difficulty) {
    if (!KINDS.includes(kind) || !id || !DIFFS.includes(difficulty)) return false;
    if (!Array.isArray(state.butlerFeats)) state.butlerFeats = [];
    const k = key(kind, id, difficulty);
    if (state.butlerFeats.includes(k)) return false;
    state.butlerFeats.push(k);
    return true;
  }
  // 老存档只有"是否击败过"，回填为普通级，避免手册从全空白开始。
  function legacy(state, kind, id) {
    return (state?.defeatedElites || []).includes(id) ? ["normal"] : [];
  }
  function doneDiffs(state, kind, id) {
    const set = new Set(legacy(state, kind, id));
    feats(state).forEach(item => {
      const [head, diff] = item.split("@");
      const [k, i] = head.split(":");
      if (k === kind && i === id) set.add(diff);
    });
    return DIFFS.filter(d => set.has(d));
  }

  function missions() {
    return (window.GameData?.missions || []).filter(m => m?.kind === "dungeon");
  }
  function enemiesOf(missionId, type) {
    const group = window.GameData?.enemies?.[missionId];
    if (!Array.isArray(group)) return [];
    return group.filter(e => e?.type === type);
  }
  function difficulties() {
    return DIFFS.map(id => ({ id, name: window.GameData?.difficulties?.[id]?.name || id }));
  }

  function recordBattle(state, defeatedIds, difficulty) {
    const diff = DIFFS.includes(difficulty) ? difficulty : "normal";
    const ids = Array.isArray(defeatedIds) ? defeatedIds : [];
    let added = 0;
    missions().forEach(m => {
      ["boss", "elite"].forEach(kind => {
        enemiesOf(m.id, kind).forEach(e => {
          if (ids.includes(e.id) && record(state, kind, e.id, diff)) added += 1;
        });
      });
    });
    return added;
  }
  function recordClear(state, missionId, difficulty) {
    const diff = DIFFS.includes(difficulty) ? difficulty : "normal";
    return record(state, "clear", missionId, diff);
  }

  function bossGroups(state) {
    return missions().map(m => ({
      id: m.id, name: m.name,
      list: enemiesOf(m.id, "boss").map(e => ({
        id: e.id, name: e.name,
        diffs: difficulties().map(d => ({ ...d, done: doneDiffs(state, "boss", e.id).includes(d.id) })),
      })),
    })).filter(g => g.list.length);
  }
  function eliteGroups(state) {
    return missions().map(m => ({
      id: m.id, name: m.name,
      list: enemiesOf(m.id, "elite").map(e => ({
        id: e.id, name: e.name,
        diffs: difficulties().map(d => ({ ...d, done: doneDiffs(state, "elite", e.id).includes(d.id) })),
      })),
    })).filter(g => g.list.length);
  }
  function heroList(state) {
    const chars = Array.isArray(state?.chars) ? state.chars : [];
    return chars.map(c => {
      const tpl = (window.GameData?.characters || []).find(x => x.id === c.id) || c;
      const level = Math.max(0, Math.floor(Number(c.level) || 0));
      return {
        id: c.id, name: tpl.name || c.name || c.id, level, maxed: level >= MAX_LEVEL,
        unlocked: !c.locked, art: tpl.avatar || tpl.art || "", face: tpl.face || "?",
      };
    });
  }
  function exploreList(state) {
    return missions().map(m => ({
      id: m.id, name: m.name,
      diffs: difficulties().map(d => ({ ...d, done: doneDiffs(state, "clear", m.id).includes(d.id) })),
    }));
  }

  function ratio(done, total) { return total > 0 ? done / total : 0; }
  function countDone(groups) {
    let done = 0, total = 0;
    groups.forEach(g => g.list.forEach(item => item.diffs.forEach(d => { total += 1; if (d.done) done += 1; })));
    return { done, total };
  }
  function countExplore(list) {
    let done = 0, total = 0;
    list.forEach(m => m.diffs.forEach(d => { total += 1; if (d.done) done += 1; }));
    return { done, total };
  }
  function overall(state) {
    const boss = countDone(bossGroups(state)), elite = countDone(eliteGroups(state));
    const explore = countExplore(exploreList(state));
    const heroes = heroList(state), maxed = heroes.filter(h => h.maxed).length;
    const parts = [ratio(boss.done, boss.total), ratio(elite.done, elite.total), ratio(explore.done, explore.total), ratio(maxed, heroes.length)];
    const pct = Math.round(parts.reduce((a, b) => a + b, 0) / parts.length * 100);
    return { pct, boss, elite, explore, heroes: { done: maxed, total: heroes.length } };
  }

  function line(state) {
    const { pct } = overall(state);
    if (pct >= 70) return "您比我想象的更有趣，主人。";
    if (pct >= 25) return "做得不错，但还有更多Boss需要讨伐。";
    return "主人，深渊的目标还在等着您。";
  }
  function comment(state) {
    const { pct } = overall(state);
    if (pct >= 90) return "主人，深渊的名单已经所剩无几了。";
    if (pct >= 70) return "主人的脚步，已经很少有人能跟上了。";
    if (pct >= 40) return "进展过半，剩下的都是硬骨头。";
    if (pct >= 15) return "主人，您还有很长的路要走。";
    return "主人，先从最简单的目标开始吧。";
  }

  return {
    BUTLER_NAME, MAX_LEVEL, DIFFS, feats, has, record, recordBattle, recordClear, doneDiffs,
    missions, enemiesOf, difficulties, bossGroups, eliteGroups, heroList, exploreList,
    overall, line, comment,
  };
})();
