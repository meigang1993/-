// 238 难度调整后「压缩过的核心伤害结算」严格复查：
//   1) battle-damage-resolution.js（230 版压缩到 180 行内）相对 HEAD 未被改动、关键守卫齐全；
//   2) 真实加载压缩后的 resolveDamage，验证取整/免疫/时停/响应/locked 等守卫没在压缩中丢失；
//   3) 四档难度 × 全部怪物 × 三种类型 × 强化加成，验证倍率只应用一次且不漏进结算链；
//   4) REVERT=round|immune|locked|mult|notice 源码级反向验证，断言不是空转。
const fs = require("fs");
const vm = require("vm");
const { execFileSync } = require("child_process");
const REVERT = process.env.REVERT || "";
const code = f => fs.readFileSync(`./${f}`, "utf8");
const RES = "src/original/battle-damage-resolution.js";

// ---- 数据侧：复用既有夹具加载真实 GameData（含 238 难度表与全部怪物）----
global.window = global;
function loadData(f) { vm.runInThisContext(code("src/original/" + f), { filename: f }); }
[
  "game-random.js", "economy-config.js", "data-cards.js", "card-utils.js",
  "data-characters-core.js", "data-characters-extra.js",
  "data-future-characters.js", "data-new-characters.js", "data-characters.js",
  "character-progression.js", "character-enhance.js",
  "data-ruins-sand-city-enemies.js", "data-ruins-sand-city.js", "data-ruins-content.js",
  "data-future-dungeons.js", "data-future-orc-enemies.js", "data-bakar-enemy.js",
  "data-future-enemies.js", "data-orc-bondi.js", "data-guard-kelly.js", "data-sakura-risa.js",
  "data-machine-factory-enemies.js", "data-underwater-train-enemies.js",
  "data-world.js", "data.js", "data-future-relics.js", "data-relics.js",
].forEach(loadData);

// ---- 结算侧：独立 vm，便于 REVERT 重新加载打过补丁的源码 ----
function makeResolution(src, flags = {}) {
  const calls = { hit: [], anim: [], white: [], log: [], tactic: [], out: [], inc: [] };
  const ctx = {
    console, Math, Number, Object, Array, JSON, String, Boolean, Error, Promise,
    window: null, calls,
  };
  ctx.window = ctx;
  ctx.BattleWhiteLolita = () => ({ triggerWhiteLolita: () => calls.white.push(1) });
  ctx.BattleLog = { add: (_s, t) => calls.log.push(t) };
  ctx.RuinsEliteSkills = { immuneIncoming: () => !!flags.immune };
  ctx.GerdaSkills = { allowKill: () => flags.allowKill !== false };
  ctx.WithererSkills = { afterKillFailed: () => {}, refreshShiftState: () => {} };
  ctx.FloraCarlosSkills = { queueSpeedAssaultSettlement: () => {}, dodgeAsFlash: () => null };
  ctx.BondiSkills = { invalidateKillCard: () => false };
  ctx.ElranaAceNanaliSkills = { beforeKillTargeted: () => {}, modifySlashDamage: (_s, _a, _t, n) => n };
  ctx.NonokaLokiSkills = { sourceActor: () => null, sourceLabel: () => null };
  ctx.MieryulaTimeStop = { isSkillDisabled: () => !!flags.ts, suppressesResponse: () => false };
  ctx.RuinsRelicEffects = { tacticDamage: (_s, _a, _c, n) => { calls.tactic.push(n); return n; },
    modifyIncomingDamage: (_s, _t, n) => n, beforeResponseCheck: () => {},
    missileLauncherBlock: () => true };
  ctx.BakarSkills = { modifyOutgoingDamage: (_s, _a, n) => { calls.out.push(n); return n; }, modifyIncomingDamage: (_s, _t, n) => n };
  ctx.AngelicaLukaSkills = { modifyOutgoingDamage: (_s, _a, n) => n };
  ctx.RuinsWithererSkills = { modifyOutgoingDamage: (_s, _a, _t, n) => n };
  ctx.PreshiSkills = { modifyOutgoingDamage: (_s, _a, n) => n, modifyIncomingDamage: (_s, _t, n) => n, suppressesResponse: () => false };
  ctx.MieryulaSkills = { modifyOutgoingDamage: (_s, _a, n) => n };
  ctx.EnemySkills = { modifyDamage: (_s, _t, n) => { calls.inc.push(n); return n; } };
  ctx.RuinsCardSkills = { modifyIncomingDamage: (_s, _t, n) => n, beforeResponseCheck: () => {} };
  ctx.GuestCharacterSkills = { guardOphelia: () => null };
  ctx.BattleVictory = { open: () => {} };
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: "battle-damage-resolution.js" });
  const utils = { queueAttackAnim: () => calls.anim.push(1) };
  const api = {
    deps: { isKillCard: c => c?.type === "slash", draw: () => {}, battle: {} },
    utils,
    needsResponse: c => !!flags.needResponse,
    canDodge: () => !!flags.canDodge,
    getResponseApi: () => ({
      shouldManualDodge: () => !!flags.manualDodge,
      queueManualDodge: () => {},
      autoDodge: () => !!flags.autoDodge,
    }),
    getHitWithoutDodge: () => (_s, _a, _t, amount) => {
      calls.hit.push(amount);
      return { dodged: false, hpLoss: amount, blockLoss: 0 };
    },
  };
  const r = ctx.BattleDamageResolution(api);
  return { ctx, calls, resolve: r.resolveDamage, api };
}

function patchedResolution(src) {
  if (REVERT === "round") return src.replace("Math.max(1, Math.round(amount))", "Math.max(1, amount)");
  if (REVERT === "immune") return src.replace(/\s*amount = 0;\s*\}/, " }");
  if (REVERT === "locked") return src.replace("if (state.battle?.locked) return { dodged: false, hpLoss: 0 };", "");
  return src;
}
function patchedNotice(src) {
  if (REVERT !== "notice") return src;
  return src.replace('title: "2026年11月23日 · 今日更新"', 'title: "2026年11月17日 · 今日更新"');
}
function patchedWorld(src) {
  if (REVERT !== "mult") return src;
  return src.replace(/hp: 150, power: 150, speed: 150/g, "hp: 300, power: 300, speed: 300")
    .replace(/hp: 200, power: 200, speed: 200/g, "hp: 100, power: 100, speed: 100");
}
const RAW_RES = code(RES);
const RES_SRC = patchedResolution(RAW_RES);
const WORLD_SRC = patchedWorld(code("src/original/data-world.js"));
const NOTICE_SRC = patchedNotice(code("src/original/update-notice-recent.js"));

let pass = 0, fail = 0;
const failed = [];
function ok(cond, name, extra) {
  if (cond) { pass++; return; }
  fail++; failed.push(name);
  console.log(`❌ ${name}${extra !== undefined ? "  ← " + JSON.stringify(extra) : ""}`);
}
const state = () => ({ battle: { locked: false }, settings: {}, log: [] });
const actor = () => ({ side: "ally", name: "A", hand: [] });
const target = () => ({ side: "enemy", name: "B", hand: [], gender: "female", noResponse: false });
const card = (extra = {}) => ({ type: "slash", name: "杀", ...extra });

console.log("=== A. 压缩完整性：238 未改核心结算文件、守卫齐全 ===");
let headSha;
try {
  const tree = execFileSync("git", ["ls-tree", "-r", "HEAD"], { encoding: "utf8" });
  headSha = (tree.split("\t" + RES + "\n")[0].match(/([0-9a-f]{40})\s*$/) || [])[1] || "";
} catch (_) { headSha = ""; }
const workSha = require("crypto").createHash("sha1")
  .update(Buffer.concat([Buffer.from(`blob ${Buffer.byteLength(code(RES))}\0`), Buffer.from(code(RES))]))
  .digest("hex");
ok(headSha && headSha === workSha, "A1 核心结算文件相对 HEAD(237) 逐字节未改（压缩态保持）", { headSha, workSha });
const lines = RAW_RES.split("\n").length;
ok(lines <= 180, "A2 压缩后仍 <=180 行硬约束", lines);
const GUARDS = ["BattleWhiteLolita", "allowKill", "invalidateKillCard", "tsStopped", "tacticDamage",
  "modifyOutgoingDamage", "modifyIncomingDamage", "immuneIncoming", "Math.max(1, Math.round(amount))",
  "beforeResponseCheck", "needsResponse", "autoDodge", "guardOphelia", "state.battle?.locked",
  "getHitWithoutDodge()("];
ok(GUARDS.every(g => RAW_RES.includes(g)), "A3 压缩后 15 处关键守卫/链路无丢失",
  GUARDS.filter(g => !RAW_RES.includes(g)));
ok(!/scaleEnemyStats|difficult|enemy\[/.test(RAW_RES), "A4 结算链不含难度倍率（倍率只在 scaleEnemyStats 应用一次）");

console.log("=== B. 运行时守卫：压缩没丢逻辑 ===");
const mk = flags => makeResolution(RES_SRC, flags);
const hitOf = (r, amount, flags = {}, c = card(), st = state()) =>
  r.resolve(st, target(), amount, "kill", actor(), c).hpLoss;
let r = mk({});
ok(hitOf(r, 10) === 10, "B1 整数伤害原值结算", r.calls.hit);
ok(hitOf(r, 13.5) === 14, "B2 小数伤害四舍五入收敛为整数", r.calls.hit);
ok(hitOf(r, 0.4) === 1 && hitOf(r, 0) === 0 && hitOf(r, -3) === 0,
  "B3 极小/零/负伤害按 Math.max(1,round) / 0 收敛", r.calls.hit);
r = mk({ immune: true });
ok(hitOf(r, 10) === 0, "B4 坚硬装甲免疫不被 Math.max(1,…) 抬成 1", r.calls.hit);
r = mk({ allowKill: false });
const invalid = r.resolve(state(), target(), 10, "kill", actor(), card());
ok(invalid.killInvalidated === true && invalid.hpLoss === 0, "B5 杀牌无效返回 killInvalidated 且不结算", invalid);
r = mk({});
const locked = state(); locked.battle.locked = true;
ok(r.resolve(locked, target(), 10, "kill", actor(), card()).hpLoss === 0,
  "B6 battle.locked 时不进入 hit", r.calls.hit);
r = mk({ ts: true });
ok(hitOf(r, 10) === 10 && r.calls.out.length === 0, "B7 时停压制 outgoing 增减伤但仍结算", r.calls);
r = mk({ needResponse: true, canDodge: true, autoDodge: true });
const dodged = r.resolve(state(), { ...target(), hand: [{ name: "闪", type: "response" }] },
  10, "kill", actor(), card());
ok(dodged.dodged === true && dodged.hpLoss === 0, "B8 响应牌自动闪避链路完好", dodged);
r = mk({});
ok(hitOf(r, 10, {}, card({ skipDamageModify: true })) === 10 && r.calls.inc.length === 0,
  "B9 skipDamageModify 跳过 EnemySkills.modifyDamage", r.calls.inc);

console.log("=== C. 四档难度 × 全部怪物 × 强化：倍率只应用一次、伤害全整数 ===");
// 用打了补丁（REVERT=mult）的 world 重建一份 GameData 供反向验证
function worldData(src) {
  const c = { Math, Number, Object, Array, JSON, String, Boolean, Error, console };
  c.window = c;
  vm.createContext(c);
  ["economy-config.js", "data-ruins-sand-city-enemies.js", "data-machine-factory-enemies.js",
    "data-underwater-train-enemies.js", "data-future-enemies.js"].forEach(f =>
    vm.runInContext(code("src/original/" + f), c, { filename: f }));
  vm.runInContext(src, c, { filename: "data-world.js" });
  return c.GameDataWorld;
}
const W = worldData(WORLD_SRC);
const DIFFS = ["normal", "adventure", "warrior", "king", "hell"];
const EXPECT = { normal: 100, adventure: 150, warrior: 200, king: 250, hell: 300 };
let enemyCount = 0, nonInt = 0, monotonic = true;
for (const mid of Object.keys(global.GameData.enemies)) {
  for (const base of (global.GameData.enemies[mid] || [])) {
    enemyCount++;
    const seq = DIFFS.map(d => W.scaleEnemyStats(base, W.difficulties[d], "normal"));
    for (const s of seq) for (const k of ["hp", "attack", "magic", "speed"])
      if (!Number.isSafeInteger(s[k])) nonInt++;
    for (const k of ["hp", "attack", "magic", "speed"])
      if (!seq.every((s, i) => i === 0 || s[k] >= seq[i - 1][k])) monotonic = false;
    // 倍率只应用一次：与手工 base×pct/100 完全一致
    for (let i = 0; i < DIFFS.length; i++) {
      const d = DIFFS[i], e = EXPECT[d];
      if (e !== 100 && (seq[i].attack !== Math.round(base.attack * e / 100)
        || seq[i].magic !== Math.round(base.magic * e / 100))) nonInt++;
    }
  }
}
ok(enemyCount >= 30, "C1 覆盖全部怪物（>=30）", enemyCount);
ok(nonInt === 0, "C2 四档缩放输出全为安全整数、倍率精确且只应用一次", nonInt);
ok(monotonic, "C3 四项属性随难度单调不降");
// 走压缩后的真实结算：把缩放后的 attack / magic 作为伤害基数
let dmgNonInt = 0, dmgMonotonic = true;
for (const mid of Object.keys(global.GameData.enemies)) {
  const base = (global.GameData.enemies[mid] || [])[0];
  if (!base) continue;
  const seq = DIFFS.map(d => {
    const s = W.scaleEnemyStats(base, W.difficulties[d], "normal");
    const rr = mk({});
    const n = rr.resolve(state(), target(), s.attack, "kill", actor(), card()).hpLoss;
    return n;
  });
  if (seq.some(n => !Number.isSafeInteger(n) || n < 0)) dmgNonInt++;
  if (!seq.every((n, i) => i === 0 || n >= seq[i - 1])) dmgMonotonic = false;
}
ok(dmgNonInt === 0, "C4 难度伤害经压缩结算后仍全整数、有限非负", dmgNonInt);
ok(dmgMonotonic, "C5 伤害随难度单调不降（倍率未在结算链二次叠加）");
// 强化加成 +1 攻击 → 伤害恰好 +1
const lokar = global.GameData.characters.find(c => c.id === "lokar");
const baseStats = global.CharacterProgression.statsAt(lokar, 0);
const boosted = global.CharacterEnhance.withBonus(baseStats, { enhance: { attack: 1 } });
ok(boosted.attack === baseStats.attack + 1 && Number.isSafeInteger(boosted.attack),
  "C6 强化 +1 攻击为整数覆盖式叠加", { base: baseStats.attack, boosted: boosted.attack });
const r1 = mk({}), r2 = mk({});
ok(r2.resolve(state(), target(), boosted.attack, "kill", actor(), card()).hpLoss
  === r1.resolve(state(), target(), baseStats.attack, "kill", actor(), card()).hpLoss + 1,
  "C7 强化后经压缩结算伤害恰好 +1");

console.log("=== D. 配置 / 公告 / 文档口径 ===");
const notice = NOTICE_SRC;
const doc = code("docs/01-完整项目.txt");
ok(Object.keys(EXPECT).every(d => W.difficulties[d].enemy.normal.hp === EXPECT[d]),
  "D1 四档倍率 100/150/200/250/300", DIFFS.map(d => W.difficulties[d].enemy.normal.hp));
ok(/normal: Object\.freeze\(\[63, 91\]\)/.test(code("src/original/economy-config.js"))
  && /elite: 196/.test(code("src/original/economy-config.js")),
  "D2 副本金币基础值 -30%（63/91/196/350/154）");
ok(notice.includes("2026年11月23日"), "D3 公告日期 11-23 在位");
ok(doc.includes("所有副本节点的莉莉丝元获得统一减少 30%"), "D4 docs 难度/金币表同步");

console.log(`\n通过 ${pass} / ${pass + fail}`);
const EXPECT_REVERT = { round: ["B2"], immune: ["B4"], locked: ["B6"],
  mult: ["C2", "C3", "C5", "D1"], notice: ["D3"] };
if (REVERT) {
  const want = EXPECT_REVERT[REVERT] || [];
  const hit = want.filter(n => failed.some(f => f.startsWith(n)));
  const okRev = hit.length >= (REVERT === "mult" ? 3 : 1)
    && failed.every(f => want.some(n => f.startsWith(n)));
  console.log(`REVERT=${REVERT} 期望红=${want.join(",")} 实红=${failed.join(",")} ${okRev ? "REVERT_OK" : "REVERT_UNEXPECTED"}`);
  process.exit(okRev ? 0 : 1);
}
process.exit(fail ? 1 : 0);
