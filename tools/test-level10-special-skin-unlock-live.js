// 4 张 10 级特殊立绘解锁实机验证：凯瑟琳 / 奥菲莉亚 / 贝丝妲 / 鲁卡
//   覆盖：Lv.9 时不解锁（负向对照）、Lv.10 时自动入库、收藏页按钮由「Lv.10 解锁」变「装备」、
//   真实鼠标点击装备生效、立绘图片真实加载（naturalWidth）、applyToChar 换图、
//   角色未解锁时即便满级也不入库、全程无 JS 错误。
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
  { id: "catherine", name: "凯瑟琳", skin: "catherine_level_10_special" },
  { id: "ophelia", name: "奥菲莉亚", skin: "ophelia_level_10_special" },
  { id: "besta", name: "贝丝妲", skin: "besta_level_10_special" },
  { id: "luka", name: "鲁卡", skin: "luka_level_10_special" },
  { id: "artina", name: "亚缇娜", skin: "artina_level_10_special" },
  { id: "miller", name: "米勒", skin: "miller_level_10_special" },
];

// 设定角色状态（是否解锁 / 等级）并打开皮肤页，返回皮肤卡片的按钮与图片信息
const setup = (id, skinId, locked, level) => `(() => {
  const s = window.state;
  const c = s.chars.find(x => x.id === ${JSON.stringify(id)});
  if (!c) return { missing: true };
  c.locked = ${locked};
  c.level = ${level};
  window.SkinSystem?.ensure?.(s);
  s.hallModal = "skins";
  s.skinFilterChar = ${JSON.stringify(id)};
  window.render();
  const card = document.querySelector('.skin-preview[data-art-src*="${id}-level-10-special"]')
    ?.parentElement;
  const btn = card ? card.querySelector('button') : null;
  const img = card ? card.querySelector('img') : null;
  return {
    level: c.level,
    locked: c.locked,
    owned: !!s.ownedSkins?.[${JSON.stringify(skinId)}],
    equipped: s.equippedSkins?.[${JSON.stringify(id)}] || null,
    btnExists: !!btn,
    btnText: btn ? btn.textContent.trim() : null,
    btnDisabled: btn ? !!btn.disabled : null,
    imgSrc: img ? img.getAttribute("src") : null,
  };
})()`;

// 等图片真正解码完成（file:// 下首次加载可能较慢）
const waitImg = (id, skinId) => `(() => new Promise(resolve => {
  const find = () => document.querySelector('.skin-preview[data-art-src*="${id}-level-10-special"] img');
  const start = Date.now();
  const tick = () => {
    const img = find();
    if (!img) return resolve({ found: false });
    if (img.complete && img.naturalWidth > 0) {
      return resolve({ found: true, w: img.naturalWidth, h: img.naturalHeight, src: img.getAttribute("src") });
    }
    if (Date.now() - start > 4000) {
      return resolve({ found: true, w: img.naturalWidth, h: img.naturalHeight, src: img.getAttribute("src") });
    }
    requestAnimationFrame(tick);
  };
  tick();
}))()`;

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

  for (const c of CASES) {
    console.log(`\n— ${c.name}（${c.id}）—`);

    // ① Lv.9 且角色已解锁：不应入库
    const low = await page.evaluate(setup(c.id, c.skin, false, 9));
    T(`${c.name} Lv.9 时未入库`, low.owned === false, low);
    T(`${c.name} Lv.9 时按钮不可用`, low.btnExists && low.btnDisabled === true, low);
    T(`${c.name} Lv.9 时按钮提示 Lv.10`,
      !!low.btnText && low.btnText.includes("10"), low);

    // ② Lv.10：应自动入库，按钮变可点
    const high = await page.evaluate(setup(c.id, c.skin, false, 10));
    T(`${c.name} Lv.10 时自动入库`, high.owned === true, high);
    T(`${c.name} Lv.10 时按钮变为「装备」`, high.btnText === "装备", high);
    T(`${c.name} Lv.10 时按钮可点`, high.btnDisabled === false, high);

    // ③ 图片真实加载
    const img = await page.evaluate(waitImg(c.id, c.skin));
    T(`${c.name} 特殊立绘成功解码`, img.found && img.w > 0 && img.h > 0, img);

    // ④ 真实鼠标点击装备
    await page.click(`[data-equip-skin="${c.skin}"]`);
    const after = await page.evaluate(`(() => {
      const s = window.state;
      const ch = s.chars.find(x => x.id === ${JSON.stringify(c.id)});
      const applied = window.SkinSystem.applyToChar(s, ch);
      const skin = window.SkinSystem.byId(${JSON.stringify(c.skin)});
      return {
        equipped: s.equippedSkins?.[${JSON.stringify(c.id)}] || null,
        art: applied?.art || null,
        skinArt: skin?.art || null,
        skinName: applied?.skinName || null,
      };
    })()`);
    T(`${c.name} 点击后已装备`, after.equipped === c.skin, after);
    T(`${c.name} 立绘已换成特殊图`, after.art === after.skinArt && !!after.art, after);

    // ⑤ 角色未解锁时即便 Lv.10 也不入库
    const lockedCase = await page.evaluate(setup(c.id, c.skin, true, 10));
    T(`${c.name} 角色未解锁时不入库`, lockedCase.owned === false, lockedCase);
  }

  // ⑥ 全程无 JS 错误
  T("全程无 JS 错误", errors.length === 0, { errors: errors.slice(0, 4) });

  await browser.close();
  console.log(`\n通过 ${pass}/${total}`);
  process.exit(pass === total ? 0 : 1);
})();
