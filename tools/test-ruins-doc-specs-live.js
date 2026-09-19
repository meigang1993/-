// 实战：核对「废墟沙城」设定文档的四项数值/事件是否在真实浏览器里生效
// 1) 等级上限 20  2) 属性成长 +40%  3) 经验倍率 1/2/3/4  4) 首次通关兽人地下城勇士级 → 废墟沙城解锁事件
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame } = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const results = [];
const check = (name, cond, info) => {
  results.push({ name, ok: !!cond, info });
  console.log(`${cond ? "✅" : "❌"} ${name}${info !== undefined ? "  " + JSON.stringify(info) : ""}`);
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push(e.message));
  await openGame(page);
  await page.evaluate(() => Promise.all([
    window.GameBundles?.load?.("battle"),
    window.GameBundles?.load?.("dungeon"),
    window.GameBundles?.load?.("hall"),
  ]));

  // ---------- 1) 等级上限 20 ----------
  const lv = await page.evaluate(() => {
    const P = window.CharacterProgression;
    return { maxLevel: P?.maxLevel, expTable: P?.expToNext?.length };
  });
  check("等级上限 = 20", lv.maxLevel === 20, lv);
  check("经验表长度 = 20（每级一档）", lv.expTable === 20, { len: lv.expTable });

  // ---------- 2) 属性成长幅度 +40% ----------
  // 判据：每个角色每项属性的成长值都能被 1.4 整除回推成整齐旧值
  const growth = await page.evaluate(() => {
    const P = window.CharacterProgression;
    const g = P.growth;
    let total = 0, bad = [];
    Object.entries(g).forEach(([id, row]) => {
      Object.entries(row).forEach(([k, v]) => {
        total++;
        const old = v / 1.4;
        if (Math.abs(Math.round(old * 100) / 100 - old) > 1e-9) bad.push({ id, k, v, old });
      });
    });
    return { total, bad, roles: Object.keys(g).length };
  });
  check("成长幅度 = 旧值 × 1.4（+40%）", growth.bad.length === 0,
    { 角色数: growth.roles, 数值总数: growth.total, "非1.4倍项": growth.bad.length });

  // 实际取一个角色，看 0 级 → 20 级的属性增量是否等于成长表
  const inc = await page.evaluate(() => {
    const P = window.CharacterProgression;
    const tpl = (window.GameData?.characters || []).find(c => c.id === "lokar")
      || { id: "lokar", stats: { maxHp: 0, attack: 0, magic: 0, speed: 0 } };
    const a = P.statsAt(tpl, 0), b = P.statsAt(tpl, 20);
    return { lv0: a, lv20: b, delta: { maxHp: b.maxHp - a.maxHp, attack: b.attack - a.attack,
      magic: b.magic - a.magic, speed: b.speed - a.speed }, table: P.profile("lokar") };
  });
  const dOk = ["maxHp", "attack", "magic", "speed"].every(k =>
    Math.abs(inc.delta[k] - inc.table[k]) <= 1.01);
  check("0→20 级实际增量 = 成长表数值", dOk, { delta: inc.delta, table: inc.table });

  // ---------- 3) 经验倍率 1/2/3/4 ----------
  const exp = await page.evaluate(() => {
    const P = window.CharacterProgression;
    const diff = { xp: 1 };
    const one = (m) => P.rewardFor("normal", diff, m);
    return {
      mult: P.dungeonExpMultiplier,
      normal: { machine_factory: one("machine_factory"), underwater_train: one("underwater_train"),
        orc_dungeon: one("orc_dungeon"), ruins_sand_city: one("ruins_sand_city") },
      boss: P.rewardFor("boss", diff, "ruins_sand_city"),
    };
  });
  const n = exp.normal;
  check("经验倍率 = 1/2/3/4",
    exp.mult.machine_factory === 1 && exp.mult.underwater_train === 2
    && exp.mult.orc_dungeon === 3 && exp.mult.ruins_sand_city === 4, exp.mult);
  check("实战结算值 普通怪 30/60/90/120",
    n.machine_factory === 30 && n.underwater_train === 60
    && n.orc_dungeon === 90 && n.ruins_sand_city === 120, n);
  check("废墟沙城 BOSS 经验 = 130×4", exp.boss === 520, { boss: exp.boss });

  // ---------- 4) 解锁事件：兽人地下城【勇士级】通关 → 废墟沙城 ----------
  const unlock = await page.evaluate(() => {
    const st = window.state;
    st.flags = st.flags || {};
    // 清掉已解锁痕迹，模拟"首次"
    delete st.flags.ruinsSandCityUnlocked;
    delete st.flags.ruinsSandCityUnlockSeen;
    delete st.flags.ruinsSandCityUnlockPending;
    st.hallModal = null;
    st.view = "hall";
    const wrongDiff = window.triggerRuinsSandCityUnlockEvent?.(st,
      { missionId: "orc_dungeon", difficultyId: "adventure" });
    const wrongDiffModal = st.hallModal;
    st.hallModal = null;
    const wrongMission = window.triggerRuinsSandCityUnlockEvent?.(st,
      { missionId: "machine_factory", difficultyId: "warrior" });
    const wrongMissionModal = st.hallModal;
    st.hallModal = null;
    const right = window.triggerRuinsSandCityUnlockEvent?.(st,
      { missionId: "orc_dungeon", difficultyId: "warrior" });
    return { wrongDiff, wrongDiffModal, wrongMission, wrongMissionModal,
      right, modal: st.hallModal, pending: st.flags.ruinsSandCityUnlockPending };
  });
  check("非勇士级不触发（冒险级）", unlock.wrongDiff === false && !unlock.wrongDiffModal,
    { 返回: unlock.wrongDiff, modal: unlock.wrongDiffModal });
  check("非兽人地下城不触发（机械工厂）", unlock.wrongMission === false && !unlock.wrongMissionModal,
    { 返回: unlock.wrongMission, modal: unlock.wrongMissionModal });
  check("兽人地下城【勇士级】→ 触发废墟沙城解锁",
    unlock.right === true && unlock.modal === "ruinsSandCityUnlock",
    { 返回: unlock.right, modal: unlock.modal, pending: unlock.pending });

  // 弹窗是否真的渲染出剧情界面（需先进入大厅，否则渲染的是开始界面）
  await page.click("[data-start-game]");
  await page.waitForTimeout(1500);
  const modalHtml = await page.evaluate(async () => {
    const st = window.state;
    st.battle = null; st.explore = null; st.hallModal = null;
    delete st.flags.ruinsSandCityUnlocked; delete st.flags.ruinsSandCityUnlockSeen;
    window.triggerRuinsSandCityUnlockEvent?.(st, { missionId: "orc_dungeon", difficultyId: "warrior" });
    window.render?.();
    await new Promise(r => setTimeout(r, 400));
    const html = document.querySelector("#view")?.innerHTML || "";
    return { view: st.view, modal: st.hallModal,
      hasRuins: html.includes("废墟沙城"),
      hasBtn: html.includes("ruins-sand-city-unlock-complete"),
      villaModal: !!document.querySelector(".villa-modal") };
  });
  check("解锁弹窗可渲染（标题+完成按钮+弹窗DOM）",
    modalHtml.hasRuins && modalHtml.hasBtn && modalHtml.villaModal
    && modalHtml.modal === "ruinsSandCityUnlock", modalHtml);

  // 完整链路：点击完成按钮 → 废墟沙城开放 + 亚缇娜/玛利亚解锁
  await page.click("[data-ruins-sand-city-unlock-complete]");
  await page.waitForTimeout(2000);
  const done = await page.evaluate(() => {
    const st = window.state;
    const g = id => st.chars.find(c => c.id === id);
    return { unlocked: !!st.flags.ruinsSandCityUnlocked, seen: !!st.flags.ruinsSandCityUnlockSeen,
      artinaLocked: g("artina")?.locked, mariaLocked: g("maria")?.locked,
      modal: st.hallModal, logHead: (st.log || [])[0] };
  });
  check("点击完成 → 废墟沙城解锁 + 亚缇娜/玛利亚入队",
    done.unlocked && done.seen && done.artinaLocked === false
    && done.mariaLocked === false && done.modal === null, done);
  check("解锁日志正确", /废墟沙城已解锁/.test(done.logHead || ""), { log: done.logHead });

  // ---------- 5) 副本概述：15层 / 篝火4·9 / 宝箱7 ----------
  const map = await page.evaluate(() => {
    const M = window.DungeonMap;
    const mission = (window.GameData?.missions || []).find(m => m.id === "ruins_sand_city");
    const diff = (window.GameData?.difficulties || {})["warrior"];
    if (!M?.buildLayers || !mission || !diff) return { err: { hasMap: !!M, hasMission: !!mission, hasDiff: !!diff } };
    const out = [];
    for (let i = 0; i < 50; i++) {
      const layers = M.buildLayers(mission, diff, window.state);
      if (layers?.length) out.push(layers);
    }
    if (!out.length) return { err: "buildLayers 返回空" };
    const layers = out[0];
    const typeLayers = t => layers.map((l, i) => l?.some?.(n => n?.type === t) ? i + 1 : null).filter(Boolean);
    return {
      layers: layers.length,
      restLayers: typeLayers("rest"),
      chestLayers: typeLayers("chest"),
      bossLayers: typeLayers("boss"),
      layouts: new Set(out.map(x => JSON.stringify(x.map(l => l?.length)))).size,
    };
  });
  if (map) {
    check("共 15 层", map.layers === 15, { layers: map.layers });
    check("篝火固定在第 4、9 层", JSON.stringify(map.restLayers) === "[4,9]", map.restLayers);
    check("宝箱固定在第 7 层", JSON.stringify(map.chestLayers) === "[7]", map.chestLayers);
    check("节点随机（50 局布局不同）", map.layouts > 1, { 布局种类: map.layouts });
  } else {
    check("地图生成接口可调用", false, { info: "DungeonMap.generate 未返回 layers" });
  }

  console.log("\n页面错误:", errors.length ? errors.slice(0, 3) : 0);
  await browser.close();
  const pass = results.filter(r => r.ok).length;
  console.log(`\n汇总：${pass} 通过 / ${results.length - pass} 失败`);
  process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error("FATAL", e); process.exit(1); });
