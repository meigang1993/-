// 实战：贵族军士兵完整 6 阶段（准备/判定/摸牌/出牌/弃牌/结束）
// 重点：地雷是否误入判定阶段、回合结束是否误消耗、出牌阶段限一次
// 同时录像供人工复核
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const VIDEO_DIR = "/data/workspace/.video-soldier";
const OUT = "/data/workspace/士兵六阶段测试.mp4";

// 把敌方首位替换成贵族军士兵（保留 uid，避免破坏战斗结构）
const useSoldier = `(() => {
  const b = window.state.battle;
  const src = (window.GameDataRuinsSandCityEnemies || [])
    .find(e => e.id === "noble_soldier");
  if (!src || !b?.enemies?.length) return { missing: true };
  const e = b.enemies[0];
  Object.assign(e, {
    name: src.name, id: src.id, ai: src.ai, hp: 64, maxHp: 64,
    stats: { attack: 11, magic: 8, speed: 12 },
    handLimit: src.handLimit, drawPerTurn: src.drawPerTurn,
    usedRuinsLandmine: false,
  });
  e.skills = src.skills;
  return { name: e.name, ai: e.ai, uid: e.uid };
})()`;

const snapshot = `(() => {
  const b = window.state.battle;
  const allyHasMine = (b.allies || []).map(a => {
    const cards = [...(a.hand || []), ...(a.statuses || [])];
    return cards.filter(c => window.BattleStatusCardRegistry?.keyOf?.(c) === "landmine").length;
  });
  return {
    phase: b?.phase,
    activeUid: b?.activeUid,
    log: (window.state.log || []).slice(0, 60),
    mine: allyHasMine,
    rec: (window.__rec || []).slice(-60),
  };
})()`;

(async () => {
  fs.rmSync(VIDEO_DIR, { recursive: true, force: true });
  fs.mkdirSync(VIDEO_DIR, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: VIDEO_DIR, size: { width: 1280, height: 800 } },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e.message || e)));

  const results = [];
  const check = (name, ok, detail) => {
    results.push({ name, ok, detail });
    console.log(`${ok ? "✅" : "❌"} ${name}${detail ? "  " + detail : ""}`);
  };

  try {
    await startRegressionBattle(page);
    const who = await page.evaluate(useSoldier);
    check("敌方首位设为贵族军士兵", who?.name === "贵族军士兵",
      `${who?.name} ai=${who?.ai}`);

    const soldierUid = who?.uid;

    // 拦截 battle.phase 的每一次赋值。
    // AI 回合内 1→2→3 是同步完成的，任何轮询（哪怕 4ms）都必然漏掉，
    // 只有 setter 拦截能捕获全部阶段。
    await page.evaluate(() => {
      window.__rec = [];
      const b = window.state?.battle;
      if (!b) return;
      let v = b.phase;
      Object.defineProperty(b, "phase", {
        configurable: true,
        get: () => v,
        set: next => {
          v = next;
          try { window.__rec.push(`${b.activeUid}:${next}`); } catch (e) {}
        },
      });
    });

    // AI 回合常在两次轮询之间跑完，靠采样无法把日志归到阶段。
    // 改为拦截 BattleLog.add，让每条日志自带 (uid, phase)。
    await page.evaluate(() => {
      window.__logRec = [];
      const orig = window.BattleLog?.add;
      if (!orig) return;
      window.BattleLog.add = function (state, msg, ...rest) {
        try {
          const b = window.state?.battle;
          window.__logRec.push({
            uid: b?.activeUid, phase: b?.phase, msg: String(msg),
          });
        } catch (e) {}
        return orig.call(this, state, msg, ...rest);
      };
    });

    // 裁手牌到上限内，避免卡在弃牌阶段（弃牌需手动操作）
    await page.evaluate(() => {
      const b = window.state.battle;
      (b.allies || []).forEach(a => {
        if (a.hand && a.hand.length > 1) {
          const k = window.BattleStatusCardRegistry?.keyOf;
          const isS = c => { try { return !!k?.(c); } catch (e) { return false; } };
          // 裁掉普通牌即可，状态牌（地雷）必须保留，否则会被测试自己删掉
          a.hand = [...a.hand.filter(isS), ...a.hand.filter(c => !isS(c)).slice(0, 1)];
        }
      });
      window.state.log.length = 0;
    });
    await page.evaluate(async () => {
      const b = window.state.battle;
      (b.allies || []).forEach(a => {
        if (a.hand && a.hand.length > 1) {
          const k = window.BattleStatusCardRegistry?.keyOf;
          const isS = c => { try { return !!k?.(c); } catch (e) { return false; } };
          // 裁掉普通牌即可，状态牌（地雷）必须保留，否则会被测试自己删掉
          a.hand = [...a.hand.filter(isS), ...a.hand.filter(c => !isS(c)).slice(0, 1)];
        }
      });
      window.state.log.length = 0;
      await window.BattleSystem?.endPlay?.(window.state, window.render);
    });

    // 高频轮询：等士兵回合开始，捕获其 phase 序列与日志
    const timeline = [];
    const seen = [];
    let prevLog = [];
    let sawSoldier = false;
    for (let i = 0; i < 1200; i++) {
      const s = await page.evaluate(snapshot);
      const isSoldier = s.activeUid === soldierUid;
      const tag = `${s.activeUid}:${s.phase}`;
      if (seen[seen.length - 1] !== tag) seen.push(tag);
      if (isSoldier) sawSoldier = true;
      if (sawSoldier) {
        const fresh = s.log.filter(l => !prevLog.includes(l));
        const last = timeline[timeline.length - 1];
        if (last && last.phase === s.phase) last.lines.push(...fresh);
        else timeline.push({ phase: s.phase, lines: [...fresh], mine: s.mine });
      }
      prevLog = s.log;
      // 士兵走到结束阶段(6)即捕获完整，立即停止采样
      if (s.rec.includes(`${soldierUid}:6`)) break;
      // 士兵回合结束后（回合已交回我方）停止
      if (sawSoldier && !isSoldier && timeline.length > 3) break;
      // 我方角色出牌阶段：裁手牌并结束，推进到下一个角色（直到轮到敌方）
      const isAlly = String(s.activeUid || "").startsWith("a");
      if (!sawSoldier && isAlly && s.phase === 1) {
        await page.locator("[data-skip-extract]").click({ timeout: 700 })
          .catch(() => {});
      }
      if (!sawSoldier && isAlly && s.phase === 5) {
        await page.locator("[data-confirm-discard]").click({ timeout: 600 })
          .catch(() => {});
      }
      if (!sawSoldier && isAlly && s.phase === 4) {
        await page.evaluate(async () => {
          const b = window.state.battle;
          (b.allies || []).forEach(a => {
            if (a.hand && a.hand.length > 1) {
          const k = window.BattleStatusCardRegistry?.keyOf;
          const isS = c => { try { return !!k?.(c); } catch (e) { return false; } };
          // 裁掉普通牌即可，状态牌（地雷）必须保留，否则会被测试自己删掉
          a.hand = [...a.hand.filter(isS), ...a.hand.filter(c => !isS(c)).slice(0, 1)];
        }
          });
          await window.BattleSystem?.endPlay?.(window.state, window.render);
        }).catch(() => {});
      }
      await page.waitForTimeout(50);
    }
    const recNow = await page.evaluate(() => window.__rec || []);
    check("捕获到士兵回合", recNow.some(t => t.startsWith(`${soldierUid}:`)),
      `soldierUid=${soldierUid}`);
    console.log("uid:phase 流转 =", seen.join(" → "));
    console.log("单位 uid =", JSON.stringify(await page.evaluate(() => {
      const b = window.state.battle;
      return {
        allies: (b.allies || []).map(a => a.uid + "/" + a.name),
        enemies: (b.enemies || []).map(e => e.uid + "/" + e.name),
      };
    })));

    console.log("\n=== 士兵回合阶段时间线 ===");
    for (const seg of timeline) {
      console.log(`\n[phase=${seg.phase}] 地雷数=${JSON.stringify(seg.mine)}`);
      for (const l of seg.lines.slice(0, 12)) console.log("   " + l);
    }

    const rec = await page.evaluate(() => window.__rec || []);
    const e0phases = [...new Set(rec.filter(t => t.startsWith(`${soldierUid}:`))
      .map(t => t.split(":")[1]))];
    console.log("e0(士兵) 阶段序列 =", e0phases.join(" → "));
    check("士兵回合覆盖多个阶段", e0phases.length >= 3,
      `phases=${JSON.stringify(e0phases)}`);
    check("含准备阶段(1)", e0phases.includes("1"), "");
    check("含出牌阶段(4)", e0phases.includes("4"), "");

    const logRec = await page.evaluate(() => window.__logRec || []);
    const sLog = logRec.filter(r => r.uid === soldierUid);
    const byPhase = p => sLog.filter(r => String(r.phase) === String(p))
      .map(r => r.msg);
    console.log("\n=== 士兵日志（按阶段归因）===");
    for (const p of e0phases) {
      console.log(`  [phase=${p}] ${byPhase(p).length} 条`);
      for (const m of byPhase(p).slice(0, 10)) console.log("     " + m);
    }
    const p4 = byPhase(4).join(" | ");
    check("准备阶段有日志", byPhase(1).length > 0, `${byPhase(1).length} 条`);
    check("出牌阶段发动放置地雷",
      /放置地雷|埋设一颗地雷|地雷状态牌/.test(p4),
      `出牌日志 ${byPhase(4).length} 条`);
    const mineLines = sLog.filter(r => /埋设一颗地雷|发动放置地雷/.test(r.msg));
    check("放置地雷出牌阶段限一次", mineLines.length <= 1,
      `埋雷日志 ${mineLines.length} 条`);
    check("地雷未误入判定阶段", byPhase(2).every(m => !/地雷/.test(m)), "");
    const mineLine = sLog.find(r => /埋设一颗地雷|发动放置地雷/.test(r.msg)) || {};
    check("埋雷目标为我方", /贝丝妲魔偶|罗卡尔/.test(mineLine.msg || ""),
      String(mineLine.msg || "(无)").slice(0, 60));

    // 地雷结局：保留在手牌区，或已被响应牌触发消耗 —— 二者都合法。
    // 不能用"最终仍有雷"当判据：埋雷后我方用闪响应会立刻触发掉它。
    await page.waitForTimeout(1500);
    const after = await page.evaluate(snapshot);
    const allMsg = (await page.evaluate(() => window.__logRec || []))
      .map(r => r.msg).join(" | ");
    const kept = after.mine.some(n => n > 0);
    const fired = /地雷触发/.test(allMsg);
    check("地雷结局合法（保留或已触发消耗）", kept || fired,
      `保留=${kept} 地雷数=${JSON.stringify(after.mine)} 已触发=${fired}`);

    check("页面无错误", errors.length === 0, errors.slice(0, 2).join(" / "));
  } catch (e) {
    check("脚本异常", false, String(e.message || e).slice(0, 160));
  } finally {
    await context.close();
    await browser.close();
  }

  // 转 mp4
  try {
    const files = fs.readdirSync(VIDEO_DIR).filter(f => f.endsWith(".webm"));
    if (files.length) {
      const src = path.join(VIDEO_DIR, files[0]);
      fs.rmSync(OUT, { force: true });
      require("child_process").execSync(
        `ffmpeg -y -i "${src}" -c:v libx264 -pix_fmt yuv420p -movflags +faststart "${OUT}" 2>/dev/null`,
        { stdio: "pipe" });
    }
  } catch (e) { /* ffmpeg 不可用时保留 webm */ }

  const pass = results.filter(r => r.ok).length;
  console.log(`\n汇总：${pass} 通过 / ${results.length - pass} 失败`);
  console.log(`录像：${fs.existsSync(OUT) ? OUT : VIDEO_DIR}`);
  process.exit(pass === results.length ? 0 : 1);
})();
