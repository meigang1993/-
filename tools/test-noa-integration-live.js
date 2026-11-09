// 怪面诺亚 · 实机集成检查
//   A 羁绊任务池：未解锁不入池 / 解锁后能生成以她为目标的羁绊任务
//   B 管家手册魅魔目标：列出怪面诺亚
//   C 第三次全军覆没剧情：对话、完成按钮、只开放兑换不直接入栏
//   D 孕育殿堂：100 精华宝珠唤醒
//   E 真实开局：登场台词、特殊立绘、手牌恒等与动态上限、杀牌免杀意
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const {
  openGame, startFreshGame, dismissOpeningStory, collectErrors, relevantErrors,
} = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
};
const INTRO = "啊啊……身体好热";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = collectErrors(page);
  try {
    await openGame(page);
    await startFreshGame(page);
    await dismissOpeningStory(page);
    await page.locator("[data-open-butler]").waitFor({ state: "visible", timeout: 30000 });

    // ============ A 羁绊任务池 ============
    const poolLocked = await page.evaluate(() => {
      const st = window.state;
      const c = st.chars.find(x => x.id === "noa");
      if (c) c.locked = true;
      let hits = 0;
      for (let i = 0; i < 60; i++) {
        const t = window.BountyTasks?.generate?.(st, { hunt: new Set(), bond: new Set() });
        if (t?.type === "bond" && t.charId === "noa") hits++;
      }
      return { has: !!c, hits };
    });
    T("A1 角色栏含怪面诺亚", poolLocked.has === true, poolLocked);
    T("A2 未解锁时不进羁绊任务池", poolLocked.hits === 0, poolLocked);
    const poolOpen = await page.evaluate(() => {
      const st = window.state;
      const c = st.chars.find(x => x.id === "noa");
      if (c) c.locked = false;
      let hits = 0, name = null;
      for (let i = 0; i < 60; i++) {
        const t = window.BountyTasks?.generate?.(st, { hunt: new Set(), bond: new Set() });
        if (t?.type === "bond" && t.charId === "noa") { hits++; name = t.charName; }
      }
      return { hits, name };
    });
    T("A3 解锁后能生成她的羁绊任务", poolOpen.hits > 0, poolOpen);
    T("A4 羁绊任务角色名正确", poolOpen.name === "怪面诺亚", poolOpen);

    // ============ B 管家手册魅魔目标 ============
    await page.evaluate(() => {
      const st = window.state;
      const c = st.chars.find(x => x.id === "noa");
      if (c) c.locked = true;
      st.butlerManual = true;
      st.butlerTab = "hero";
      window.render?.();
    });
    await page.locator("[data-butler-tab='hero']").waitFor({ state: "visible", timeout: 10000 });
    const heroNames = (await page.locator(".butler-hero b").allTextContents()).map(s => s.trim());
    T("B1 魅魔目标列出怪面诺亚", heroNames.includes("怪面诺亚"), heroNames.length);
    T("B2 魅魔目标共 34 名", heroNames.length === 34, heroNames.length);

    // ============ C 第三次全军覆没剧情 ============
    const trigger = await page.evaluate(() => {
      const st = window.state;
      st.butlerManual = false;
      st.view = "hall";
      st.flags = st.flags || {};
      st.flags.thirdDefeatSeen = true;
      delete st.flags.noaNurseryUnlocked;
      st.hallModal = null;
      const fired = !!window.StoreUnlockMigrations?.recoverPendingDefeatEvents?.(st);
      window.render?.();
      return { fired, modal: st.hallModal, fn: typeof window.VillaEvents?.thirdDefeat };
    });
    await page.waitForTimeout(350);
    // 剧情是 ADV 逐句播放，初始 DOM 只有第一句与「继续」按钮，完成按钮在结尾才出现。
    const seen = [];
    for (let i = 0; i < 14; i++) {
      const step = await page.evaluate(() => ({
        text: document.querySelector(".adv-box")?.textContent || "",
        done: !!document.querySelector("[data-third-defeat-complete]"),
      }));
      if (step.text) seen.push(step.text);
      if (step.done) break;
      await page.evaluate(() => {
        const box = document.querySelector(".adv-box[data-adv-advance]");
        if (box) box.click();
      });
      await page.waitForTimeout(130);
    }
    const joined = seen.join("|");
    const evt = {
      fired: trigger.fired, modal: trigger.modal, fn: trigger.fn,
      lines: seen.length,
      hasLines: ["罗卡尔，你又失败了。", "地下室封印着强大的魅力改造者", "多给她男人，不然她会发狂的。", "好的，妈妈，有了我会试试。"].every(s => joined.includes(s)),
    };
    T("C1 第三次全军覆没触发剧情弹窗", evt.fired && evt.modal === "thirdDefeat", evt);
    T("C2 对话逐句渲染且关键句齐全", evt.hasLines === true, { lines: evt.lines, sample: joined.slice(0, 220) });
    if (!await page.locator("[data-third-defeat-complete]").count()) {
      await page.evaluate(() => { window.AdvDialogue?.skip?.(); window.render?.(); });
      await page.waitForTimeout(300);
    }
    T("C3 剧情完成按钮存在", await page.locator("[data-third-defeat-complete]").count() > 0);
    await page.locator("[data-third-defeat-complete]").evaluate(el => el.click());
    await page.waitForTimeout(400);
    const afterEvent = await page.evaluate(() => ({
      flag: !!window.state.flags?.noaNurseryUnlocked,
      locked: !!window.state.chars.find(c => c.id === "noa")?.locked,
    }));
    T("C4 完成后开放兑换且未直接入栏", afterEvent.flag === true && afterEvent.locked === true, afterEvent);

    // ============ D 孕育殿堂兑换 ============
    const nursery = await page.evaluate(() => {
      const st = window.state;
      st.resources.essence = 100;
      st.view = "nursery";
      st.hallModal = null;
      window.render?.();
      const text = document.querySelector(".villa-page")?.textContent || "";
      return {
        hasName: text.includes("怪面诺亚"),
        hasPrice: text.includes("100"),
        btn: !!document.querySelector("[data-unlock='noa']"),
        disabled: !!document.querySelector("[data-unlock='noa']")?.disabled,
      };
    });
    T("D1 殿堂展示怪面诺亚与100宝珠", nursery.hasName && nursery.hasPrice && nursery.btn, nursery);
    T("D2 兑换按钮可用", nursery.disabled === false, nursery);
    await page.locator("[data-unlock='noa']").evaluate(el => el.click());
    await page.waitForTimeout(500);
    const bought = await page.evaluate(() => {
      const c = window.state.chars.find(x => x.id === "noa");
      return { locked: !!c?.locked, essence: window.state.resources.essence };
    });
    T("D3 唤醒成功且扣除100宝珠", bought.locked === false && bought.essence === 0, bought);

    // ============ E 真实开局 ============
    await page.evaluate(noSkin => {
      const st = window.state;
      const c = st.chars.find(x => x.id === "noa");
      if (c) { c.locked = false; c.level = 10; }
      st.equippedSkins = st.equippedSkins || {};
      // NOA_NO_SKIN=1 用于反向验证：不装备时 E7 必须变红。
      if (!noSkin) st.equippedSkins.noa = "noa_level_10_special";
      else delete st.equippedSkins.noa;
      st.view = "hall";
      st.testAllies = ["noa", "lokar"];
      st.testEnemies = [0];
      st.hallModal = "testBattle";
      st.settings = st.settings || {};
      st.settings.battleSpeed = 2;
      window.render?.();
    }, !!process.env.NOA_NO_SKIN);
    await page.locator("[data-start-test-battle]").waitFor({ state: "visible", timeout: 15000 });
    T("E0 登场台词入口未被置空", await page.evaluate(() =>
      !/intro\s*=\s*\(\)\s*=>\s*0/.test(String(window.BattleLines?.intro || ""))));
    await page.locator("[data-start-test-battle]").evaluate(el => el.click());
    await page.locator(".battle-screen").waitFor({ state: "visible", timeout: 30000 });
    T("E1 已真实进入战斗画面", true);

    let introSeen = false, introDebug = null;
    for (let i = 0; i < 48 && !introSeen; i++) {
      const shot = await page.evaluate(() => {
        const b = window.state?.battle;
        const dom = [...document.querySelectorAll(
          ".speech-box, .adv-box, .battle-speech, .unit-speech, .speech-line")]
          .map(n => n.textContent || "").join(" | ");
        return {
          speech: b?.speech ? JSON.stringify(b.speech) : "",
          dom,
          line: window.BattleLineData?.allyIntroLines?.noa || "",
        };
      });
      introSeen = (shot.speech + shot.dom).includes(INTRO);
      if (!introSeen) { introDebug = shot; await page.waitForTimeout(250); }
    }
    T("E2 登场台词在界面播放", introSeen === true, introSeen ? {} : {
      speech: (introDebug?.speech || "").slice(0, 220),
      dom: (introDebug?.dom || "").slice(0, 220),
      line: (introDebug?.line || "").slice(0, 60),
    });

    const battle = await page.evaluate(() => {
      const b = window.state?.battle;
      const noa = (b?.allies || []).find(u => u.ref === "noa");
      const males = (b?.allies || []).filter(u => u.hp > 0 && u.gender === "male").length;
      return {
        hasNoa: !!noa,
        limit: noa ? window.UICommon?.handLimit?.(noa) : null,
        hand: noa ? (noa.hand || []).filter(c => !c._pendingDraw).length : null,
        males,
        free: noa ? !!window.NoaCharmSkills?.noIntentCost?.(noa, { name: "杀（普攻）", type: "slash" }) : null,
        sideCount: (b?.allies || []).length,
        skin: [...document.querySelectorAll(".battle-screen img")]
          .some(img => (img.getAttribute("src") || "").includes("noa-level-10-special")),
      };
    });
    T("E3 怪面诺亚参战", battle.hasNoa === true, battle);
    T("E4 手牌上限=基础4+存活男性数", battle.limit === 4 + battle.males, battle);
    let handState = null;
    for (let i = 0; i < 24; i++) {
      handState = await page.evaluate(() => {
        const b = window.state?.battle;
        const n = (b?.allies || []).find(u => u.ref === "noa");
        const hand = n?.hand || [];
        return {
          hand: hand.filter(c => !c._pendingDraw).length,
          raw: hand.length,
          pending: hand.filter(c => c._pendingDraw).length,
          limit: n ? window.UICommon?.handLimit?.(n) : null,
        };
      });
      if (handState.hand === handState.limit) break;
      await page.waitForTimeout(200);
    }
    T("E5 魅力改造令手牌恒等于上限", handState.hand === handState.limit, handState);
    // 开局恰好摸满不等于技能生效，主动制造缺口再验「摸至上限」。
    const charmProof = await page.evaluate(() => {
      const st = window.state, n = st.battle.allies.find(u => u.ref === "noa");
      const limit = window.UICommon.handLimit(n);
      n.hand = n.hand.filter(c => !c._pendingDraw).slice(0, Math.max(0, limit - 2));
      const before = n.hand.length;
      window.NoaCharmSkills.balanceHand(st, n, window.BattleSystem.draw);
      return { before, after: n.hand.length, limit };
    });
    T("E5b 手牌少于上限时魅力改造摸至上限",
      charmProof.before < charmProof.limit && charmProof.after === charmProof.limit, charmProof);
    const revert = await page.evaluate(() => {
      const st = window.state, n = st.battle.allies.find(u => u.ref === "noa");
      const limit = window.UICommon.handLimit(n);
      n.hand = n.hand.filter(c => !c._pendingDraw).slice(0, Math.max(0, limit - 2));
      const before = n.hand.length;
      const saved = window.NoaCharmSkills.balanceHand;
      window.NoaCharmSkills.balanceHand = () => 0;
      window.NoaCharmSkills.balanceHand(st, n, window.BattleSystem.draw);
      const after = n.hand.length;
      window.NoaCharmSkills.balanceHand = saved;
      window.NoaCharmSkills.balanceHand(st, n, window.BattleSystem.draw);
      return { before, after, limit };
    });
    T("E5c 反向：禁用平衡后不会补齐", revert.after === revert.before && revert.after < revert.limit, revert);
    T("E6 杀牌免杀意判据已装配", battle.free === true, battle);
    // 串行跑时战斗可能仍停在登场字幕/等待态（行头像区没渲染完，DOM 里只有 3 张
    // img），单跑恰好已推进才过。先解除字幕锁、把行动权交给诺亚并重新渲染，
    // 再在整页找立绘 img 且要求真实解码；不装皮肤时仍必须找不到（反向验证）。
    await page.evaluate(() => {
      const b = window.state?.battle;
      const noa = (b?.allies || []).find(u => u.ref === "noa");
      if (b && noa) { b.activeUid = noa.uid; b.locked = false; }
      if (window.BattleLines?.dismiss) window.BattleLines.dismiss(window.state);
      window.render?.();
    });
    let skinProof = { found: false, imgs: 0 };
    for (let i = 0; i < 40; i++) {
      skinProof = await page.evaluate(() => {
        const imgs = [...document.querySelectorAll("img")];
        const hit = imgs.find(img =>
          (img.getAttribute("src") || "").includes("noa-level-10-special"));
        return hit
          ? { found: true, src: hit.getAttribute("src"), natural: hit.naturalWidth, imgs: imgs.length }
          : { found: false, imgs: imgs.length };
      });
      if (skinProof.found && skinProof.natural > 0) break;
      await page.waitForTimeout(200);
    }
    T("E7 10级特殊立绘真实渲染", skinProof.found === true && skinProof.natural > 0, skinProof);
    T("E8 全程无页面错误", relevantErrors(errors).length === 0, relevantErrors(errors).slice(0, 3));
  } finally {
    await browser.close();
  }
  console.log(`\nRESULT ${pass}/${total}`);
  if (pass !== total) process.exit(1);
})();
