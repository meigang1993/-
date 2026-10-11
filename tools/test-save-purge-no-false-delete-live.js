// 严格检查：现版本存档会不会被误删
//   第 1 组（矩阵）用注入的 deps 精确控制「本地副本 / 云端副本」各自状态，
//          覆盖 11 种组合，重点验证：本地残留旧档 + 云端已是新档时不能删
//          （删 key 会连本地与云端一起清掉，有效进度会丢）
//   第 2 组（端到端）走真实启动链路：存档位混合新旧、真实游玩存盘、纪元边界值
// 反向验证：
//   把 legacy 判定改回 `details.local ?? details.cloud` 单副本取值
//   → 矩阵第 4 项与端到端 G1 变红（本地旧+云端新被误删）
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

// 在页面内用注入的 deps 构造 purge，跑一次并返回是否删除
const runMatrix = page => page.evaluate(() => {
  const epoch = window.GameSaveEpoch.current();
  const isLegacy = window.GameSaveEpoch.isLegacy;
  const NEW = { saveEpoch: epoch, gold: 1 };   // 当前纪元
  const OLD = { gold: 1 };                     // 无 saveEpoch → 旧档

  // 副本状态： "new" | "old" | "corrupt"(存在但校验失败→值为 null) | null(不存在)
  // cloudOpts：{ readFailed } 有 SDK 但本次读取失败；{ noSdk } 无云端 SDK（纯本地）；
  //            { throws } getRawDetails 整体抛错。默认云端可用且能读到。
  const build = (localState, cloudState, cloudOpts = {}) => {
    const value = s => (s === "new" ? NEW : s === "old" ? OLD : null);
    const exists = s => s !== null;
    let deleted = false;
    const deps = {
      key: "k", slotKey: id => `s${id}`, slotIds: [],
      isLegacy,
      getLocalDetails: () => ({
        exists: exists(localState),
        value: value(localState),
      }),
      getRawDetails: async () => {
        if (cloudOpts.throws) {
          throw Object.assign(new Error("CLOUD_LOAD_FAILED"), { code: "CLOUD_LOAD_FAILED" });
        }
        return {
          localExists: exists(localState),
          cloudExists: exists(cloudState),
          local: value(localState),
          cloud: value(cloudState),
          cloudAvailable: !cloudOpts.noSdk,
          cloudReadFailed: !!cloudOpts.readFailed,
        };
      },
      delRaw: async () => { deleted = true; },
    };
    return window.GameStoreLegacyPurge(deps).purge().then(res => ({
      local: localState, cloud: cloudState,
      purged: res.purged.length > 0, kept: res.kept.length > 0,
      deleted,
    }));
  };

  const cases = [
    ["本地新+云端新", build("new", "new"), false],
    ["本地新+云端无", build("new", null), false],
    ["本地无+云端新", build(null, "new"), false],
    ["本地旧+云端新", build("old", "new"), false],
    ["本地新+云端旧", build("new", "old"), false],
    ["本地旧+云端旧", build("old", "old"), true],
    ["本地旧+云端无", build("old", null), true],
    ["本地无+云端旧", build(null, "old"), true],
    ["本地无+云端无", build(null, null), false],
    ["本地新+云端损坏", build("new", "corrupt"), false],
    ["本地无+云端损坏", build(null, "corrupt"), true],
    // 云端状态不可确认：cloud 为 null 会让副本列表看不到云端，若按本地旧档
    // 删除会连云端可能存在的当前纪元进度一起清掉（不可逆）→ 必须保留
    ["本地旧+云端读失败", build("old", null, { readFailed: true }), false],
    ["本地旧+云端整体抛错", build("old", null, { throws: true }), false],
    // 但没有云端 SDK 时云侧本就不可能有数据，纯本地玩家仍要能清掉旧档
    ["本地旧+云端无SDK(纯本地)", build("old", null, { noSdk: true }), true],
  ];
  return Promise.all(cases.map(([, p]) => p))
    .then(results => results.map((r, i) => ({ name: cases[i][0], ...r, expect: cases[i][2] })));
}, null);

// 纪元边界值：哪些算旧档
const runEpochEdges = page => page.evaluate(() => {
  const isLegacy = window.GameSaveEpoch.isLegacy;
  const epoch = window.GameSaveEpoch.current();
  const probe = value => {
    const st = { saveEpoch: value, gold: 1 };
    if (value === undefined) delete st.saveEpoch;
    return isLegacy(st);
  };
  return {
    epoch,
    number: probe(epoch),            // 标准新档
    string: probe(String(epoch)),    // 字符串形式
    float: probe(epoch + 0.0),       // 浮点
    zero: probe(0),
    missing: probe(undefined),
    nullish: probe(null),
    future: probe(epoch + 1),
    nan: probe("abc"),
  };
}, null);

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
  await page.waitForTimeout(600);
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  try {
    await openGame(page);
    await page.waitForFunction(() => !!window.GameStore?.freshState
      && !!window.GameStoreLegacyPurge, null, { timeout: 15000 });

    // ---------- 第 1 组：副本组合矩阵 ----------
    const matrix = await runMatrix(page);
    matrix.forEach(row => {
      T(`矩阵 ${row.name} → ${row.expect ? "应删除" : "应保留"}`,
        row.purged === row.expect,
        { purged: row.purged, expect: row.expect });
    });
    const keptCases = matrix.filter(r => !r.expect);
    T("矩阵 保留场景中没有任何一个触发 delRaw",
      keptCases.every(r => r.deleted === false),
      keptCases.filter(r => r.deleted).map(r => r.name));

    // ---------- 纪元边界值 ----------
    const edges = await runEpochEdges(page);
    console.log(`当前纪元=${edges.epoch}`);
    T("边界 数值纪元 → 新档", edges.number === false, edges);
    T("边界 字符串纪元 → 新档", edges.string === false, edges);
    T("边界 缺失 saveEpoch → 旧档", edges.missing === true, edges);
    T("边界 saveEpoch=0 → 旧档", edges.zero === true, edges);
    T("边界 saveEpoch=null → 旧档", edges.nullish === true, edges);
    T("边界 未来纪元 → 旧档（不兼容即清）", edges.future === true, edges);
    T("边界 非法值 → 旧档", edges.nan === true, edges);

    // ---------- 第 2 组：端到端 ----------
    // G) 存档位混合：1 新 / 2 旧 / 3 空 → 只清 2
    await page.evaluate(({ SLOT_KEYS }) => {
      const epoch = window.GameSaveEpoch.current();
      const mk = e => JSON.stringify(e === null
        ? { saveEpoch: epoch, gold: 111 } : { gold: 222 });
      window.localStorage.setItem(SLOT_KEYS[0], mk(null));  // 新
      window.localStorage.setItem(SLOT_KEYS[1], mk(1));     // 旧
      window.localStorage.removeItem(SLOT_KEYS[2]);         // 空
    }, { SLOT_KEYS });
    await bootAndSettle(page);
    const afterG = await readKeys(page);
    T("G1 新档存档位被保留（不被误删）",
      afterG[SLOT_KEYS[0]].exists && afterG[SLOT_KEYS[0]].epoch === edges.epoch,
      afterG[SLOT_KEYS[0]]);
    T("G2 旧档存档位被清除", !afterG[SLOT_KEYS[1]].exists, afterG[SLOT_KEYS[1]]);
    T("G3 空的存档位不受影响", !afterG[SLOT_KEYS[2]].exists, afterG[SLOT_KEYS[2]]);

    // H) 真实写入链路：freshState → 主存档 + 存档位各存一份 → reload 仍在
    //    （state 不挂在 window 上，故用 freshState 走 GameStore 真实读写链路）
    const GOLD = 45678;
    const writeReal = await page.evaluate(async GOLD => {
      const st = window.GameStore.freshState();
      st.resources.gold = GOLD;
      await window.GameStore.save(st);
      await window.GameStore.saveSlot(1, st);
      await new Promise(r => setTimeout(r, 500));
      return { epoch: st.saveEpoch, gold: st.resources.gold };
    }, GOLD);
    T("H0 写入前的状态带当前纪元", writeReal.epoch === edges.epoch, writeReal);

    await bootAndSettle(page);
    const afterH = await readKeys(page);
    T("H1 真实存盘后存档位仍在", afterH[SLOT_KEYS[0]].exists, afterH[SLOT_KEYS[0]]);
    T("H2 真实存盘带当前纪元", afterH[SLOT_KEYS[0]].epoch === edges.epoch, afterH[SLOT_KEYS[0]]);
    T("H3 主存档同样保留", afterH[MAIN_KEY].exists && afterH[MAIN_KEY].epoch === edges.epoch,
      afterH[MAIN_KEY]);
    const goldAfter = await page.evaluate(MAIN_KEY => {
      const raw = window.localStorage.getItem(MAIN_KEY);
      return raw ? JSON.parse(raw).resources?.gold : null;
    }, MAIN_KEY);
    T("H4 重新载入后存档内容未丢（金币与存盘时一致）",
      goldAfter === GOLD, { GOLD, goldAfter });

    // I) 连续两次启动：新档不应在第二次被清
    const beforeI = await readKeys(page);
    await bootAndSettle(page);
    const afterI = await readKeys(page);
    T("I1 连续两次启动，新档始终保留",
      Object.values(afterI).filter(v => v.exists).length
        === Object.values(beforeI).filter(v => v.exists).length,
      { before: beforeI, after: afterI });

    T("J1 全程无页面错误", errors.length === 0, errors.slice(0, 5));

    console.log(`\n通过 ${pass}/${total}`);
    if (pass !== total) process.exitCode = 1;
  } catch (err) {
    console.error("运行失败:", err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
