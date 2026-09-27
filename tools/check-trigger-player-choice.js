// 触发技（type: "trigger"）玩家选择权审计
//
// 触发技的语义是「满足条件时触发，或弹出响应选择」。若一个触发技在触发后
// 只锁定界面、强迫玩家走唯一路径（没有任何放弃入口），玩家就被剥夺了选择权，
// 与「你可以……」的描述不符。
//
// 历史 BUG：指挥官责任（卡迪西斯，trigger）触发后 battle.locked = true，
// 手牌区只提示「点击一张手牌交给目标」，既没有放弃按钮也没有其他跳过途径，
// 玩家被强制交牌。同类技能（次元转移/半魅魔血/萌虎慰劳/收获分享/霹雳之锤）
// 都有放弃或不交按钮，唯独它缺失——本次审计就是为了自动发现这类遗漏。
//
// 判定口径（两条）：
//   1) 走通用反击面板：技能名注册在 battle-counter-triggers.js 的 resolvers 中。
//      该面板统一渲染「发动 / 跳过」两个按钮，玩家必定有选择权。
//   2) 有专属弹窗，且渲染该技能的 UI 片段里带放弃类按钮
//      （data-*-skip / data-cancel-* / 中文 放弃·不交·跳过·弃置）。
// 两条都不命中 → 判为「无选择入口」，需要人工确认是设计如此还是遗漏。

const fs = require("fs");
const vm = require("vm");
const { installGlobals, loadRuntime } = require("./skill-coverage-fixtures");

installGlobals();
loadRuntime();

[
  "data-characters.js",
  "data-characters-core.js",
  "data-characters-extra.js",
  "data-new-characters.js",
  "data-future-characters.js",
  "data-relics.js",
  "data-future-relics.js",
  "data-ruins-content.js",
].forEach(f => {
  const p = `./src/original/${f}`;
  if (fs.existsSync(p)) {
    vm.runInThisContext(fs.readFileSync(p, "utf8"), { filename: f });
  }
});

const readSrc = f => fs.readFileSync(`./src/original/${f}`, "utf8");

// 只注册执行器还不够：必须真的在触发路径里调了 BattleCounterTriggers.open，
// 否则模块没接上时会静默退化成「自动生效」，玩家依旧没有选择权（审计会漏判）。
const ENGINE_FILES = fs.readdirSync("./src/original").filter(f => f.endsWith(".js"));
// 排除 battle-counter-triggers.js 自身：它里面就有 "技能名" 字样（resolver 的 key），
// 若把它算进来，即使引擎根本没调用 open，审计也会误判为「已接入」。
const openedInEngine = skill => ENGINE_FILES.some(f => {
  if (f === "battle-counter-triggers.js") return false;
  const t = readSrc(f);
  return t.includes("BattleCounterTriggers")
    && new RegExp(`skill:\\s*"${skill}"`).test(t);
});

// ---- 1. 通用反击面板注册的技能（统一有「发动 / 跳过」） ----
const counterSrc = readSrc("battle-counter-triggers.js");
const resolverBlock = counterSrc.slice(
  counterSrc.indexOf("const resolvers = {"),
  counterSrc.indexOf("};", counterSrc.indexOf("const resolvers = {")),
);
const counterSkills = [...resolverBlock.matchAll(/"([^"]+)":/g)].map(m => m[1]);

// ---- 2. UI 文件（渲染触发技弹窗的地方） ----
const UI_FILES = [
  "ui-hand-view.js",
  "ui-battle-pickers.js",
  "battle-response-ui.js",
  "ui-battle-overlays.js",
];
const uiLines = UI_FILES.flatMap(f => readSrc(f).split("\n").map(line => ({ f, line })));
const CANCEL_RE = /data-[a-z-]*(?:skip|cancel|discard)[a-z-]*="1"|放弃|不交|跳过|直接弃置/;

function hasCancelButton(skillName) {
  return uiLines.some(({ line }) => line.includes(skillName)
    && line.includes("<button") && CANCEL_RE.test(line));
}

// ---- 3. 收集触发技 ----
const skills = [];

// 3a. 角色技能（可玩角色数据）
const charSources = {
  "data-characters-core.js": window.GameDataCharactersCore,
  "data-characters-extra.js": window.GameDataCharactersExtra,
  "data-new-characters.js": window.GameDataNewCharacters,
  "data-future-characters.js": window.GameDataFutureCharacters,
};
const collect = (list, file, ownerName) => (list || []).forEach(ch => {
  const raw = ch.skills || [];
  raw.forEach(s => {
    if (typeof s === "object" && s.type === "trigger") {
      skills.push({
        kind: "角色技能", name: s.name, owner: ownerName(ch), file,
        text: s.text || "",
      });
    }
  });
});
for (const [file, data] of Object.entries(charSources)) {
  const list = Array.isArray(data) ? data : (data?.characters || []);
  collect(list, file, ch => ch.name || ch.id);
}

// 3b. 已知的可玩角色触发技（定义在独立技能文件里，不在角色数据数组中）
[["manny-skills.js", readSrc("manny-skills.js")]].forEach(([file, src]) => {
  [...src.matchAll(/name:\s*"([^"]+)",\s*type:\s*"trigger"/g)]
    .forEach(m => skills.push({
      kind: "角色技能", name: m[1], owner: "曼妮", file,
      text: (src.match(new RegExp(`name:\\s*"${m[1]}"[\\s\\S]{0,400}?text:\\s*"([^"]*)"`)) || [])[1] || "",
    }));
});

// 3c. 饰品触发技
const relicSources = {
  "data-relics.js": window.GameDataRelics,
  "data-future-relics.js": window.GameDataFutureRelics,
  "data-ruins-content.js": window.GameDataRuinsContent,
};
for (const [file, data] of Object.entries(relicSources)) {
  // data-ruins-content.js 的饰品在 .relics 子键下（根上还有 cards 数组）。
  const relics = data?.relics || data || {};
  Object.entries(relics).forEach(([name, def]) => {
    if (def?.skillType === "trigger") {
      skills.push({
        kind: "饰品", name, owner: def.source || "", file,
        text: def.effect || "",
      });
    }
  });
}

// 去重
const seen = new Set();
const list = skills.filter(s => {
  const k = `${s.kind}|${s.name}`;
  if (seen.has(k)) return false;
  seen.add(k); return true;
});

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`✅ ${name}${extra ? "  " + extra : ""}`); }
  else { fail++; console.log(`❌ ${name}${extra ? "  " + extra : ""}`); }
};

console.log(`===== 触发技玩家选择权审计（共 ${list.length} 项）=====\n`);
console.log(`通用反击面板已注册：${counterSkills.join(" / ")}\n`);

for (const s of list) {
  const viaCounter = counterSkills.includes(s.name);
  const viaButton = hasCancelButton(s.name);
  const canDecide = viaCounter || viaButton;
  const how = viaCounter ? "通用面板「发动/跳过」" : viaButton ? "专属弹窗有放弃按钮" : "无入口";
  // 描述里写了「你可以……」= 玩家有选择权，必须有放弃入口；
  // 没写「可以」的是强制触发（满足条件即生效），不需要选择入口。
  const optional = /你可以|可以选择/.test(s.text);
  if (optional) {
    // 饰品触发技若靠通用面板，还要确认引擎真的开了面板（防止「注册了却没调用」）
    const opened = s.kind !== "饰品" || !viaCounter || openedInEngine(s.name);
    ok(`${s.kind}·${s.name}`, canDecide && opened,
      `（${how}；描述含「你可以」，玩家须能放弃${opened ? "" : "；⚠️ 引擎未调用 open"}）`);
  } else {
    ok(`${s.kind}·${s.name}`, true, `（强制触发，无需选择；${how}）`);
    if (canDecide) console.log(`     注：${s.name} 描述未写「可以」，但界面仍提供了放弃入口。`);
  }
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
