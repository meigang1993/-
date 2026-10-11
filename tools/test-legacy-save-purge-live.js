// 实战核查：本次更新不再支持旧存档 —— 启动时自动清除，新档不受影响
//   A) 旧档（无 saveEpoch）在启动后被清除：主存档 + 3 个手动存档位
//   B) 启动页给出「旧版存档已清除」提示
//   C) 新档（带当前 saveEpoch）不会被清除 —— 关键：不能误删玩家正常进度
//   D) 真实新建游戏后写入的存档带 saveEpoch，reload 后仍在
//   E) 旧档即使绕过清理被直接读取，也不会载入游戏（load 返回新档）
// 反向验证：
//   1) 去掉 app-boot.js 里的 purgeLegacySavesOnStart 调用 → A/B 变红
//   2) 把 save-epoch.js 的 epoch 改大 → C/D 变红（新档被误判为旧档）
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const { chromium } = require("playwright");
const { openGame, startFreshGame } = require("../tests/helpers/preview-game.js");

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else console.log(`❌ ${name}  ← ${JSON.stringify(extra || {})}`);
  return !!cond;
};

const MAIN_KEY = "succubus-kill-save-v1";
const SLOT_KEYS = [1, 2, 3].map(id => `succubus-kill-slot-${id}-v1`);

const writeLegacy = page => page.evaluate(({ MAIN_KEY, SLOT_KEYS }) => {
  const st = window.GameStore.freshState();
  delete st.saveEpoch;                       // 旧档特征：没有存档纪元
  st.resources.gold = 12345;                 // 留个可辨识痕迹
  const raw = JSON.stringify(st);
  window.localStorage.setItem(MAIN_KEY, raw);
  SLOT_KEYS.forEach(k => window.localStorage.setItem(k, raw));
  return { epoch: window.GameSaveEpoch?.current?.(), written: [MAIN_KEY, ...SLOT_KEYS] };
}, { MAIN_KEY, SLOT_KEYS });

const writeCurrent = page => page.evaluate(({ MAIN_KEY, SLOT_KEYS }) => {
  const st = window.GameStore.freshState();  // freshState 自带当前纪元
  st.resources.gold = 999;
  const raw = JSON.stringify(st);
  window.localStorage.setItem(MAIN_KEY, raw);
  SLOT_KEYS.forEach(k => window.localStorage.setItem(k, raw));
  return { epoch: st.saveEpoch };
}, { MAIN_KEY, SLOT_KEYS });

const readKeys = page => page.evaluate(({ MAIN_KEY, SLOT_KEYS }) => {
  const out = {};
  [MAIN_KEY, ...SLOT_KEYS].forEach(k => {
    const raw = window.localStorage.getItem(k);
    out[k] = raw ? { exists: true, epoch: JSON.parse(raw).saveEpoch ?? null } : { exists: false };
  });
  return out;
}, { MAIN_KEY, SLOT_KEYS });

const bootAndSettle = async page => {
  await page.reload();
  await page.locator("#view").waitFor({ state: "visible" });
  await page.locator("[data-start-game]").waitFor({ state: "visible" });
  await page.waitForTimeout(600);   // 等启动清理异步完成
};

const startPageText = page => page.locator(".start-screen").innerText();

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  try {
    await openGame(page);
    // 启动流程会异步装配存档模块，等它就绪再操作
    await page.waitForFunction(() => !!window.GameStore?.freshState, null, { timeout: 15000 });

    // ---------- A/B：旧档被清除 + 提示 ----------
    const info = await writeLegacy(page);
    console.log(`当前存档纪元=${info.epoch}`);
    const before = await readKeys(page);
    T("A0 旧档已写入（4 个 key 均存在）",
      Object.values(before).every(v => v.exists), before);

    await bootAndSettle(page);
    const after = await readKeys(page);
    const clearedCount = Object.values(after).filter(v => !v.exists).length;
    T("A1 旧档全部被清除（主存档 + 3 个存档位）", clearedCount === 4, after);
    T("A2 主存档已不存在", !after[MAIN_KEY].exists, after[MAIN_KEY]);
    T("A3 三个手动存档位均已不存在",
      SLOT_KEYS.every(k => !after[k].exists), after);

    const text = await startPageText(page);
    T("B1 启动页显示旧存档已清除的提示", /旧版存档/.test(text), { text: text.slice(0, 200) });
    T("B2 提示引导开始新游戏", /开始新游戏/.test(text), { text: text.slice(0, 200) });

    // ---------- C：新档不被清除 ----------
    await writeCurrent(page);
    const beforeC = await readKeys(page);
    await bootAndSettle(page);
    const afterC = await readKeys(page);
    T("C1 新档（带当前纪元）不被清除",
      Object.values(afterC).every(v => v.exists && v.epoch === info.epoch), afterC);
    const textC = await startPageText(page);
    T("C2 新档时启动页不显示清除提示", !/旧版存档/.test(textC), { text: textC.slice(0, 200) });
    T("C3 新档写入前后纪元一致", beforeC[MAIN_KEY].epoch === info.epoch, beforeC[MAIN_KEY]);

    // ---------- D：真实新建游戏 ----------
    await startFreshGame(page);
    const saved = await page.evaluate(MAIN_KEY => {
      const raw = window.localStorage.getItem(MAIN_KEY);
      return raw ? { exists: true, epoch: JSON.parse(raw).saveEpoch ?? null } : { exists: false };
    }, MAIN_KEY);
    T("D1 新建游戏后存档已写入", saved.exists, saved);
    T("D2 新建游戏写入的存档带当前纪元", saved.epoch === info.epoch, saved);

    await bootAndSettle(page);
    const afterD = await page.evaluate(MAIN_KEY => {
      const raw = window.localStorage.getItem(MAIN_KEY);
      return raw ? { exists: true, epoch: JSON.parse(raw).saveEpoch ?? null } : { exists: false };
    }, MAIN_KEY);
    T("D3 真实新档 reload 后仍在（未被误清）",
      afterD.exists && afterD.epoch === info.epoch, afterD);

    // ---------- E：绕过清理直接读旧档 ----------
    const legacyLoad = await page.evaluate(({ MAIN_KEY }) => {
      const st = window.GameStore.freshState();
      delete st.saveEpoch;
      st.resources.gold = 777;
      window.localStorage.setItem(MAIN_KEY, JSON.stringify(st));
      // 直接走主存档读取路径（跳过启动清理）
      return window.GameStore.load().then(loaded => ({
        epoch: loaded?.saveEpoch ?? null,
        gold: loaded?.resources?.gold ?? null,
      })).catch(err => ({ error: err.message }));
    }, { MAIN_KEY });
    T("E1 旧档不会被载入：读取返回新档", legacyLoad.epoch === info.epoch, legacyLoad);
    T("E2 旧档内容不会带进来（金币不是旧档的 777）",
      legacyLoad.gold !== 777, legacyLoad);

    T("F1 全程无页面错误", errors.length === 0, errors.slice(0, 5));

    console.log(`\n通过 ${pass}/${total}`);
    if (pass !== total) process.exitCode = 1;
  } catch (err) {
    console.error("运行失败:", err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
