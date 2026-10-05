// 实战：娜娜莉兑换价格改为 15 宝珠后，数据 / 文案 / UI / 真实兑换 / 老存档迁移是否全部生效
// 重点：
// 1) 不能只改数据源 —— unlockHints 里也硬编码了「×30」，两处必须同步
// 2) 老存档里已存过 unlockCost=30，必须确认读档迁移会把模板值覆盖回去
// 3) 兑换要真走 ServerCore.call("unlockChar")（UI 按钮点击后的同一入口），并验证边界 14/15
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame } = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const results = [];
const check = (name, cond, info) => {
  results.push({ name, ok: !!cond, info });
  console.log(`${cond ? "✅" : "❌"} ${name}${info !== undefined ? "  " + JSON.stringify(info) : ""}`);
};

const PRICE = 15;
const OLD_PRICE = 30;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push(e.message));
  await openGame(page);
  await page.evaluate(() => Promise.all([
    window.GameBundles?.load?.("battle"),
    window.GameBundles?.load?.("dungeon"),
    window.GameBundles?.load?.("hall"),
  ]));
  await page.click("[data-start-game]");
  await page.waitForTimeout(1500);

  // ===== 1. 数据层：模板价格 =====
  const data = await page.evaluate(() => {
    const tpl = (window.GameData?.characters || []).find(c => c.id === "nanali");
    const live = (window.state?.chars || []).find(c => c.id === "nanali");
    return {
      tplCost: tpl?.unlockCost,
      liveCost: live?.unlockCost,
      hint: window.GameData?.unlockHints?.nanali,
      locked: live?.locked,
    };
  });
  check("数据层：娜娜莉 unlockCost = 15", data.tplCost === PRICE, { 实际: data.tplCost });
  check("存档层：娜娜莉 unlockCost = 15", data.liveCost === PRICE, { 实际: data.liveCost });
  check(`文案：unlockHints 为「消耗精华宝珠 ×15」`,
    data.hint === `消耗精华宝珠 ×${PRICE}`, { 实际: data.hint });
  check("旧值 ×30 已无残留", !String(data.hint || "").includes(String(OLD_PRICE)),
    { hint: data.hint });

  // ===== 2. UI 渲染文案（孕育殿堂卡片）=====
  const ui = await page.evaluate(() => {
    const s = window.state;
    s.battle = null; s.explore = null; s.hallModal = null; s.succubusCodex = false;
    s.resources.essence = 100;
    s.view = "nursery";
    window.render?.();
    const btn = document.querySelector('[data-unlock="nanali"]');
    const card = btn?.closest(".card");
    return {
      found: !!btn,
      disabled: btn ? btn.disabled : null,
      text: card ? card.textContent.replace(/\s+/g, " ").trim() : null,
    };
  });
  check("UI：孕育殿堂能渲染出娜娜莉兑换按钮", ui.found, { disabled: ui.disabled });
  check("UI：卡片文案含「消耗精华宝珠 ×15」",
    !!ui.text && ui.text.includes(`消耗精华宝珠 ×${PRICE}`), { text: ui.text });
  check("UI：卡片文案含「唤醒需要精华宝珠 15 颗」",
    !!ui.text && ui.text.includes(`唤醒需要精华宝珠 ${PRICE} 颗`), { text: ui.text });
  check("UI：宝珠充足时按钮可用", ui.disabled === false, { disabled: ui.disabled });

  // ===== 3. 真实兑换：宝珠不足（14）应拒绝 =====
  const short = await page.evaluate(async () => {
    const s = window.state;
    const c = s.chars.find(x => x.id === "nanali");
    c.locked = true;
    s.resources.essence = 14;
    const res = await window.ServerCore.call("unlockChar", { id: "nanali" }, s);
    return { ok: !!res?.ok, code: res?.error?.code, essence: s.resources.essence, locked: c.locked };
  });
  // ServerCore.call 返回 { ok, changed, error }，不能拿字符串 "rejected" 比
  check("兑换：14 宝珠时拒绝", short.ok === false,
    { ok: short.ok, essence: short.essence, locked: short.locked });
  check("兑换：拒绝后宝珠未被扣除", short.essence === 14, { essence: short.essence });
  check("兑换：拒绝后仍为未解锁", short.locked === true, { locked: short.locked });

  // ===== 4. 真实兑换：宝珠刚好（15）应成功 =====
  const exact = await page.evaluate(async () => {
    const s = window.state;
    const c = s.chars.find(x => x.id === "nanali");
    c.locked = true;
    s.resources.essence = 15;
    const res = await window.ServerCore.call("unlockChar", { id: "nanali" }, s);
    return { ok: !!res?.ok, code: res?.error?.code, essence: s.resources.essence, locked: c.locked, hp: c.hp };
  });
  check("兑换：15 宝珠时成功", exact.ok === true,
    { ok: exact.ok, code: exact.code, essence: exact.essence, locked: exact.locked });
  check("兑换：成功扣除 15 宝珠（余额 0）", exact.essence === 0, { essence: exact.essence });
  check("兑换：成功后变为已解锁", exact.locked === false, { locked: exact.locked });

  // ===== 5. 真实兑换：宝珠充裕（40）应只扣 15 =====
  const rich = await page.evaluate(async () => {
    const s = window.state;
    const c = s.chars.find(x => x.id === "nanali");
    c.locked = true;
    s.resources.essence = 40;
    const res = await window.ServerCore.call("unlockChar", { id: "nanali" }, s);
    return { ok: !!res?.ok, code: res?.error?.code, essence: s.resources.essence, locked: c.locked };
  });
  check("兑换：40 宝珠时只扣 15（余 25）",
    rich.ok === true && rich.essence === 25,
    { ok: rich.ok, essence: rich.essence, locked: rich.locked });

  // ===== 6. 老存档迁移：存档里残留 30 应被模板覆盖为 15 =====
  // 老玩家存档在改动前已把 unlockCost=30 写进 chars，若迁移不覆盖则改动对其无效。
  const migrated = await page.evaluate(() => {
    const tpl = (window.GameData?.characters || []).find(c => c.id === "nanali");
    const legacy = [{ id: "nanali", unlockCost: 30, locked: true, level: 1, exp: 0, spent: {} }];
    const out = window.StoreCharacterMigrations?.migrateCharacter?.(tpl, legacy, {});
    return { cost: out?.unlockCost, locked: out?.locked };
  });
  check("迁移：老存档 unlockCost=30 被覆盖为 15",
    migrated.cost === PRICE, { 迁移后: migrated.cost, locked: migrated.locked });

  // ===== 7. 其他角色价格未被误改 =====
  const others = await page.evaluate(() => {
    const list = window.GameData?.characters || [];
    const pick = id => list.find(c => c.id === id)?.unlockCost;
    return { manny: pick("manny"), nonoka: pick("nonoka"), besta: pick("besta"), angelica: pick("angelica") };
  });
  check("回归：其他角色价格未变（曼妮10/诺诺卡12/安洁莉卡14/贝丝妲40）",
    others.manny === 10 && others.nonoka === 12 && others.angelica === 14 && others.besta === 40,
    others);

  check("无页面错误", errors.length === 0, errors.slice(0, 3));

  await browser.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n合计 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length}`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error("崩溃:", e.message); process.exit(1); });
