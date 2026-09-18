// 实战：群体杀（流星杀/机枪扫杀）在手动响应模式下，是否对每个我方角色依次弹窗
//
// 构造要点（此前版本噪声太大，AI 会随机出别的牌、混进其它伤害源）：
//   - 只留一个敌人可行动，并 hook BattleAI.choose 强制其打出被测牌
//     （验证目标是"响应弹窗流程"，不是 AI 决策，故强制出牌是合理构造）
//   - 其余敌人手牌清空、杀意置 0，排除额外伤害源
//   - 遇到贝丝妲「榨取精华」阻塞则点跳过
//
// 检查点：
//   1. 手动模式下 AOE 会弹窗（此前被 shouldManualDodge 的 sweep 排除条件挡掉）
//   2. 多个我方角色依次弹窗，不是只弹第一个（manualDodge 不被覆盖、伤害不丢失）
//   3. 出闪者免伤、不出闪者掉血，且掉血值 = 伤害值
//   4. 自动模式下仍自动出闪、不弹窗（回归）
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const CARDS = ["流星杀", "机枪扫杀"];
const MODES = ["manual", "auto"];
const DMG = 10;   // 注入时把攻击者攻击力设为 10，便于精确断言掉血值

const inject = (cardName, mode) => `(() => {
  const b = window.state.battle;
  window.state.settings = window.state.settings || {};
  window.state.settings.manualResponse = ${mode === "manual"};
  const findCard = n => {
    // 必须优先取"运行时"卡牌对象（eliteCards/cardCodex），
    // 而不是原始定义数组：卡牌会经过 cardFields/cardEntry 字段白名单，
    // 取原始定义会掩盖"字段被白名单丢弃"的问题（曾据此误判修复生效）。
    const src = [window.GameDataCards?.eliteCards, window.GameData?.cardCodex,
      window.GameDataCards?.cards, window.GameData?.cards,
      window.GameDataRuinsContent?.cards];
    for (const l of src) {
      if (Array.isArray(l)) {
        const c = l.find(x => x?.name === n);
        if (c) return JSON.parse(JSON.stringify(c));
      }
    }
    return null;
  };
  const card = findCard(${JSON.stringify(cardName)});
  if (!card) return { missing: true };
  const e1 = b.enemies[1] || b.enemies[0];
  // 其余敌人：清空手牌、杀意 0，避免额外出牌与伤害
  b.enemies.forEach(e => {
    e.hand = []; e.killIntent = 0;
    e.stats = e.stats || {}; e.stats.killIntent = 0;
  });
  e1.hand = [card];
  e1.stats = e1.stats || {};
  e1.stats.attack = ${DMG}; e1.stats.magic = ${DMG};
  e1.killIntent = 1; e1.stats.killIntent = 1;
  b.allies.forEach(u => {
    u.hand = [{ name: "闪", type: "response", suit: "♥" }];
    u.hp = 120; u.maxHp = 120; u.block = 0;
    u.stats = u.stats || {}; u.stats.handLimit = 99;
  });
  window.__target = { name: ${JSON.stringify(cardName)}, uid: e1.uid };
  window.__initHp = b.allies.map(u => ({ uid: u.uid, name: u.name, hp: u.hp }));
  window.__prompts = [];
  // 强制出牌：只对 e1 生效，且必须带 target（targetless 卡传 null 会被自动出牌循环跳过）
  if (!window.__chooseHooked) {
    const orig = window.BattleAI.choose;
    window.BattleAI.choose = function (bb, actor, canPlay) {
      const t = window.__target;
      if (t && actor && actor.uid === t.uid && actor.hand?.length) {
        const pick = actor.hand.find(c => c?.name === t.name);
        if (pick) {
          window.__log = window.__log || [];
          window.__log.push({ actor: actor.name, move: pick.name, forced: true });
          return { card: pick, target: bb.allies?.[0] || null };
        }
      }
      return null;
    };
    window.__chooseHooked = true;
  }
  window.__log = [];
  window.render();
  return { missing: false, allies: window.__initHp.length, attacker: e1.name };
})()`;

const snap = () => `(() => {
  const b = window.state.battle;
  const t = b?.manualDodge
    ? (b.allies.concat(b.enemies).find(u => u.uid === b.manualDodge.targetUid) || {}).name
    : null;
  return {
    manual: !!b?.manualDodge,
    target: t,
    initHp: window.__initHp,
    hp: b.allies.map(u => ({ name: u.name, hp: u.hp })),
    log: (window.state.log || []).slice(0, 20),
    moves: (window.__log || []).map(x => x.move),
    extract: /榨取精华/.test((window.state.log || []).slice(0, 6).join("|")),
  };
})()`;

(async () => {
  const browser = await chromium.launch();
  const out = {};
  for (const mode of MODES) {
    for (const name of CARDS) {
      const key = `${mode}/${name}`;
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      const errors = [];
      page.on("pageerror", e => errors.push(String(e)));
      try {
        await openGame(page);
        await startRegressionBattle(page);
        const inj = await page.evaluate(inject(name, mode));
        if (inj.missing) { out[key] = { err: "卡牌缺失" }; await page.close(); continue; }
        await page.locator("button", { hasText: "结束出牌" }).first().click();

        const prompts = [];
        const total = inj.allies;
        let acted = 0;
        // 轮询要足够久：AOE 对多个角色是"依次"弹窗，第二个弹窗可能迟到，
        // 早先的 i>25 / 400ms 组合会在抓到第二个之前就 break，造成 flaky。
        let missBtn = 0;
        for (let i = 0; i < 150; i++) {
          const st = await page.evaluate(snap());
          // 榨取精华会阻塞回合推进，必须跳过
          if (st.extract) {
            const skip = page.locator("button", { hasText: "跳过榨取" }).first();
            if (await skip.count()) { await skip.click().catch(() => {}); }
          }
          if (st.manual && st.target) {
            if (!prompts.includes(st.target)) {
              prompts.push(st.target);
              const use = prompts.length === 1;   // 第一个出闪，其余不出
              const sel = use ? "[data-manual-dodge-use]" : "[data-manual-dodge-cancel]";
              // 加固：按钮可能尚未渲染完成；且首点偶发未生效会让弹窗挂住，
              // 后续目标永远等不到弹窗（曾造成 弹窗=["罗卡尔"] 的 flaky 误报）。
              // 故点击后必须确认状态已推进，未推进则重试。
              for (let retry = 0; retry < 4; retry++) {
                const btn = page.locator(sel).first();
                try {
                  await btn.waitFor({ state: "visible", timeout: 3000 });
                  await btn.click({ timeout: 3000 });
                  await page.waitForTimeout(300);
                  const after = await page.evaluate(snap());
                  if (!after.manual || after.target !== st.target) { acted += 1; break; }
                } catch (e) { /* 渲染未完成，继续重试 */ }
              }
              await page.waitForTimeout(250);
              continue;
            }
            // 目标已弹过但仍停留：按钮点击可能没生效，重试一次
            if (missBtn > 5) break;
            await page.waitForTimeout(250);
            continue;
          }
          if (prompts.length >= total) break;
          await page.waitForTimeout(300);
        }
        const fin = await page.evaluate(snap());
        out[key] = {
          prompts, acted, expected: total, attacker: inj.attacker,
          initHp: fin.initHp, hp: fin.hp, moves: fin.moves,
          log: fin.log, errors: errors.slice(0, 2),
        };
      } catch (e) {
        out[key] = { err: String(e).slice(0, 220) };
      }
      await page.close();
    }
  }
  await browser.close();

  console.log("\n===== 群体杀 × 自动/手动响应 实战 =====");
  let pass = 0, fail = 0;
  Object.entries(out).forEach(([k, r]) => {
    if (r.err) { console.log(`  ${k.padEnd(16)} ❌ ${r.err}`); fail++; return; }
    const isManual = k.startsWith("manual");
    const clean = r.prompts.filter(p => !p.includes("("));
    const distinct = new Set(clean).size;
    const allPrompted = clean.length >= r.expected;
    const played = r.moves.includes(k.split("/")[1]);
    // 第一个弹窗者出闪 → 应免伤；其余应各掉 DMG
    const firstIdx = r.initHp.findIndex(u => u.name === clean[0]);
    const dodgerSafe = firstIdx >= 0 && r.hp[firstIdx]?.hp === r.initHp[firstIdx].hp;
    const others = r.initHp.map((u, i) => (i === firstIdx ? null : {
      name: u.name, lost: u.hp - (r.hp[i]?.hp ?? u.hp),
    })).filter(Boolean);
    const othersLostExactly = others.every(o => o.lost === DMG);
    let ok, detail;
    const card = k.split("/")[1];
    // 血量会被攻击者的其它技能（如机器魅魔「爱之鞭挞」）污染，
    // 故以战报做精确断言：出闪者不应出现"被本卡命中"的记录，不出闪者应有。
    const joined = (r.log || []).join("|");
    const dodger = clean[0], skipper = clean[1];
    const dodgerHit = dodger
      ? new RegExp(`${card}对${dodger}造成`).test(joined) : null;
    const dodgerUsed = dodger
      ? new RegExp(`${dodger} 手动使用.*闪，抵消`).test(joined) : false;
    const skipperHit = skipper
      ? new RegExp(`${card}对${skipper}造成${DMG}伤害`).test(joined) : false;
    const skipperSkipped = skipper
      ? new RegExp(`${skipper} 没有使用闪`).test(joined) : false;
    if (isManual) {
      ok = played && allPrompted && distinct >= 2
        && dodgerUsed && dodgerHit === false && skipperHit && skipperSkipped;
      detail = `出闪者[${dodger}]用闪=${dodgerUsed} 被命中=${dodgerHit} / 不出者[${skipper}]被命中=${skipperHit} 放弃=${skipperSkipped}`;
    } else {
      const autoUsed = (r.log || []).some(l => typeof l === "string"
        && (l.includes("自动使用闪") || l.includes("自动打出杀")));
      ok = played && r.prompts.length === 0 && autoUsed;
      detail = `无弹窗=${r.prompts.length === 0} 自动出闪=${autoUsed}`;
    }
    ok ? pass++ : fail++;
    console.log(`  ${k.padEnd(16)} ${ok ? "✅" : "❌"} 打出=${played} 弹窗=${JSON.stringify(r.prompts)} 期望${r.expected}人/不重复${distinct}`);
    console.log(`      血量 初始=${JSON.stringify(r.initHp.map(u => u.hp))} 终=${JSON.stringify(r.hp.map(u => u.hp))} ${detail}`);
    console.log(`      战报=${JSON.stringify((r.log || []).slice(0, 6))}`);
    if (r.errors && r.errors.length) console.log(`      错误=${r.errors.join(";")}`);
  });
  console.log(`汇总：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})();
