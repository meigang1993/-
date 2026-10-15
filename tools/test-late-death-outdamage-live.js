// 专项：另外两条「直接改 hp、不走 damage 流程」的回合外伤害路径，
// 把我方当前行动者打死之后，同样不得卡在弃牌阶段。
//
//   D 死亡音波  废墟沙城龙：我方回合结束时，若未使用龙记录的花色，
//              受到等同于龙攻击力的伤害（ruins-dragon-deathwave.js）
//              —— 触发点紧接弃牌阶段，与牛头王 BUG 时序同构，风险最高。
//   E 外神之眼  凋零者：我方用实体牌打凋零者，若我方无其他存活角色，
//              使其对自己造成等同于自身攻击力的伤害
//              （ruins-witherer-skills.js eyeOfOuterGod）
//
// 两条都是 `unit.hp = Math.max(0, unit.hp - amount)` 直接改血，
// 不经过 damage 流程，是「死亡处理被漏掉」的高风险写法。
//
// 测试方法论（重要）：
//   卡死的判定标准是「游戏状态是否推进」，不是「函数 Promise 是否 resolve」。
//   endPlay 会触发整条回合链（我方结束 → 敌方 AI 回合 → 动画播放），
//   若 await 它，必然长时间不返回，会把正常流程误判为卡死。
//   因此出牌与结束回合一律 fire-and-forget，再等待固定时间后检查状态。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

// /dev/shm 只有 64M，Chromium 加载大页面易崩；用 --disable-dev-shm-usage 走磁盘
const LAUNCH = { args: ["--disable-dev-shm-usage", "--disable-gpu", "--no-sandbox"] };

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass += 1; console.log(`✅ ${name}${extra ? " — " + extra : ""}`); }
  else { fail += 1; console.log(`❌ ${name}${extra ? " — " + extra : ""}`); }
}

const BASE = `
  const st = window.state, b = st.battle;
  b.test = false;
  const ally = b.allies[0], e0 = b.enemies[0];
  b.animQueue = []; b.floats = [];
  ally.maxHp = 62; ally.block = 0; ally.intent = 5;
`;

// 快照：状态是否推进才是卡死的判据（不注入 BASE，避免清空动画队列）
const SNAP = `
  const st = window.state, b = st.battle;
  const ally = b.allies[0];
  // 周期性 render 模拟真实帧循环：死亡处理（弃置手牌）要等死亡动画播完，
  // 只 render 一次的话动画不会推进，手牌清理永远不发生，会被误判成 BUG。
  for (let i = 0; i < %WAIT% / 200; i += 1) {
    await new Promise(r => setTimeout(r, 200));
    window.render && window.render();
  }
  const txt = document.body.innerText || "";
  const logText = (window.state.log || []).join(" | ");
  return {
    hp: ally.hp, hand: ally.hand.length, phase: b.phase,
    active: b.activeUid, turn: b.turn, locked: !!b.locked,
    uiDiscard: /弃牌阶段/.test(txt),
    logText: logText.slice(0, 500),
  };
`;

async function run(label, setup, acts, pageErrors) {
  const browser = await chromium.launch(LAUNCH);
  const page = await browser.newPage();
  page.on("pageerror", e => pageErrors.push(e.message));
  page.on("crash", () => pageErrors.push(`PAGE CRASHED(${label})`));
  await startRegressionBattle(page);
  // withBase=false 用于只读快照：BASE 里有 b.animQueue=[] / b.floats=[]，
  // 每次重新注入会把待播放的动画队列清空 —— 外神之眼的延迟回调挂在队列上，
  // 一清就再也不会执行（这一步排查了很久，勿再改回）。
  const step = async (stepLabel, code, withBase = true) => {
    try {
      const p = page.evaluate(`(async () => { ${withBase ? BASE : ""} ${code} })()`);
      const t = new Promise((_, rej) => setTimeout(
        () => rej(new Error("STEP_TIMEOUT_20s")), 20000));
      return await Promise.race([p, t]);
    } catch (err) {
      const msg = err.message.split("\n")[0];
      console.log(`  [${label}/${stepLabel}] 异常:`, msg);
      return null;
    }
  };
  await step("setup", `${setup} return true;`);
  for (let i = 0; i < acts.length; i += 1) {
    await step(`act${i + 1}`, acts[i]);
  }
  // 只读快照：不注入 BASE（否则会清空 animQueue，把待触发的技能回调冲掉）
  // 外神之眼要等受击结算与延迟回调跑完，实测约 5 秒才出现，故给足 8 秒
  const out = await step("snap", SNAP.replace("%WAIT%", "8000"), false);
  try { await page.close(); } catch (_) {}
  try { await browser.close(); } catch (_) {}
  return out || { hp: null, hand: null, phase: null, active: null, turn: null,
    locked: null, uiDiscard: null, logText: "" };
}

(async () => {
  const pageErrors = [];

  // ============ D 死亡音波：回合结束时触发 ============
  const d = await run("D", `
    e0.ai = "ruins_dragon"; e0.id = "ruins_dragon"; e0.name = "废墟沙城龙";
    e0.maxHp = 200; e0.hp = 200;
    e0.stats = Object.assign({}, e0.stats || {}, { attack: 20 });
    e0.ruinsDeathWaveSuits = ["♥"]; e0.ruinsDeathWaveSuit = null;
    e0.hand = []; e0.ruinsHitsThisTurn = 0; e0.ruinsGunFired = false;
    ally.hp = 3; ally.suitsUsedThisTurn = {};
    // 关键：手上必须留牌。若出牌把手牌打空，阵亡时无牌可弃，
    // 修复与否都不会卡 —— 那样的测试是恒绿的，反向验证根本抓不到红。
    // 不出【杀】：避免触发龙的机尾机枪，隔离出死亡音波这一条路径。
    ally.hand = [
      { name: "蓄力", type: "tactic", suit: "♠" },
      { name: "蓄力", type: "tactic", suit: "♠" },
      { name: "蓄力", type: "tactic", suit: "♠" },
    ];
    ally.skills = [];   // 禁用自动摸牌技能，避免手牌超限停在弃牌阶段等玩家
  `, [
    // 直接结束出牌：手牌仍在手上，死亡音波随后把我方打死
    `window.BattleSystem.endPlay(window.state); return true;`,
  ], pageErrors);

  console.log("\nD 死亡音波（回合结束触发）");
  check("D1 死亡音波确实触发", /死亡音波/.test(d.logText), d.logText.slice(0, 110));
  check("D2 我方被反死", d.hp <= 0, `hp=${d.hp}`);
  check("D3 未卡在弃牌阶段 phase=5", d.phase !== 5, `phase=${d.phase}`);
  check("D4 行动权推进（不再是死者 a0）", d.active !== "a0", `active=${d.active}`);
  check("D5 回合已推进", d.turn > 0, `turn=${d.turn}`);
  check("D6 UI 不再显示弃牌阶段", d.uiDiscard === false);
  check("D7 死者手牌最终被清理", d.hand === 0, `手牌=${d.hand}`);

  // ============ E 外神之眼：受击结算后自伤分支 ============
  // 触发条件（ruins-witherer-skills.js afterDamage）：
  //   target.ai === "ruins_witherer" && isEntityCard(card)
  //   且我方（伤害来源）无其他存活角色 → 走「对自己造成攻击力伤害」分支
  const e = await run("E", `
    e0.ai = "ruins_witherer"; e0.id = "witherer_1312"; e0.name = "凋零者";
    e0.maxHp = 200; e0.hp = 200;
    e0.stats = Object.assign({}, e0.stats || {}, { attack: 20 });
    // 必须清空敌人手牌：否则凋零者会「自动使用闪」抵消伤害，
    // hpLoss=0 时 afterDamage 直接 return，外神之眼根本不会触发。
    e0.hand = [];
    ally.hp = 3;
    // 我方只剩一人 → 外神之眼走「对自己造成伤害」分支
    b.allies.slice(1).forEach(u => { u.hp = 0; });
    ally.hand = [{ name: "杀（普攻）", type: "slash", suit: "♠" }];
    ally.skills = [];
  `, [
    // 出实体【杀】打凋零者（不 await）
    // 注意：这里刻意不调用 endPlay。外神之眼在「受击结算后」触发，
    // endPlay 会结束出牌阶段并推进回合，反而打断其延迟回调（实测不触发）。
    // 且本场景我方独苗，一旦被反死即全军覆没，根本走不到弃牌阶段。
    `window.BattleSystem.selectCard(st, 0);
     window.BattleSystem.chooseTarget(st, e0.uid);
     window.BattleSystem.playSelectedCard(st);
     return true;`,
  ], pageErrors);

  // E 的独特性：外神之眼「自伤」分支只在我方独苗（无其他存活角色）时触发，
  // 因此我方一死就必然「全军覆没」，战斗正常结束 —— 谈不上卡在弃牌阶段。
  // 真正要确认的是：它确实走正常结束流程，而不是停在某个等待玩家操作的状态。
  console.log("\nE 外神之眼（受击后自伤·我方独苗）");
  check("E1 外神之眼确实触发", /外神之眼/.test(e.logText), e.logText.slice(0, 110));
  check("E2 我方被反死", e.hp <= 0, `hp=${e.hp}`);
  check("E3 未卡在弃牌阶段 phase=5", e.phase !== 5, `phase=${e.phase}`);
  check("E4 战斗正常结束（全军覆没）", /全军覆没/.test(e.logText));
  check("E5 死者手牌最终被清理", e.hand === 0, `手牌=${e.hand}`);

  check("无页面 JS 错误", pageErrors.length === 0, pageErrors.join(" | ") || "0");
  console.log(`\n通过 ${pass}/${pass + fail}`);
  process.exit(fail ? 1 : 0);
})();
