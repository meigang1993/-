// 10 级特殊立绘实机验证：娜娜莉 / 普雷希
//   覆盖：未满 10 级时显示「Lv.10 解锁」且不可装备；满 10 级自动入库；
//   立绘在真实页面中加载成功（非破图、非兜底）；装备后正式生效。
//   这两张图来自远端上传，必须确认真的渲染出来，而不只是数据登记正确。
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

const CASES = [
  {
    charId: "nanali",
    name: "娜娜莉",
    skinId: "nanali_level_10_special",
    art: "./assets/generated/nanali-level-10-special.e0976401.webp",
  },
  {
    charId: "preshi",
    name: "普雷希",
    skinId: "preshi_level_10_special",
    art: "./assets/generated/preshi-level-10-special.20133612.webp",
  },
];

// 设定角色等级并打开该角色的皮肤商店
const openAtLevel = (charId, level) => `(() => {
  const s = window.state;
  const c = s.chars.find(x => x.id === ${JSON.stringify(charId)});
  if (!c) return { missing: true };
  c.locked = false;
  c.level = ${level};
  s.hallModal = "skins";
  s.skinFilterChar = ${JSON.stringify(charId)};
  window.render();
  return { level: c.level };
})()`;

// 按立绘路径定位卡片（data-art-src 存的是图片路径，不是皮肤 id）
const readCard = art => `(() => {
  const all = [...document.querySelectorAll('.skin-card')];
  const mine = all.find(el => {
    const p = el.querySelector('.skin-preview');
    return p && p.dataset.artSrc === ${JSON.stringify(art)};
  });
  if (!mine) return { found: false, count: all.length,
    srcs: all.map(el => { const p = el.querySelector('.skin-preview'); return p ? p.dataset.artSrc : null; }) };
  const img = mine.querySelector("img");
  const btn = mine.querySelector("button");
  return {
    found: true,
    artSrc: mine.querySelector(".skin-preview").dataset.artSrc,
    imgSrc: img ? img.getAttribute("src") : null,
    imgW: img ? img.naturalWidth : 0,
    imgComplete: img ? img.complete : null,
    imgLockedClass: img ? img.className : null,
    btnText: btn ? btn.textContent.trim() : null,
    btnDisabled: btn ? btn.disabled : null,
    cardEquipped: mine.className.includes("equipped"),
    cardOwned: mine.className.includes("owned"),
  };
})()`;

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_BIN || undefined,
    args: ["--disable-dev-shm-usage"],
  });
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", e => errors.push(String(e)));
  await openGame(page);
  await startFreshGame(page);
  await dismissOpeningStory(page);

  let pass = 0, total = 0;
  const T = (n, c, x) => { total++; pass += check(n, c, x); };

  for (const c of CASES) {
    // ① 9 级：尚未解锁，按钮为 Lv.10 解锁且禁用
    await page.evaluate(openAtLevel(c.charId, 9));
    const locked = await page.evaluate(readCard(c.art));
    T(`${c.name}：9 级时卡片存在`, locked.found, locked);
    T(`${c.name}：9 级时按钮为 Lv.10 解锁`, locked.btnText === "Lv.10 解锁", locked);
    T(`${c.name}：9 级时不可装备`, locked.btnDisabled === true, locked);

    // ② 10 级：自动解锁，立绘真实加载
    await page.evaluate(openAtLevel(c.charId, 10));
    // 卡片图片是 loading="lazy"，需滚动进可视区并等待真实解码完成
    await page.evaluate(`(() => {
      const all = [...document.querySelectorAll('.skin-card')];
      const mine = all.find(el => {
        const p = el.querySelector('.skin-preview');
        return p && p.dataset.artSrc === ${JSON.stringify(c.art)};
      });
      if (mine) mine.scrollIntoView({ block: "center" });
      return true;
    })()`);
    await page.waitForFunction(`(() => {
      const all = [...document.querySelectorAll('.skin-card')];
      const mine = all.find(el => {
        const p = el.querySelector('.skin-preview');
        return p && p.dataset.artSrc === ${JSON.stringify(c.art)};
      });
      const img = mine && mine.querySelector("img");
      return !!img && img.complete && img.naturalWidth > 0;
    })()`, null, { timeout: 15000 }).catch(() => {});
    const unlocked = await page.evaluate(readCard(c.art));
    T(`${c.name}：10 级自动解锁（卡片标记已拥有）`, unlocked.cardOwned === true, unlocked);
    T(`${c.name}：10 级按钮变为可装备`, unlocked.btnText === "装备", unlocked);
    T(`${c.name}：立绘路径为新图`, unlocked.artSrc === c.art, unlocked);
    T(`${c.name}：立绘真实加载（非破图）`,
      unlocked.imgW > 0 && unlocked.imgComplete === true, unlocked);

    // ③ 真实点击装备
    await page.evaluate(`(() => {
      const all = [...document.querySelectorAll('.skin-card')];
      const mine = all.find(el => {
        const p = el.querySelector('.skin-preview');
        return p && p.dataset.artSrc && p.dataset.artSrc === ${JSON.stringify(c.art)};
      });
      mine.querySelector("button").click();
      return true;
    })()`);
    await page.waitForTimeout(300);
    const equipped = await page.evaluate(`(() => {
      const s = window.state;
      return {
        equipped: s.equippedSkins[${JSON.stringify(c.charId)}],
        owned: !!s.ownedSkins[${JSON.stringify(c.skinId)}],
        appliedArt: window.SkinSystem.applyToChar(s,
          s.chars.find(x => x.id === ${JSON.stringify(c.charId)})).art,
      };
    })()`);
    T(`${c.name}：点击后写入 equippedSkins`,
      equipped.equipped === c.skinId, equipped);
    T(`${c.name}：正式立绘已切换为新图`,
      equipped.appliedArt === c.art, equipped);
  }

  T("页面无 JS 错误", errors.length === 0, { errors });

  await browser.close();
  console.log(`\n通过 ${pass}/${total}`);
  process.exit(pass === total ? 0 : 1);
})().catch(e => { console.error("FATAL", e); process.exit(1); });
