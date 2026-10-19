// 「出牌阶段限一次」统一登记表回归测试。
// 目的：全项目只有 skill-once-per-turn.js 里 SkillOncePerTurn 一份登记，
// 新增技能若漏登记（置灰 / 二次使用守卫 / 回合重置三处任一缺一），这里立刻报错。
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const srcDir = path.join(root, "src", "original");
const read = file => fs.readFileSync(path.join(srcDir, file), "utf8");
const allSource = fs.readdirSync(srcDir).filter(f => f.endsWith(".js"))
  .map(read).join("\n");

let pass = 0; const failures = [];
function check(ok, label, detail) {
  if (ok) { pass++; return; }
  failures.push(`${label}${detail ? `  ← ${JSON.stringify(detail)}` : ""}`);
}

// 注册表独占一个文件（原挂 battle-card-playability.js 顶部，已拆出）。
const registrySource = read("skill-once-per-turn.js");
const ctx = { window: {}, console };
vm.createContext(ctx);
vm.runInContext(registrySource, ctx);
const R = ctx.window.SkillOncePerTurn;

check(!!R && Array.isArray(R.FLAGS), "登记表已导出", { has: !!R });

// ── 一、技能文案 → 卡牌标记：新增「出牌阶段限一次」技能必须在这里补一行 ──
// 值允许为数组（同一技能名对应多个卡牌标记，如敌方与我方共用同名技能）。
const NAME_FLAGS = {
  "热血契约": ["bloodPact"], "次元军火库": ["mannyArmory"], "贪玩老虎机": ["millerSlot"],
  "偶像之吻": ["idolKiss"], "解答迷惑": ["wendyTutor"], "疯狂射击": ["crazyShooting"],
  "苦肉鞭笞": ["bertisWhip"], "取粮": ["bertisTakeFood"], "猩红暴走": ["crimsonRampage"],
  "回春之手": ["elranaHeal"], "贡献计划": ["aceContribution"], "计算下注": ["ailengBet"],
  "充能精华": ["ailengCharge"], "终焉鬼影斩": ["bestaEndSlash"], "窃取": ["catherineSteal"],
  "女王榨取": ["preshiDrain"], "杀欲窥视": ["withererPeek"], "狙击目标": ["artinaSniper", "ruinsSnipe"],
  "荣誉祝福": ["mariaHonorBlessing"], "半魅魔精华": ["kaiichiMilk"],
  "无人机采精": ["droneExtract"], "魔法巡飞弹": ["magicMissile"],
  "索敌雷达": ["radar"], "毒气手雷": ["poisonGrenade"], "歼灭模式": ["bullHammer"],
  "放置地雷": ["ruinsPlaceLandmine"], "坦克炮弹": ["ruinsTankShell"],
  "控神魔眼": ["controlEye"], "猛龙断空斩": ["dragonSlash"], "震感闪光弹": ["flashbang"],
  // 限定技（整场一次）不参与回合重置，单独白名单。
  "疯狂屠戮": ["crazySlaughter"],
};

const skillNames = new Set();
fs.readdirSync(srcDir).filter(f => f.startsWith("data-") && f.endsWith(".js")).forEach(file => {
  const re = /\{\s*name:\s*"([^"]+)"[^}]*?text:\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(read(file)))) if (m[2].includes("出牌阶段限一次")) skillNames.add(m[1]);
});
check(skillNames.size >= 28, "已扫描到出牌阶段限一次技能", { count: skillNames.size });
for (const name of [...skillNames].sort()) {
  check(Array.isArray(NAME_FLAGS[name]), `技能文案已登记：${name}`, { name });
}

// ── 二、每个登记的标记都能在登记表里解析到字段 ──
const flagFields = new Map(R.FLAGS);
const specialFlags = new Set(R.SPECIAL.map(entry => entry[0]));
for (const [name, flags] of Object.entries(NAME_FLAGS)) {
  for (const flag of flags) {
    const field = flagFields.get(flag);
    check(!!field || specialFlags.has(flag), `标记已入登记表：${name}/${flag}`, { flag });
  }
}

// ── 三、字段必须有回合重置点，否则用过一次就永久置灰、AI 也永远不再使用 ──
const turnReset = read("battle-turn-state.js");
const limitedOnce = new Set(["crazySlaughter"]); // 限定技：整场一次，不重置才是对的
for (const [flag, field] of R.FLAGS) {
  if (limitedOnce.has(flag)) continue;
  const resetInTurnState = new RegExp(`\\b${field}\\s*=\\s*false`).test(turnReset);
  const resetElsewhere = new RegExp(`\\b${field}\\s*=\\s*false`).test(allSource);
  const deletedElsewhere = new RegExp(`delete\\s+\\w+\\.${field}\\b`).test(allSource);
  check(resetInTurnState || resetElsewhere || deletedElsewhere,
    `已使用标记有回合重置点：${flag}`, { field });
}

// ── 四、行为：用过置灰、未用不置灰（含敌方技能卡落到我方手上的情况）──
for (const [flag, field] of R.FLAGS) {
  const card = { _skill: true, name: "t", [flag]: true };
  check(R.blocked({ [field]: true, hand: [] }, card, {}), `用过即拦截：${flag}`, { field });
  check(!R.blocked({ [field]: false, hand: [] }, card, {}), `未用不拦截：${flag}`, { field });
  check(!R.blocked({ hand: [] }, card, {}), `字段缺失不误拦截：${flag}`, { field });
}
// 敌方技能卡落到我方角色手上时同样置灰（未来复制技能类角色的前提）
check(R.blocked({ side: "ally", usedDragonSlash: true, hand: [] },
  { _skill: true, dragonSlash: true }, {}), "敌方技能卡对我也置灰：猛龙断空斩");
check(R.blocked({ side: "ally", hammerUsed: true, hand: [] },
  { _skill: true, bullHammer: true }, {}), "敌方技能卡对我也置灰：恐怖巨锤");
check(R.blocked({ side: "ally", radarUsed: true, hand: [] },
  { _skill: true, radar: true }, {}), "敌方技能卡对我也置灰：索敌雷达");
check(R.blocked({ side: "ally", grenadeUsed: true, hand: [] },
  { _skill: true, poisonGrenade: true }, {}), "敌方技能卡对我也置灰：毒气手雷");
// 非技能卡不带这些标记时不得误伤
check(!R.blocked({ usedExtract: true, hand: [] }, { name: "杀", type: "slash" }, {}),
  "普通杀牌不受登记表影响");

// ── 五、二次使用守卫与置灰必须同源 ──
const ruins = read("ruins-enemy-skills.js");
check(/window\.SkillOncePerTurn/.test(ruins) && /registry\.blocked\(actor, card\)/.test(ruins),
  "二次使用守卫走同一登记表");
check(/oncePerTurnRegistry\(\)\.blocked/.test(read("battle-card-playability.js")),
  "置灰判据走同一登记表");
// 缺文件时必须抛错，不能静默放行（静默=用过了还能用且无报错）
check(/skill-once-per-turn\.js 必须先于 ruins-enemy-skills\.js 加载/.test(ruins),
  "二次使用守卫：缺登记表时抛错");
check(/skill-once-per-turn\.js 必须先于 battle-card-playability\.js 加载/
  .test(read("battle-card-playability.js")), "置灰判据：缺登记表时抛错");

// ── 六、AI 决策入口必须尊重「已使用」标记（否则会每回合反复尝试同一技能）──
const aiRespects = [
  ["索敌雷达", /actor\.radarUsed/, "enemy-tactical-skills.js"],
  ["毒气手雷", /actor\.grenadeUsed/, "enemy-tactical-skills.js"],
  ["恐怖巨锤", /actor\.hammerUsed/, "machine-factory-skills.js"],
];
for (const [name, re, file] of aiRespects) {
  check(re.test(read(file)), `AI 决策尊重已使用标记：${name}`, { file });
}

// ── 七、夹具必须同时加载登记表 ──
// blockedByUsage 在缺登记表时直接抛错，而不是静默放行。所以任何在 node 里手工
// 加载 playability 的夹具都必须顺带加载 skill-once-per-turn.js，否则一调用就炸。
// 两个消费方都会在缺登记表时抛错：置灰走 battle-card-playability.js，
// 二次使用守卫走 ruins-enemy-skills.js，夹具只要加载其一就必须带上登记表。
{
  const toolFiles = fs.readdirSync(__dirname).filter(f => f.endsWith(".js"));
  const consumers = ["battle-card-playability.js", "ruins-enemy-skills.js"];
  const missing = [];
  for (const file of toolFiles) {
    const text = fs.readFileSync(path.join(__dirname, file), "utf8");
    // 只看真的在 node 里 run 源码的夹具；纯静态扫描 / 浏览器实机类不在此列
    if (!text.includes("vm.runInThisContext(")) continue;
    const hits = consumers.filter(name => text.includes(name));
    if (!hits.length) continue;
    if (!/skill-once-per-turn\.js/.test(text)) missing.push(`${file} ← ${hits.join(",")}`);
  }
  check(missing.length === 0, "加载消费方的夹具均已加载登记表", { missing });
}

// ── 八、实测：缺登记表时必须抛错而非静默放行 ──
// 只验源码文本还不够——要真的在没有登记表的作用域里跑一次，确认是 throw 而不是
// 返回 false（静默返回 false 会让技能用过了还能用，是最危险的一种失败形态）。
{
  // 只装 playability、不装登记表，再真的调用一次 canPlay。
  const sandbox = { console };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read("battle-card-playability.js"), sandbox);
  const actor = { side: "ally", hp: 100, ref: "nanali", hand: [{ name: "杀" }] };
  const battle = { allies: [actor], enemies: [], phase: 1 };
  let thrown = "";
  try {
    sandbox.BattleCardPlayability({ isKillCard: () => false })
      .canPlay(actor, { _skill: true, extract: true, type: "tactic" }, battle);
  } catch (err) {
    thrown = String((err && err.message) || err);
  }
  check(/skill-once-per-turn\.js 必须先于/.test(thrown),
    "缺登记表时置灰判据抛错（非静默放行）", { thrown });
}

// ── 九、共享装配：登记表打进每个含消费方的 bundle，且包内排在其消费方之前 ──
// 登记表原本只在 battle-rules，而 ruins-enemy-skills.js 在 battle-skills——跨包依赖。
// 抛错式取值意味着一旦取不到全局，任何一次 isSkillBlocked 调用都会炸。
// 因此登记表改为共享文件：同时打进两个包，每个包内自给自足，不再依赖跨包顺序。
{
  const manifest = JSON.parse(fs.readFileSync(
    path.join(__dirname, "publish-bundles.json"), "utf8"));
  const shared = require("./publish-bundle-shared.js");
  const registry = "skill-once-per-turn.js";

  check(shared.sharedFileNames.includes(registry),
    "登记表在共享白名单内", { got: shared.sharedFileNames });

  // 每个含有消费方的 bundle 都必须自带登记表（否则跨包依赖复活）
  const groupsWith = file => Object.keys(manifest)
    .filter(name => Array.isArray(manifest[name]) && manifest[name].includes(file));
  for (const consumer of shared.SHARED_SOURCES[0].consumers) {
    for (const group of groupsWith(consumer)) {
      check(groupsWith(registry).includes(group),
        `登记表已打进 ${group}（消费方 ${consumer} 所在包）`,
        { group, consumer, registryIn: groupsWith(registry) });
    }
  }
  check(groupsWith(registry).length >= 2,
    "登记表同时存在于多个 bundle", { groups: groupsWith(registry) });

  // 共享只在「幂等 + 包内先于消费方」时才安全
  const source = read(registry);
  check(/window\.SkillOncePerTurn\s*=/.test(source),
    "登记表为零依赖纯声明式赋值（重复执行幂等）", { sample: source.slice(0, 80) });
  const sharedOrderFailures = shared.sharedOrderFailures(manifest);
  check(sharedOrderFailures.length === 0,
    "共享文件在各 bundle 内均先于其消费方", sharedOrderFailures);

  // 顺序只在串行加载下才作数；并行加载会让先到的先执行
  const scriptLoader = read("runtime-script-loader.js");
  check(/script\.async = false/.test(scriptLoader) && /\.reduce\(/.test(scriptLoader),
    "bundle 分段为串行加载（顺序可被依赖）");
}

if (failures.length) {
  console.log(`FAIL ${pass} passed, ${failures.length} failed`);
  failures.forEach(line => console.log(`  ✗ ${line}`));
  process.exit(1);
}
console.log(`PASS ${pass}/${pass}`);
