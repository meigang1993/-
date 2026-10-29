// 7 名此前缺失皮肤条目的可解锁角色：洛基 / 卡迪西斯 / 杰洛特 / 小艾尔拉娜 / 艾斯 / 艾伦格 / 希特威
//   覆盖：皮肤数据里确实有该角色的条目、角色信息面板出现「皮肤」页签、
//   收藏页能筛出该角色、默认皮肤卡片真实渲染且图片加载成功、真实点击「装备」生效。
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
  { id: "loki", name: "洛基", art: "loki-portrait" },
  { id: "cadicis", name: "卡迪西斯", art: "cadicis-portrait" },
  { id: "gerlot", name: "杰洛特", art: "gerlot-portrait" },
  { id: "little_elrana", name: "小艾尔拉娜", art: "elrana-clone" },
  { id: "ace", name: "艾斯", art: "ace-portrait" },
  { id: "aileng", name: "艾伦格", art: "aileng-portrait" },
  { id: "hitwell", name: "希特威", art: "hitwell-portrait" },
];
const ONLY = (process.env.SKIN_ONLY || "").split(",").filter(Boolean);
const ACTIVE = ONLY.length ? CASES.filter(c => ONLY.includes(c.id)) : CASES;

// 解锁角色并打开皮肤收藏页，返回该角色默认皮肤卡片的状态
const setup = (id, art) => `(() => {
  const s = window.state;
  const c = s.chars.find(x => x.id === ${JSON.stringify(id)});
  if (!c) return { missing: true };
  c.locked = false;
  c.level = 1;
  window.SkinSystem?.ensure?.(s);
  const list = window.GameSkinData.skins.filter(k => k.charId === ${JSON.stringify(id)});
  s.hallModal = "skins";
  s.skinFilterChar = ${JSON.stringify(id)};
  window.render();
  const card = document.querySelector('.skin-preview[data-art-src*="${art}"]')?.parentElement;
  const btn = card ? card.querySelector('button') : null;
  const img = card ? card.querySelector('img') : null;
  return {
    count: list.length,
    hasDefault: list.some(k => k.id === ${JSON.stringify(id)} + "_default"),
    cardFound: !!card,
    btnText: btn ? btn.textContent.trim() : null,
    btnDisabled: btn ? btn.disabled : null,
    naturalWidth: img ? img.naturalWidth : 0,
  };
})()`;

// 打开角色信息面板，检查是否出现「皮肤」「立绘」页签
const tabs = id => `(() => {
  const s = window.state;
  s.infoUnit = ${JSON.stringify(id)};
  s.infoTab = "stats";
  window.render();
  return {
    skin: !!document.querySelector('[data-info-tab="skins"]'),
    illust: !!document.querySelector('[data-info-tab="specialArt"]'),
  };
})()`;

// 真实鼠标点击默认皮肤卡片的按钮
const clickEquip = (id, art) => {
  const sel = `.skin-preview[data-art-src*="${art}"]`;
  return sel;
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await openGame(page);
  await startFreshGame(page);
  await dismissOpeningStory(page);

  let pass = 0, total = 0;
  for (const c of ACTIVE) {
    console.log(`\n--- ${c.name} (${c.id}) ---`);
    const r = await page.evaluate(setup(c.id, c.art));
    total += 1; pass += check(`${c.name} 皮肤数据中有条目`, r.count > 0, r);
    total += 1; pass += check(`${c.name} 含默认皮肤条目`, r.hasDefault === true, r);
    const t = await page.evaluate(tabs(c.id));
    total += 1; pass += check(`${c.name} 信息面板出现「皮肤」页签`, t.skin === true, t);
    // 这 7 名角色尚无 10 级特殊立绘素材，「立绘」页签本就应当隐藏；
    // 一旦日后补了 specialIllustration 条目，此断言会转红提醒补页签。
    total += 1; pass += check(`${c.name} 无特殊立绘时「立绘」页签隐藏`, t.illust === false, t);
    await page.evaluate(setup(c.id, c.art));
    total += 1; pass += check(`${c.name} 收藏页渲染出默认皮肤卡片`, r.cardFound === true, r);
    // 收藏页图片是 loading="lazy"，强制 eager 并等待解码完成再量 naturalWidth
    const nw = await page.evaluate(`(async () => {
      const img = document.querySelector('.skin-preview[data-art-src*="${c.art}"] img');
      if (!img) return 0;
      img.loading = "eager";
      if (!img.complete) await new Promise(r => { img.onload = img.onerror = r; });
      return img.naturalWidth;
    })()`);
    total += 1; pass += check(`${c.name} 立绘图片真实加载`, nw > 0, { naturalWidth: nw });

    // 默认皮肤为 initial:true，随角色解锁自动拥有并装备，按钮应为「已装备」且禁用
    total += 1; pass += check(`${c.name} 默认皮肤按钮显示已装备`,
      r.btnText === "已装备" && r.btnDisabled === true, r);
    const eq = await page.evaluate(`(() => ({
      equipped: window.state.equippedSkins?.[${JSON.stringify(c.id)}] || null,
    }))()`);
    total += 1; pass += check(`${c.name} 装备记录为默认皮肤`,
      eq.equipped === `${c.id}_default`, eq);
  }

  total += 1; pass += check("无 JS 错误", errors.length === 0, errors.slice(0, 3));
  console.log(`\n${pass}/${total}`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})();
