// 280 版浏览器实机：真实页面（file:// + 重建后的 bundle）验证两件事
// ① 发动技能不再生成飞行牌（正/反对照）；② 测试战斗选研究所新怪时 BGM 走新 OGG。
// hall-test-actions.js 的函数在 bundle 闭包内不暴露 window，故把同一份源码注入页面后
// 真实调用 startTestBattle，检查 BattleSystem.start 产出的 battle.missionId / battleBgm。
const fs = require("fs");
const { chromium } = require("/usr/local/lib/node_modules/playwright");
const SRC = "/data/workspace/repo/src/original/hall-test-actions.js";
const results = [];
const put = (n, ok, d = "") => { results.push({ n, ok: !!ok, d }); console.log(`  ${ok ? "PASS" : "FAIL"} ${n}${d ? " — " + d : ""}`); };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto("file:///data/workspace/repo/publish/index.html", { waitUntil: "load", timeout: 30000 });
  await page.waitForTimeout(1800);
  // 战斗模块按需加载：与 startTestBattle 内部同一入口
  await page.evaluate(async () => {
    window.render = window.render || (() => {});
    window.persist = window.persist || (() => {});
    if (window.GameBundles?.load) await window.GameBundles.load("battle", { state: window.state, test: true, allyIds: [] });
  });
  await page.addScriptTag({ content: fs.readFileSync(SRC, "utf8") });
  await page.waitForTimeout(400);

  const init = await page.evaluate(() => ({
    badge: document.querySelector(".build-badge")?.textContent.trim() || null,
    meta: document.querySelector('meta[name="game-build"]')?.content || null,
    hasBGM: !!window.GameBGM?.battleTrack, hasTrail: !!window.GameUIBattleTrail,
    hasCardArt: !!window.CardArt, hasPlay: !!window.BattleEffectPlay,
    hasDom: !!window.BattleEffectCardDOM, hasUtils: !!window.BattleEffectUtils,
    hasTestFn: typeof window.testBattleMissionId === "function",
    hasStart: typeof window.startTestBattle === "function",
    hasMission: !!window.GameData?.missions?.some(m => m.id === "tenri_institute"),
    tenriCount: (window.GameDataWorld?.enemies?.tenri_institute || []).length,
  }));
  put("01 页面渲染且版本戳 280", init.meta === "20260915-280" && init.badge === "v26.0915.280",
    `meta=${init.meta} badge=${init.badge}`);
  put("02 关键模块与测试战斗函数已装配",
    init.hasBGM && init.hasTrail && init.hasCardArt && init.hasPlay && init.hasDom
    && init.hasTestFn && init.hasStart && init.hasMission, JSON.stringify(init));
  put("03 研究所 4 只怪在测试敌人池", init.tenriCount === 4, `count=${init.tenriCount}`);

  // ---- BGM：真实 mission 数据 + 真实 battleTrack + 真实 missionId 推断 ----
  const bgm = await page.evaluate(() => {
    const enemies = window.GameDataWorld.enemies.tenri_institute;
    const mission = window.GameData.missions.find(m => m.id === "tenri_institute");
    const idx = enemies.map(e => window.GameData.testEnemies.findIndex(t => t.id === e.id));
    return {
      track: window.GameBGM.battleTrack("tenri_institute", enemies),
      missionBgm: mission.bgm,
      mf: window.GameBGM.battleTrack("machine_factory", []),
      idx,
      noOwnBgm: enemies.every(e => !e.bgm),
      owner: window.testBattleMissionId(idx),
      mixed: window.testBattleMissionId([0, ...idx]),
      empty: window.testBattleMissionId([]),
    };
  });
  put("04 研究所怪无各自 bgm、靠 mission.bgm 回落", bgm.noOwnBgm && !!bgm.missionBgm);
  put("05 battleTrack(tenri_institute, 4 怪) 返回新无缝战斗 OGG",
    bgm.track === bgm.missionBgm && /tenri-institute-battle.*\.ogg/.test(bgm.track), bgm.track);
  put("06 battleTrack(machine_factory) 仍是既有机械工厂默认曲",
    bgm.mf === "battle", `key=${bgm.mf}（tracks.battle 指向 machine-factory-battle.ogg）`);
  put("07 testBattleMissionId(4 只研究所怪) = tenri_institute", bgm.owner === "tenri_institute", `owner=${bgm.owner}`);
  put("08 混合 / 空选择回退 machine_factory",
    bgm.mixed === "machine_factory" && bgm.empty === "machine_factory",
    `mixed=${bgm.mixed} empty=${bgm.empty}`);
  put("09 4 只怪都能在测试敌人池定位", bgm.idx.length === 4 && bgm.idx.every(i => i >= 0), bgm.idx.join(","));

  // ---- 技能牌飞行：真实模块 + 真实 DOM，正/反对照 ----
  const flight = await page.evaluate(async () => {
    const savedBattle = window.state.battle, savedFront = window.BattleEffectCardDOM.front,
      savedIsSkill = window.CardArt.isSkill, savedActive = window.BattleSystem.active;
    let front = 0, commits = 0;
    const host = document.createElement("div");
    host.innerHTML = '<div class="public-zone"></div><div class="play-card selected"></div>'
      + '<div data-target="a1"><div class="unit-art"></div></div>';
    document.body.appendChild(host);
    window.BattleEffectCardDOM.front = () => {
      front += 1;
      const el = document.createElement("div");
      el.className = "flying-card";
      return el;
    };
    window.BattleSystem.active = () => ({ uid: "a1", side: "ally", name: "测试角色",
      hand: [{ name: "杀", type: "slash", power: 0, scale: "attack", suit: "♠" }] });
    const mk = skill => ({ battle: {
      selectedSkillCard: skill ? { name: "测试主动技", type: "tactic", _skill: true,
        skillName: "测试主动技", power: 0 } : null,
      selectedCardIndex: skill ? null : 0,
      pendingTargetUids: [], pendingTargetUid: null,
      allies: [{ uid: "a1", side: "ally", hp: 100 }],
      enemies: [{ uid: "t1", side: "enemy", hp: 100 }],
      animQueue: [], locked: false,
    } });
    const run = async skill => {
      front = 0; commits = 0; let runErr = null;
      window.state.battle = mk(skill).battle;
      try {
        await window.BattleEffectPlay.playCard(window.state,
          () => { commits += 1; return true; }, () => {}, () => {}, () => {}, () => true);
      } catch (e) { runErr = e.message; /* 反向对照里动画 DOM 不完整会抛，front 已计数 */ }
      return { front, commits, runErr };
    };
    const skill = await run(true);
    window.CardArt.isSkill = () => false;
    const reversed = await run(true);
    window.CardArt.isSkill = savedIsSkill;
    const restored = await run(true);
    const trail = window.GameUIBattleTrail({ trailCard: c => c.name });
    const cards = trail.cards({ played: [{ name: "杀" }, { name: "测试主动技", _skill: true, skillName: "测试主动技" }], shownPlayed: [] });
    const skillArtUrl = window.CardArt.url({ name: "测试主动技", _skill: true, skillName: "测试主动技" });
    window.state.battle = savedBattle; window.BattleEffectCardDOM.front = savedFront;
    window.BattleSystem.active = savedActive;
    host.remove(); document.querySelectorAll(".flying-card").forEach(e => e.remove());
    return { skill, reversed, restored, trailNames: cards.map(c => c.name), skillArtUrl };
  });
  put("11 发动技能不生成飞行牌且正常结算",
    flight.skill.front === 0 && flight.skill.commits === 1, JSON.stringify(flight.skill));
  put("12 反对照：撤掉 isSkill 判据同一张牌会飞（断言非空转）",
    flight.reversed.front >= 1, JSON.stringify(flight.reversed));
  put("13 恢复判据后再次不飞", flight.restored.front === 0 && flight.restored.commits === 1,
    JSON.stringify(flight.restored));
  put("14 出牌区仍过滤技能牌（只留实体牌）",
    flight.trailNames.length === 1 && flight.trailNames[0] === "杀", flight.trailNames.join(","));
  put("15 技能牌仍不解析卡图（上轮修复未回退）", flight.skillArtUrl === "", `url=${flight.skillArtUrl}`);
  put("16 全程无 pageerror", errors.length === 0, errors.slice(0, 2).join(" | "));

  // ---- 真实启动测试战斗（BattleSystem.start 产出 battle 对象） ----
  const started = await page.evaluate(async () => {
    const idx = window.GameDataWorld.enemies.tenri_institute
      .map(e => window.GameData.testEnemies.findIndex(t => t.id === e.id));
    const s = window.state;
    s.testEnemies = idx;
    s.testAllies = (s.party || (s.chars || []).filter(c => !c.locked).map(c => c.id)).slice(0, 4);
    try {
      await window.startTestBattle(() => true);
      const b = window.state.battle;
      return { ok: !!b, missionId: b?.missionId || null, battleBgm: b?.battleBgm || null,
        test: b?.test, enemyIds: (b?.enemies || []).map(e => e.id) };
    } catch (e) { return { ok: false, err: e.message }; }
  }).catch(e => ({ ok: false, err: e.message }));
  put("10 真实测试战斗：missionId=tenri_institute、battleBgm=新 OGG、4 只新怪",
    started?.ok && started.missionId === "tenri_institute"
      && started.battleBgm === bgm.missionBgm && started.enemyIds.length === 4,
    JSON.stringify(started));

  const pass = results.filter(r => r.ok).length;
  console.log(`LIVE ${pass}/${results.length}`);
  await browser.close();
  process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error("LIVE_FAIL", e.stack); process.exit(1); });
