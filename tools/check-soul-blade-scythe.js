// 【追魂之刃 / 锁魂镰刀】口径护栏（307 版）。
// 正向：node tools/check-soul-blade-scythe.js
// 反向：REVERT=judge|replay|desc|doc|notice|log|identity|guard node tools/check-soul-blade-scythe.js
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.resolve(__dirname, "..");
const SRC = "src/original/";
const REVERT = process.env.REVERT || "";
const results = [];
const check = (id, name, ok, d = {}) => {
  results.push({ id, ok: !!ok });
  console.log(`${ok ? "✅" : "❌"} ${id} ${name}${ok ? "" : "  ← " + JSON.stringify(d)}`);
};
const read = rel => {
  let t = fs.readFileSync(path.join(ROOT, rel), "utf8");
  if (REVERT === "judge" && rel === SRC + "battle-damage-triggers.js")
    t = t.replace("!window.CardUtils?.isSoulScytheTriggerCard?.(card)",
      "!window.CardUtils?.isEntitySingleKill?.(card)", 1);
  if (REVERT === "replay" && rel === SRC + "card-utils.js")
    t = t.replace("    || (!!card?._soulBladeRepeat && isSingleKillCard(card));", ";", 1);
  if (REVERT === "desc" && rel === SRC + "data-characters-core.js")
    t = t.replace("你再次使用此牌1次；此次使用不是额外结算，造成的伤害视为实体单体【杀】伤害，且不能再次触发此技能。",
      "你额外再次使用此牌1次。此次使用不消耗手牌和淫气，且不能再次触发此技能。", 1);
  if (REVERT === "doc" && rel === "docs/original/game-settings.md")
    t = t.replace("此次使用**不是额外结算**", "此次使用为额外结算", 1);
  if (REVERT === "notice" && rel === SRC + "update-notice-recent.js")
    t = t.replace(/追魂之刃修正：[\s\S]*?实机矩阵同步\。/, "", 1);
  if (REVERT === "log" && rel === SRC + "battle-damage-triggers.js")
    t = t.replace("触发追魂之刃，再次使用", "触发追魂之刃，额外再次使用", 1);
  if (REVERT === "identity" && rel === SRC + "battle-damage-triggers.js")
    t = t.replace("virtual: true, _skipHandMove: true, _soulBladeRepeat: true,",
      "_skipHandMove: true, _soulBladeRepeat: true,", 1);
  if (REVERT === "guard" && rel === SRC + "battle-damage-triggers.js")
    t = t.replace("if (card?._soulBladeRepeat || actor?.hp <= 0) return null;",
      "if (actor?.hp <= 0) return null;", 1);
  return t;
};
const cu = read(SRC + "card-utils.js");
const trig = read(SRC + "battle-damage-triggers.js");
const data = read(SRC + "data-characters-core.js");
const notice = read(SRC + "update-notice-recent.js");
const doc03 = read("docs/03-角色与角色技能.txt");
const deepseek = read("docs/deepseek-rebuild/02-characters.md");
const settings = read("docs/original/game-settings.md");
const agents = read(".ohmyagent/AGENTS.md");
const diary = read("docs/开发日记.md");
const qa = read("tools/qa-test-catalog.js");

// ── A. 实现口径 ──
check("A1", "CardUtils 新增并导出 isSoulScytheTriggerCard，注明「不是额外结算」",
  cu.includes("const isSoulScytheTriggerCard = card =>")
  && cu.includes("isEntitySingleKill, isPlainSlash, isSoulScytheTriggerCard,")
  && cu.includes("不是额外结算"));
check("A2", "锁魂镰刀分支调用统一判据（不再直接用 isEntitySingleKill）",
  trig.includes("!window.CardUtils?.isSoulScytheTriggerCard?.(card)")
  && !trig.includes("!window.CardUtils?.isEntitySingleKill?.(card)"));
check("A3", "追魂之刃重放牌仍带 virtual / _soulBladeRepeat / _skipHandMove / skipMvpCardCount（不触发额外结算类）",
  trig.includes("virtual: true, _skipHandMove: true, _soulBladeRepeat: true,")
  && trig.includes("skipMvpCardCount: true,"));
check("A4", "soulBladeCard 仍拒绝重放牌，追魂之刃不二次触发",
  trig.includes("if (card?._soulBladeRepeat || actor?.hp <= 0) return null;"));
check("A5", "战报改为「再次使用」，无「额外」字样",
  trig.includes("触发追魂之刃，再次使用")
  && !trig.includes("额外再次使用"));

// ── B. 描述 / 文档 / 记忆 ──
const NEW = "锁定技，当你使用的实体【杀】被【闪】抵消后，你再次使用此牌1次；此次使用不是额外结算，造成的伤害视为实体单体【杀】伤害，且不能再次触发此技能。";
check("B1", "卡面描述重写、删去「不消耗手牌和淫气」、不再写「额外再次使用」",
  data.includes(NEW) && !data.includes("不消耗手牌和淫气")
  && !data.includes("额外再次使用"));
check("B2", "docs/03 / deepseek / 设定契约三处同步，旧话术 0 残留",
  doc03.includes("此次使用不是额外结算，造成的伤害视为实体单体【杀】伤害")
  && deepseek.includes("不是额外结算")
  && settings.includes("此次使用**不是额外结算**")
  && settings.includes("isSoulScytheTriggerCard")
  && !doc03.includes("不消耗手牌和淫气") && !settings.includes("不额外消耗手牌或淫气"));
check("B3", "公告仍 149 行，含追魂之刃修正条目与「不是额外结算」",
  notice.trimEnd().split(/\r?\n/).length === 149
  && notice.includes("追魂之刃修正") && notice.includes("它不是额外结算"));
check("B4", "AGENTS / 开发日记 / QA 目录同步登记",
  agents.includes("追魂之刃(307")
  && diary.includes("§307")
  && qa.includes("check-soul-blade-scythe.js")
  && qa.includes("test-soul-blade-scythe-live.js"));

// ── C. vm 真实 CardUtils：判据矩阵 ──
const ctx = { console };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(read(SRC + "card-utils.js"), ctx, { filename: "card-utils.js" });
const U = ctx.CardUtils;
const E = o => Object.assign({ name: "杀（普攻）", type: "slash" }, o);
const replay = E({ virtual: true, _soulBladeRepeat: true, _skipHandMove: true });
const cases = [
  ["实体单体杀", E({}), true],
  ["转换单体杀", E({ convertedFrom: "闪" }), true],
  ["普通虚拟单体杀", E({ virtual: true }), false],
  ["追魂之刃重放杀", replay, true],
  ["重放群体杀", E({ virtual: true, _soulBladeRepeat: true, sweep: true }), false],
  ["重放战术牌", E({ virtual: true, _soulBladeRepeat: true, type: "tactic", name: "决斗" }), false],
  ["锁魂镰刀技能载荷", E({ type: "skill", name: "锁魂镰刀", soulScythe: true }), false],
  ["非杀实体战术牌", E({ type: "tactic", name: "决斗" }), false],
];
const bad = cases.filter(([, c, want]) => U.isSoulScytheTriggerCard(c) !== want)
  .map(([n, , want]) => ({ n, want }));
check("C1", "vm 判据矩阵 8/8：实体/转换/重放杀放行，其余虚拟与技能载荷拦住",
  bad.length === 0, bad);
check("C2", "反向硬证：旧判据 isEntitySingleKill 确实拦住重放杀（BUG 根因）",
  U.isEntitySingleKill(replay) === false);
check("C3", "新判据不改变额外结算侧身份：重放牌仍非实体牌",
  U.isEntityCard(replay) === false);

const red = results.filter(r => !r.ok).map(r => r.id);
console.log(`\nREVERT=${REVERT || "none"} RED=${JSON.stringify(red)}`);
if (!REVERT) {
  console.log(`RESULT ${results.length - red.length}/${results.length}`);
  process.exit(red.length ? 1 : 0);
}
const EXPECT = {
  judge: ["A2"], replay: ["C1"], desc: ["B1"], doc: ["B2"],
  notice: ["B3"], log: ["A5"], identity: ["A3"], guard: ["A4"],
}[REVERT] || [];
const same = JSON.stringify(red) === JSON.stringify(EXPECT);
console.log(`EXPECTED=${JSON.stringify(EXPECT)} ${same ? "PRECISE_OK" : "PRECISE_FAIL"}`);
process.exit(same ? 0 : 1);
