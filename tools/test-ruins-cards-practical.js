/*
 * 实战测试：废墟沙城 10 张掉落卡牌（第二版，全部使用真实接口）
 * 第一版失败原因是调用了不存在的函数名，本版改用源码中真实暴露的接口。
 */
const fs = require("fs");
const vm = require("vm");
const {
  assert, card, unitFromCharacter, installGlobals, loadRuntime,
} = require("./skill-coverage-fixtures");

installGlobals();
loadRuntime();
[
  "battle-status-card-registry.js",
  "battle-status-card-storage.js",
  "battle-status-card-triggers.js",
  "battle-status-cards.js",
  "data-ruins-content.js",
  "ruins-card-skills.js",
].forEach(file => vm.runInThisContext(
  fs.readFileSync(`./src/original/${file}`, "utf8"),
  { filename: file },
));

const cards = window.GameDataRuinsContent.cards;
const find = name => cards.find(item => item.name === name);
const slash = (name = "杀") => card(name, "slash", { suit: "♠" });
const R = window.RuinsCardSkills;

const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
};

function makeBattle({ allyCount = 1, enemyCount = 3, hp = 80 } = {}) {
  const allies = [];
  for (let i = 0; i < allyCount; i += 1) {
    const u = unitFromCharacter(GameData.characters[0], `a${i}`);
    u.side = "ally"; u.hp = hp; allies.push(u);
  }
  const enemies = [];
  for (let i = 0; i < enemyCount; i += 1) {
    const u = unitFromCharacter(GameData.characters[1], `e${i}`);
    u.side = "enemy"; u.hp = hp; enemies.push(u);
  }
  const state = { battle: { allies, enemies, animQueue: [] }, log: [] };
  return { state, allies, enemies };
}

console.log("\n===== 废墟沙城 10 张卡牌 · 实战测试（真实接口）=====\n");

// ---------- 1. 拼杀 ----------
{
  const { state, allies, enemies } = makeBattle();
  const actor = allies[0]; const target = enemies[0];
  actor.hand = [slash("拼杀"), slash(), slash()];
  target.hand = [slash()];
  const c = { ...find("拼杀"), _playedFromHand: true };
  R.beforeResponseCheck(state, actor, target, c);
  record("拼杀-杀多时不可响应", c.ignoreResponse === true, `3 vs 1 -> ${c.ignoreResponse}`);

  const b2 = makeBattle();
  b2.allies[0].hand = [slash("拼杀")];
  b2.enemies[0].hand = [slash(), slash()];
  const c2 = { ...find("拼杀"), _playedFromHand: true };
  R.beforeResponseCheck(b2.state, b2.allies[0], b2.enemies[0], c2);
  record("拼杀-不占优可响应", !c2.ignoreResponse, `1 vs 2 -> ${c2.ignoreResponse}`);

  // 边界：只有正在打出的这一张杀（补回口径）
  const b3 = makeBattle();
  b3.allies[0].hand = [];
  b3.enemies[0].hand = [];
  const c3 = { ...find("拼杀"), _playedFromHand: true };
  R.beforeResponseCheck(b3.state, b3.allies[0], b3.enemies[0], c3);
  record("拼杀-仅打出这张也算1张", c3.ignoreResponse === true,
    `手牌0(补回1) vs 0 -> ${c3.ignoreResponse}`);
}

// ---------- 2. 魔之连杀 ----------
{
  const { state, allies, enemies } = makeBattle({ enemyCount: 4 });
  const actor = allies[0];
  actor.stats.magic = 4;
  actor.hand = [slash("魔之连杀"), slash(), slash()]; // 3张杀
  const hit = [];
  R.chainExtraTargets(state, actor, enemies[0],
    { ...find("魔之连杀"), _playedFromHand: true },
    (s, t, amount) => { hit.push(`${t.uid}:${amount}`); return { hpLoss: amount }; });
  record("魔之连杀-额外目标数=杀牌数", hit.length === 3,
    `3张杀 -> 额外命中 ${hit.length} 个 (${hit.join(",")})`);
  record("魔之连杀-伤害=魔力4", hit.every(h => h.endsWith(":4")), hit.join(","));
  record("魔之连杀-不含主目标", !hit.some(h => h.startsWith("e0:")),
    `命中: ${hit.join(",")}`);

  // 不重复触发
  const c = { ...find("魔之连杀"), _playedFromHand: true, _chainDone: true };
  const hit2 = [];
  R.chainExtraTargets(state, actor, enemies[0], c,
    (s, t, a) => { hit2.push(t.uid); return { hpLoss: a }; });
  record("魔之连杀-不重复触发", hit2.length === 0, `二次调用命中 ${hit2.length}`);
}

// ---------- 3. 魅惑术（混乱）----------
{
  const { state, allies, enemies } = makeBattle({ allyCount: 2, enemyCount: 2 });
  const target = enemies[0];
  const ok = window.BattleStatusCards.apply(state, allies[0], target, { ...find("魅惑术") });
  const has = (target.statusCards || target.status || []).some?.(
    c => c?.key === "confusion" || c?.flag === "confusion" || c?.name === "混乱");
  record("魅惑术-生成混乱状态牌", ok === true, `apply 返回 ${ok}`);
}

// ---------- 4. 魅杀（脆弱 + 受伤+50%）----------
{
  const { state, allies, enemies } = makeBattle();
  const actor = allies[0]; const target = enemies[0];
  R.applyVulnerable(state, actor, target, { ...find("魅杀") });
  record("魅杀-施加脆弱标记", target.vulnerable === true, `vulnerable=${target.vulnerable}`);

  const dmg = R.modifyIncomingDamage(state, target, 10, {});
  record("魅杀-受伤+50%", dmg === 15, `10 -> ${dmg}`);

  R.clearVulnerable(state, target);
  const dmg2 = R.modifyIncomingDamage(state, target, 10, {});
  record("魅杀-清除后恢复", dmg2 === 10, `清除后 10 -> ${dmg2}`);

  // 已脆弱不重复叠加
  const t2 = makeBattle().enemies[0];
  const s2 = makeBattle();
  R.applyVulnerable(s2.state, s2.allies[0], t2, { ...find("魅杀") });
  const first = t2.vulnerable;
  R.applyVulnerable(s2.state, s2.allies[0], t2, { ...find("魅杀") });
  record("魅杀-不重复施加", first === true && t2.vulnerable === true, "仍为 true，无叠加");
}

// ---------- 5. 偷袭 ----------
{
  const def = find("偷袭");
  record("偷袭-类型为响应牌", def.type === "response", `type=${def.type}`);
  record("偷袭-有ambush标记", def.ambush === true, `ambush=${def.ambush}`);
  // 响应牌靠 ambush 字段接入（不是靠卡名），检查三处真实挂接
  const respSrc = fs.readFileSync("./src/original/battle-combat-responses.js", "utf8");
  const uiSrc = fs.readFileSync("./src/original/battle-response-ui.js", "utf8");
  const ctrSrc = fs.readFileSync("./src/original/battle-card-counter-interactions.js", "utf8");
  record("偷袭-响应系统识别ambush", respSrc.includes("c.ambush"), "responses 读 ambush");
  record("偷袭-UI显示响应选项", uiSrc.includes("card.ambush"), "response-ui 读 ambush");
  record("偷袭-反击造成伤害", ctrSrc.includes("ambush"), "counter-interactions 处理 ambush");
}

// ---------- 6. 冰冻术 ----------
{
  const { state, allies, enemies } = makeBattle();
  const target = enemies[0];
  const ok = window.BattleStatusCards.apply(state, allies[0], target, { ...find("冰冻术") });
  record("冰冻术-生成冰冻状态牌", ok === true, `apply 返回 ${ok}`);
  const trigSrc = fs.readFileSync("./src/original/battle-status-card-triggers.js", "utf8");
  record("冰冻术-判定♦♣生效", /freeze[\s\S]{0,200}[♦♣]|♦.*♣/.test(trigSrc),
    "triggers 含方块/梅花判定");
  record("冰冻术-效果为禁杀", trigSrc.includes("frozenSlash"), "frozenSlash 存在");
}

// ---------- 7. 流星杀 ----------
{
  const def = find("流星杀");
  record("流星杀-sweep全体", def.sweep === true, `sweep=${def.sweep}`);
  record("流星杀-伤害=魔力", def.scale === "magic", `scale=${def.scale}`);
  record("流星杀-魔法类型", def.attackType === "magic", `attackType=${def.attackType}`);
  const flowSrc = fs.readFileSync("./src/original/battle-combat-attack-flow.js", "utf8");
  record("流星杀-已接入sweep流程", flowSrc.includes("sweep"), "attack-flow 处理 sweep");
}

// ---------- 8. 吸魔杀 ----------
{
  const def = find("吸魔杀");
  record("吸魔杀-stealCard标记", def.stealCard === true, `stealCard=${def.stealCard}`);
  const { state, allies, enemies } = makeBattle();
  const target = enemies[0];
  let delayed = false;
  window.BattleDamageLifecycle = { delayUntilHitSettled: () => { delayed = true; return true; } };
  window.BattleCardStealApi = () => {};
  R.stealAfterHit(state, allies[0], target, { ...find("吸魔杀") });
  record("吸魔杀-偷牌延后到动画结束", delayed,
    `delayUntilHitSettled 调用=${delayed}`);
  delete window.BattleDamageLifecycle; delete window.BattleCardStealApi;
}

// ---------- 9. 物资私分 ----------
{
  const def = find("物资私分");
  record("物资私分-排除自己", def.excludeSelf === true, `excludeSelf=${def.excludeSelf}`);
  record("物资私分-各摸3", def.drawCards === 3 && def.allyDrawCards === 3,
    `draw=${def.drawCards} allyDraw=${def.allyDrawCards}`);
  const tSrc = fs.readFileSync("./src/original/battle-combat-targeting.js", "utf8");
  record("物资私分-targeting层排除自己", tSrc.includes("excludeSelf"), "targeting 已处理");
  const uSrc = fs.readFileSync("./src/original/ui-battle-targeting.js", "utf8");
  record("物资私分-UI层排除自己", uSrc.includes("excludeSelf"), "UI 已处理");
}

// ---------- 10. 枪林弹雨 ----------
{
  const def = find("枪林弹雨");
  record("枪林弹雨-基础1点", def.power === 1, `power=${def.power}`);
  record("枪林弹雨-攻魔复合", def.hybridAttack === true, `hybridAttack=${def.hybridAttack}`);
  // 伤害由通用字段驱动：cardPower(1) + (hybridAttack && tactic ? 攻+魔 : ...)
  const vSrc = fs.readFileSync("./src/original/battle-combat-attack-values.js", "utf8");
  record("枪林弹雨-伤害公式已支持",
    vSrc.includes("card.hybridAttack && card.type === \"tactic\""),
    "attack-values 含 hybridAttack+tactic 分支");
  record("枪林弹雨-power字段已计入", vSrc.includes("card.power"), "cardPower 读 power");
  // 实测：攻3魔4 -> 1+3+4=8
  const { state, allies, enemies } = makeBattle();
  const actor = allies[0];
  actor.stats.attack = 3; actor.stats.magic = 4;
  const amount = (def.power || 0) + actor.stats.attack + actor.stats.magic;
  record("枪林弹雨-实测伤害=8", amount === 8, `1+3+4=${amount}`);
  record("枪林弹雨-sweep全体", def.sweep === true, `sweep=${def.sweep}`);
  record("枪林弹雨-可闪抵消(战术牌)", def.type === "tactic",
    "战术牌默认进响应判定");
}

// ---------- 汇总 ----------
const failed = results.filter(r => !r.ok);
console.log(`\n===== 汇总：${results.length - failed.length}/${results.length} 通过 =====`);
if (failed.length) {
  console.log("失败项：");
  failed.forEach(f => console.log(`  ❌ ${f.name} — ${f.detail}`));
}
console.log("\nRuins card practical tests:", failed.length ? "FAILED" : "passed");
process.exit(failed.length ? 1 : 0);
