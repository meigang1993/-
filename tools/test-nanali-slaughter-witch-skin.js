const assert = require("assert");
const fs = require("fs");
const path = require("path");

global.window = global;
const battleLogs = [];
window.BattleLog = { add: (_state, message) => battleLogs.push(message) };
require("../src/original/data-skins.js");
require("../src/original/skins.js");
require("../src/original/skin-fx-runtime.js");
require("../src/original/nanali-slaughter-witch-skin-fx.js");
require("../src/original/nanali-skills.js");

// 皮肤登记：名称、归属、品质、价格、立绘
const witch = window.SkinSystem.byId("nanali_slaughter_witch");
assert(witch, "杀戮魔女 skin must be registered");
assert(witch.charId === "nanali", "杀戮魔女 must belong to 娜娜莉");
assert(witch.name === "杀戮魔女", `skin name must be 杀戮魔女, got ${witch.name}`);
assert(witch.quality === "epic", `杀戮魔女 must be epic quality, got ${witch.quality}`);
assert(witch.price === 10, `杀戮魔女 must cost 10 essence orbs, got ${witch.price}`);
assert(witch.dynamicEffect === "nanali-slaughter-witch",
  "杀戮魔女 must declare its dynamic effect");
assert(witch.specialEffect === true, "杀戮魔女 must be flagged as a special effect skin");
assert(witch.initial !== true, "杀戮魔女 must not be the initial skin");
assert(fs.existsSync(path.join(__dirname, "..", "publish", witch.art.replace(/^\.\//, ""))),
  `skin art must exist: ${witch.art}`);

// 娜娜莉必须拥有默认皮肤，否则皮肤商店里她只有史诗皮可选
const nanaliSkins = window.SkinSystem.forChar("nanali");
assert(nanaliSkins.some(skin => skin.id === "nanali_default" && skin.initial === true),
  "娜娜莉 must have an initial default skin");
assert(nanaliSkins.filter(skin => skin.initial).length === 1,
  "娜娜莉 must have exactly one initial skin");

// 生效判定：只对本皮肤生效
assert(window.NanaliSlaughterWitchSkinFX.active({ skinDynamicEffect: "nanali-slaughter-witch" }),
  "equipped 杀戮魔女 units must activate the dedicated controller");
assert(!window.NanaliSlaughterWitchSkinFX.active({ skinDynamicEffect: "angelica-berserker" }),
  "other skins must not activate 杀戮魔女 effects");

window.state = {
  battle: { test: false },
  chars: [{ id: "nanali", locked: false, level: 10 }],
  equippedSkins: { nanali: "nanali_slaughter_witch" },
  ownedSkins: { nanali_slaughter_witch: true },
};
assert(window.NanaliSlaughterWitchSkinFX.active({ ref: "nanali" }),
  "杀戮魔女 effects must resolve from current equipment when the battle cache is missing");
window.state.equippedSkins.nanali = "nanali_default";
assert(!window.NanaliSlaughterWitchSkinFX.active(
  { ref: "nanali", skinDynamicEffect: "nanali-slaughter-witch" }),
  "switching to the default skin must disable stale 杀戮魔女 effects");
delete window.state;

// 两个技能特效必须真正被调用（无 DOM 环境下安全返回，不抛错）
const fx = window.NanaliSlaughterWitchSkinFX;
const calls = [];
["apolloSeal", "weaknessExecute"].forEach(name => {
  const original = fx[name];
  fx[name] = (...args) => { calls.push(name); return original(...args); };
});

const deps = {
  visible: unit => (unit.hand || []).filter(card => !card._hidden),
  takeVisible: (unit, count) => (unit.hand || []).splice(0, count),
  singleKill: card => card?.type === "slash",
  line: () => {},
};
const nanali = window.NanaliSkills(deps);
const actor = { ref: "nanali", name: "娜娜莉", hand: [], side: "ally" };
const target = {
  uid: "e0", name: "机械牛头王", side: "enemy", hand: [
    { name: "闪", type: "dodge" }, { name: "蓄力", type: "tactic" },
  ],
};
const state = { battle: { turn: 1, allies: [actor], enemies: [target] } };
const slash = { name: "杀（普攻）", type: "slash", power: 0 };

nanali.beforeKillTargeted(state, actor, target, slash, { draw: () => [] });
assert(calls.includes("apolloSeal"),
  `魔刀阿波罗 must trigger the skin effect, got ${JSON.stringify(calls)}`);

const emptyTarget = { uid: "e1", name: "骷髅巡逻机", side: "enemy", hand: [] };
assert(nanali.modifySlashDamage(state, actor, emptyTarget, 10, slash) === 20,
  "虚弱斩杀 must double slash damage against a handless target");
assert(calls.includes("weaknessExecute"),
  `虚弱斩杀 must trigger the skin effect, got ${JSON.stringify(calls)}`);

// 换回默认皮肤后，控制器必须判定为未生效（特效在其内部被拦截）
window.state = { battle: state.battle, equippedSkins: { nanali: "nanali_default" } };
assert(!fx.active(actor),
  "switching to the default skin must deactivate the 杀戮魔女 controller");
assert(nanali.modifySlashDamage(state, actor, emptyTarget, 10, slash) === 20,
  "虚弱斩杀 damage must stay correct regardless of the equipped skin");
delete window.state;

// 接线：各挂载点必须引用该皮肤控制器
[
  ["nanali-skills.js", "NanaliSlaughterWitchSkinFX?.apolloSeal"],
  ["nanali-skills.js", "NanaliSlaughterWitchSkinFX?.weaknessExecute"],
  ["app-render.js", "NanaliSlaughterWitchSkinFX?.sync"],
  ["battle-fx.js", "NanaliSlaughterWitchSkinFX?.cancel"],
  ["app-battle-skin-actions.js", "NanaliSlaughterWitchSkinFX"],
  ["app-battle-skin-actions.js", '"nanali-slaughter-witch"'],
  ["battle-victory.js", "nanali-witch-victory-show"],
  ["battle-victory.js", "nanali-slaughter-witch-victory"],
].forEach(([file, token]) => {
  assert(fs.readFileSync(path.join(__dirname, "..", "src", "original", file), "utf8").includes(token),
    `${file} is missing ${token}`);
});

const styles = fs.readFileSync(
  path.join(__dirname, "..", "src", "original", "runtime-battle-styles.js"), "utf8");
assert(styles.includes('"nanali-slaughter-witch": "./nanali-slaughter-witch-skin.css"'),
  "runtime battle styles must map nanali-slaughter-witch to its css");

const bundle = JSON.parse(fs.readFileSync(
  path.join(__dirname, "..", "tools", "publish-bundles.json"), "utf8"));
const presentation = bundle["battle-presentation"];
const bundleFiles = Array.isArray(presentation) ? presentation : (presentation.files || []);
assert(bundleFiles.some(file => String(file).includes("nanali-slaughter-witch-skin-fx.js")),
  "the skin fx module must ship inside the battle-presentation bundle");

const css = fs.readFileSync(
  path.join(__dirname, "..", "publish", "nanali-slaughter-witch-skin.css"), "utf8");
[
  "nanali-witch-entry", "nanali-witch-entering", "nanali-witch-idle",
  "nanali-witch-eye", "nanali-witch-crescent", "nanali-witch-chains",
  "nanali-witch-chain-break", "nanali-witch-essence-line",
  "nanali-witch-circle", "nanali-witch-dash", "nanali-witch-cross",
  "nanali-witch-victory-show", "nanali-victory-blade", "nanali-victory-eye",
].forEach(token => assert(css.includes(token), `skin css is missing ${token}`));
assert(css.includes("prefers-reduced-motion"),
  "skin css must respect reduced-motion preferences");

console.log("nanali-slaughter-witch skin OK");
