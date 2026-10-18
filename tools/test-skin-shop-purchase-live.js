// 皮肤商店实机兑换：验证「杀戮魔女」在大厅皮肤商店中真的可点、真的扣 10 精华宝珠并入库
//   覆盖：按钮文案为 10 精华宝珠、宝珠不足时按钮禁用、真实点击兑换并确认弹窗、
//   兑换后 ownedSkins 入库且立即装备、重复进入显示为已装备、页面无 JS 错误。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startFreshGame, dismissOpeningStory } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

function check(name, cond, extra) {
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return cond ? 1 : 0;
}

// 让娜娜莉解锁，并把精华宝珠设为指定数量，然后打开皮肤商店
const openSkins = essence => `(() => {
  const s = window.state;
  const c = s.chars.find(x => x.id === "nanali");
  if (c) c.locked = false;
  s.resources.essence = ${essence};
  s.hallModal = "skins";
  s.skinFilterChar = "nanali";
  window.render();
  const btn = document.querySelector('[data-buy-skin="nanali_slaughter_witch"]');
  return {
    essence: s.resources.essence,
    nanaliLocked: c ? c.locked : null,
    btnText: btn ? btn.textContent.trim() : null,
    btnDisabled: btn ? btn.disabled : null,
    btnExists: !!btn,
  };
})()`;

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", e => errors.push(String(e)));
  await openGame(page);
  await startFreshGame(page);
  await dismissOpeningStory(page);

  let pass = 0, total = 0;
  const T = (n, c, x) => { total++; pass += check(n, c, x); };

  // ① 宝珠不足（3 颗）：按钮应存在但禁用
  const poor = await page.evaluate(openSkins(3));
  T("皮肤商店存在杀戮魔女兑换按钮", poor.btnExists, poor);
  T("按钮文案为「兑换：10精华宝珠」", poor.btnText === "兑换：10精华宝珠", poor);
  T("宝珠不足时按钮禁用", poor.btnDisabled === true, poor);

  // ② 宝珠刚好 10 颗：按钮可用
  const rich = await page.evaluate(openSkins(10));
  T("宝珠 10 颗时按钮可点", rich.btnDisabled === false, rich);

  // ③ 真实点击兑换 → 确认弹窗
  await page.click('[data-buy-skin="nanali_slaughter_witch"]');
  const confirmText = await page.evaluate(`(() => {
    const box = document.querySelector('.game-confirm-overlay .game-confirm-card');
    return box ? box.textContent.replace(/\\s+/g, " ").slice(0, 160) : null;
  })()`);
  T("点击后弹出兑换确认框", !!confirmText, { confirmText });
  T("确认框写明消耗 10 精华宝珠",
    !!confirmText && confirmText.includes("10") && confirmText.includes("精华宝珠"),
    { confirmText });

  const confirmed = await page.evaluate(`(() => {
    const btn = document.querySelector('.game-confirm-overlay [data-confirm-ok]');
    if (!btn) return false;
    btn.click();
    return true;
  })()`);
  T("确认框内有「兑换」按钮并已点击", confirmed === true);

  await page.waitForFunction(`(() => {
    return window.state?.ownedSkins?.nanali_slaughter_witch === true;
  })()`, null, { timeout: 10000 }).catch(() => {});

  const after = await page.evaluate(`(() => {
    const s = window.state;
    return {
      owned: !!s.ownedSkins?.nanali_slaughter_witch,
      equipped: s.equippedSkins?.nanali,
      essence: s.resources.essence,
      equipBtn: (() => {
        const b = document.querySelector('[data-equip-skin="nanali_slaughter_witch"]');
        return b ? { text: b.textContent.trim(), disabled: b.disabled } : null;
      })(),
    };
  })()`);
  console.log("兑换后:", JSON.stringify(after));
  T("兑换成功后进入已拥有", after.owned === true, after);
  T("兑换后自动装备到娜娜莉", after.equipped === "nanali_slaughter_witch", after);
  T("兑换后宝珠扣除 10（10 → 0）", after.essence === 0, after);

  // ④ 重新打开商店：应显示已装备
  const reenter = await page.evaluate(`(() => {
    const s = window.state;
    s.hallModal = "skins"; s.skinFilterChar = "nanali";
    window.render();
    const b = document.querySelector('[data-equip-skin="nanali_slaughter_witch"]');
    return { text: b ? b.textContent.trim() : null, disabled: b ? b.disabled : null };
  })()`);
  T("重开商店显示为「已装备」且不可重复装备",
    reenter.text === "已装备" && reenter.disabled === true, reenter);

  T("页面无 JS 错误", errors.length === 0, errors.slice(0, 3));

  await browser.close();
  console.log(`\n通过 ${pass}/${total}`);
  process.exit(pass === total ? 0 : 1);
})();
