window.AppRenderOverlays = (() => {
  function startScreen() {
    if (startLoadError) return `<div class="start-screen"><section class="start-card boot-error"><span class="start-kicker">云存档暂时不可用</span><h2>无法安全读取进度</h2><p>${UICommon.esc(startLoadError)}</p><div class="start-actions"><button data-start-retry-load="1" ${startActionBusy ? "disabled" : ""}>${startActionBusy ? "重试中…" : "重试读取"}</button></div></section></div>`;
    const busy = startActionBusy ? " disabled" : "";
    const creditsLock = creditsOpen ? " inert" : "";
    const temporary = sessionOnly
      ? `<div class="save-warning" role="alert"><span>临时试玩模式：不会读取、覆盖或保存任何云端进度，刷新后本次进度消失。</span></div>` : "";
    const load = sessionOnly ? "" : `<button class="start-command" data-start-load="1"${busy}><span aria-hidden="true">◆</span><b>读档</b></button>`;
    const newGameLabel = sessionOnly ? "开始临时试玩" : "新游戏";
    return `<div class="start-screen"><section class="start-card" aria-label="魅魔杀"${creditsLock}><div class="start-emblem"><h2>魅魔杀</h2></div>${temporary}<div class="start-actions"><button class="start-command primary" data-start-game="1"${busy}><span aria-hidden="true">✦</span><b>${newGameLabel}</b></button>${load}<button class="start-command" data-start-settings="1"${busy}><span aria-hidden="true">⚙</span><b>设置</b></button></div></section><button class="credits-button" data-open-credits="1"${creditsLock}><span aria-hidden="true">❦</span><b>制作名单</b></button>${creditsPanel()}</div>`;
  }
  function creditsPanel() {
    if (!creditsOpen) return "";
    return `<div class="credits-overlay ${creditsClosing ? "closing" : ""}" data-credits-overlay="1" role="dialog" aria-modal="true" aria-labelledby="credits-title"><section class="credits-panel"><button class="credits-close" data-close-credits="1" aria-label="关闭">×</button><h2 id="credits-title">制作名单</h2><div class="credits-content"><section><b>开发与设计</b><span>作者：<span class="gold">梅花GANG</span></span></section><section><b>AI 技术支持</b><span>AI 开发辅助</span></section><section><b>音乐素材</b><span>BGM 来源：<span class="gold">MusMus</span></span><span>BGM 来源：<span class="gold">pixabay</span></span><span>BGM 来源：<span class="gold">魔王魂</span></span><span>BGM 来源：<span class="gold">FREESOUND 飞声</span></span><span>BGM 来源：<span class="gold">FreePD</span></span></section><section><b>立绘素材</b><span><span class="gold">千问 AI 生成</span></span><span><span class="gold">DZMM 生成</span></span></section></div></section></div>`;
  }
  function closeCredits(render) {
    if (!creditsOpen || creditsClosing) return;
    creditsClosing = true;
    render();
    setTimeout(() => { if (!creditsClosing) return; creditsOpen = false; creditsClosing = false; render(); }, 280);
  }
  function settings() {
    if (!settingsOpen) return "";
    const canRetreat = !!state.explore && !["battle", "battleLoading"].includes(state.view), sfx = state.settings?.sfxVolume ?? 80, music = state.settings?.musicVolume ?? 80, battleSpeed = state.settings?.battleSpeed ?? 1, manualResponse = !!state.settings?.manualResponse;
    const status = sessionOnly ? {} : GameStore.status?.().settings || {};
    const blocked = !sessionOnly && ["error", "loading", "syncing"].includes(status.state);
    const disabled = blocked ? " disabled" : "";
    const errorText = status.error === "SETTINGS_SAVE_FAILED"
      || status.error === "SETTINGS_SYNC_PENDING"
      ? "设置同步失败，当前修改已保留，尚未写入云端。"
      : status.error === "SETTINGS_CLOUD_INVALID"
        ? `${status.localAvailable ? "云端设置数据损坏，当前使用本地副本。" : "云端设置数据损坏，且没有有效本地副本。"}`
        : `${status.localAvailable ? "云端设置读取失败，当前使用本地副本。" : "设置读取失败，当前仅使用默认值。"}为避免覆盖未知的云端配置，修改已暂停。`;
    const retryText = status.error === "SETTINGS_CLOUD_INVALID"
      ? "修复设置" : status.pending ? "重试同步" : "重试读取";
    const warning = sessionOnly
      ? `<div class="save-warning" role="alert"><span>临时试玩中的设置只在本次页面生效，不会保存。</span></div>`
      : status.state === "error"
      ? `<div class="save-warning" role="alert"><span>${errorText}</span><button data-retry-settings="1">${retryText}</button></div>`
      : status.state === "loading" || status.state === "syncing"
        ? `<div class="save-warning" role="status"><span>${status.state === "syncing" ? "正在同步设置…" : "正在重新读取云端设置…"}</span><button disabled>${status.state === "syncing" ? "同步中…" : "读取中…"}</button></div>`
        : "";
    const speedOptions = [1, 1.5, 2].map(value => `<label><input data-battle-speed="${value}" type="radio" name="battle-speed" value="${value}" ${battleSpeed === value ? "checked" : ""}${disabled}><span>${value}x</span></label>`).join("");
    const storageActions = sessionOnly ? "" : `<button data-save-game="1">存档</button><button data-load-game="1">读档</button>`;
    return `<div class="settings-overlay" data-settings-overlay="1" role="dialog" aria-modal="true" aria-labelledby="settings-title"><section class="settings-menu"><h2 id="settings-title">设置</h2>${warning}${storageActions}<button data-fullscreen="1">全屏</button><button data-settings-retreat="1" ${canRetreat ? "" : "disabled"}>撤退</button><label>音效音量<input data-sfx-volume="1" type="range" min="0" max="100" value="${sfx}"${disabled}></label><label>音乐音量<input data-music-volume="1" type="range" min="0" max="100" value="${music}"${disabled}></label><fieldset class="settings-speed"><legend>战斗动画速度</legend><div>${speedOptions}</div></fieldset><label><input data-manual-response="1" type="checkbox" ${manualResponse ? "checked" : ""}${disabled}> 手动使用/打出响应牌</label><button class="ghost" data-close-settings="1">返回游戏</button></section></div>`;
  }
  function globalOverlay(setHTML) {
    let root = $("global-overlay");
    if (!root) {
      root = document.createElement("div");
      root.id = "global-overlay";
      document.body.appendChild(root);
    }
    const info = state.infoUnit ? GameUI.infoPanel(state) : "";
    const settingsHtml = settings(), saveSlots = SaveSlots.render();
    const relicCodex = state.relicCodex ? UICommon.relicCodex(state) : "";
    const art = artZoom(), confirm = GameConfirm.render(state);
    const runtimeError = window.AppRuntimeErrors?.markup?.() || "";
    const active = !!(settingsHtml || saveSlots || info || relicCodex
      || art || confirm || runtimeError);
    root.classList.toggle("active", active);
    $("app")?.toggleAttribute("inert", active);
    const changed = setHTML(root,
      settingsHtml + saveSlots + info + relicCodex + art + confirm + runtimeError);
    [...root.children].forEach((child, index, children) => {
      child.toggleAttribute("inert", index < children.length - 1);
    });
    return changed;
  }
  function artZoom() {
    const src = state.artZoom?.src;
    if (!src) return "";
    const name = UICommon.esc(state.artZoom.name || "角色立绘");
    const media = `<img src="${UICommon.esc(src)}" alt="${name}" decoding="async" draggable="false">`;
    return `<div class="art-zoom" data-close-art="1" role="dialog" aria-modal="true" aria-label="${name}"><button class="info-close art-zoom-close" aria-label="关闭立绘">×</button><div class="art-zoom-frame">${media}</div><span>${name} · 滚动查看全身</span></div>`;
  }
  function showBoot(message = "正在准备游戏资源…") {
    $("settings-toggle").disabled = true;
    $("resources").innerHTML = `<div class="resource"><span>启动中</span><b>…</b></div>`;
    $("nav").innerHTML = views.map(([, name]) => `<button disabled>${name}</button>`).join("");
    $("view").innerHTML = `<div class="boot-card"><b>正在进入贝丝妲的别墅…</b><span>${UICommon.esc(message)}</span><div class="load-bar indeterminate"><i></i></div></div>`;
  }
  return { startScreen, closeCredits, settings, globalOverlay, showBoot };
})();
