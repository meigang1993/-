// 【魔刀阿波罗 / 角色牌存储牌】扣置飞牌「背面朝上」实机回归。
// 真实浏览器里对 1/2/3 张不同扣牌数逐次播放 sealCards 动画，拦截 DOM 工厂：
//   · 只创建 1 个背面牌 DOM，0 个正面牌 DOM
//   · dataset.cardFace=back / is-back / 背面牌背图
//   · 正面侧 DOM 已清空（无牌名、无卡图、无效果文字）
//   · 叠层也是牌背图，×N 角标与一次性放牌（1 次落位）不变
//   · 返还链路仍产出 fromZone=characterCard 的 gainCards 事件
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle, collectErrors, relevantErrors } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const passed = [];
const T = (name, ok, detail = "") => {
  passed.push(!!ok);
  console.log(`${ok ? "✅" : "❌"} ${name}${ok ? "" : "  ← " + JSON.stringify(detail)}`);
  return !!ok;
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = collectErrors(page);
  await openGame(page);
  await startRegressionBattle(page);

  const out = await page.evaluate(async () => {
    const st = window.state, b = st.battle;
    const nanali = b.allies[0], target = b.enemies[0];
    b.allies = [nanali]; b.enemies = [target];
    b.test = false; b.locked = false; b.phase = 4;
    st.settings.battleSpeed = 2;
    const mk = (n, type = "tactic") => ({ name: n, suit: "♣", type });
    Object.assign(nanali, { ref: "nanali", name: "娜娜莉", hp: 200, maxHp: 200,
      block: 0, defenseSystem: 0, skills: [], discard: [], consumed: [] });
    Object.assign(target, { ref: "test_enemy", name: "测试敌人", side: "enemy",
      ai: null, hp: 300, maxHp: 300, block: 0, defenseSystem: 0,
      skills: [], discard: [], consumed: [] });

    const cases = [
      { label: "扣1", targetN: 1, actorExtra: 0, count: 1 },
      { label: "扣2", targetN: 3, actorExtra: 1, count: 2 },
      { label: "扣3", targetN: 5, actorExtra: 2, count: 3 },
    ];
    const outCases = [];
    for (const c of cases) {
      b.animQueue = [];
      window.BattleEffectHandlers.clearVisuals(st);
      delete target.visualHandCount;
      target.storedCards = [];
      target.storedDiscarded = false;
      target.hp = 300;
      target.hand = Array.from({ length: c.targetN }, (_, i) => mk(`目标牌${i}`));
      nanali.hand = Array.from({ length: c.actorExtra }, (_, i) => mk(`娜牌${i}`));
      const slash = { name: "杀（普攻）", suit: "♠", type: "slash", power: 1,
        scale: "attack", ignoreResponse: true };
      window.ElranaAceNanaliSkills.beforeKillTargeted(st, nanali, target, slash,
        { draw() {} });
      const ev = b.animQueue.find(e => e.type === "sealCards");
      b.animQueue = [];
      window.render();
      await window.BattleEffects.whenIdle();

      const origBack = window.BattleEffectCardDOM.back;
      const origFront = window.BattleEffectCardDOM.front;
      const origLand = window.BattleFX.cardLand;
      let backCount = 0, frontCount = 0, landCount = 0, info = null;
      window.BattleEffectCardDOM.back = (...args) => {
        const el = origBack(...args);
        backCount++;
        // placeStoredCards 在 back() 返回后同步清空正面侧并 append 叠层/角标；
        // microtask 在动画 await 之前、元素仍在 document 中时取样。
        queueMicrotask(() => {
          const front = el.querySelector(".card-flight-front");
          const backSide = el.querySelector(".card-flight-back");
          const layer = el.querySelector(".stored-place-layer");
          info = {
            cardFace: el.dataset.cardFace,
            cls: el.className,
            frontChildren: front ? front.children.length : -1,
            frontText: front ? front.textContent.trim() : "",
            frontImgs: front ? front.querySelectorAll("img").length : -1,
            backBg: backSide ? getComputedStyle(backSide).backgroundImage : "",
            layerBg: layer ? getComputedStyle(layer).backgroundImage : "",
            badge: el.querySelector(".stored-place-count")?.textContent || "",
            layers: el.querySelectorAll(".stored-place-layer").length,
          };
        });
        return el;
      };
      window.BattleEffectCardDOM.front = (...args) => {
        frontCount++; return origFront(...args);
      };
      window.BattleFX.cardLand = (...args) => { landCount++; return origLand(...args); };

      await window.BattleEffectHandlers.sealCards(ev, () => {}, () => true);
      window.BattleEffectCardDOM.back = origBack;
      window.BattleEffectCardDOM.front = origFront;
      window.BattleFX.cardLand = origLand;

      outCases.push({
        label: c.label, count: c.count,
        eventCount: ev?.count ?? null,
        toCharacterCard: !!ev?.toCharacterCard,
        backCount, frontCount, landCount, info,
        stored: window.BattleCharacterCardStorage.count(target),
      });
    }
    return { cases: outCases, return: (() => {
      b.animQueue = [];
      window.NanaliSealed.returnSealed(st);
      return b.animQueue.filter(e => e.type === "gainCards")
        .map(e => ({ fromZone: e.fromZone, count: e.count }));
    })() };
  });

  for (const c of out.cases) {
    const i = c.info || {};
    T(`A ${c.label}：事件 count=${c.count} 且落点仍是角色牌`,
      c.eventCount === c.count && c.toCharacterCard === true && c.stored === c.count, c);
    T(`B ${c.label}：只创建 1 个背面 DOM / 0 个正面 DOM / 1 次落位`,
      c.backCount === 1 && c.frontCount === 0 && c.landCount === 1, c);
    T(`C ${c.label}：cardFace=back + is-back + 牌背图在位`,
      i.cardFace === "back" && String(i.cls).includes("is-back")
      && String(i.cls).includes("stored-card-place")
      && String(i.backBg).includes("succubus-card-back"), i);
    T(`D ${c.label}：正面侧 DOM 清空（无牌名 / 无卡图 / 无效果文字）`,
      i.frontChildren === 0 && i.frontText === "" && i.frontImgs === 0, i);
    T(`E ${c.label}：叠层也是牌背图 + ×${c.count} 角标 + 叠层数正确`,
      i.badge === `×${c.count}`
      && i.layers === Math.min(3, c.count) - 1
      // 扣 1 张时整摞没有叠层，layerBg 为空是预期
      && (i.layers === 0 ? i.layerBg === ""
        : String(i.layerBg).includes("succubus-card-back")), i);
  }
  T("F 返还链路未改：回合结束仍产出 fromZone=characterCard 的 gainCards 事件",
    out.return.length > 0 && out.return.every(e => e.fromZone === "characterCard"), out.return);
  const rel = relevantErrors(errors);
  T("G 全程无 pageerror / console error", rel.length === 0, rel.slice(0, 3));
  console.log(`\nRESULT ${passed.filter(Boolean).length}/${passed.length}`);
  await browser.close();
  process.exit(passed.every(Boolean) ? 0 : 1);
})().catch(e => { console.error("LIVE_FAIL", e.message); process.exit(2); });
