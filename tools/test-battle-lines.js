const fs = require("fs");
const vm = require("vm");

global.window = global;
global.renderCount = 0;
global.render = () => { global.renderCount += 1; };

function load(file) {
  vm.runInThisContext(fs.readFileSync(file, "utf8"), { filename: file });
}
load("./src/original/game-random.js");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function captureTimedSpeech(start) {
  const realSetTimeout = global.setTimeout, realClearTimeout = global.clearTimeout, queued = [], lines = [];
  global.setTimeout = fn => { queued.push(fn); return queued.length; };
  global.clearTimeout = () => {};
  try {
    const duration = start();
    if (window.__speechState?.battle?.speech?.lines?.[0]) lines.push(window.__speechState.battle.speech.lines[0]);
    while (queued.length) {
      queued.shift()();
      const line = window.__speechState?.battle?.speech?.lines?.[0];
      if (line) lines.push(line);
    }
    return { duration, lines };
  } finally {
    global.setTimeout = realSetTimeout;
    global.clearTimeout = realClearTimeout;
    delete window.__speechState;
  }
}

load("./src/original/battle-line-data.js");
load("./src/original/new-character-line-data.js");
load("./src/original/battle-line-intro.js");
load("./src/original/battle-speech-controller.js");
load("./src/original/battle-caption-controller.js");
load("./src/original/battle-lines.js");

const chargeLine = window.BattleLineData?.skillLines?.aileng?.["充能精华"];
const chargeReply = window.BattleLineData?.followLines?.aileng?.["充能精华"];
const extractLine = window.BattleLineData?.skillLines?.besta_doll?.["榨取精华"];
const idolLine = window.BattleLineData?.skillLines?.hoshino_yi?.["偶像之星"];
const idolReply = window.BattleLineData?.followLines?.hoshino_yi?.["偶像之星"];
const domeLine = window.BattleLineData?.skillLines?.hoshino_yi?.["巨蛋演出"];
const truthSuccessLine = window.BattleLineData?.skillLines?.hoshino_yi?.["梦想真理成功"];
const truthFailureLine = window.BattleLineData?.skillLines?.hoshino_yi?.["梦想真理失败"];
const nonokaTruthLine = window.BattleLineData?.skillLines?.nonoka?.["梦想真理揭露"];
const kaiichiTruthLine = window.BattleLineData?.skillLines?.hoshino_kaiichi?.["梦想真理亲子"];
assert(window.BattleLineData?.allyIntroLines?.chiyo === "为了复仇，我要继续前进", "Chiyo ally intro line mismatch");
assert(chargeLine?.({ ref: "nanali" }) === "你看起来好像……二姐……", "Aileng's Nanali Charge Essence line mismatch");
assert(chargeLine?.({ ref: "besta" }) === "大姐，我还是很喜欢你，因为你真的很像母亲", "Aileng's Besta Charge Essence line mismatch");
assert(chargeLine?.({ ref: "besta_doll" }) === "很久没用你了", "Aileng's Besta Doll Charge Essence line mismatch");
assert(chargeLine?.({ ref: "other" }) === "我这个……能补充魔力", "Aileng's default Charge Essence line mismatch");
assert(chargeReply?.({ ref: "nanali" })?.text === "看来，受姨妈催熟记忆影响，我还是比较喜欢舅舅大人你", "Nanali's Charge Essence reply mismatch");
assert(chargeReply?.({ ref: "besta" })?.text === "是吗？那就把存货，全部交出来吧", "Besta's Charge Essence reply mismatch");
assert(extractLine?.({ ref: "aileng" }) === "哥哥，好久没见到你了，什么时候让我回到你身边？", "Besta Doll's Aileng Extract Essence line mismatch");
assert(idolLine === "晚上好，我是A小町，星野依，天才般偶像，今天演唱新曲。", "Hoshino Yi Idol Star line mismatch");
assert(idolReply?.({ ref: "nonoka" })?.text === "能和小依老师同台演出，简直做梦一样。", "Nonoka Idol Star follow line mismatch");
assert(domeLine === "小依，你看到了吧，这就是你的梦想……", "Hoshino Yi Dome Performance line mismatch");
assert(truthSuccessLine === "小依，我明白了，我会替你活着，照顾你儿子。", "Hoshino Yi Dream Truth success line mismatch");
assert(truthFailureLine === "小依，我不明白你的梦想，但至少不会让杀害你的凶手逍遥法外！", "Hoshino Yi Dream Truth failure line mismatch");
assert(nonokaTruthLine === "你！凋零者！难道真正的小依老师已经……", "Nonoka Dream Truth line mismatch");
assert(kaiichiTruthLine === "妈妈，你又在表演这种魔术了，妈妈的粉色肠子好好看。", "Kaiichi Dream Truth line mismatch");

async function assertIntro(enemy, expected) {
  const state = {
    battle: {
      allies: [],
      enemies: [enemy],
      speech: null,
    },
  };
  const wait = window.BattleLines.intro(state);
  assert(wait && typeof wait.then === "function", `${enemy.id} should pause battle intro`);
  assert(state.battle.speech?.introPause, `${enemy.id} intro should mark introPause`);
  assert(state.battle.speech.lines?.[0]?.text === expected, `${enemy.id} intro line mismatch`);
  window.BattleLines.dismiss(state);
  await wait;
  assert(state.battle.speech === null, `${enemy.id} intro should clear after dismiss`);
}

async function assertCancelIntro() {
  const enemy = {
    uid: "e2",
    id: "witherer_1124_split",
    ref: "witherer_1124_split",
    ai: "witherer_1124",
    type: "elite",
    hp: 142,
    name: "凋零者1124号分裂体",
  };
  const state = { battle: { allies: [], enemies: [enemy], speech: null } };
  const wait = window.BattleLines.intro(state);
  window.BattleLines.cancel(state);
  await wait;
  assert(state.battle.speech === null, "cancelled battle intro should clear speech");
}

async function assertRisaElranaIntro() {
  const elrana = { uid: "a0", ref: "elrana", hp: 20, name: "艾尔拉娜" };
  const risa = { uid: "e3", id: "assassin_sakura_risa", ref: "assassin_sakura_risa", ai: "assassin_sakura_risa", type: "elite", hp: 220, name: "内英组杀手樱羽丽莎" };
  const state = { battle: { allies: [elrana], enemies: [risa], speech: null } };
  window.__speechState = state;
  const sequence = captureTimedSpeech(() => window.BattleLines.intro(state));
  assert(sequence.duration === 5 * 3600, "Risa special intro should use the Edis sequential timing");
  assert(sequence.lines.length === 5, "Risa special intro should display all five lines in sequence");
  assert(sequence.lines[0].uid === risa.uid && sequence.lines[1].uid === elrana.uid, "Risa special intro should alternate speaker bubbles");
  assert(sequence.lines[0].text.startsWith("艾尔拉娜姐姐，终于又见到你了。"), "Risa special intro opening mismatch");
  assert(sequence.lines[4].text === "来吧♥姐姐，试试。", "Risa special intro ending mismatch");
}

async function assertBakaarBestaIntro() {
  const besta = { uid: "a4", ref: "besta", hp: 100, name: "贝丝妲" };
  const bakaar = { uid: "e4", id: "demon_king_bakaar", ref: "demon_king_bakaar", ai: "demon_king_bakaar", type: "boss", hp: 300, name: "魔王巴卡尔" };
  const state = { battle: { allies: [besta], enemies: [bakaar], speech: null } };
  window.__speechState = state;
  const sequence = captureTimedSpeech(() => window.BattleLines.intro(state));
  assert(sequence.duration === 6 * 3600, "Bakaar special intro should use the Edis sequential timing");
  assert(sequence.lines.length === 6, "Bakaar special intro should display all six lines in sequence");
  assert(sequence.lines[0].uid === bakaar.uid && sequence.lines[1].uid === besta.uid, "Bakaar special intro should alternate speaker bubbles");
  assert(sequence.lines[0].text.startsWith("贝丝妲，你这婊子"), "Bakaar special intro opening mismatch");
  assert(sequence.lines[5].text.startsWith("呵呵，你不是喜欢纯爱后宫吗"), "Bakaar special intro ending mismatch");

  const doll = { uid: "a5", ref: "besta_doll", hp: 100, name: "贝丝妲魔偶" };
  const dollState = { battle: { allies: [doll], enemies: [bakaar], speech: null } };
  const dollWait = window.BattleLines.intro(dollState);
  assert(dollState.battle.speech?.lines?.length !== 6, "Besta Doll must not trigger Bakaar's Besta exchange");
  window.BattleLines.dismiss(dollState);
  await dollWait;
}

(async () => {
  await assertIntro({
    uid: "e0",
    id: "witherer_1124_split",
    ref: "witherer_1124_split",
    ai: "witherer_1124",
    type: "elite",
    hp: 142,
    name: "凋零者1124号分裂体",
  }, "灵魂检测有反应，混沌之子在这里。");

  await assertIntro({
    uid: "e1",
    id: "xx_witherer_1124",
    ref: "xx_witherer_1124",
    ai: "witherer_1124",
    type: "boss",
    hp: 320,
    name: "XX型凋零者1124号",
  }, "父亲大人，不记得我了吗？没关系，带你去见母亲大人，她会让你恢复前世记忆。不愿意跟我走吗？女儿就用舒服的身体让你恢复对我身体的记忆吧！");

  await assertIntro({
    uid: "e5",
    id: "demon_king_bakaar",
    ref: "demon_king_bakaar",
    ai: "demon_king_bakaar",
    type: "boss",
    hp: 300,
    name: "魔王巴卡尔",
  }, "你就是帮人鱼女王夺回列车的勇者？本王有所耳闻。魅魔女王想跟本王谈判撤军？哼，那就用力量来谈吧！");

  await assertCancelIntro();
  await assertRisaElranaIntro();
  await assertBakaarBestaIntro();

  console.log("Battle line intro tests passed");
})().catch(err => {
  console.error(err.message);
  process.exit(1);
});
