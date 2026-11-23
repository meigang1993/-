// 实战：废墟沙城 10 张新卡 × 自动/手动响应模式
// 检查：闪响应窗口（自动/手动）、响应动词（使用/打出，三国杀口径）、地雷触发覆盖
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

// 单条命令串行 8 个完整浏览器场景会超过工具层前台 HTTP 超时窗口（表现为 502、
// 日志 0 字节）。用 ONLY=<卡名[,卡名]> / MODE=<auto|manual> 分批跑；默认仍是全量。
const CARDS = ["吸魔杀", "流星杀", "枪林弹雨", "偷袭"]
  .filter(n => !process.env.ONLY || process.env.ONLY.split(",").includes(n));
const MODES = ["auto", "manual"]
  .filter(m => !process.env.MODE || m === process.env.MODE);

const inject = (cardName, mode) => `(() => {
  const cardName = ${JSON.stringify(cardName)};
  const b = window.state.battle;
  window.state.settings = window.state.settings || {};
  window.state.settings.manualResponse = ${mode === "manual"};
  window.__log = [];
  // 敌人准备阶段会摸牌，AI 可能随机改选别的牌，导致「目标牌从未打出」的假阴性。
  // 本脚本只验证「这张牌 → 我方响应窗口」，故当携带目标牌的敌人本回合决定出牌时，
  // 把出牌固定为目标牌（保留 AI 原决策的 target / score 等字段）。
  window.__forceUid = b.enemies[1].uid;
  window.__forceCardName = cardName === "偷袭" ? "枪林弹雨" : cardName;
  if (!window.__hooked) {
    const orig = window.BattleAI.choose;
    window.BattleAI.choose = function (bb, actor, canPlay) {
      let r = null; try { r = orig(bb, actor, canPlay); } catch (e) {}
      if (r && actor?.uid === window.__forceUid) {
        const c = (actor.hand || []).find(x => x.name === window.__forceCardName);
        if (c) r = { ...r, card: c };
      }
      window.__log.push({ actor: actor?.name, move: r?.card?.name || null });
      return r;
    };
    window.__hooked = true;
  }
  // 必须注入带 suit 的实体牌：卡牌「定义」只有 suits 对象、没有 suit，
  // 进战斗后 canPlay 判为无效，敌人 AI 永远不出牌（旧脚本恒绿掩盖了这一点）。
  const findCard = n => {
    const src = [window.GameDataCards?.eliteCards, window.GameData?.cards,
      window.GameData?.cardCodex, window.GameDataRuinsContent?.cards];
    for (const l of src) {
      if (!Array.isArray(l)) continue;
      const c = l.find(x => x?.name === n && x?.suit);
      if (c) return JSON.parse(JSON.stringify(c));
    }
    return null;
  };
  const e1 = b.enemies[1];
  if (cardName === "偷袭") {
    const tactic = findCard("枪林弹雨");
    const ambush = findCard("偷袭");
    if (!tactic || !ambush) return { missing: true };
    e1.hand = [tactic];
    b.allies.forEach(u => {
      u.hand = [JSON.parse(JSON.stringify(ambush)), { name: "闪", type: "response", suit: "♥" }];
      u.hp = 80; u.stats = u.stats || {}; u.stats.handLimit = 99;
    });
    b.allies[0].hand.push({ name: "地雷", type: "status" });
  } else {
    const card = findCard(cardName);
    if (!card) return { missing: true };
    e1.hand = [JSON.parse(JSON.stringify(card))];
    e1.stats.attack = 10; e1.stats.magic = 10;
    b.allies.forEach(u => {
      u.hand = [{ name: "闪", type: "response", suit: "♥" }, { name: "杀", type: "kill", suit: "♠" }];
      u.hp = 80; u.stats = u.stats || {}; u.stats.handLimit = 99;
    });
  }
  b.enemies[0].hand = [];
  // 测试战斗默认双我方：点一次「结束出牌」只会切到第二名我方，流程卡在准备阶段，
  // 敌人 AI 从未被调用（旧脚本恒绿 process.exit(0) 掩盖了这一点）。重建回合队列，
  // 让携带目标牌的敌人成为下一个行动单位。
  b.roundOrder = [e1.uid, b.enemies[0].uid, ...b.allies.map(u => u.uid)];
  b.roundIndex = 0;
  window.render();
  return { missing: false };
})()`;

(async () => {
  const browser = await chromium.launch();
  const out = {};
  for (const mode of MODES) {
    for (const name of CARDS) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      const errors = [];
      page.on("pageerror", e => errors.push(String(e)));
      const key = `${mode}/${name}`;
      try {
        await openGame(page);
        await startRegressionBattle(page);
        const inj = await page.evaluate(inject(name, mode));
        if (inj.missing) { out[key] = { err: "卡牌缺失" }; await page.close(); continue; }
        await page.locator("button", { hasText: "结束出牌" }).first().click();
        let manualWin = false, winType = null, played = false;
        for (let i = 0; i < 20; i++) {
          await page.waitForTimeout(600);
          const st = await page.evaluate(() => {
            const b = window.state.battle;
            return {
              manualDodge: !!b?.manualDodge,
              manualCounter: !!b?.manualCounter,
              log: (window.__log || []).map(x => x.move),
            };
          });
          if (st.manualDodge) { manualWin = true; winType = "manualDodge"; }
          if (st.manualCounter) { manualWin = true; winType = "manualCounter"; }
          if (st.log.includes(name) || (name === "偷袭" && st.log.some(m => m === "枪林弹雨"))) played = true;
          if (manualWin || (played && i > 8)) break;
        }
        const fin = await page.evaluate(() => {
          const b = window.state.battle;
          const bl = (window.state.log || []).slice(0, 14);
          const all = (window.state.log || []).join("|");
          let verb = null;
          const m = all.match(/(自动|手动|可以手动选择是否)(使用|打出)闪/);
          if (m) verb = m[0];
          else if (all.includes("使用闪")) verb = "使用闪";
          else if (all.includes("打出闪")) verb = "打出闪";
          return {
            manualDodge: !!b?.manualDodge,
            manualCounter: !!b?.manualCounter,
            battleLog: bl,
            landmine: bl.some(l => typeof l === "string" && l.includes("地雷触发")),
            verb,
            allyHp: b.allies.map(u => u.hp),
          };
        });
        out[key] = { played, manualWin: manualWin || fin.manualDodge || fin.manualCounter, winType, ...fin, errors: errors.slice(0, 2) };
      } catch (e) {
        out[key] = { err: String(e).slice(0, 200) };
      }
      await page.close();
    }
  }
  await browser.close();
  console.log("\n===== 废墟沙城10卡 × 自动/手动响应 实战 =====");
  Object.entries(out).forEach(([k, r]) => {
    if (r.err) { console.log(`  ${k.padEnd(16)} ❌ ${r.err}`); return; }
    console.log(`  ${k.padEnd(16)} 打出=${r.played} 手动窗口=${r.manualWin}(${r.winType || "-"}) 地雷触发=${r.landmine} 动词=${r.verb || "-"}`);
    console.log(`      战报=${JSON.stringify(r.battleLog || [])}`);
    if (r.errors && r.errors.length) console.log(`      错误=${r.errors.join(";")}`);
  });
  const failed = Object.entries(out).filter(([, r]) =>
    r.err || !r.played || (r.errors || []).length);
  console.log(`\n结果：${Object.keys(out).length - failed.length}/${Object.keys(out).length} 场景通过` +
    (failed.length ? `，失败：${failed.map(([k]) => k).join("、")}` : "") +
    `（本次范围 MODE=${process.env.MODE || "全部"} ONLY=${process.env.ONLY || "全部"}）`);
  // 原先恒为 process.exit(0)，即使场景抛错/没打出牌也算通过；现按真实结果设码。
  process.exit(failed.length || !Object.keys(out).length ? 1 : 0);
})();
