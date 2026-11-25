function keepModalScroll(done, options = {}) {
  const save = () => { if (options.persist !== false) persist(); };
  if (typeof preserveInteractionScroll === "function") return preserveInteractionScroll(() => { done(); render(); save(); });
  const panel = document.querySelector(".modal-card"), top = panel?.scrollTop || 0;
  done(); render();
  requestAnimationFrame(() => { const next = document.querySelector(".modal-card"); if (next) next.scrollTop = top; });
  save();
}
function updateModalState(done, options = {}) {
  if (document.querySelector(".modal-card")) keepModalScroll(done, options);
  else { done(); render(); if (options.persist !== false) persist(); }
}
function toggleTestPick(key, value) {
  keepModalScroll(() => { const list = state[key] || [], hit = list.includes(value); state[key] = hit ? list.filter(x => x !== value) : [...list, value].slice(0, 4); });
}
function toggleTestLoose(key, value) {
  keepModalScroll(() => {
    const list = state[key] || [], removing = list.includes(value);
    state[key] = removing ? list.filter(x => x !== value) : [...list, value];
    if (removing && key === "testRelics") clearTestRelicSlots(value);
  });
}
function clearTestRelicSlots(value) {
  Object.keys(state.testEquipment || {}).forEach(id => {
    const slots = state.testEquipment[id];
    if (!Array.isArray(slots)) return;
    state.testEquipment[id] = RelicSystem.normalizeSlots(
      slots.map(relic => relic === value ? null : relic),
    );
  });
}
function setAllTestCards(add) { const base = new Set(GameData.baseCardNames || []), owned = new Set([...(state.deck || []).map(c => c.name), ...base]); keepModalScroll(() => { state.testCards = add ? (GameData.cardCodex || []).filter(c => !owned.has(c.name)).map(c => c.name) : []; }); }
function setAllTestRelics(add) { const owned = new Set([...(state.relicCollection || []), ...(state.resources?.relics || []), ...Object.values(state.equipment || {}).flat()]); keepModalScroll(() => { state.testRelics = add ? RelicSystem.all(state).filter(r => !owned.has(r.name)).map(r => r.name) : []; if (!add) state.testEquipment = {}; }); }
function testDeck() {
  const names = new Set(state.testCards || []);
  const base = (state.deck || GameData.baseDeck).map(c => ({ ...c })), have = new Set(base.map(c => c.name));
  const extra = (GameData.eliteCards || []).filter(c => names.has(c.name) && !have.has(c.name)).map(c => ({ ...c }));
  return [...base, ...extra];
}
function setTestDifficulty(id) { updateModalState(() => { state.testDifficulty = GameData.difficulties[id] ? id : "normal"; }); }
function scaleTestEnemy(e) {
  const diff = GameData.difficulties[state.testDifficulty] || GameData.difficulties.normal, enemy = GameData.scaleEnemyStats(e, diff, e.type);
  if (diff.enemyRelics && ["elite", "boss"].includes(e.type)) enemy.battleRelics = RelicSystem?.enemyRelics?.(e.id) || [];
  return enemy;
}
// 测试战斗此前写死 machine_factory：选研究所新怪时 BGM 仍是机械工厂曲。
// 按所选敌人反查 GameDataWorld.enemies 的分组 key；全部同副本才用该副本，
// 混合选择 / 未识别一律退回既有默认 machine_factory，避免误改其它行为。
function testBattleMissionId(selected) {
  const groups = window.GameDataWorld?.enemies || {};
  const ids = selected.map(i => GameData.testEnemies[i]?.id).filter(Boolean);
  const owners = [...new Set(ids.map(id => Object.keys(groups).find(key =>
    (Array.isArray(groups[key]) ? groups[key] : []).some(e => e && e.id === id))))]
    .filter(Boolean);
  return owners.length === 1 ? owners[0] : "machine_factory";
}
async function startTestBattle(actionCurrent = null) {
  const actionState = state;
  const isCurrent = () => window.state === actionState
    && (!actionCurrent || actionCurrent());
  window.GameBGM?.unlock?.(); window.BattleFX?.unlockAudio?.();
  const enemies = (actionState.testEnemies || []).map(i => GameData.testEnemies[i]).filter(Boolean).map(scaleTestEnemy);
  const missionId = testBattleMissionId(actionState.testEnemies || []);
  window.GameBGM?.primeBattle?.(window.GameBGM?.battleTrack?.(missionId, enemies));
  actionState.testBattleStarting = true; actionState.hallModal = null; actionState.view = "battleLoading"; actionState.loadingBattleName = "测试战斗"; actionState.loadingBattleProgress = null; render();
  try {
    if (window.GameBundles) await window.GameBundles.load("battle", { state: actionState, test: true, allyIds: actionState.testAllies || [] });
    if (!isCurrent()) return;
    window.BattleFX?.unlockAudio?.();
    await BattleSystem.start(actionState, missionId, render, {
      test: true, allyIds: actionState.testAllies || [], enemies, deck: testDeck(),
      isCurrent,
    });
    if (!isCurrent()) return;
    actionState.testBattleStarting = false;
    persist();
  } catch (err) {
    if (!isCurrent()) return;
    console.error("test battle start failed:", err.message, err.stack);
    window.BattleFX?.leave?.(actionState); actionState.battle = null;
    actionState.testBattleStarting = false; actionState.view = "hall";
    actionState.loadingBattleName = null; actionState.loadingBattleProgress = null;
    actionState.hallModal = "testBattle"; render(); persist();
  } finally {
    if (isCurrent()) actionState.testBattleStarting = false;
  }
}
