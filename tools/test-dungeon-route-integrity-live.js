// 严格检查四个副本的「路线节点是否通、能否正常通关」。
//
// 三层检查：
//   1) 地图连通性：4 副本 × 5 难度生成地图，BFS 验证起点→BOSS 可达、
//      每个非末层节点都有后继（无死路）、每个节点都有前驱（非孤岛）。
//   2) 固定组合 id 存在性：fixedGroup 里若 id 在池中找不到，
//      会静默 fallback 成 sample(pool)（随机换人），既破坏组合也破坏平衡；
//      池为空时更会得到 undefined 敌人。这里逐个 id 核对。
//   3) 敌人构造结果：每副本 × normal/elite/boss 多次取样，
//      验证结果非空、每个敌人 id/name 有效、hp 为正。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const MISSIONS = ["machine_factory", "underwater_train", "orc_dungeon", "ruins_sand_city"];
const DIFFS = ["normal", "adventure", "warrior", "king", "hell"];

// 各副本固定组合里引用的敌人 id（来自 dungeon-enemies.js 的 bossGroup / enemiesFor）
const FIXED_IDS = {
  machine_factory: ["mecha_minotaur", "skeleton_patrol", "elrana_clone",
    "krow_doctor", "machine_succubus", "invader_chiyo",
    "pursuer_edis", "mechanical_bull_king"],
  underwater_train: ["shark_pirate_raider", "shark_captain_mordio", "shark_pirate_crew",
    "mona_eagle_captain", "raff_assassin", "abe_mike"],
  orc_dungeon: ["xx_witherer_1124", "demon_mecha_cerberus", "demon_king_bakaar",
    "witherer_1124_split", "orc_king_bondi", "demon_beast_unit",
    "guard_kelly", "demon_witch", "assassin_sakura_risa"],
  ruins_sand_city: ["mech_ai_dragon", "noble_soldier", "noble_sniper",
    "witherer_1312", "attack_drone", "merca_tank", "attack_helicopter",
    "armored_carrier", "hilde"],
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  const out = { errors, pass: [], fail: [] };
  const t = (name, ok, info) => (ok ? out.pass : out.fail).push({ name, ...(info || {}) });
  try {
    await openGame(page);
    await page.waitForTimeout(800);

    // ---------- 1) 固定组合 id 存在性 ----------
    const idCheck = await page.evaluate(({ missions, fixed, SABOTAGE }) => {
      const res = {};
      for (const m of missions) {
        const pool = window.GameData.enemies[m] || [];
        const ids = pool.map(e => e.id);
        if (SABOTAGE && m === "machine_factory") ids.length = 0;
        res[m] = {
          poolSize: pool.length,
          missing: (fixed[m] || []).filter(id => !ids.includes(id)),
          hasNormal: pool.some(e => e.type === "normal"),
          hasElite: pool.some(e => e.type === "elite"),
          hasBoss: pool.some(e => e.type === "boss"),
        };
      }
      return res;
    }, { missions: MISSIONS, fixed: FIXED_IDS, SABOTAGE: process.env.SABOTAGE === "1" });
    out.idCheck = idCheck;
    for (const m of MISSIONS) {
      const c = idCheck[m];
      t(`固定组合 id 齐全：${m}`, c.missing.length === 0,
        { poolSize: c.poolSize, missing: c.missing });
      t(`敌人池三类齐全：${m}`, c.hasNormal && c.hasElite && c.hasBoss,
        { normal: c.hasNormal, elite: c.hasElite, boss: c.hasBoss });
    }

    // ---------- 2) 地图连通性 ----------
    const SABOTAGE = process.env.SABOTAGE === "1";
    const mapCheck = await page.evaluate(({ missions, diffs, SABOTAGE }) => {
      const res = {};
      for (const m of missions) {
        const mission = [...(window.GameData.missions || []),
          ...(window.GameDataFutureDungeons || [])].find(x => x.id === m);
        for (const d of diffs) {
          const diff = window.GameData.difficulties[d];
          const key = `${m}/${d}`;
          const layers = window.DungeonMap.buildLayers(mission, diff, window.state);
          window.DungeonMap.connect(layers, window.state);
          // 反向验证开关：connect 之后人为毁掉一个节点的后继，
          // 用于确认 noNext / bossReachable 断言真的有拦截力
          // （connect 内部与 repairLinks 都会自愈，故必须在 connect 之后破坏）。
          if (SABOTAGE) {
            for (let i = 0; i < layers.length - 1; i++) {
              if (layers[i].length > 1) { layers[i][layers[i].length - 1].next = []; break; }
            }
          }
          const all = layers.flat();
          const byId = new Map(all.map(n => [n.id, n]));
          // 后继有效：必须指向下一层的真实节点
          let badLink = 0; let noNext = 0;
          for (let i = 0; i < layers.length - 1; i++) {
            const to = layers[i + 1];
            const toIds = new Set(to.map(n => n.id));
            for (const n of layers[i]) {
              const valid = (n.next || []).filter(id => toIds.has(id));
              if (!valid.length) noNext += 1;
              else if (valid.length !== (n.next || []).length) badLink += 1;
            }
          }
          // BFS：起点层 → 能否到达最后一层（BOSS）
          const start = layers[0][0];
          const seen = new Set([start.id]);
          const queue = [start];
          while (queue.length) {
            const cur = queue.shift();
            for (const id of (cur.next || [])) {
              if (!byId.has(id) || seen.has(id)) continue;
              seen.add(id);
              queue.push(byId.get(id));
            }
          }
          const lastLayer = layers[layers.length - 1];
          const bossReachable = lastLayer.some(n => seen.has(n.id));
          const unreachable = all.filter(n => !seen.has(n.id)).map(n => n.id);
          res[key] = {
            layers: layers.length,
            nodeCount: all.length,
            noNext,
            badLink,
            bossReachable,
            unreachableCount: unreachable.length,
            unreachableSample: unreachable.slice(0, 5),
          };
        }
      }
      return res;
    }, { missions: MISSIONS, diffs: DIFFS, SABOTAGE });
    out.mapCheck = mapCheck;
    for (const [key, c] of Object.entries(mapCheck)) {
      t(`地图无死路：${key}`, c.noNext === 0, { noNext: c.noNext });
      t(`地图无跨层错链：${key}`, c.badLink === 0, { badLink: c.badLink });
      t(`BOSS 从起点可达：${key}`, c.bossReachable === true,
        { bossReachable: c.bossReachable });
      t(`无孤岛节点：${key}`, c.unreachableCount === 0,
        { count: c.unreachableCount, sample: c.unreachableSample });
    }

    // ---------- 3) 敌人构造结果 ----------
    const enemyCheck = await page.evaluate(({ missions, diffs }) => {
      const res = {};
      for (const m of missions) {
        for (const d of diffs) {
          const run = { missionId: m, difficultyId: d, layers: null };
          const bad = [];
          for (const type of ["normal", "elite", "boss"]) {
            for (let i = 0; i < 25; i++) {
              let list;
              try {
                list = window.DungeonEnemyGroups.enemiesFor(run, type, window.state);
              } catch (e) {
                bad.push(`${type}/throw:${String(e).slice(0, 80)}`);
                continue;
              }
              if (!Array.isArray(list) || !list.length) {
                bad.push(`${type}/empty`);
                continue;
              }
              for (const e of list) {
                if (!e || !e.id || !e.name || !(e.hp > 0)) {
                  bad.push(`${type}/invalid:${e ? e.id : "undefined"}`);
                }
              }
            }
          }
          res[`${m}/${d}`] = { badCount: bad.length, sample: bad.slice(0, 4) };
        }
      }
      return res;
    }, { missions: MISSIONS, diffs: DIFFS });
    out.enemyCheck = enemyCheck;
    for (const [key, c] of Object.entries(enemyCheck)) {
      t(`敌人构造有效：${key}`, c.badCount === 0, { bad: c.sample });
    }
  } catch (e) {
    out.err = String(e).slice(0, 400);
  }
  await page.close();
  await browser.close();
  out.summary = `通过 ${out.pass.length} / 失败 ${out.fail.length}`;
  console.log(JSON.stringify(out, null, 2));
  if (out.err) out.fail.push({ name: "执行异常", v: out.err });
  process.exitCode = out.fail.length ? 1 : 0;
})();
