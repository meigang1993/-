// 专项：【征服欲望】觉醒是否污染存档角色模板（跨局 BUG 复现）
//
// 症状（用户报告）：艾伦格的【计算下注】没有了，一进战斗就是觉醒状态。
//
// 怀疑链路：
//   guest-aileng-skills.js replaceSkill()
//     apply(actor)      → 改战斗单位（局内，正确）
//     apply(character)  → 改 state.chars 里的角色模板（写进存档！）
//   store-state-factory: state.chars 是持久化字段
//     （local-core-utils syncScopes 里 chars: true）
//   battle-setup.js:22: skills: c.skills || []
//     → 下一局战斗单位直接沿用被改过的模板数组
//
// 于是第一局死人 → 艾伦格觉醒 → 存档模板被永久改掉 →
// 第二局起艾伦格初始就没有【计算下注】，只有【充能精华】。
//
// 判据（可证伪）：
//   · 局内：战斗单位艾伦格确实失去【计算下注】并获得【充能精华】（觉醒生效）
//   · 存档：state.chars 里的艾伦格模板必须**保留**【计算下注】与【征服欲望】
//     ——觉醒是局内临时状态，不该写回存档
//   · 第二局：按 battle-setup 的取法重建单位，必须仍有【计算下注】
//
// 防假通过：
//  1) 先断言初始模板确实含三个技能，否则"本来就没有"会被算通过；
//  2) 战斗单位 skills 用**同一引用**指向存档模板数组（与 battle-setup 一致），
//     否则测不到引用层面的污染；
//  3) 走两条入口：艾伦格专属 onDeath、完整死亡链 afterDamage。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass += 1; console.log(`✅ ${name}${extra ? " — " + extra : ""}`); }
  else { fail += 1; console.log(`❌ ${name}${extra ? " — " + extra : ""}`); }
}

// entry: "aileng" 走艾伦格专属 onDeath；"chain" 走完整死亡链 afterDamage
async function drive(page, entry) {
  return page.evaluate(`(() => {
    const state = window.state, b = state.battle;
    b.locked = false; b.animQueue = []; b.reactionQueue = [];
    b.guestDeathUids = [];
    const tpl = window.GameData.characters.find(c => c.id === "aileng");
    if (!tpl) return { error: "模板不存在" };
    // 干净模板副本（深拷贝，避免测试自身污染 GameData）
    const cleanSkills = JSON.parse(JSON.stringify(tpl.skills));
    let ch = state.chars.find(c => c.id === "aileng");
    if (!ch) { ch = { id: "aileng", ref: "aileng" }; state.chars.push(ch); }
    ch.skills = cleanSkills;
    let aileng = b.allies.find(u => u.ref === "aileng");
    if (!aileng) {
      aileng = { uid: "a9", side: "ally", ref: "aileng", name: "艾伦格",
        hp: 50, maxHp: 62, hand: [], pileStats: { deck: [], discard: [], consumed: [] } };
      b.allies.push(aileng);
    }
    aileng.hp = 50; aileng.ref = "aileng";
    aileng.skills = ch.skills;   // 与 battle-setup.js:22 一致：同一引用
    const dead = b.enemies[0];
    const before = {
      actor: aileng.skills.map(s => s.name),
      chars: ch.skills.map(s => s.name),
    };
    if ("${entry}" === "aileng") {
      window.GuestAilengSkills.onDeath(state);
    } else {
      dead.hp = 0;
      window.GuestCharacterSkills.afterDamage(
        state, aileng, dead, { name: "杀（普攻）", type: "slash" }, 10, { draw() {} });
    }
    const chAfter = state.chars.find(c => c.id === "aileng");
    return {
      before,
      afterActor: aileng.skills.map(s => s.name),
      afterChars: (chAfter.skills || []).map(s => s.name),
      // 第二局取法（battle-setup.js:22 skills: c.skills || []）
      nextRun: (chAfter.skills || []).slice().map(s => s.name),
      log: (state.log || []).slice(-3),
    };
  })()`);
}

// 场景 C：【征服欲望成功】路径（累计 8 次受伤 → 战斗之勇）同样不得回写存档
async function driveCourage(page) {
  return page.evaluate(`(() => {
    const state = window.state, b = state.battle;
    b.locked = false; b.animQueue = []; b.reactionQueue = [];
    const tpl = window.GameData.characters.find(c => c.id === "aileng");
    const cleanSkills = JSON.parse(JSON.stringify(tpl.skills));
    let ch = state.chars.find(c => c.id === "aileng");
    if (!ch) { ch = { id: "aileng", ref: "aileng" }; state.chars.push(ch); }
    ch.skills = cleanSkills;
    let aileng = b.allies.find(u => u.ref === "aileng");
    if (!aileng) {
      aileng = { uid: "a9", side: "ally", ref: "aileng", name: "艾伦格",
        hp: 50, maxHp: 62, hand: [], pileStats: { deck: [], discard: [], consumed: [] } };
      b.allies.push(aileng);
    }
    aileng.hp = 50; aileng.ref = "aileng"; aileng.ailengDamageHits = 0;
    aileng.skills = ch.skills;
    for (let i = 0; i < 8; i += 1) window.GuestAilengSkills.afterDamage(state, aileng, 5, {});
    const chAfter = state.chars.find(c => c.id === "aileng");
    return {
      before: cleanSkills.map(s => s.name),
      hits: aileng.ailengDamageHits,
      afterActor: aileng.skills.map(s => s.name),
      afterChars: (chAfter.skills || []).map(s => s.name),
    };
  })()`);
}

// 场景 D：已被污染的老存档，读档迁移后能否自动恢复
async function driveMigrate(page) {
  return page.evaluate(`(() => {
    const state = window.state;
    let ch = state.chars.find(c => c.id === "aileng");
    if (!ch) { ch = { id: "aileng", ref: "aileng" }; state.chars.push(ch); }
    ch.skills = [{ name: "战斗演练", type: "passive" },
      { name: "充能精华", type: "active" }];
    const polluted = ch.skills.map(s => s.name);
    let err = "";
    try { window.GameStoreMigrations.migrate(state); } catch (e) { err = String(e); }
    const chAfter = state.chars.find(c => c.id === "aileng");
    return { polluted, err, after: (chAfter?.skills || []).map(s => s.name) };
  })()`);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await startRegressionBattle(page);

  for (const entry of ["aileng", "chain"]) {
    const r = await drive(page, entry);
    const tag = entry === "aileng" ? "A" : "B";
    console.log(`\n--- 场景 ${tag}：${entry === "aileng" ? "艾伦格专属 onDeath" : "完整死亡链 afterDamage"} ---`);
    if (r.error) { check(`${tag}0 驱动成功`, false, r.error); continue; }
    console.log(`  前：战斗单位 ${JSON.stringify(r.before.actor)}`);
    console.log(`      存档模板 ${JSON.stringify(r.before.chars)}`);
    console.log(`  后：战斗单位 ${JSON.stringify(r.afterActor)}`);
    console.log(`      存档模板 ${JSON.stringify(r.afterChars)}`);
    console.log(`  日志 ${JSON.stringify(r.log)}`);

    check(`${tag}1 前置：初始模板含【计算下注】【战斗演练】【征服欲望】`,
      ["计算下注", "战斗演练", "征服欲望"].every(n => r.before.chars.includes(n)),
      JSON.stringify(r.before.chars));

    check(`${tag}2 局内觉醒生效：战斗单位失去【计算下注】`,
      !r.afterActor.includes("计算下注"), JSON.stringify(r.afterActor));
    check(`${tag}3 局内觉醒生效：战斗单位获得【充能精华】`,
      r.afterActor.includes("充能精华"), JSON.stringify(r.afterActor));

    check(`${tag}4 存档模板不得被改：仍保留【计算下注】`,
      r.afterChars.includes("计算下注"), JSON.stringify(r.afterChars));
    check(`${tag}5 存档模板不得被改：仍保留【征服欲望】`,
      r.afterChars.includes("征服欲望"), JSON.stringify(r.afterChars));
    check(`${tag}6 第二局重建单位仍有【计算下注】`,
      r.nextRun.includes("计算下注"), JSON.stringify(r.nextRun));
  }

  const c = await driveCourage(page);
  console.log("\n--- 场景 C：征服欲望成功（8 次受伤 → 战斗之勇）---");
  console.log(`  前 ${JSON.stringify(c.before)}  累计受伤 ${c.hits}`);
  console.log(`  后：战斗单位 ${JSON.stringify(c.afterActor)}`);
  console.log(`      存档模板 ${JSON.stringify(c.afterChars)}`);
  check("C1 前置：初始模板含【计算下注】", c.before.includes("计算下注"));
  check("C2 局内觉醒生效：战斗单位获得【战斗之勇】",
    c.afterActor.includes("战斗之勇"), JSON.stringify(c.afterActor));
  check("C3 局内觉醒生效：战斗单位失去【征服欲望】",
    !c.afterActor.includes("征服欲望"), JSON.stringify(c.afterActor));
  check("C4 存档模板不得被改：仍保留【计算下注】",
    c.afterChars.includes("计算下注"), JSON.stringify(c.afterChars));
  check("C5 存档模板不得被改：仍保留【征服欲望】",
    c.afterChars.includes("征服欲望"), JSON.stringify(c.afterChars));

  const d = await driveMigrate(page);
  console.log("\n--- 场景 D：已污染老存档 → 读档迁移 ---");
  console.log(`  污染态 ${JSON.stringify(d.polluted)}`);
  console.log(`  迁移后 ${JSON.stringify(d.after)}${d.err ? "  err=" + d.err : ""}`);
  check("D1 迁移未抛错", !d.err, d.err);
  check("D2 已污染存档迁移后恢复【计算下注】",
    d.after.includes("计算下注"), JSON.stringify(d.after));
  check("D3 已污染存档迁移后恢复【征服欲望】",
    d.after.includes("征服欲望"), JSON.stringify(d.after));

  check("Z 无页面错误", errors.length === 0, errors.slice(0, 2).join(" | "));
  console.log(`\n=== 通过 ${pass} / 失败 ${fail} ===`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
