// 对比【同频歌姬】（卡露娜）与【偶像之星】（星野依）的花色徽标显示位置。
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  try {
    await startRegressionBattle(page);
    await page.evaluate(() => {
      const st = window.state, b = st.battle;
      b.animQueue = []; b.locked = false;
      const mk = (u, ref, name) => {
        u.name = name; u.ref = ref; u.id = ref; u.hp = u.maxHp = 50;
        u.stats = { attack: 2, magic: 4, speed: 3, maxHp: 50, bloodlust: 1, handLimit: 3 };
        u.hand = []; u.intent = 1;
        return u;
      };
      mk(b.allies[0], "abe_karuna", "安倍卡露娜");
      b.allies[0].skills = [{ name: "同频歌姬" }, { name: "记忆泡泡" }, { name: "幸运海螺" }];
      b.allies[0].karunaLastSuit = "♦"; b.allies[0].karunaLastColor = "red";
      if (b.allies[1]) {
        mk(b.allies[1], "hoshino_yi", "星野依");
        b.allies[1].skills = [{ name: "偶像之星" }, { name: "巨蛋演出" }, { name: "梦想真理" }];
        b.allies[1].hoshinoLastSuit = "♥"; b.allies[1].hoshinoLastColor = "red";
        b.allies[1].hoshinoSuitSet = ["♥"];
        b.allies[1].hoshinoMissionCards = 3;
      }
      window.render();
    });
    await page.waitForTimeout(600);
    const info = await page.evaluate(() => {
      const cards = [...document.querySelectorAll(".unit-main")];
      const out = [];
      cards.forEach(card => {
        const name = (card.querySelector(".unit-name")?.textContent || "").trim();
        const art = card.querySelector(".unit-art, .portrait, img");
        const badges = [...card.querySelectorAll(".idol-suit-badge, .dome-suit-badge, .mission-badge")];
        badges.forEach(badge => {
          const br = badge.getBoundingClientRect(), cr = card.getBoundingClientRect();
          const ar = art ? art.getBoundingClientRect() : null;
          out.push({
            cardName: name,
            text: (badge.textContent || "").trim(),
            cls: badge.className,
            parent: badge.parentElement?.className || "",
            relCard: {
              left: Math.round(br.left - cr.left), top: Math.round(br.top - cr.top),
              right: Math.round(cr.right - br.right), bottom: Math.round(cr.bottom - br.bottom),
            },
            relArt: ar ? { left: Math.round(br.left - ar.left), top: Math.round(br.top - ar.top) } : null,
            size: { w: Math.round(br.width), h: Math.round(br.height) },
          });
        });
      });
      return out;
    });
    console.log(JSON.stringify(info, null, 2));
    await page.screenshot({ path: "/data/workspace/karuna_suit_pos.png" });
    const panel = await page.locator(".unit-main").first();
    if (await panel.count()) await panel.screenshot({ path: "/data/workspace/karuna_suit_pos_card.png" }).catch(() => {});
  } catch (e) {
    console.log("EXCEPTION", e.message);
  } finally {
    await browser.close();
  }
})();
