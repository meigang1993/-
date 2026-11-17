// 实机：单体恢复牌不可指定满血角色
//   1) 新模块 BattleHealTargetRules 真的随 startup 装配进浏览器（纯 Node 夹具证不到）；
//   2) 满血队友 DOM 无 selectable-target、受伤队友有、敌方无；
//   3) 真实全局 BattleSystem.chooseTarget / canPlay 与 UI 同结论；
//   4) 选目标提示文案同步；无页面错误。
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

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_BIN || undefined,
    args: ["--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e.message || e)));
  try {
    await startRegressionBattle(page);
    const got = await page.evaluate(() => {
      const b = window.state.battle;
      // 必须就地修改现有单位对象、保留数组与元素引用：render() 会按引用重取
      // 行动角色，直接替换 b.allies 会让 UI 取到原生的「杀（普攻）」而误判。
      const setup = (u, uid, hp, side) => Object.assign(u, {
        uid, name: uid, side, hp, maxHp: 100, visualHp: hp,
        hand: [], stats: Object.assign({}, u.stats, { attack: 10, magic: 5 }),
        intent: 5, gender: "female", statuses: [],
      });
      while (b.allies.length < 3) b.allies.push(Object.assign({}, b.allies[0]));
      if (!b.enemies.length) b.enemies.push(Object.assign({}, b.allies[0]));
      const a0 = b.allies[0], a1 = b.allies[1],
        a2 = b.allies[2], e0 = b.enemies[0];
      setup(a0, "a0", 100, "ally"); setup(a1, "a1", 100, "ally");
      setup(a2, "a2", 40, "ally"); setup(e0, "e0", 60, "enemy");
      b.allies.length = 3; b.enemies.length = 1;
      b.activeUid = a0.uid; b.phase = 4; b.locked = false;
      b.selectedSkillCard = null; b.pendingTargetUid = null;
      b.played = []; b.shownPlayed = []; b.animQueue = [];
      const tpl = (window.GameDataCards?.cardCodex || [])
        .find(c => c && c.name === "愈魔瓶");
      const card = window.CardUtils?.cloneEntity?.("愈魔瓶", { suit: "♥" })
        || Object.assign({}, tpl || {}, { name: "愈魔瓶", type: "consume",
          suit: "♥", healPct: .3, healScale: "magic", allyTarget: true });
      a0.hand = [card];
      b.selectedCardIndex = 0;
      window.BattleEffects.animating = false;
      window.BattleEffects.draining = false;
      window.render();
      const cls = uid => document.querySelector(`.unit[data-target="${uid}"]`)?.className || "";
      const rules = window.BattleHealTargetRules;
      const snapshot = {
        module: !!rules,
        single: !!rules?.isSingleHealCard?.(card),
        fullCls: cls("a1"), hurtCls: cls("a2"), enemyCls: cls("e0"),
        tip: window.UISelectionTip?.tip({ battle: b, pickedCard: card,
          soulNeed: 0, handChoice: false }) || "",
        chooseFull: window.BattleSystem.chooseTarget(window.state, "a1"),
        chooseHurt: window.BattleSystem.chooseTarget(window.state, "a2"),
        defaultUid: rules?.defaultHealTarget?.(b, a0),
        canPlayWithHurt: window.BattleSystem.canPlay(a0, card, b),
      };
      a2.hp = 100; a2.visualHp = 100;
      snapshot.canPlayAllFull = window.BattleSystem.canPlay(a0, card, b);
      return snapshot;
    });

    check("新模块随 startup 装进浏览器", got.module === true);
    check("愈魔瓶命中单体恢复牌判据", got.single === true);
    check("满血队友无 selectable-target",
      !/\bselectable-target\b/.test(got.fullCls), got.fullCls);
    check("受伤队友有 selectable-target",
      /\bselectable-target\b/.test(got.hurtCls), got.hurtCls);
    check("敌方单位不标可选",
      !/\bselectable-target\b/.test(got.enemyCls), got.enemyCls);
    check("真实 chooseTarget 拒绝满血、接受受伤",
      got.chooseFull === false && got.chooseHurt === true,
      JSON.stringify([got.chooseFull, got.chooseHurt]));
    check("默认目标指向受伤队友", got.defaultUid === "a2", got.defaultUid);
    check("有受伤队友可用 / 全员满血置灰",
      got.canPlayWithHurt === true && got.canPlayAllFull === false,
      JSON.stringify([got.canPlayWithHurt, got.canPlayAllFull]));
    check("提示文案写明满血不可指定",
      got.tip.includes("满血角色不可指定"), got.tip);

    // 主动恢复技能（回春之手 / 偶像之吻）与牌侧同一判定源，浏览器内验证装配、
    // DOM 高亮、chooseTarget、canPlay 置灰、提示文案。
    const sk = await page.evaluate(() => {
      const b = window.state.battle;
      const a0 = b.allies[0], a1 = b.allies[1], a2 = b.allies[2], e0 = b.enemies[0];
      a0.hp = 100; a0.visualHp = 100;
      a1.hp = 100; a1.visualHp = 100;
      a2.hp = 40; a2.visualHp = 40;
      e0.hp = 60; e0.visualHp = 60;
      a0.skills = [
        { type: "active", name: "回春之手", card: { name: "回春之手", type: "tactic", _skill: true, allyTarget: true, elranaHeal: true } },
        { type: "active", name: "偶像之吻", card: { name: "偶像之吻", type: "tactic", _skill: true, allyTarget: true, idolKiss: true } },
      ];
      a0.hand = [{ name: "黑桃1", suit: "♠", type: "tactic" }];
      b.selectedCardIndex = 0;
      b.selectedSkillCard = Object.assign({}, a0.skills[0].card);
      b.pendingTargetUid = null;
      b.locked = false; b.phase = 4; b.activeUid = a0.uid;
      window.BattleEffects.animating = false;
      window.BattleEffects.draining = false;
      const R = window.BattleHealTargetRules;
      window.render();
      const cls = uid => document.querySelector(`.unit[data-target="${uid}"]`)?.className || "";
      const tipOf = () => window.UISelectionTip.tip({ battle: b,
        pickedCard: b.selectedSkillCard, soulNeed: 0, handChoice: false });
      const out = {
        module: !!R?.isHealSkillCard,
        elranaFull: cls("a1"), elranaHurt: cls("a2"), elranaEnemy: cls("e0"),
        elranaTip: tipOf(),
        chooseFull: window.BattleSystem.chooseTarget(window.state, "a1"),
        chooseHurt: window.BattleSystem.chooseTarget(window.state, "a2"),
        valueFull: R.healSkillValue(b, a0, b.selectedSkillCard, a1),
        valueHurt: R.healSkillValue(b, a0, b.selectedSkillCard, a2),
        canPlayHurt: window.BattleSystem.canPlay(a0, b.selectedSkillCard, b),
      };
      a2.hp = 100; a2.visualHp = 100;
      out.canPlayAllFull = window.BattleSystem.canPlay(a0, b.selectedSkillCard, b);
      // 偶像之吻：a0 满血，a1 满血 → 不可选；a2 受伤 → 可选
      a2.hp = 40; a2.visualHp = 40;
      a0.hand = [{ name: "红桃1", suit: "♥", type: "tactic" }];
      b.selectedCardIndex = 0;
      b.selectedSkillCard = Object.assign({}, a0.skills[1].card);
      b.pendingTargetUid = null;
      window.render();
      out.idolFull = cls("a1");
      out.idolHurt = cls("a2");
      out.idolTip = tipOf();
      out.idolValueFull = R.healSkillValue(b, a0, b.selectedSkillCard, a1);
      out.idolValueHurt = R.healSkillValue(b, a0, b.selectedSkillCard, a2);
      return out;
    });
    const sel = c => /\bselectable-target\b/.test(c);
    check("技能判据随 startup 装进浏览器", sk.module === true);
    check("回春之手满血队友不可选", !sel(sk.elranaFull), sk.elranaFull);
    check("回春之手受伤队友可选", sel(sk.elranaHurt), sk.elranaHurt);
    check("回春之手敌方不可选", !sel(sk.elranaEnemy), sk.elranaEnemy);
    check("回春之手 chooseTarget 拒绝满血、接受受伤",
      sk.chooseFull === false && sk.chooseHurt === true,
      JSON.stringify([sk.chooseFull, sk.chooseHurt]));
    check("回春之手判据满血 false / 受伤 true",
      sk.valueFull === false && sk.valueHurt === true,
      JSON.stringify([sk.valueFull, sk.valueHurt]));
    check("回春之手有伤者可用 / 全员满血置灰",
      sk.canPlayHurt === true && sk.canPlayAllFull === false,
      JSON.stringify([sk.canPlayHurt, sk.canPlayAllFull]));
    check("回春之手提示写明满血不可指定",
      sk.elranaTip.includes("满血目标不可指定"), sk.elranaTip);
    check("偶像之吻双方满血目标不可选", !sel(sk.idolFull), sk.idolFull);
    check("偶像之吻受伤目标可选", sel(sk.idolHurt), sk.idolHurt);
    check("偶像之吻判据满血 false / 受伤 true",
      sk.idolValueFull === false && sk.idolValueHurt === true,
      JSON.stringify([sk.idolValueFull, sk.idolValueHurt]));
    check("偶像之吻提示写明双方满血不可指定",
      sk.idolTip.includes("双方满血时不可指定"), sk.idolTip);
    check("无页面错误", errors.length === 0, errors.join(" | "));
  } finally {
    await browser.close();
  }
  console.log(`RESULT ${pass}/${pass + fail}`);
  process.exit(fail ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
