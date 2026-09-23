// 三个副本（废墟沙城 / 兽人地下城 / 水下列车）实战试玩 + 节点校验
// 使用真实浏览器 + 真实发布 bundle，不做模拟
// 浏览器装在 /data/workspace/.pw-browsers，不指定会去 /root/.cache 找不到可执行文件
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || "/data/workspace/.pw-browsers";
const { chromium } = require("playwright");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DUNGEONS = [
  { id: "ruins_sand_city", name: "废墟沙城", flag: "ruinsSandCityUnlocked", layers: 15, route: "fixed-random", rest: [4, 9], chest: [7], boss: [15] },
  { id: "orc_dungeon", name: "兽人地下城", flag: "orcDungeonUnlocked", layers: 13, route: "fixed-random", rest: [9], chest: [7], boss: [13] },
  { id: "underwater_train", name: "水下列车", flag: "underwaterTrainUnlocked", layers: 15, route: "linear", rest: [10], chest: [8], boss: [15] },
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  page.on("console", m => { if (m.type() === "error" && !/favicon/.test(m.text())) errors.push(m.text()); });

  await page.goto("file://" + path.resolve(ROOT, "publish/index.html"));
  await page.locator("#view").waitFor({ state: "visible" });
  await page.waitForTimeout(2500);

  await page.waitForTimeout(300);
  await page.locator("[data-start-game]").click();
  await page.locator(".villa-hall").waitFor({ state: "visible" });
  await page.evaluate(() => Promise.all([window.GameBundles.load("battle"), window.GameBundles.load("dungeon")]));
  await page.waitForTimeout(500);

  // 解锁三个副本：必须在进入别墅后设置（点"开始游戏"会从存档重载 state，之前的设置会被覆盖）
  // 需同时满足：解锁标志 + 难度已解锁 + 已选队伍
  const unlockInfo = await page.evaluate(() => {
    const st = window.state;
    st.flags = st.flags || {};
    ["ruinsSandCityUnlocked", "orcDungeonUnlocked", "underwaterTrainUnlocked"].forEach(f => { st.flags[f] = true; });
    if (!st.unlockedDifficulties?.includes("normal")) st.unlockedDifficulties = ["normal", ...(st.unlockedDifficulties || [])];
    const unlocked = (st.chars || []).filter(c => !c.locked);
    st.party = unlocked.slice(0, 4).map(c => c.id);
    st.sortieStarting = false;
    if (window.render) window.render();
    return { flags: st.flags.ruinsSandCityUnlocked, party: st.party.length, diff: st.unlockedDifficulties };
  });
  console.log("解锁设置:", JSON.stringify(unlockInfo));
  await page.waitForTimeout(400);

  const bundleOK = await page.evaluate(() => ({ map: typeof window.DungeonMap, grp: typeof window.DungeonEnemyGroups, missions: (window.GameData?.missions || []).length }));
  console.log("=== bundle ===");
  console.log(JSON.stringify(bundleOK));

  const results = [];
  for (const d of DUNGEONS) {
    console.log(`\n========== ${d.name} (${d.id}) ==========`);
    // 打开队伍面板并启动该副本（若弹窗已开则复用，避免点击被拦截）
    const modalOpen = await page.locator(".villa-modal").isVisible().catch(() => false);
    if (!modalOpen) {
      await page.locator("[data-open-modal='team']").first().click();
    }
    await page.locator(".villa-modal").waitFor({ state: "visible" });
    await page.waitForTimeout(300);
    const btn = page.locator(`[data-start="${d.id}"][data-difficulty="normal"]`);
    const cnt = await btn.count();
    if (!cnt) { console.log("❌ 未找到入口按钮"); results.push({ id: d.id, err: "no button" }); continue; }
    const disabled = await btn.first().isDisabled();
    if (disabled) { console.log("❌ 入口按钮被禁用（未解锁）"); results.push({ id: d.id, err: "disabled" }); continue; }
    await btn.first().click();
    await page.locator(".dungeon-screen").waitFor({ state: "visible" });
    await page.waitForTimeout(600);

    const info = await page.evaluate(() => {
      const w = window;
      const run = w.state?.explore;
      if (!run) return { err: "no run" };
      const layers = run.layers || [];
      const all = layers.flat();
      const typeCount = {};
      all.forEach(n => { typeCount[n.type] = (typeCount[n.type] || 0) + 1; });
      // 逐层类型
      const layerDesc = layers.map(l => l.map(n => n.type).join(",")).join(" | ");
      const shape = layers.map(l => l.length).join("-");
      // 连通性：从第1层起点能走到最后一层的 BOSS
      const byId = new Map(all.map(n => [n.id, n]));
      let reach = new Set([all[0].id]);
      for (const layer of layers) {
        const next = new Set();
        layer.forEach(n => { if (reach.has(n.id)) (n.next || []).forEach(id => next.add(id)); });
        next.forEach(id => reach.add(id));
      }
      const bossNodes = all.filter(n => n.type === "boss");
      const bossReachable = bossNodes.every(b => reach.has(b.id));
      // 孤儿节点（没有任何入边，且非起点）
      const hasIncoming = new Set();
      all.forEach(n => (n.next || []).forEach(id => hasIncoming.add(id)));
      const orphans = all.filter(n => n.id !== all[0].id && !hasIncoming.has(n.id)).map(n => n.id);
      // 悬空 next（指向不存在的节点）
      const dangling = [];
      all.forEach(n => (n.next || []).forEach(id => { if (!byId.has(id)) dangling.push(n.id + "->" + id); }));
      // 固定层校验
      const fixedCheck = {};
      const expectFixed = {};
      (window.__expectRest || []).forEach(l => expectFixed[l] = "rest");
      (window.__expectChest || []).forEach(l => expectFixed[l] = "chest");
      (window.__expectBoss || []).forEach(l => expectFixed[l] = "boss");
      Object.entries(expectFixed).forEach(([l, t]) => {
        const layer = layers[Number(l) - 1];
        fixedCheck[`L${l}`] = layer ? layer.every(n => n.type === t) : "missing";
      });
      return {
        layerCount: layers.length, shape, typeCount, layerDesc,
        bossReachable, orphans, dangling, fixedCheck,
        total: all.length,
      };
    }, );

    if (info.err) { console.log("❌", info.err); results.push({ id: d.id, err: info.err }); continue; }
    console.log(`层数: ${info.layerCount}  节点总数: ${info.total}`);
    console.log(`布局: ${info.shape}`);
    console.log(`类型统计: ${JSON.stringify(info.typeCount)}`);
    console.log(`BOSS 可达: ${info.bossReachable}   孤儿节点: ${info.orphans.length ? info.orphans.join(",") : "无"}   悬空连接: ${info.dangling.length ? info.dangling.join(",") : "无"}`);
    results.push({ id: d.id, ...info, errors: errors.length });

    // 截图
    await page.screenshot({ path: path.resolve(ROOT, `shot-dungeon-${d.id}.png`) });
    // 撤退回大厅，准备下一个
    await page.locator("[data-dungeon-retreat]").click();
    await page.waitForTimeout(600);
    const confirm = page.locator(".confirm-ok, [data-confirm-ok]").first();
    if (await confirm.count()) { await confirm.click().catch(() => {}); }
    await page.locator(".villa-hall").waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      const st = window.state;
      st.view = "hall"; st.hallModal = null; st.explore = null; st.battle = null;
      if (window.render) window.render();
    });
    await page.waitForTimeout(400);
  }

  console.log("\n========== 汇总 ==========");
  let fail = 0;
  for (const r of results) {
    const d = DUNGEONS.find(x => x.id === r.id);
    if (r.err) { console.log(`❌ ${d.name}: ${r.err}`); fail++; continue; }
    const okLayer = r.layerCount === d.layers;
    const okBoss = r.bossReachable;
    const okOrphan = r.orphans.length === 0;
    const okDangle = r.dangling.length === 0;
    const ok = okLayer && okBoss && okOrphan && okDangle;
    if (!ok) fail++;
    console.log(`${ok ? "✅" : "❌"} ${d.name}: 层数${r.layerCount}/${d.layers} BOSS可达=${okBoss} 孤儿=${r.orphans.length} 悬空=${r.dangling.length} 类型=${JSON.stringify(r.typeCount)}`);
  }
  console.log(`页面错误: ${errors.length ? errors.slice(0, 5).join(" | ") : "无"}`);
  await browser.close();
  console.log(fail ? `\n❌ ${fail} 个副本异常` : "\n✅ 三副本节点全部正常");
  process.exit(fail ? 1 : 0);
})();
