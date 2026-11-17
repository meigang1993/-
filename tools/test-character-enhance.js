// 角色强化系统契约检查：面板 / 结算链路 / 属性幂等 / 存档往返 / 装配登记。
// 新口径：每次花 1000 莉莉丝元只提升玩家指定的一项属性（四项分别累计）。
// REVERT=cost|bonus|compact|ui|scope|grant|stat|cap|legacy 为源码级反向验证。
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
  if (REVERT === "cost" && rel.endsWith("character-enhance.js")) {
    swap("const COST = 1000;", "const COST = 1;");
  }
  if (REVERT === "bonus" && rel.endsWith("character-enhance.js")) {
    swap("const bonus = bonusOf(character);", "const bonus = { maxHp: 0, attack: 0, magic: 0, speed: 0 };");
  }
  if (REVERT === "compact" && rel.endsWith("store-compact.js")) {
    swap("hp:safeNumber(c.hp), enhance };", "hp:safeNumber(c.hp) };");
  }
  if (REVERT === "ui" && rel.endsWith("ui-info.js")) {
    swap('data-info-tab="enhance"', 'data-info-tab="enhance-off"');
  }
  if (REVERT === "scope" && rel.endsWith("local-core-utils.js")) {
    swap("enhanceChar: { resources: true, chars: true },", "enhanceChar: { resources: true },");
  }
  if (REVERT === "grant" && rel.endsWith("character-progression.js")) {
    swap("window.CharacterEnhance?.withBonus?.(statsAt(template, level), character)\n      || statsAt(template, level);", "statsAt(template, level);");
  }
  if (REVERT === "stat" && rel.endsWith("local-core-character.js")) {
    swap("if (!enhance.statKeys.includes(key)) return outcomes.rejected;", "");
  }
  if (REVERT === "cap" && rel.endsWith("local-core-character.js")) {
    swap("if (levels[key] >= enhance.MAX_LEVEL) return outcomes.rejected;",
      "if (Object.values(levels).reduce((a, b) => a + b, 0) >= enhance.MAX_LEVEL) return outcomes.rejected;");
  }
  if (REVERT === "legacy" && rel.endsWith("character-enhance.js")) {
    swap("const legacy = hasNew ? 0 : cleanLevel(character?.enhanceLevel);", "const legacy = 0;");
  }
  return s;
}
const src = file => text(`src/original/${file}`);

// ---------- A. 模块契约 ----------
function freshCtx() {
  const ctx = vm.createContext({ console, window: {}, Date, Math, JSON, Object, Array, String, Number });
  ctx.window = ctx;
  return ctx;
}
function load(ctx, file, code) {
  vm.runInContext(code === undefined ? src(file) : code, ctx, { filename: file });
}
const tpl = { id: "lokar", name: "罗卡尔", stats: { maxHp: 130, attack: 6, magic: 4, speed: 8 } };
const baseStats = { attack: 0, magic: 0, speed: 0, maxHp: 10, bloodlust: 1, handLimit: 0, drawPerTurn: 0, initialDraw: 2 };

function coreCtx() {
  const ctx = freshCtx();
  ctx.GameData = { characters: [tpl], baseDeck: [], eliteCards: [], protectedBaseDeck: [], initialShopCardNames: [] };
  ctx.GameRandom = { snapshot: () => ({}), sample: () => null, int: () => 0, create: () => ({}) };
  ctx.GameEconomy = { shop: { refreshCost: 500 }, relic: { smeltGold: 180 }, startingGold: 0 };
  load(ctx, "character-progression.js");
  load(ctx, "character-enhance.js");
  load(ctx, "store-state-factory.js");
  load(ctx, "local-core-utils.js");
  load(ctx, "local-core-character.js");
  load(ctx, "local-core.js");
  load(ctx, "server-core-apply.js");
  load(ctx, "server-core.js");
  load(ctx, "store-compact.js");
  ctx.GameStore = { baseStats: () => ({ ...baseStats }) };
  ctx.StoreRepairs = { cardKey: () => "", repairCard: c => c };
  load(ctx, "store-migration-characters.js");
  return ctx;
}
const E = coreCtx().CharacterEnhance;
T("A1 单次花费 1000 莉莉丝元", E.COST === 1000, { cost: E.COST });
T("A2 各项单次加成 生命+3 / 攻+1 / 魔+1 / 速+1",
  E.BONUS.maxHp === 3 && E.BONUS.attack === 1 && E.BONUS.magic === 1 && E.BONUS.speed === 1, E.BONUS);
T("A3 四项键位与成长表一致", JSON.stringify(E.statKeys) === JSON.stringify(["maxHp", "attack", "magic", "speed"]));
T("A4 各项独立计数", JSON.stringify(E.levelsOf({ enhance: { maxHp: 2, attack: 0, magic: 5, speed: 1 } }))
  === JSON.stringify({ maxHp: 2, attack: 0, magic: 5, speed: 1 }));
T("A5 计数边界：缺失/负数/NaN/字符串/超上限",
  JSON.stringify(E.levelsOf({ enhance: { maxHp: -2, attack: NaN, magic: "5", speed: 1e9 } }))
    === JSON.stringify({ maxHp: 0, attack: 0, magic: 5, speed: E.MAX_LEVEL }));
T("A6 旧档 enhanceLevel=3 还原为四项各 3 次（加成不缩水）",
  JSON.stringify(E.levelsOf({ enhanceLevel: 3 }))
    === JSON.stringify({ maxHp: 3, attack: 3, magic: 3, speed: 3 }));
T("A7 enhance 存在时旧字段不参与，避免双口径重复叠加",
  JSON.stringify(E.levelsOf({ enhance: { maxHp: 1, attack: 0, magic: 0, speed: 0 }, enhanceLevel: 9 }))
    === JSON.stringify({ maxHp: 1, attack: 0, magic: 0, speed: 0 }));
T("A8 totalOf 为各项之和", E.totalOf({ enhance: { maxHp: 2, attack: 1, magic: 0, speed: 3 } }) === 6);
T("A9 bonusOf 按各项次数分别乘", JSON.stringify(E.bonusOf({ enhance: { maxHp: 2, attack: 0, magic: 5, speed: 1 } }))
  === JSON.stringify({ maxHp: 6, attack: 0, magic: 5, speed: 1 }));
const st = { maxHp: 100.42, attack: 6.5, magic: 4, speed: 8 };
const once = E.withBonus(st, { enhance: { maxHp: 1, attack: 0, magic: 0, speed: 0 } });
T("A10 withBonus 只加被强化的那一项且输出整数", once.maxHp === 103 && once.attack === Math.round(st.attack)
  && once.magic === 4 && once.speed === 8
  && ["maxHp", "attack", "magic", "speed"].every(k => Number.isInteger(once[k])), once);
T("A11 withBonus 覆盖式重算不叠加、不污染入参",
  JSON.stringify(E.withBonus({ ...st }, { enhance: { maxHp: 1, attack: 0, magic: 0, speed: 0 } })) === JSON.stringify(once)
  && st.maxHp === 100.42 && st.attack === 6.5);

// ---------- B. 真实 ServerCore 结算链路 ----------
function makeState(gold) {
  return {
    resources: { gold, essence: 0, relics: [] },
    chars: [{ id: "lokar", name: "罗卡尔", locked: false, level: 3, exp: 0, hp: 200, stats: {} }],
    random: {}, deck: [], shopCards: [], bounties: [], pendingBountyRewards: [],
    flags: {}, ownedSkins: {}, equippedSkins: {}, unlockedDifficulties: ["normal"],
    unlockedShopCards: [], defeatedElites: [], dungeonUnlocks: {}, view: "hall",
  };
}
// 期望值按需求硬编码，不调用被测模块，否则反向验证会「两边一起错」而不报红。
function expectedStats(ctx, level, lv) {
  const base = { ...baseStats, ...ctx.CharacterProgression.statsAt(tpl, level) };
  return {
    maxHp: Math.round(base.maxHp + 3 * (lv.maxHp || 0)),
    attack: Math.round((base.attack + (lv.attack || 0)) * 100) / 100,
    magic: Math.round((base.magic + (lv.magic || 0)) * 100) / 100,
    speed: Math.round((base.speed + (lv.speed || 0)) * 100) / 100,
  };
}
const pick = s => ({ maxHp: s.maxHp, attack: s.attack, magic: s.magic, speed: s.speed });
(async () => {
  const ctx = coreCtx();
  const state = makeState(2500);
  ctx.state = state;
  const r1 = await ctx.ServerCore.call("enhanceChar", { id: "lokar", stat: "attack" }, state);
  const c = state.chars[0];
  T("B1 强化攻击力成功", r1.ok === true && r1.changed === true, r1);
  T("B2 扣费恰好 1000", state.resources.gold === 1500, { gold: state.resources.gold });
  T("B3 只写入攻击力次数，其余三项为 0",
    JSON.stringify(E.levelsOf(c)) === JSON.stringify({ maxHp: 0, attack: 1, magic: 0, speed: 0 }), E.levelsOf(c));
  T("B4 属性只有攻击力 +1，其余不变",
    JSON.stringify(pick(c.stats)) === JSON.stringify(expectedStats(ctx, 3, { attack: 1 })),
    { got: pick(c.stats), want: expectedStats(ctx, 3, { attack: 1 }) });
  T("B5 满血时 hp 提升到新上限", c.hp === c.stats.maxHp, { hp: c.hp, maxHp: c.stats.maxHp });
  T("B6 结算后旧字段已清除（双口径不并存）", !("enhanceLevel" in c));

  const r2 = await ctx.ServerCore.call("enhanceChar", { id: "lokar", stat: "maxHp" }, state);
  T("B7 再强化生命值成功且再扣 1000", r2.changed === true && state.resources.gold === 500);
  T("B8 两项分别累计、互不串",
    JSON.stringify(E.levelsOf(c)) === JSON.stringify({ maxHp: 1, attack: 1, magic: 0, speed: 0 }), E.levelsOf(c));
  T("B9 属性按两项各自加成重算",
    JSON.stringify(pick(c.stats)) === JSON.stringify(expectedStats(ctx, 3, { maxHp: 1, attack: 1 })),
    { got: pick(c.stats), want: expectedStats(ctx, 3, { maxHp: 1, attack: 1 }) });

  const before = JSON.stringify(E.levelsOf(c)), goldBefore = state.resources.gold;
  const r3 = await ctx.ServerCore.call("enhanceChar", { id: "lokar", stat: "speed" }, state);
  T("B10 余额不足拒绝且不扣费", r3.ok === false && state.resources.gold === goldBefore
    && JSON.stringify(E.levelsOf(c)) === before);
  // 属性键守卫必须在余额充足时单独验，否则只会命中余额守卫形成空转断言。
  const rich = makeState(5000);
  const richBefore = JSON.stringify(E.levelsOf(rich.chars[0]));
  T("B11 缺少属性键拒绝且不扣费（余额充足）",
    (await ctx.ServerCore.call("enhanceChar", { id: "lokar" }, rich)).ok === false
    && rich.resources.gold === 5000 && JSON.stringify(E.levelsOf(rich.chars[0])) === richBefore);
  T("B12 伪造属性键拒绝且不扣费（余额充足）",
    (await ctx.ServerCore.call("enhanceChar", { id: "lokar", stat: "all" }, rich)).ok === false
    && rich.resources.gold === 5000 && JSON.stringify(E.levelsOf(rich.chars[0])) === richBefore);
  T("B13 无效角色拒绝且不扣费（余额充足）",
    (await ctx.ServerCore.call("enhanceChar", { id: "nobody", stat: "magic" }, rich)).ok === false
    && rich.resources.gold === 5000);
  const locked = makeState(1000); locked.chars[0].locked = true;
  T("B14 未解锁角色拒绝且不扣费",
    (await ctx.ServerCore.call("enhanceChar", { id: "lokar", stat: "magic" }, locked)).ok === false
    && locked.resources.gold === 1000);
  const capped = makeState(2000);
  capped.chars[0].enhance = { maxHp: E.MAX_LEVEL, attack: 0, magic: 0, speed: 0 };
  const r6 = await ctx.ServerCore.call("enhanceChar", { id: "lokar", stat: "maxHp" }, capped);
  const goldAfterR6 = capped.resources.gold;
  const r7 = await ctx.ServerCore.call("enhanceChar", { id: "lokar", stat: "magic" }, capped);
  T("B15 该项满级拒绝且不扣费", r6.ok === false && goldAfterR6 === 2000);
  T("B16 某项满级不影响其它项继续强化", r7.ok === true && capped.resources.gold === 1000
    && E.levelOf(capped.chars[0], "magic") === 1);
  T("B17 操作作用域只含 resources/chars",
    JSON.stringify(ctx.LocalCoreUtils.operationScope("enhanceChar"))
      === JSON.stringify({ resources: true, chars: true }));
  T("B18 ServerCore 已注册 enhanceChar", src("server-core.js").includes('"enhanceChar"'));
  T("B19 失败文案明确", src("local-core.js").includes("属性参数无效"));

  // ---------- C. 升级 / 迁移 / 存档往返 ----------
  const lv2 = { maxHp: 2, attack: 1, magic: 0, speed: 3 };
  const grantChar = { id: "lokar", level: 3, exp: 0, enhance: { ...lv2 }, stats: {} };
  ctx.CharacterProgression.grant(grantChar, 100000, tpl);
  T("C1 升级重算仍按各项保留加成",
    JSON.stringify(pick(grantChar.stats)) === JSON.stringify(expectedStats(ctx, ctx.CharacterProgression.maxLevel, lv2)),
    { got: pick(grantChar.stats), want: expectedStats(ctx, ctx.CharacterProgression.maxLevel, lv2) });
  const prog = { id: "lokar", level: 4, exp: 5, enhance: { ...lv2 }, stats: {} };
  ctx.GameStoreStateFactory.applyProgression(prog, tpl);
  T("C2 applyProgression 重算保留加成",
    JSON.stringify(pick(prog.stats)) === JSON.stringify(expectedStats(ctx, 4, lv2)));
  const saved = ctx.GameStoreCompact.compactSaveData({
    chars: [{ id: "lokar", locked: false, level: 4, exp: 5, hp: 99, enhance: { ...lv2 } }],
    deck: [], shopCards: [], bounties: [], pendingBountyRewards: [], view: "hall",
  });
  T("C3 压缩存档保留四项强化次数",
    JSON.stringify(saved.chars[0].enhance) === JSON.stringify(lv2), saved.chars[0]);
  const migrated = ctx.StoreCharacterMigrations.migrateCharacter(tpl, saved.chars);
  T("C4 读档迁移保留四项次数", JSON.stringify(E.levelsOf(migrated)) === JSON.stringify(lv2));
  T("C5 读档迁移后属性含加成",
    JSON.stringify(pick(migrated.stats)) === JSON.stringify(expectedStats(ctx, 4, lv2)),
    { got: pick(migrated.stats), want: expectedStats(ctx, 4, lv2) });
  const legacySaved = ctx.GameStoreCompact.compactSaveData({
    chars: [{ id: "lokar", locked: false, level: 4, exp: 5, hp: 99, enhanceLevel: 3 }],
    deck: [], shopCards: [], bounties: [], pendingBountyRewards: [], view: "hall",
  });
  const legacyMigrated = ctx.StoreCharacterMigrations.migrateCharacter(tpl, legacySaved.chars);
  T("C6 旧档 enhanceLevel=3 读档后四项各 3 次、加成等效",
    JSON.stringify(E.levelsOf(legacyMigrated)) === JSON.stringify({ maxHp: 3, attack: 3, magic: 3, speed: 3 })
    && JSON.stringify(pick(legacyMigrated.stats))
      === JSON.stringify(expectedStats(ctx, 4, { maxHp: 3, attack: 3, magic: 3, speed: 3 })));
  const s2 = makeState(1000);
  s2.chars[0].enhance = { ...lv2 };
  s2.chars[0].stats = ctx.CharacterEnhance.withBonus(
    { ...baseStats, ...ctx.CharacterProgression.statsAt(tpl, 3) }, s2.chars[0]);
  const snap = ctx.LocalCoreUtils.sanitize(s2, "enhanceChar");
  T("C7 core 快照重算不重复叠加",
    JSON.stringify(pick(snap.chars[0].stats)) === JSON.stringify(expectedStats(ctx, 3, lv2)),
    { got: pick(snap.chars[0].stats), want: expectedStats(ctx, 3, lv2) });

  // ---------- D. 面板渲染 ----------
  const uiCtx = freshCtx();
  uiCtx.GameUIInfoMarks = () => ({
    greenHatMark: "", foodMark: "", rageMark: "", tankShellMark: "", vulnerableMark: "",
    missionMark: "", idolSuitMark: "", karunaSuitMark: "", domeSuitMark: "", jokerSuitMark: "",
    artinaSuitMark: "", deathWaveSuitMark: "", mariaNumberMark: "", mariaBlessingMark: "",
  });
  uiCtx.CharacterEnhance = E;
  uiCtx.SkinSystem = { forChar: () => [], owned: () => false };
  uiCtx.GameData = { characters: [tpl], unlockHints: {} };
  uiCtx.RelicSystem = { statsOf: () => ({}) };
  const U = {
    esc: s => String(s ?? ""), face: () => '<div class="face-ok"></div>',
    formatStat: v => String(v), statHtml: () => '<div class="stats-ok"></div>',
    skillsOf: () => [], skillName: () => "", skillText: () => "", combatRoleBadges: () => "",
    relicLabel: () => "",
  };
  load(uiCtx, "ui-info.js");
  const UI = uiCtx.GameUIInfo(U);
  const u = { id: "lokar", name: "罗卡尔", role: "输出", locked: false, level: 3,
    enhance: { maxHp: 1, attack: 0, magic: 0, speed: 0 }, stats: expectedStats(ctx, 3, { maxHp: 1 }) };
  uiCtx.state = { view: "hall", resources: { gold: 1200 }, chars: [u] };
  const html = UI.infoPanel(u, "enhance");
  T("D1 面板含角色强化页签", html.includes('data-info-tab="enhance"') && html.includes("角色强化"));
  T("D2 立绘页签已删除", !html.includes('data-info-tab="specialArt"') && !html.includes("达到等级后自动解锁"));
  T("D3 源码不再引用 specialArtPanel/Pane/Button",
    !["specialArtPanel", "specialArtPane", "specialArtButton"].some(k => src("ui-info.js").includes(k)));
  T("D4 四项各有一个带 stat 的强化按钮",
    E.statKeys.every(k => html.includes(`data-enhance-stat="${k}"`))
    && (html.match(/data-enhance-char="lokar"/g) || []).length === 4);
  T("D5 余额足够时四个按钮均可点",
    (html.match(/data-enhance-stat="[a-zA-Z]+"[^>]*disabled/g) || []).length === 0);
  T("D6 面板写明「选择一项」与四项加成",
    html.includes("选择一项属性") && html.includes("1000") && html.includes("生命值")
    && html.includes("攻击力") && html.includes("魔力") && html.includes("速度"));
  T("D7 右侧立绘回退为默认头像", html.includes("face-ok") && !html.includes("special-art-lock"));
  uiCtx.state = { view: "hall", resources: { gold: 999 }, chars: [u] };
  const poor = UI.infoPanel(u, "enhance");
  T("D8 余额不足四个按钮全置灰且提示",
    (poor.match(/data-enhance-stat="[a-zA-Z]+"[^>]*disabled/g) || []).length === 4
    && poor.includes("莉莉丝元不足"));
  uiCtx.state = { view: "battle", resources: { gold: 5000 }, chars: [u] };
  const inBattle = UI.infoPanel(u, "enhance");
  T("D9 战斗中禁止强化（不改动战斗快照）",
    (inBattle.match(/data-enhance-stat="[a-zA-Z]+"[^>]*disabled/g) || []).length === 4
    && inBattle.includes("战斗中不可强化"));
  const cappedU = { ...u, enhance: { maxHp: E.MAX_LEVEL, attack: 0, magic: 0, speed: 0 } };
  uiCtx.state = { view: "hall", resources: { gold: 5000 }, chars: [cappedU] };
  const cappedHtml = UI.infoPanel(cappedU, "enhance");
  T("D10 某项满级只置灰该项按钮",
    /data-enhance-stat="maxHp"[^>]*disabled/.test(cappedHtml)
    && (cappedHtml.match(/data-enhance-stat="(attack|magic|speed)"[^>]*disabled/g) || []).length === 0);
  const enemy = { ...u, side: "enemy", id: undefined, ref: "lokar" };
  T("D11 敌方单位无强化页签", !UI.infoPanel(enemy, "enhance").includes('data-info-tab="enhance"'));
  T("D12 动作层把 stat 透传给 ServerCore",
    src("app-modal-actions.js").includes("enhanceBtn.dataset.enhanceStat")
    && src("hall-enhance-actions.js").includes('{ id, stat }'));

  // ---------- E. 装配 / 公告 / 样式 ----------
  const manifest = JSON.parse(text("tools/publish-bundles.json"));
  T("E1 强化模块在 startup 且晚于成长表",
    manifest.startup.indexOf("character-enhance.js") > manifest.startup.indexOf("character-progression.js"));
  T("E2 强化动作登记在 hall", manifest.hall.includes("hall-enhance-actions.js"));
  T("E3 全局委托绑定强化按钮",
    src("app-modal-actions.js").includes("[data-enhance-char]")
    && src("hall-enhance-actions.js").includes('ServerCore.call("enhanceChar"'));
  T("E4 关系校验加载强化模块", text("tools/validate-relations.js").includes('"character-enhance.js"'));
  T("E5 公告写入强化系统与新口径",
    src("update-notice-recent.js").includes("【角色强化】系统")
    && src("update-notice-recent.js").includes("只提升玩家选择的一项属性")
    && src("update-notice-recent.js").includes("删除「立绘」页签"));
  T("E6 样式表含四列强化面板规则",
    text("publish/info-victory.css").includes(".enhance-action:disabled")
    && text("publish/info-victory.css").includes("button.enhance-tab")
    && text("publish/info-victory.css").includes("1fr .8fr 1.5fr 1.25fr"));
  T("E7 recent 行数不超 150、archive 不超 189",
    src("update-notice-recent.js").split("\n").length <= 150
    && src("update-notice-archive.js").split("\n").length <= 189,
    { recent: src("update-notice-recent.js").split("\n").length, archive: src("update-notice-archive.js").split("\n").length });

  console.log(`${pass}/${total}` + (reds.length ? `  REDS=${reds.length}` : ""));
  if (REVERT) console.log(`REVERT=${REVERT} REDS=${JSON.stringify(reds)}`);
  process.exit(pass === total ? 0 : 1);
})().catch(err => { console.error(err); process.exit(2); });
