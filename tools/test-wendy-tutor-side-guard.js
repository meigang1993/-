/* 温蒂「解答迷惑」阵营保护：我方开选牌弹窗，敌方自动完成，绝不锁定等待玩家替敌人选牌 */
const fs = require("fs"), vm = require("vm");
const { assert, unitFromCharacter, installGlobals, loadRuntime } = require("./skill-coverage-fixtures");
installGlobals(); loadRuntime();
["data-ruins-content.js", "wendy-skills.js", "card-utils.js", "battle-line-data.js", "ruins-card-skills.js"]
  .forEach(f => vm.runInThisContext(fs.readFileSync(`./src/original/${f}`, "utf8"), { filename: f }));

const results = [];
const record = (n, ok, d) => { results.push({ n, ok, d }); console.log(`${ok ? "✅" : "❌"} ${n}${d ? ` — ${d}` : ""}`); };

function freshState() {
  const state = { deck: [], explore: { earned: { cards: [] } }, battle: { allies: [], enemies: [], locked: false, animQueue: [] } };
  const wendy = unitFromCharacter(GameData.characters[0], "w1"); wendy.side = "ally"; wendy.ref = "wendy"; wendy.name = "温蒂";
  const mate = unitFromCharacter(GameData.characters[0], "m1"); mate.side = "ally"; mate.name = "队友";
  const foe = unitFromCharacter(GameData.characters[0], "e1"); foe.side = "enemy"; foe.ref = "wendy"; foe.name = "敌方温蒂";
  state.battle.allies = [wendy, mate]; state.battle.enemies = [foe];
  return { state, wendy, mate, foe };
}

// ── A. 我方：行为不变（弹窗 + 锁定 + 两步选牌） ──────────────────────
{
  const { state, wendy, mate } = freshState();
  window.WendySkills.tutor(state, wendy);
  record("A1 我方发动：开选择器并锁定",
    !!state.battle.wendyTutorPicker && state.battle.locked === true,
    `picker=${!!state.battle.wendyTutorPicker} locked=${state.battle.locked}`);

  const step1 = window.WendySkills.chooseTutorCard(state, "枪林弹雨", null);
  record("A2 我方第一步选牌", step1 === true && state.battle.wendyTutorPicker?.cardName === "枪林弹雨");
  const step2 = window.WendySkills.chooseTutorCard(state, "枪林弹雨", null);
  record("A3 我方第二步入手", step2 === true, "返回值=" + step2);
  record("A4 选择器关闭且解锁",
    state.battle.wendyTutorPicker === null && state.battle.locked === false);
  record("A5 临时牌进入自己手牌",
    (wendy.hand || []).some(c => c.name === "枪林弹雨" && c.temporary === true));
}

// ── B. 我方：交给同阵营队友（sameSideUnits 重构后仍生效） ─────────────
{
  const { state, mate } = freshState();
  const wendy2 = state.battle.allies[0];
  window.WendySkills.tutor(state, wendy2);
  window.WendySkills.chooseTutorCard(state, "枪林弹雨", null);   // 先选牌
  const ok = window.WendySkills.chooseTutorCard(state, "枪林弹雨", mate.uid);  // 再选队友
  record("B1 我方交给同阵营队友", ok === true && (mate.hand || []).some(c => c.name === "枪林弹雨"),
    `ok=${ok} 队友手牌=${(mate.hand || []).length}`);
  record("B2 交牌后解锁", state.battle.locked === false);
}

// ── C. 敌方拿到该技能：自动完成，绝不弹窗 ────────────────────────────
{
  const { state, foe } = freshState();
  const before = (foe.hand || []).length;
  const ret = window.WendySkills.tutor(state, foe);
  record("C1 敌方发动：不开选择器",
    !state.battle.wendyTutorPicker, `picker=${JSON.stringify(state.battle.wendyTutorPicker)}`);
  record("C2 敌方发动：不锁定界面", state.battle.locked === false, `locked=${state.battle.locked}`);
  record("C3 敌方发动：自动获得临时战术牌",
    (foe.hand || []).length === before + 1, `${before} → ${(foe.hand || []).length}`);
  const card = (foe.hand || [])[(foe.hand || []).length - 1];
  record("C4 获得的是临时牌（不进牌库循环）",
    !!card && card.temporary === true && card.void === true,
    `name=${card?.name} temporary=${card?.temporary} void=${card?.void}`);
  record("C5 标记为解答迷惑生成",
    card?.generatedBySkill === "解答迷惑" && card?.wendyTutorGenerated === true);
  record("C6 计入本回合已使用", foe.usedWendyTutor === true);
  record("C7 敌方发动返回真值（牌算已打出）", ret === true, "返回值=" + ret);
  record("C8 敌方战术牌留在敌方（未误给我方）",
    (foe.hand || []).some(c => c.temporary === true)
    && !(state.battle.allies[0].hand || []).some(c => c.temporary === true));
}

// ── D. 敌方无可用的战术牌：退回且不浪费次数 ─────────────────────────
{
  const { state, foe } = freshState();
  const keep = GameData.cardCodex;
  GameData.cardCodex = [];
  const ret = window.WendySkills.tutor(state, foe);
  GameData.cardCodex = keep;
  record("D1 无战术牌时返回假值", ret === false, "返回值=" + ret);
  record("D2 无战术牌时不消耗次数", foe.usedWendyTutor === false, `used=${foe.usedWendyTutor}`);
  record("D3 无战术牌时不锁定", state.battle.locked === false);
}

const failed = results.filter(r => !r.ok);
console.log(`\n通过 ${results.length - failed.length}/${results.length}`);
if (failed.length) { console.log("失败项：" + failed.map(f => f.n).join("、")); process.exit(1); }
