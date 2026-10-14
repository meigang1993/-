// 专项：低血量承受连击 / 多段攻击时，播放动画期间单位卡血量数字**不得回升**
//
// 背景：上上轮为修"多段攻击后血量显示偏高"，把 holdVisual 改成了无条件
// 覆盖 `u.visualHp = u.hp`。这在同步结算阶段看起来是对的（每段都刷新），
// 但破坏了与动画播放的协作：
//
//   同步结算（3 段，每段 5 点，起始 18）
//     段1 holdVisual → visualHp=18，扣血 → 13，pushFloat(落点 13)
//     段2 holdVisual → visualHp=13，扣血 →  8，pushFloat(落点  8)
//     段3 holdVisual → visualHp= 8，扣血 →  3，pushFloat(落点  3)
//   同步结束：visualHp = 8（最后一段留下的"受伤前"值），真实 hp = 3
//
//   动画播放（applyVisual 把 float 事件的落点写回 unit.visualHp）
//     段1 → visualHp = 13   ← 8 涨到 13，血量"莫名增加"
//     段2 → visualHp =  8
//     段3 → visualHp =  3
//
// 玩家看到的就是：血从 8 变成 13，且没有任何恢复飘字。低血量时基数小，
// 这个回跳最明显——正是反馈的"血莫名的增加了，没有出恢复数字"。
//
// 正确语义：holdVisual 记录的是**整条动画链的起点**，只有链上还没有该单位的
// 待播放 float 时才可设置；链一旦开始，visualHp 由各段 float 的落点推进，
// 必须单调下降。
//
// 反向验证：把 holdVisual 改回无条件覆盖后，播放首帧会出现 8 → 13 的回升。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass += 1; console.log(`✅ ${name}${extra ? " — " + extra : ""}`); }
  else { fail += 1; console.log(`❌ ${name}${extra ? " — " + extra : ""}`); }
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", e => pageErrors.push(e.message));
  await startRegressionBattle(page);

  const run = async (segs, startHp) => page.evaluate(`(async () => {
    const st = window.state, b = st.battle;
    const ally = b.allies[0], enemy = b.enemies[0];
    const card = { name: "测试连击", type: "slash", ignoreResponse: true, ignoreBlock: true };
    const domHp = () => {
      const el = document.querySelector('[data-target="' + ally.uid + '"] .combat-bar b');
      return el ? Number(el.textContent.trim()) : null;
    };
    ally.maxHp = 100; ally.hp = ${startHp}; ally.block = 0;
    delete ally.visualHp; delete ally.visualBlock; delete ally.visualDefense;
    b.animQueue = [];

    const seq = [];
    for (let i = 0; i < ${segs}; i += 1) {
      window.BattleSystem.damage(st, ally, 5, "测试连击", enemy, { ...card });
    }
    window.render?.();
    seq.push({ tag: "sync-end", dom: domHp(), hp: ally.hp, vhp: ally.visualHp });

    // 按真实播放顺序消费动画队列（applyVisual 会把每段落点写回 visualHp）
    let guard = 0;
    while (b.animQueue.length && guard++ < 80) {
      const ev = b.animQueue.shift();
      if (ev.type !== "float") continue;
      window.BattleEffectHandlers.applyVisual(st, ev, () => window.render?.());
      seq.push({ tag: "float:" + ev.kind, dom: domHp(), hp: ally.hp, vhp: ally.visualHp });
    }
    window.render?.();
    seq.push({ tag: "final", dom: domHp(), hp: ally.hp, vhp: ally.visualHp });

    const doms = seq.map(s => s.dom).filter(v => v != null);
    let worstRise = 0;
    for (let i = 1; i < doms.length; i += 1) {
      worstRise = Math.max(worstRise, doms[i] - doms[i - 1]);
    }
    return { seq, doms, worstRise, finalHp: ally.hp, maxHp: ally.maxHp };
  })()`);

  // ① 低血量 3 段连击（起始 18，即 18%）
  const r = await run(3, 18);
  console.log(" ① 序列:", JSON.stringify(r.seq));
  check("① 播放期间血量数字不回升", r.worstRise <= 0, JSON.stringify({ worstRise: r.worstRise, doms: r.doms }));
  check("① 真实血量正确降到 3", r.finalHp === 3, JSON.stringify({ hp: r.finalHp }));
  check("① 最终显示等于真实血量", r.seq[r.seq.length - 1].dom === 3, JSON.stringify({ dom: r.seq[r.seq.length - 1].dom }));
  check("① 同步结算结束时显示不低于真实血量", r.seq[0].dom >= r.finalHp, JSON.stringify({ syncEnd: r.seq[0].dom }));

  // ② 起始 8 血 2 段（更低血量，段数更少）
  const r2 = await run(2, 8);
  console.log(" ② 序列:", JSON.stringify(r2.seq));
  check("② 播放期间血量数字不回升", r2.worstRise <= 0, JSON.stringify({ worstRise: r2.worstRise, doms: r2.doms }));
  check("② 最终显示等于真实血量", r2.seq[r2.seq.length - 1].dom === r2.finalHp, JSON.stringify({ dom: r2.seq[r2.seq.length - 1].dom, hp: r2.finalHp }));

  // ③ 对照组：单次伤害不受影响
  const r3 = await run(1, 18);
  check("③ 单次伤害仍正常（13）", r3.finalHp === 13 && r3.seq[r3.seq.length - 1].dom === 13,
    JSON.stringify({ hp: r3.finalHp, dom: r3.seq[r3.seq.length - 1].dom }));

  check("页面无 JS 错误", pageErrors.length === 0, JSON.stringify(pageErrors.slice(0, 3)));

  console.log(`\n通过 ${pass}/${pass + fail}`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
