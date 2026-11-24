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

## 当前状态指针(2026-11-24,只给指针不记流水)

- **版本**:本地 `20260915-264`(11 个 bundle current),`deliveries/` 仍是 **260 版两个包**;本轮纯文档整理,未改源码、未重建、未升版。
- **远端**:`main` = `fc8c935c` = 263 提交 `c0f8c6d6` + 远端并行新增 `天日国鹰7研究所.zip`(该 zip 已下载解压到沙盒工作区 `研究所素材/`,但**未纳入仓库**;远端原 zip 按要求保留)。
- **待推**:264 的 17 项 + 本轮文档/记忆整理项,均**未提交、未推送、未出包**;推前需先处理远端多出的 1 个提交/文件。
- **权威数值源**:`src/original/data-ruins-sand-city-enemies.js`;快照见 `docs/reference/`。研究所怪物设计仍未定稿,入口保持「未开发完成」。
- 流水、逐项文件清单与已知提交 hash 一律见 `docs/开发日记.md` 末段,本文件不复制。

## 会话备忘(2026-09-07)

- 已 `git init`(分支 `魅魔杀`)并完成首次上传:提交 `55f7f0d`(1009 文件,Initial upload of the complete project),强推覆盖远端空提交后 tip 一致,已设置上游跟踪 `origin/魅魔杀`。 (该分支已于 2026-09-12 改名为 `main`,见 §33;本条为 2026-09-07 历史事实,保留原文。)
- 为绕过不稳定网络,仓库级已配置 `http.postBuffer=524288000`、`http.version=HTTP/1.1`(可随时移除)。
- 提交身份(仓库级):`meigang1993` / `322323265+meigang1993@users.noreply.github.com`。
- `.ohmyagent/settings.json`(工具生成的权限配置)不入库;`.ohmyagent/AGENTS.md` 建议入库随项目走。
- 未跟踪/被忽略:`GGGG/`(项目 .gitignore 排除)、`.ohmyagent/` 工具产物等。
- 2026-09-07:决策保留 scripts/ 缺口不伪造;创建 `docs/开发日记.md`,纪律=每次更新必写、且只写与游戏项目相关的内容(提交见 git log)。
