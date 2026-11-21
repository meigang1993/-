# 天日国鹰7研究所（阶段性占位）

## 背景

天日国南都海域有个无人小岛，天日国政府在这个小岛上建了个秘密研究所。
橘千樱想去收集拥鹰派罪证，调查英雄学院学生不知所踪的真相。

## 当前进度与边界

本轮只搭副本骨架与节点，**怪物设计未定稿**，副本入口暂时无法进入，
大厅面板显示「未开发完成」。剧情解锁事件已完成并可正常观看，
但解锁后入口仍由 `mission.devLocked` 挡住，不会开放战斗。

后续需要完成的内容：

- 专属怪物表（普通 / 精英 / BOSS）与技能设计；
- 副本专属 BGM 与立绘 / 卡图；
- 去掉 `devLocked` 与 `devHint`，正式开放入口；
- 视需要补齐专属饰品、掉落与悬赏组合。

## 复用的既有副本代码

| 能力 | 复用位置 |
| --- | --- |
| mission 聚合 | `data-future-dungeons.js` → `GameData.missions` |
| 敌人池挂载 | `data-world.js` 的 `GameData.enemies` |
| 14 层节点生成 | `dungeon-map.js` 的 `fixedRandomLayers` |
| 怪物随机组合 | `dungeon-enemies.js` 的 `enemiesFor` |
| 难度四档缩放 | `GameData.scaleEnemyStats` / `difficulties` |
| 金币倍率 | `GameEconomy.missionRewards` |
| 战斗经验倍率 | `CharacterProgression.dungeonExpMultiplier` |
| 解锁剧情范式 | `orc-unlock-events.js` 的 pending → modal → ServerCore |
| 对话渲染 | `AdvDialogue` + `AdvDialogue.cast` |
| 事件白名单 | `UnlockEventProgress.ids` / `LocalCoreEventOps` |

怪物随机池临时指向 `GameDataRuinsSandCityEnemies`（废墟沙城），
等专属怪物表完成后只改 `data-tenri-institute.js` 的 `enemies` getter。

## 参数

| 项 | 值 |
| --- | --- |
| 副本 id | `tenri_institute` |
| 层数 | 14（第 7 层宝箱、第 13 层休整、第 14 层 BOSS） |
| 等级上限 | 25 级 |
| 属性成长 | 提高 30%（`CharacterProgression.growthScale`） |
| 强化次数上限 | 每项 70 次 |
| 战斗胜利经验 | 5 倍（`dungeonExpMultiplier`） |
| 莉莉丝元 | 按废墟沙城调整（`goldMultiplier: 230`） |
| 解锁方式 | 普雷希与米尔尤拉已解锁后，首次通关废墟沙城·冒险级回大厅触发剧情 |
| 入口 | `devLocked: true`，提示「未开发完成」 |

## 解锁剧情台词

共 9 句，橘千樱与罗卡尔对话，涉及魔族特务 / 内鬼、艾尔拉娜、
安洁莉卡与魔后勾结、贝丝妲「不能说的计划」等线索。
台词按策划原文录入（`tenri-institute-unlock-events.js` 的 `LINES`），
原文「那我也准备一提」未作改字。
