// 专项：魅魔图鉴悬停浮字 —— 所有角色的浮字都应只含技能描述，不含「角色定位」
// 背景：此前浮字形如「机械魔偶\n⭐ 技能…」，角色定位混在技能描述里，需确认全部角色已清理。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startFreshGame } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

function check(name, cond, extra) {
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return cond ? 1 : 0;
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  let pass = 0, total = 0;
  const T = (n, c, x) => { total++; pass += check(n, c, x); };

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", e => errors.push(String(e)));
  await openGame(page);
  await startFreshGame(page);

  // 打开魅魔图鉴（state.succubusCodex = true 后 render）
  await page.evaluate(`(() => {
    window.state.succubusCodex = true;
    window.state.view = "hall";
    window.render();
    return true;
  })()`);
  await page.waitForTimeout(600);

  // 抓取每个角色的：名字 / 卡片下方定位文本 / 浮字文本
  const rows = await page.evaluate(`(() => {
    const cards = [...document.querySelectorAll(".codex-char")];
    return cards.map(c => {
      const pop = c.querySelector(".codex-skill-pop");
      const nameEl = c.querySelector("b");
      const ps = [...c.querySelectorAll("p")].map(p => p.textContent.trim());
      return {
        id: (c.id || "").replace("codex-", ""),
        name: nameEl ? nameEl.textContent.trim() : "",
        cardTexts: ps,
        pop: pop ? pop.textContent.trim() : null,
      };
    });
  })()`);

  console.log(`图鉴角色总数: ${rows.length}`);
  if (!rows.length) {
    console.log("❌ 未取到任何图鉴卡片");
    await browser.close();
    process.exit(1);
  }

  T("图鉴卡片全部含浮字节点", rows.every(r => r.pop !== null),
    rows.filter(r => r.pop === null).map(r => r.id));
  T("浮字全部非空（均有技能描述）",
    rows.every(r => r.pop && r.pop.length > 0 && r.pop !== "暂无技能"),
    rows.filter(r => !r.pop || r.pop === "暂无技能").map(r => ({ id: r.id, pop: r.pop })));

  // 关键：浮字不得以「角色定位」开头或单独成行
  // 角色定位 = 卡片下方第一行 <p>（roleOf 输出）
  const bad = rows.filter(r => {
    if (!r.pop) return false;
    const first = r.pop.split("\n")[0].trim();
    const role = (r.cardTexts || [])[0] || "";
    return role && (first === role || r.pop.startsWith(role + "\n"));
  });
  T("浮字不含角色定位（所有角色）", bad.length === 0,
    bad.map(r => ({ id: r.id, name: r.name, head: r.pop.split("\n")[0] })));

  // 浮字应以技能图标行开头（⭐/🔵/💠 等），而非纯定位词
  const noIcon = rows.filter(r => r.pop && !/^[^\s]/.test(r.pop));
  T("浮字以技能行开头", noIcon.length === 0, noIcon.map(r => r.id));

  // 更严格：浮字全文不得出现「角色定位」字样（历史版本曾拼在技能描述里）
  const hasRoleLabel = rows.filter(r => /角色定位/.test(r.pop || ""));
  T("浮字全文不含「角色定位」字样", hasRoleLabel.length === 0,
    hasRoleLabel.map(r => ({ id: r.id, name: r.name })));

  // 最严格：浮字不得包含该角色的 evaluation 实战定位文本（取前 10 字比对）
  const evals = await page.evaluate(`(() => {
    const out = {};
    (window.GameData?.characters || []).forEach(c => { out[c.id] = c.evaluation || ""; });
    return out;
  })()`);
  const evalHit = rows.filter(r => {
    const ev = (evals[r.id] || "").slice(0, 10);
    return ev.length >= 6 && (r.pop || "").includes(ev);
  });
  T("浮字不含实战定位文本（evaluation）", evalHit.length === 0,
    evalHit.map(r => ({ id: r.id, name: r.name, ev: (evals[r.id] || "").slice(0, 16) })));

  // 立绘 title 浮字（skillSummary）同样不得含角色定位
  const portraitTitles = await page.evaluate(`(() => {
    return [...document.querySelectorAll(".codex-char .portrait, .codex-char img")]
      .map(e => e.getAttribute("title") || e.closest("[title]")?.getAttribute("title") || "")
      .filter(Boolean);
  })()`);
  const portraitBad = portraitTitles.filter(t => /角色定位/.test(t));
  T("立绘 title 浮字不含「角色定位」", portraitBad.length === 0,
    portraitBad.slice(0, 3));

  // 抽样打印 3 个角色的浮字开头，肉眼可核对
  console.log("\n--- 抽样浮字（前 3 个角色的首行）---");
  rows.slice(0, 3).forEach(r => {
    console.log(`  ${r.name}(${r.id}): ${(r.pop || "").split("\n")[0]}`);
  });
  const withRoleCard = rows.filter(r => (r.cardTexts || [])[0]);
  console.log(`\n卡片下方仍显示定位的角色数: ${withRoleCard.length}/${rows.length}`);
  console.log("  示例:", withRoleCard.slice(0, 3)
    .map(r => `${r.name}=${r.cardTexts[0]}`).join(", "));

  await page.close();
  await browser.close();
  console.log(`\n页面错误: ${errors.length}${errors.length ? " → " + errors.slice(0, 3).join(" | ") : ""}`);
  console.log(`\n=== ${pass}/${total} 通过 ===`);
  process.exit(pass === total && errors.length === 0 ? 0 : 1);
})();
