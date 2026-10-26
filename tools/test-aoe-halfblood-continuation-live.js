// 严格检查：所有 AOE（群体）牌打到带【半魅魔血】的星野海一时，
// 交牌弹窗挂起后，后续目标会不会被吞掉。
//
// 背景：霹雳之锤曾出现「群体杀中途挂起 → 后续目标不再结算」的同类缺陷
// （当时以「锤子限定单体杀」规避）。本用例不规避，直接验群体结算本身。
//
// 环境：真实浏览器 + 真实 useCard 链路 + 真实点击「不交」按钮。
//
// 分批：AOE_PART=list 只枚举；AOE_PART=<序号|名字> 只跑指定牌；不设跑全部。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startFreshGame, dismissOpeningStory } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

// 必须用 4 名【真实】角色开局：battle-runtime-helpers 的 allUnits 用 WeakMap
// 缓存了 allies.concat(enemies) 的首份快照，战斗开始后再往 b.allies 里塞克隆
// 单位，续跑路径 units.get(uid) 会取不到（初始扫射却能打到，因为那一遍直接
// 遍历 b.allies）。克隆单位会造成「后续目标没掉血」的假象，误判成产品缺陷。
// 故在开战前用 state.testAllies 指定 4 名真实角色。
const ALLY_IDS = ["lokar", "besta_doll", "manny", "elrana"];
async function enterBattle4(page) {
  await startFreshGame(page);
  await dismissOpeningStory(page);
  await page.evaluate((ids) => {
    window.state.hallModal = "testBattle";
    window.state.testAllies = ids;
    window.render();
  }, ALLY_IDS);
  await page.locator("[data-start-test-battle]").waitFor({ state: "visible" });
  await page.evaluate(() => {
    window.state.testEnemies = [0, 1];
    window.GameAssets.preloadBattle = async () => {};
    window.state.settings.battleSpeed = 2;
    window.BattleFX.playBattleStart = callback => callback?.();
    window.BattleLines.intro = () => 0;
    window.render();
  });
  await page.locator("[data-start-test-battle]").click();
  await page.locator(".battle-screen").waitFor({ state: "visible" });
  await page.evaluate(() => {
    const battle = window.state.battle;
    window.state.settings.battleSpeed = 1;
    battle.animQueue = [];
    battle.locked = false;
    battle.phase = 4;
    battle.activeUid = battle.allies[0].uid;
    window.render();
    window.BattleEffects.recover(window.state);
  });
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail !== undefined ? `  ${JSON.stringify(detail)}` : ""}`);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// —— 在浏览器里枚举全部 AOE 牌（避免手写清单漏项）——
const ENUM_AOE = `(() => {
  const out = [], seen = new Set();
  const push = c => {
    if (!c || !c.name || seen.has(c.name)) return;
    seen.add(c.name);
    const group = !!(c.sweep || c.allTargets || c.aoeLineShown || c.demonInvasion);
    if (group) out.push({ name: c.name, type: c.type, sweep: !!c.sweep,
      demonInvasion: !!c.demonInvasion, allTargets: !!c.allTargets });
  };
  const tryAll = obj => {
    if (!obj) return;
    (Object.values(obj) || []).forEach(v => {
      if (Array.isArray(v)) v.forEach(push);
      else if (v && typeof v === "object") { push(v); tryAll(v); }
    });
  };
  ["marketCards", "eliteCards", "baseDeck", "cardCodex"].forEach(k => {
    const arr = window.GameData?.[k];
    if (Array.isArray(arr)) arr.forEach(push);
  });
  return out;
})()`;

const setupTpl = `(() => {
  const st = window.state, b = st.battle;
  // allies[0] = 星野海一（半魅魔血）
  const kaiichi = b.allies[0];
  kaiichi.name = "星野海一";
  kaiichi.ref = "hoshino_kaiichi";
  kaiichi.skills = [{ name: "半魅魔血", type: "trigger", icon: "🔵",
    text: "当你受到生命值伤害后，你摸3张牌，然后可以选择至多3张手牌并将这些牌交给一名其他友方角色。" }];
  // 队伍必须由 enterBattle4 用 testAllies 指定为 4 名真实角色。
  // 战斗开始后再注入克隆单位会被 allUnits 的 WeakMap 缓存漏掉，造成假缺陷。
  // 清空所有友方手牌：避免自动打出【闪】/【杀】抵消伤害，保证伤害一定落地触发半魅魔血
  b.allies.forEach(u => {
    u.hand = [];
    u.hp = 300; u.maxHp = 300;
    u.stats = Object.assign({}, u.stats, { handLimit: 99 });
  });
  // 施法者：敌方 0 号
  const caster = b.enemies[0];
  caster.name = "AOE施法者";
  caster.hp = 999; caster.maxHp = 999;
  caster.stats = Object.assign({}, caster.stats, { attack: 6, magic: 6 });
  caster.hand = [];
  b.locked = false;
  b.kaiichiShare = null; b.kaiichiShareQueue = null; b.kaiichiShareScheduled = false;
  b.demonInvasionResume = null; b.reactionQueue = null;
  b.manualDodge = null; b.manualDodgeResume = null;
  b.animQueue = [];
  if (window.BattleLog && window.BattleLog.clear) window.BattleLog.clear(st);
  window.render();
  return { allies: b.allies.map(u => u.name), enemies: b.enemies.map(u => u.name) };
})()`;

const playTpl = cardName => `(() => {
  const st = window.state, b = st.battle;
  const pool = ["marketCards", "eliteCards", "baseDeck", "cardCodex"]
    .reduce((acc, k) => acc.concat(Array.isArray(window.GameData?.[k]) ? window.GameData[k] : []), []);
  const src = pool.find(c => c.name === ${JSON.stringify(cardName)});
  if (!src) return { error: "card not found: " + ${JSON.stringify(cardName)} };
  const card = Object.assign({}, src, { noIntentCost: true, _playedFromHand: true });
  const caster = b.enemies[0];
  window.__hpBefore = b.allies.map(u => ({ name: u.name, hp: u.hp }));
  // targetless 群体牌仍需传一个合法目标：triggerWhiteLolita 会读 target.side，传 null 直接抛错
  window.BattleSystem.useCard(st, caster, b.allies[0], card);
  return { ok: true };
})()`;

const snapTpl = `(() => {
  const b = window.state && window.state.battle;
  if (!b) return null;
  return {
    locked: !!b.locked,
    share: !!(b.kaiichiShare || (b.kaiichiShareQueue && b.kaiichiShareQueue.length)),
    animating: !!window.BattleEffects?.animating,
    queue: (b.animQueue || []).length,
    // 续跑标志：resumeDemonInvasion 是 async，每步 await waitEffects() 之间
    // 会短暂出现「未锁定 + 无动画」的空档。只盯 locked/animating 会在续跑
    // 中途误判为已结束，导致后续目标还没打就读数 —— 必须一并盯住。
    resuming: !!(b.demonInvasionResume || (b.reactionQueue && b.reactionQueue.length)),
    hp: b.allies.map(u => ({ name: u.name, hp: u.hp })),
  };
})()`;

async function waitIdle(page, ms = 15000) {
  await page.waitForFunction(() => {
    const b = window.state && window.state.battle;
    if (!b) return true;
    return !window.BattleEffects?.animating && !(b.animQueue || []).length
      && !b.demonInvasionResume && !(b.reactionQueue || []).length;
  }, null, { timeout: ms }).catch(() => {});
}

async function runCard(page, card) {
  const tag = `[${card.name}]`;
  // 每张牌用全新页面：同一页面内第二局没有 [data-start-game]（游戏已启动），
  // 且上张牌可能已触发胜利/失败结算，重置成本高且易残留。
  const names = await page.evaluate(setupTpl);
  if (names.allies.length < 4) {
    check(`${tag} 战斗为 4 名真实友方`, false, names);
    return;
  }
  const played = await page.evaluate(playTpl(card.name));
  if (played.error) { check(`${tag} 找到卡牌`, false, played); return; }

  // 等待半魅魔血挂起（或超时）
  let sawShare = false;
  for (let i = 0; i < 40; i++) {
    const s = await page.evaluate(snapTpl);
    if (s && s.share) { sawShare = true; break; }
    await sleep(120);
  }
  await waitIdle(page, 8000);
  const afterPlay = await page.evaluate(snapTpl);
  check(`${tag} A1 半魅魔血触发（交牌挂起）`, sawShare,
    { share: afterPlay.share, locked: afterPlay.locked });

  // 真实点击「不交」按钮解除挂起
  let clicked = false;
  if (afterPlay.share) {
    const skip = page.locator("[data-kaiichi-share-skip]").first();
    if (await skip.count() && await skip.isVisible().catch(() => false)) {
      await skip.click();
      clicked = true;
    }
  }
  check(`${tag} A2 「不交」按钮可见且点击`, clicked, { clicked });

  for (let i = 0; i < 60; i++) {
    const s = await page.evaluate(snapTpl);
    if (s && !s.share && !s.locked && !s.animating && !s.queue && !s.resuming) break;
    await sleep(150);
  }
  await waitIdle(page, 8000);
  await sleep(600);
  await waitIdle(page, 8000);
  const final = await page.evaluate(snapTpl);
  const before = await page.evaluate(`window.__hpBefore || []`);
  const damaged = (final.hp || []).map((h, i) => ({
    name: h.name, before: before[i] ? before[i].hp : null, after: h.hp,
    took: before[i] ? before[i].hp - h.hp : null,
  }));
  check(`${tag} A3 交牌后解除锁定`, !final.share && !final.locked,
    { share: final.share, locked: final.locked });
  const rest = damaged.slice(1);
  const allHit = rest.length > 0 && rest.every(d => d.took > 0);
  check(`${tag} A4 后续目标全部结算（未被吞）`, allHit, { rest });
  check(`${tag} A5 无残留动画/队列`, !final.animating && !final.queue,
    { animating: final.animating, queue: final.queue });
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await openGame(page);

  const only = process.env.AOE_PART || "";
  {
    const p0 = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    await openGame(p0);
    await enterBattle4(p0);
    var aoe = await p0.evaluate(ENUM_AOE);
    await p0.close();
  }
  console.log("=== 枚举到的 AOE 牌 ===", JSON.stringify(aoe));
  if (only === "list") { await browser.close(); return; }

  let list = aoe;
  if (only) {
    const idx = Number(only);
    list = Number.isNaN(idx)
      ? aoe.filter(c => c.name === only)
      : [aoe[idx]];
  }
  if (!list.length) {
    console.log("!! 没有可跑的 AOE 牌（枚举为空），请检查 GameData 结构");
  }
  for (const card of list) {
    if (!card) continue;
    const cp = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    cp.on("pageerror", e => errors.push(e.message));
    cp.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
    await openGame(cp);
    await enterBattle4(cp);
    await runCard(cp, card);
    await cp.close();
  }

  const bad = errors.filter(t => !/favicon|ResizeObserver/.test(t));
  check("无 JS 错误", bad.length === 0, bad.slice(0, 3));

  await browser.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n=== ${results.length - failed.length}/${results.length} ===`);
  if (failed.length) {
    console.log("失败项：");
    failed.forEach(f => console.log(`  ❌ ${f.name} ${JSON.stringify(f.detail)}`));
    process.exit(1);
  }
})().catch(e => { console.error("FATAL", e); process.exit(1); });
