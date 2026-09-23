// 验证拼杀/魔之连杀的效果由数据标志位驱动，而非写死卡名。
// 关键：反向验证——去掉标志位后效果必须失效，否则测试是空跑。
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
let pass = 0, fail = 0;
function ok(label, cond, extra) {
  if (cond) { pass++; console.log(`✅ ${label}${extra ? " — " + extra : ""}`); }
  else { fail++; console.log(`❌ ${label}${extra ? " — " + extra : ""}`); }
}

function loadModule() {
  const src = fs.readFileSync(path.join(ROOT, "src/original/ruins-card-skills.js"), "utf8");
  const sandbox = {
    window: {}, console,
    BattleLog: { add: () => {} },
    GameRandom: { sample: (l) => l[0] },
    BattleDamageLifecycle: null,
    BattleLines: null,
    BattleCardStealApi: null,
  };
  sandbox.window.BattleLog = sandbox.BattleLog;
  sandbox.window.GameRandom = sandbox.GameRandom;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return sandbox.window.RuinsCardSkills;
}

function mkState() {
  const a = { name: "A", hp: 30, attack: 3, magic: 4, hand: [], zone: [] };
  const b = { name: "B", hp: 30, attack: 1, magic: 1, hand: [], zone: [] };
  const c = { name: "C", hp: 30, attack: 1, magic: 1, hand: [], zone: [] };
  const d = { name: "D", hp: 30, attack: 1, magic: 1, hand: [], zone: [] };
  a.side = "ally"; b.side = "enemy"; c.side = "enemy"; d.side = "enemy";
  const state = {
    units: [a, b, c, d], log: [],
    battle: { allies: [a], enemies: [b, c, d] },
  };
  return { state, a, b, c, d };
}

const M = loadModule();

console.log("===== 拼杀 clashResponse 标志位 =====");
{
  const { state, a, b } = mkState();
  const card = { name: "拼杀", clashResponse: true, type: "slash", _playedFromHand: true };
  a.hand = [card];
  M.beforeResponseCheck(state, a, b, card);
  ok("标志位 true → 触发不可响应", card.ignoreResponse === true, `ignoreResponse=${card.ignoreResponse}`);
}
{
  const { state, a, b } = mkState();
  const card = { name: "拼杀", clashResponse: false, type: "slash", _playedFromHand: true };
  a.hand = [card];
  M.beforeResponseCheck(state, a, b, card);
  ok("标志位 false → 不触发（反向验证）", card.ignoreResponse !== true, `ignoreResponse=${card.ignoreResponse}`);
}
{
  const { state, a, b } = mkState();
  const card = { name: "拼杀", type: "slash", _playedFromHand: true };
  a.hand = [card];
  M.beforeResponseCheck(state, a, b, card);
  ok("无标志位 → 按卡名兜底仍生效", card.ignoreResponse === true, `旧存档兼容`);
}
{
  const { state, a, b } = mkState();
  const card = { name: "其它杀牌", clashResponse: true, type: "slash", _playedFromHand: true };
  a.hand = [card];
  M.beforeResponseCheck(state, a, b, card);
  ok("标志位可移植到任意卡名", card.ignoreResponse === true, "改名不再失效");
}

console.log("\n===== 魔之连杀 chainBySlash 标志位 =====");
function runChain(cardMod) {
  const { state, a, b, c, d } = mkState();
  const card = Object.assign({ name: "魔之连杀", type: "slash", _playedFromHand: true }, cardMod);
  a.hand = [card];
  const hits = [];
  M.chainExtraTargets(state, a, b, card, (st, tgt) => hits.push(tgt.name));
  return hits;
}
{
  const hits = runChain({ chainBySlash: true });
  ok("标志位 true → 触发额外目标", hits.length > 0, `命中 ${hits.length} 个: ${hits.join(",")}`);
  ok("额外目标不含主目标", !hits.includes("B"), `hits=${hits.join(",")}`);
}
{
  const hits = runChain({ chainBySlash: false });
  ok("标志位 false → 不触发（反向验证）", hits.length === 0, `hits=${hits.length}`);
}
{
  const hits = runChain({});
  ok("无标志位 → 按卡名兜底仍生效", hits.length > 0, `hits=${hits.length}`);
}
{
  const hits = runChain({ name: "任意卡", chainBySlash: true });
  ok("标志位可移植到任意卡名", hits.length > 0, `hits=${hits.length}`);
}

console.log(`\n===== 汇总：${pass}/${pass + fail} 通过 =====`);
if (fail) { console.error(`\n${fail} 项失败`); process.exit(1); }
console.log("\nRuins card flag-driven tests: passed");
