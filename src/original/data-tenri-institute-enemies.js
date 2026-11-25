// 天日国鹰7研究所 · 普通怪物表（2026-11-24）
// 数值为「普通级基础值」，五档难度仍走 GameData.scaleEnemyStats 统一缩放。
// 用户稿里的资源上限旧称按全库统一文案写作「淫气上限」(bloodlust)；
// 资源上限按全库统一文案写作「淫气上限」(bloodlust)；「每回合摸牌 基础2 + N」
// 「初始摸牌 基础4 + N」按字面折算为绝对值 2+N / 4+N。
// 2026-11-25：应用户要求撤销 11-24 的曲线重平衡，八项数值全部还原为用户原稿。
// 同批按用户新稿修正四个技能的公开描述，并登记每只怪的 aiLogic（AI 实现见 tenri-institute-ai.js）。
// 立绘取自并行提交 fc8c935c 的「研究所怪物立绘与BGM压缩包」，按 ASCII 命名接入 publish。
// 精英/首领怪尚未设计：dungeon-enemies.js 的 tenriEnemies 分支三型节点都从本表随机。
window.GameDataTenriInstituteEnemies = [
  { id: "tenri_assault", name: "机械警卫突击队", type: "normal", role: "杀牌压制", gender: "male", face: "突", art: "./assets/tenri-enemies/assault-guard.d3589992.png", hp: 260, attack: 43, magic: 35, speed: 48, bloodlust: 2, handLimit: 4, drawPerTurn: 3, initialDraw: 5, evaluation: "手牌杀牌数压制的突击型怪物，靠不可响应与每多一张杀牌+100%伤害放大单体输出。", skills: [{ name: "不可挡突袭", type: "passive", icon: "⭐", text: "锁定技，当你使用实体单体【杀】指定目标时，若你手牌中的【杀】牌数量大于该目标角色，你使用的此【杀】不可响应。你的【杀】牌数每超过该目标角色1张，伤害+100%。" }], ai: "tenri_assault", aiLogic: "优先使用蓄力，随后集中使用【杀】牌攻击手牌数最少的敌方角色。" },
  { id: "tenri_guard", name: "机械警卫防爆队", type: "normal", role: "护驾转移", gender: "male", face: "防", art: "./assets/tenri-enemies/riot-guard.6a9e9f17.png", hp: 300, attack: 36, magic: 34, speed: 43, bloodlust: 1, handLimit: 4, drawPerTurn: 4, initialDraw: 7, evaluation: "替同阵营脆弱单位承受单体杀的防御型怪物，转移目标后由自身吃下全部结算。", skills: [{ name: "守护后方", type: "passive", icon: "⭐", text: "锁定技，当我方其他角色成为单体【杀】牌的目标时，若该角色没有此技能，将此【杀】牌的目标转移给你。" }], ai: "tenri_guard", aiLogic: "正常使用卡牌，优先保留【闪】用于响应转移到自身的伤害。" },
  { id: "tenri_railgun", name: "清理机器人", type: "normal", role: "全体压制", gender: "male", face: "清", art: "./assets/tenri-enemies/cleaner-bot.1f1a9c45.png", hp: 220, attack: 44, magic: 40, speed: 50, bloodlust: 2, handLimit: 3, drawPerTurn: 5, initialDraw: 6, evaluation: "依靠全体类实体牌打面伤的高速清扫单位，全体牌不可响应且伤害翻倍。", skills: [{ name: "极速射线", type: "passive", icon: "⭐", text: "锁定技，你使用的全体类实体牌不可被响应，且造成的伤害翻倍。" }], ai: "tenri_railgun", aiLogic: "优先使用蓄力，随后优先使用【机枪扫杀】等全体攻击牌。" },
  { id: "tenri_ghoul", name: "无垢食尸鬼", type: "normal", role: "不死复生", gender: "female", face: "垢", art: "./assets/tenri-enemies/pure-ghoul.fdcf7936.png", hp: 200, attack: 50, magic: 47, speed: 53, bloodlust: 2, handLimit: 3, drawPerTurn: 3, initialDraw: 5, evaluation: "队友尚存即可于下个回合满血复生的不死单位，与不死食尸鬼共用待复活结算链。", skills: [{ name: "快速复生", type: "passive", icon: "⭐", text: "锁定技，当你死亡后，下一个回合开始时若我方其他角色存活，你复活并恢复所有生命值。" }], ai: "tenri_ghoul", aiLogic: "悍不畏死，优先使用高伤害的【杀】牌进行输出。" },
];
