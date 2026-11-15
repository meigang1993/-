// 实机：狂战意志「出牌阶段限一次」的阶段维度验证。
// 在真实渲染页面里切换 battle.phase / locked / usedBerserkWill / 回合重置，
// 直接读技能按钮的 disabled 与 data-skill-index（点击绑定靠后者挂载）。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "✅" : "❌"} ${name}${detail ? `  ← ${detail}` : ""}`);
};

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_BIN || undefined,
    args: ["--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e.message || e)));
  try {
    await startRegressionBattle(page);
    const out = await page.evaluate(() => {
      const b = window.state.battle;
      const actor = b.allies[0];
      const pools = [window.GameData?.characters, window.GameDataCharacters,
        window.GameCharacters, window.GameData?.playableCharacters,
        window.GameData?.allCharacters];
      let tpl = null;
      for (const list of pools) {
        if (!Array.isArray(list)) continue;
        tpl = list.find(c => c && (c.id === "angelica" || c.ref === "angelica"));
        if (tpl) break;
      }
      const skills = (tpl?.skills || []).map(s => ({ ...s, card: s.card ? { ...s.card } : undefined }));
      Object.assign(actor, {
        ref: "angelica", name: "安洁莉卡", gender: "female", skills,
        hp: 80, maxHp: 154, visualHp: 80, rageMarks: 3,
        usedBerserkWill: false, usedCrimsonRampage: false,
        intent: 3, intentMax: 3, hand: [],
      });
      b.activeUid = actor.uid;
      b.played = []; b.shownPlayed = []; b.animQueue = [];
      b.selectedSkillCard = null; b.selectedCardIndex = null;
      window.BattleEffects.animating = false;
      window.BattleEffects.draining = false;

      const snap = () => {
        const buttons = Array.from(document.querySelectorAll("button.skill"))
          .filter(x => (x.textContent || "").includes("狂战意志"));
        return buttons.map(x => ({
          disabled: x.classList.contains("disabled"),
          dataIdx: x.hasAttribute("data-skill-index"),
          title: (x.getAttribute("title") || "").slice(-40),
        }));
      };
      const phase = n => { b.phase = n; b.locked = false; window.render(); return snap(); };

      const tplOk = !!tpl && skills.some(s => s.name === "狂战意志");
      const p4 = phase(4);
      const p1 = phase(1);
      const p6 = phase(6);
      b.phase = 4; b.locked = true; window.render(); const locked = snap();
      b.locked = false; actor.usedBerserkWill = true; window.render(); const used = snap();
      // 下一回合：真实调用回合重置入口，攒回标记后应重新可点。
      actor.rageMarks = 3;
      window.BattleTurnState.resetBeginTurn(actor, b, 3);
      b.phase = 4; window.render(); const next = snap();
      return { tplOk, p4, p1, p6, locked, used, next,
        resetUsed: actor.usedBerserkWill, marks: actor.rageMarks };
    });

    check("A1 页面取到安洁莉卡模板与狂战意志技能", out.tplOk);
    const clickable = arr => arr.some(x => x.dataIdx && !x.disabled);
    check("A2 phase4 存在可点击的技能按钮", clickable(out.p4), JSON.stringify(out.p4));
    check("A3 phase1（准备阶段）按钮全部置灰且无点击绑定",
      out.p1.length > 0 && !clickable(out.p1)
      && out.p1.every(x => /只能在出牌阶段发动/.test(x.title)), JSON.stringify(out.p1));
    check("A4 phase6（结束阶段）按钮全部置灰且无点击绑定",
      out.p6.length > 0 && !clickable(out.p6), JSON.stringify(out.p6));
    check("A5 战斗结算锁定（locked）按钮全部置灰",
      out.locked.length > 0 && !clickable(out.locked), JSON.stringify(out.locked));
    check("A6 本回合已发动（usedBerserkWill）按钮置灰",
      out.used.length > 0 && !clickable(out.used), JSON.stringify(out.used));
    check("A7 下一回合重置后 used 清零且按钮恢复可点",
      out.resetUsed === false && out.marks === 3 && clickable(out.next),
      JSON.stringify({ resetUsed: out.resetUsed, marks: out.marks, next: out.next }));
    check("A8 实机无页面错误", errors.length === 0, errors.join(" | "));
  } catch (e) {
    check("实机流程异常", false, String(e && e.stack || e));
  } finally {
    await browser.close();
  }
  console.log(`berserk-will phase live: ${pass} PASS / ${fail} FAIL`);
  if (fail) process.exit(1);
})();
