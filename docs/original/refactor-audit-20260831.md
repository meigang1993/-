# 20260831 源文件拆分审查

## 拆分概览

将 4 个超过 160 行的 `src/original/` 源文件拆分为「父门面 + 辅助模块」结构。所有公开 API 保持不变，仅做内部实现拆分以符合 200 行硬约束。

| 父门面 | 行数变化 | 辅助模块 | 抽出的函数 |
|---|---|---|---|
| battle-manual-continuation.js | 188→116 | battle-manual-continuation-resume.js (84) | resumeInterruptedActions / resumeComboAttack / resumeGreenGatling |
| battle-dodge-response.js | 183→110 | battle-dodge-deflect.js (83) | confirmDeflectResult / autoDodge |
| battle-action-hand-bindings.js | 171→140 | battle-action-hand-visibility.js (41) | kaiichiShareVisible / dimensionTransferVisible / responsibilityVisible / expectedHandOwner / cardMatchesHandOwner / queuePromptCard |
| battle-save-checkpoint.js | 162→80 | battle-save-checkpoint-snapshot.js (96) | detachPiles / snapshot / restorePile / restorePiles / restore / adoptRestored |

辅助模块通过工厂函数 `window.XxxHelper = deps => {...}` 模式，由父门面在初始化时调用并传入闭包依赖。父门面继续导出原 API 名称，内部委托给辅助模块。

## 审查维度

### 1. 公开 API 等价性

| 父门面 | 原导出 | 新导出 | 等价 |
|---|---|---|---|
| BattleManualContinuation | resumeAfterManualResponse / resumeInterruptedActions / continueAfterInterruptedActions | 同左（resumeInterruptedActions 转发自辅助模块） | ✓ |
| BattleDodgeResponse | shouldManualDodge / queueManualDodge / autoDodge / resolveManualDodge / confirmDeflectResult | 同左（autoDodge / confirmDeflectResult 转发自辅助模块） | ✓ |
| BattleActionHandBindings | bindCards / bindSkills / kaiichiShareVisible | 同左（kaiichiShareVisible 转发自辅助模块） | ✓ |
| BattleSaveCheckpoint | adoptRestored / baseline / canSave / mark / restore / noteOperation / savedMarker / savedTurn / snapshot / stable / version | 同左（adoptRestored / restore / snapshot 转发自辅助模块） | ✓ |

### 2. 闭包依赖传递完整性

| 辅助模块 | 注入的 deps | 实际用到 | 完整 |
|---|---|---|---|
| BattleManualContinuationResume | allUnits, combat, waitEffects, actionGuard, hitResume, record | allUnits, combat, waitEffects, actionGuard, hitResume（record 多余但无害） | ✓ |
| BattleDodgeDeflect | deps, canDodge, cards, ctx, damage, hammer, triggers, resume, settleAssault, clearManual | 全部用到 | ✓ |
| BattleActionHandVisibility | （IIFE，无 deps 注入，直接访问 window 全局） | window.HoshinoSkills / MannySkills / WendyCadicisSkills / BattleSystem / state / BattleActionGuard | ✓ |
| BattleSaveCheckpointSnapshot | record, sidePile, stable, validPile, validUnits, savedMarker, normalizeMarker, version | 全部用到 | ✓ |

### 3. bundle 加载顺序（publish-bundles.json）

| bundle | 顺序 | 正确 |
|---|---|---|
| startup-store | battle-save-checkpoint-validation.js → battle-save-checkpoint-snapshot.js → battle-save-checkpoint.js | ✓ |
| battle-rules | battle-dodge-cards.js → battle-dodge-resume.js → battle-dodge-deflect.js → battle-dodge-response.js | ✓ |
| battle-ui | battle-action-hand-visibility.js → battle-action-hand-bindings.js | ✓ |
| battle-flow | battle-manual-hit-resume.js → battle-manual-continuation-resume.js → battle-manual-continuation.js | ✓ |

辅助模块均在父门面之前加载。工厂函数（`deps => {...}`）加载时只赋值不立即执行；父门面 IIFE 加载时调用工厂，此时辅助模块已定义。

### 4. this 绑定

所有拆分的函数均为箭头函数或普通 function 声明，不依赖 `this`。闭包变量通过参数或词法作用域访问，无 this 丢失问题。✓

### 5. 副作用顺序

- 辅助模块加载只赋值 `window.XxxHelper = deps => {...}`，函数体不立即执行，无副作用。✓
- 父门面 IIFE 加载时调用辅助工厂，工厂内部只定义函数并返回对象，无副作用。✓
- BattleActionHandVisibility 是 IIFE，立即执行但内部只定义函数和返回对象，无 DOM/网络/状态副作用。✓

### 6. 函数声明提升（hoisting）

- battle-manual-continuation-resume.js：`resumeInterruptedActions` 调用同模块内后定义的 `resumeComboAttack` / `resumeGreenGatling`，函数声明提升使其工作。与原代码一致。✓
- battle-save-checkpoint-snapshot.js：`restore` 调用同模块内先定义的 `restorePiles`，顺序正确。✓

### 7. 调用链等价性

- 原 `resumeAfterManualResponse` → 本地 `resumeInterruptedActions` → 本地 `resumeComboAttack`/`resumeGreenGatling`
- 新 `resumeAfterManualResponse` → `resume.resumeInterruptedActions` → 辅助模块内 `resumeComboAttack`/`resumeGreenGatling`
- 三段函数体逐字等价（仅外层闭包改为 deps 注入），调用链语义不变。✓

其余三组拆分同理：父门面调用的辅助函数，函数体与原代码逐字一致，仅闭包变量改为通过 deps 注入或从辅助模块解构获取。

## 风险评估（对照 known-risks.md 9 项防御机制）

| 防御机制 | 是否涉及 | 风险 |
|---|---|---|
| State replacement（异步边界捕获 state/generation） | 否（拆分未改异步流程） | 无 |
| GameRandom（seed+cursor 随机） | 否 | 无 |
| ActionGuard（统一防护） | 是（actionGuard 通过 deps 传递） | 无（传递正确） |
| Runtime error boundary | 否 | 无 |
| Interrupt chain（中断恢复保留 hit/target index） | 是（battle-manual-continuation 涉及） | 无（函数体逐字等价，hitResume 依赖正确传递） |
| Save idempotency（收据驱动） | 是（battle-save-checkpoint 涉及） | 无（marker/snapshot/restore 逻辑逐字等价） |
| DOM preservation（重绘保留节点） | 是（battle-action-hand-bindings 涉及） | 无（绑定逻辑逐字等价） |
| Animation fallback | 否 | 无 |
| Asset budget | 否 | 无 |

## 验证结果

提交前已跑全部 5 项 check 通过：
- check:bundles ✓ 11 个 bundle current
- check:static ✓ 227 publish / 390 source
- check:scripts ✓ 390 sources / 380 exports（含 4 个新 window exports）
- check:resources ✓ 267 refs / 180 assets
- check:asset-budget ✓ 33.48 MiB / 180 files

pre-commit hook 在 commit `982c841` 时再次跑全部 5 项通过。

## 结论

4 个拆分均无 BUG、无副作用、公开 API 完全等价。所有改动属于内部实现重构，不改变运行时行为，不引入新风险，不属于 A 级风险。

game-build 已递增至 `20260831-01`，源地图已在 `docs/original/game-settings.md` line 88 末尾补充说明。
