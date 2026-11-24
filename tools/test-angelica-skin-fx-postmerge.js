// 【安洁莉卡·帝血弑天】皮肤特效 · 技能合并后完整复查
// 运行：node tools/test-angelica-skin-fx-postmerge.js
//       REVERT=sync|mount|fixture|line|css node ... （源码级反向验证）
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ROOT = path.resolve(__dirname, "..", "src", "original");
const REVERT = process.env.REVERT || "";
const src = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const tool = f => fs.readFileSync(path.join(__dirname, f), "utf8");
const test = f => fs.readFileSync(path.join(__dirname, "..", "tests", f), "utf8");

let CODE = {};
function codeOf(f) {
  if (CODE[f] !== undefined) return CODE[f];
  let s = src(f);
  if (REVERT === "sync" && f === "angelica-berserker-skin-fx.js") {
    const from = "    if (units.some(active)) return;";
    if (!s.includes(from)) throw new Error("REVERT=sync must hit sync guard");
    s = s.replace(from, "    return;");
  }
  if (REVERT === "mount" && f === "angelica-luka-skills.js") {
    const from = "window.AngelicaBerserkerSkinFX?.berserkWill?.(state, actor, spent);";
    if (!s.includes(from)) throw new Error("REVERT=mount must hit fx call");
    s = s.replace(from, "");
  }
  if (REVERT === "line" && f === "battle-line-data.js") {
    s = s.replace('"狂战意志": "游戏结束了，看我全力进攻。"', '"狂战意志": "接下来，老子使出全力了！"');
  }
  return (CODE[f] = s);
}
function toolOf(f) {
  let s = tool(f);
  if (REVERT === "fixture" && f === "test-angelica-merge-recheck.js") {
    s = s.replace(/^\s*healPctStacks:.*\n/m, "");
  }
  return s;
}
function testOf(f) {
  let s = test(f);
  if (REVERT === "css" && f === "preview-angelica-berserker-skin-effects.spec.js") {
    s = s.replace(/  await expect\.poll\(\(\) => page\.evaluate\(\(\) => \{\n    const screen = document\.querySelector\("\.victory-screen"\);\n    return screen \? \(screen\.scrollWidth - screen\.clientWidth\)\n      \+ \(screen\.scrollHeight - screen\.clientHeight\) : -1;\n  \}\), \{ timeout: 10000 \}\)\.toBe\(0\);\n/, "");
  }
  return s;
}

let pass = 0, total = 0; const reds = [];
const T = (group, name, ok, extra) => {
  total++;
  if (ok) pass++;
  else { reds.push({ group, name }); console.log(`  RED ${group} ${name}`, extra !== undefined ? JSON.stringify(extra) : ""); }
};

const fx = codeOf("angelica-berserker-skin-fx.js");
const skills = codeOf("angelica-luka-skills.js");
const lines = codeOf("battle-line-data.js");
const render = src("app-render.js");
const skinActions = src("app-battle-skin-actions.js");
const damageUtils = src("battle-damage-utils.js");
const battleStartFx = src("battle-fx.js");
const victory = src("battle-victory.js");
const dataExtra = src("data-characters-extra.js");
const dataSkins = src("data-skins.js");
const skillAccess = src("character-skill-access.js");
const registry = src("skill-once-per-turn.js");
const styles = src("runtime-battle-styles.js");
const css = fs.readFileSync(path.join(__dirname, "..", "publish", "angelica-berserker-skin.css"), "utf8");
const spec = testOf("preview-angelica-berserker-skin-effects.spec.js");
const switchSpec = fs.readFileSync(path.join(__dirname, "..", "tests", "test-skin-switch.spec.js"), "utf8");
const recent = src("update-notice-recent.js");

// ---------- A. 合并后技能 → 皮肤特效挂载点 ----------
const mounts = [
  ["力量爆发 / might", "AngelicaBerserkerSkinFX?.might?.", "grantMightBonus"],
  ["抵淫气 / rageSpend", "AngelicaBerserkerSkinFX?.rageSpend?.", "beforeIntentCost"],
  ["主动发动 / berserkWill", "AngelicaBerserkerSkinFX?.berserkWill?.", "function berserkWill"],
  ["获得标记 / rageGain", "AngelicaBerserkerSkinFX?.rageGain?.", "function gainRage"],
  ["战斗开始 / queueEntry", "AngelicaBerserkerSkinFX?.queueEntry?.", "function battleStart"],
];
mounts.forEach(([name, needle, scope]) => {
  T("A", `A-${name} 挂载点在合并后仍存在`, skills.includes(needle) && skills.includes(scope));
});
T("A", "A6 攻击拖尾 rageTrail 两处挂载点仍在",
  (damageUtils.match(/AngelicaBerserkerSkinFX\?\.rageTrail\?\./g) || []).length === 2);
T("A", "A7 重渲染 sync 钩子已接且不再是空实现",
  render.includes("AngelicaBerserkerSkinFX?.sync?.(state)")
  && fx.includes("if (units.some(active)) return;")
  && fx.includes("angelica-berserker-entering")
  && fx.includes("angelica-berserker-fx,.angelica-berserker-line"));
T("A", "A8 切皮肤时 cancel 全部 FX 并重新排队入场",
  skinActions.includes("window.AngelicaBerserkerSkinFX,\n      window.NanaliSlaughterWitchSkinFX")
  && skinActions.includes('skin.dynamicEffect === "angelica-berserker"')
  && skinActions.includes("AngelicaBerserkerSkinFX?.queueEntry?."));
T("A", "A9 战斗清理与胜利画面仍接该皮肤",
  battleStartFx.includes("AngelicaBerserkerSkinFX?.cancel?.()")
  && victory.includes("angelica-berserker-victory-show"));
T("A", "A10 台词表四键齐全且主动台词为合并后新句",
  lines.includes('"力量爆发": "这就是老子的力量，你们看到了吧！"')
  && lines.includes('"狂战造成伤害"') && lines.includes('"狂战受到伤害"')
  && lines.includes('"狂战意志": "游戏结束了，看我全力进攻。"')
  && !lines.includes('"狂战意志": "接下来，老子使出全力了！"'));
T("A", "A11 角色表／技能入口／一次性登记表／皮肤表一致",
  /name: "狂战意志", type: "active"/.test(dataExtra)
  && /berserkWill: true/.test(dataExtra)
  && /flags: \["berserkWill"\], name: "狂战意志"/.test(skillAccess)
  && /\["berserkWill", actor => !window\.AngelicaLukaSkills\?\.canUseBerserkWill\?\.\(actor\)\]/.test(registry)
  && /id: "angelica_berserker"/.test(dataSkins)
  && /dynamicEffect: "angelica-berserker"/.test(dataSkins));
T("A", "A12 皮肤 CSS 已登记延迟加载且 8 段类名齐全",
  styles.includes('"angelica-berserker": "./angelica-berserker-skin.css"')
  && ["armor", "burst", "shock", "giant", "heal", "pulse", "rain", "core"]
    .every(k => css.includes(`angelica-berserker-rampage-${k}`)));
T("A", "A13 FX 导出面完整（无 crimsonRampage 残留）",
  /return \{ active, entry, queueEntry, might, rageGain, rageSpend, rageTrail, berserkWill, sync, cancel \}/.test(fx)
  && !fx.includes("function crimsonRampage"));
T("A", "A14 公告写明合并后复查结论且未超归档线",
  recent.includes("【安洁莉卡·帝血弑天】皮肤特效")
  && recent.includes("没有发现表现层 BUG")
  && recent.split("\n").length <= 150, recent.split("\n").length);

// ---------- B. 真实 FX 模块调用 ----------
function mkFxContext() {
  const created = [];
  const makeNode = () => {
    const n = {
      className: "", innerHTML: "", style: { cssText: "", setProperty() {} },
      classList: { add() {}, remove() {} }, remove() { n._removed = true; },
      _removed: false,
    };
    created.push(n);
    return n;
  };
  const anchorEl = { classList: { add() {}, remove() {} } };
  const stale = [makeNode(), makeNode()];
  const pending = [];
  const c = {
    console, Math, Number, Object, Array, JSON, String, Boolean, Set, Map, Error, Date, RegExp,
    isNaN, parseInt, parseFloat,
    // 同步假时钟：berserkWill 的 8 段演出全部走 later(setTimeout)，
    // 真实定时器在纯 Node 夹具里不会在断言前跑完，这里立即排空任务队列。
    setTimeout: fn => { pending.push(fn); return pending.length; },
    clearTimeout: () => {},
  };
  c.__flush = () => { while (pending.length) pending.shift()(); };
  c.window = c;
  c.document = {
    createElement: makeNode,
    body: { appendChild() {} },
    querySelectorAll: sel => {
      if (sel.includes("angelica-berserker-entering")) return [];
      if (sel.includes("angelica-berserker-fx")) return stale;
      return [];
    },
  };
  c.BattleAudio = { tone() {} };
  c.BattleEffectAnchors = {
    place: () => ({ element: anchorEl }),
    mirror: () => null,
    action: () => anchorEl,
    measure: () => ({ center: { x: 0, y: 0 } }),
  };
  vm.createContext(c);
  vm.runInContext(codeOf("skin-fx-runtime.js"), c, { filename: "skin-fx-runtime.js" });
  c.SkinSystem = { dynamicEffectOf: () => "angelica-berserker" };
  c.state = { battle: { allies: [{ uid: "a", ref: "angelica", skinDynamicEffect: "angelica-berserker" }], enemies: [] } };
  vm.runInContext(codeOf("angelica-berserker-skin-fx.js"), c,
    { filename: "angelica-berserker-skin-fx.js" });
  return { c, created, stale };
}
{
  const { c, created } = mkFxContext();
  const unit = c.state.battle.allies[0];
  c.AngelicaBerserkerSkinFX.might(c.state, unit, { type: "slash" });
  c.AngelicaBerserkerSkinFX.rageGain(c.state, unit, true);
  c.AngelicaBerserkerSkinFX.rageSpend(c.state, unit, 4);
  c.AngelicaBerserkerSkinFX.rageTrail(c.state, unit, { uid: "e" });
  c.AngelicaBerserkerSkinFX.berserkWill(c.state, unit, 3);
  c.__flush();
  const classes = created.map(n => n.className).join(" ");
  const stages = ["armor", "burst", "shock", "giant", "heal", "pulse", "rain", "core"];
  T("B", "B1 真实调用挂载全部 8 段分阶段特效（合并后仍由狂战意志触发）",
    stages.every(k => classes.includes(`angelica-berserker-rampage-${k}`)),
    stages.filter(k => !classes.includes(`angelica-berserker-rampage-${k}`)));
  T("B", "B2 might/rageGain/rageSpend/rageTrail 四类特效均挂载",
    classes.includes("angelica-berserker-might")
    && classes.includes("angelica-berserker-rage-gain")
    && classes.includes("angelica-berserker-rage-slam")
    && classes.includes("angelica-berserker-rage-trail"));
  T("B", "B3 合并后主动技特效按弃置标记数逐枚脉冲",
    c.AngelicaBerserkerSkinFX.berserkWill(c.state, unit, 5) === undefined
    && /stage\(burstEnd \+ 620 \+ i \* 120/.test(fx)
    && /for \(let i = 0; i < marks; i \+= 1\)/.test(fx));
}
{
  const { c, stale } = mkFxContext();
  // 切走皮肤：不再有激活单位 → sync 应收掉残留节点与入场态
  c.SkinSystem.dynamicEffectOf = () => undefined;
  c.state.battle.allies[0].skinDynamicEffect = null;
  c.AngelicaBerserkerSkinFX.sync(c.state);
  T("B", "B4 sync 在皮肤切走后清除残留特效节点",
    stale.every(n => n._removed), stale.map(n => n._removed));
  // 仍有激活单位时 sync 不介入，入场演出不被掐断
  const { c: c2, created } = mkFxContext();
  const before = created.length;
  c2.AngelicaBerserkerSkinFX.sync(c2.state);
  T("B", "B5 sync 在皮肤仍激活时不新增也不清理节点", created.length === before);
  c2.AngelicaBerserkerSkinFX.cancel();
  T("B", "B6 cancel 可正常调用（清定时器 + 版本）", true);
}

// ---------- C. 合并后回归网与预览夹具 ----------
const fixtures = ["test-angelica-berserk-will-trail.js", "test-angelica-merge-recheck.js",
  "test-berserk-will-merge-audit.js", "test-berserk-will-boundary-tighten.js",
  "test-merge-skill-final-recheck.js", "test-berserk-will-phase-once-passive.js"];
T("C", "C1 六份合并复查夹具均补齐 healPctStacks",
  fixtures.every(f => toolOf(f).includes("healPctStacks:")));
T("C", "C2 合并审计白名单含历史事实引用脚本",
  toolOf("test-berserk-will-merge-audit.js").includes('"test-all-modified-skills-cheat.js"'));
T("C", "C3 胜利画面布局断言前等待延迟样式（消除竞态）",
  spec.includes("expect.poll") && spec.includes("scrollWidth - screen.clientWidth")
  && spec.indexOf("expect.poll") < spec.indexOf("const layout"));
T("C", "C4 切皮肤预览改为等待入场演出收尾",
  switchSpec.includes("expect.poll") && switchSpec.includes("1380ms")
  && !switchSpec.includes("page.waitForTimeout(500)"));
T("C", "C5 实机主动技链路脚本覆盖 8 段特效",
  toolOf("test-angelica-berserk-will-trail-live.js").includes("RAMPAGE")
  && toolOf("test-angelica-berserk-will-trail-live.js").includes("合并后仍由狂战意志触发"));

// ---------- 汇总 / 反向 ----------
console.log(`RESULT ${pass}/${total}`);
if (reds.length) {
  const groups = [...new Set(reds.map(r => r.group))];
  console.log(`REVERT=${REVERT || "none"} REDS=${JSON.stringify(reds.map(r => r.name))} GROUPS=${JSON.stringify(groups)}`);
  const expected = { sync: ["A", "B"], mount: ["A"], fixture: ["C"], line: ["A"], css: ["C"] }[REVERT];
  if (REVERT) {
    const ok = expected && expected.every(g => groups.includes(g))
      && groups.every(g => expected.includes(g));
    console.log(ok ? `REVERT=${REVERT} OK own>0 other=0` : `REVERT=${REVERT} IMPRECISE`);
    if (!ok) process.exit(1);
  } else process.exit(1);
} else {
  if (REVERT) { console.log(`REVERT=${REVERT} FAILED (no red, assertion is a no-op)`); process.exit(1); }
}
