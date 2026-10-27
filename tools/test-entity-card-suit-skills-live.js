// 实体牌限定回归（实机）：
//   A 同频歌姬：实体牌正常触发（同色摸牌 + 花色记录）
//   B 同频歌姬：技能牌/虚拟牌不触发、不记录花色
//   C 偶像之星：实体牌颜色切换，仅星野依本人摸牌（诺诺卡在场也不摸）
//   D 偶像之星/巨蛋演出/梦想真理：技能牌不触发、不计使命、不记花色
//   E 新月之歌：实体牌记录花色并摸牌；技能牌/虚拟牌不记录、不摸牌
// 反向：撤掉 isEntityCard 判定后 B/D/E 段必须变红。
//
// 分批：ENTITY_PART=A|B|C|D|E，不设则跑全部。
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const PART = (process.env.ENTITY_PART || "ALL").toUpperCase();
const want = p => PART === "ALL" || PART === p;
let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
};

const draw = `(unit, count) => {
  for (let i = 0; i < count; i++) unit.hand.push({ name: "测试摸牌", type: "tactic", suit: "♦" });
  return [{ name: "测试摸牌" }];
}`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  try {
    await startRegressionBattle(page);

    const base = `(() => {
      const st = window.state, b = st.battle;
      b.animQueue = []; b.locked = false; b.phase = 4;
      window.BattleDrawFeedback = window.BattleDrawFeedback || { action: () => "摸了1张牌", team: () => "各摸1张牌" };
      // 回归战斗默认只有 2 名友方，第三个槽位要自己补（此前直接取 allies[2] 恒为 undefined）。
      const mk = (u, ref, name, skills) => {
        if (!u) {
          u = { uid: "x-" + ref, side: "ally", statuses: [], hand: [] };
          b.allies.push(u);
        }
        u.name = name; u.ref = ref; u.id = ref; u.gender = "female";
        u.hp = u.maxHp = 60; u.block = 0; u.intent = 1;
        u.stats = { attack: 3, magic: 3, speed: 3, maxHp: 60, bloodlust: 1, handLimit: 6 };
        u.skills = skills; u.hand = [];
        return u;
      };
      mk(b.allies[0], "abe_karuna", "安倍卡露娜", [{ name: "同频歌姬" }, { name: "记忆泡泡" }, { name: "幸运海螺" }]);
      mk(b.allies[1], "hoshino_yi", "星野依", [{ name: "偶像之星" }, { name: "巨蛋演出" }, { name: "梦想真理" }]);
      mk(b.allies[2], "nonoka", "诺诺卡", []);
      b.enemies.forEach(e => { e.hp = e.maxHp = 200; e.hand = []; e.noResponse = true; });
      st.log = []; st.battleLog = [];
      window.render();
      return { allies: b.allies.length };
    })()`;
    const setup = await page.evaluate(base);
    T("构造：3 名友方（卡露娜/星野依/诺诺卡）", setup.allies >= 3, setup);

    // ---------- A 歌姬：实体牌正常触发 ----------
    if (want("A")) {
      const a = await page.evaluate(`(() => {
        const st = window.state, b = st.battle, u = b.allies[0];
        delete u.karunaLastColor; delete u.karunaLastSuit;
        const draw = ${draw};
        // 技能本身不改手牌，出牌消耗要自己模拟（此前漏了 pop，断言恒红）。
        const play = (suit, extra) => {
          const before = u.hand.length;
          u.hand.pop();
          const card = Object.assign({ name: "牌", type: "tactic", suit }, extra || {});
          window.AbeKarunaDivaSkills.afterCardPlayed(st, u, card, { draw });
          return { before, after: u.hand.length, drawn: u.hand.length - (before - 1) };
        };
        u.hand = [{ name: "1", type: "tactic", suit: "♥" }, { name: "2", type: "tactic", suit: "♥" }];
        const afterFirst = Object.assign(play("♥"), { suit: u.karunaLastSuit || null });
        u.hand = [{ name: "2", type: "tactic", suit: "♥" }];
        const afterSecond = Object.assign(play("♥"), { suit: u.karunaLastSuit || null });
        u.hand = [{ name: "3", type: "tactic", suit: "♠" }];
        const afterThird = Object.assign(play("♠"), { suit: u.karunaLastSuit || null });
        return { afterFirst, afterSecond, afterThird, log: (st.battleLog || []).join(" / ") };
      })()`);
      T("A1 首张实体牌记录花色", a.afterFirst.suit === "♥", a.afterFirst);
      T("A2 首张实体牌不摸牌", a.afterFirst.drawn === 0, a.afterFirst);
      T("A3 同色实体牌触发摸牌", a.afterSecond.drawn === 1, a.afterSecond);
      T("A4 换色实体牌不摸牌", a.afterThird.drawn === 0, a.afterThird);
      T("A5 换色后花色记录更新", a.afterThird.suit === "♠", a.afterThird);
    }

    // ---------- B 歌姬：技能牌/虚拟牌不触发 ----------
    if (want("B")) {
      const b = await page.evaluate(`(() => {
        const st = window.state, bt = st.battle, u = bt.allies[0];
        delete u.karunaLastColor; delete u.karunaLastSuit;
        const draw = ${draw};
        st.battleLog = [];
        u.hand = [{ name: "红", type: "tactic", suit: "♥" }];
        u.hand.pop();
        window.AbeKarunaDivaSkills.afterCardPlayed(st, u, { name: "红", type: "tactic", suit: "♥" }, { draw });
        const baseSuit = u.karunaLastSuit || null;
        // 技能牌：type === "skill"
        u.hand = [{ name: "技能牌", type: "skill", suit: "♣" }];
        u.hand.pop();
        window.AbeKarunaDivaSkills.afterCardPlayed(st, u, { name: "技能牌", type: "skill", suit: "♣" }, { draw });
        const afterSkill = { drawn: u.hand.length, suit: u.karunaLastSuit || null, log: (st.battleLog || []).join(" / ") };
        // 虚拟牌：virtual === true
        u.hand = [{ name: "虚拟牌", type: "tactic", suit: "♦", virtual: true }];
        u.hand.pop();
        window.AbeKarunaDivaSkills.afterCardPlayed(st, u, { name: "虚拟牌", type: "tactic", suit: "♦", virtual: true }, { draw });
        const afterVirtual = { drawn: u.hand.length, suit: u.karunaLastSuit || null };
        return { baseSuit, afterSkill, afterVirtual };
      })()`);
      T("B1 技能牌不摸牌（手牌−1 未被补回）", b.afterSkill.drawn === 0, b.afterSkill);
      T("B2 技能牌不改写花色记录", b.afterSkill.suit === "♥", b.afterSkill);
      T("B3 技能牌不触发战报", !/同频歌姬/.test(b.afterSkill.log), { log: b.afterSkill.log });
      T("B4 虚拟牌不摸牌", b.afterVirtual.drawn === 0, b.afterVirtual);
      T("B5 虚拟牌不改写花色记录", b.afterVirtual.suit === "♥", b.afterVirtual);
    }

    // ---------- C 偶像之星：仅星野依摸牌 ----------
    if (want("C")) {
      const c = await page.evaluate(`(() => {
        const st = window.state, b = st.battle;
        const yi = b.allies[1], n = b.allies[2];
        delete yi.hoshinoLastColor; delete yi.hoshinoLastSuit; yi.hoshinoSuitSet = [];
        delete yi.hoshinoMissionResult; yi.hoshinoMissionCards = 0;
        const draw = ${draw};
        yi.hand = []; n.hand = [];
        const enemy = b.enemies[0];
        window.HoshinoYiSkills.afterCardPlayed(st, yi, enemy, { name: "红", type: "tactic", suit: "♥" }, { draw, damage() {} });
        const first = { yi: yi.hand.length, n: n.hand.length };
        yi.hand = [];
        window.HoshinoYiSkills.afterCardPlayed(st, yi, enemy, { name: "黑", type: "tactic", suit: "♠" }, { draw, damage() {} });
        const second = { yi: yi.hand.length, n: n.hand.length, mission: yi.hoshinoMissionCards };
        return { first, second };
      })()`);
      T("C1 首张实体牌不触发（无上一张）", c.first.yi === 0 && c.first.n === 0, c.first);
      T("C2 换色后星野依摸 1 张", c.second.yi === 1, c.second);
      T("C3 诺诺卡在场也不摸牌", c.second.n === 0, c.second);
      T("C4 实体牌计入使命计数", c.second.mission === 2, c.second);
    }

    // ---------- D 星野依：技能牌不触发 ----------
    if (want("D")) {
      const d = await page.evaluate(`(() => {
        const st = window.state, b = st.battle, yi = b.allies[1];
        delete yi.hoshinoLastColor; delete yi.hoshinoLastSuit; yi.hoshinoSuitSet = [];
        delete yi.hoshinoMissionResult; yi.hoshinoMissionCards = 0;
        const draw = ${draw};
        const enemy = b.enemies[0];
        yi.hand = [];
        window.HoshinoYiSkills.afterCardPlayed(st, yi, enemy, { name: "红", type: "tactic", suit: "♥" }, { draw, damage() {} });
        const missionAfterEntity = yi.hoshinoMissionCards;
        yi.hand = [];
        window.HoshinoYiSkills.afterCardPlayed(st, yi, enemy, { name: "技能牌", type: "skill", suit: "♠" }, { draw, damage() {} });
        const afterSkill = {
          yi: yi.hand.length, suit: yi.hoshinoLastSuit || null,
          set: [...(yi.hoshinoSuitSet || [])], mission: yi.hoshinoMissionCards,
        };
        yi.hand = [];
        window.HoshinoYiSkills.afterCardPlayed(st, yi, enemy, { name: "虚拟", type: "tactic", suit: "♦", virtual: true }, { draw, damage() {} });
        const afterVirtual = {
          yi: yi.hand.length, suit: yi.hoshinoLastSuit || null,
          set: [...(yi.hoshinoSuitSet || [])], mission: yi.hoshinoMissionCards,
        };
        return { missionAfterEntity, afterSkill, afterVirtual };
      })()`);
      T("D1 实体牌计入使命", d.missionAfterEntity === 1, d);
      T("D2 技能牌不触发偶像之星摸牌", d.afterSkill.yi === 0, d.afterSkill);
      T("D3 技能牌不改写花色记录", d.afterSkill.suit === "♥", d.afterSkill);
      T("D4 技能牌不进巨蛋花色集", d.afterSkill.set.join("") === "♥", d.afterSkill);
      T("D5 技能牌不计入使命", d.afterSkill.mission === 1, d.afterSkill);
      T("D6 虚拟牌不触发摸牌", d.afterVirtual.yi === 0, d.afterVirtual);
      T("D7 虚拟牌不进花色集", d.afterVirtual.set.join("") === "♥", d.afterVirtual);
    }

    // ---------- E 新月之歌：实体牌触发，技能牌/虚拟牌不触发 ----------
    if (want("E")) {
      const e = await page.evaluate(`(() => {
        const st = window.state, b = st.battle, u = b.allies[2];
        const draw = ${draw};
        const reset = () => { u.newMoonActive = true; u.newMoonSuits = []; u.hand = []; st.battleLog = []; };
        const play = card => {
          window.NonokaNewMoonSkills.trackCard(st, u, card, { draw });
          return { suits: [...(u.newMoonSuits || [])], hand: u.hand.length, log: (st.battleLog || []).join(" / ") };
        };
        reset();
        const afterEntity = play({ name: "红", type: "tactic", suit: "♥" });
        reset();
        const afterSkill = play({ name: "技能牌", type: "skill", suit: "♠" });
        reset();
        const afterVirtual = play({ name: "虚拟牌", type: "tactic", suit: "♦", virtual: true });
        return { afterEntity, afterSkill, afterVirtual };
      })()`);
      T("E1 实体牌记录花色", e.afterEntity.suits.join("") === "♥", e.afterEntity);
      T("E2 实体牌摸 1 张", e.afterEntity.hand === 1, e.afterEntity);
      T("E3 实体牌进入战报", /新月之歌/.test(e.afterEntity.log), e.afterEntity);
      T("E4 技能牌不记录花色", e.afterSkill.suits.length === 0, e.afterSkill);
      T("E5 技能牌不摸牌", e.afterSkill.hand === 0, e.afterSkill);
      T("E6 技能牌无战报", !/新月之歌/.test(e.afterSkill.log), e.afterSkill);
      T("E7 虚拟牌不记录花色", e.afterVirtual.suits.length === 0, e.afterVirtual);
      T("E8 虚拟牌不摸牌", e.afterVirtual.hand === 0, e.afterVirtual);
    }

    T("无页面错误", errors.length === 0, errors.slice(0, 3));
  } catch (e) {
    console.log(`❌ EXCEPTION ${e.message}`);
    total++;
  } finally {
    console.log(`\n${pass}/${total} 通过`);
    await browser.close();
    process.exit(pass === total ? 0 : 1);
  }
})();
