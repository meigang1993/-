const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SRC = name => path.join(__dirname, "../src/original", name);
const read = name => fs.readFileSync(SRC(name), "utf8");
const hpText = read("hp-value.js");
const burnText = read("bakar-fire-skills.js");
const statusText = read("enemy-status-effects.js");
const hooksText = read("enemy-damage-hooks.js");
const elranaText = read("elrana-healing-skills.js");
const cardsText = read("data-cards.js");
const manifestText = fs.readFileSync(path.join(__dirname, "publish-bundles.json"), "utf8");

function makeWindow() {
  const log = [];
  const win = {
    BattleLog: { add: (_s, text) => log.push(text) },
    log,
    GameRandom: { sample: options => options[0] || null },
    BattleReactionQueue: {
      directDamageAction: () => null,
      enqueue: () => false,
      flush() {},
    },
    BakarCoreSkills: { isBakar: () => false },
    CardUtils: { isKillCard: () => false },
    BattleStats: { heal() {}, damage() {} },
    EnemySkills: { clearHolyScar() {}, onHeal() {} },
    BertisGerlotSkills: { refreshArrogance() {} },
    ElranaFallenPhysicianSkinFX: { heal() {}, care() {}, regenerate() {} },
    EnemyDamageHooks: null,
  };
  return win;
}

function loadInto(win, texts) {
  const ctx = { window: win, Math, Number, Array, Object, String, JSON, Set, Map };
  for (const [name, text] of texts) {
    vm.runInNewContext(text, ctx, { filename: SRC(name) });
  }
  return win;
}

function unit(uid, hp, attack, extra = {}) {
  return Object.assign({
    uid, name: uid, side: "enemy", hp, maxHp: hp,
    stats: { attack }, tempAttack: 0, hand: [], statuses: [],
  }, extra);
}

function makeStatus(win) {
  return win.EnemyStatusEffects({
    alive: units => units.filter(u => u && u.hp > 0),
    markStatus: (u, status) => {
      u.statuses ||= [];
      if (!u.statuses.includes(status)) u.statuses.push(status);
    },
  });
}

function runNormal() {
  const win = makeWindow();
  loadInto(win, [
    ["hp-value.js", hpText],
    ["bakar-fire-skills.js", burnText],
    ["enemy-status-effects.js", statusText],
    ["elrana-healing-skills.js", elranaText],
  ]);
  const H = win.BattleHpValue;
  let passed = 0; let total = 0;
  const failures = [];
  const T = (name, ok, extra) => {
    total += 1;
    if (ok) passed += 1; else failures.push(`${name} ${JSON.stringify(extra || {})}`);
  };
  const stateOf = (...units) => ({ battle: { allies: [units[0]], enemies: units.slice(1) }, log: win.log });

  // A 燃烧：每张燃烧牌按施加时攻击力快照各算 30%
  {
    const src = unit("burn-src", 100, 10, { tempAttack: 5 });
    const victim = unit("burn-victim", 200, 1);
    const state = stateOf(victim, src);
    victim.hand = [
      { name: "蓄力", burning: true, burningSourceUid: src.uid, burningSourceAttack: 15 },
      { name: "闪", burning: true, burningSourceUid: src.uid, burningSourceAttack: 15 },
    ];
    const calls = [];
    win.BakarFireSkills.tickBurning(state, victim,
      (_s, _t, amount, label, source) => {
        calls.push({ amount, label, sourceUid: source?.uid });
        H.applyDamage(victim, amount);
      }, null);
    T("A1 两张燃烧牌按15攻击力各算5点合并为10点", calls.length === 1
      && calls[0].amount === 10 && victim.hp === 190, { calls, hp: victim.hp });
    T("A2 燃烧伤害归属施加者且载荷仍是燃烧技能", calls[0]?.sourceUid === src.uid
      && calls[0]?.label === "燃烧", calls[0]);
  }
  {
    const src = unit("burn-add-src", 100, 20);
    const victim = unit("burn-add-victim", 200, 1);
    const state = stateOf(victim, src);
    victim.hand = [{ name: "蓄力" }];
    win.BakarFireSkills.afterDamage(state, src, victim, { name: "火杀", burnCard: true }, 0);
    T("A3 施加燃烧时写入攻击力快照", victim.hand[0].burningSourceAttack === 20,
      victim.hand[0]);
    src.stats.attack = 100;
    const calls = [];
    win.BakarFireSkills.tickBurning(state, victim,
      (_s, _t, amount) => { calls.push(amount); }, null);
    T("A4 施加者攻击力后续变化不影响旧燃烧牌", calls[0] === 6, { calls });
  }
  {
    // 旧档燃烧牌没有快照：回退到施加者当前攻击力
    const src = unit("burn-legacy-src", 100, 10);
    const victim = unit("burn-legacy-victim", 200, 1);
    const state = stateOf(victim, src);
    victim.hand = [{ name: "蓄力", burning: true, burningSourceUid: src.uid }];
    const calls = [];
    win.BakarFireSkills.tickBurning(state, victim,
      (_s, _t, amount) => { calls.push(amount); }, null);
    T("A5 旧档燃烧牌按施加者当前攻击力30%兼容", calls[0] === 3, { calls });
  }
  {
    // 多施加者分组：各自按自己的攻击力结算
    const a = unit("burn-a", 100, 10);
    const b = unit("burn-b", 100, 30);
    const victim = unit("burn-mixed", 200, 1);
    const state = { battle: { allies: [victim], enemies: [a, b] }, log: win.log };
    victim.hand = [
      { name: "蓄力", burning: true, burningSourceUid: a.uid, burningSourceAttack: 10 },
      { name: "闪", burning: true, burningSourceUid: b.uid, burningSourceAttack: 30 },
    ];
    const calls = [];
    win.BakarFireSkills.tickBurning(state, victim,
      (_s, _t, amount, _l, source) => { calls.push({ amount, uid: source?.uid }); }, null);
    T("A6 多施加者燃烧分组各自30%（3+9）", calls.length === 2
      && calls.some(c => c.uid === a.uid && c.amount === 3)
      && calls.some(c => c.uid === b.uid && c.amount === 9), { calls });
  }

  // B 感电：每层按施加者攻击力快照 30%
  {
    const api = makeStatus(win);
    const src = unit("shock-src", 100, 10, { tempAttack: 5 });
    const victim = unit("shock-victim", 200, 1);
    const state = stateOf(victim, src);
    api.addShock(state, victim, 2, src);
    T("B1 施加者传参后每层感电保存攻击力快照", victim.shock === 2
      && victim.shockMarks?.length === 2
      && victim.shockMarks.every(m => m.attack === 15 && m.sourceUid === src.uid),
      { shock: victim.shock, marks: victim.shockMarks });
    src.stats.attack = 100; src.tempAttack = 0;
    T("B2 两层感电按快照各5点合计10点", api.shockDamage(state, victim, src) === 10,
      api.shockDamage(state, victim, src));
  }
  {
    const api = makeStatus(win);
    const a = unit("shock-a", 100, 10);
    const b = unit("shock-b", 100, 20);
    const victim = unit("shock-mixed", 200, 1);
    const state = { battle: { allies: [victim], enemies: [a, b] }, log: win.log };
    api.addShock(state, victim, 1, a);
    api.addShock(state, victim, 1, b);
    T("B3 不同施加者感电按各自30%合计9点", api.shockDamage(state, victim, a) === 9,
      { value: api.shockDamage(state, victim, a), marks: victim.shockMarks });
    T("B4 感电层数仍与标记数组一致", victim.shock === 2 && victim.shockMarks.length === 2,
      { shock: victim.shock });
  }
  {
    const api = makeStatus(win);
    const actor = unit("shock-actor", 100, 10);
    const victim = unit("shock-legacy", 200, 1, { shock: 2, statuses: ["感电"] });
    const state = stateOf(victim, actor);
    T("B5 旧档只有shock数字时按当前来源30%兼容为6点",
      api.shockDamage(state, victim, actor) === 6, api.shockDamage(state, victim, actor));
  }
  {
    // hooks 里感电伤害走 shockDamage，并把施加者传给 addShock
    const noop = () => {};
    const win2 = makeWindow();
    loadInto(win2, [
      ["hp-value.js", hpText],
      ["enemy-status-effects.js", statusText],
      ["enemy-damage-hooks.js", hooksText],
    ]);
    const api2 = win2.EnemyStatusEffects({
      alive: us => us.filter(u => u && u.hp > 0),
      markStatus: () => {},
    });
    const h = win2.EnemyDamageHooks({
      hasSkill: () => false, discardOne: () => null, status: api2,
      machine: { afterDamage: noop },
    });
    const src = unit("hook-src", 100, 10);
    const victim = unit("hook-victim", 200, 1, { shock: 0 });
    const st = stateOf(victim, src);
    const calls = [];
    const damage = (_s, _t, amount, label) => { calls.push({ amount, label }); };
    h.afterDamage(st, src, victim, { name: "杀", type: "slash", shock: true }, 5, damage, src);
    T("B6 雷杀造成伤害后把施加者传给addShock", victim.shock === 1
      && victim.shockMarks?.[0]?.sourceUid === src.uid, { shock: victim.shock, marks: victim.shockMarks });
    h.afterDamage(st, src, victim, { name: "杀", type: "slash" }, 5, damage, src);
    T("B7 下次受伤时感电按30%结算而非按层数1点", calls.length === 1
      && calls[0].amount === 3 && calls[0].label === "感电", { calls });
  }

  // C HP 浮点尾巴：20% 以下低血量恢复不再显示 49.000000...
  {
    const dirty = 96 * 0.2;
    T("C1 clean 收敛 IEEE754 尾巴", dirty !== 19.2 && H.clean(dirty) === 19.2,
      { dirty, clean: H.clean(dirty) });
    const tail = 245 - 196.00000000000003;
    T("C2 clean 把 48.99999999999999 收敛为 49", tail !== 49 && H.clean(tail) === 49,
      { tail, clean: H.clean(tail) });
    const low = { maxHp: 98, hp: 48.99999999999999 };
    const healed = H.healCap(low, 100);
    T("C3 低血量恢复量是干净整数49而非长小数", healed === 49 && String(healed) === "49",
      { healed, str: String(healed) });
    H.applyHeal(low, healed);
    T("C4 恢复后hp为整数且不带浮点尾巴", low.hp === 98 && String(low.hp) === "98",
      { hp: low.hp, str: String(low.hp) });
    const dmgUnit = { maxHp: 245, hp: 49.00000000000001 };
    H.applyDamage(dmgUnit, 19.2);
    T("C5 扣血写入也收敛浮点尾巴", dmgUnit.hp === 29.8, dmgUnit.hp);
    const dec = { maxHp: 96, hp: 19.200000000000003 };
    T("C6 合法两位小数属性不被抹掉", H.healCap(dec, 40.82) === 40.82
      && H.clean(40.82) === 40.82, { cap: H.healCap(dec, 40.82) });
  }
  {
    // 真实回春之手 heal()：低血量 + 浮点 hp，恢复量与战报数字都干净
    const api = win.ElranaHealingSkills({
      alive: us => us.filter(u => u && u.hp > 0),
      visible: u => (u?.hand || []).filter(c => !c._pendingDraw),
      red: () => false, stat: () => 0, line: () => {},
    });
    const victim = unit("heal-victim", 245, 1);
    victim.hp = 49.00000000000001;
    const floats = [];
    const st = { battle: { allies: [victim], enemies: [] }, log: win.log };
    const healed = api.heal(st, victim, 40.82, victim, "回春之手", {
      damage: () => {}, pushFloat: (_b, _uid, kind, value) => floats.push({ kind, value }),
      draw: () => [],
    });
    T("C7 真实恢复路径返回干净数值", healed === 40.82 && String(healed) === "40.82",
      { healed, str: String(healed) });
    T("C8 真实恢复后hp不带浮点尾巴", String(victim.hp) === "89.82",
      { hp: victim.hp, str: String(victim.hp) });
    T("C9 飘字数值不含长小数", floats.length === 1
      && !String(floats[0].value).includes("000000"), { floats });
  }

  // D 静态与装配护栏
  {
    T("D1 燃烧旧『每张1点』公式已移除", !burnText.includes("groups.set(uid, (groups.get(uid) || 0) + 1)"));
    T("D2 感电旧『按层数』伤害公式已移除", !hooksText.includes("damage(state, target, target.shock,"));
    T("D3 感电结算已走shockDamage", hooksText.includes("status.shockDamage?.(state, target, actor)"));
    T("D4 火杀/雷杀卡面文案已同步30%", cardsText.includes("每张“燃烧”牌按施加者攻击力30%")
      && cardsText.includes("每层“感电”按施加者攻击力30%"));
    T("D5 旧『失去1点生命值』文案清零", !cardsText.includes("失去1点生命值"));
    T("D6 恢复量计算已接入healCap", read("battle-card-specials.js").includes("BattleHpValue.healCap"));
    T("D7 hp-value 已登记到全部4个消费bundle",
      (manifestText.match(/"hp-value\.js"/g) || []).length === 4,
      (manifestText.match(/"hp-value\.js"/g) || []).length);
    const sharedText = fs.readFileSync(path.join(__dirname, "publish-bundle-shared.js"), "utf8");
    T("D8 共享依赖已登记hp-value", sharedText.includes('file: "hp-value.js"'));
  }

  // G 副作用扫描：所有恢复路径都把收敛后的数值写进 hp / 飘字 / 战报
  {
    const enemyText = read("enemy-skills.js");
    T("G1 再生之躯把收敛后的healed写回hp而非原始value",
      enemyText.includes("window.BattleHpValue.applyHeal(unit, healed)")
      && !enemyText.includes("window.BattleHpValue.applyHeal(unit, value)"), enemyText.match(/applyHeal\(unit, [^)]*\)/g));
    const allSrc = [
      "battle-card-specials.js", "elrana-healing-skills.js", "enemy-skills.js",
      "angelica-luka-skills.js", "hitwell-skills.js", "hoshino-kaiichi-skills.js",
      "nonoka-loki-skills.js", "witherer-relic-skills.js",
      "underwater-train-bite-skills.js",
    ].map(name => [name, read(name)]);
    const badFloat = allSrc.filter(([, text]) => /pushFloat\([^)]*,\s*"heal",\s*(amount|value|v)\b/.test(text)
      && !/const (amount|value|v)\b[^\n]*BattleHpValue\.(clean|healCap)/.test(text));
    T("G2 所有heal飘字都传收敛后的数值", badFloat.length === 0, badFloat.map(([n]) => n));
    const low = { maxHp: 245, hp: 49.00000000000001 };
    T("G3 20%临界低血量比例判定仍是干净数值",
      H.clean(low.hp) / H.clean(low.maxHp) === 0.2
      && String(H.clean(low.hp)) === "49", { hp: H.clean(low.hp), ratio: H.clean(low.hp) / 245 });
    const healed = H.healCap(low, 40.82);
    H.applyHeal(low, healed);
    T("G4 低血量恢复后战报/飘字数值不含长小数尾巴",
      !String(healed).includes("000000") && !String(low.hp).includes("000000")
      && low.hp === 89.82, { healed, hp: low.hp });
    const dmgText = read("battle-damage-utils.js");
    const hitText = read("battle-damage-hit.js");
    T("G5 伤害写入统一走applyDamage收敛",
      dmgText.includes("BattleHpValue.applyDamage") && hitText.includes("BattleHpValue.applyDamage"),
      { dmg: dmgText.includes("BattleHpValue.applyDamage"), hit: hitText.includes("BattleHpValue.applyDamage") });
    T("G6 燃烧/感电旧1点公式在源码层清零",
      !burnText.includes("groups.set(uid, (groups.get(uid) || 0) + 1)")
      && !hooksText.includes("damage(state, target, target.shock,"));
  }

  if (failures.length) {
    console.error(`FAIL ${passed}/${total}\n${failures.join("\n")}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS ${passed}/${total} 燃烧/感电30% + HP浮点严格检查`);
  }
}

function runRevert(kind) {
  if (kind === "burn") {
    const tampered = burnText.replace("const RATE = 0.3;", "const RATE = 0;");
    assert.notStrictEqual(tampered, burnText, "REVERT=burn 必须真的改到倍率");
    const win = makeWindow();
    loadInto(win, [["hp-value.js", hpText], ["bakar-fire-skills.js", tampered]]);
    const src = unit("src", 100, 10);
    const victim = unit("victim", 200, 1);
    const state = { battle: { allies: [victim], enemies: [src] }, log: win.log };
    victim.hand = [
      { name: "蓄力", burning: true, burningSourceUid: src.uid, burningSourceAttack: 15 },
      { name: "闪", burning: true, burningSourceUid: src.uid, burningSourceAttack: 15 },
    ];
    const calls = [];
    win.BakarFireSkills.tickBurning(state, victim,
      (_s, _t, amount) => calls.push(amount), null);
    assert.strictEqual(calls[0], 2, "REVERT=burn 应退回两张共2点");
    console.log("REVERT_OK burn: 撤掉30%后两张燃烧牌回到 2 点（正式为10点）");
  } else if (kind === "shock") {
    const tampered = statusText.replace("const RATE = 0.3;", "const RATE = 0;");
    assert.notStrictEqual(tampered, statusText, "REVERT=shock 必须真的改到倍率");
    const win = makeWindow();
    loadInto(win, [["hp-value.js", hpText], ["enemy-status-effects.js", tampered]]);
    const api = makeStatus(win);
    const src = unit("src", 100, 10);
    const victim = unit("victim", 200, 1);
    const state = { battle: { allies: [victim], enemies: [src] }, log: win.log };
    api.addShock(state, victim, 2, src);
    assert.strictEqual(api.shockDamage(state, victim, src), 2,
      "REVERT=shock 应退回两层共2点");
    console.log("REVERT_OK shock: 撤掉30%后两层感电回到 2 点（正式为6点）");
  } else if (kind === "healUse") {
    const enemyText = read("enemy-skills.js");
    const tampered = enemyText.replace(
      "window.BattleHpValue.applyHeal(unit, healed)",
      "window.BattleHpValue.applyHeal(unit, value)");
    assert.notStrictEqual(tampered, enemyText, "REVERT=healUse 必须真的改到回血写入");
    const g1 = tampered.includes("window.BattleHpValue.applyHeal(unit, healed)")
      && !tampered.includes("window.BattleHpValue.applyHeal(unit, value)");
    assert.strictEqual(g1, false, "REVERT=healUse 应让 G1 静态护栏变红");
    console.log("REVERT_OK healUse: 改回原始value后 G1 护栏精准报红");
  } else if (kind === "hp") {
    const tampered = hpText.replace("return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;",
      "return Number.isFinite(n) ? n : 0;");
    assert.notStrictEqual(tampered, hpText, "REVERT=hp 必须真的改到清洁逻辑");
    const win = makeWindow();
    loadInto(win, [["hp-value.js", tampered]]);
    const low = { maxHp: 98, hp: 48.99999999999999 };
    const healed = win.BattleHpValue.healCap(low, 100);
    assert.notStrictEqual(String(healed), "49", "REVERT=hp 应重新出现浮点长小数");
    console.log(`REVERT_OK hp: 撤掉clean后恢复量回到 ${healed}（正式为49）`);
  } else {
    throw new Error(`unknown REVERT=${kind}`);
  }
}

if (process.env.REVERT) runRevert(process.env.REVERT);
else runNormal();
