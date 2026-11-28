// 【魔王军枪炮师杰明】308 版新增精英 · 独立严格检查
// 覆盖：数据表/技能文案/台词/特殊对话/勾玉蓄力图标/两饰品(含背景)/两掉落牌/
//       BGM 原样接入不压缩/立绘/AI/装配挂点/bundle 顺序/公告/记忆/QA/讨伐与手册。
// 真实 vm 加载产品模块跑关键链路（46 项 / 11 组），REVERT=<组> 13 组精准打红。
// 308 实机三项红确认为真 BUG 后补 B8/B9/B10 三条防回归护栏。
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const DIR = path.join(ROOT, "src", "original");
const REVERT = process.env.REVERT || "";
const raw = p => fs.readFileSync(path.join(ROOT, p), "utf8");
const src = n => fs.readFileSync(path.join(DIR, n), "utf8");
const EXPECT = {
  data: ["A"], skill: ["B"], line: ["C"], icon: ["D"], relic: ["E"],
  card: ["F"], bgm: ["G"], wire: ["H"], ai: ["I"], doc: ["J"], runtime: ["K"],
  // 308 实机三项红的回归护栏（都是真 BUG，不是夹具问题）
  ray: ["B"], rocket: ["B"], merit: ["B"],
};
const REPL = {
  data: ["src/original/data-tenri-institute-enemies.js", 'type: "elite", role: "蓄力导弹与卫星压制精英"', 'type: "normal", role: "蓄力导弹与卫星压制精英"'],
  skill: ["src/original/tenri-jamin-core.js", "if (!isJamin(actor) || !hasSkill(actor, \"离子导弹\")) return;", "if (false) return;"],
  line: ["src/original/battle-line-intro.js", "    if (angelica && jamin) return showExchange(state, jaminIntro(angelica, jamin));", "    // disabled"],
  icon: ["src/original/tenri-jamin-charge-icon.js", "const PATH = \"M20 3C11 3 4 10 4 19C4 26 9 32 16 33C12 30 10 26 10 21\"", "const PATH = \"M0 0\""],
  relic: ["src/original/data-tenri-jamin-content.js", "伊迪斯为了躲避天使追杀", "占位背景"],
  card: ["src/original/data-tenri-jamin-content.js", '    { name: "嘲讽",', '    { name: "占位",'],
  bgm: ["src/original/data-tenri-institute-enemies.js", 'bgm: "./assets/new-bgm/jamin.f6fc5ddd.ogg"', 'bgm: "./assets/new-bgm/tenri-institute-battle.c9d87b58.ogg"'],
  wire: ["src/original/battle-card-resume-hooks.js", "      window.TenriJaminSkills?.afterCardPlayed?.(state, actor, target, card),", "      void 0,"],
  ai: ["src/original/tenri-institute-ai.js", '      return window.TenriJaminSkills?.aiMove?.(state, actor, team, foes, rawHand, canPlay, ctx) || null;', '      return null;'],
  doc: ["src/original/update-notice-recent.js", "魔王军枪炮师杰明", "占位精英"],
  ray: ["src/original/tenri-jamin-combat.js",
    "    const source = units.find(item => item?.uid === ray.sourceUid);",
    "    const source = null;"],
  rocket: ["src/original/battle-character-card-storage.js",
    "    take, store, release, endTurn, discardForDead, clear,",
    "    store, release, endTurn, discardForDead, clear,"],
  merit: ["src/original/tenri-jamin-combat.js",
    "    if (!(hpLoss > 0) || target?.hp > 0 || target.hp + hpLoss <= 0) return;",
    "    if (!alive(target) || !(hpLoss > 0)) return;"],
};
const patched = rel => {
  let s = raw(rel);
  const r = REPL[REVERT];
  if (r && r[0] === rel) {
    if (!s.includes(r[1])) throw new Error(`REVERT=${REVERT} 目标未命中：${r[1].slice(0, 60)}`);
    s = s.replace(r[1], r[2]);
  }
  return s;
};
const results = [];
const check = (g, n, ok, d = "") => results.push({ g, n, ok: !!ok, d });
const sha256 = b => crypto.createHash("sha256").update(b).digest("hex");

// ---------- A 数据表 ----------
{
  const d = patched("src/original/data-tenri-institute-enemies.js");
  check("A", "A1 精英条目 type=elite / 数值八项为用户原稿",
    /id: "tenri_jamin", name: "魔王军枪炮师杰明", type: "elite"/.test(d)
    && /hp: 700, attack: 53, magic: 50, speed: 46, bloodlust: 1, handLimit: 4, drawPerTurn: 2, initialDraw: 1/.test(d));
  check("A", "A2 三条技能文案与用户稿一致（潜能爆发/离子导弹/卫星射线）",
    /潜能爆发", type: "active", icon: "⚔️"/.test(d)
    && /重置你的淫气（X为你手牌中【杀】牌的数量）/.test(d)
    && /蓄力技 0\/4，每次你使用【杀】牌后，你获得1点蓄力点/.test(d)
    && /“射线”标记。拥有“射线”标记的角色每回合受到等同于你攻击力的雷属性伤害/.test(d)
    && /若该角色死亡，此标记自动转移至另一名存活的敌方角色/.test(d));
  check("A", "A3 登场台词 / 性别男 / 副本归属 / aiLogic 五段齐备",
    d.includes('gender: "male"') && /ai: "tenri_jamin"/.test(d)
    && /潜能爆发：淫气耗尽.*离子导弹：蓄力点满4立即发动.*卫星射线：第一个出牌阶段.*常规出牌优先蓄力/.test(d));
  check("A", "A4 全库统一「淫气」，无「杀意」旧称字面", !d.includes("杀意"));
}

// ---------- B 技能实现 ----------
{
  const core = patched("src/original/tenri-jamin-core.js");
  // 必须走 patched：REVERT=ray/merit 是对本文件做真实替换后重载。
  const combat = patched("src/original/tenri-jamin-combat.js");
  const main = src("tenri-jamin-skills.js");
  check("B", "B1 蓄力点：每次使用【杀】+1、满 4 不溢出、离子导弹自身不再累计",
    /if \(!isJamin\(actor\) \|\| !hasSkill\(actor, "离子导弹"\)\) return;/.test(core)
    && /card\?\._jaminMissile\) return;/.test(core)
    && /if \(cur >= MAX_CHARGE\) return;/.test(core) && /const MAX_CHARGE = 4/.test(core));
  check("B", "B2 潜能爆发摸 X 牌 + 重置淫气 + 每回合限一次",
    /actor.usedPotentialTurn === turn/.test(core) && /api\?\.deps\?\.draw\?\.\(actor, count/.test(core)
    && /actor.intent = intentMax\(actor\)/.test(core));
  check("B", "B3 离子导弹满 4 全体雷伤 + 感电，蓄力清零",
    /jaminCharge = 0/.test(core) && /addShock\?\.\(state, unit, 1, actor\)/.test(core));
  check("B", "B4 卫星射线限定技 + 每回合雷伤 + 死亡转移",
    /actor.usedSatellite/.test(core) && /jaminRay = \{ sourceUid: actor.uid, attack: stat\(actor, "attack"\) \}/.test(core)
    && /function transferRay/.test(combat) && /function rayTick/.test(combat));
  check("B", "B5 火龙火箭筒复用存储牌模块 release=manual，准备阶段弃置齐射",
    /BattleCharacterCardStorage\?\.store\?\./.test(core) && /release: "manual"/.test(core)
    && /entry => entry.source === "火龙火箭筒"/.test(combat) && /putMany\?\./.test(combat));
  check("B", "B6 战地功勋实体牌击杀 +100% 攻魔可叠加",
    /equipped\(state, actor, "战地功勋"\)/.test(combat) && /isEntityCard\?\.\(card\)/.test(combat)
    && /actor.tempAttack = \(actor.tempAttack \|\| 0\) \+ atk/.test(combat)
    && /actor.tempMagic = \(actor.tempMagic \|\| 0\) \+ mag/.test(combat));
  check("B", "B7 聚合层显式抛错守卫（子模块缺失不静默）", /throw new Error\("\[tenri-jamin-skills\]/.test(main));
  // 必须走 patched：REVERT=rocket 撤掉 take 导出后要在此打红。
  const storage = patched("src/original/battle-character-card-storage.js");
  check("B", "B8 射线转移以施加者为基准、排除死者自身（实机 BUG 1 回归护栏）",
    /units\.find\(item => item\?\.uid === ray\.sourceUid\)/.test(combat)
    && /pool\.filter\(item => item\?\.uid !== dead\.uid\)/.test(combat)
    && !/const next = topHp\(foesOf\(state, dead\)\)/.test(combat));
  check("B", "B9 存储模块导出 take 且火箭筒准备阶段按 source 取出（实机 BUG 2 回归护栏）",
    /take, store, release, endTurn/.test(storage)
    && /BattleCharacterCardStorage\?\.take\?\.\(unit/.test(combat));
  check("B", "B10 战地功勋按「本次伤害把存活目标打死」判定（实机 BUG 3 回归护栏）",
    /if \(!\(hpLoss > 0\) \|\| target\?\.hp > 0 \|\| target\.hp \+ hpLoss <= 0\) return;/.test(combat)
    && !/if \(!alive\(target\) \|\| !\(hpLoss > 0\)\)/.test(combat));
}

// ---------- C 台词与特殊对话 ----------
{
  const ld = src("battle-line-data.js");
  const li = patched("src/original/battle-line-intro.js");
  check("C", "C1 登场 / 潜能爆发 / 蓄力 / 发动 / 卫星射线 五句台词原稿",
    /这么快被发现了\？你们看起来不是研究所的人吗\？暗号\？[\s\S]{0,20}那就都炸飞吧/.test(ld)
    && /"潜能爆发": "对付这些家伙不能大意。"/.test(ld)
    && /"离子导弹蓄力": "把敌军坐标记录下来，发给托马斯。"/.test(ld)
    && /"离子导弹": "坐标已锁定，托马斯发射离子导弹，歼灭敌军！"/.test(ld)
    && /"卫星射线": "发现敌人重要目标，请求卫星支援。"/.test(ld));
  check("C", "C2 复用伊迪斯/安洁莉卡 showExchange 逐气泡流程",
    /if \(angelica && jamin\) return showExchange\(state, jaminIntro\(angelica, jamin\)\);/.test(li)
    && /angelica && edis\) return showExchange/.test(li));
  check("C", "C3 七句特殊对话逐句为用户原稿（含哥布林轮大米收尾）",
    (() => {
      const seg = li.slice(li.indexOf("function jaminIntro"), li.indexOf("function risaElranaIntro"));
      return (seg.match(/\{ unit: (jamin|angelica), text:/g) || []).length === 7;
    })()
    && /老子已不是女同了，成双性恋了/.test(li) && /怪不得在奴隶市场独角兽卖好几百万/.test(li)
    && /抓你回去做人才♥/.test(li) && /交给哥布林轮大米/.test(li));
}

// ---------- D 勾玉蓄力图标 ----------
{
  const ic = patched("src/original/tenri-jamin-charge-icon.js");
  const css = raw("publish/battle-units.css");
  const ui = src("ui-battle-units-status.js");
  check("D", "D1 勾玉（magatama）SVG：逗号形 path + 头部圆孔",
    /const PATH = "M20 3C11 3 4 10 4 19C4 26 9 32 16 33C12 30 10 26 10 21"/.test(ic)
    && /jamin-magatama-hole/.test(ic) && /viewBox="0 0 40 40"/.test(ic));
  check("D", "D2 未满置灰 disabled / 满 4 点亮可点击 / 图标上显示 N/4",
    /ready \? "ready" : "dim"/.test(ic) && /ready \? "" : " disabled"/.test(ic)
    && /jamin-charge-num">\$\{cur\}\/\$\{MAX\}/.test(ic) && /data-jamin-charge="\$\{cur\}"/.test(ic));
  check("D", "D3 CSS 置灰/发光/勾玉尺寸/孔色齐备，UI 挂点调用 chargeBadge",
    /\.jamin-charge-skill\.dim \{ opacity: \.5; filter: grayscale\(1\)/.test(css)
    && /\.jamin-charge-skill\.ready \{[\s\S]{0,200}box-shadow/.test(css)
    && /\.jamin-magatama \{ width: 16px/.test(css)
    && /TenriJaminSkills\?\.chargeBadge\?\.\(unitData, U\)/.test(ui));
}

// ---------- E 饰品（含背景原稿） ----------
{
  const c = patched("src/original/data-tenri-jamin-content.js");
  check("E", "E1 火龙火箭筒 🔵 非锁定技 + 描述原稿 + AI ≥3 张",
    /"火龙火箭筒": \{[\s\S]{0,400}skillType: "trigger"/.test(c)
    && /结束阶段，你可以将所有【杀】牌置于你的角色牌上（存储牌）/.test(c)
    && /下一个回合准备阶段，你弃置所有以此法存储的【杀】牌，对所有敌方角色造成等同于你攻击力的火属性伤害/.test(c)
    && /存储的【杀】牌达到3张及以上时，才选择发动此技能/.test(c));
  check("E", "E2 战地功勋 ⭐ 锁定技 + 描述原稿",
    /"战地功勋": \{[\s\S]{0,200}锁定技，当你使用实体牌杀死敌方角色后，本场战斗你的基础攻击力和魔力各\+100%（可叠加）/.test(c));
  check("E", "E3 两件饰品背景均为用户原稿（独角兽村庄 / 帕琦琦无零）",
    /伊迪斯为了躲避天使追杀，和儿子杰明生活在对魔物友好的人类村庄，但某人背叛她们母子俩，惨遭魔物猎人抓捕，将其高价出售。/.test(c)
    && /杰明为了协助帕琦琦解救食尸鬼女王无零而潜入研究所，帕琦琦信任杰明的能力。/.test(c));
  check("E", "E4 饰品并入 GameDataFutureRelics 且按 enemy 自动进掉落/讨伐",
    /Object.assign\(window.GameDataFutureRelics, window.GameDataTenriJaminContent\?\.relics \|\| \{\}\)/.test(src("data-future-relics.js"))
    && /enemy: "tenri_jamin"/.test(c));
}

// ---------- F 掉落牌 + 讨伐任务 + 管家手册 ----------
{
  const c = patched("src/original/data-tenri-jamin-content.js");
  check("F", "F1 嘲讽 2000 / 支援 1400 两张战术牌描述原稿",
    /\{ name: "嘲讽", enemy: "tenri_jamin", price: 2000, type: "tactic"/.test(c)
    && /令其对你使用一张实体单体【杀】。若其没有【杀】牌，则改为你弃置该角色1张手牌/.test(c)
    && /\{ name: "支援", enemy: "tenri_jamin", price: 1400, type: "tactic"/.test(c)
    && /你可以将任意1张手牌交给我方一名角色/.test(c));
  check("F", "F2 注册进 eliteCards / cardCodex / eliteUnlocks（讨伐任务 hasHuntDrop 可命中）",
    /G\.eliteCards\.push\(\.\.\.cards\)/.test(c) && /G\.cardCodex\.push/.test(c)
    && /G\.eliteUnlocks\.tenri_jamin \|\|= \[\]/.test(c));
  check("F", "F3 管家手册自动纳入（enemiesOf 按 type=elite 过滤，无需硬编码）",
    /enemiesOf\(m\.id, "elite"\)/.test(src("butler-manual-progress.js"))
    && /filter\(e => e\?\.type === type\)/.test(src("butler-manual-progress.js")));
  check("F", "F4 两张牌执行器接线（taunt / support）",
    /if \(card\.taunt\) return run\(\(\) => window\.TenriJaminSkills\?\.useTaunt/.test(src("battle-combat-card-effects.js"))
    && /if \(card\.support\) return run\(\(\) => window\.TenriJaminSkills\?\.useSupport/.test(src("battle-combat-card-effects.js")));
}

// ---------- G 素材：原样接入、不压缩、不转码 ----------
{
  const d = patched("src/original/data-tenri-institute-enemies.js");
  const artPath = path.join(ROOT, "publish/assets/tenri-enemies/jamin.f2b22b35.png");
  const bgmPath = path.join(ROOT, "publish/assets/new-bgm/jamin.f6fc5ddd.ogg");
  const art = fs.existsSync(artPath) ? fs.readFileSync(artPath) : Buffer.alloc(0);
  const bgm = fs.existsSync(bgmPath) ? fs.readFileSync(bgmPath) : Buffer.alloc(0);
  check("G", "G1 立绘逐字节 = 素材包原图（未重编码/缩放）",
    art.length === 412365 && sha256(art) === "f2b22b3536dae129dae418a4935aa440cc5ab5d321414baebfa2891de82b7cf5",
    `size=${art.length} sha=${sha256(art).slice(0, 12)}`);
  check("G", "G2 BGM 逐字节 = 素材包 _min.ogg（未压缩/转码/裁 padding）",
    bgm.length === 1521064 && sha256(bgm) === "f6fc5ddda721ec76b57b76120efd720e9f87bb66bb92e1b04061ae6db66918af",
    `size=${bgm.length} sha=${sha256(bgm).slice(0, 12)}`);
  check("G", "G3 精英专属 BGM 接线且不复用 mission 无缝曲",
    /bgm: "\.\/assets\/new-bgm\/jamin\.f6fc5ddd\.ogg"/.test(d)
    && !/jamin[\s\S]{0,80}tenri-institute-battle/.test(d));
  check("G", "G4 文件名戳 = SHA256 前 8 位，资源被源码引用",
    sha256(art).slice(0, 8) === "f2b22b35" && sha256(bgm).slice(0, 8) === "f6fc5ddd"
    && /art: "\.\/assets\/tenri-enemies\/jamin\.f2b22b35\.png"/.test(d));
}

// ---------- H 装配挂点 ----------
{
  const hooks = patched("src/original/battle-card-resume-hooks.js");
  const eff = src("battle-combat-card-effects.js");
  const trig = src("battle-damage-triggers.js");
  const prep = src("battle-prepare-sequence.js");
  const end = src("battle-end-phase.js");
  const panel = src("battle-counter-triggers.js");
  const glob = src("runtime-globals.js");
  const bundles = JSON.parse(raw("tools/publish-bundles.json"));
  check("H", "H1 六处挂点齐备：出牌后蓄力 / 技能卡 / 伤害后 / 准备 / 结束 / 反击面板",
    /window.TenriJaminSkills\?\.afterCardPlayed/.test(hooks)
    && /card\.jaminPotential \|\| card\.jaminMissile \|\| card\.jaminSatellite/.test(eff)
    && /window.TenriJaminSkills\?\.afterDamage/.test(trig)
    && /window.TenriJaminSkills\?\.prepare/.test(prep)
    && /window.TenriJaminSkills\?\.endTurn/.test(end)
    && /"火龙火箭筒": \(\) => window.TenriJaminSkills\?\.resolveRocket/.test(panel));
  check("H", "H2 射线死亡转移挂在 afterDamage 最前（不被锁魂镰刀 return 跳过）",
    trig.indexOf("window.TenriJaminSkills?.transferRay") < trig.indexOf("window.BertisGerlotSkills?.afterAnyDeath"));
  check("H", "H3 存储牌 returnSealed 不受影响（endTurn 规则清算仍在 cleanupTurn 前）",
    /window.BattleCharacterCardStorage\?\.endTurn\?\.\(state\)/.test(end)
    && end.indexOf("BattleCharacterCardStorage?.endTurn") < end.indexOf("BattleTurnState.cleanupTurn"));
  check("H", "H4 runtime-globals 登记 5 个新全局",
    ["TenriJaminCore", "TenriJaminCombat", "TenriJaminChargeIcon", "TenriJaminSkills", "GameDataTenriJaminContent"]
      .every(g => glob.includes(`"${g}"`)));
  check("H", "H5 bundle 顺序：内容模块在 startup、4 个技能模块在 battle-skills 且图标先于聚合",
    (() => {
      const su = bundles.startup, bs = bundles["battle-skills"];
      return su.includes("data-tenri-jamin-content.js")
        && su.indexOf("data-tenri-jamin-content.js") > su.indexOf("data-tenri-institute-enemies.js")
        && bs.indexOf("tenri-jamin-charge-icon.js") < bs.indexOf("tenri-jamin-skills.js")
        && bs.indexOf("tenri-jamin-core.js") < bs.indexOf("tenri-jamin-skills.js");
    })());
  check("H", "H6 精英节点固定取杰明、不混入其它副本 id",
    /if \(type === "elite"\)[\s\S]{0,200}pool\.filter\(e => e\.type === "elite"\)/.test(src("dungeon-enemies.js"))
    && /type === "elite"[\s\S]{0,260}withLabels\(\[scaleEnemy\(elite\[0\]/.test(src("dungeon-enemies.js")));
}

// ---------- I AI ----------
{
  const ai = patched("src/original/tenri-institute-ai.js");
  const main = src("tenri-jamin-skills.js");
  check("I", "I1 研究所 AI 转发杰明决策",
    /isAi\(actor, "tenri_jamin"\)\)[\s\S]{0,160}TenriJaminSkills\?\.aiMove/.test(ai)
    && /tenri_jamin/.test(src("tenri-institute-ai.js")));
  check("I", "I2 AI 四级优先：卫星射线首回合最高血 → 满 4 导弹 → 淫气耗尽潜能爆发 → 蓄力后集中出杀",
    /!actor.usedSatellite && enemies.length/.test(main)
    && main.indexOf("usedSatellite") < main.indexOf("jaminCharge")
    && main.indexOf("jaminCharge") < main.indexOf("usedPotentialTurn")
    && main.indexOf("usedPotentialTurn") < main.indexOf("const charge"));
}

// ---------- J 文档 / 公告 / 记忆 / QA ----------
{
  const notice = patched("src/original/update-notice-recent.js");
  const d05 = raw("docs/05-怪物与怪物技能与饰品.txt");
  const d12 = raw("docs/12-新副本素材-废墟沙城.txt");
  const set = raw("docs/original/game-settings.md");
  const agents = raw(".ohmyagent/AGENTS.md");
  const diary = raw("docs/开发日记.md");
  const qa = raw("tools/qa-test-catalog.js");
  check("J", "J1 公告 149 行未增行且含杰明条目",
    notice.trimEnd().split(/\r?\n/).length === 149 && /魔王军枪炮师杰明/.test(notice),
    `lines=${notice.trimEnd().split(/\r?\n/).length}`);
  check("J", "J2 docs/05、docs/12、设定契约、AGENTS、开发日记、QA 全部同步",
    [d05, d12, set, agents, diary, qa].every(t => t.includes("魔王军枪炮师杰明")));
  check("J", "J3 素材清单标记立绘/BGM 已接入",
    /已接入/.test(raw("docs/reference/研究所立绘与BGM素材清单.md"))
    && /jamin\.f2b22b35\.png/.test(raw("docs/reference/研究所立绘与BGM素材清单.md")));
}

// ---------- K vm 真实链路 ----------
{
  const sandbox = { window: {}, console, Math, Number, Array, Object, JSON, String, Set, Map, RegExp };
  sandbox.window.window = sandbox.window;
  const load = (name, text) => vm.runInNewContext(text, sandbox, { filename: name });
  try {
    load("card-utils.js", src("card-utils.js"));
    // vm 真实链路恒跑未篡改源码：反向验证由静态断言组承担，避免 K 组被连带打红。
    load("data-tenri-jamin-content.js", src("data-tenri-jamin-content.js"));
    load("tenri-jamin-charge-icon.js", src("tenri-jamin-charge-icon.js"));
    const W = sandbox.window;
    const u = W.CardUtils;
    const unit = { ai: "tenri_jamin", id: "tenri_jamin", jaminCharge: 0,
      skills: [{ name: "离子导弹" }], hand: [], stats: { attack: 53 } };
    const U = { esc: s => s };
    const b0 = W.TenriJaminChargeIcon.badge(unit, U);
    unit.jaminCharge = 4;
    const b4 = W.TenriJaminChargeIcon.badge(unit, U);
    check("K", "K1 勾玉图标 vm 实测：0/4 置灰 disabled、4/4 点亮可点击",
      /jamin-charge-skill dim/.test(b0) && /disabled/.test(b0) && /0\/4/.test(b0)
      && /jamin-charge-skill ready/.test(b4) && !/disabled/.test(b4) && /4\/4/.test(b4)
      && /jamin-magatama/.test(b4));
    const cards = W.GameDataTenriJaminContent.cards;
    const relics = W.GameDataTenriJaminContent.relics;
    check("K", "K2 vm 实测 2 张牌 / 2 饰品字段齐全、背景为用户原稿",
      cards.length === 2 && cards[0].name === "嘲讽" && cards[1].name === "支援"
      && cards[0].price === 2000 && cards[1].price === 1400
      && Object.keys(relics).length === 2
      && relics["火龙火箭筒"].lore.includes("独角兽") === false
      && relics["火龙火箭筒"].lore.includes("人类村庄")
      && relics["战地功勋"].lore.includes("食尸鬼女王无零"));
    check("K", "K3 vm 实测蓄力技图标仅杰明显示、普通怪不显示",
      W.TenriJaminChargeIcon.badge({ ai: "tenri_assault", skills: [{ name: "离子导弹" }] }, U) === "");
  } catch (e) {
    check("K", "K1 vm 链路", false, String(e && e.message || e));
    check("K", "K2 vm 链路", false, "抛错");
    check("K", "K3 vm 链路", false, "抛错");
  }
}

const failed = results.filter(r => !r.ok);
const flat = results.reduce((m, r) => (m[r.g] = (m[r.g] || 0) + 1, m), {});
console.log(`魔王军枪炮师杰明 · 308 严格检查  通过 ${results.length - failed.length} / ${results.length}（${Object.keys(flat).length} 组）`);
failed.forEach(r => console.log(`  ❌ ${r.g} ${r.n}${r.d ? " — " + r.d : ""}`));
if (REVERT) {
  const want = EXPECT[REVERT] || [];
  const own = failed.filter(r => want.includes(r.g)).length;
  const other = failed.filter(r => !want.includes(r.g)).length;
  console.log(`REVERT=${REVERT} ${own > 0 && other === 0 ? "OK" : "IMPRECISE"} own=${own} other=${other}`);
  process.exit(own > 0 && other === 0 ? 0 : 1);
}
process.exit(failed.length ? 1 : 0);
