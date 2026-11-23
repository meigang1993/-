// 256 版：全部副本 × 五档难度卡片显示 浏览器实机核对 + 截图。
// 运行时构造「全部副本、全部难度已解锁」的存档形态（只为看清显示，不改变任何产品源码），
// 真实 DOM 读取每张卡片文本，验证精英出现率已删除、卡牌/饰品百分比不再误显示 2000%。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || "/data/workspace/.pw-browsers";
const { chromium } = require("playwright");
const path = require("path");
const { dismissOpeningStory } = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const ROOT = path.resolve(__dirname, "..");
const results = [];
const check = (group, name, ok, detail = "") => {
  results.push({ group, name, ok: !!ok, detail });
  console.log(`${ok ? "✅" : "❌"} [${group}] ${name}${detail ? " · " + detail : ""}`);
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 2000 } });
  const errors = [];
  page.on("pageerror", e => errors.push("pageerror: " + String(e)));
  page.on("console", m => { if (m.type() === "error" && !/favicon/.test(m.text())) errors.push("console: " + m.text()); });

  await page.goto("file://" + path.join(ROOT, "publish", "index.html"));
  await page.locator("#view").waitFor({ state: "visible" });
  await page.waitForTimeout(2200);
  await page.locator("[data-start-game]").click();
  await dismissOpeningStory(page);
  await page.locator(".villa-hall").waitFor({ state: "visible" });
  await page.evaluate(() => Promise.all([window.GameBundles.load("hall"), window.GameBundles.load("dungeon")]));
  await page.waitForTimeout(400);

  // 构造「已玩到全解锁」：每个副本的 requiresFlag 置真、五档难度全部开放、4 人队伍。
  const setup = await page.evaluate(() => {
    const st = window.state;
    st.flags = st.flags || {};
    (window.GameData.missions || []).filter(m => m.kind === "dungeon" && m.requiresFlag)
      .forEach(m => { st.flags[m.requiresFlag] = true; });
    ["hoshinoFamilyUnlockSeen", "gerdaNurseryUnlocked", "hitwellUnlockSeen", "preshiUnlockSeen",
      "mieryulaUnlockSeen", "opheliaUnlockSeen", "bestaNurseryUnlocked", "ailengUnlockSeen",
      "ruinsSandCityUnlocked", "orcDungeonUnlocked", "tenriInstituteUnlocked",
    ].forEach(k => { st.flags[k] = true; });
    const diffs = ["normal", "adventure", "warrior", "king", "hell"];
    st.dungeonUnlocks = {};
    (window.GameData.missions || []).filter(m => m.kind === "dungeon").forEach(m => {
      st.dungeonUnlocks[m.id] = diffs.slice();
    });
    st.chars = st.chars || [];
    st.party = st.chars.filter(c => !c.locked).slice(0, 4).map(c => c.id);
    if (!st.party.length && st.chars.length) { st.chars[0].locked = false; st.party = [st.chars[0].id]; }
    if (st.flags?.onboarding) { st.flags.onboarding.skipped = true; st.flags.onboarding.completed = true; }
    st.view = "hall"; st.hallModal = "team"; st.explore = null; st.battle = null;
    st.sortieStarting = false;
    if (window.render) window.render();
    return { missions: (window.GameData.missions || []).filter(m => m.kind === "dungeon").map(m => m.id) };
  });
  await page.waitForTimeout(600);
  check("A", "全部 5 个副本（含未开发占位）", setup.missions.length === 5, setup.missions.join(","));

  const modal = page.locator(".villa-modal");
  await modal.waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
  const data = await page.evaluate(() => {
    const blocks = [...document.querySelectorAll(".team-dungeon")].map(sec => ({
      title: sec.querySelector("h3")?.textContent || "",
      cards: [...sec.querySelectorAll(".difficulty-card")].map(c => ({
        text: (c.textContent || "").replace(/\s+/g, " ").trim(),
        button: (c.querySelector("button")?.textContent || "").trim(),
        disabled: !!c.querySelector("button")?.disabled,
        cls: c.className,
      })),
    }));
    return { blocks, version: document.querySelector(".version-badge")?.textContent || "" };
  });
  check("A", "页面上渲染 5 个副本区块", data.blocks.length === 5, `blocks=${data.blocks.length}`);
  const allCards = data.blocks.flatMap(b => b.cards);
  check("A", "每个副本 5 张难度卡片（共 25）", data.blocks.every(b => b.cards.length === 5)
    && allCards.length === 25, `cards=${allCards.length}`);

  // B 删除精英出现率显示
  check("B", "全部卡片文本 0 处「精英出现率」", allCards.every(c => !c.text.includes("精英出现率")),
    `hits=${allCards.filter(c => c.text.includes("精英出现率")).length}`);
  check("B", "全部卡片文本 0 处 2000% 误显示", allCards.every(c => !c.text.includes("2000%")));
  check("B", "每张卡片仍显示怪物属性 / 莉莉丝元 / 卡牌饰品",
    allCards.every(c => c.text.includes("怪物属性") && c.text.includes("莉莉丝元 ×") && c.text.includes("卡牌/饰品")));
  const drops = ["20%", "40%", "50%", "60%", "70%"];
  check("B", "五档卡牌/饰品按整数百分比显示 20/40/50/60/70%",
    data.blocks.every(b => b.cards.every((c, i) => c.text.includes(`卡牌/饰品 ${drops[i]}`))),
    JSON.stringify(data.blocks[0]?.cards.map(c => (c.text.match(/卡牌\/饰品 \d+%/) || [])[0])));

  // C 五档难度名称与倍率文案
  const names = ["普通级", "冒险级", "勇士级", "王者级", "英雄级"];
  check("C", "每副本五档名称齐全", data.blocks.every(b => names.every((n, i) => b.cards[i].text.includes(n))));
  check("C", "四档属性百分比文案齐全", data.blocks.every(b =>
    ["生命150%/输出150%/速度150%", "生命200%/输出200%/速度200%",
      "生命250%/输出250%/速度250%", "生命300%/输出300%/速度300%"].every((t, i) => b.cards[i + 1].text.includes(t))));
  check("C", "莉莉丝元倍率 100/135/175/220/275 齐全", data.blocks.every(b =>
    [100, 135, 175, 220, 275].every((v, i) => b.cards[i].text.includes(`莉莉丝元 ×${v}`))));

  // D 未开发副本仍占位
  const tenri = data.blocks.find(b => b.title.includes("天日国鹰7研究所"));
  check("D", "研究所区块存在且 5 张卡片全部置灰「未开发完成」",
    !!tenri && tenri.cards.length === 5 && tenri.cards.every(c => c.disabled && c.button.includes("未开发完成")),
    tenri ? JSON.stringify(tenri.cards.map(c => c.button)) : "无区块");
  const open = data.blocks.filter(b => !b.title.includes("天日国鹰7研究所"));
  check("D", "其余 4 个副本所有难度按钮均可点",
    open.length === 4 && open.every(b => b.cards.every(c => !c.disabled)),
    JSON.stringify(open.map(b => b.cards.filter(c => c.disabled).length)));

  // E 截图
  await page.screenshot({ path: "/data/workspace/难度显示-全部副本-256.png", fullPage: true });
  await page.locator(".team-dungeon").first().screenshot({ path: "/data/workspace/难度显示-单副本五档特写-256.png" });
  if (tenri) await page.locator(".team-dungeon").last().screenshot({ path: "/data/workspace/难度显示-研究所占位-256.png" });
  // 逐块截图：modal 内部滚动，整页截图只能看到前 4 个副本；拼接后才是完整 5 个副本。
  const fs = require("fs");
  for (let i = 0; i < data.blocks.length; i++) {
    await page.locator(".team-dungeon").nth(i).screenshot({ path: `/data/workspace/_er_block_${i}.png` });
  }
  check("E", "5 个副本区块各自截图已产出",
    data.blocks.every((_, i) => fs.existsSync(`/data/workspace/_er_block_${i}.png`)),
    `blocks=${data.blocks.length}`);
  check("F", "页面无 JS 错误", errors.length === 0, errors.slice(0, 3).join(" | ") || "无");

  await browser.close();
  const bad = results.filter(r => !r.ok);
  console.log(`\nTOTAL ${results.length - bad.length}/${results.length}`);
  if (bad.length) bad.forEach(r => console.log(`  ❌ [${r.group}] ${r.name} ${r.detail}`));
  process.exit(bad.length || errors.length ? 1 : 0);
})().catch(e => { console.error("LIVE_THREW", e && e.stack ? e.stack : e); process.exit(2); });
