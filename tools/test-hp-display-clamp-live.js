// 专项：单位卡血量数字不得爆成异常大数（999999 一类）
//
// 背景：玩家反馈「血量数字变成 999999 多，实际血量没有问题」。
//
// 结构性缺陷：combatBar 里血条高度 hpPct 有 clamp，但 <b> 里的数字与 title
// 没有任何约束——两者不对称。只要 visualHp 被任何路径写成异常值（最典型是
// 字符串拼接：holdFloatVisual 里 `hp + value`，任一是字符串就会拼成 "62"+"5"
// = "625"，多段攻击下越拼越长），就会出现"血条正常、数字爆表"的错位，
// 而 unit.hp 始终是对的。
//
// 本测试直接把 visualHp 污染成各类异常值，验证显示被收敛到合法区间，
// 且真实 hp 不受影响；同时验证护甲不因这次改动被误压上限。
//
// 反向验证：撤掉 clamp 后数字会原样渲染出 999999。
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

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errs = [];
  page.on("pageerror", e => errs.push(String(e)));
  await startRegressionBattle(page);

  const out = await page.evaluate(`(async () => {
    const st = window.state, b = st.battle;
    const ally = b.allies[0];
    const bar = () => {
      const el = document.querySelector('[data-target="' + ally.uid + '"] .combat-bar');
      if (!el) return null;
      return { b: el.querySelector("b") ? el.querySelector("b").textContent.trim() : null,
               em: el.querySelector("em") ? el.querySelector("em").textContent.trim() : null,
               title: el.getAttribute("title") };
    };
    ally.maxHp = 100; ally.hp = 50; ally.block = 0;
    const cases = [];
    const probe = (name, setup) => {
      delete ally.visualHp; delete ally.visualBlock; delete ally.visualDefense;
      setup();
      window.render && window.render();
      cases.push({ name, ...bar(), realHp: ally.hp, max: ally.maxHp });
    };
    probe("正常：无 visualHp，回落真实 hp", () => {});
    probe("正常：visualHp = 30（低于 maxHp）", () => { ally.visualHp = 30; });
    probe("污染：visualHp = 999999（数字）", () => { ally.visualHp = 999999; });
    probe("污染：visualHp = '999999'（字符串）", () => { ally.visualHp = "999999"; });
    probe("污染：拼接形态 '50'+'9999'", () => { ally.visualHp = "50" + "9999"; });
    probe("污染：visualHp = NaN", () => { ally.visualHp = NaN; });
    probe("护甲：block = 6（低于 maxHp，不得被改）", () => { ally.block = 6; ally.visualBlock = 6; });
    probe("护甲：block = 150（可合法高于 maxHp，不得压到 100）", () => { ally.block = 150; ally.visualBlock = 150; });
    return cases;
  })()`);

  for (const c of out) {
    console.log(`   · ${c.name} → b=${c.b} title="${c.title}" realHp=${c.realHp}`);
  }
  const get = n => out.find(c => c.name === n);
  const normal = get("正常：无 visualHp，回落真实 hp");
  const low = get("正常：visualHp = 30（低于 maxHp）");
  const bigNum = get("污染：visualHp = 999999（数字）");
  const bigStr = get("污染：visualHp = '999999'（字符串）");
  const concat = get("污染：拼接形态 '50'+'9999'");
  const nan = get("污染：visualHp = NaN");
  const armorLow = get("护甲：block = 6（低于 maxHp，不得被改）");
  const armorHigh = get("护甲：block = 150（可合法高于 maxHp，不得压到 100）");

  check("正常值不被误伤：无 visualHp 时显示真实 hp 50", normal.b === "50", `b=${normal.b}`);
  check("正常值不被误伤：visualHp=30 仍显示 30", low.b === "30", `b=${low.b}`);
  check("数字型大数被收敛到 maxHp", bigNum.b === "100", `b=${bigNum.b}`);
  check("字符串型大数被收敛到 maxHp", bigStr.b === "100", `b=${bigStr.b}`);
  check("拼接形态被收敛到 maxHp", concat.b === "100", `b=${concat.b}`);
  check("NaN 被收敛（不显示 NaN）", nan.b !== "NaN", `b=${nan.b}`);
  check("title 不出现 999999", !/999999/.test(bigNum.title || ""), `title=${bigNum.title}`);
  check("真实 hp 全程未被改动", out.every(c => c.realHp === 50), `hp=${[...new Set(out.map(c => c.realHp))]}`);
  check("护甲 6 不被改动", armorLow.em === "6", `em=${armorLow.em}`);
  check("护甲 150 不被误压到 100", armorHigh.em === "150", `em=${armorHigh.em}`);
  check("无页面错误", errs.length === 0, errs.slice(0, 2).join(" | "));

  console.log(`\n通过 ${pass}/${pass + fail}`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
