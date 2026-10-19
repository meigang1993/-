// 凯瑟琳 ·【窃取】无可用目标时的行为边界回归
//
// 用户提问：没有「其他角色」或没有「存活角色」时使用窃取，会不会卡住？
// 本脚本走真实 DOM，覆盖三类缺目标场景，判据是「是否卡住」：
//   battle.locked 是否残留为真、picker 是否残留、界面是否还能继续操作、
//   以及是否抛出 JS 错误。
//
// 三类场景：
//   A 我方只剩凯瑟琳本人（队友全部阵亡）
//   B 敌方全部没有手牌（无可窃取的目标）
//   C 正常场景（对照组，必须照常走通）
//   D 选定敌方目标后、点击接收者之前，唯一存活队友阵亡
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return !!cond;
};

// mode: "noMate" 队友全灭 / "noFoeHand" 敌人全无手牌 / "ok" 正常
const setupTpl = mode => `(() => {
  const st = window.state, b = st.battle;
  // 测试模式会在我方角色阵亡时自动满血复活（"测试模式·生命恢复"），
  // 会让"队友全灭"场景永远构造不出来，必须先关掉。
  b.test = false;
  b.animQueue = []; b.locked = false;
  b.selectedCardIndex = null; b.selectedSkillCard = null; b.pendingTargetUid = null;
  b.catherineStealPicker = null; b.handReveal = null;
  b.activeUid = b.allies[0].uid; b.phase = 4;
  const c = b.allies[0];
  c.name = "凯瑟琳"; c.ref = "catherine"; c.id = "catherine";
  const src = (window.GameDataCharactersExtra || [])
    .find(item => item.id === "catherine");
  const tplStats = src?.stats || { attack: 1, magic: 3, speed: 2, maxHp: 28 };
  c.hp = tplStats.maxHp; c.maxHp = tplStats.maxHp;
  c.block = 0; c.tempMagic = 0; c.intent = 1;
  c.stats = { ...tplStats };
  c.usedCatherineSteal = false;
  c.hand = [];
  c.skills = src ? JSON.parse(JSON.stringify(src.skills)) : [];
  const modeNow = ${JSON.stringify(mode)};
  b.allies.forEach((u, i) => {
    if (i === 0) return;
    u.hp = modeNow === "noMate" ? 0 : 100;
    u.maxHp = 100; u.hand = [];
  });
  b.enemies.forEach((u, i) => {
    u.hp = i === 0 ? 100 : 90; u.maxHp = 100; u.block = 0;
    u.hand = (modeNow === "noFoeHand" || i > 0) ? [] : [
      { name: "杀", type: "slash", suit: "♥", scale: "attack" },
      { name: "闪", type: "response", suit: "♠" },
    ];
    u.hand.forEach(x => { delete x._pendingDraw; });
  });
  st.log = [];
  window.render();
  return { ok: true, foeUid: b.enemies[0].uid, selfUid: b.allies[0].uid,
    mateUid: b.allies.find((u, i) => i > 0 && u.hp > 0)?.uid || null,
    aliveMates: b.allies.filter((u, i) => i > 0 && u.hp > 0).length };
})()`;

const dumpTpl = `(() => {
  const b = window.state.battle;
  return {
    _dbg: { pickerRaw: b.catherineStealPicker || null, activeUid: b.activeUid,
      handOwner: document.querySelector("[data-hand-owner]")?.dataset.handOwner || null,
      alliesHp: (b.allies || []).map(u => u.hp) },
    locked: !!b.locked, picker: !!b.catherineStealPicker,
    handReveal: !!b.handReveal, used: !!b.allies[0].usedCatherineSteal,
    selectedSkill: b.selectedSkillCard?.name || null,
    promptText: document.querySelector(".hand-panel .discard-prompt")?.textContent || "",
    centered: !!document.querySelector(".dimension-prompt"),
    selectable: [...document.querySelectorAll("[data-target].selectable-target")]
      .map(node => node.dataset.target),
    logs: (window.state.log || []).slice(-8).map(x => x.text || String(x)) };
})()`;

async function freshPage(browser, mode) {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await startRegressionBattle(page);
  const setup = await page.evaluate(setupTpl(mode));
  return { page, errors, setup };
}

(async () => {
  const browser = await chromium.launch();

  // ---------- A 我方只剩凯瑟琳（队友全灭） ----------
  {
    const { page, errors, setup } = await freshPage(browser, "noMate");
    console.log("\n【A】队友全部阵亡，凯瑟琳独自在场");
    T("A 场景构造：确无存活队友", setup.aliveMates === 0, setup);
    await page.locator("[data-skill-index]").first().click();
    await page.waitForTimeout(1200);
    const afterSkill = await page.evaluate(dumpTpl);
    T("A 点击技能后未卡死（锁定未残留）", afterSkill.locked === false, afterSkill);
    T("A 未弹出居中选人窗口", afterSkill.centered === false, afterSkill);
    // 没有接收者时，技能应当明确不可用：不得进入待选目标后无声息地吃掉一次出牌
    T("A 未进入接收者选择（picker 为空）", afterSkill.picker === false, afterSkill);
    T("A 无可用队友时不误置 usedCatherineSteal", afterSkill.used === false, afterSkill);
    T("A 无 JS 报错", errors.length === 0, errors.slice(0, 3));
    // 界面仍可继续操作：技能栏按钮必须还在且未整体禁用，否则就是卡死
    const canAct = await page.evaluate(`(() => {
      const btns = [...document.querySelectorAll("[data-skill-index]")];
      return btns.length > 0 && btns.some(n => !n.disabled);
    })()`);
    T("A 界面仍可继续操作（技能栏仍可用）", canAct === true, { canAct });
    // 无可用目标时不得静默吃掉一次出牌：日志里不应出现"使用窃取"
    T("A 无可用目标时不写「使用窃取」日志（不静默吞掉）",
      !(afterSkill.logs || []).some(t => /使用窃取/.test(t)), afterSkill.logs);
    await page.close();
  }

  // ---------- B 敌方全部没有手牌 ----------
  {
    const { page, errors, setup } = await freshPage(browser, "noFoeHand");
    console.log("\n【B】敌方全部没有手牌");
    await page.locator("[data-skill-index]").first().click();
    await page.waitForTimeout(1200);
    const afterSkill = await page.evaluate(dumpTpl);
    T("B 点击技能后未卡死（锁定未残留）", afterSkill.locked === false, afterSkill);
    T("B 未进入接收者选择（picker 为空）", afterSkill.picker === false, afterSkill);
    T("B 无可窃取目标时不误置 usedCatherineSteal",
      afterSkill.used === false, afterSkill);
    T("B 无 JS 报错", errors.length === 0, errors.slice(0, 3));
    await page.close();
  }

  // ---------- C 正常场景（对照组） ----------
  {
    const { page, errors, setup } = await freshPage(browser, "ok");
    console.log("\n【C】正常场景（对照组）");
    T("C 场景构造：有存活队友且有持牌敌人",
      setup.aliveMates > 0 && !!setup.foeUid, setup);
    await page.locator("[data-skill-index]").first().click();
    await page.waitForTimeout(1200);
    await page.locator(`[data-target="${setup.foeUid}"]`).first().click();
    await page.waitForFunction(
      () => !!window.state.battle?.catherineStealPicker, null, { timeout: 8000 })
      .catch(() => {});
    const afterFoe = await page.evaluate(dumpTpl);
    T("C 正常场景照常进入接收者选择", afterFoe.picker === true, afterFoe);
    T("C 正常场景置起锁定等待玩家选择", afterFoe.locked === true, afterFoe);
    T("C 无 JS 报错", errors.length === 0, errors.slice(0, 3));

    // ---------- D 选定敌人后，唯一队友阵亡再点击 ----------
    console.log("\n【D】进入接收者选择后，存活队友全部阵亡");
    await page.evaluate(`(() => {
      const b = window.state.battle;
      b.allies.forEach((u, i) => { if (i > 0) u.hp = 0; });
      window.render();
    })()`);
    // render 之后引擎还会异步重绘一次，固定时序直接采样会读到「仍在选敌方目标」
    // 的旧界面（提示条为空），必须等提示条真正出现再断言。
    await page.waitForFunction(
      () => !!document.querySelector("[data-catherine-receiver-skip]"),
      null, { timeout: 8000 }).catch(() => {});
    const afterDeath = await page.evaluate(dumpTpl);
    T("D 队友全灭后界面仍渲染（未崩溃）",
      typeof afterDeath.locked === "boolean", afterDeath);
    // 此时不存在合法接收者。玩家唯一的出路是提示条上的「放弃」按钮，
    // 只要它还在并可点，就不算死锁（这是本场景真正要守的底线）。
    const skipBtn = page.locator("[data-catherine-receiver-skip]").first();
    const hasSkip = await skipBtn.count() > 0;
    T("D 无合法接收者时仍提供「放弃」出口", hasSkip === true, { hasSkip });
    if (hasSkip) {
      await skipBtn.click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(600);
    }
    const afterClick = await page.evaluate(dumpTpl);
    T("D 放弃后不再卡死（锁定已解除）", afterClick.locked === false, afterClick);
    T("D 放弃后 picker 已清空", afterClick.picker === false, afterClick);
    T("D 放弃时给出明确日志，不静默吞掉",
      (afterClick.logs || []).some(t => /放弃发动窃取|没有可窃取/.test(t)),
      afterClick.logs);
    T("D 无 JS 报错", errors.length === 0, errors.slice(0, 3));
    await page.close();
  }

  await browser.close();
  console.log(`\n结果：${pass}/${total}`);
  process.exit(pass === total ? 0 : 1);
})();
