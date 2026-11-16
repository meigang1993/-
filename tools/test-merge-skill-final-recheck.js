// 合并技能最终复查：装配顺序、历史公告口径、两个合并技能描述、旧存档兼容性。
// REVERT=order|notice|desc|migration 为源码级反向验证（预期精准报红）。
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const REVERT = process.env.REVERT || "";
let pass = 0;
const reds = [];
function T(name, cond, extra) {
  if (cond) { pass += 1; return; }
  reds.push(name);
  if (REVERT) console.log(`  RED ${name}`, extra === undefined ? "" : JSON.stringify(extra));
}
function rootText(rel, opts = {}) {
  let s = fs.readFileSync(path.join(ROOT, rel), "utf8");
  if (REVERT === "order") {
    if (rel === "tools/publish-bundles.json") {
      const from = `    "noa-side-effect-skills.js",\n    "noa-charm-discard.js",\n    "noa-charm-skills.js"`;
      const to = `    "noa-charm-discard.js",\n    "noa-charm-skills.js",\n    "noa-side-effect-skills.js"`;
      if (!s.includes(from)) throw new Error("REVERT=order must hit manifest");
      s = s.replace(from, to);
    }
    if (rel === "tools/publish-bundle-shared.js") {
      s = s.replace(`    file: "noa-side-effect-skills.js",`, `    file: "noa-side-effect-skills-legacy.js",`);
    }
    if (rel === "tools/check-split-assembly.js") {
      s = s.replace(`"noa-charm-skills.js": ["noa-side-effect-skills.js", "noa-charm-discard.js"],`,
        `"noa-charm-skills.js": ["noa-charm-discard.js"],`);
    }
    if (rel === "tools/validate-relations.js") {
      s = s.replace(`["noa-side-effect-skills.js", "noa-charm-discard.js", "noa-charm-skills.js"],`,
        `["noa-charm-discard.js", "noa-charm-skills.js"],`);
    }
  }
  if (REVERT === "notice"
    && (rel === "src/original/update-notice-recent.js" || rel === "src/original/update-notice-archive.js")) {
    s = s.replace(/（后续口径已调整：[^）]*）/g, "");
  }
  if (REVERT === "desc" && !opts.skipDesc) {
    if (rel === "src/original/data-characters-extra.js") {
      s = s.replace("出牌阶段限一次，你可以弃置所有“狂战”标记，摸等量的牌，然后回复X点生命值，X为你以此法弃置的“狂战”标记数×你生命值上限的10%。", "");
    }
    if (rel === "src/original/data-new-characters.js") {
      s = s.replace("结束阶段，你对我方其他所有存活男性角色各造成等同于你攻击力的伤害；队伍里每有一名存活男性角色，你的手牌上限+1；若队伍中没有存活的男性角色，出牌阶段开始时，你随机对一名角色（不分敌我）视为使用一张虚拟【咬杀】，之后跳过本回合的出牌阶段。", "");
    }
    if (rel === "docs/安洁莉卡技能重制.txt") {
      s = s.replace("出牌阶段限一次", "出牌阶段可多次（反向验证）");
    }
    if (rel === "docs/deepseek-rebuild/02-characters.md") {
      s = s.replace("原独立主动技`猩红暴走`已删除，效果并入`狂战意志`", "限定技`猩红暴走`保留");
    }
  }
  return s;
}
function src(file, skipDesc = false) {
  let s = rootText(`src/original/${file}`, { skipDesc });
  if (REVERT === "migration" && file === "store-repairs.js") {
    const n1 = "    const cardLists = [b.played];";
    const n2 = `      if (pile) ["deck", "discard", "consumed"].forEach(key => cardLists.push(pile[key]));`;
    if (!s.includes(n1) || !s.includes(n2)) throw new Error("REVERT=migration must hit");
    s = s.replace(n1, "    const cardLists = [];")
      .replace(n2, "      // pile/played migration removed");
  }
  return s;
}

// A 装配顺序：执行块 -> discard -> charm，且三处护栏都登记
{
  const bundles = JSON.parse(rootText("tools/publish-bundles.json"));
  const list = bundles["battle-skills"] || [];
  const side = list.indexOf("noa-side-effect-skills.js");
  const discard = list.indexOf("noa-charm-discard.js");
  const charm = list.indexOf("noa-charm-skills.js");
  T("A1 battle-skills 内执行块先于 discard / charm", side >= 0 && discard > side && charm > discard,
    { side, discard, charm });
  const shared = rootText("tools/publish-bundle-shared.js");
  T("A2 shared/order 护栏登记执行块依赖",
    /file: "noa-side-effect-skills\.js"/.test(shared)
    && /consumers: \["noa-charm-skills\.js"\]/.test(shared));
  const split = rootText("tools/check-split-assembly.js");
  T("A3 split assembly 登记执行块依赖",
    /"noa-charm-skills\.js": \["noa-side-effect-skills\.js", "noa-charm-discard\.js"\]/.test(split));
  const relations = rootText("tools/validate-relations.js");
  T("A4 validate:relations 依赖链含执行块",
    /\["noa-side-effect-skills\.js", "noa-charm-discard\.js", "noa-charm-skills\.js"\]/.test(relations));
}

// B 历史公告：保留历史原文，但补「后续口径已调整」说明
{
  const recent = rootText("src/original/update-notice-recent.js");
  const archive = rootText("src/original/update-notice-archive.js");
  T("B1 11月10【改造副作用】历史条目带后续合并说明",
    /【改造副作用】实装/.test(recent)
    && /后续口径已调整：该技能已删除，效果并入【淫气改造】/.test(recent));
  T("B2 历史【猩红暴走】条目带后续合并说明",
    /安洁莉卡新增主动技【猩红暴走】/.test(archive)
    && /后续口径已调整：该主动技已删除，效果并入【狂战意志】/.test(archive));
  T("B3 历史逐段口径条目带当前说明",
    /取消“多段或连击伤害时逐段结算”/.test(archive)
    && /当前【狂战意志】按角色说明含/.test(archive));
  T("B4 今日公告仍写明两次删除与合并",
    /删除独立主动技【猩红暴走】/.test(recent)
    && /删除独立技能【改造副作用】/.test(recent));
}

// C 两个合并技能描述：游戏数据 + 设定文档 + docs/03
{
  const extra = rootText("src/original/data-characters-extra.js");
  const noa = rootText("src/original/data-new-characters.js");
  const docSkill = rootText("docs/安洁莉卡技能重制.txt");
  const docOverview = rootText("docs/deepseek-rebuild/02-characters.md");
  const docAll = rootText("docs/03-角色与角色技能.txt");
  const cardArt = rootText("src/original/card-art.js");
  const skillAccess = rootText("src/original/character-skill-access.js");
  T("C1 狂战意志游戏描述含主动合并效果与 berserkWill 卡",
    /name: "狂战意志", type: "active"/.test(extra)
    && /出牌阶段限一次，你可以弃置所有/.test(extra)
    && /berserkWill: true/.test(extra));
  T("C2 淫气改造游戏描述含三项并入效果",
    /name: "淫气改造"/.test(noa)
    && /结束阶段，你对我方其他所有存活男性角色/.test(noa)
    && /队伍里每有一名存活男性角色/.test(noa)
    && /若队伍中没有存活的男性角色/.test(noa));
  T("C3 安洁莉卡设定稿已同步主动合并描述",
    /⭐ 狂战意志（主动）/.test(docSkill)
    && /出牌阶段限一次/.test(docSkill)
    && /原独立主动技【猩红暴走】已删除/.test(docSkill));
  T("C4 角色总览已同步且无旧猩红暴走独立技",
    /原独立主动技`猩红暴走`已删除，效果并入`狂战意志`/.test(docOverview)
    && !/限定技`猩红暴走`可弃置/.test(docOverview));
  T("C5 docs/03 已补诺亚当前合并描述",
    /补充：noa - 怪面诺亚/.test(docAll)
    && /若队伍中没有存活的男性角色/.test(docAll));
  T("C6 卡图与技能入口只剩狂战意志",
    /"狂战意志":/.test(cardArt) && !/猩红暴走/.test(skillAccess));
}

// D 旧存档迁移接线：checkpoint 后规范化；无 checkpoint 先丢弃 battle
{
  const migrations = rootText("src/original/store-migrations.js");
  const repairs = src("store-repairs.js");
  const recovery = rootText("src/original/store-unlock-recovery.js");
  T("D1 读档在 restore 后调用 normalizeMergedSkills",
    /if \(normalizeMergedSkills\(state\)\) markForSave\(state\)/.test(migrations)
    && migrations.indexOf("normalizeMergedSkills(state)") > migrations.indexOf("BattleSaveCheckpoint?.restore"));
  T("D2 规范化覆盖 played 与共享牌堆",
    /const cardLists = \[b\.played\]/.test(repairs)
    && /cardLists\.push\(pile\[key\]\)/.test(repairs));
  T("D3 无 checkpoint 的压缩路径先丢弃 battle，不会留下战斗旧牌",
    migrations.indexOf("recoverInterruptedBattle(state)") < migrations.indexOf("normalizeMergedSkills(state)")
    && /state\.battle = null/.test(recovery));
}

// E 真实模块装配：旧 checkpoint 存档、战报快照、共享牌堆、死卡与幂等
const win = {
  GameData: { characters: [], baseDeck: [], eliteCards: [], cardCodex: [] },
  GameStoreBountyRepairs: { refreshBountyGold() {} },
  BattleLog: { add: (state, text) => (state.log || (state.log = [])).push(text) },
  BattleLines: { skill: (state, _unit, name) => (state.lines || (state.lines = [])).push(name) },
  CardUtils: {
    isKillCard: card => card?.type === "slash",
    isEntityCard: card => !!card && !card.virtual && !card.generatedBySkill,
    fromEntity: (name, opts) => ({ name, ...opts, virtual: true }),
  },
  BattleHpValue: {
    healCap: (unit, amount) => Math.max(0, Math.min(amount, (unit.maxHp || 0) - (unit.hp || 0))),
    applyHeal: (unit, amount) => { unit.hp += amount; },
  },
  BattleStats: { heal() {} },
  EnemySkills: { clearHolyScar() {}, onHeal() {} },
  ElranaAceNanaliSkills: { afterHeal() {} },
  BertisGerlotSkills: { refreshArrogance() {} },
  AngelicaBerserkerSkinFX: {
    berserkWill() {}, rageSpend() {}, rageGain() {}, might() {}, queueEntry() {},
  },
  BattleDrawFeedback: {
    action: (_u, _n, drawn) => `摸${drawn}张牌`,
    shortage: () => "", signal: () => null,
  },
  BattleSystem: { useVirtualKill: (state, u, t, card) => (state.bites || (state.bites = [])).push({ u, t, card }) },
  GameRandom: { sample: pool => pool[0] },
  GuestCharacterSkills: { countsForLimit: () => true },
  BattleDamageLifecycle: { delayUntilHitSettled: () => false },
  UICommon: { skillsOf: unit => unit?.skills || [] },
  GameStoreCompact: { stripTransientUiState() {} },
};
function load(file) {
  const ctx = {
    window: win, GameData: win.GameData, Math, Number, Array, Object, Set, Map,
    JSON, String, RegExp, console,
  };
  vm.runInNewContext(src(file, true), ctx, { filename: file });
}
[
  "store-save-schema.js", "store-repairs.js",
  "battle-line-data.js", "new-character-line-data.js",
  "data-characters-extra.js", "angelica-luka-skills.js",
  "skill-once-per-turn.js", "character-skill-access.js",
  "data-new-characters.js", "noa-side-effect-skills.js",
  "noa-charm-discard.js", "noa-charm-skills.js",
].forEach(load);
win.GameData.characters = [
  ...(win.GameDataNewCharacters || []), ...(win.GameDataCharactersExtra || []),
];

function oldCrimson(over = {}) {
  return {
    name: "猩红暴走", type: "tactic", suit: "♠", _skill: true,
    crimsonRampage: true, targetless: true,
    text: "猩红暴走：弃置所有狂战标记", generatedBySkill: "猩红暴走",
    ...over,
  };
}
function oldNoaBite() {
  return {
    name: "咬杀", type: "slash", suit: "♥", virtual: true,
    generatedBySkill: "改造副作用", sourceSkill: "改造副作用",
  };
}
function legacyState() {
  const pileOld = oldCrimson({ crimsonRampage: false });
  const playedOld = oldCrimson({ crimsonRampage: false, generatedBySkill: "猩红暴走" });
  const playedNoa = oldNoaBite();
  const angelica = {
    uid: "a0", name: "安洁莉卡", ref: "angelica", side: "ally", hp: 80, maxHp: 154,
    rageMarks: 3, usedCrimsonRampage: true,
    skills: [
      { name: "力量爆发", type: "passive" },
      { name: "狂战意志", type: "passive" },
      { name: "猩红暴走", type: "active", card: oldCrimson() },
      { name: "临场发挥", type: "trigger", text: "临时技能保留" },
    ],
    hand: [oldCrimson()], deck: [oldCrimson({ crimsonRampage: false })],
    discard: [oldCrimson({ crimsonRampage: false })],
    consumed: [oldCrimson({ crimsonRampage: false })],
    pileStats: { deck: [pileOld], discard: [], consumed: [] },
  };
  const noa = {
    uid: "n0", name: "怪面诺亚", ref: "noa", gender: "female", side: "ally",
    hp: 100, maxHp: 130, stats: { attack: 6, handLimit: 4 }, tempAttack: 0,
    skipPlayPhase: true, skipPlayReason: "改造副作用",
    skills: [{ name: "淫气改造", type: "passive", text: "旧版淫气改造" },
      { name: "改造副作用", type: "passive" }],
    hand: [], deck: [], discard: [], consumed: [],
    pileStats: { deck: [], discard: [], consumed: [] },
  };
  const battle = {
    allies: [angelica, noa],
    enemies: [{ uid: "e0", name: "敌", side: "enemy", hp: 30, hand: [], skills: [] }],
    turn: 7, phase: 4, activeUid: "a0", log: [],
    played: [playedOld, playedNoa], shownPlayed: [], animQueue: [],
  };
  return {
    state: { battle, chars: [], deck: [], log: [] },
    angelica, noa, battle, pileOld, playedOld, playedNoa,
  };
}
const legacy = legacyState();
const normalize = win.StoreRepairs.normalizeMergedSkills;
const changed = normalize(legacy.state);
T("E1 旧档规范化 changed=true 且技能条目无幽灵旧名",
  changed === true
  && !JSON.stringify(legacy.angelica.skills).includes("猩红暴走")
  && !JSON.stringify(legacy.noa.skills).includes("改造副作用")
  && legacy.angelica.skills.some(s => s.name === "狂战意志" && s.type === "active")
  && legacy.noa.skills.length === 2
  && legacy.noa.skills.some(s => s.name === "终极刀魔" && s.type === "active")
  && legacy.angelica.skills.some(s => s.name === "临场发挥"));
T("E2 手牌 / 牌堆 / 弃牌 / 消耗区旧猩红卡全部迁移",
  ["hand", "deck", "discard", "consumed"].every(key => legacy.angelica[key].every(c =>
    c.name === "狂战意志" && c.berserkWill === true && !("crimsonRampage" in c))));
T("E3 played 与共享牌堆旧卡也迁移",
  legacy.battle.played[0].name === "狂战意志"
  && legacy.battle.played[0].berserkWill === true
  && legacy.pileOld.name === "狂战意志"
  && legacy.pileOld.berserkWill === true);
T("E4 旧技能名来源字段迁移为当前技能名",
  legacy.battle.played[0].generatedBySkill === "狂战意志"
  && legacy.battle.played[1].generatedBySkill === "淫气改造"
  && legacy.battle.played[1].sourceSkill === "淫气改造"
  && legacy.angelica.hand[0].generatedBySkill === "狂战意志");
T("E5 旧跳过原因改写且旧档不重复咬杀", (() => {
  win.state = legacy.state;
  const s = { battle: legacy.battle, log: [] };
  return legacy.noa.skipPlayReason === "淫气改造"
    && win.NoaSideEffectSkills.beginPlayPhase(s, legacy.noa) === false
    && !s.bites;
})());
T("E6 旧 usedCrimsonRampage 仍阻止重复发动",
  win.AngelicaLukaSkills.canUseBerserkWill(legacy.angelica) === false
  && win.SkillOncePerTurn.blocked(legacy.angelica, { berserkWill: true }, legacy.battle) === true);
T("E7 二次规范化幂等", normalize(legacy.state) === false);
T("E8 敌方单位不被误改", legacy.battle.enemies[0].hp === 30);

console.log(`merge-skill final recheck: ${pass} PASS / ${reds.length} FAIL${REVERT ? ` (REVERT=${REVERT})` : ""}`);
if (reds.length) {
  if (!REVERT) reds.forEach(name => console.log("  RED " + name));
  process.exit(1);
}
