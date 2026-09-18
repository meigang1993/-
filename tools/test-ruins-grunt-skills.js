// 废墟沙城 4 个普通怪技能实现检查（node 级，直接调用技能函数）
// 覆盖：放置地雷 / 狙击目标 / 坦克炮弹 / 麻痹毒子弹
const fs = require("fs");
const vm = require("vm");
const {
  assert, card, unitFromCharacter, enemyFromTemplate, createState,
  installGlobals, loadRuntime,
} = require("./skill-coverage-fixtures");

installGlobals();
loadRuntime();
[
  "battle-status-card-registry.js",
  "battle-status-card-storage.js",
  "battle-status-card-triggers.js",
  "battle-status-cards.js",
  "data-ruins-sand-city-enemies.js",
  "ruins-grunt-skills.js",
  "ruins-enemy-skills.js",
].forEach(file => vm.runInThisContext(
  fs.readFileSync(`./src/original/${file}`, "utf8"),
  { filename: file },
));

let passed = 0, failed = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passed++; console.log(`✅ ${name}${detail ? " — " + detail : ""}`); }
  else { failed++; console.log(`❌ ${name}${detail ? " — " + detail : ""}`); }
};

const grunts = window.GameDataRuinsSandCityEnemies;
const find = id => grunts.find(d => d.id === id);
const mkGrunt = id => {
  const def = find(id);
  const unit = enemyFromTemplate(def, "e0");
  unit.ai = def.ai;
  return unit;
};
const mkAlly = () => unitFromCharacter(window.GameData.characters[0], "a0");
const slash = (suit = "♠") => card("杀", "slash", { suit, power: 0, scale: "attack" });
const dodge = (suit = "♥") => card("闪", "response", { suit });

console.log("=== 废墟沙城 普通怪技能 实现检查 ===\n");

// ---------- 1. 贵族军士兵 · 放置地雷 ----------
{
  const def = find("noble_soldier");
  check("1.1 数据表存在", !!def, `${def?.name} ai=${def?.ai}`);
  check("1.2 基础属性", def?.attack === 11 && def?.magic === 8 && def?.speed === 12
    && def?.hp === 64 && def?.bloodlust === 1 && def?.handLimit === 4
    && def?.drawPerTurn === 2 && def?.initialDraw === 2,
    `攻${def?.attack} 魔${def?.magic} 速${def?.speed} 血${def?.hp} 杀意${def?.bloodlust} 手牌${def?.handLimit} 摸${def?.drawPerTurn}+${def?.initialDraw}`);
  check("1.3 性别/所属", def?.gender === "male", `gender=${def?.gender}`);

  const state = createState();
  const actor = mkGrunt("noble_soldier");
  const ally = mkAlly();
  ally.hand = [dodge(), dodge(), slash("♦")];
  state.battle.enemies = [actor];
  state.battle.allies = [ally];
  actor.hand = [slash("♠"), slash("♣")];

  const move = window.RuinsGruntSkills.landmineMove(state, actor);
  check("1.4 出牌阶段产生放置地雷决策", !!move && move.card?.name === "放置地雷",
    `move=${move?.card?.name || "null"}`);
  check("1.5 目标=响应牌最多的敌方", move?.target === ally,
    `target=${move?.target?.name}`);

  if (move) {
    window.RuinsGruntSkills.usePlaceLandmine(state, actor, move.target);
    const hasMine = (ally.hand || []).some(c => c.name === "地雷");
    check("1.6 目标手牌区生成地雷状态牌", hasMine,
      `手牌=${(ally.hand || []).map(c => c.name).join(",")}`);
    const mine = (ally.hand || []).find(c => c.name === "地雷");
    check("1.7 地雷无虚无属性", mine && mine.void === false, `void=${mine?.void}`);
    check("1.8 地雷记录来源攻击力", mine && mine.landmineAttack === def.attack,
      `landmineAttack=${mine?.landmineAttack} (期望${def?.attack})`);
  }

  // 响应式：使用/打出响应牌时触发伤害
  const before = ally.hp;
  const triggered = window.BattleStatusCards.triggerLandmine?.(state, ally);
  check("1.9 响应牌触发地雷伤害", triggered === true, `triggered=${triggered}`);
  check("1.10 伤害=来源攻击力", before - ally.hp === def.attack,
    `掉血=${before - ally.hp} 期望=${def?.attack}`);
  const stillHas = (ally.hand || []).some(c => c.name === "地雷");
  check("1.11 触发后地雷消耗", !stillHas, `残留=${stillHas}`);

  // 猜拳小游戏
  const G = window.RuinsGruntSkills;
  check("1.12 地雷猜拳：AI 决策存在", typeof G?.landmineRpsMove === "function"
    && typeof G?.useLandmineRps === "function", "landmineRpsMove/useLandmineRps");
  check("1.13 地雷猜拳：玩家结算入口", typeof G?.resolveLandmineRpsChoice === "function"
    && typeof G?.confirmLandmineRps === "function"
    && typeof G?.skipLandmineRps === "function", "resolveChoice/confirm/skip");
  {
    // 持有者赢 → 地雷消耗且不掉血
    const s3 = createState();
    const holder = mkAlly();
    const src = mkGrunt("noble_soldier");
    s3.battle.allies = [holder]; s3.battle.enemies = [src];
    const mine = window.BattleStatusCardRegistry.create("landmine", src);
    holder.hand = [mine];
    const hp0 = holder.hp;
    window.__forceWin = true;
    // 直接验证结算函数：holder 赢
    G.confirmLandmineRps && (s3.battle.landmineRpsPrompt = {
      holderUid: holder.uid, sourceUid: src.uid, amount: mine.landmineAttack,
      result: { holderChoice: "石头", sourceChoice: "剪刀", outcome: "holder" },
    });
    G.confirmLandmineRps?.(s3);
    check("1.14 持有者赢→地雷消耗且不掉血",
      !(holder.hand || []).some(c => c.name === "地雷") && holder.hp === hp0,
      `手牌=${(holder.hand || []).map(c => c.name).join(",") || "空"} hp ${hp0}→${holder.hp}`);
    // 来源赢 → 掉血
    const s4 = createState();
    const h2 = mkAlly(); const src2 = mkGrunt("noble_soldier");
    s4.battle.allies = [h2]; s4.battle.enemies = [src2];
    const mine2 = window.BattleStatusCardRegistry.create("landmine", src2);
    h2.hand = [mine2]; const hp2 = h2.hp;
    s4.battle.landmineRpsPrompt = {
      holderUid: h2.uid, sourceUid: src2.uid, amount: mine2.landmineAttack,
      result: { holderChoice: "石头", sourceChoice: "布", outcome: "source" },
    };
    G.confirmLandmineRps?.(s4);
    check("1.15 来源赢→掉血且地雷消耗",
      !(h2.hand || []).some(c => c.name === "地雷") && hp2 - h2.hp === mine2.landmineAttack,
      `掉血=${hp2 - h2.hp} 期望=${mine2.landmineAttack}`);
  }
}

// ---------- 2. 贵族军狙击手 · 狙击目标 ----------
{
  const def = find("noble_sniper");
  check("2.1 数据表存在", !!def, `${def?.name} ai=${def?.ai}`);
  check("2.2 基础属性", def?.attack === 14 && def?.magic === 9 && def?.speed === 15
    && def?.hp === 58 && def?.bloodlust === 1 && def?.handLimit === 4
    && def?.drawPerTurn === 1 && def?.initialDraw === 1,
    `攻${def?.attack} 魔${def?.magic} 速${def?.speed} 血${def?.hp} 摸${def?.drawPerTurn}+${def?.initialDraw}`);

  const state = createState();
  const actor = mkGrunt("noble_sniper");
  const ally = mkAlly();
  // 目标展示 ♦，我方 ♦ 更多 → 锁定
  ally.hand = [card("杀", "slash", { suit: "♦" })];
  actor.hand = [card("杀", "slash", { suit: "♦" }), card("杀", "slash", { suit: "♦" })];
  state.battle.enemies = [actor];
  state.battle.allies = [ally];

  const move = window.RuinsGruntSkills.sniperMove(state, actor);
  check("2.3 产生狙击目标决策", !!move && move.card?.name === "狙击目标",
    `move=${move?.card?.name || "null"}`);
  if (move) {
    window.RuinsGruntSkills.useSnipe(state, actor, move.target);
    check("2.4 花色比较后锁定", actor.ruinsSniperLocked === true,
      `locked=${actor.ruinsSniperLocked} suit=${actor.ruinsSniperSuit}`);
    const k = slash("♦");
    window.RuinsGruntSkills.beforeKillTargeted(state, actor, move.target, k);
    check("2.5 单体杀不可响应", k.ignoreResponse === true,
      `ignoreResponse=${k.ignoreResponse}`);
  }
  // 花色不占优时不锁定
  const s2 = createState();
  const a2 = mkGrunt("noble_sniper");
  const t2 = mkAlly();
  t2.hand = [card("杀", "slash", { suit: "♦" }), card("杀", "slash", { suit: "♦" })];
  a2.hand = [card("杀", "slash", { suit: "♦" })];
  s2.battle.enemies = [a2]; s2.battle.allies = [t2];
  const m2 = window.RuinsGruntSkills.sniperMove(s2, a2);
  if (m2) window.RuinsGruntSkills.useSnipe(s2, a2, m2.target);
  check("2.6 花色不占优则不锁定", a2.ruinsSniperLocked === false,
    `locked=${a2.ruinsSniperLocked}`);
}

// ---------- 3. 梅尔卡坦克 · 坦克炮弹 ----------
{
  const def = find("merca_tank");
  check("3.1 数据表存在", !!def, `${def?.name} ai=${def?.ai}`);
  check("3.2 基础属性", def?.attack === 16 && def?.magic === 12 && def?.speed === 12
    && def?.hp === 85 && def?.bloodlust === 1 && def?.handLimit === 4
    && def?.drawPerTurn === 3 && def?.initialDraw === 2,
    `攻${def?.attack} 魔${def?.magic} 速${def?.speed} 血${def?.hp} 摸${def?.drawPerTurn}+${def?.initialDraw}`);

  const G3 = window.RuinsGruntSkills;
  check("3.3 tankMove/useTankShell/tankPrepare 导出",
    typeof G3?.tankMove === "function" && typeof G3?.useTankShell === "function"
    && typeof G3?.tankPrepare === "function", "三个函数齐全");
  {
    const state = createState();
    const actor = mkGrunt("merca_tank");
    const ally = mkAlly();
    ally.hp = 200; ally.maxHp = 200;
    state.battle.enemies = [actor]; state.battle.allies = [ally];
    actor.hand = [slash("♠"), slash("♣"), slash("♥")];
    const move = G3.tankMove?.(state, actor);
    check("3.4 有2张单体杀时产生装填决策", !!move && move.card?.name === "坦克炮弹",
      `move=${move?.card?.name || "null"}`);
    G3.useTankShell?.(state, actor);
    check("3.5 弃置2张单体杀", (actor.hand || []).filter(c => c.name === "杀").length === 1,
      `剩余杀=${(actor.hand || []).filter(c => c.name === "杀").length}`);
    check("3.6 获得炮弹标记", actor.ruinsTankShellReady === true,
      `ready=${actor.ruinsTankShellReady}`);
    // 准备阶段发射：攻击力2倍
    const hpBefore = ally.hp;
    let dealt = 0;
    G3.tankPrepare?.(state, actor, (st, target, amount) => { dealt += amount; target.hp -= amount; });
    check("3.7 准备阶段发射·伤害=攻击力2倍", dealt === def.attack * 2,
      `打出伤害=${dealt} 期望=${def.attack * 2}`);
    check("3.8 发射后标记消耗", actor.ruinsTankShellReady === false,
      `ready=${actor.ruinsTankShellReady}`);
  }
}

// ---------- 4. 攻击型无人机 · 麻痹毒子弹 ----------
{
  const def = find("attack_drone");
  check("4.1 数据表存在", !!def, `${def?.name} ai=${def?.ai}`);
  check("4.2 基础属性", def?.attack === 12 && def?.magic === 10 && def?.speed === 17
    && def?.hp === 47 && def?.bloodlust === 2 && def?.handLimit === 3
    && def?.drawPerTurn === 2 && def?.initialDraw === 1,
    `攻${def?.attack} 魔${def?.magic} 速${def?.speed} 血${def?.hp} 杀意${def?.bloodlust} 手牌${def?.handLimit}`);

  const state = createState();
  const actor = mkGrunt("attack_drone");
  const ally = mkAlly();
  ally.hand = [];
  state.battle.enemies = [actor];
  state.battle.allies = [ally];

  const k = slash("♠");
  window.RuinsGruntSkills.afterDamage(state, actor, ally, k, 5);
  const gotPara = (ally.hand || []).some(c => c.name === "麻痹");
  check("4.3 单体杀造成伤害后生成麻痹状态牌", gotPara,
    `手牌=${(ally.hand || []).map(c => c.name).join(",") || "空"}`);

  const k2 = slash("♠");
  window.RuinsGruntSkills.beforeKillUsed?.(state, actor, k2);
  check("4.4 单体杀转为毒属性", k2.poison === true, `card.poison=${k2.poison}`);
  {
    const st = createState(); const dr = mkGrunt("attack_drone"); const al = mkAlly();
    st.battle.enemies = [dr]; st.battle.allies = [al]; al.hand = [];
    const k3 = slash("♠");
    window.RuinsGruntSkills.beforeKillUsed?.(st, dr, k3);
    window.RuinsGruntSkills.afterDamage(st, dr, al, k3, 5);
    check("4.4b 造成伤害后附加1层毒", (al.poison || 0) >= 1, `毒层数=${al.poison || 0}`);
  }

  // 麻痹判定：♥或♠ → 无法使用牌
  const reg = window.BattleStatusCardRegistry.create("paralysis");
  check("4.5 麻痹状态牌定义", reg?.name === "麻痹", `name=${reg?.name}`);
  const trig = fs.readFileSync("./src/original/battle-status-card-triggers.js", "utf8");
  check("4.6 麻痹判定♥/♠生效", /paralysis[\s\S]{0,200}♥[\s\S]{0,60}♠/.test(trig)
    || /suit === "♥" \|\| card.suit === "♠"/.test(trig), "判定条件存在");
}

console.log(`\n汇总：${passed} 通过 / ${failed} 失败`);
process.exit(failed ? 1 : 0);
