// 复查 208 版三项更新：燃烧/感电 30%、毒标记 30%、HP 浮点收敛。
// 同时覆盖文案同步、旧档降级、装配护栏与夹具修复，带源码级反向验证。
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const SRC = n => fs.readFileSync(path.join(ROOT, "src/original", n), "utf8");
const TOOL = n => fs.readFileSync(path.join(__dirname, n), "utf8");
const BUNDLE = n => fs.readFileSync(path.join(ROOT, "publish/bundles", n), "utf8");
const texts = {
  burn: SRC("bakar-fire-skills.js"),
  status: SRC("enemy-status-effects.js"),
  hp: SRC("hp-value.js"),
  hooks: SRC("enemy-damage-hooks.js"),
  elrana: SRC("elrana-healing-skills.js"),
  cards: SRC("data-cards.js"),
  extra: SRC("data-characters-extra.js"),
  enemies: SRC("data-machine-factory-enemies.js"),
  ui: SRC("ui-battle-units.js"),
  specials: SRC("battle-card-specials.js"),
  nodeRewards: SRC("dungeon-node-rewards.js"),
  runRewards: SRC("dungeon-run-rewards.js"),
  manifest: TOOL("publish-bundles.json"),
  shared: TOOL("publish-bundle-shared.js"),
  registry: TOOL("test-skill-once-per-turn-registry.js"),
  contract: TOOL("skill-audit-presentation-contract-tests.js"),
  builder: TOOL("build-publish-bundles.js"),
  version: TOOL("publish-build-version.js"),
};

function makeWindow() {
  const log = [];
  return {
    BattleLog: { add: (_s, text) => log.push(text) },
    log,
    GameRandom: { sample: options => options[0] || null },
    BattleReactionQueue: {
      directDamageAction: () => null, enqueue: () => false, flush() {},
    },
    BakarCoreSkills: { isBakar: () => false },
    CardUtils: { isKillCard: () => false },
    BattleStats: { heal() {}, damage() {} },
    EnemySkills: { clearHolyScar() {}, onHeal() {} },
    ElranaFallenPhysicianSkinFX: { heal() {}, care() {}, regenerate() {} },
  };
}
function loadInto(win, names, override = texts) {
  const ctx = { window: win, Math, Number, Array, Object, String, JSON, Set, Map };
  for (const name of names) vm.runInNewContext(override[name], ctx, { filename: name });
  return win;
}
function unit(uid, hp, attack, extra = {}) {
  return Object.assign({
    uid, name: uid, side: "enemy", hp, maxHp: hp,
    stats: { attack }, tempAttack: 0, hand: [], statuses: [],
  }, extra);
}
function statusApi(win) {
  return win.EnemyStatusEffects({
    alive: us => us.filter(u => u && u.hp > 0),
    markStatus: (u, s) => {
      u.statuses ||= [];
      if (!u.statuses.includes(s)) u.statuses.push(s);
    },
  });
}
const stateOf = (win, ...us) => ({
  battle: { allies: [us[0]], enemies: us.slice(1) }, log: win.log,
});

function runNormal() {
  let passed = 0; let total = 0;
  const failures = [];
  const T = (name, ok, extra) => {
    total += 1;
    if (ok) passed += 1; else failures.push(`${name} ${JSON.stringify(extra || {})}`);
  };
  const win = loadInto(makeWindow(), ["hp", "burn", "status", "elrana"]);
  const H = win.BattleHpValue;
  const api = statusApi(win);

  // ── A 文案：燃烧/感电/毒的 30% 口径是否全部落地 ──
  {
    const rate = "施加者攻击力30%";
    T("A1 毒杀/雷杀/火杀卡面均写明30%与至少1点",
      (texts.cards.match(/施加者攻击力30%/g) || []).length >= 3
      && (texts.cards.match(/至少1点/g) || []).length >= 3);
    T("A2 毒针技能文案写明30%", texts.extra.includes("每枚“毒”标记造成施加者攻击力30%"));
    T("A3 两个毒系精英描述写明30%",
      (texts.enemies.match(/每枚.{0,6}毒标记.{0,6}施加者攻击力30%|每枚按施加者攻击力30%/g) || []).length >= 2);
    T("A4 毒/感电/燃烧悬浮提示均写明30%",
      (texts.ui.match(/施加者攻击力30%/g) || []).length >= 3);
    T("A5 旧「失去1点生命值」/「每张1点」口径全库清零",
      !/失去1点生命值|每张“燃烧”牌造成1点|每层“感电”.{0,6}1点/.test(
        texts.cards + texts.extra + texts.enemies + texts.ui));
    T("A6 时机描述与实现一致（燃烧准备阶段/感电每次受伤/毒回合开始）",
      texts.cards.includes("每个准备阶段") && texts.cards.includes("每次受到伤害时")
      && texts.cards.includes("回合开始时"));
    const bundles = ["startup.min.js", "hall.min.js", "battle-rules.min.js",
      "battle-skills.min.js", "battle-ui.min.js"].map(BUNDLE).join("\n");
    T("A7 bundle 内 30% 文案已同步（非仅源码）",
      (bundles.match(/施加者攻击力30%/g) || []).length >= 3
      && bundles.includes("每层“感电”按施加者攻击力30%"));
    T("A8 历史公告归档不强行改写（保留原文）",
      !/施加者攻击力30%/.test(SRC("update-notice-archive.js")));
  }

  // ── B 燃烧：30% 快照 / 旧档降级 / 不被二次放大 ──
  {
    const src = unit("burn-src", 100, 9.6);
    const victim = unit("burn-victim", 200, 1);
    const st = stateOf(win, victim, src);
    victim.hand = [
      { name: "杀", burning: true, burningSourceUid: src.uid, burningSourceAttack: 9.6 },
      { name: "闪", burning: true, burningSourceUid: src.uid, burningSourceAttack: 9.6 },
    ];
    const calls = [];
    win.BakarFireSkills.tickBurning(st, victim, (_s, _t, a) => calls.push(a), null);
    T("B1 小数攻击力9.6两张燃烧各3点合计6点", calls.length === 1 && calls[0] === 6, calls);
    src.stats.attack = 100;
    const later = [];
    win.BakarFireSkills.tickBurning(st, victim, (_s, _t, a) => later.push(a), null);
    T("B2 快照不受施加者后续攻击力变化影响", later[0] === 6, later);
  }
  {
    const a = unit("burn-a", 100, 10); const b = unit("burn-b", 100, 30);
    const v = unit("burn-mixed", 200, 1);
    const st = { battle: { allies: [v], enemies: [a, b] }, log: win.log };
    v.hand = [
      { name: "杀", burning: true, burningSourceUid: a.uid, burningSourceAttack: 10 },
      { name: "闪", burning: true, burningSourceUid: b.uid, burningSourceAttack: 30 },
    ];
    const calls = [];
    win.BakarFireSkills.tickBurning(st, v,
      (_s, _t, amount, _l, source, _zero, payload) => calls.push({ amount, uid: source?.uid, payload }), null);
    T("B3 多施加者燃烧分组各算30%（3+9）",
      calls.length === 2 && calls.some(c => c.uid === a.uid && c.amount === 3)
      && calls.some(c => c.uid === b.uid && c.amount === 9), calls.map(c => [c.uid, c.amount]));
    T("B4 燃烧tick带skipDamageModify，不被火伤翻倍二次放大",
      calls.every(c => c.payload?.skipDamageModify === true));
  }
  {
    // 修复点：旧档燃烧牌无施加者时不得按目标自己攻击力算 30%
    const v = unit("burn-legacy", 200, 30, { hand: [{ name: "杀", burning: true }] });
    const st = stateOf(win, v);
    const calls = [];
    win.BakarFireSkills.tickBurning(st, v, (_s, _t, a) => calls.push(a), null);
    T("B5 旧档燃烧无施加者时按0攻击力兜底为1点（不按目标攻30）",
      calls.length === 1 && calls[0] === 1, calls);
    const zero = unit("burn-zero", 200, 0);
    const st2 = stateOf(win, zero, unit("burn-zero-src", 100, 0));
    zero.hand = [{ name: "杀", burning: true, burningSourceUid: "burn-zero-src", burningSourceAttack: 0 }];
    const c2 = [];
    win.BakarFireSkills.tickBurning(st2, zero, (_s, _t, a) => c2.push(a), null);
    T("B6 0攻击力仍至少1点且不产生0/负伤害", c2[0] === 1, c2);
  }

  // ── C 感电：30% 快照 / 旧档 / 连锁防护 ──
  {
    const src = unit("shock-src", 100, 9.6);
    const v = unit("shock-victim", 200, 1);
    const st = stateOf(win, v, src);
    api.addShock(st, v, 2, src);
    T("C1 小数攻击力9.6两层感电各3点合计6点", api.shockDamage(st, v, src) === 6,
      api.shockDamage(st, v, src));
    src.stats.attack = 100;
    T("C2 快照不受后续攻击力变化影响", api.shockDamage(st, v, src) === 6);
    T("C3 感电层数与标记数组一致", v.shock === 2 && v.shockMarks.length === 2);
  }
  {
    const v = unit("shock-legacy", 200, 1, { shock: 2, statuses: ["感电"] });
    const actor = unit("shock-actor", 100, 10);
    const st = stateOf(win, v, actor);
    T("C4 旧档只有shock数字时按本次伤害来源30%兼容为6点",
      api.shockDamage(st, v, actor) === 6, api.shockDamage(st, v, actor));
    const none = unit("shock-none", 200, 1);
    T("C5 0层感电不结算", api.shockDamage(stateOf(win, none, actor), none, actor) === 0);
  }
  T("C6 感电伤害带shockBonus防同链连锁", /!card\?\.shockBonus/.test(texts.hooks)
    && /shockBonus:\s*true/.test(texts.hooks));
  T("C7 感电伤害带skipDamageModify不被二次修饰", /skipDamageModify:\s*true/.test(texts.hooks));

  // ── D 毒：30% 快照 / 旧档降级 / 归属 ──
  {
    const src = unit("poison-src", 100, 10, { tempAttack: 5 });
    const v = unit("poison-victim", 200, 1);
    const st = stateOf(win, v, src);
    api.addPoison(st, v, 2, src);
    const calls = [];
    api.tickPoison(st, v, (_s, _t, a, label, source, payload) =>
      calls.push({ a, label, uid: source?.uid, payload }));
    T("D1 两层毒按15攻击力各5点合计10点",
      calls.length === 1 && calls[0].a === 10, calls);
    T("D2 毒伤害归属首位施加者且载荷防再叠毒",
      calls[0].uid === src.uid && calls[0].payload?.poisonTick === true);
    T("D3 毒tick带skipDamageModify", calls[0].payload?.skipDamageModify === true);
  }
  {
    // 修复点：旧档毒标记缺失施加者时不得按目标自己攻击力算 30%
    const v = unit("poison-legacy", 200, 30, { poison: 2, statuses: ["毒"] });
    const st = stateOf(win, v);
    const calls = [];
    api.tickPoison(st, v, (_s, _t, a) => calls.push(a));
    T("D4 旧档毒无施加者时每枚兜底1点合计2点（不按目标攻30变18）",
      calls.length === 1 && calls[0] === 2, calls);
  }
  {
    const a = unit("poison-a", 100, 10); const b = unit("poison-b", 100, 20);
    const v = unit("poison-mixed", 200, 1);
    const st = { battle: { allies: [v], enemies: [a, b] }, log: win.log };
    api.addPoison(st, v, 1, a);
    api.addPoison(st, v, 1, b);
    const calls = [];
    api.tickPoison(st, v, (_s, _t, amount) => calls.push(amount));
    T("D5 不同施加者毒标记各自30%合计9点",
      calls.length === 2 && calls.reduce((s, a) => s + a, 0) === 9, calls);
  }

  // ── E 恢复生命值复查：浮点尾巴 / 20%临界 / 全路径 ──
  {
    T("E1 clean 收敛 IEEE754 尾巴", H.clean(245 - 196.00000000000003) === 49);
    const low = { maxHp: 98, hp: 48.99999999999999 };
    const healed = H.healCap(low, 100);
    T("E2 20%以下低血量恢复量是干净整数49", healed === 49 && String(healed) === "49",
      { healed, str: String(healed) });
    H.applyHeal(low, healed);
    T("E3 恢复后hp为整数98", low.hp === 98 && String(low.hp) === "98");
    const dec = { maxHp: 96, hp: 19.200000000000003 };
    T("E4 合法两位小数属性不被抹掉", H.healCap(dec, 40.82) === 40.82);
    const capped = { maxHp: 100, hp: 95 };
    H.applyHeal(capped, 40);
    T("E5 恢复封顶maxHp且不溢出", capped.hp === 100);
    const hurt = { maxHp: 245, hp: 49.00000000000001 };
    H.applyDamage(hurt, 19.2);
    T("E6 扣血写入也收敛浮点尾巴", hurt.hp === 29.8, hurt.hp);
    T("E7 非法输入不崩（NaN/Inf/字符串）", H.clean(NaN) === 0 && H.clean(Infinity) === 0
      && H.clean("12.3456") === 12.35 && H.healCap({ maxHp: 100, hp: 50 }, -5) === 0);
  }
  {
    // 真实回春之手：飘字与战报数字干净
    const w2 = loadInto(makeWindow(), ["hp", "elrana"]);
    const healApi = w2.ElranaHealingSkills({
      alive: us => us.filter(u => u && u.hp > 0),
      visible: u => (u?.hand || []).filter(c => !c._pendingDraw),
      red: () => false, stat: () => 0, line: () => {},
    });
    const v = unit("heal-victim", 245, 1);
    v.hp = 49.00000000000001;
    const floats = [];
    const st = { battle: { allies: [v], enemies: [] }, log: w2.log };
    const healed = healApi.heal(st, v, 40.82, v, "回春之手", {
      damage: () => {}, pushFloat: (_b, _uid, kind, value) => floats.push({ kind, value }),
      draw: () => [],
    });
    T("E8 真实恢复路径返回干净数值", healed === 40.82 && String(healed) === "40.82");
    T("E9 恢复后hp与飘字均不含长小数",
      String(v.hp) === "89.82" && floats.length === 1
      && !String(floats[0].value).includes("000000"), { hp: v.hp, floats });
  }
  {
    // 副作用扫描：战斗内恢复/扣血写入全部经 BattleHpValue
    const all = [texts.specials, texts.elrana, SRC("enemy-skills.js"),
      SRC("hitwell-skills.js"), SRC("hoshino-kaiichi-skills.js"),
      SRC("nonoka-loki-skills.js"), SRC("battle-damage-hit.js"),
      SRC("battle-damage-utils.js")].join("\n");
    T("E10 恢复量统一走healCap", texts.specials.includes("BattleHpValue.healCap"));
    T("E11 伤害写入统一走applyDamage",
      (all.match(/BattleHpValue\.applyDamage/g) || []).length >= 2);
    T("E12 再生之躯写回收敛值而非原始value",
      /applyHeal\(unit, healed\)/.test(SRC("enemy-skills.js")));
    T("E13 局外恢复用round/ceil收敛为整数，不产生长小数显示",
      /Math\.round/.test(texts.nodeRewards) && /Math\.ceil/.test(texts.runRewards));
    T("E14 20%临界比例判定仍是干净数值",
      H.clean(49.00000000000001) / H.clean(245) === 0.2);
  }

  // ── F 装配与夹具护栏（本轮修复项） ──
  {
    T("F1 hp-value 登记到全部4个消费bundle",
      (texts.manifest.match(/"hp-value\.js"/g) || []).length === 4);
    T("F2 技能审计角色计数已同步34/88",
      texts.contract.includes("length === 34") && texts.contract.includes("length === 88"));
    T("F3 登记表检测按文件名取消费方（不再硬编码索引0）",
      texts.registry.includes("shared.SHARED_SOURCES.find(entry => entry.file === registry)"));
    const fixtures = ["check-resistance-trigger.js", "pursue-kill-fixtures.js",
      "test-ai-ruins-cards.js", "test-ruins-card-effects.js",
      "test-ruins-cards-practical.js", "test-ruins-dragon-tailgun.js",
      "test-ruins-grunt-skills.js", "test-skill-audit.js",
      "test-status-card-judgement-popup.js"];
    const missing = fixtures.filter(f => {
      const t = TOOL(f);
      return !t.includes("gaianis-amulet-skills.js") || !t.includes("holy-eagle-sword-skills.js");
    });
    T("F4 9处夹具均已加载两个饰品模块", missing.length === 0, missing);
    T("F5 饰装模块登记为顺序依赖且早于消费方",
      texts.shared.includes('file: "gaianis-amulet-skills.js"')
      && texts.shared.includes('file: "holy-eagle-sword-skills.js"'));
    // 版本机制：改了 publish 资源并重建，护栏必须自动升版
    T("F6 版本护栏支持重建后自动升版",
      texts.builder.includes("bumpRepositoryVersion")
      && texts.version.includes("compareBuildVersions(current, previous) <= 0"));
  }

  if (failures.length) {
    console.error(`FAIL ${passed}/${total}\n${failures.join("\n")}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS ${passed}/${total} 燃烧/感电/毒30% + HP浮点 + 夹具护栏复查`);
  }
}

function runRevert(kind) {
  const patched = { ...texts };
  if (kind === "rate") {
    patched.burn = texts.burn.replace("const RATE = 0.3;", "const RATE = 0;");
    patched.status = texts.status.replace("const RATE = 0.3;", "const RATE = 0;");
    assert.notStrictEqual(patched.burn, texts.burn);
    const w = loadInto(makeWindow(), ["hp", "burn", "status"], patched);
    const src = unit("src", 100, 10); const v = unit("v", 200, 1);
    const st = stateOf(w, v, src);
    v.hand = [
      { name: "杀", burning: true, burningSourceUid: src.uid, burningSourceAttack: 10 },
      { name: "闪", burning: true, burningSourceUid: src.uid, burningSourceAttack: 10 },
    ];
    const calls = [];
    w.BakarFireSkills.tickBurning(st, v, (_s, _t, a) => calls.push(a), null);
    assert.strictEqual(calls[0], 2, "REVERT=rate 燃烧应退回两张共2点（正式6点）");
    const api = statusApi(w);
    api.addShock(st, v, 2, src);
    assert.strictEqual(api.shockDamage(st, v, src), 2,
      "REVERT=rate 感电应退回两层共2点（正式6点）");
    console.log("REVERT_OK rate: 30% 倍率撤掉后燃烧/感电均退回每层1点");
  } else if (kind === "hp") {
    patched.hp = texts.hp.replace("Number(n.toFixed(2))", "n");
    assert.notStrictEqual(patched.hp, texts.hp);
    const w = loadInto(makeWindow(), ["hp"], patched);
    const low = { maxHp: 98, hp: 48.99999999999999 };
    const healed = w.BattleHpValue.healCap(low, 100);
    assert.notStrictEqual(String(healed), "49", "REVERT=hp 应重新出现浮点长小数");
    console.log(`REVERT_OK hp: 撤掉clean后恢复量回到 ${healed}（正式49）`);
  } else if (kind === "fallbackBurn") {
    patched.burn = texts.burn.replace(
      "const sourceFor = uid => units.find(actor => actor.uid === uid) || null;",
      "const sourceFor = uid => units.find(actor => actor.uid === uid) || unit;");
    assert.notStrictEqual(patched.burn, texts.burn);
    const w = loadInto(makeWindow(), ["hp", "burn"], patched);
    const v = unit("v", 200, 30, { hand: [{ name: "杀", burning: true }] });
    const calls = [];
    w.BakarFireSkills.tickBurning(stateOf(w, v), v, (_s, _t, a) => calls.push(a), null);
    assert.strictEqual(calls[0], 9, "REVERT=fallbackBurn 旧档燃烧应回到按目标攻30的9点");
    console.log("REVERT_OK fallbackBurn: 回退到目标自己后旧档燃烧变9点（正式1点）");
  } else if (kind === "fallbackPoison") {
    patched.status = texts.status.replace("unit?.poisonSourceUid || null;",
      "unit?.poisonSourceUid || unit?.uid || null;");
    assert.notStrictEqual(patched.status, texts.status);
    const w = loadInto(makeWindow(), ["hp", "status"], patched);
    const api = statusApi(w);
    const v = unit("v", 200, 30, { poison: 2, statuses: ["毒"] });
    const calls = [];
    api.tickPoison(stateOf(w, v), v, (_s, _t, a) => calls.push(a));
    assert.strictEqual(calls[0], 18, "REVERT=fallbackPoison 旧档毒应回到18点");
    console.log("REVERT_OK fallbackPoison: 回退到目标自己后旧档毒变18点（正式2点）");
  } else if (kind === "fixture") {
    const brokenContract = patched.contract.replace("length === 34", "length === 33");
    const brokenRegistry = patched.registry.replace(
      "shared.SHARED_SOURCES.find(entry => entry.file === registry)",
      "shared.SHARED_SOURCES[0]");
    assert.notStrictEqual(brokenContract, patched.contract, "计数必须真被改到");
    assert.notStrictEqual(brokenRegistry, patched.registry, "索引必须真被改到");
    const f2 = brokenContract.includes("length === 34") && brokenContract.includes("length === 88");
    const f3 = brokenRegistry.includes("shared.SHARED_SOURCES.find(entry => entry.file === registry)");
    assert.strictEqual(f2, false, "REVERT=fixture 应让 F2 精准报红");
    assert.strictEqual(f3, false, "REVERT=fixture 应让 F3 精准报红");
    console.log("REVERT_OK fixture: 计数改回33 / 索引改回0 时 F2/F3 精准报红");
  } else {
    throw new Error(`unknown REVERT=${kind}`);
  }
}

if (process.env.REVERT) runRevert(process.env.REVERT);
else runNormal();
