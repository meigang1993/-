// 天日国鹰7研究所 · 怪物技能共享判定（拆分文件，避免单模块超行数硬约束）
// 四个技能模块与聚合器都只读这里，不各自复制时停 / 实体牌 / 杀牌数口径。
window.TenriInstituteCommon = (() => {
  const isAi = (unit, ai) => unit?.ai === ai || unit?.id === ai;
  const isTenri = unit => typeof unit?.ai === "string" && unit.ai.startsWith("tenri_");
  // 时停（米尔尤拉【神奇怀表】）：技能归属方被标记即失效。
  const stopped = unit => !!window.MieryulaTimeStop?.isSkillDisabled?.(unit);
  const visible = unit => (unit?.hand || []).filter(c => c && !c._pendingDraw);
  // 【杀】牌数：与项目内 isKillCard 同口径（type slash 或以「杀」结尾的牌名）。
  const slashCount = unit => visible(unit)
    .filter(c => window.CardUtils?.isKillCard?.(c)).length;
  const log = (state, text) => window.BattleLog?.add?.(state, text);
  const lines = (state, actor, skill, target) =>
    window.BattleLines?.skill?.(state, actor, skill, target);
  const hasSkill = (unit, name) => !!unit?.skills?.some(s => s?.name === name);
  return { isAi, isTenri, stopped, visible, slashCount, log, lines, hasSkill };
})();
