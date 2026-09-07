const { test, expect } = require("@playwright/test");
const {
  openGame,
} = require("./helpers/preview-game");

test("active-skill artwork stays lazy until its first card render", async ({ page }) => {
  const requested = [];
  page.on("request", request => {
    if (request.url().includes("skill-art-poison-grenade")) {
      requested.push(request.url());
    }
  });
  await openGame(page);
  const result = await page.evaluate(async () => {
    let total = 0;
    await window.GameAssets.preloadBattle("art-audit", [], [{
      name: "克罗博士",
      skills: [{ name: "毒气手雷", type: "active" }],
    }], (_done, count) => { total = count; });
    const requestedBeforeRender = performance.getEntriesByName(
      new URL(window.CardArt.url({
        name: "毒气手雷", type: "tactic", _skill: true,
      }), document.baseURI).href
    ).length;
    const image = new Image();
    image.src = window.CardArt.url({
      name: "毒气手雷", type: "tactic", _skill: true,
    });
    await image.decode();
    return {
      total,
      requestedBeforeRender,
      complete: image.complete,
      width: image.naturalWidth,
      height: image.naturalHeight,
    };
  });
  expect(requested).toHaveLength(1);
  expect(result.total).toBe(0);
  expect(result.requestedBeforeRender).toBe(0);
  expect(result.complete).toBe(true);
  expect(result.width).toBeGreaterThan(0);
  expect(result.height).toBeGreaterThan(0);
});

test("a failed lazy skill image falls back without repeated broken requests", async ({ page }) => {
  await openGame(page);
  const result = await page.evaluate(async () => {
    const originalUrl = window.CardArt.url;
    const missing = "./assets/generated/cards/missing-lazy-skill.webp";
    window.CardArt.url = card => card?.name === "懒加载失败测试" ? missing : originalUrl(card);
    const host = document.createElement("div");
    host.innerHTML = window.UICommon.card({
      name: "懒加载失败测试", type: "tactic", _skill: true, skillName: "懒加载失败测试",
    }, false);
    document.body.append(host);
    const image = host.querySelector(".card-art img");
    await new Promise(resolve => {
      if (image.complete && image.naturalWidth) resolve();
      else {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", resolve, { once: true });
      }
    });
    const firstSrc = image.getAttribute("src");
    const markedFailed = window.GameAssets.failed(missing);
    host.innerHTML = window.UICommon.card({
      name: "懒加载失败测试", type: "tactic", _skill: true, skillName: "懒加载失败测试",
    }, false);
    const rerenderSrc = host.querySelector(".card-art img")?.getAttribute("src");
    host.remove();
    window.CardArt.url = originalUrl;
    return { firstSrc, rerenderSrc, markedFailed };
  });
  expect(result.markedFailed).toBe(true);
  expect(result.firstSrc).toContain("card-art-charge.bfb8fcb9.webp");
  expect(result.rerenderSrc).toContain("card-art-charge.bfb8fcb9.webp");
});
