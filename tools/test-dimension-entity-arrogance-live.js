// 【次元转移】实体单体杀 / 【傲慢雌小鬼】2 倍 · 浏览器实机
// 真实打开 publish/index.html，注入战斗状态，验证提示条、真实点击与属性结算。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const idxHtml = fs.readFileSync(path.join(__dirname, "..", "publish", "index.html"), "utf8");
const stamps = [...new Set(idxHtml.match(/20260915-\d+/g) || [])];
const VERSION = stamps.length ? stamps[0].split("-").pop() : "";

let pass = 0, total = 0; const pageErrors = [];
const T = (name, ok, extra) => {
  total++; if (ok) pass++;
  console.log(`${ok ? "✅" : "❌"} ${name}` + (ok ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return !!ok;
};

const setup = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false; b.dimensionTransfer = null;
  b.selectedCardIndex = null; b.selectedSkillCard = null; b.pendingTargetUid = null;
  const victim = b.allies[0], manny = b.allies[1];
  victim.name = "受伤队友"; victim.hp = 100; victim.maxHp = 100;
  const src = (window.GameDataCharactersCore || []).find(x => x.id === "manny");
  manny.name = "曼妮"; manny.ref = "manny"; manny.id = "manny";
  const tpl = src?.stats || { attack: 3, magic: 2, speed: 3, maxHp: 26 };
  manny.hp = tpl.maxHp; manny.maxHp = tpl.maxHp; manny.block = 0;
  manny.stats = { ...tpl }; manny.skills = [];
  manny.hand = [
    { name: "黑色转移牌", type: "response", suit: "♣" },
    { name: "红色保留牌", type: "tactic", suit: "♥" },
  ];
  manny.deck = []; manny.discard = [];
  b.enemies.forEach((u, i) => {
    u.hp = 100; u.maxHp = 100; u.block = 0;
    u.hand = i === 0 ? [{ name: "杀", type: "slash", suit: "♥" }] : [];
  });
  b.activeUid = manny.uid; b.phase = 4;
  st.log = [];
  window.render();
  return { victimUid: victim.uid, mannyUid: manny.uid, foeUid: b.enemies[0].uid };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("pageerror", e => pageErrors.push(String(e)));
  await openGame(page);
  await startRegressionBattle(page);
  const s = await page.evaluate(setup);

  // A：虚拟单体杀不触发、不弹提示、不锁战斗
  const virtual = await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    const card = { name: "杀（普攻）", type: "slash", suit: "♦", power: 1, scale: "attack", virtual: true };
    const ok = window.MannySkills.transferSlash(st, b.enemies[0], b.allies[0], 5, "虚拟杀", card);
    window.render();
    const bar = document.querySelector(".hand-panel .discard-prompt");
    return { ok, prompt: !!b.dimensionTransfer, locked: !!b.locked,
      bar: bar ? (bar.textContent || "").trim() : null };
  })()`);
  T("A1 虚拟单体【杀】不触发次元转移", virtual.ok === false, virtual);
  T("A2 虚拟杀不弹转移提示、不锁战斗",
    !virtual.prompt && !virtual.locked && !(virtual.bar || "").includes("次元转移"), virtual);

  // B：实体单体杀触发、底部提示条出现、真实点击黑牌后可完成转移
  const entity = await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    const card = { name: "杀（普攻）", type: "slash", suit: "♦", power: 1, scale: "attack" };
    const ok = window.MannySkills.transferSlash(st, b.enemies[0], b.allies[0], 5, "实体杀", card);
    window.render();
    const bar = document.querySelector(".hand-panel .discard-prompt");
    return { ok, prompt: !!b.dimensionTransfer, locked: !!b.locked,
      bar: bar ? (bar.textContent || "").trim() : null };
  })()`);
  T("B1 实体单体【杀】正常触发", entity.ok && entity.prompt && entity.locked, entity);
  T("B2 底部提示条显示次元转移且要求选黑牌",
    (entity.bar || "").includes("次元转移") && (entity.bar || "").includes("黑色"), entity);

  await page.locator("[data-card-index='0']").click();
  const picked = await page.evaluate(`(() => {
    const b = window.state.battle;
    const bar = document.querySelector(".hand-panel .discard-prompt");
    return { costIndex: b.dimensionTransfer?.costIndex,
      bar: bar ? (bar.textContent || "").trim() : null };
  })()`);
  T("B3 真实点击黑色牌后进入第二步", picked.costIndex === 0
    && (picked.bar || "").includes("敌方角色"), picked);

  const done = await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    const foe = b.enemies[0], manny = b.allies[1];
    const hpBefore = foe.hp, handBefore = manny.hand.length;
    window.MannySkills.resolveDimensionTransfer(st, foe.uid,
      (s, t, amount) => { t.hp -= amount; });
    window.render();
    const bar = document.querySelector(".hand-panel .discard-prompt");
    return { hpBefore, hpAfter: foe.hp, handBefore, handAfter: manny.hand.length,
      cleared: !b.dimensionTransfer, locked: !!b.locked,
      bar: bar ? (bar.textContent || "").trim() : null };
  })()`);
  T("B4 转移结算：敌人承受伤害、黑牌弃置、解锁",
    done.hpAfter === done.hpBefore - 5 && done.handAfter === done.handBefore - 1
    && done.cleared && !done.locked && !(done.bar || "").includes("次元转移"), done);

  // C：傲慢雌小鬼满血 2 倍（真实装配模块 + 真实 render）
  const arrogance = await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    const u = b.allies[0];
    u.ref = "bertis"; u.id = "bertis"; u.name = "贝尔蒂丝";
    u.hp = 50; u.maxHp = 50;
    u.stats = { attack: 9, magic: 7, speed: 10, maxHp: 50, bloodlust: 1, handLimit: 3 };
    u.skills = [{ name: "傲慢雌小鬼" }];
    delete u.bertisBaseStats; u.bertisArrogant = false;
    window.BertisGerlotSkills.refreshArrogance(st);
    window.render();
    const full = { ...u.stats };
    u.hp = 49;
    window.BertisGerlotSkills.refreshArrogance(st);
    const hurt = { ...u.stats };
    u.hp = 50;
    window.BertisGerlotSkills.refreshArrogance(st);
    const again = { ...u.stats };
    const tpl = (window.GameDataCharactersExtra || []).find(x => x.id === "bertis");
    window.render();
    return { full, hurt, again,
      desc: tpl?.skills?.find(k => k.name === "傲慢雌小鬼")?.text || "" };
  })()`);
  T("C1 满血攻/魔/淫气/手牌上限均为 2 倍",
    arrogance.full.attack === 18 && arrogance.full.magic === 14
    && arrogance.full.bloodlust === 2 && arrogance.full.handLimit === 6, arrogance.full);
  T("C2 掉血回落基础值、恢复满血幂等不叠加",
    arrogance.hurt.attack === 9 && arrogance.hurt.magic === 7
    && arrogance.hurt.bloodlust === 1 && arrogance.hurt.handLimit === 3
    && JSON.stringify(arrogance.again) === JSON.stringify(arrogance.full), arrogance);
  T("C3 角色表技能描述已同步 2 倍",
    arrogance.desc.includes("2倍") && !arrogance.desc.includes("1.5倍"), arrogance.desc);

  // D：巴特雷 / 反坦克炮 实体口径（真实页面装配的模块）
  const weapons = await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    const manny = b.allies[1];
    const probe = (weapon, virtual) => {
      manny.mannyWeapon = weapon;
      manny.mannyBarrettSuit = "♠";
      const card = { name: "杀（普攻）", type: "slash", suit: "♠", power: 1, scale: "attack" };
      if (virtual) card.virtual = true;
      window.MannySkills.beforeSlash(st, manny, b.enemies[0], card);
      return { double: !!card.mannyDouble, noResponse: !!card.ignoreResponse,
        ignoreBlock: !!card.ignoreBlock };
    };
    const w = window.MannySkills.weapons;
    return {
      barE: probe("barrett", false), barV: probe("barrett", true),
      canE: probe("cannon", false), canV: probe("cannon", true),
      barText: w.find(x => x.id === "barrett")?.text || "",
      canText: w.find(x => x.id === "cannon")?.text || "",
      flamerText: w.find(x => x.id === "flamer")?.text || "",
      akText: w.find(x => x.id === "ak47")?.text || "",
    };
  })()`);
  const flame = await page.evaluate(`(() => {
    const V = window.BattleCombatAttackValues({
      deps: { isKillCard: c => c?.type === "slash" },
    });
    const actor = { ref: "manny", mannyWeapon: "flamer" };
    const mk = p => Object.assign({ name: "杀（普攻）", type: "slash", suit: "♠", power: 1 }, p);
    const entity = V.baseCardCanFlame(actor, mk({}));
    const virtual = V.baseCardCanFlame(actor, mk({ virtual: true }));
    const generated = V.baseCardCanFlame(actor, mk({ generatedBySkill: true }));
    // 武器动画：虚拟杀（即使伪造 _tempSweep）不得播，实体杀带 _tempSweep 才播
    const b = window.state.battle, manny = b.allies[1];
    manny.mannyWeapon = "flamer";
    let fx = 0;
    const orig = window.MannyGunSkinFX.weaponAttack;
    window.MannyGunSkinFX.weaponAttack = () => { fx += 1; };
    const probe = p => {
      fx = 0;
      const card = Object.assign(mk({}), p);
      if (p._tempSweep) { card.sweep = true; card._tempSweep = true; }
      window.MannySkills.beforeSlash(window.state, manny, b.enemies[0], card);
      return fx;
    };
    const fxVirtual = probe({ virtual: true });
    const fxFakeSweep = probe({ virtual: true, _tempSweep: true });
    const fxEntity = probe({ _tempSweep: true });
    window.MannyGunSkinFX.weaponAttack = orig;
    return { entity, virtual, generated, fxVirtual, fxFakeSweep, fxEntity };
  })()`);
  T("D1 实体杀：巴特雷翻倍且不可响应、反坦克炮无视护甲",
    weapons.barE.double && weapons.barE.noResponse && weapons.canE.ignoreBlock, weapons);
  T("D2 虚拟杀：两件武器都不生效（花色匹配也一样）",
    !weapons.barV.double && !weapons.barV.noResponse && !weapons.canV.ignoreBlock, weapons);
  T("D3 四件武器描述均同步实体口径（刺刀AK47 本就实体）",
    weapons.barText.includes("实体单体【杀】") && weapons.canText.includes("实体单体【杀】")
    && weapons.flamerText.includes("实体单体【杀】") && weapons.akText.includes("实体单体【杀】")
    && weapons.barText.includes("虚拟【杀】") && weapons.canText.includes("虚拟【杀】")
    && weapons.flamerText.includes("虚拟【杀】"), weapons);
  T("D4 真实 baseCardCanFlame：实体放行、虚拟/技能生成牌拒绝",
    flame.entity && !flame.virtual && !flame.generated, flame);
  T("D5 喷火器动画：虚拟杀不播、伪造转换标记不播、实体转换杀照常播",
    flame.fxVirtual === 0 && flame.fxFakeSweep === 0 && flame.fxEntity === 1, flame);

  // E：版本戳与页面健康
  const health = await page.evaluate(() => ({
    stamps: [...new Set((document.documentElement.outerHTML.match(/20260915-\d+/g) || []))],
    badge: document.body.innerText.includes("v26.0915."),
  }));
  T("E1 页面版本戳唯一且与打包版本一致",
    health.stamps.length === 1 && health.stamps[0] === `20260915-${VERSION}`, health);
  T("E2 全程无 JS 错误", pageErrors.length === 0, pageErrors.slice(0, 3));

  console.log(`\nTOTAL ${pass}/${total}`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})().catch(e => { console.error("实机失败:", e); process.exit(1); });
