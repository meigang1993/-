# OhMyAgent 项目记忆入口(每次会话自动加载)

本文件由本环境(.ohmyagent/AGENTS.md)在每次会话启动时自动读取。
仓库根目录的 `AGENTS.md` 是给游戏工作室工具链用的项目入口,本环境不会自动加载,内容不要重复维护。
本文件只放"路由 + 必须一开始就知道的约束",细节一律进 `docs/` 体系,避免双份事实。

## 项目是什么

- 游戏工作室 Game Studio 项目 `2971485` 的**纯静态 HTML5 卡牌/战斗游戏** + 大型 QA 工具链。
- `publish/` = 已构建的线上运行时(入口 `publish/index.html`);`src/original/` = 开发期模块化源码(约数百个 JS);工具链把 `src/original/` 打成 `publish/bundles/*.min.js`。
- 硬约束:禁止服务器/端口/后端框架;横屏为主、基线 1280x720;`publish/` 下路径全 ASCII 且无空格;每个 JS ≤200 行。
- Git:远端 `origin` = https://github.com/meigang1993/- ;默认分支 **`main`**(2026-09-12 由中文分支名改名,见 `docs/开发日记.md` §33)。`core.hooksPath=.githooks`(git 保存守卫)。推送走 GitHub git data API + 持久卷 `.secrets/github_token` 的 PAT;账号密码 Basic Auth 已被 GitHub 拒绝(401),勿再用。

## 每次动代码前的必读路由(摘自根 AGENTS.md)

- 改任何文件前先读 `docs/project-rules.md`。
- 用 `docs/README.md` 选择任务对应文档。
- 改原版 publish 的角色/敌人/卡牌/遗物/地牢/战斗规则/奖励/UI 文案/世界观/存档/视觉 → 先读 `docs/original/game-settings.md` 对应章节。
- 增删原版模块/搬逻辑/改 bundle/facade → `docs/original/architecture.md`。
- 改异步战斗/结算/存储/动画/媒体加载/重渲染 → `docs/original/known-risks.md`。
- 改界面构成/导航/交互态/滚动/视觉/美术 → `docs/original/interaction-visual-reference.md`。
- 用 dzmm/KV/加载态/completions/分享/工作坊/serverless → `docs/original/platform-runtime.md`。
- 验证策略 → `docs/original/qa-workflow.md`;视觉 → `art-bible.md`。

## 记忆(文档)文件索引

| 文档 | 管什么 |
| --- | --- |
| `docs/project-rules.md` | 全仓约束/优先级/保存工作流 |
| `docs/original/game-settings.md`(~200KB) | 精确数值、内容、经济、文案、存档、动画、视觉行为 |
| `docs/original/architecture.md` | publish 源码归属、bundle、facade、运行时边界 |
| `docs/original/known-risks.md` | 运行时与浏览器防御契约 |
| `docs/original/qa-workflow.md` | 最小化验证与保存策略 |
| `docs/original/art-bible.md` / `game-design.md` / `interaction-visual-reference.md` / `platform-runtime.md` / `r18-art-policy.md` | 视觉/设计/交互/平台/成人内容策略 |
| `docs/original-runtime-freeze.json` | 机器可读运行时冻结契约(工具链依赖) |
| `docs/deepseek-rebuild/01~08` | 重构期设计文档(另一视角,改动前可对照) |
| `docs/开发日记.md` | 更新流水日志:每次变更(新建/修改/删除/提交/决策)必追加一条 |
| `docs/开发日记.md` §17 | **跨 AI 协作硬约束:scripts/ 边界、Git 保存规范、密钥传递方式、bundle 全量比对、删除前先核实** |
| `docs/reference/` | **权威数值/素材快照**:废墟沙城怪物属性清单、研究所立绘与BGM素材清单(md+csv);设计稿与实现冲突时以此为准 |

## 跨 AI 协作硬约束(写入前必读)

本仓库同时有多个 AI 接手(本地容器 + 远端)。**任何写入前先读
`docs/开发日记.md` §17**,其中规定:

- `scripts/save.sh` / `save-checkpoint.sh` **仅限容器环境**:需
  `CONTAINER_SECRET`、`PROVISIONING_GENERATION`、`PROVISIONING_TOKEN` 三个变量,
  并请求 `http://localhost:3005/git/save`。**禁止伪造变量**,**禁止**用
  `-H "...: $SECRET"` 传密钥(脚本已用 `curl -K -` 正确实现,不要改坏)。
- `scripts/verify.sh` / `verify-exhaustive.sh` / `test-offline.sh` 本地可跑。
- **本地验证 ≠ G 保存成功**。流程:`npm run build:bundles` → `npx playwright test`。
  保存失败必须如实报失败原因,不得声称"已同步/已发布"。
- 改 `src/original/*.js` 后必须**全量比对所有 bundle 的 blob sha** 再提交
  (曾漏提交 `startup.min.js`)。
- 删除请求:**先查文件树确认路径存在再动手**,删除不可逆。
  (曾要求删 `GGGG/`,实测 1059 条目零命中,未执行。)

记忆纪律:改规则时先改实现、再更新对应规范文档;代码与文档冲突视为 bug 并调和,不要静默二选一。

## DeepSeek 重制交接笔记(docs/ 根目录 .txt)

中文交接资料(2026-09,交接对象 DeepSeek 重制)。事实与 `docs/original/`、`docs/deepseek-rebuild/` 大量重叠;改动相关领域时两边保持一致,以 canonical 文档为权威。`07-UI描述.txt` 与 `08-界面布局.txt` 原本是同一份的重复拷贝,已删 08 保留 07。标注“最新”的三篇是更新修订版。

| 文件 | 内容 |
| --- | --- |
| `01-完整项目.txt` | 产品定位(魅魔杀,成人 18+,1280x720,键盘鼠标) |
| `02-游戏结构.txt` | 运行环境与架构(纯静态/沙箱 iframe/ASCII 路径) |
| `03-角色与角色技能.txt` | 26 名正式角色及技能、数值规则 |
| `04-卡牌.txt` | 卡牌系统分类与规则 |
| `05-怪物与怪物技能与饰品.txt` | 怪物 33 只(正式24+废墟沙城9)与饰品 30 个 |
| `06-副本.txt` | 正式副本 4 个(机械工厂/水下列车/兽人地下城/废墟沙城);另有【天日国鹰7研究所】第 5 个副本骨架,入口仍占位「未开发完成」 |
| `07-UI描述.txt` | UI 总风格、24 屏说明、战斗六带布局、弹窗层级与关闭顺序 |
| `09-开发风险.txt` | 18 类开发风险与防御 |
| `10-开发规则与DZMM规则.txt` | 静态规则/沙箱/DZMM SDK/音频/构建版本管理 |
| `11-素材引用.txt` | 素材文件名 → 角色/用途 引用清单 |
| `12-新副本素材-废墟沙城.txt` | 废墟沙城(ruins_sand_city)素材与数据(已接入正式地图) |
| `13-新角色引用-亚缇娜与玛利亚.txt` | data-new-characters 未完成角色,不纳入重制范围 |
| `离线开发与风险.txt` | 离线版定位、双模式存档、风险与测试清单 |
| `亚缇娜与玛利亚设计最新.txt` | 亚缇娜(狙击手)与玛利亚 最新设计 |
| `安洁莉卡技能重制.txt` | 安洁莉卡技能 bug 修复后重做方案(最新) |
| `废墟沙城怪物设计最新版本.txt` | 废墟沙城 15 层副本设定最新版 |

## 开发日记(每次更新必写)

- 文件:`docs/开发日记.md`。
- 纪律:每次发生文件**新建/修改/删除**、代码改动、git 提交或影响项目的决策,都必须在该文件末尾追加一条:日期 → 变更摘要 → 新建/修改/删除的文件路径清单(仓库相对路径)→ 提交 hash。**与游戏项目无关的更新(本机工具/环境安装、系统改动等)一律不写入。**
- 流水事实进开发日记;本文件与 docs 索引只做路由/规则,不重复记流水。
- 2026-11-24 补记:开发日记此前停在 2026-10-06,已补 § 阶段性汇总(248~264),逐项文件清单以 `git log` 记账提交与各轮回执为准。

## 测试与 QA

两层测试,入口都在 package.json / tools:
- 逻辑测试:`node tools/run-qa.js`(聚合器;`list` / `focus` / `logic` / `quick`),scripts 有 `npm run test:*`、`check:*` 一整套。
- 浏览器测试(Playwright):`tests/*.spec.js` + `*.scenario.js` + `helpers/`;跑 `node tools/run-browser-tests.js`。
- `scripts/` **现存在 5 个脚本**(save.sh / save-checkpoint.sh / verify.sh / verify-exhaustive.sh / test-offline.sh),仍是容器专用胶水:需 `CONTAINER_SECRET` 等三个变量并调用 `http://localhost:3005/git/save`。本环境该服务不可达、变量未注入,按 §17 **不伪造变量、不尝试调用**;推送改用 GitHub API,勿把 API 成功说成 G 保存成功。
- 运行依赖:`npm run build:bundles` / `check:core` / `check:lines` / `check:bundles` / `lint:js|css|html` 在当前环境**可直接运行**(terser、playwright 已就位,lint 由 `tools/` 封装);不要假定「必须 npm install 才能验证」。
- 守则:改动后只跑受影响范围的聚焦测试,未经用户要求不要跑全量。

## 当前状态指针(2026-11-26,只给指针不记流水)

- **远端**: `main` = `2d5d2e93`(2026-11-26 推送成功)= **293 版**；本地已到 **304 版待推送**,工作树有改动,见 `docs/开发日记.md` § 294~297 / § 298 / § 299 / § 301 与待推送清单。
- **本地记账**: 上一提交 `ef2938f`「【记账】293 版已推送 2d5d2e93」;本轮修复**未推送、未记账提交**,按 Push Policy 等明确「推送」指令后再补记。
- **版本**: `20260915-304` ×13 + villa.css ×4 + electron `26.0915.304`,11 个 bundle current(301 源码改动、303 幂等修复、302/304 文档同步各 bump 一次)。
- **deliveries/**: **293 版两个包**(2026-11-26 已出)。**不含 294~297 的非锁定技台词/饰品修复、298 的角色牌存储牌机制,也不含 299~304 的一次性放牌、时停返还、手牌数相对增量 3 个 BUG 修复**;要分发须重新出包。
- **非锁定技台词口径(294~297 修复,易错点)**:台词 / `「XX 发动了 Y」`字幕 / `「发动技能【Y】」`战报**只能在确认发动分支**播放;挂起「可发动 / 请选择」提示阶段一句都不能播,点「跳过 / 不交 / 放弃」后不得残留。已删除废弃的 `skillWhenPromptVisible`;`BattleLog.maybeRelicCaption` 的 `NOT_ACTIVATED` / `SKIPPED_SKILL` 两道守门拦住提示与跳过日志,真触发(含「拼花失败」「触发,跳过弃牌阶段」等)仍正常显示。
- **全库饰品三类口径(294~297)**:`relics.js` 的 `skillsForNames` / `skillIcon` 是单一真相源——`activeCard` → ⚔️ 主动技(不加前缀);`skillType:"trigger"` → 🔵 非锁定技(`effect` 以「非锁定技,」开头 + 含「你可以」+ 有跳过入口);其余 → ⭐ 锁定技(`effect` 以「锁定技,」开头 + 不含「你可以」)。**饰品有 3 个数据源**:`data-relics.js`(18) / `data-ruins-content.js`(10) / `data-future-relics.js`(12,末尾合并 ruins 10);286/651 轮只扫前两个,漏了【血色刺伞】(可选发动却一直 ⭐ 无前缀),297 轮补齐 🔵。新增饰品/技能漏写标签、图标与语义不符,`tools/check-relic-skill-tags.js`(vm 加载 3 源逐件校验 40 件)+ `tools/check-nonlocked-prompt-caption.js` 会立刻打红,均已登记 QA 目录,别再靠人工记忆扫数据源。
- **角色牌存储牌机制(298,易错点)**:参考三国杀界徐盛【破军】「扣置于武将牌旁 / 移出游戏直到回合结束」规则。新增 `battle-character-card-storage.js`(`window.BattleCharacterCardStorage`),数据 `unit.storedCards=[{card,source,ownerUid,release,storedTurn}]`,提供 `store/cardsOf/count/namesOf/release/endTurn/discardForDead/clear`。【魔刀阿波罗】扣出的牌放目标自己的角色牌上(存储牌,不计手牌、不能使用/打出/弃置),头像「存×N」徽章公开可见,扣置/返还动画以角色牌为起落点,任意角色回合结束由该角色获得并进手牌,阵亡直接入弃牌堆,旧档 `nanaliSealed` 自动迁移。**以后任何「放到角色牌上/武将牌上/存储牌」的新技能必须走此模块**,别再建私有暂存字段;`release` 支持 `anyTurnEnd`(现行)/`currentTurnEnd`(界徐盛严格口径)/`manual`。护栏 `tools/check-character-card-storage.js`(19/19 + 6 组反向)与实机 `tools/test-character-card-storage-live.js`(12/12)已登记 QA 目录。
- **一次性放牌 + 存储牌返还(299~300,易错点)**:`BattleEffectCardMotion.placeStoredCards` 负责【魔刀阿波罗】扣置牌「一次性放到角色牌上」——整批 1 个 DOM(叠层 + `×N` 角标)/1 段动画/1 次 `cardLand`,`sealCards` 事件须带 `toCharacterCard + placeOnce`;敌方 `handSpot` 退化成 `unitArt` 会让起点终点重合,函数内距离 <24px 时把起点抬到角色牌上方(夹回视口)。**别只看 `stagger:0` 就当「一次性」**:`flyFrontCards` 仍会为每张牌各建一个 DOM。**存储牌回合结束返还是规则清算不是技能发动**,放在 `battle-end-phase.js` 的 while 全部步骤成功后、`cleanupTurn` 之前无条件调用 `BattleCharacterCardStorage.endTurn(state)`;时停会 `steps.length=0`,挂 steps 里会被吞、牌滞留。护栏 `check-character-card-storage.js`(21/21 + 8 组反向,含 `timestop`/`once`)、实机 `test-character-card-storage-live.js`(13/13,A3b spy 数 DOM/落位)、`test-apollo-storage-deep-live.js`(11/11) 已登记 QA 目录。
- **验证环境易错点(300)**: 容器负载高时 Playwright 默认 `timeout:60000` 会在 `Tearing down "context"` 阶段假失败（测试体断言已全过、截图/trace 也生成）；用 `node node_modules/@playwright/test/cli.js test --timeout=180000 <spec>` 单跑即可，别误判成功能回归。本轮 7 个预览 spec 放宽后 7/7 通过。
- **手牌数显示相对增量(301~304,易错点)**:任何改变角色手牌数的动画事件必须携带 `visualHandDelta` 并按 `Math.max(0, current + delta)` 推进 `unit.visualHandCount`(`current = unit.visualHandCount ?? event.visualHandBefore ?? …`),**禁止用事件发生时的绝对快照覆盖**。`sealCards`(阿波罗扣置)此前漏了这条,队列里两次扣置之间夹着目标获得牌时会把 `syncIncomingHand` 已加的增量抹掉(实测 `6→4→3→1` 应为 `6→4→3→2`)。与 `BattleCards.queueResponse` / `battle-effect-handlers.response` 同口径;旧事件无 delta 时兜底绝对快照。相对增量必须**按事件幂等消耗**(`event._handDeltaApplied`,重播跳过),否则预览夹具/动画恢复重播同一事件会重复扣减(既有 `preview-battle-effects` 的后台 drain 实测会先消费队首);旧无 delta 事件仍绝对快照兼容。护栏 `check-character-card-storage.js` A13/A15 + 反向 `handDelta`/`absCover`/`idempotent`、实机 `test-apollo-handcount-matrix-live.js`(26/26,含扣 0/1/2/3/多张、扣牌数>手牌数、目标空手、连击不同扣牌数、真实 useCard、混合队列、重播幂等)已登记 QA 目录。
- **🔵 技能口径(易错点)**: 全库 **19 个** `🔵` 技能(含 8 个敌方技)公开描述一律以
  「非锁定技,」开头,权威源 `src/original/data-*.js` 的 `skills[].text`;
  `card.text` 是出牌卡面说明不加前缀。敌方 🔵 由 AI 自动决定,不设玩家跳过。
  玩家侧跳过入口三类:① 通用反击面板「发动/跳过」(`data-counter-trigger-skip`,
  复用给复仇反击/终焉回旋斩/护母反击/刺刀AK47/血色刺伞;螺旋桨 290 后续已改锁定技,不再共用);
  ② 8 个专属提示条按钮(各有 `data-*-skip`,含 `data-ophelia-guard-skip`);
  ③ 仅转换技(突破重围)按语义不设独立跳过。【为我护驾】已按三国杀曹操【护驾】
  改为真正非锁定技:不再要求自己没有【闪】、用「你可以指定」、提示条有
  「跳过(不发动)」;跳过后回到正常响应链(有闪自动出、无闪才由原目标承伤)。
  判定已提前到自动响应之前,触发范围收窄为「成为单体【杀】的目标」
  (`CardUtils.isSingleKill`),全体类杀牌不护驾;连击杀只在第 1 段弹窗。
  **🔵 饰品曾 2 个(霹雳之锤/螺旋桨,`skillType:"trigger"` 动态挂图标)的 `effect`
  补过「非锁定技,」前缀**;286 轮只覆盖 `skills[].text`,别再漏饰品数据源。
  (螺旋桨 290 后续已改锁定技,现只剩霹雳之锤 1 个 🔵 饰品,见下文。)
  `battle-damage-resolution.js` 已预防性拆出伤害修正链子模块
  `battle-damage-resolution-modifiers.js`(主 145 行),装配点显式抛错;
  按单文件读该文件做静态断言/vm 的 fixture 走 `split-source-view.js` 拼接视图。
  **螺旋桨 290 后续已改锁定技**(去掉 `skillType:"trigger"` → ⭐,effect「锁定技,」),
  玩家侧不再弹发动/跳过面板、自动触发;全库 🔵 饰品只剩霹雳之锤 1 个。
  护驾深查修了 2 个真 BUG:出闪/cancelKillCard 出口漏设 `_opheliaGuardDone`
  → 连击剩余段重复弹窗;被时停者仍能发动护驾 → 已补 `isSkillDisabled(target)`。
  4 条出口(承伤/出闪/cancel/跳过)都必须打标记,改护驾时别再漏。
  **`data-dimension-transfer-skip` 是次元转移独一份,没有被其它技能复用**;
  各跳过恢复链不同,不强行抽成统一组件。
- **术语口径(易错点)**: 全库旧三字技能标签已统一为「**非锁定技**」(三国杀语义:
  锁定技=到点强制发动,非锁定技=描述含「可以」、玩家可选择不发动);
  「触发技能」等复合词保留,历史公告按既有口径不改。【榨取精华】【次元转移】
  描述带「非锁定技,」前缀,次元转移图标为 `🔵`,提示条按钮为「跳过(不发动)」。
- **研究所摸牌口径(易错点)**: `drawPerTurn` / `initialDraw` 字段存的是**加成值 N**,
  引擎按 `2 + drawPerTurn` / `4 + initialDraw` 结算
  (`battle-runtime-helpers.js` 的 `turnDrawCount` / `initialDrawCount`),
  `ui-common.js` 的 `baseValue` 面板同样加 2 / 4。用户稿「基础2 + N / 基础4 + N」
  的 N 才是落库值:突击队 1/1、防爆队 2/3、清理机器人 3/2、食尸鬼 1/1,
  实摸 3/5、4/7、5/6、3/5。**不要再把实摸总量写进字段**
  (会每回合多摸 2 张、开局多摸 4 张)。全库其它角色/副本同口径,改公式会带偏全体。
- **技能牌口径**: `_skill` / `skillName` 对象是技能结算载体,**不能删**
  (useCard 跳过手牌移出、战报「发动了」、shownPlayed / 存档 / 飘字依赖)。
  视觉层已删干净:53 张技能牌图 0 残留、`CardArt.isSkill` 不解析卡图、
  出牌区 `ui-battle-trail.js` 过滤、`BattleEffectPlay.playCard` 与敌方
  `enemyPlay` / `virtualPlay` 三条动画链均不生成 projectile。普通实体牌 / 虚拟杀 /
  追加伤害段飞牌演出不变。
- **测试战斗 BGM**: `hall-test-actions.js` 的 `testBattleMissionId(selected)` 按所选敌人
  反查 `GameDataWorld.enemies` 分组,全同副本才用该副本 id;研究所 4 只普通怪不带
  各自 `bgm`,回落到 `mission.bgm` 的新无缝战斗 OGG;混合 / 空 / 未识别退回
  `machine_factory`。正式副本链与 28 首 BGM 全量口径不变。
- **权威数值源**: `src/original/data-tenri-institute-enemies.js`(用户原稿)、
  `data-ruins-sand-city-enemies.js`;快照见 `docs/reference/`。研究所入口保持「未开发完成」。
- **复活链口径**: `SakuraRisaSkills.preventDeath` 是丽莎【不死食尸鬼】与研究所
  【快速复生】共用唯一免死入口,全库 10 个 `BattleHpValue.applyDamage` 调用点
  (3 主链 + 7 生命流失路径)均已挂接;两条 `beginTurn` 按 `isRisa` / `isGhoul` 互斥。
  【自爆倒计时】主动自毁按既有设计为豁免。
- **已知边界**: Electron 仍是 `loadFile`(file: 协议),WebAudio 采样级路径只在
  http/https/app 协议启用,桌面端当前走原生 loop 回退;QA logic 组两个历史红项
  (洛基 3 级魔力 / 存档恢复敌方出牌阶段)与本轮无关,未修。
## 会话备忘(2026-09-07)

- 已 `git init`(分支 `魅魔杀`)并完成首次上传:提交 `55f7f0d`(1009 文件,Initial upload of the complete project),强推覆盖远端空提交后 tip 一致,已设置上游跟踪 `origin/魅魔杀`。 (该分支已于 2026-09-12 改名为 `main`,见 §33;本条为 2026-09-07 历史事实,保留原文。)
- 为绕过不稳定网络,仓库级已配置 `http.postBuffer=524288000`、`http.version=HTTP/1.1`(可随时移除)。
- 提交身份(仓库级):`meigang1993` / `322323265+meigang1993@users.noreply.github.com`。
- `.ohmyagent/settings.json`(工具生成的权限配置)不入库;`.ohmyagent/AGENTS.md` 建议入库随项目走。
- 未跟踪/被忽略:`GGGG/`(项目 .gitignore 排除)、`.ohmyagent/` 工具产物等。
- 2026-09-07:决策保留 scripts/ 缺口不伪造;创建 `docs/开发日记.md`,纪律=每次更新必写、且只写与游戏项目相关的内容(提交见 git log)。
