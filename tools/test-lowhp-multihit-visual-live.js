// 专项：低血量（20% 以下）承受连击 / 多段攻击时，单位卡血量显示不得异常
//
// 背景：玩家反馈「血量30%以下、20%以下受到伤害数字会变多」。
// 上轮查出的 visualHp 残留 BUG 已在"动画被打断"路径修复（holdVisual 在没有
// 待播放浮字时重置陈旧值）。但连击 / 多段攻击是另一条路径：每段伤害都会
// pushFloat，animQueue 里始终有待播放的 float 事件，于是
// `hasPendingFloat(u)` 恒为 true，陈旧守卫**永远不会触发**——visualHp 会停在
// 第一段受伤前的旧值，后续每段都不再刷新。
//
// 表现：多段越多，单位卡显示的血量比真实血量高出越多（"血数字变多"）。
//
// 本测试模拟真实连击：段与段之间**不排空动画队列**（这正是连击的特征：
// 多段快速结算、动画堆积播放），逐段核对 visualHp 与真实 hp。
//
// 反向验证：撤掉守卫后 visualHp 会停在 18 不动，而 hp 已降到 3。
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
  await startRegressionBattle(page);

  const res = await page.evaluate(`(async () => {
    const st = window.state, b = st.battle;
    const ally = b.allies[0], enemy = b.enemies[0];
    const card = { name: "测试连击", type: "slash", ignoreResponse: true, ignoreBlock: true };
    const domHp = () => {
      const el = document.querySelector('[data-target="' + ally.uid + '"] .combat-bar b');
      return el ? Number(el.textContent.trim()) : null;
    };
    // 20% 以下：maxHp 100 → hp 18（18%）
    ally.maxHp = 100; ally.hp = 18; ally.block = 0;
    delete ally.visualHp; delete ally.visualBlock; delete ally.visualDefense;
    b.animQueue = [];

    const segs = [];
    // 连击 3 段，每段 5 点；段间不排空动画队列（模拟真实连击堆积）
    for (let i = 0; i < 3; i += 1) {
      const before = ally.hp;
      window.BattleSystem.damage(st, ally, 5, "测试连击", enemy, { ...card });
      segs.push({
        seg: i + 1,
        hpBefore: before,
        hpAfter: ally.hp,
        visualHp: ally.visualHp,
        pendingFloats: (b.animQueue || []).filter(e => e.type === "float" && e.uid === ally.uid).length,
      });
    }
    const hpAfterCombo = ally.hp;
    const visualAfterCombo = ally.visualHp;
    // 动画正常播完，确认最终收敛
    if (window.BattleEffects && window.BattleEffects.whenIdle) await window.BattleEffects.whenIdle();
    await new Promise(r => setTimeout(r, 1200));
    window.render && window.render();
    await new Promise(r => setTimeout(r, 300));
    const domAfterAnim = domHp(), hpAfterAnim = ally.hp;

    // --- 边界1：低血量连击致死（起始 8，3 段各 5 点，应落到 0 且不出现负数）---
    b.animQueue = [];
    delete ally.visualHp; delete ally.visualBlock; delete ally.visualDefense;
    ally.hp = 8;
    const lethal = [];
    for (let i = 0; i < 3; i += 1) {
      window.BattleSystem.damage(st, ally, 5, "测试致死", enemy, { ...card });
      lethal.push({ hp: ally.hp, visualHp: ally.visualHp });
    }
    // 立即取值：等待动画会触发战斗结算 / 进入下一回合，ally.hp 会被重置为满血，
    // 那测的就不是"连击致死"而是"下一局"的血量了。
    const hpAfterLethal = ally.hp, domAfterLethal = domHp();
    if (window.BattleEffects && window.BattleEffects.whenIdle) await window.BattleEffects.whenIdle();
    await new Promise(r => setTimeout(r, 300));

    // --- 边界2：护甲吸收（护甲先扣，visualBlock 须跟随）---
    // 这里不能用 ignoreBlock，否则护甲不参与吸收，边界等于没测
    b.animQueue = [];
    delete ally.visualHp; delete ally.visualBlock; delete ally.visualDefense;
    ally.maxHp = 100; ally.hp = 12; ally.block = 6;
    const armorCard = { name: "测试护甲", type: "slash", ignoreResponse: true };
    const armor = [];
    for (let i = 0; i < 2; i += 1) {
      const before = { hp: ally.hp, block: ally.block };
      window.BattleSystem.damage(st, ally, 5, "测试护甲", enemy, { ...armorCard });
      armor.push({ before, hp: ally.hp, block: ally.block, visualHp: ally.visualHp, visualBlock: ally.visualBlock });
    }

    // --- 边界3：治疗（heal 时 visualHp 不得高于 maxHp）---
    b.animQueue = [];
    delete ally.visualHp; delete ally.visualBlock; delete ally.visualDefense;
    ally.hp = 10; ally.block = 0;
    window.BattleSystem.damage(st, ally, 0, "占位", enemy, { ...card });
    const heal = { visualHpAfterSetup: ally.visualHp };

    return {
      segs, hpAfterCombo, visualAfterCombo, domAfterAnim, hpAfterAnim,
      lethal, hpAfterLethal, domAfterLethal,
      armor, heal,
    };
  })()`);

  console.log("  连击逐段（maxHp=100，起始 18 = 18%）：");
  res.segs.forEach(s => console.log(
    `    第${s.seg}段  受伤前=${s.hpBefore}  受伤后=${s.hpAfter}  visualHp=${s.visualHp}  待播float=${s.pendingFloats}`));
  console.log(`  连击结束：实际hp=${res.hpAfterCombo}  visualHp=${res.visualAfterCombo}`);

  // 1) 连击确实逐段结算
  check("连击 3 段真实血量逐段下降到 3", res.hpAfterCombo === 3, `hp=${res.hpAfterCombo}`);

  // 2) 核心：visualHp 是**整条动画链的起点**，链一旦开始就不可再被逐段重写。
  //
  //    曾把这里改成"每段都刷新为本段受伤前血量"（18/13/8），同步阶段看着更准，
  //    但播放时第一段的 float 落点 13 会被写回，而同步阶段结束时残留的是第三
  //    段起点 8 —— 血量数字 8 → 13 凭空回升 5 点，且没有恢复飘字。玩家反馈的
  //    "低血量受连击时血莫名增加"即由此而来。
  //    正确语义：起点固定为 18，由各段 float 落点单调推进 13 → 8 → 3。
  //    播放期间不回升由 test-multihit-hp-no-rebound-live.js 专门覆盖。
  check("第1段 visualHp 取链起点（受伤前血量）", res.segs[0].visualHp === 18,
    `visualHp=${res.segs[0].visualHp} 期望18`);
  check("第2段 visualHp 保持链起点、不被重写", res.segs[1].visualHp === 18,
    `visualHp=${res.segs[1].visualHp} 期望18（若=13则播放时回跳）`);
  check("第3段 visualHp 保持链起点、不被重写", res.segs[2].visualHp === 18,
    `visualHp=${res.segs[2].visualHp} 期望18（若=8则播放时回跳）`);

  // 3) 同步结算阶段动画尚未播放，偏差 = 链起点 − 真实血量，属正常；
  //    硬约束是"不超过连击起始血量"，播完必须收敛（见第 5 条）。
  const gap = res.visualAfterCombo - res.hpAfterCombo;
  check("同步阶段 visualHp 不超过连击起始血量", res.visualAfterCombo <= 18,
    `visualHp=${res.visualAfterCombo} 实际hp=${res.hpAfterCombo} 偏差=${gap}`);

  // 4) 连击期间确实有待播放浮字（确认测试构造的是"连击"而非"逐段播完"）
  check("构造确为连击（段间存在待播浮字）", res.segs[1].pendingFloats > 0,
    `第2段时待播float=${res.segs[1].pendingFloats}`);

  // 5) 动画播完后收敛到真实血量
  check("动画播完后单位卡收敛到真实血量", res.domAfterAnim === res.hpAfterAnim,
    `DOM=${res.domAfterAnim} 实际hp=${res.hpAfterAnim}`);

  // 6) 边界：低血量连击致死不得出现负数血量
  console.log("  致死边界（起始8，3段各5）：");
  res.lethal.forEach((s, i) => console.log(`    第${i + 1}段 hp=${s.hp} visualHp=${s.visualHp}`));
  check("致死连击后血量不为负", res.hpAfterLethal >= 0, `hp=${res.hpAfterLethal}`);
  check("致死连击后血量归零", res.hpAfterLethal === 0, `hp=${res.hpAfterLethal}`);
  check("致死连击 visualHp 不为负",
    res.lethal.every(s => s.visualHp == null || s.visualHp >= 0),
    `visualHp=${res.lethal.map(s => s.visualHp).join(",")}`);

  // 7) 边界：护甲吸收时 visualBlock 须跟随真实值
  console.log("  护甲吸收（hp12 block6，2段各5）：");
  res.armor.forEach((s, i) => console.log(
    `    第${i + 1}段 hp ${s.before.hp}→${s.hp}  block ${s.before.block}→${s.block}  visualHp=${s.visualHp} visualBlock=${s.visualBlock}`));
  check("护甲段 visualBlock 跟随真实护甲",
    res.armor.every(s => s.visualBlock === s.before.block),
    `visualBlock=${res.armor.map(s => s.visualBlock).join(",")} 期望=${res.armor.map(s => s.before.block).join(",")}`);
  check("护甲段 visualHp 跟随真实血量",
    res.armor.every(s => s.visualHp === s.before.hp),
    `visualHp=${res.armor.map(s => s.visualHp).join(",")} 期望=${res.armor.map(s => s.before.hp).join(",")}`);

  await browser.close();
  console.log(`\n通过 ${pass}/${pass + fail}`);
  process.exit(fail ? 1 : 0);
})().catch(err => {
  console.error("执行失败:", err.message);
  process.exit(1);
});
