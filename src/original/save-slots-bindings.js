window.SaveSlotsBindings = deps => function bind(ctx) {
  if (!deps.mode()) return;
  const parseSlotId = value => value === "auto" ? value : Number(value);
  document.querySelector("[data-save-close]")?.addEventListener("click", () => {
    deps.close();
    ctx.render();
  });
  document.querySelector("[data-save-retry]")?.addEventListener("click", () => deps.reload(ctx.render));
  document.querySelectorAll("[data-save-slot]").forEach(button => {
    button.onclick = async () => {
      const slotId = parseSlotId(button.dataset.saveSlot);
      const slot = deps.slots()?.find(item => item.id === slotId);
      if (deps.mode() === "save") {
        if (slot?.cloudUnknown) {
          deps.notice("云端状态未知，为避免覆盖未读取的云端进度，请恢复网络后再保存", ctx.render);
          return;
        }
        if (slot?.summary) deps.ask("覆盖此存档？原有进度将被替换。", () => deps.saveTo(slotId, ctx.getState(), ctx.render, ctx.log, true), ctx.render);
        else await deps.runAction(
          () => deps.saveTo(slotId, ctx.getState(), ctx.render, ctx.log, false),
          ctx.render
        );
        return;
      }
      if (slot?.corrupt) {
        deps.notice("此存档位数据异常，可删除或覆盖", ctx.render);
        return;
      }
      if (!slot?.summary) {
        deps.notice(slot?.cloudUnknown ? "云端暂不可用，且本地没有可读取的存档" : "此存档位为空", ctx.render);
        return;
      }
      deps.ask("读取此存档？当前未保存的进度将丢失。", () => deps.loadFrom(slotId, ctx), ctx.render);
    };
  });
  document.querySelectorAll("[data-delete-slot]").forEach(button => {
    button.onclick = event => {
      event.stopPropagation();
      const slotId = Number(button.dataset.deleteSlot);
      const slot = deps.slots()?.find(item => item.id === slotId);
      if (slot?.cloudUnknown) {
        deps.notice("云端状态未知，为避免误删未读取的云端进度，请恢复网络后再删除", ctx.render);
        return;
      }
      deps.ask("确定删除此存档？此操作不可撤销。", () => deps.deleteSlot(slotId, ctx), ctx.render);
    };
  });
  document.querySelectorAll("[data-load-slot-source]").forEach(button => {
    button.onclick = event => {
      event.stopPropagation();
      const [slotId, source] = button.dataset.loadSlotSource.split(":");
      deps.ask(`读取${source === "local" ? "本地" : "云端"}副本？选中的版本会同步为新的主存档。`, () => deps.loadFrom(parseSlotId(slotId), ctx, source), ctx.render);
    };
  });
  document.querySelector("[data-notice-ok]")?.addEventListener("click", () => deps.clearNotice(ctx.render));
  document.querySelector("[data-notice-action]")?.addEventListener("click", async () => {
    await deps.runAction(deps.takeNoticeAction(), ctx.render);
  });
  document.querySelector("[data-confirm-cancel]")?.addEventListener("click", () => deps.clearConfirm(ctx.render));
  document.querySelector("[data-confirm-ok]")?.addEventListener("click", async () => {
    await deps.runAction(deps.takeConfirmAction(), ctx.render);
  });
};
