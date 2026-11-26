// 全体攻击牌/技能 × 受击挂起类技能：源码级续跑保护清点
// REVERT=queue|armor|runArmor|notice 改真实源码后重载，要求对应组精准打红、其它保持绿。
const fs = require("fs");
const path = require("path");
const { sourceOf } = require("./split-source-view");
const ROOT = path.resolve(__dirname, "..");
const DIR = path.join(ROOT, "src", "original");
const REVERT = process.env.REVERT || "";
const raw = n => sourceOf(path.join(DIR, n));

const REPL = {
  queue: ["ruins-dragon-skills.js",
    "window.BattleReactionQueue.flush(state, damage);", "// no flush"],
  armor: ["ruins-dragon-skills.js", "tailGunArmor: true", "tailGunArmor: false"],
  runArmor: ["battle-reaction-queue-run.js",
    "if (action.tailGunArmor && result?.hpLoss > 0) {", "if (false) {"],
  notice: ["update-notice-recent.js", "机械AI龙【机尾机枪】全体结算", "全体结算"],
};
const EXPECT = { queue: ["C1", "A11"], armor: ["C2"], runArmor: ["D"], notice: ["E"] };
const patched = n => {
  let s = raw(n);
  const r = REPL[REVERT];
  if (r && r[0] === n) {
    if (!s.includes(r[1])) throw new Error(`REVERT=${REVERT} 目标未命中: ${r[1].slice(0, 80)}`);
    s = s.replace(r[1], r[2], 1);
  }
  return s;
};

const results = [];
const check = (n, ok, d = "") => { results.push({ n, ok: !!ok, d }); console.log(`${ok ? "OK  " : "FAIL"} ${n}${d ? " — " + d : ""}`); };

// 全库「逐个目标结算全体伤害」的已知站点：牌面 AOE 与技能生成 AOE 都要有挂起续跑保护。
const SITES = [
  ["battle-card-specials.js", "sweepDamage", "captureHitContinuation", "【机枪扫杀/流星杀/枪林弹雨】群体结算"],
  ["battle-card-tactics.js", "demonInvasion", "demonInvasionResume", "【魔王军入侵】逐目标全体"],
  ["machine-factory-skills.js", "歼灭模式·狂热机枪", "BattleReactionQueue?.enqueue", "机械牛王·狂热机枪"],
  ["underwater-train-damage-skills.js", "鲨影鱼雷", "BattleReactionQueue?.enqueue", "水下列车·鲨影鱼雷扩散"],
  ["orc-drone-skills.js", "自爆倒计时", "BattleReactionQueue?.enqueue", "兽人无人机·自爆"],
  ["guest-characters-skills.js", "终焉回旋斩", "BattleReactionQueue?.enqueue", "艾伦格·终焉回旋斩"],
  ["edis-skills.js", "无限暗刃", "BattleReactionQueue?.enqueue", "伊迪斯·无限暗刃"],
  ["abe-mike-skills.js", "幻影剑舞", "BattleReactionQueue?.enqueue", "安倍·麦克·幻影剑舞"],
  ["manny-skills.js", "刺弹爆炸", "BattleReactionQueue?.directDamageAction", "曼妮·刺弹爆炸"],
  ["ruins-helicopter-skills.js", "战场扫射", "fromEntity?.(\"机枪扫杀\"", "废墟直升机·战场扫射（产物走 sweepDamage）"],
  ["ruins-dragon-skills.js", "机尾机枪", "BattleReactionQueue.flush(state, damage)", "机械AI龙·机尾机枪"],
];
SITES.forEach(([file, name, guard, label], i) => {
  const s = patched(file);
  check(`A${i + 1} ${label}：${name} 有续跑/队列保护`, s.includes(name) && s.includes(guard));
});

const dragon = patched("ruins-dragon-skills.js");
const run = patched("battle-reaction-queue-run.js");
const notice = patched("update-notice-recent.js");
const enqIdx = dragon.indexOf("BattleReactionQueue?.enqueue?.(state, actions)");
const bareIdx = dragon.indexOf("targets.forEach(target => {");
check("B 队列路径在裸循环兜底之前（裸循环不再是主路径）", enqIdx >= 0 && (bareIdx === -1 || enqIdx < bareIdx));
check("C1 机尾机枪动作先入反应队列再 flush",
  dragon.includes("BattleReactionQueue?.enqueue?.(state, actions)") && dragon.includes("BattleReactionQueue.flush(state, damage)"));
check("C2 机尾机枪动作带 tailGunArmor 标记", dragon.includes("tailGunArmor: true"));
check("D 队列结算按每段实际 hpLoss 累加机尾机枪护甲",
  run.includes("action.tailGunArmor && result?.hpLoss > 0") && run.includes("actor.block = (actor.block || 0) + result.hpLoss"));
check("E 公告写明机尾机枪断续修复与全批复查", notice.includes("机械AI龙【机尾机枪】全体结算") && notice.includes("断续"));
const itemCount = s => (s.match(/^        "/gm) || []).length;
check("F 公告未新增条目（本期说明并入既有条目）", itemCount(notice) === itemCount(raw("update-notice-recent.js")),
  `items=${itemCount(notice)} lines=${notice.trimEnd().split("\n").length}`);

const bad = results.filter(r => !r.ok);
const red = bad.map(r => r.n);
const expected = EXPECT[REVERT] || [];
if (REVERT) {
  const ok = expected.length && expected.every(e => red.some(n => n.startsWith(e)))
    && red.every(n => expected.some(e => n.startsWith(e)));
  console.log(`REVERT=${REVERT} RED=${JSON.stringify(red)} EXPECTED=${JSON.stringify(expected)} ${ok ? "PRECISE_OK" : "PRECISE_FAIL"}`);
  if (!ok) process.exit(1);
} else {
  console.log(`RESULT ${results.length - bad.length}/${results.length}`);
  if (bad.length) process.exit(1);
}
