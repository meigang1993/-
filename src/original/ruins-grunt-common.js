// 废墟沙城普通怪技能 · 公共辅助
// 拆分自 ruins-grunt-skills.js：地雷（ruins-grunt-landmine.js）与
// 狙击/无人机/坦克（ruins-grunt-skills.js）共用同一套判定工具，
// 集中一处以免两处各写一份导致口径漂移。
window.RuinsGruntCommon = (() => {
  const alive = units => (units || []).filter(unit => unit.hp > 0);
  const visible = unit => (unit?.hand || []).filter(card => !card._pendingDraw);
  const isResponse = card => card?.type === "response" || card?.name === "闪";
  const isStatus = card => window.BattleStatusCards?.isStatus?.(card);
  const isSlash = card => window.CardUtils?.isKillCard?.(card) || card?.type === "slash";
  const isSingleSlash = card => isSlash(card) && !card?.sweep;
  const log = (state, text) => window.BattleLog?.add?.(state, text);
  const attackOf = unit => unit?.stats?.attack ?? unit?.attack ?? 0;
  const unitByUid = (battle, uid) => (battle?.allies || []).concat(battle?.enemies || [])
    .find(unit => unit.uid === uid);
  const RPS = ["石头", "剪刀", "布"];
  const beats = (a, b) => a === "石头" && b === "剪刀"
    || a === "剪刀" && b === "布" || a === "布" && b === "石头";
  return {
    alive, visible, isResponse, isStatus, isSlash, isSingleSlash,
    log, attackOf, unitByUid, RPS, beats,
  };
})();
