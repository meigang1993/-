// 专项实战：娜娜莉「杀戮魔女」皮肤在真实浏览器中的立绘、样式与技能特效
//   验证：立绘真实加载（非破图/非兜底）、专属 CSS 被动态引入、待机 class 生效、
//   魔刀阿波罗血链 / 虚弱斩杀恶魔阵 真的产出特效节点，且页面无报错。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

function check(name, cond, extra) {
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return cond ? 1 : 0;
}

const setup = `(() => {
  const b = window.state.battle;
  const skin = window.SkinSystem.byId("nanali_slaughter_witch");
  if (!skin) return { fatal: "skin missing" };
  const unit = b.allies[0];
  unit.ref = "nanali"; unit.id = "nanali"; unit.name = "娜娜莉"; unit.face = "娜";
  unit.art = skin.art; unit.avatar = skin.art;
  unit.skinName = skin.name; unit.skinDynamicEffect = skin.dynamicEffect;
  window.state.equippedSkins = Object.assign({}, window.state.equippedSkins, { nanali: skin.id });
  window.state.ownedSkins = Object.assign({}, window.state.ownedSkins, { [skin.id]: true });
  window.render();
  const target = b.enemies[0];
  window.__witchCtx = { state: window.state, actor: unit, target };
  const art = document.querySelector(".ally-main .unit-art img");
  return {
    artSrc: art ? art.getAttribute("src") : null,
    artW: art ? art.naturalWidth : 0,
    optional: window.GameBattleStyles.optionalFor({
      state: window.state, allyIds: ["nanali"],
    }),
  };
})()`;

const idle = `(() => {
  window.NanaliSlaughterWitchSkinFX.sync(window.state);
  return {
    idleCount: document.querySelectorAll(".nanali-witch-idle").length,
    active: window.NanaliSlaughterWitchSkinFX.active(window.__witchCtx.actor),
  };
})()`;

const apollo = `(() => {
  const { state, actor, target } = window.__witchCtx;
  window.NanaliSlaughterWitchSkinFX.apolloSeal(state, actor, target,
    [{ type: "dodge" }, { type: "tactic" }, { type: "slash" }]);
  return { fired: true };
})()`;

const weak = `(() => {
  const { state, actor, target } = window.__witchCtx;
  window.NanaliSlaughterWitchSkinFX.weaknessExecute(state, actor, target);
  return { fired: true };
})()`;

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", e => errors.push(String(e)));
  await startRegressionBattle(page);

  let pass = 0, total = 0;
  const T = (n, c, x) => { total++; pass += check(n, c, x); };

  const s = await page.evaluate(setup);
  if (s.fatal) { console.log("❌ setup failed:", s.fatal); await browser.close(); process.exit(1); }

  // 立绘是换 src 后立即取样，需等浏览器真正解码完成
  const artLoaded = await page.waitForFunction(`(() => {
    const img = document.querySelector(".ally-main .unit-art img");
    return !!img && img.complete && img.naturalWidth > 0;
  })()`, null, { timeout: 8000 }).then(() => true).catch(() => false);
  s.artW = await page.evaluate(`(() => {
    const img = document.querySelector(".ally-main .unit-art img");
    return img ? img.naturalWidth : 0;
  })()`);
  s.artSrc = await page.evaluate(`(() => {
    const img = document.querySelector(".ally-main .unit-art img");
    return img ? img.getAttribute("src") : null;
  })()`);

  console.log("实测:", JSON.stringify({ artSrc: s.artSrc, artW: s.artW, artLoaded }));

  T("立绘指向杀戮魔女资源", !!s.artSrc && s.artSrc.includes("nanali-slaughter-witch"), s.artSrc);
  T("立绘真实加载成功（非破图）", s.artW > 0, { artW: s.artW });
  const cssHref = (s.optional || []).find(href => href.includes("nanali-slaughter-witch-skin.css"));
  T("装备后专属 CSS 会被引入", !!cssHref, s.optional);
  // file:// 下 fetch 受 CORS 限制，改为让页面真实加载该样式表并校验规则已解析
  const cssProbe = cssHref ? await page.evaluate(async href => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    const loaded = await new Promise(res => {
      link.onload = () => res(true);
      link.onerror = () => res(false);
      document.head.appendChild(link);
    });
    if (!loaded) return { loaded: false };
    // file:// 下跨域样式表的 cssRules 不可读，改从渲染层验证规则真的作用到了元素
    const probe = document.createElement("div");
    probe.className = "nanali-witch-entering";
    document.body.appendChild(probe);
    const anim = getComputedStyle(probe).animationName;
    probe.remove();
    return { loaded: true, anim };
  }, cssHref) : { loaded: false };
  T("专属 CSS 可被浏览器加载", cssProbe.loaded === true, { cssHref, cssProbe });
  T("专属 CSS 规则作用于渲染", cssProbe.anim === "nanaliWitchEntryDrop", cssProbe);

  const i = await page.evaluate(idle);
  T("皮肤控制器判定生效", i.active === true, i);
  T("待机动作 class 已挂载", i.idleCount > 0, i);

  await page.evaluate(apollo);
  await page.waitForTimeout(420);
  const apolloDom = await page.evaluate(`(() => ({
    eye: document.querySelectorAll(".nanali-witch-eye").length,
    crescent: document.querySelectorAll(".nanali-witch-crescent").length,
    chains: document.querySelectorAll(".nanali-witch-chains").length,
    chainLinks: document.querySelectorAll(".nanali-witch-chains i").length,
  }))()`);
  console.log("阿波罗实测:", JSON.stringify(apolloDom));
  T("魔刀阿波罗：独眼锁定特效", apolloDom.eye > 0, apolloDom);
  T("魔刀阿波罗：血色残月刀气", apolloDom.crescent > 0, apolloDom);
  T("魔刀阿波罗：血链锁住扣置牌", apolloDom.chains > 0 && apolloDom.chainLinks === 3, apolloDom);

  await page.waitForTimeout(400);
  const breakDom = await page.evaluate(`document.querySelectorAll(".nanali-witch-chain-break").length`);
  T("魔刀阿波罗：战术牌锁链崩断回流", breakDom > 0, { breakDom });

  await page.evaluate(weak);
  await page.waitForTimeout(120);
  const circleDom = await page.evaluate(`document.querySelectorAll(".nanali-witch-circle").length`);
  await page.waitForTimeout(420);
  // 跃起(170ms 生成/560ms) 与劈砍(430ms 生成/680ms) 在此刻都仍在场，一次采样
  const weakDom = await page.evaluate(`({
    circle: document.querySelectorAll(".nanali-witch-circle").length,
    leap: document.querySelectorAll(".nanali-witch-leap").length,
    cleave: document.querySelectorAll(".nanali-witch-cleave").length,
    cross: document.querySelectorAll(".nanali-witch-cross").length,
  })`);
  const crossDom = weakDom.cross;
  console.log("虚弱斩杀实测:", JSON.stringify({ circleDom, weakDom }));
  T("虚弱斩杀：血色恶魔阵", circleDom > 0, { circleDom });
  T("虚弱斩杀：收翼跃至半空", weakDom.leap > 0, weakDom);
  T("虚弱斩杀：开山之势劈砍刀芒", weakDom.cleave > 0, weakDom);
  T("虚弱斩杀：十字血色斩击", crossDom > 0, weakDom);

  // 出场：巨刀砸入地面（内部命名已统一为 blade，非 sword）
  const entryDom = await page.evaluate(`(() => {
    const { state, actor } = window.__witchCtx;
    window.NanaliSlaughterWitchSkinFX.entry(state, actor);
    const box = document.querySelector(".nanali-witch-entry");
    const b = box ? box.querySelector("b") : null;
    return {
      entry: document.querySelectorAll(".nanali-witch-entry").length,
      anim: b ? getComputedStyle(b).animationName : null,
    };
  })()`);
  console.log("出场实测:", JSON.stringify(entryDom));
  T("出场动画：巨刀砸入地面", entryDom.entry > 0, entryDom);
  T("出场动画：巨刀命名为 blade（非 sword）", entryDom.anim === "nanaliWitchBladeSlam", entryDom);

  // 胜利：巨刀插地（class 已统一为 nanali-victory-blade）
  const victoryProbe = await page.evaluate(`(() => {
    const mk = cls => {
      const p = document.createElement("span");
      p.className = cls;
      document.body.appendChild(p);
      const anim = getComputedStyle(p).animationName;
      p.remove();
      return anim;
    };
    return { blade: mk("nanali-victory-blade"), sword: mk("nanali-victory-sword") };
  })()`);
  console.log("胜利实测:", JSON.stringify(victoryProbe));
  T("胜利动画：巨刀命名为 blade（非 sword）", victoryProbe.blade === "nanaliWitchVictoryBlade", victoryProbe);
  T("胜利动画：旧 sword 命名已无样式残留", victoryProbe.sword === "none", victoryProbe);

  // 切换回默认皮肤后特效必须停止
  const off = await page.evaluate(`(() => {
    const { actor } = window.__witchCtx;
    window.state.equippedSkins.nanali = "nanali_default";
    window.NanaliSlaughterWitchSkinFX.sync(window.state);
    return {
      active: window.NanaliSlaughterWitchSkinFX.active(actor),
      idleCount: document.querySelectorAll(".nanali-witch-idle").length,
    };
  })()`);
  T("卸下皮肤后控制器失效", off.active === false, off);
  T("卸下皮肤后待机特效清除", off.idleCount === 0, off);

  T("页面无 JS 错误", errors.length === 0, errors.slice(0, 3));

  await browser.close();
  console.log(`\n通过 ${pass}/${total}`);
  process.exit(pass === total ? 0 : 1);
})();
