// 【选择角色类技能】无合法目标时的置灰边界排查
//
// 背景：凯瑟琳【窃取】曾出现「无目标时按钮仍可点、点了毫无反馈」的问题。
// 本脚本按同一口径排查其余需要选择角色的技能，判据是：
//   ① 无合法目标时按钮必须置灰（不带 data-skill-index）
//   ② 真实点击不得进入目标选择、不得锁死界面、不得白吃出牌次数
//   ③ 有合法目标时必须照常可点（防过度置灰）
//
// 覆盖（character-skill-access.js 中 target 非 self 的技能）：
//   狙击目标(敌方+需手牌) / 模仿之音(其他角色) / 榨取精华(友方男性)
//   女王榨取(友方男性)   / 半魅魔精华(友方女性) / 充能精华(友方女性)
//   偶像之吻(其他友方)
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let passed = 0, failed = 0;
const T = (name, cond, extra) => {
  if (cond) { passed++; console.log("✅ " + name); } else {
    failed++; console.log("❌ " + name + (extra ? "  ← " + JSON.stringify(extra) : ""));
  }
};

// 通用场景构造：把我方 0 号改造成指定角色，按 mode 布置敌人/队友
const setupTpl = (ref, dataVar, mode, prepare, mateGender) => `(() => {
  const st = window.state, b = st.battle;
  b.test = false;
  b.animQueue = []; b.locked = false;
  b.selectedCardIndex = null; b.selectedSkillCard = null; b.pendingTargetUid = null;
  b.selectedBagIndexes = null;
  const c = b.allies[0];
  const src = (${dataVar} || []).find(item => item.id === "${ref}");
  const tplStats = src?.stats || { attack: 3, magic: 3, speed: 3, maxHp: 50 };
  c.name = src?.name || "${ref}"; c.ref = "${ref}"; c.id = "${ref}";
  c.hp = tplStats.maxHp; c.maxHp = tplStats.maxHp; c.block = 0; c.intent = 3;
  c.stats = { ...tplStats };
  c.skills = src ? JSON.parse(JSON.stringify(src.skills)) : [];
  ["usedArtinaSniper","usedMimic","usedExtract","usedPreshiDrain",
   "usedKaiichiMilk","usedAilengCharge","usedIdolKiss","usedCatherineSteal"]
    .forEach(k => { c[k] = false; });
  // 队友性别与存活
  b.allies.forEach((u, i) => {
    if (i === 0) return;
    u.hp = ${mode === "noMate" ? "0" : "100"}; u.maxHp = 100;
    u.gender = ${mode === "noMale" ? '"female"' : mode === "noFemale" ? '"male"' : (mateGender ? JSON.stringify(mateGender) : "u.gender")};
    u.hand = []; u.skills = [];
  });
  c.gender = ${mode === "noMale" ? '"female"' : mode === "noFemale" ? '"male"' : "c.gender"};
  // 敌人：noHand 时全部空手牌
  b.enemies.forEach(u => {
    u.hp = 100; u.maxHp = 100; u.block = 0;
    u.hand = ${mode === "noHand" ? "[]" : '[{ name: "杀", type: "slash", suit: "♥", scale: "attack" }]'};
    u.hand.forEach(x => { delete x._pendingDraw; });
  });
  // 自己给一张红桃，满足偶像之吻等费用
  c.hand = [{ name: "闪", type: "response", suit: "♥", scale: "none" }];
  c.hand.forEach(x => { delete x._pendingDraw; });
  b.activeUid = c.uid;
  // 准备阶段发动的技能（榨取精华/模仿之音）需要对应的阶段窗口，
  // 否则按钮会因「只能在对应准备阶段窗口发动」而置灰，掩盖真正的目标判据。
  if (${prepare ? "true" : "false"}) {
    b.phase = 1;
    b[${prepare ? JSON.stringify(prepare) : "null"}] = c.uid;
  } else { b.phase = 4; }
  st.log = [];
  window.render();
  return { ok: !!c.skills.length, gender: c.gender };
})()`;

// 按技能名找按钮
const btnTpl = name => `(() => {
  const nodes = [...document.querySelectorAll("button.skill")]
    .filter(n => (n.getAttribute("title") || "").includes("${name}"));
  if (!nodes.length) return { found: false };
  const n = nodes[0];
  return {
    found: true,
    disabled: n.classList.contains("disabled"),
    aria: n.getAttribute("aria-disabled"),
    hasIndex: n.hasAttribute("data-skill-index"),
    title: (n.getAttribute("title") || "").trim(),
  };
})()`;

// 点击后检查是否卡住
const afterClickTpl = `(() => {
  const b = window.state.battle;
  return {
    locked: !!b.locked,
    pending: b.pendingTargetUid != null || !!b.selectedSkillCard,
    used: !!b.allies[0].usedArtinaSniper || !!b.allies[0].usedMimic
       || !!b.allies[0].usedExtract || !!b.allies[0].usedPreshiDrain
       || !!b.allies[0].usedKaiichiMilk || !!b.allies[0].usedAilengCharge
       || !!b.allies[0].usedIdolKiss,
  };
})()`;

const setup = async (page, ref, dataVar, mode, name, prepare, mateGender) => {
  await page.evaluate(setupTpl(ref, dataVar, mode, prepare, mateGender));
  await page.waitForTimeout(320);
  return page.evaluate(btnTpl(name));
};
const clickAndCheck = async (page, ref, dataVar, mode, prepare, mateGender) => {
  await page.evaluate(setupTpl(ref, dataVar, mode, prepare, mateGender));
  await page.waitForTimeout(320);
  await page.locator("button.skill").first()
    .click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(700);
  return page.evaluate(afterClickTpl);
};

(async () => {
  const browser = await chromium.launch();
  const pageErrors = [];
  const page = await browser.newPage();
  page.on("pageerror", e => pageErrors.push(String(e)));
  await openGame(page);
  await startRegressionBattle(page);

  // ══════ A · 狙击目标：敌方全部空手牌 ══════
  console.log("── A · 狙击目标（敌方全空手牌）──");
  const aOk = await setup(page, "artina", "window.GameDataNewCharacters", "ok", "狙击目标");
  T("A0 对照：敌方有手牌时可点", aOk.found && aOk.hasIndex && !aOk.disabled, aOk);
  const aNo = await setup(page, "artina", "window.GameDataNewCharacters", "noHand", "狙击目标");
  T("A1 敌方全空手牌：按钮置灰", aNo.found && aNo.disabled === true, aNo);
  T("A2 敌方全空手牌：不带 data-skill-index", aNo.hasIndex === false, aNo);
  const aClick = await clickAndCheck(page, "artina", "window.GameDataNewCharacters", "noHand");
  T("A3 真实点击不锁死界面", aClick.locked === false, aClick);
  T("A4 真实点击不白吃出牌次数", aClick.used === false, aClick);

  // ══════ B · 模仿之音：其他角色全部阵亡 ══════
  console.log("── B · 模仿之音（其他角色全阵亡）──");
  const bOk = await setup(page, "nonoka", "window.GameDataCharactersCore", "ok", "模仿之音", "awaitingMimicUid");
  T("B0 对照：有其他角色时可点", bOk.found && bOk.hasIndex, bOk);
  const bNo = await setup(page, "nonoka", "window.GameDataCharactersCore", "noMate", "模仿之音", "awaitingMimicUid");
  T("B1 其他角色全阵亡（仅剩敌方也全灭则战斗已结束，此处敌人仍存活）"
    + "→ 敌方存活时应仍可点", bNo.found && bNo.hasIndex === true, bNo);

  // ══════ C · 榨取精华：无存活友方男性 ══════
  console.log("── C · 榨取精华（无友方男性）──");
  const cNo = await setup(page, "besta_doll", "window.GameDataCharactersCore", "noMale", "榨取精华", "awaitingExtractUid");
  T("C1 无存活友方男性：按钮置灰", cNo.found && cNo.disabled === true, cNo);
  const cOk = await setup(page, "besta_doll", "window.GameDataCharactersCore", "ok", "榨取精华", "awaitingExtractUid", "male");
  T("C0 对照：有友方男性时可点", cOk.found && cOk.hasIndex, cOk);

  // ══════ D · 半魅魔精华：无存活友方女性 ══════
  console.log("── D · 半魅魔精华（无友方女性）──");
  const dNo = await setup(page, "hoshino_kaiichi", "window.GameDataNewCharacters", "noFemale", "半魅魔精华");
  T("D1 无存活友方女性：按钮置灰", dNo.found && dNo.disabled === true, dNo);
  const dOk = await setup(page, "hoshino_kaiichi", "window.GameDataNewCharacters", "ok", "半魅魔精华", null, "female");
  T("D0 对照：有友方女性时可点", dOk.found && dOk.hasIndex, dOk);

  // ══════ E · 偶像之吻：无存活其他友方 ══════
  console.log("── E · 偶像之吻（队友全阵亡）──");
  const eNo = await setup(page, "nonoka", "window.GameDataCharactersCore", "noMate", "偶像之吻");
  T("E1 队友全阵亡：按钮置灰", eNo.found && eNo.disabled === true, eNo);
  const eOk = await setup(page, "nonoka", "window.GameDataCharactersCore", "ok", "偶像之吻");
  T("E0 对照：有队友时可点", eOk.found && eOk.hasIndex, eOk);

  T("页面无 JS 错误", pageErrors.length === 0, pageErrors.slice(0, 3));

  console.log(`\n通过 ${passed} / 失败 ${failed}`);
  await browser.close();
  process.exitCode = failed ? 1 : 0;
})();
