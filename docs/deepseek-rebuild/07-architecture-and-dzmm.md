# 07 架构与 DZMM 规则

## 运行边界

游戏必须是纯静态网站：

- 入口：`publish/index.html`
- 技术：HTML、CSS、JavaScript、Canvas、Web Audio、静态资源
- 禁止 Node/Python 服务、端口监听、Express/Flask、服务器依赖
- 资源全部使用相对路径
- `publish/` 下所有路径只能包含 ASCII 字母、数字、`_`、`-`、`.`，不能有中文、空格或 emoji

生产游戏运行在没有 `allow-same-origin` 的沙箱 iframe：

- 不访问 `parent.document`、`top.location`、`window.opener`
- 不依赖 cookie、localStorage、sessionStorage、IndexedDB
- 生产存档使用 `dzmm.kv`

## 推荐文件组织

重制项目可以使用以下结构：

```text
publish/
  index.html
  style.css
  data.js
  battle.js
  ui.js
  storage.js
  audio.js
  assets/
    images/
    audio/
```

如果单个 JS 文件接近 150 行就拆分；任何 JS 文件不得超过 200 行。沙箱不保证 ES Module，优先使用有顺序的 classic script 和全局命名空间。

## 启动加载

资源较多时尽早调用：

```javascript
dzmm.loading.progress({ phase: "start", message: "Preparing game" });
```

资源完成后报告 `resource_loading`，首个可交互画面渲染后调用 `dzmm.loading.ready()`。启动失败调用 `dzmm.loading.error(code, message)`，并在游戏内显示重试入口。

## SDK 能力

先检查 `dzmm.capabilities.get()`：

- `caps.kv`：基础 KV
- `caps.kvBatch`：批量 KV
- `caps.kvList`：列表 KV
- `caps.workshop`：创意工坊
- 其他能力按实际返回值判断

不能先调用不支持的接口再 catch 探测。

## 存档

- `dzmm.kv` 是正式权威存档。
- localStorage 只能作为非沙箱环境的 best-effort fallback。
- 远端和本地都失败必须报告失败，不能伪装成成功。
- 重要节点按里程碑写，不按帧、定时器、拖动或连续输入写。
- 关键节点可以使用 `flush: true`。
- 注册 `window.dzmm?.save?.onAction?.(...)`，处理 `reset` 和 `prepareDeleteRecord`。
- 删除失败要恢复 autosave 并阻止宿主继续。

## AI 与绘图

高成本调用：

- `dzmm.completions`
- `dzmm.draw.generate`
- `dzmm.draw.edit`
- `dzmm.fn.invoke`

这些调用不能放进每帧循环、`setInterval`、`pointermove`、连续 `oninput` 或自触发回调。

每个长任务必须有：

- in-flight 锁
- 可见 loading
- 请求 ID 防旧请求覆盖新结果
- 一次玩家动作最多一次付费调用
- 显式重试按钮
- 不自动重试

`completions` 只使用 `user` / `assistant` 角色，不使用 `system`。流式回调给出累计全文，完成后再解析 JSON；解析失败必须有文本 fallback。

绘图返回的 URL 有时效性。长期保存 `taskId` 和图片索引，渲染时使用 `draw.status(taskId)` 重新获取签名 URL；不要把短期 URL 写进存档。

## 错误处理

优先判断 `error.code`：

- `RATE_LIMITED`：结束当前动作，提示稍后由玩家手动重试。
- `QUOTA_EXHAUSTED`：提示额度/积分不足，不重试。
- `VIP_REQUIRED`：提示会员条件。
- `UNAUTHORIZED` / `TOKEN_EXPIRED` / `FORBIDDEN`：提示重新进入游戏。
- `SENSITIVE_CONTENT_DETECTED`：提示修改输入。
- `NETWORK_ERROR` / `TIMEOUT`：恢复显式重试。

catch 中记录 `err.code`、`err.message`、`err.stack`，不要只打印 Error 对象。

## Serverless 函数

只有需要隐藏提示词、防作弊判分、全局排行榜或多步 AI 链时才使用 `functions/*.ts`。函数不是密钥保险箱。函数内部调用 AI/绘图会消耗触发玩家额度。

浏览器调用：

```javascript
await dzmm.fn.invoke("function-name", body);
```

有副作用的函数必须接收稳定 `actionId`，服务端用 reservation/completed 状态防重复奖励。新函数保存游戏发布后，真实玩家才能调用；未发布会出现 `function_not_published`。

## 音频

运行时使用 `dzmm.audio.play(key)`，禁止 `new Audio()` 或自行创建 `<audio>` 播放。BGM 要在第一次玩家点击后启动；平台已有全局音量和静音控制。
