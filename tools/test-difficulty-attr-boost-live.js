// 界面层验证：难度卡上给玩家看的 attrText 文案，必须与实际生效的属性倍率一致。
//
// 逻辑测试 test-difficulty-attr-boost.js 只核对配置值；本测试读真实渲染出的
// HTML，确认玩家在「准备启程」页看到的百分比就是改后的数值——避免只改了数值、
// 界面文案还停留在旧值（玩家会按旧文案判断难度）。

process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startFreshGame } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else console.log(`❌ ${name}  ← ${JSON.stringify(extra || {})}`);
  return !!cond;
};

// 期望：冒险级及以上整体 +20%（普通级不变）
const EXPECT = {
  "普通级": null,
  "冒险级": { hp: 150, power: 144, speed: 134 },
  "勇士级": { hp: 186, power: 170, speed: 151 },
  "王者级": { hp: 234, power: 202, speed: 170 },
  "英雄级": { hp: 294, power: 238, speed: 190 },
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await openGame(page);
  await startFreshGame(page);

  // 精确解析难度卡：<b>难度名</b> 与 <p>怪物属性 attrText</p>
  const cards = await page.evaluate(() => {
    const html = window.VillaTeamUI.team(window.state);
    const doc = new DOMParser().parseFromString(html, "text/html");
    return [...doc.querySelectorAll(".difficulty-card")].map(el => ({
      name: (el.querySelector("b") || {}).textContent || "",
      attr: ((el.querySelector("p") || {}).textContent || "").replace("怪物属性", "").trim(),
    }));
  });
  console.log(`  解析到难度卡 ${cards.length} 个`);
  const seen = new Set();
  for (const c of cards) {
    if (seen.has(c.name)) continue;
    seen.add(c.name);
    const exp = EXPECT[c.name];
    if (exp === undefined) { console.log(`  ⚠️ 未知难度「${c.name}」`); continue; }
    console.log(`  ${c.name}: ${c.attr}`);
    if (exp === null) {
      T(`普通级 attrText 仍为「基础」`, c.attr === "基础", { got: c.attr });
      continue;
    }
    const m = c.attr.match(/生命(\d+)%\s*\/?\s*输出(\d+)%\s*\/?\s*速度(\d+)%/);
    T(`${c.name} attrText 含三档百分比`, !!m, { got: c.attr });
    if (m) {
      T(`${c.name} 生命 ${m[1]}% = ${exp.hp}%`, +m[1] === exp.hp, { got: +m[1], expect: exp.hp });
      T(`${c.name} 输出 ${m[2]}% = ${exp.power}%`, +m[2] === exp.power, { got: +m[2], expect: exp.power });
      T(`${c.name} 速度 ${m[3]}% = ${exp.speed}%`, +m[3] === exp.speed, { got: +m[3], expect: exp.speed });
    }
  }
  T("五种难度全部出现", seen.size === 5, [...seen]);

  T("无页面错误", errors.length === 0, errors.slice(0, 3));

  console.log(`\n通过 ${pass} / ${total}`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})().catch(e => { console.error("FATAL", e); process.exit(1); });
