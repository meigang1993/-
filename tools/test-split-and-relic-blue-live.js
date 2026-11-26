// 290 浏览器实机：拆分后子模块装配、🔵 饰品描述前缀、护驾伤害链无回归。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle, collectErrors, relevantErrors } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const passed = [];
const T = (n, ok, d = "") => {
  passed.push(ok);
  console.log(`${ok ? "✅" : "❌"} ${n}${ok ? "" : "  ← " + JSON.stringify(d)}`);
  return ok;
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = collectErrors(page);
  await openGame(page);
  await startRegressionBattle(page);

  const probe = await page.evaluate(() => {
    // 两个模块都是工厂函数，须实例化后才能检查导出接口。
    const sub = window.BattleDamageResolutionModifiers?.({ deps: {} });
    const main = window.BattleDamageResolution;
    const relics = ["霹雳之锤", "螺旋桨"].map(name => {
      const d = window.RelicSystem?.data?.(name);
      const sk = window.RelicSystem?.skillsForNames?.([name])?.[0];
      return {
        name, exists: !!d, skillType: d?.skillType || null,
        effect: d?.effect || "", icon: sk?.icon || null, text: sk?.text || "",
        statText: window.RelicSystem?.statText?.(name) || "",
      };
    });
    return {
      subExists: typeof window.BattleDamageResolutionModifiers === "function",
      subCompute: typeof sub?.compute,
      subKeys: sub && typeof sub === "object" ? Object.keys(sub).sort() : [],
      mainExists: typeof main,
      mainKeys: (() => {
        // 通过依赖装配一次拿到导出接口（不改战斗状态）
        const inst = window.BattleDamageResolution?.({
          deps: { isKillCard: () => false, draw: () => {} },
          utils: { queueAttackAnim: () => {} }, needsResponse: () => false,
          canDodge: () => false,
          getResponseApi: () => ({ shouldManualDodge: () => false, autoDodge: () => false }),
          getHitWithoutDodge: () => () => ({ dodged: false, hpLoss: 0 }),
        });
        return inst ? Object.keys(inst).sort() : [];
      })(),
      relics,
      version: [...new Set((document.documentElement.outerHTML.match(/20260915-\d+/g) || []))],
      bundleCount: document.querySelectorAll('script[src*="bundles/"]').length,
    };
  });
  console.log("PROBE", JSON.stringify(probe));

  T("A1 子模块 BattleDamageResolutionModifiers 已在真实页面装配且导出 compute",
    probe.subExists && probe.subCompute === "function"
    && probe.subKeys.join(",") === "compute", probe);
  T("A2 主模块 BattleDamageResolution 仍导出 { resolveDamage, triggerWhiteLolita }",
    probe.mainExists === "function" && probe.mainKeys.join(",") === "resolveDamage,triggerWhiteLolita",
    probe.mainKeys);
  const thunder = probe.relics.find(r => r.name === "霹雳之锤");
  const propeller = probe.relics.find(r => r.name === "螺旋桨");
  T("A3 霹雳之锤仍是 🔵 触发饰品，螺旋桨已转为 ⭐ 锁定饰品",
    !!thunder && !!propeller && thunder.skillType === "trigger" && thunder.icon === "🔵"
    && !propeller.skillType && propeller.icon === "⭐",
    probe.relics);
  T("A4 霹雳之锤 effect/text 带「非锁定技，」；螺旋桨带「锁定技，」且不含「你可以」",
    thunder.effect.startsWith("非锁定技，") && thunder.text.startsWith("非锁定技，")
    && propeller.effect.startsWith("锁定技，") && propeller.text.startsWith("锁定技，")
    && !propeller.effect.includes("你可以"),
    probe.relics.map(r => [r.name, r.effect.slice(0, 14), r.text.slice(0, 14)]));
  T("A5 图鉴/属性文本（statText）里的效果文案同步",
    thunder.statText.includes("效果：非锁定技，")
    && propeller.statText.includes("效果：锁定技，"),
    probe.relics.map(r => r.statText.slice(0, 130)));
  T("A6 页面版本戳唯一（跟随重建后的当前版本）",
    probe.version.length === 1, probe.version);
  T("A7 11 个 bundle 全部加载", probe.bundleCount === 11, probe.bundleCount);

  const rel = relevantErrors(errors);
  T("A8 全程无 pageerror / console error", rel.length === 0, rel.slice(0, 3));
  console.log(`\nRESULT ${passed.filter(Boolean).length}/${passed.length}`);
  await browser.close();
  process.exit(passed.every(Boolean) ? 0 : 1);
})();
