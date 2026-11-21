// 【角色强化】严格复查：新口径「花 5000 只加一项属性、每项 70 次」的 BUG / 副作用排查。
// 与 test-character-enhance.js 独立实现，避免共用断言一起错。REVERT 为源码级反向验证。
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const REVERT = process.env.REVERT || "";
let pass = 0, total = 0;
const reds = [];
function T(name, cond, extra) {
  total += 1;
  if (cond) { pass += 1; return; }
  reds.push(name);
  if (REVERT) console.log(`  RED ${name}`, extra === undefined ? "" : JSON.stringify(extra));
}
function text(rel) {
  let s = fs.readFileSync(path.join(ROOT, rel), "utf8");
  const swap = (from, to) => {
    if (!s.includes(from)) throw new Error(`REVERT=${REVERT} must hit ${rel}: ${from.slice(0, 70)}`);
    s = s.replace(from, to);
  };
  if (REVERT === "single" && rel.endsWith("local-core-character.js")) {
    swap("const level = enhance.step(c, key);",
      "const level = (() => { const nx = enhance.levelsOf(c); enhance.statKeys.forEach(k => { nx[k] += 1; }); c.enhance = nx; delete c.enhanceLevel; return nx[key]; })();");
  }
  if (REVERT === "nostat" && rel.endsWith("local-core-character.js")) {
    swap("if (!enhance.statKeys.includes(key)) return outcomes.rejected;", "");
  }
  if (REVERT === "cap" && rel.endsWith("local-core-character.js")) {
    swap("if (levels[key] >= enhance.MAX_LEVEL) return outcomes.rejected;",
      "if (Object.values(levels).reduce((a, b) => a + b, 0) >= enhance.MAX_LEVEL) return outcomes.rejected;");
  }
  if (REVERT === "legacy" && rel.endsWith("character-enhance.js")) {
    swap("const legacy = hasNew ? 0 : cleanLevel(character?.enhanceLevel);", "const legacy = 0;");
  }
  if (REVERT === "apply" && rel.endsWith("server-core-apply.js")) {
    swap("c.enhance = window.CharacterEnhance?.normalize?.(next)\n          || { maxHp: 0, attack: 0, magic: 0, speed: 0 };\n        delete c.enhanceLevel;",
      "delete c.enhance; delete c.enhanceLevel;");
  }
  if (REVERT === "panel" && rel.endsWith("ui-info.js")) {
    swap('data-enhance-stat="${U.esc(key)}"', "");
  }
  if (REVERT === "guard" && rel.endsWith("hall-enhance-actions.js")) {
    swap('if (enhance?.blockedReason?.(actionState)\n    || actionState.explore || String(actionState.view || "").startsWith("dungeon")\n    || actionState.view === "battle") return false;', "");
  }
  if (REVERT === "compact" && rel.endsWith("store-compact.js")) {
    swap("hp:safeNumber(c.hp), enhance };", "hp:safeNumber(c.hp) };");
  }
  return s;
}
const src = f => text(`src/original/${f}`);

function freshCtx() {
  const ctx = vm.createContext({ console, window: {}, Date, Math, JSON, Object, Array, String, Number });
  ctx.window = ctx;
  return ctx;
}
const load = (ctx, f) => vm.runInContext(src(f), ctx, { filename: f });
const tpl = { id: "lokar", name: "罗卡尔", stats: { maxHp: 130, attack: 6, magic: 4, speed: 8 } };
const baseStats = { attack: 0, magic: 0, speed: 0, maxHp: 10, bloodlust: 1, handLimit: 0, drawPerTurn: 0, initialDraw: 2 };
const KEYS = ["maxHp", "attack", "magic", "speed"];
const BONUS = { maxHp: 3, attack: 1, magic: 1, speed: 1 };

function coreCtx() {
  const ctx = freshCtx();
  ctx.GameData = { characters: [tpl], baseDeck: [], eliteCards: [], protectedBaseDeck: [], initialShopCardNames: [] };
  ctx.GameRandom = { snapshot: () => ({}), sample: () => null, int: () => 0, create: () => ({}) };
  ctx.GameEconomy = { shop: { refreshCost: 500 }, relic: { smeltGold: 180 }, startingGold: 0 };
  ["character-progression.js", "character-enhance.js", "store-state-factory.js",
    "local-core-utils.js", "local-core-character.js", "local-core.js",
    "server-core-apply.js", "server-core.js", "store-compact.js"].forEach(f => load(ctx, f));
  ctx.GameStore = { baseStats: () => ({ ...baseStats }) };
  ctx.StoreRepairs = { cardKey: () => "", repairCard: c => c };
  load(ctx, "store-migration-characters.js");
  return ctx;
}
const E = coreCtx().CharacterEnhance;
const zero = () => ({ maxHp: 0, attack: 0, magic: 0, speed: 0 });
const pick = s => ({ maxHp: s.maxHp, attack: s.attack, magic: s.magic, speed: s.speed });
// 期望值纯手写，不调用被测模块。
function want(ctx, level, lv) {
  const base = { ...baseStats, ...ctx.CharacterProgression.statsAt(tpl, level) };
  return {
    maxHp: Math.round(base.maxHp + 3 * (lv.maxHp || 0)),
    attack: Math.round((base.attack + (lv.attack || 0)) * 100) / 100,
    magic: Math.round((base.magic + (lv.magic || 0)) * 100) / 100,
    speed: Math.round((base.speed + (lv.speed || 0)) * 100) / 100,
  };
}
function mkState(gold, enhance) {
  return {
    resources: { gold, essence: 0, relics: [] },
    chars: [{ id: "lokar", name: "罗卡尔", locked: false, level: 3, exp: 0, hp: 200, stats: {}, ...(enhance ? { enhance } : {}) }],
    random: {}, deck: [], shopCards: [], bounties: [], pendingBountyRewards: [],
    flags: {}, ownedSkins: {}, equippedSkins: {}, unlockedDifficulties: ["normal"],
    unlockedShopCards: [], defeatedElites: [], dungeonUnlocks: {}, view: "hall",
  };
}

(async () => {
  // ---------- A. 模块与数值 ----------
  T("A1 花费固定 5000", E.COST === 5000);
  T("A2 上限按项、四项独立", E.MAX_LEVEL === 70 && E.statKeys.length === 4);
  T("A3 单次加成表正确", KEYS.every(k => E.BONUS[k] === BONUS[k]));
  T("A4 levelsOf 对畸形入参不抛错",
    JSON.stringify(E.levelsOf({ enhance: null })) === JSON.stringify(zero())
    && JSON.stringify(E.levelsOf({ enhance: [] })) === JSON.stringify(zero()));
  T("A5 levelsOf 裁剪负数/超上限/字符串",
    JSON.stringify(E.levelsOf({ enhance: { maxHp: -1, attack: 1e9, magic: "4", speed: 2.9 } }))
      === JSON.stringify({ maxHp: 0, attack: E.MAX_LEVEL, magic: 4, speed: 2 }));
  T("A6 旧档 enhanceLevel=4 等价四项各 4 次",
    JSON.stringify(E.levelsOf({ enhanceLevel: 4 }))
      === JSON.stringify({ maxHp: 4, attack: 4, magic: 4, speed: 4 }));
  T("A7 新档存在时旧字段被忽略（不双算）",
    JSON.stringify(E.levelsOf({ enhance: { maxHp: 1, attack: 0, magic: 0, speed: 0 }, enhanceLevel: 8 }))
      === JSON.stringify({ maxHp: 1, attack: 0, magic: 0, speed: 0 }));
  T("A8 step 后旧字段被清除", (() => { const c = { enhanceLevel: 2 }; E.step(c, "magic"); return !("enhanceLevel" in c); })());
  const s0 = { maxHp: 100.42, attack: 6.5, magic: 4, speed: 8 };
  T("A9 withBonus 全部属性取整、只动目标项", (() => {
    const base = E.withBonus(s0, { enhance: { maxHp: 0, attack: 0, magic: 0, speed: 0 } });
    const r = E.withBonus(s0, { enhance: { maxHp: 0, attack: 1, magic: 0, speed: 0 } });
    return ["maxHp", "attack", "magic", "speed"].every(k => Number.isInteger(r[k]))
      && r.attack === base.attack + 1 && r.maxHp === base.maxHp
      && r.magic === base.magic && r.speed === base.speed;
  })());
  const two = { maxHp: 2, attack: 0, magic: 0, speed: 0 };
  T("A10 withBonus 同一基准重复调用结果一致（覆盖式重算）",
    JSON.stringify(E.withBonus({ ...s0 }, { enhance: two })) === JSON.stringify(E.withBonus(s0, { enhance: two }))
    && JSON.stringify(s0) === JSON.stringify({ maxHp: 100.42, attack: 6.5, magic: 4, speed: 8 }));

  // ---------- B. 真实链路：四项逐项强化、互不串 ----------
  const ctx = coreCtx();
  const st = mkState(100000);
  ctx.state = st;
  const seq = ["attack", "maxHp", "magic", "speed", "attack", "magic", "magic"];
  const lv = zero();
  let gold = 100000;
  let allGood = true;
  for (const key of seq) {
    const before = JSON.stringify(E.levelsOf(st.chars[0]));
    const r = await ctx.ServerCore.call("enhanceChar", { id: "lokar", stat: key }, st);
    lv[key] += 1; gold -= 5000;
    const after = E.levelsOf(st.chars[0]);
    if (!r.ok || JSON.stringify(after) !== JSON.stringify(lv)
      || st.resources.gold !== gold
      || JSON.stringify(pick(st.chars[0].stats)) !== JSON.stringify(want(ctx, 3, lv))) allGood = false;
  }
  T("B1 7 次逐项强化：每次只加指定项、金币与属性同步", allGood,
    { gold: st.resources.gold, levels: E.levelsOf(st.chars[0]), stats: pick(st.chars[0].stats), want: want(ctx, 3, lv) });
  T("B2 最终各项次数与操作序列一致",
    JSON.stringify(lv) === JSON.stringify({ maxHp: 1, attack: 2, magic: 3, speed: 1 }), lv);
  T("B3 结算后 state 上无旧字段", !("enhanceLevel" in st.chars[0]));
  T("B4 hp 跟随新上限", st.chars[0].hp === st.chars[0].stats.maxHp);
  const beforeRepeat = JSON.stringify(pick(st.chars[0].stats));
  ctx.ServerCore.apply(st, ctx.LocalCoreUtils.sanitize(st, "enhanceChar"), { method: "enhanceChar", args: { id: "lokar", stat: "attack" } });
  T("B5 同一 core 重复 apply 不重复叠加", JSON.stringify(pick(st.chars[0].stats)) === beforeRepeat);

  // ---------- C. 边界与守卫 ----------
  const rich = mkState(25000);
  const richLv = JSON.stringify(E.levelsOf(rich.chars[0]));
  T("C1 缺失 stat（余额充足）拒绝且不扣费",
    (await ctx.ServerCore.call("enhanceChar", { id: "lokar" }, rich)).ok === false
    && rich.resources.gold === 25000 && JSON.stringify(E.levelsOf(rich.chars[0])) === richLv);
  T("C2 伪造 stat（余额充足）拒绝且不扣费",
    (await ctx.ServerCore.call("enhanceChar", { id: "lokar", stat: "all" }, rich)).ok === false
    && rich.resources.gold === 25000 && JSON.stringify(E.levelsOf(rich.chars[0])) === richLv);
  T("C3 原型链键 __proto__ 拒绝且不污染",
    (await ctx.ServerCore.call("enhanceChar", { id: "lokar", stat: "__proto__" }, rich)).ok === false
    && rich.resources.gold === 25000);
  const exact = mkState(5000);
  T("C4 恰好 5000 可强化",
    (await ctx.ServerCore.call("enhanceChar", { id: "lokar", stat: "speed" }, exact)).ok === true
    && exact.resources.gold === 0);
  const poor = mkState(4999);
  T("C5 4999 不可强化且不扣费",
    (await ctx.ServerCore.call("enhanceChar", { id: "lokar", stat: "speed" }, poor)).ok === false
    && poor.resources.gold === 4999);
  const lockState = mkState(5000); lockState.chars[0].locked = true;
  T("C6 未解锁拒绝且不扣费",
    (await ctx.ServerCore.call("enhanceChar", { id: "lokar", stat: "speed" }, lockState)).ok === false
    && lockState.resources.gold === 5000);
  const capped = mkState(15000, { maxHp: E.MAX_LEVEL, attack: 0, magic: 0, speed: 0 });
  const cap1 = await ctx.ServerCore.call("enhanceChar", { id: "lokar", stat: "maxHp" }, capped);
  const cap2 = await ctx.ServerCore.call("enhanceChar", { id: "lokar", stat: "attack" }, capped);
  T("C7 该项满级拒绝", cap1.ok === false);
  T("C8 某项满级不影响其它项", cap2.ok === true && capped.resources.gold === 10000
    && E.levelOf(capped.chars[0], "attack") === 1 && E.levelOf(capped.chars[0], "maxHp") === E.MAX_LEVEL);
  T("C9 金币为负/NaN 一律拒绝不扣费",
    (await ctx.ServerCore.call("enhanceChar", { id: "lokar", stat: "magic" }, mkState(NaN))).ok === false);
  const hall = src("hall-enhance-actions.js");
  T("C10 动作层副本/战斗守卫位于 ServerCore 结算之前",
    hall.includes("blockedReason?.(actionState)")
    && hall.indexOf("blockedReason?.(actionState)") < hall.indexOf('ServerCore.call("enhanceChar"'));

  // ---------- D. 存档往返与旧档兼容 ----------
  const snap = ctx.GameStoreCompact.compactSaveData({
    chars: [{ id: "lokar", locked: false, level: 5, exp: 3, hp: 60,
      enhance: { maxHp: 2, attack: 1, magic: 0, speed: 4 } }],
    deck: [], shopCards: [], bounties: [], pendingBountyRewards: [], view: "hall",
  });
  T("D1 压缩存档保留四项", JSON.stringify(snap.chars[0].enhance)
    === JSON.stringify({ maxHp: 2, attack: 1, magic: 0, speed: 4 }), snap.chars[0]);
  const mig = ctx.StoreCharacterMigrations.migrateCharacter(tpl, snap.chars);
  T("D2 读档四项还原", JSON.stringify(E.levelsOf(mig))
    === JSON.stringify({ maxHp: 2, attack: 1, magic: 0, speed: 4 }));
  T("D3 读档属性按各项加成重算",
    JSON.stringify(pick(mig.stats)) === JSON.stringify(want(ctx, 5, { maxHp: 2, attack: 1, magic: 0, speed: 4 })));
  const snap2 = ctx.GameStoreCompact.compactSaveData({ chars: [mig], deck: [], shopCards: [], bounties: [], pendingBountyRewards: [], view: "hall" });
  T("D4 二次压缩幂等（不多加一次）", JSON.stringify(snap2.chars[0].enhance) === JSON.stringify(snap.chars[0].enhance));
  const oldSnap = ctx.GameStoreCompact.compactSaveData({
    chars: [{ id: "lokar", locked: false, level: 5, exp: 3, hp: 60, enhanceLevel: 3 }],
    deck: [], shopCards: [], bounties: [], pendingBountyRewards: [], view: "hall",
  });
  T("D5 旧档压缩时归一化成四项各 3 次",
    JSON.stringify(oldSnap.chars[0].enhance) === JSON.stringify({ maxHp: 3, attack: 3, magic: 3, speed: 3 }));
  const oldMig = ctx.StoreCharacterMigrations.migrateCharacter(tpl, oldSnap.chars);
  T("D6 旧档读档加成等效旧版（四项各 3 次）",
    JSON.stringify(pick(oldMig.stats)) === JSON.stringify(want(ctx, 5, { maxHp: 3, attack: 3, magic: 3, speed: 3 })));
  T("D7 旧档读档后不再残留 enhanceLevel", !("enhanceLevel" in oldSnap.chars[0]));
  const grantChar = { id: "lokar", level: 2, exp: 0, enhance: { maxHp: 1, attack: 0, magic: 2, speed: 0 }, stats: {} };
  ctx.CharacterProgression.grant(grantChar, 100000, tpl);
  T("D8 满级升级重算仍按各项保留",
    JSON.stringify(pick(grantChar.stats)) === JSON.stringify(want(ctx, ctx.CharacterProgression.maxLevel,
      { maxHp: 1, attack: 0, magic: 2, speed: 0 })));
  const sani = ctx.LocalCoreUtils.sanitize(mkState(5000, { maxHp: 1, attack: 2, magic: 0, speed: 0 }), "enhanceChar");
  T("D9 core 快照保留 enhance 且不重复叠加",
    JSON.stringify(E.levelsOf(sani.chars[0])) === JSON.stringify({ maxHp: 1, attack: 2, magic: 0, speed: 0 })
    && JSON.stringify(pick(sani.chars[0].stats)) === JSON.stringify(want(ctx, 3, { maxHp: 1, attack: 2, magic: 0, speed: 0 })));

  // ---------- E. 面板与接线 ----------
  const uiCtx = freshCtx();
  uiCtx.GameUIInfoMarks = () => ({ greenHatMark: "", foodMark: "", rageMark: "", tankShellMark: "", vulnerableMark: "", missionMark: "", idolSuitMark: "", karunaSuitMark: "", domeSuitMark: "", jokerSuitMark: "", artinaSuitMark: "", deathWaveSuitMark: "", mariaNumberMark: "", mariaBlessingMark: "" });
  uiCtx.CharacterEnhance = E;
  uiCtx.SkinSystem = { forChar: () => [], owned: () => false };
  uiCtx.GameData = { characters: [tpl], unlockHints: {} };
  uiCtx.RelicSystem = { statsOf: () => ({}) };
  const U = { esc: s => String(s ?? ""), face: () => "", formatStat: v => String(v), statHtml: () => "", skillsOf: () => [], skillName: () => "", skillText: () => "", combatRoleBadges: () => "", relicLabel: () => "" };
  load(uiCtx, "ui-info.js");
  const UI = uiCtx.GameUIInfo(U);
  const u = { id: "lokar", name: "罗卡尔", locked: false, level: 3, enhance: { maxHp: 2, attack: 0, magic: 1, speed: 0 }, stats: {} };
  uiCtx.state = { view: "hall", resources: { gold: 25000 }, chars: [u] };
  const html = UI.infoPanel(u, "enhance");
  T("E1 四个按钮各带自己的 stat", KEYS.every(k => html.includes(`data-enhance-stat="${k}"`)));
  T("E2 每个按钮都指向该角色 id", (html.match(/data-enhance-char="lokar"/g) || []).length === 4);
  T("E3 按钮与 stat 一一对应（无重复/错位）",
    KEYS.every(k => html.includes(`data-enhance-char="lokar" data-enhance-stat="${k}"`)));
  T("E4 累计显示按各项次数", html.includes("累计 +6") && html.includes("累计 +1") && html.includes("已强化 3 次"));
  T("E5 「立绘」页签确已删除", !html.includes('data-info-tab="specialArt"'));
  T("E6 文案写明选择一项", html.includes("选择一项属性"));
  uiCtx.state = { view: "hall", resources: { gold: 25000 }, chars: [{ ...u, enhance: { maxHp: E.MAX_LEVEL, attack: 0, magic: 0, speed: 0 } }] };
  const capHtml = UI.infoPanel({ ...u, enhance: { maxHp: E.MAX_LEVEL, attack: 0, magic: 0, speed: 0 } }, "enhance");
  T("E7 满级项单独置灰，其余三项可点",
    /data-enhance-stat="maxHp"[^>]*disabled/.test(capHtml)
    && (capHtml.match(/data-enhance-stat="(attack|magic|speed)"[^>]*disabled/g) || []).length === 0);
  T("E8 动作层透传 stat", src("app-modal-actions.js").includes("enhanceBtn.dataset.enhanceStat")
    && src("hall-enhance-actions.js").includes('"enhanceChar", { id, stat }'));
  T("E9 公告为新口径", src("update-notice-recent.js").includes("只提升玩家选择的一项属性"));
  T("E10 四列样式与按钮禁用态", text("publish/info-victory.css").includes("1fr .8fr 1.5fr 1.25fr")
    && text("publish/info-victory.css").includes(".enhance-action:disabled"));

  // ---------- F. 静态残留与装配 ----------
  // 只扫源码目录：publish/bundles 是构建产物，其中保留旧档兼容读取属正常。
  const scan = [];
  for (const f of fs.readdirSync(path.join(ROOT, "src/original"))) {
    const p = path.join(ROOT, "src/original", f);
    if (!fs.statSync(p).isFile() || !f.endsWith(".js")) continue;
    // 公告是变更说明文案，「旧 enhanceLevel 字段不再写回」属正常表述，不是运行时残留。
    if (fs.readFileSync(p, "utf8").includes("enhanceLevel")
      && !["character-enhance.js", "store-compact.js", "server-core-apply.js",
        "update-notice-recent.js"].includes(f)) scan.push(f);
  }
  T("F1 enhanceLevel 只出现在运行时兼容三处与公告说明文案", scan.length === 0, scan);
  T("F2 旧「一次加四项」文案已清零",
    !src("update-notice-recent.js").includes("永久提升四项核心属性")
    && !src("ui-info.js").includes("永久提升四项核心属性"));
  const manifest = JSON.parse(text("tools/publish-bundles.json"));
  T("F3 装配顺序：强化模块晚于成长表",
    manifest.startup.indexOf("character-enhance.js") > manifest.startup.indexOf("character-progression.js"));
  T("F4 动作模块登记在 hall", manifest.hall.includes("hall-enhance-actions.js"));
  const catalog = text("tools/qa-test-catalog.js");
  T("F5 关系校验与 QA 目录已登记三个强化测试",
    text("tools/validate-relations.js").includes('"character-enhance.js"')
    && catalog.includes('"test-character-enhance.js"')
    && catalog.includes('"test-character-enhance-recheck.js"')
    && catalog.includes('"test-character-enhance-live.js"'));
  T("F6 全部源码文件不超 180 行硬约束", (() => {
    let ok = true;
    for (const f of fs.readdirSync(path.join(ROOT, "src/original"))) {
      if (!f.endsWith(".js")) continue;
      if (fs.readFileSync(path.join(ROOT, "src/original", f), "utf8").split("\n").length > 180) ok = false;
    }
    return ok;
  })());

  console.log(`${pass}/${total}` + (reds.length ? `  REDS=${reds.length}` : ""));
  if (REVERT) console.log(`REVERT=${REVERT} REDS=${JSON.stringify(reds)}`);
  process.exit(pass === total ? 0 : 1);
})().catch(err => { console.error(err); process.exit(2); });
