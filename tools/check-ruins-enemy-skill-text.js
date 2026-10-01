/* 校验废墟沙城两名怪物的技能文案与实现口径一致：
 * 1) 外神之眼 —— 只有「实体牌」伤害才触发，描述必须写明；并用真实函数验证判定
 * 2) 装甲运输车 —— 两个 ⭐ 被动技能都必须带「锁定技」前缀
 * 另扫描全库所有 ⭐ 被动技能，列出缺少「锁定技」前缀的（仅提示，不断言）。
 */
const fs = require("fs"), vm = require("vm");
const { installGlobals, loadRuntime } = require("./skill-coverage-fixtures");
installGlobals(); loadRuntime();

const SRC = "./src/original/";
const read = f => fs.readFileSync(SRC + f, "utf8");
["data-ruins-sand-city-enemies.js", "ruins-witherer-skills.js"].forEach(f => {
  vm.runInThisContext(read(f), { filename: f });
});

const results = [];
const check = (name, cond, info) => {
  results.push({ name, ok: !!cond });
  console.log(`${cond ? "✅" : "❌"} ${name}${info !== undefined ? "  " + JSON.stringify(info) : ""}`);
};

const enemies = (window.GameData?.enemies || {}).ruins_sand_city || [];
const find = id => enemies.find(e => e?.id === id);
const skillOf = (unit, name) => (unit?.skills || []).find(s => s?.name === name);

// ---------- 1) 外神之眼：文案 ----------
const w = find("witherer_1312");
const eye = skillOf(w, "外神之眼");
check("1312号存在【外神之眼】", !!eye, { name: w?.name });
check("外神之眼 图标为⭐ / 类型为passive", eye?.icon === "⭐" && eye?.type === "passive",
  { icon: eye?.icon, type: eye?.type });
check("外神之眼 描述含「锁定技」", /^锁定技/.test(eye?.text || ""), { head: (eye?.text || "").slice(0, 12) });
check("外神之眼 描述写明「实体牌」", /实体牌/.test(eye?.text || ""));
check("外神之眼 描述排除技能伤害与虚拟牌", /技能伤害与虚拟牌伤害不触发/.test(eye?.text || ""));
// 「多段或连击伤害时逐段结算」设定已取消：外神之眼只在第一段触发，
// 追加段（_drillExtraHit）在 afterDamage 拦截。文案不得再出现该描述。
check("外神之眼 描述不含已取消的「逐段结算」", !/逐段结算/.test(eye?.text || ""),
  { text: (eye?.text || "").slice(-30) });

// ---------- 2) 外神之眼：实现只认实体牌 ----------
const st = () => ({
  battle: { allies: [{ uid: "a1", name: "罗卡尔", side: "ally", hp: 100, stats: { attack: 10 } }],
    enemies: [{ uid: "e1", name: "XX型凋零者1312号", ai: "ruins_witherer", hp: 100 }] },
  lines: [],
});
window.BattleLog = { add: (s, t) => (s.lines || (s.lines = [])).push(t) };
const fire = card => {
  const s = st();
  const attacker = s.battle.allies[0], target = s.battle.enemies[0];
  window.RuinsWithererSkills?.afterDamage?.(s, attacker, target, card, 5, undefined);
  return (s.lines || []).some(l => l.includes("外神之眼"));
};
check("实现·实体【杀】触发", fire({ name: "杀（普攻）", type: "slash" }) === true);
check("实现·实体战术牌触发", fire({ name: "拆解", type: "tactic" }) === true);
check("实现·虚拟牌不触发", fire({ name: "杀", type: "slash", virtual: true }) === false);
check("实现·技能伤害(type:skill)不触发", fire({ type: "skill" }) === false);
check("实现·技能生成牌不触发",
  fire({ name: "杀", type: "slash", generatedBySkill: "螺旋桨" }) === false);
check("实现·_skill 非实体转换不触发",
  fire({ name: "刺杀", type: "slash", _skill: true }) === false);
check("实现·_skill 且 _entityConversion 触发",
  fire({ name: "魅杀", type: "slash", _skill: true, _entityConversion: true }) === true);

// ---------- 3) 装甲运输车：两个 ⭐ 技能都带锁定技 ----------
const c = find("armored_carrier");
const ram = skillOf(c, "无脑冲撞");
const armor = skillOf(c, "坚硬装甲");
check("装甲运输车存在【无脑冲撞】", !!ram, { name: c?.name });
check("无脑冲撞 描述以「锁定技」开头", /^锁定技/.test(ram?.text || ""),
  { head: (ram?.text || "").slice(0, 12) });
check("无脑冲撞 描述含实体单体【杀】/撞杀/不消耗杀意",
  /实体单体【杀】/.test(ram?.text || "") && /撞杀/.test(ram?.text || "")
  && /不消耗杀意/.test(ram?.text || ""));
check("坚硬装甲 描述以「锁定技」开头", /^锁定技/.test(armor?.text || ""),
  { head: (armor?.text || "").slice(0, 12) });
check("坚硬装甲 描述含不会受到任何伤害", /不会受到任何伤害/.test(armor?.text || ""));
const passiveStars = (c?.skills || []).filter(s => s?.type === "passive" && s?.icon === "⭐");
check("运输车全部⭐被动技能均带锁定技", passiveStars.length > 0
  && passiveStars.every(s => /^锁定技/.test(s.text || "")),
  { 数量: passiveStars.length, 名称: passiveStars.map(s => s.name) });

// ---------- 4) 产物已同步（防止只改源码没重建） ----------
const startup = fs.readFileSync("./publish/bundles/startup.min.js", "utf8");
check("startup 产物含更新后的无脑冲撞文案",
  startup.includes("锁定技，出牌阶段，你摸到或获得的实体单体"));
const hall = fs.readFileSync("./publish/bundles/hall.min.js", "utf8");
check("hall 产物含更新后的运输车公告文案",
  hall.includes("无脑冲撞：锁定技，出牌阶段获得实体单体【杀】牌时转换为【撞杀】"));

// ---------- 5) 全库扫描（仅提示） ----------
const missing = [];
Object.entries(window.GameData?.enemies || {}).forEach(([m, list]) => {
  (list || []).forEach(e => (e?.skills || []).forEach(s => {
    if (s?.type === "passive" && s?.icon === "⭐" && !/^锁定技/.test(s.text || "")) {
      missing.push(`${m}/${e.name}·${s.name}`);
    }
  }));
});
console.log(`\n全库 ⭐ 被动技能中缺少「锁定技」前缀的共 ${missing.length} 个`);
missing.forEach(t => console.log("   - " + t));
check("全库 ⭐ 被动技能均带「锁定技」前缀", missing.length === 0, { 缺失: missing });

const bad = results.filter(r => !r.ok).length;
console.log(`\n结果: ${bad === 0 ? "ALL_OK" : bad + " 项失败"}  通过 ${results.length - bad}/${results.length}`);
process.exit(bad === 0 ? 0 : 1);
