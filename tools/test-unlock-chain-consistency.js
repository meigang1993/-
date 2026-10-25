// 全量解锁事件一致性检查：击败条件是否真的可达成（敌人ID必须在 eliteUnlocks 内），
// 两处判定（local-core-events / 弹窗侧）是否一致，角色是否初始锁定，
// 完成函数与按钮绑定是否齐全。
// 目的：排查「击败了却永远不解锁」这类缺陷（含希特威同类问题）。
const fs = require("fs");
const vm = require("vm");

global.window = global;
const load = f => vm.runInThisContext(fs.readFileSync("src/original/" + f, "utf8"), { filename: f });

// 1. 加载数据源，拿到真实的 eliteUnlocks 与全量角色
["game-random.js", "economy-config.js", "data-cards.js", "data-ruins-content.js",
  "data-characters-core.js", "data-characters-extra.js", "data-future-characters.js",
  "data-new-characters.js", "data-characters.js", "data-future-dungeons.js",
  "data-future-orc-enemies.js", "data-bakar-enemy.js", "data-future-enemies.js",
  "data-orc-bondi.js", "data-guard-kelly.js", "data-sakura-risa.js",
  "data-machine-factory-enemies.js", "data-underwater-train-enemies.js",
  "data-ruins-sand-city-enemies.js", "data-world.js", "data.js"].forEach(load);

const eliteUnlocks = global.GameDataCards?.eliteUnlocks || {};
// 角色分散在多个全局数组里，全部收集
const chars = Object.keys(global)
  .filter(k => /^GameData\w*Characters\w*$/.test(k) && Array.isArray(global[k]))
  .flatMap(k => global[k]);
const enemies = Object.values(global.GameData?.enemies || {}).flat();

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  else console.log(`❌ ${name}  ← ${JSON.stringify(extra || {})}`);
  return !!cond;
};

T("角色表已加载（用于校验初始锁定）", chars.length > 0, { count: chars.length });

// 2. 读取四处源码
const coreSrc = fs.readFileSync("src/original/local-core-events.js", "utf8");
const eventsSrc = fs.readFileSync("src/original/new-character-unlock-events.js", "utf8")
  + fs.readFileSync("src/original/recruit-unlock-events.js", "utf8");
const hallSrc = fs.readFileSync("src/original/app-hall-bindings.js", "utf8");
const modalSrc = fs.readFileSync("src/original/app-modal-actions.js", "utf8");

// 3. 从服务端侧提取 (解锁id -> 敌人id)
const coreMap = {};
const re = /id === "([a-z_]+)" && core\.defeatedElites\?\.includes\("([a-z0-9_]+)"\)/g;
let m;
while ((m = re.exec(coreSrc))) coreMap[m[1]] = m[2];

console.log("=== 服务端侧击败条件 ===");
console.log(JSON.stringify(coreMap));

const targetChar = {
  hitwell: "hitwell", preshi: "preshi", mieryula: "mieryula",
  gerda_nursery: "gerda", chiyo_recruit: "chiyo", sonia_nursery: "sonia",
};

for (const [eventId, enemyId] of Object.entries(coreMap)) {
  // 3.1 敌人ID 必须在 eliteUnlocks 内，否则击败后根本不会写入 defeatedElites
  const list = eliteUnlocks[enemyId];
  T(`${eventId}：击败目标 ${enemyId} 登记在 eliteUnlocks（击败后能写入记录）`,
    Array.isArray(list) && list.length > 0, { enemyId, list });

  // 3.2 敌人必须真实存在
  const enemy = enemies.find(e => e.id === enemyId);
  T(`${eventId}：敌人 ${enemyId} 在敌人表中存在`, !!enemy, { enemyId, name: enemy?.name });

  // 3.3 角色初始必须锁定
  const cid = targetChar[eventId];
  if (cid) {
    const c = chars.find(x => x.id === cid);
    T(`${eventId}：角色 ${cid} 存在且初始锁定`, !!c && c.locked === true,
      { cid, locked: c?.locked });
  }

  // 3.4 完成函数必须定义（命名规则：complete + Pascal(id) + UnlockEvent）
  const pascal = eventId.split("_").map(s => s[0].toUpperCase() + s.slice(1)).join("");
  const fnName = `complete${pascal}UnlockEvent`;
  T(`${eventId}：完成函数 ${fnName} 已定义`,
    eventsSrc.includes(`window.${fnName}`), { fnName });

  // 3.5 按钮绑定必须存在（属性规则：data-{id 连字符}-unlock-complete）
  const attr = `data-${eventId.replace(/_/g, "-")}-unlock-complete`;
  T(`${eventId}：完成按钮属性 ${attr} 已绑定`,
    hallSrc.includes(attr) || modalSrc.includes(attr), { attr });

  // 3.6 弹窗侧必须使用同一敌人ID（不一致会「弹窗出来了但点了没用」）
  T(`${eventId}：弹窗侧与服务端侧使用同一敌人ID ${enemyId}`,
    eventsSrc.includes(`defeated(state, "${enemyId}")`), { enemyId });

  // 3.7 必须有防重标志，避免重复弹窗
  const flagName = `${pascal[0].toLowerCase()}${pascal.slice(1)}UnlockSeen`;
  T(`${eventId}：有 ${flagName} 防重标志`,
    coreSrc.includes(flagName) || eventsSrc.includes(flagName), { flagName });
}

// 4. 米尔尤拉专项
T("米尔尤拉：解锁进度表已登记 mieryula",
  fs.readFileSync("src/original/unlock-event-progress.js", "utf8").includes('"mieryula"'));
const mieryula = chars.find(c => c.id === "mieryula");
const art = mieryula?.art || "";
T("米尔尤拉：角色立绘文件存在",
  !!art && fs.existsSync("publish/" + art.replace(/^\.\//, "")),
  { art, exists: !!art && fs.existsSync("publish/" + art.replace(/^\.\//, "")) });
T("米尔尤拉：三个技能齐全",
  ["渴血杀戮", "无谋霸姬", "神奇怀表"].every(n => (mieryula?.skills || []).some(s => s.name === n)),
  { skills: (mieryula?.skills || []).map(s => s.name) });
// 成长表在 character-progression.js（20 级总量），不在角色条目里
const progSrc = fs.readFileSync("src/original/character-progression.js", "utf8");
const gm = progSrc.match(/mieryula:\s*\{([^}]*)\}/);
const gv = gm ? Object.fromEntries(gm[1].split(",").map(s => s.split(":")
  .map(x => x.trim())).filter(p => p.length === 2).map(([k, v]) => [k, Number(v)])) : null;
T("米尔尤拉：高阶成长表落在统一档位网格上（20级总量 198.63/41.2/20.41/40.13）",
  !!gv && gv.maxHp === 198.63 && gv.attack === 41.2 && gv.magic === 20.41 && gv.speed === 40.13, { gv });
// 所有可解锁角色都应有专属成长表，否则会静默走 fallback
for (const cid of Object.values(targetChar)) {
  T(`${cid}：在 character-progression 中有专属成长表`,
    new RegExp(`\\b${cid}:\\s*\\{`).test(progSrc), { cid });
}

console.log(`\n通过 ${pass}/${total}`);
process.exit(pass === total ? 0 : 1);
