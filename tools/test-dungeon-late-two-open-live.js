// 实战：后两个副本（兽人地下城、废墟沙城）的开放链路与真实出征。
//
// 覆盖三件事：
//   1) 通关指定副本的指定难度会触发开放事件（水下列车·冒险级 -> 兽人地下城）
//   2) 开放事件完成后界面从"未开放"变为可出征
//   3) 真正点击出征按钮能进入副本（view 切到 explore/dungeon）
//
// 顺带核查一个隐患：废墟沙城的本地解锁事件要求 artina 与 maria 两名角色已存在，
// 若玩家尚未解锁她们，即便通关兽人地下城·勇士级也开不了这个副本。

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

// 读取准备启程页：每个副本每个难度的锁定状态 + 副本本身是否开放
const readCards = page => page.evaluate(() => {
  const html = window.VillaTeamUI.team(window.state);
  const doc = new DOMParser().parseFromString(html, "text/html");
  const out = {};
  doc.querySelectorAll("button[data-start][data-difficulty]").forEach(btn => {
    const card = btn.closest(".difficulty-card");
    const key = `${btn.dataset.start}/${btn.dataset.difficulty}`;
    out[key] = {
      locked: !!card && card.classList.contains("locked"),
      disabled: btn.disabled,
      text: (btn.textContent || "").trim(),
    };
  });
  return out;
});

// 走真实结算路径通关某副本某难度
const clearRun = (page, missionId, difficultyId) => page.evaluate(async ({ missionId, difficultyId }) => {
  const s = window.state;
  s.party = ["lokar"];
  s.view = "dungeon";
  s.explore = {
    focusId: `ui-${missionId}-${difficultyId}`,
    missionId, difficultyId,
    complete: true, banked: false,
    party: ["lokar"], activeParty: ["lokar"],
    earned: { gold: 0, essence: 0, cards: [], relics: [] },
  };
  await window.DungeonRewards.finish(s);
  return {
    view: s.view,
    modal: s.hallModal,
    orcPending: !!s.flags?.orcDungeonUnlockPending,
    ruinsPending: !!s.flags?.ruinsSandCityUnlockPending,
    orcUnlocked: !!s.flags?.orcDungeonUnlocked,
    ruinsUnlocked: !!s.flags?.ruinsSandCityUnlocked,
  };
}, { missionId, difficultyId });

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e.message || e)));
  try {
    await openGame(page);
    await startFreshGame(page);

    // 前置：开放水下列车，并把两个后续解锁所需的角色登记进存档。
    await page.evaluate(() => {
      const s = window.state;
      s.flags.underwaterTrainUnlocked = true;
      ["artina", "maria"].forEach(id => {
        if (!s.chars.some(c => c.id === id)) s.chars.push({ id, name: id, locked: false, hp: 1, maxHp: 1 });
      });
    });

    // A. 初始：后两个副本未开放
    const before = await readCards(page);
    T("A1 兽人地下城·普通级初始未开放",
      before["orc_dungeon/normal"] && before["orc_dungeon/normal"].disabled,
      before["orc_dungeon/normal"]);
    T("A2 废墟沙城·普通级初始未开放",
      before["ruins_sand_city/normal"] && before["ruins_sand_city/normal"].disabled,
      before["ruins_sand_city/normal"]);

    // B. 通关水下列车·普通级与冒险级；冒险级应触发兽人地下城开放
    const b1 = await clearRun(page, "underwater_train", "normal");
    T("B1 水下列车·普通级通关不触发兽人地下城",
      b1.orcPending === false && b1.orcUnlocked === false, b1);
    const b2 = await clearRun(page, "underwater_train", "adventure");
    T("B2 水下列车·冒险级通关触发兽人地下城开放事件",
      b2.orcPending === true && b2.modal === "orcDungeonUnlock", b2);

    // C. 完成开放事件
    const c1 = await page.evaluate(async () => {
      await window.completeOrcDungeonUnlockEvent();
      const s = window.state;
      return { orcUnlocked: !!s.flags?.orcDungeonUnlocked, pending: !!s.flags?.orcDungeonUnlockPending };
    });
    T("C1 兽人地下城已开放", c1.orcUnlocked === true && c1.pending === false, c1);
    const afterOrc = await readCards(page);
    T("C2 兽人地下城·普通级界面可出征",
      afterOrc["orc_dungeon/normal"] && !afterOrc["orc_dungeon/normal"].disabled
        && !afterOrc["orc_dungeon/normal"].locked, afterOrc["orc_dungeon/normal"]);
    T("C3 兽人地下城·冒险级仍锁定（难度需自己打）",
      afterOrc["orc_dungeon/adventure"] && afterOrc["orc_dungeon/adventure"].locked,
      afterOrc["orc_dungeon/adventure"]);

    // D. 【实际进入】渲染准备启程页后点击兽人地下城·普通级的出征按钮
    //    必须走真实 DOM：只有渲染后 AppHallBindings 才会把 onclick 绑到按钮上，
    //    只生成 HTML 字符串再 parse 出来的按钮没有事件，点了也没用。
    const d1 = await page.evaluate(async () => {
      const s = window.state;
      s.party = ["lokar"];
      s.view = "hall"; s.hallModal = "team";
      window.render();
      await new Promise(r => setTimeout(r, 400));
      const btn = [...document.querySelectorAll("button[data-start][data-difficulty]")]
        .find(b => b.dataset.start === "orc_dungeon" && b.dataset.difficulty === "normal");
      if (!btn) return { found: false, view: s.view };
      if (btn.disabled) return { found: true, disabled: true };
      btn.click();
      await new Promise(r => setTimeout(r, 3000));
      return {
        found: true,
        disabled: false,
        view: window.state.view,
        missionId: window.state.explore?.missionId,
        difficultyId: window.state.explore?.difficultyId,
        layers: window.state.explore?.layers?.length || 0,
        log: (window.state.log || [])[0] || "",
      };
    });
    T("D1 兽人地下城·普通级可真正进入",
      d1.found && !d1.disabled && d1.missionId === "orc_dungeon" && d1.layers > 0, d1);

    // E. 通关兽人地下城·勇士级触发废墟沙城开放
    await page.evaluate(() => { window.state.explore = null; window.state.view = "hall"; window.state.hallModal = null; });
    await clearRun(page, "orc_dungeon", "normal");
    await page.evaluate(() => { window.state.hallModal = null; });
    await clearRun(page, "orc_dungeon", "adventure");
    await page.evaluate(() => { window.state.hallModal = null; });
    const e1 = await clearRun(page, "orc_dungeon", "warrior");
    T("E1 兽人地下城·勇士级通关触发废墟沙城开放事件",
      e1.ruinsPending === true && e1.modal === "ruinsSandCityUnlock", e1);

    const e2 = await page.evaluate(async () => {
      const before = { artina: window.state.chars.some(c => c.id === "artina"), maria: window.state.chars.some(c => c.id === "maria") };
      await window.completeRuinsSandCityUnlockEvent?.();
      const s = window.state;
      return { before, ruinsUnlocked: !!s.flags?.ruinsSandCityUnlocked, pending: !!s.flags?.ruinsSandCityUnlockPending };
    });
    T("E2 废墟沙城已开放（需 artina+maria 在场）",
      e2.ruinsUnlocked === true && e2.pending === false, e2);

    const afterRuins = await readCards(page);
    T("E3 废墟沙城·普通级界面可出征",
      afterRuins["ruins_sand_city/normal"] && !afterRuins["ruins_sand_city/normal"].disabled,
      afterRuins["ruins_sand_city/normal"]);

    // F. 【实际进入】废墟沙城·普通级
    const f1 = await page.evaluate(async () => {
      const s = window.state;
      s.party = ["lokar"];
      s.view = "hall"; s.hallModal = "team";
      window.render();
      await new Promise(r => setTimeout(r, 400));
      const btn = [...document.querySelectorAll("button[data-start][data-difficulty]")]
        .find(b => b.dataset.start === "ruins_sand_city" && b.dataset.difficulty === "normal");
      if (!btn) return { found: false, view: s.view };
      if (btn.disabled) return { found: true, disabled: true };
      btn.click();
      await new Promise(r => setTimeout(r, 3000));
      return {
        found: true,
        disabled: false,
        missionId: window.state.explore?.missionId,
        difficultyId: window.state.explore?.difficultyId,
        layers: window.state.explore?.layers?.length || 0,
      };
    });
    T("F1 废墟沙城·普通级可真正进入",
      f1.found && !f1.disabled && f1.missionId === "ruins_sand_city" && f1.layers > 0, f1);

    // G. 四个副本难度独立：此时各副本难度表
    const g1 = await page.evaluate(() => {
      const U = window.DungeonUnlocks;
      return ["machine_factory", "underwater_train", "orc_dungeon", "ruins_sand_city"]
        .map(id => `${id}=${U.list(window.state, id).join("/")}`);
    });
    T("G1 四副本难度各自独立推进", true, g1);
    console.log(`   ${g1.join(" | ")}`);

    T("H1 页面无 JS 错误", errors.length === 0, errors);
  } catch (err) {
    console.log(`❌ 执行异常: ${err.message}`);
    total++;
  } finally {
    await browser.close();
  }
  console.log(`\n通过 ${pass}/${total}`);
  console.log(`总计 ${pass === total ? "全部通过" : `失败 ${total - pass}`}`);
  process.exit(pass === total ? 0 : 1);
})();
