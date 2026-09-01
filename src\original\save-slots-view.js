window.SaveSlotsView = (() => {
  const esc = value => String(value ?? "").replace(/[&<>"]/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;",
  }[char]));

  function render(model) {
    const {
      mode, slots, loadError, confirmText, noticeText, noticeAction, noticeLabel,
      actionBusy,
    } = model;
    if (!mode) return "";
    const title = mode === "save" ? "选择要写入的存档位" : "选择要读取的存档位";
    const list = slots
      ? slots.map(slot => slotCard(slot, mode)).join("")
      : loadError
        ? `<div class="save-loading">${esc(loadError)}<button data-save-retry="1">重试</button></div>`
        : "<div class='save-loading'>正在读取存档位…</div>";
    const blocked = noticeText || confirmText || actionBusy ? " inert" : "";
    return `<div class="save-overlay" role="dialog" aria-modal="true" aria-labelledby="save-title"><section class="save-panel"${blocked}>
      <h2 id="save-title">存档管理</h2><p class="muted">${title}</p>
      <div class="save-list">${list}</div>
      <button class="ghost" data-save-close="1">返回</button>
    </section>${actionBusy ? busyBox() : noticeText ? noticeBox(noticeText, noticeAction, noticeLabel) : ""}${!actionBusy && confirmText ? confirmBox(confirmText) : ""}</div>`;
  }

  function slotCard(slot, mode) {
    const summary = slot.summary;
    const name = slot.automatic ? "自动存档" : `存档 ${slot.id}`;
    const selectable = !slot.automatic || mode === "load";
    const actionAttrs = selectable ? `data-save-slot="${slot.id}" role="button" tabindex="0"` : 'aria-disabled="true"';
    const classes = `save-slot${slot.automatic ? " automatic" : ""}`;
    const deleteButton = slot.automatic || slot.cloudUnknown ? "" : `<button class="save-delete" data-delete-slot="${slot.id}" title="删除">×</button>`;
    const automaticNote = slot.automatic ? `<span class="save-auto-note">普通变化：本地立即保存，云端约1秒后同步。<br>关键节点：新游戏、成长与消费、副本进入和结算、战斗开始、稳定操作检查点和结束、角色与剧情解锁时立即同步。</span>` : "";
    if (slot.corrupt) return `<div class="${classes} corrupt" ${actionAttrs}><span class="save-icon">!</span><b>${name}</b><em>${slot.cloudUnknown ? "云端不可用，本地数据异常" : "数据异常"}</em>${automaticNote}${deleteButton}</div>`;
    if (!summary) return `<div class="${classes} empty" ${actionAttrs}><span class="save-icon">◇</span><b>${name}</b><em>${slot.cloudUnknown ? "云端不可用，本地无存档" : slot.automatic ? "暂无自动存档" : "空"}</em>${automaticNote}</div>`;
    const localLabel = slot.localCorrupt ? "损坏" : slot.localSummary?.time || "无";
    const cloudLabel = slot.cloudCorrupt ? "损坏" : slot.cloudSummary?.time || "无";
    const sourceButtons = `${slot.localAvailable ? `<button data-load-slot-source="${slot.id}:local">读取本地</button>` : ""}${slot.cloudAvailable ? `<button data-load-slot-source="${slot.id}:cloud">读取云端</button>` : ""}`;
    const conflict = slot.conflict ? `<span class="save-conflict">本地 ${esc(localLabel)} / 云端 ${esc(cloudLabel)}，默认使用${slot.selectedSource === "local" ? "已验证的本地版本" : "云端版本"}；可手动选择副本处理冲突</span>
      ${mode === "load" && sourceButtons ? `<span class="save-conflict-actions">${sourceButtons}</span>` : ""}` : "";
    const cloudWarning = slot.cloudUnknown ? `<span class="save-conflict">云端暂不可用，当前显示本地副本</span>` : "";
    return `<div class="${classes}" ${actionAttrs}>
      <span class="save-icon">${slot.automatic ? "✦" : "◆"}</span><b>${name}</b>
      <span>时间：${esc(summary.time)}</span><span>已解锁：${summary.unlocked}/${summary.total}</span>
      <span>队伍：${esc(summary.party || "无")}</span><span>莉莉丝元：${summary.gold}　精华宝珠：${summary.essence}</span>
      ${automaticNote}${conflict}${cloudWarning}
      ${deleteButton}
    </div>`;
  }

  function confirmBox(text) {
    return `<div class="save-confirm" role="alertdialog" aria-modal="true" aria-label="存档确认"><div class="confirm-card"><p>${esc(text)}</p><div><button data-confirm-ok="1">确认</button><button class="ghost" data-confirm-cancel="1">取消</button></div></div></div>`;
  }

  function noticeBox(text, action, label) {
    return `<div class="save-confirm" role="alertdialog" aria-modal="true" aria-label="存档提示"><div class="confirm-card"><p>${esc(text)}</p><div>${action ? `<button data-notice-action="1">${esc(label || "重试")}</button>` : ""}<button class="ghost" data-notice-ok="1">知道了</button></div></div></div>`;
  }

  function busyBox() {
    return "<div class='save-confirm' role='status' aria-live='polite'><div class='confirm-card'><p>正在处理存档并同步设置，请勿关闭页面…</p><div><button disabled>处理中…</button></div></div></div>";
  }

  function copyStatus(labels) {
    return {
      ok: labels.filter(([, copy]) => copy?.attempted && copy.ok).map(([label]) => label),
      failed: labels.filter(([, copy]) => (copy?.attempted || copy?.pending) && !copy.ok).map(([label]) => label),
    };
  }

  const savedCopies = results => copyStatus([
    ["本地存档位", results?.slot?.local],
    ["云端存档位", results?.slot?.cloud],
    ["本地主档", results?.main?.local],
    ["云端主档", results?.main?.cloud],
  ]);
  const mainCopies = results => copyStatus([
    ["本地主档", results?.local],
    ["云端主档", results?.cloud],
  ]);

  return { render, savedCopies, mainCopies };
})();
