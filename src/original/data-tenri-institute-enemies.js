// 天日国鹰7研究所 · 普通怪物表（2026-11-24）
// 数值为「普通级基础值」，五档难度仍走 GameData.scaleEnemyStats 统一缩放。
// 用户稿里的资源上限旧称按全库统一文案写作「淫气上限」(bloodlust)；
// 资源上限按全库统一文案写作「淫气上限」(bloodlust)；原稿「基础2+N / 基础4+N」是折算口径，
// 重平衡后摸牌与初始摸牌已收敛到 3~4 / 4~5（4 只同怪时避免牌权失控）。
// 八项数值按「14 层 / 等级上限 25 / 属性成长 +30%」曲线重平衡：输出对齐废墟沙城
// 普通怪均值 ×1.30~1.40，速度不超过废墟峰值 40。
// 立绘取自并行提交 fc8c935c 的「研究所怪物立绘与BGM压缩包」，按 ASCII 命名接入 publish。
// 精英/首领怪尚未设计：dungeon-enemies.js 的 tenriEnemies 分支三型节点都从本表随机。
window.GameDataTenriInstituteEnemies = [
  { id: "tenri_assault", name: "机械警卫突击队", type: "normal", role: "杀牌压制", gender: "male", face: "突", art: "./assets/tenri-enemies/assault-guard.d3589992.png", hp: 240, attack: 27, magic: 21, speed: 38, bloodlust: 2, handLimit: 4, drawPerTurn: 3, initialDraw: 4, evaluation: "手牌杀牌数压制的突击型怪物，靠不可响应与每多一张杀牌+100%伤害放大单体输出。", skills: [{ name: "不可挡突袭", type: "passive", icon: "⭐", text: "锁定技，当你使用实体单体【杀】指定目标时，若你手牌中的【杀】牌数多于该目标角色手牌中的【杀】牌数，此【杀】不可被响应；每多出一张，此【杀】造成的伤害+100%（多1张为2倍，多2张为3倍）。" }], ai: "tenri_assault" },
  { id: "tenri_guard", name: "机械警卫防爆队", type: "normal", role: "护驾转移", gender: "male", face: "防", art: "./assets/tenri-enemies/riot-guard.6a9e9f17.png", hp: 300, attack: 22, magic: 20, speed: 32, bloodlust: 1, handLimit: 4, drawPerTurn: 3, initialDraw: 5, evaluation: "替同阵营脆弱单位承受单体杀的防御型怪物，转移目标后由自身吃下全部结算。", skills: [{ name: "守护后方", type: "passive", icon: "⭐", text: "锁定技，当其他我方角色成为实体单体【杀】的目标时，若该角色没有此技能，此【杀】的目标转移给你。" }], ai: "tenri_guard" },
  { id: "tenri_railgun", name: "清理机器人", type: "normal", role: "全体压制", gender: "male", face: "清", art: "./assets/tenri-enemies/cleaner-bot.1f1a9c45.png", hp: 200, attack: 26, magic: 24, speed: 40, bloodlust: 2, handLimit: 3, drawPerTurn: 4, initialDraw: 5, evaluation: "依靠全体类实体牌打面伤的高速清扫单位，全体牌不可响应且伤害翻倍。", skills: [{ name: "极速射线", type: "passive", icon: "⭐", text: "锁定技，你使用的全体类实体牌不可被响应，其造成的伤害翻倍。" }], ai: "tenri_railgun" },
  { id: "tenri_ghoul", name: "无垢食尸鬼", type: "normal", role: "不死复生", gender: "female", face: "垢", art: "./assets/tenri-enemies/pure-ghoul.fdcf7936.png", hp: 180, attack: 28, magic: 26, speed: 42, bloodlust: 2, handLimit: 3, drawPerTurn: 3, initialDraw: 4, evaluation: "队友尚存即可于下个回合满血复生的不死单位，与不死食尸鬼共用待复活结算链。", skills: [{ name: "快速复生", type: "passive", icon: "⭐", text: "锁定技，当你死亡后，若其他我方角色存活，你进入待复活状态；于你的下个回合开始时恢复所有生命值。" }], ai: "tenri_ghoul" },
];
