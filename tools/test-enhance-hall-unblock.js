// 【角色强化·副本置灰回大厅解除】严格复查：
//   A 副本中面板/判定/动作层三者一致置灰；
//   B 逐条走真实回大厅路径（撤退/通关/战败/副本内战斗失败/异常兜底/普通战斗/普通任务胜利），
//     验证 state.explore 被清、view=hall、面板四按钮解除 disabled、动作层放行且真的扣费；
//   C 静态扫描所有 view="hall" 落点，防止新增回大厅路径漏清 explore；
//   D 重绘接线（动作层调 render、失败路径显式重绘）；
//   E REVERT=reason|clear|hall|guard|panel|render 源码级反向验证，断言不是空转。
const fs = require("fs");
const vm = require("vm");
const REVERT = process.env.REVERT || "";
const read = f => fs.readFileSync("./src/original/" + f, "utf8");
const cache = {};
function patch(file, s) {
  if (REVERT === "reason" && file === "character-enhance.js")
    return s.replace(/function blockedReason\(state\) \{[\s\S]*?\n  \}/,
      'function blockedReason(state) { return ""; }');
  if (REVERT === "clear" && file === "dungeon-run-rewards.js")
    return s.replace(/state\.explore = null;/g, "state.explore = state.explore;");
  if (REVERT === "hall" && file === "dungeon-run-rewards.js")
    return s.replace(/state\.view = "hall";/g, 'state.view = "dungeon";');
  if (REVERT === "guard" && file === "hall-enhance-actions.js")
    return s.replace(/  if \(enhance\?\.blockedReason[\s\S]*?return false;\n/, "");
  if (REVERT === "panel" && file === "ui-info.js")
    return s.replace(/const blocked = enhance\?\.blockedReason[\s\S]*?: ""\);/, 'const blocked = "";');
  if (REVERT === "render" && file === "app-dungeon-actions.js")
    return s.replace("await DungeonSystem.retreat(actionState);\n        if (!isCurrent()) return false;\n        render();",
      "await DungeonSystem.retreat(actionState);\n        if (!isCurrent()) return false;");
  return s;
}
function src(f) { if (!(f in cache)) cache[f] = patch(f, read(f)); return cache[f]; }

const U = {
  esc: s => String(s ?? ""), face: () => "", statHtml: () => "",
  formatStat: n => String(n), combatRoleBadges: () => "",
  skillsOf: () => [], skillName: () => "", skillText: () => "", relicLabel: s => String(s),
};
function build(useRaw = false) {
  const calls = { core: [], render: 0, log: [] };
  const ctx = { console, Math, Number, Object, Array, JSON, String, Boolean, Error, Promise, setTimeout, clearTimeout };
  ctx.window = ctx;
  ctx.GameUIInfoMarks = () => ({
    greenHatMark: () => "", foodMark: () => "", rageMark: () => "", tankShellMark: () => "",
    vulnerableMark: () => "", missionMark: () => "", idolSuitMark: () => "", karunaSuitMark: () => "",
    domeSuitMark: () => "", jokerSuitMark: () => "", artinaSuitMark: () => "", deathWaveSuitMark: () => "",
    mariaNumberMark: () => "", mariaBlessingMark: () => "",
  });
  ctx.GameData = { missions: [{ id: "machine_factory", kind: "dungeon", reward: { gold: 0 } }] };
  ctx.GameStoreSaveLimits = { addResource: (a, b) => a + b };
  ctx.DungeonRewardCore = { completeNode: () => {}, rewardText: () => "0", healParty: () => {} };
  ctx.DungeonNodeRewards = { retryPending: async () => true, completeBattle: () => {}, chest: () => {} };
  ctx.ServerCore = {
    offlineOnly: () => false,
    call: async (op, payload, st) => {
      calls.core.push(op);
      if (op === "enhanceChar") {
        const c = st.chars.find(x => x.id === payload.id);
        ctx.CharacterEnhance.step(c, payload.stat);
        st.resources.gold -= 5000;
        return { ok: true, changed: true };
      }
      if (op === "bankRun" || op === "settleDefeat") return { ok: true };
      return { ok: true };
    },
  };
  ctx.BountySystem = { failRun: () => {} };
  ctx.SettlementRecovery = { enqueue: () => {}, count: () => 0 };
  ctx.DungeonSettlementActions = { queueDungeonCompletion: () => {} };
  ctx.NewCharacterUnlockEvents = { recordDungeonClear: () => {}, triggerPending: () => {} };
  ctx.DungeonUnlocks = { unlockNext: () => null };
  ctx.BattleFX = { leave: () => {} };
  ctx.Onboarding = { active: () => false, rewind: () => {} };
  ctx.MieryulaTimeStop = { clear: () => {} };
  ctx.BattleVictory = { open: () => {} };
  ctx.BattleLog = { add: () => {} };
  ctx.ReceiptLedger = { assign: () => "defeat-fixture-1" };
  ctx.triggerOrcDungeonUnlockEvent = () => false;
  ctx.triggerRuinsSandCityUnlockEvent = () => false;
  ctx.triggerPostUnderwaterTrainClearEvents = () => {};
  ctx.render = () => { calls.render++; };
  ctx.log = t => calls.log.push(t);
  ctx.persist = async () => {};
  ctx.clearBattleLog = () => {};
  ctx.cleanupBattlePrompts = () => {};
  ctx.getCombat = () => ({ checkDefeat: () => {}, checkEnd: () => {} });
  ctx.finishBattle = () => {};
  vm.createContext(ctx);
  [
    "character-enhance.js",
    "dungeon-run-rewards.js", "dungeon-rewards.js", "dungeon.js",
    "ui-info.js", "hall-enhance-actions.js", "app-render-state.js",
    "battle-outcomes.js", "battle-session-settlement.js",
  ].forEach(f => vm.runInContext(useRaw ? read(f) : src(f), ctx, { filename: f }));
  return { ctx, calls };
}

function fresh(opts = {}) {
  const s = {
    view: "dungeon", explore: {
      focusId: "f1", missionId: "machine_factory", difficultyId: "normal",
      party: ["lokar"], activeParty: ["lokar"], complete: false, banked: false,
      layers: [[{ id: "n1-0", layer: 1, col: 0, type: "start", done: true, next: [] }]],
      current: "n1-0", earned: { gold: 0, essence: 0, relics: [], cards: [] },
      pending: null, lastReward: null, rewardPopup: null,
    },
    battle: null,
    chars: [{ id: "lokar", name: "罗卡尔", locked: false, level: 1, exp: 0, hp: 124,
      stats: { maxHp: 124, attack: 10, magic: 5, speed: 11 },
      enhance: { maxHp: 0, attack: 0, magic: 0, speed: 0 } }],
    resources: { gold: 10000 }, log: [], flags: {}, party: ["lokar"],
    settings: {}, infoUnit: "lokar", infoTab: "enhance", hallModal: null,
    ...opts,
  };
  return s;
}
function panelHtml(ctx, s) {
  ctx.state = s;
  const u = s.chars.find(c => c.id === s.infoUnit);
  return ctx.GameUIInfo(U).infoPanel(u, "enhance");
}
const disabledCount = html => (html.match(/class="enhance-action"[^>]*disabled/g) || []).length;
async function actionAllowed(ctx, s, calls) {
  const before = calls.core.length;
  const ret = await ctx.enhanceCharacter("lokar", "attack", s, null);
  return { ret, called: calls.core.slice(before).includes("enhanceChar") };
}

let pass = 0, fail = 0;
const failed = [];
function ok(cond, name, extra) {
  if (cond) { pass++; return; }
  fail++; failed.push(name);
  console.log(`❌ ${name}${extra !== undefined ? "  ← " + JSON.stringify(extra) : ""}`);
}

(async () => {
  console.log("=== A. 副本中：判定 / 面板 / 动作层一致置灰 ===");
  {
    const { ctx, calls } = build();
    const s = fresh();
    ctx.state = s;
    ok(ctx.CharacterEnhance.blockedReason(s) === "副本中不可强化",
      "A1 副本态判定为「副本中不可强化」", ctx.CharacterEnhance.blockedReason(s));
    const html = panelHtml(ctx, s);
    ok(disabledCount(html) === 4 && (html.match(/data-enhance-stat=/g) || []).length === 4,
      "A2 面板四个强化按钮全部 disabled", { disabled: disabledCount(html) });
    ok(html.includes("副本中不可强化"), "A3 面板文案写明副本中不可强化");
    const a = await actionAllowed(ctx, s, calls);
    ok(a.ret === false && !a.called && s.resources.gold === 10000,
      "A4 副本中绕过按钮不扣费、不调 ServerCore", a);
  }

  console.log("=== B. 逐条真实回大厅路径：置灰解除 ===");
  const paths = [
    ["B1 副本撤退 DungeonRunRewards.retreat", async (ctx, s) => ctx.DungeonRunRewards.retreat(s)],
    ["B2 副本通关 DungeonRunRewards.finish", async (ctx, s) => {
      s.explore.complete = true; return ctx.DungeonRunRewards.finish(s);
    }],
    ["B3 全军覆没 DungeonRunRewards.fail", async (ctx, s) => {
      s.battle = { exploration: true, nodeId: "n1-0" }; return ctx.DungeonRunRewards.fail(s);
    }],
    ["B4 副本数据异常兜底 ensureRenderableView", async (ctx, s) => {
      s.explore = { layers: [] }; ctx.state = s; return ctx.ensureRenderableView();
    }],
    ["B5 普通战斗主动撤退 BattleOutcomes.retreat", async (ctx, s) => {
      s.explore = null; s.battle = { test: false, exploration: false };
      const bo = ctx.BattleOutcomes({ clearBattleLog: () => {}, finishBattle: () => {}, combat: ctx.getCombat() });
      return bo.retreat(s);
    }],
    ["B6 副本内战斗失败 BattleOutcomes.returnHall → DungeonSystem.fail", async (ctx, s) => {
      s.battle = { exploration: true, nodeId: "n1-0", defeat: false, pendingDefeat: false };
      const bo = ctx.BattleOutcomes({ clearBattleLog: () => {}, finishBattle: () => {}, combat: ctx.getCombat() });
      return bo.returnHall(s);
    }],
    ["B7 普通任务胜利 BattleSessionSettlement.finishBattle", async (ctx, s) => {
      s.explore = null;
      s.battle = { missionId: "machine_factory", test: false, exploration: false,
        pendingVictory: false, victoryScreen: true, locked: false };
      const f = ctx.BattleSessionSettlement({ cleanupBattlePrompts: () => {},
        clearBattleLog: () => {}, getCombat: ctx.getCombat });
      return f(s, true, true);
    }],
  ];
  for (const [name, run] of paths) {
    const { ctx, calls } = build();
    const s = fresh();
    ctx.state = s;
    await run(ctx, s);
    const html = panelHtml(ctx, s);
    const a = await actionAllowed(ctx, s, calls);
    ok(s.explore === null && s.view === "hall"
      && ctx.CharacterEnhance.blockedReason(s) === ""
      && disabledCount(html) === 0
      && a.ret === true && a.called && s.resources.gold === 5000,
      name + " 回大厅解除置灰并可真实强化",
      { explore: !!s.explore, view: s.view, blocked: ctx.CharacterEnhance.blockedReason(s),
        disabled: disabledCount(html), ret: a.ret, called: a.called, gold: s.resources.gold });
  }

  console.log("=== C. 静态扫描：所有 view=\"hall\" 落点不得漏清 explore ===");
  const HALL_FILES = fs.readdirSync("./src/original").filter(f => f.endsWith(".js"));
  const WHITELIST = new Set([
    "battle-outcomes.js", "battle-session-settlement.js", "hall-test-actions.js",
    "store-unlock-recovery.js", "hall-unlock-events.js", "villa-story-events.js", "app-render.js",
    "app-render-pages.js", "store-migration-normalizers.js", "app-battle-bindings.js",
  ]);
  const MUST_CLEAR = ["dungeon-run-rewards.js", "app-render-state.js", "hall-party-actions.js",
    "extra-unlock-events.js", "store-migration-runs.js"];
  const raw = f => read(f);
  ok(MUST_CLEAR.every(f => /explore\s*=\s*null/.test(raw(f))),
    "C1 五处关键回大厅文件均显式清空 explore",
    MUST_CLEAR.filter(f => !/explore\s*=\s*null/.test(raw(f))));
  const HALL_ASSIGN = /(?:state|actionState)\.view\s*=\s*"hall"/;
  const hallFiles = HALL_FILES.filter(f => HALL_ASSIGN.test(raw(f)));
  const unknown = hallFiles.filter(f => !WHITELIST.has(f) && !/explore\s*=\s*null/.test(raw(f)));
  ok(unknown.length === 0, "C2 无「改 view=hall 却不清 explore / 不在白名单」的未知落点", unknown);
  ok(hallFiles.length >= 8, "C3 覆盖 >=8 个含回大厅落点的文件", hallFiles.length);

  console.log("=== D. 重绘接线：状态变化后面板确实重算 ===");
  const ad = src("app-dungeon-actions.js");
  ok(ad.includes("await DungeonSystem.retreat(actionState);\n        if (!isCurrent()) return false;\n        render();"),
    "D1 撤退动作在 DungeonSystem.retreat 后调用 render()");
  ok(/window\.render\?\.\(\);/.test(src("dungeon-run-rewards.js")),
    "D2 战败路径逻辑层切换 view 后显式重绘");
  {
    const { ctx } = build(true);
    const s = fresh(); ctx.state = s;
    const grey = disabledCount(panelHtml(ctx, s));
    s.explore = null; s.view = "hall";
    const free = disabledCount(panelHtml(ctx, s));
    ok(grey === 4 && free === 0, "D3 同一面板函数在副本态/大厅态分别渲染 4 灰 / 0 灰", { grey, free });
  }

  console.log(`\n通过 ${pass} / ${pass + fail}`);
  const EXPECT_REVERT = {
    reason: ["A1", "A2", "A3"], clear: ["B1", "B2", "B3", "B6"],
    hall: ["B1", "B2", "B3", "B6"], guard: ["A4"], panel: ["A2", "A3"], render: ["D1"],
  };
  if (REVERT) {
    const want = EXPECT_REVERT[REVERT] || [];
    const hit = want.filter(n => failed.some(f => f.startsWith(n)));
    const okRev = hit.length >= (["clear", "hall", "reason"].includes(REVERT) ? 2 : 1)
      && failed.every(f => want.some(n => f.startsWith(n)));
    console.log(`REVERT=${REVERT} 期望红=${want.join(",")} 实红=${failed.join(",")} ${okRev ? "REVERT_OK" : "REVERT_UNEXPECTED"}`);
    process.exit(okRev ? 0 : 1);
  }
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
