// 实战：罗卡尔【狂风绝息斩】范围 + 全体【杀】杀意消耗
// BUG1：大招描述为「依次使用手牌中的所有【杀】」，实现却用名称正则
//       （type==="slash" 或名字以「杀」结尾）选取，把群体杀（机枪扫杀/流星杀）
//        一并卷入。群体杀走全体结算，与「随机循环指定存活敌方角色为目标」
//        的单体语义矛盾 → 改为只选单体【杀】。
// BUG2：群体【杀】与单体杀同样扣 1 点杀意。一次打全体却按单体的代价计价，
//        且玩家侧没有提示 → 全体【杀】改为不消耗杀意，并同步卡面与相关技能文本。
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
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e.message || e)));
  await startRegressionBattle(page);

  console.log("\n【一】狂风绝息斩：只使用单体【杀】，群体杀不参与");
  const r1 = await page.evaluate(() => {
    const st = window.state, b = st.battle;
    const a = b.allies[0];
    // 排除敌方【看破】等自动响应干扰
    b.enemies.forEach(u => { u.hand = []; u.noResponse = true; });
    b.activeUid = a.uid; b.phase = 4; b.locked = false; b.animQueue = [];
    st.log = []; a.usedLokarWindSlash = false; a.intent = 3;
    const mk = (name, type, extra = {}) => ({
      name, type, suit: "♠", scale: "attack", power: 0, ...extra });
    a.hand = [
      mk("杀（普攻）", "slash"),
      mk("魔杀", "slash", { scale: "magic", attackType: "magic" }),
      mk("火杀", "slash", { fire: true }),
      mk("毒杀", "slash", { poison: true }),
      mk("雷杀", "slash", { shock: true }),
      mk("机枪扫杀", "slash", { sweep: true, targetless: true }),
      mk("流星杀", "slash", { sweep: true, targetless: true, scale: "magic" }),
      mk("魔王军入侵", "tactic", { hybridAttack: true, targetless: true }),
      mk("无谋冲拳", "response", { reckless: true }),
      mk("愈魔瓶", "consume", { healPct: .3 }),
      mk("与我一战", "tactic", { duel: true }),
    ];
    const before = a.hand.map(c => c.name);
    const skills = window.UICommon.skillsOf(a) || [];
    const idx = skills.findIndex(s => s.name === "狂风绝息斩");
    if (idx < 0) return { noSkill: true, skills: skills.map(s => s.name) };
    window.BattleSystem.selectSkill(st, idx);
    let ok = window.BattleSystem.playSelectedCard(st);
    if (!ok) {
      window.BattleSystem.chooseTarget(st, b.enemies[0].uid);
      ok = window.BattleSystem.playSelectedCard(st);
    }
    const after = (a.hand || []).map(c => c.name);
    return { ok, before, after, intent: a.intent,
      used: before.filter(n => !after.includes(n)),
      log: (st.log || []).map(String).find(s => /狂风绝息斩/.test(s)) };
  });
  if (r1.noSkill) { console.log("  技能未找到", JSON.stringify(r1.skills)); process.exit(1); }
  check("大招发动成功", r1.ok === true);
  check("单体杀全部被使用（含属性杀）",
    same(r1.used, ["杀（普攻）", "魔杀", "火杀", "毒杀", "雷杀"]),
    JSON.stringify(r1.used));
  check("群体杀【机枪扫杀】不被卷入", r1.after.includes("机枪扫杀"),
    `剩余=${JSON.stringify(r1.after)}`);
  check("群体杀【流星杀】不被卷入", r1.after.includes("流星杀"));
  check("战术/响应/消耗牌仍不动",
    r1.after.includes("魔王军入侵") && r1.after.includes("无谋冲拳")
      && r1.after.includes("愈魔瓶") && r1.after.includes("与我一战"));
  check("大招不消耗杀意", r1.intent === 3, `杀意=${r1.intent}`);
  check("战报文案同步为「单体杀牌」", /单体杀牌/.test(r1.log || ""), r1.log || "");

  console.log("\n【二】全体【杀】不消耗杀意");
  const r2 = await page.evaluate(() => {
    const st = window.state, b = st.battle;
    const a = b.allies[0];
    const enemy = b.enemies.find(u => u.hp > 0);
    const mk = (name, type, extra = {}) => ({
      name, type, suit: "♠", scale: "attack", power: 0, ...extra });
    const run = (card, intent) => {
      // 前一段用例如打死了唯一的敌人，会让下一段取不到目标（undefined.side）。
      b.enemies.forEach(u => { u.hand = []; u.hp = Math.max(u.hp, 60); });
      b.activeUid = a.uid; b.phase = 4; b.locked = false; b.animQueue = [];
      b.handReveal = null; st.log = [];
      a.intent = intent; a.playedSlashThisTurn = false;
      a.hand = [card];
      window.BattleSystem.useCard(st, a, enemy, card);
      return { after: a.intent,
        logs: (st.log || []).map(String).filter(s => /杀意/.test(s)) };
    };
    return {
      gatling: run(mk("机枪扫杀", "slash", { sweep: true, targetless: true }), 2),
      meteor: run(mk("流星杀", "slash", { sweep: true, targetless: true, scale: "magic" }), 2),
      single: run(mk("杀（普攻）", "slash"), 2),
      fire: run(mk("火杀", "slash", { fire: true }), 2),
      // 对照组：卡洛斯疯狂射击转化出的机枪扫杀（显式 noIntentCost）仍免费
      crazy: run(mk("机枪扫杀", "slash",
        { sweep: true, targetless: true, noIntentCost: true, convertedFrom: "闪" }), 2),
    };
  });
  check("机枪扫杀不消耗杀意", r2.gatling.after === 2, JSON.stringify(r2.gatling));
  check("流星杀不消耗杀意", r2.meteor.after === 2, JSON.stringify(r2.meteor));
  check("对照组：单体【杀（普攻）】仍消耗1点",
    r2.single.after === 1, JSON.stringify(r2.single));
  check("对照组：单体属性杀【火杀】仍消耗1点",
    r2.fire.after === 1, JSON.stringify(r2.fire));
  check("对照组：疯狂射击转化牌仍不消耗杀意",
    r2.crazy.after === 2, JSON.stringify(r2.crazy));

  console.log(`\n合计 ${pass} 通过 / ${fail} 失败   页面错误 ${errors.length}`);
  if (errors.length) console.log(errors.slice(0, 3).join("\n"));
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
