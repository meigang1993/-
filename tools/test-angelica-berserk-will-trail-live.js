// 实机：安洁莉卡【狂战意志】主动发动后的表现层
//   1) 出牌区真的渲染出「狂战意志」卡（DOM .card-trail + 数据快照）；
//   2) 技能牌图已删除：出牌区不再渲染技能牌、不再加载任何 skill-art 图；
//      数据快照（played / shownPlayed）仍保留技能身份供战报与存档使用；
//   3) 装备「帝血弑天」皮肤时，原【猩红暴走】8 段特效节点真的依次挂载；
//   4) 主动技按钮发动前可点击、发动一次后置灰、二次点击无效；
//   5) 主动发动播新台词「游戏结束了，看我全力进攻。」；
//   6) 无破图 / 无页面错误。
// 注意：主动技走 BattleEffects.play 飞牌动画，结算在动画 commit 之后，
// 必须等 usedBerserkWill 置位再取数据；皮肤特效最晚一段在发动后约 1.8s，
// 观察窗口需覆盖到 3.5s 以上。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "✅" : "❌"} ${name}${detail ? `  ← ${detail}` : ""}`);
};
const RAMPAGE = ["armor", "burst", "shock", "giant", "heal", "pulse", "rain", "core"]
  .map(k => `angelica-berserker-rampage-${k}`);

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_BIN || undefined,
    args: ["--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
  const errors = [], failedImages = [], failedOther = [];
  page.on("pageerror", e => errors.push(String(e.message || e)));
  page.on("requestfailed", r => {
    const u = r.url();
    (/\.(webp|png|jpe?g|gif)(\?|$)/i.test(u) ? failedImages : failedOther).push(u);
  });
  try {
    await startRegressionBattle(page);

    const injected = await page.evaluate(() => {
      const b = window.state.battle;
      const actor = b.allies[0];
      // 从页面真实角色数据取安洁莉卡模板，避免测试自造技能表。
      const pools = [window.GameData?.characters, window.GameDataCharacters,
        window.GameCharacters, window.GameData?.playableCharacters,
        window.GameData?.allCharacters];
      let tpl = null;
      for (const list of pools) {
        if (!Array.isArray(list)) continue;
        tpl = list.find(c => c && (c.id === "angelica" || c.ref === "angelica"));
        if (tpl) break;
      }
      const skills = (tpl?.skills || []).map(s => ({ ...s, card: s.card ? { ...s.card } : undefined }));
      Object.assign(actor, {
        ref: "angelica", name: "安洁莉卡", gender: "female",
        skills,
        stats: { ...(actor.stats || {}), attack: 9.6, maxHp: 154 },
        hp: 80, maxHp: 154, visualHp: 80,
        rageMarks: 3, usedBerserkWill: false, usedCrimsonRampage: false,
        intent: 3, intentMax: 3,
        skinDynamicEffect: "angelica-berserker",
        hand: [],
      });
      window.SkinSystem = window.SkinSystem || {};
      window.SkinSystem.dynamicEffectOf = () => "angelica-berserker";
      b.activeUid = actor.uid;
      b.phase = 4;
      b.locked = false;
      b.played = [];
      b.shownPlayed = [];
      b.animQueue = [];
      b.selectedSkillCard = null;
      b.selectedCardIndex = null;
      window.BattleEffects.animating = false;
      window.BattleEffects.draining = false;
      window.render();
      // MutationObserver 记录逐段挂载的特效节点（节点会在动画结束后被移除）。
      window.__fxSeen = new Set();
      window.__fxObs = new MutationObserver(muts => {
        const collect = node => {
          if (!node || node.nodeType !== 1) return;
          String(node.className || "").split(/\s+/).forEach(c => {
            if (c.startsWith("angelica-berserker-rampage")) window.__fxSeen.add(c);
          });
          node.querySelectorAll?.("[class*=angelica-berserker-rampage]")?.forEach(e =>
            String(e.className || "").split(/\s+/).forEach(c => {
              if (c.startsWith("angelica-berserker-rampage")) window.__fxSeen.add(c);
            }));
        };
        muts.forEach(m => m.addedNodes.forEach(collect));
      });
      window.__fxObs.observe(document.body, { childList: true, subtree: true });
      const buttons = Array.from(document.querySelectorAll("[data-skill-index]"));
      const willBtn = Array.from(document.querySelectorAll("button.skill"))
        .find(x => (x.textContent || "").includes("狂战意志"));
      const willSkill = skills.find(s => s.name === "狂战意志");
      return {
        tpl: !!tpl,
        skillNames: skills.map(s => s.name),
        buttons: buttons.map(x => ({ idx: x.dataset.skillIndex, text: (x.textContent || "").replace(/\s+/g, " ").trim() })),
        before: {
          hasBtn: !!willBtn,
          cls: willBtn?.className || "",
          ariaDisabled: willBtn?.getAttribute("aria-disabled") || "",
          dataSkillIndex: willBtn?.getAttribute("data-skill-index") || "",
          usable: window.UICommon?.skillState?.(actor, willSkill, b)?.usable,
          canPlay: window.BattleSystem?.canPlay?.(actor, { ...willSkill.card, _skill: true }, b),
          blocked: window.SkillOncePerTurn?.blocked?.(actor, { ...willSkill.card, _skill: true }, b),
        },
      };
    });
    check("注入成功：页面真实角色模板含合并后 2 个技能",
      injected.tpl && injected.skillNames.includes("狂战意志")
      && !injected.skillNames.includes("猩红暴走"),
      JSON.stringify(injected.skillNames));
    check("技能栏渲染出「狂战意志」主动技按钮",
      injected.buttons.some(x => x.text.includes("狂战意志")),
      JSON.stringify(injected.buttons));
    check("发动前按钮可点击：data-skill-index 在位、无 disabled、canPlay 为真",
      injected.before.hasBtn && injected.before.dataSkillIndex !== ""
      && !/\bdisabled\b/.test(injected.before.cls)
      && injected.before.ariaDisabled !== "true"
      && injected.before.usable === true && injected.before.canPlay === true
      && injected.before.blocked === false, JSON.stringify(injected.before));

    const btn = page.locator("[data-skill-index]").filter({ hasText: "狂战意志" }).first();
    await btn.click();
    // 飞牌动画结束后才结算；等一次性标记置位，最多 12s。
    let settled = false;
    try {
      await page.waitForFunction(() =>
        window.state?.battle?.allies?.[0]?.usedBerserkWill === true,
      { timeout: 12000 });
      settled = true;
    } catch (_) { /* 下面用数据断言报红 */ }
    check("点击主动技后真的完成结算（飞牌动画 commit）", settled);

    const data = await page.evaluate(() => {
      const b = window.state.battle;
      const played = b?.played || [], shown = b?.shownPlayed || [];
      const hit = played.find(c => c.name === "狂战意志")
        || shown.find(c => c.name === "狂战意志");
      return {
        playedCount: played.length, shownCount: shown.length,
        hit: !!hit,
        skillName: hit?.skillName || "",
        action: hit?._playedAction || "",
        by: hit?._playedByName || "",
        rage: b?.allies?.[0]?.rageMarks,
        used: !!b?.allies?.[0]?.usedBerserkWill,
      };
    });
    check("出牌区数据含「狂战意志」快照（played 或 shownPlayed）",
      data.hit, JSON.stringify(data));
    check("快照带技能名 / 「发动了」 / 出牌者",
      data.skillName === "狂战意志" && data.action === "发动了"
      && data.by === "安洁莉卡", JSON.stringify(data));
    check("效果真的结算（3 枚标记清零、一次性标记置位）",
      data.rage === 0 && data.used, JSON.stringify({ rage: data.rage, used: data.used }));

    // 等台词气泡挂载（BattleSpeechController 经 setTimeout(0) 后 render）
    try {
      await page.waitForFunction(() => {
        const s = window.state?.battle?.speech;
        const texts = (s?.lines || []).map(l => l.text || "").concat(s?.text || "");
        return texts.some(t => t.includes("游戏结束了，看我全力进攻"));
      }, { timeout: 5000 });
    } catch (_) { /* 下面用数据断言报红 */ }
    const post = await page.evaluate(() => {
      const b = window.state.battle;
      const actor = b.allies[0];
      const willSkill = actor.skills.find(s => s.name === "狂战意志");
      const card = { ...willSkill.card, _skill: true };
      const willBtn = Array.from(document.querySelectorAll("button.skill"))
        .find(x => (x.textContent || "").includes("狂战意志"));
      const speech = b.speech;
      const texts = (speech?.lines || []).map(l => l.text || "").concat(speech?.text || "");
      const idx = window.UICommon.skillsOf(actor).findIndex(s => s.name === "狂战意志");
      const playedBefore = (b.played || []).length;
      const selectAgain = window.BattleSystem.selectSkill(window.state, idx);
      return {
        btn: {
          cls: willBtn?.className || "",
          ariaDisabled: willBtn?.getAttribute("aria-disabled") || "",
          dataSkillIndex: willBtn?.getAttribute("data-skill-index") || "",
        },
        usable: window.UICommon?.skillState?.(actor, willSkill, b)?.usable,
        canPlay: window.BattleSystem?.canPlay?.(actor, card, b),
        blocked: window.SkillOncePerTurn?.blocked?.(actor, card, b),
        speechTexts: texts,
        log: (b.log || []).join(" | "),
        selectAgain, playedBefore, playedAfter: (b.played || []).length,
        selectedSkillCard: b.selectedSkillCard?.name || null,
      };
    });
    check("发动一次后按钮置灰：disabled 类 + aria-disabled + 移除 data-skill-index",
      /\bdisabled\b/.test(post.btn.cls) && post.btn.ariaDisabled === "true"
      && post.btn.dataSkillIndex === "" && post.usable === false
      && post.canPlay === false && post.blocked === true, JSON.stringify(post.btn));
    check("二次点击无效：selectSkill 返回 false、不重复结算、不选中技能卡",
      post.selectAgain === false && post.playedAfter === post.playedBefore
      && post.selectedSkillCard === null,
      JSON.stringify({ selectAgain: post.selectAgain, played: [post.playedBefore, post.playedAfter] }));
    check("主动发动播新台词「游戏结束了，看我全力进攻。」且旧台词不再出现",
      post.speechTexts.some(t => t.includes("游戏结束了，看我全力进攻"))
      && !post.speechTexts.some(t => t.includes("接下来，老子使出全力了"))
      && !post.log.includes("接下来，老子使出全力了"),
      JSON.stringify({ texts: post.speechTexts, log: post.log.slice(-120) }));

    const dom = await page.evaluate(() => {
      const trails = Array.from(document.querySelectorAll(".card-trail"));
      const hit = trails.find(t => (t.textContent || "").includes("狂战意志"));
      const img = hit?.querySelector("img");
      const allSrc = trails.map(t => t.querySelector("img")?.getAttribute("src") || "");
      const skillCard = { name: "狂战意志", type: "tactic", _skill: true, skillName: "狂战意志" };
      const normalCard = { name: "杀", type: "slash" };
      return {
        trailCount: trails.length,
        hit: !!hit,
        text: (hit?.textContent || "").replace(/\s+/g, " ").slice(0, 160),
        src: img?.getAttribute("src") || "",
        naturalWidth: img?.naturalWidth || 0,
        allSrc,
        skillUrl: window.CardArt?.url?.(skillCard) ?? "MISSING",
        skillFallback: window.CardArt?.fallbackUrl?.(skillCard) ?? "MISSING",
        normalUrl: window.CardArt?.url?.(normalCard) || "",
      };
    });
    check("出牌区 DOM 不再渲染「狂战意志」技能牌",
      !dom.hit, JSON.stringify({ count: dom.trailCount, text: dom.text }));
    check("出牌区没有任何 skill-art 图 / 无技能兜底图",
      !dom.allSrc.some(s => s.includes("skill-art") || s.includes("card-art-charge")),
      JSON.stringify(dom.allSrc));
    check("技能牌仍不解析任何卡图（CardArt.url 为空串）",
      dom.skillUrl === "" && dom.skillFallback === "",
      JSON.stringify({ url: dom.skillUrl, fb: dom.skillFallback }));
    check("普通卡牌图案未被误删（card-art 仍可解码）",
      /card-art-/.test(dom.normalUrl), dom.normalUrl);
    check("数据层仍保留技能身份（played/shownPlayed）",
      data.hit && data.skillName === "狂战意志", JSON.stringify(data));

    // 皮肤特效最晚一段 core 在发动后约 1.75s；再留足余量。
    await page.waitForTimeout(3600);
    const fx = await page.evaluate(() => ({
      seen: Array.from(window.__fxSeen || []),
      nodes: document.querySelectorAll("[class*=angelica-berserker-rampage]").length,
    }));
    check("皮肤 8 段原特效节点逐段挂载（合并后仍由狂战意志触发）",
      RAMPAGE.every(c => fx.seen.includes(c)),
      `seen=${RAMPAGE.filter(c => fx.seen.includes(c)).length}/8 ${JSON.stringify(fx.seen)}`);

    check("无图片请求失败 / 无页面错误",
      failedImages.length === 0 && errors.length === 0,
      JSON.stringify({ images: failedImages.slice(0, 3), errors: errors.slice(0, 3),
        otherFailed: failedOther.length }));
  } catch (e) {
    check("实机流程无异常", false, String(e && e.stack || e).slice(0, 500));
  } finally {
    console.log(`\nRESULT ${pass}/${pass + fail}`);
    await browser.close();
    if (fail) process.exitCode = 1;
  }
})();
