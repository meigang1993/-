// 隔离用例：主动饰品「出牌阶段限一次」标记必须每回合清零。
//   魅魔钢叉（XX型凋零者1312号 掉落）描述为「出牌阶段限一次」，
//   若 usedSuccubusFork 从不重置，就退化成「每场战斗限一次」。
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const target = {};
const stub = new Proxy(target, {
  get: (t, k) => (k in t ? t[k] : () => undefined),
  has: () => true,
  set: (t, k, v) => { t[k] = v; return true; },
});
const sandbox = { window: stub, console };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const file = path.join(__dirname, "..", "src", "original", "battle-turn-state.js");
vm.runInContext(fs.readFileSync(file, "utf8"), sandbox, { filename: file });

const api = sandbox.window.BattleTurnState;
let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
};

T("模块导出 resetBeginTurn", typeof api?.resetBeginTurn === "function",
  Object.keys(api || {}));

const unit = { usedSuccubusFork: true, hand: [], statuses: [] };
const b = {};
api.resetBeginTurn(unit, b, 1);
T("魅魔钢叉：回合开始后 usedSuccubusFork 清零",
  unit.usedSuccubusFork === false, { usedSuccubusFork: unit.usedSuccubusFork });

// 对照：同类的刺客胶衣 / 军火库仍是旧行为（未纳入本轮改动，仅如实记录）
const unit2 = { usedAssassinLatex: true, usedArsenal: true, hand: [], statuses: [] };
api.resetBeginTurn(unit2, {}, 1);
console.log(`[对照] 刺客胶衣残留=${unit2.usedAssassinLatex} 军火库残留=${unit2.usedArsenal}`);

console.log(`\n=== ${pass}/${total} 通过 ===`);
process.exit(pass === total ? 0 : 1);
