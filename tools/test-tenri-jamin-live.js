// 【魔王军枪炮师杰明】实机矩阵：真实浏览器跑 trues 渲染 / 勾玉蓄力 UI /
// 数据表与掉落注册 / AI 决策 / 技能卡执行 / 特殊对话 / 存储牌 / 战地功勋。
// 复用 run-live-suite 的 boot 范式；不依赖 dev 服务，file:// 打开 publish/index.html。
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const URL = "file://" + path.join(ROOT, "publish/index.html");
const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok: !!ok, detail });

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await page.context().setOffline(true);
  await page.addInitScript(() => {
    try {
      Object.defineProperty(navigator, "onLine", { get: () => false, configurable: true });
    } catch (e) { /* navigator 不可重定义时忽略 */ }
  });
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.GameBundles && !!window.GameData,
    null, { timeout: 30000 });
  // battle-skills / battle-ai / hall 是按需加载，必须显式装配才有杰明模块与掉落系统。
  await page.evaluate(() => Promise.all([
    window.GameBundles.load("battle"),
    window.GameBundles.load("hall"),
  ]));
  await page.waitForFunction(() => !!window.TenriJaminSkills
    && !!window.TenriJaminChargeIcon && !!window.BountyRewards,
    null, { timeout: 30000 });
  await page.waitForTimeout(300);

  const boot = await page.evaluate(() => ({
    hasJamin: (window.GameData?.enemies?.tenri_institute || [])
      .some(e => e.id === "tenri_jamin" && e.type === "elite"),
    skills: (window.GameData?.enemies?.tenri_institute || [])
      .find(e => e.id === "tenri_jamin")?.skills.map(s => s.name) || [],
    cards: (window.GameData?.eliteCards || []).filter(c => ["嘲讽", "支援"].includes(c.name)).length,
    cardNames: [...new Set((window.GameData?.eliteUnlocks?.tenri_jamin || []))],
    relics: window.RelicSystem?.enemyRelics?.("tenri_jamin") || [],
    huntDrop: !!window.BountyRewards?.hasHuntDrop?.("tenri_jamin"),
    hasIcon: !!window.TenriJaminChargeIcon,
    hasSkills: !!window.TenriJaminSkills,
    icon0: window.TenriJaminChargeIcon?.badge?.(
      { ai: "tenri_jamin", skills: [{ name: "离子导弹" }], jaminCharge: 0 }, { esc: s => s }) || "",
    icon4: window.TenriJaminChargeIcon?.badge?.(
      { ai: "tenri_jamin", skills: [{ name: "离子导弹" }], jaminCharge: 4 }, { esc: s => s }) || "",
    iconOther: window.TenriJaminChargeIcon?.badge?.(
      { ai: "tenri_assault", skills: [{ name: "离子导弹" }] }, { esc: s => s }) || "",
  }));
  check("01 精英怪已入研究所池且三技能齐备",
    boot.hasJamin && JSON.stringify(boot.skills) === JSON.stringify(["潜能爆发", "离子导弹", "卫星射线"]),
    `skills=${boot.skills}`);
  check("02 两张掉落战术牌已展开进 eliteCards（8 花色实例）",
    boot.cards >= 8 && boot.cardNames.includes("嘲讽") && boot.cardNames.includes("支援"),
    `cards=${boot.cards} unlocks=${boot.cardNames}`);
  check("03 两饰品登记且讨伐任务 hasHuntDrop 命中",
    boot.relics.length === 2 && boot.huntDrop, `relics=${boot.relics}`);
  check("04 勾玉图标模块与聚合模块已装配", boot.hasIcon && boot.hasSkills);
  check("05 勾玉 0/4 置灰 disabled、显示 0/4 与 magatama",
    /jamin-charge-skill dim/.test(boot.icon0) && /disabled/.test(boot.icon0)
    && /0\/4/.test(boot.icon0) && /jamin-magatama/.test(boot.icon0));
  check("06 勾玉 4/4 点亮可点击、显示 4/4",
    /jamin-charge-skill ready/.test(boot.icon4) && !/disabled/.test(boot.icon4) && /4\/4/.test(boot.icon4));
  check("07 非杰明单位不渲染勾玉徽章", boot.iconOther === "");

  // 真实 vm 链路：蓄力 +1 / 满 4 不溢出 / 导弹自身不计 / 潜能爆发摸牌重置淫气
  const chain = await page.evaluate(() => {
    const S = window.TenriJaminSkills;
    const state = { battle: { allies: [], enemies: [], turn: 1, animQueue: [] }, log: [] };
    window.BattleLog = { add: (_s, t) => state.log.push(t) };
    window.BattleLines = { skill: () => {} };
    window.BattleCards = { syncStatusCards: () => {} };
    const actor = { ai: "tenri_jamin", id: "tenri_jamin", uid: "j1", side: "enemy",
      name: "魔王军枪炮师杰明", hp: 700, maxHp: 700, jaminCharge: 0, intent: 0,
      stats: { attack: 53, magic: 50, bloodlust: 1 }, hand: [],
      skills: [{ name: "离子导弹" }, { name: "潜能爆发" }] };
    const slash = { name: "杀（普攻）", type: "slash", suit: "♠" };
    const log0 = state.log.length;
    for (let i = 0; i < 6; i++) S.afterCardPlayed(state, actor, null, slash);
    const after6 = actor.jaminCharge;
    S.afterCardPlayed(state, actor, null, { name: "离子导弹", _jaminMissile: true,
      type: "skill" });
    return { after6, afterMissile: actor.jaminCharge, logGrowth: state.log.length - log0,
      U: !!window.CardUtils?.isKillCard };
  });
  check("08 真实 afterCardPlayed：连出 6 张杀蓄力封顶 4、不溢出",
    chain.after6 === 4, `charge=${chain.after6}`);
  check("09 离子导弹自身不重复累计蓄力", chain.afterMissile === 4 && chain.logGrowth === 4);

  // 潜能爆发：摸 X 张 + 淫气重置 + 同回合限一次
  const pot = await page.evaluate(() => {
    const S = window.TenriJaminSkills;
    let drawn = 0;
    const state = { battle: { allies: [], enemies: [], turn: 7 }, log: [] };
    window.BattleLog = { add: () => {} };
    window.BattleLines = { skill: () => {} };
    const actor = { ai: "tenri_jamin", id: "tenri_jamin", name: "杰明", hp: 700,
      intent: 0, stats: { bloodlust: 1 }, skills: [{ name: "潜能爆发" }],
      hand: [{ name: "杀（普攻）", type: "slash" }, { name: "雷杀", type: "slash" },
        { name: "闪", type: "response" }] };
    const api = { deps: { draw: (_u, n) => { drawn += n; } } };
    S.useSkillCard(state, actor, null, { jaminPotential: true }, api);
    const first = { drawn, intent: actor.intent };
    S.useSkillCard(state, actor, null, { jaminPotential: true }, api);
    return { first, drawnAfterSecond: drawn };
  });
  check("10 潜能爆发摸 X=2 张并重置淫气、同回合限一次",
    pot.first.drawn === 2 && pot.first.intent === 1 && pot.drawnAfterSecond === 2,
    JSON.stringify(pot));

  // 卫星射线：限定技 + 射线标记 + 死亡转移
  const ray = await page.evaluate(() => {
    const S = window.TenriJaminSkills;
    const state = { battle: { allies: [{ uid: "a1", side: "ally", hp: 100, name: "A",
      statuses: [], hand: [] }, { uid: "a2", side: "ally", hp: 80, name: "B", statuses: [], hand: [] }],
      enemies: [], turn: 1 }, log: [] };
    window.BattleLog = { add: (_s, t) => state.log.push(t) };
    window.BattleLines = { skill: () => {} };
    const actor = { ai: "tenri_jamin", id: "tenri_jamin", uid: "j1", side: "enemy",
      name: "杰明", stats: { attack: 53 }, hand: [], skills: [] };
    S.useSkillCard(state, actor, null, { jaminSatellite: true });
    const firstTarget = state.battle.allies.find(u => u.jaminRay)?.uid;
    S.useSkillCard(state, actor, null, { jaminSatellite: true });
    const markedCount = state.battle.allies.filter(u => u.jaminRay).length;
    state.battle.allies[0].hp = 0;
    S.transferRay(state, state.battle.allies[0]);
    return { firstTarget, markedCount, after: state.battle.allies.find(u => u.jaminRay)?.uid,
      used: !!actor.usedSatellite };
  });
  check("11 卫星射线首用标记最高血目标、限定技只一次",
    ray.firstTarget === "a1" && ray.markedCount === 1 && ray.used);
  check("12 射线目标死亡自动转移至另一名存活敌方", ray.after === "a2");

  // 火龙火箭筒：复用存储牌模块、release=manual、准备阶段弃置齐射
  const rocket = await page.evaluate(() => {
    const S = window.TenriJaminSkills;
    const state = { battle: { allies: [{ uid: "a1", side: "ally", hp: 100, name: "A", hand: [] }],
      enemies: [{ uid: "j1", side: "enemy", hp: 700, name: "杰明" }], turn: 3, animQueue: [] }, log: [] };
    window.BattleLog = { add: (_s, t) => state.log.push(t) };
    window.BattleLines = { skill: () => {} };
    window.BattleCards = { syncStatusCards: () => {}, putMany: () => {} };
    window.BattleCharacterCardStorage = window.BattleCharacterCardStorage || {};
    const holder = { uid: "a1", side: "ally", name: "A", stats: { attack: 20 },
      hand: [{ name: "杀（普攻）", type: "slash" }, { name: "雷杀", type: "slash" }],
      skills: [], hp: 100 };
    // 直接调 resolveRocket（模拟通用面板点「发动」）
    const storedBefore = window.BattleCharacterCardStorage?.count?.(holder) || 0;
    S.resolveRocket(state, holder);
    const storedAfter = window.BattleCharacterCardStorage?.count?.(holder) || 0;
    const handAfter = holder.hand.length;
    let dmg = [];
    const damage = { directDamage: (_s, t, amount) => dmg.push([t.uid, amount]) };
    S.prepare(state, holder, damage);
    return { storedBefore, storedAfter, handAfter, dmg,
      hasTake: typeof window.BattleCharacterCardStorage?.take,
      storedFinal: window.BattleCharacterCardStorage?.count?.(holder) || 0 };
  });
  check("13 火龙火箭筒把 2 张杀存进角色牌（复用存储模块）、离手",
    rocket.storedAfter === 2 && rocket.handAfter === 0 && rocket.hasTake === "function",
    JSON.stringify(rocket));
  check("14 下个准备阶段弃置存储牌并对敌方全体造成攻击力火伤",
    rocket.storedFinal === 0 && rocket.dmg.length === 1 && rocket.dmg[0][1] === 20,
    JSON.stringify(rocket));

  // 战地功勋：两次独立实体牌击杀叠加、对尸体重复结算不叠加、虚拟牌不触发
  const merit = await page.evaluate(() => {
    const S = window.TenriJaminSkills;
    const state = { battle: { allies: [], enemies: [] }, log: [] };
    window.BattleLog = { add: () => {} };
    window.RelicSystem = { hasEquipped: (_s, _u, n) => n === "战地功勋" };
    const actor = { uid: "a1", stats: { attack: 30, magic: 25 }, tempAttack: 0, tempMagic: 0 };
    const entity = { name: "杀（普攻）", type: "slash", virtual: false };
    const virtual = { name: "杀（普攻）", type: "slash", virtual: true };
    // 击杀 1：100 血被打掉 100 → hp 0；击杀 2：60 血被打掉 60 → hp 0
    const d1 = { hp: 0, name: "X1" }, d2 = { hp: 0, name: "X2" };
    S.afterDamage(state, actor, d1, entity, 100);
    const one = [actor.tempAttack, actor.tempMagic];
    S.afterDamage(state, actor, d2, entity, 60);
    const two = [actor.tempAttack, actor.tempMagic];
    // 多段伤害落在已死目标上：hp=-30、hpLoss=30 → 伤害前已非存活，不重复叠加
    d2.hp = -30;
    S.afterDamage(state, actor, d2, entity, 30);
    const afterRepeat = [actor.tempAttack, actor.tempMagic];
    const d3 = { hp: 0, name: "X3" };
    S.afterDamage(state, actor, d3, virtual, 50);
    return { one, two, afterRepeat, afterVirtual: [actor.tempAttack, actor.tempMagic] };
  });
  check("15 战地功勋两次实体牌击杀叠加 +100%、对尸体不重复、虚拟牌不触发",
    JSON.stringify(merit.one) === "[30,25]" && JSON.stringify(merit.two) === "[60,50]"
    && JSON.stringify(merit.afterRepeat) === "[60,50]"
    && JSON.stringify(merit.afterVirtual) === "[60,50]", JSON.stringify(merit));

  // AI 四级优先
  const ai = await page.evaluate(() => {
    const S = window.TenriJaminSkills;
    const foes = [{ uid: "a1", hp: 100, side: "ally" }, { uid: "a2", hp: 300, side: "ally" }];
    const hand = [{ name: "杀（普攻）", type: "slash" }, { name: "蓄力", charge: 1, type: "tactic" }];
    const canPlay = () => true;
    const ctx = { slashTarget: () => foes[0], slashScore: () => 1 };
    const state = { battle: { turn: 1 } };
    const mk = o => ({ ai: "tenri_jamin", id: "tenri_jamin", intent: 1, charge: 0, hand, ...o });
    const a1 = S.aiMove(state, mk({}), null, foes, hand, canPlay, ctx);
    const a2 = S.aiMove(state, mk({ usedSatellite: true, jaminCharge: 4 }), null, foes, hand, canPlay, ctx);
    const a3 = S.aiMove(state, mk({ usedSatellite: true, jaminCharge: 0, intent: 0 }), null, foes, hand, canPlay, ctx);
    const a4 = S.aiMove(state, mk({ usedSatellite: true, jaminCharge: 0, intent: 1 }), null, foes, hand, canPlay, ctx);
    return { a1: a1?.card?.name, a1Target: a1?.target?.uid,
      a2: a2?.card?.name, a3: a3?.card?.name, a4: a4?.card?.name };
  });
  check("16 AI 一级：首回合卫星射线指定最高血目标", ai.a1 === "卫星射线" && ai.a1Target === "a2", JSON.stringify(ai));
  check("17 AI 二级：蓄力满 4 立即离子导弹；三级：淫气耗尽先潜能爆发",
    ai.a2 === "离子导弹" && ai.a3 === "潜能爆发");
  check("18 AI 四级：常规优先蓄力后集中出杀", ai.a4 === "蓄力", JSON.stringify(ai));

  check("19 全程零 JS 错误", errors.length === 0, errors.slice(0, 2).join(" | "));
  await browser.close();
  const failed = results.filter(r => !r.ok);
  console.log(`魔王军枪炮师杰明 · 实机矩阵  通过 ${results.length - failed.length} / ${results.length}`);
  failed.forEach(r => console.log(`  ❌ ${r.name}${r.detail ? " — " + r.detail : ""}`));
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error("LIVE_FAIL", e); process.exit(1); });
