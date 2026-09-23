global.window = global;

require("../src/original/save-slots-view.js");
require("../src/original/save-slots-bindings.js");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const slots = [
  {
    id: "auto",
    automatic: true,
    summary: { time: "auto", unlocked: 2, total: 9, party: "A", gold: 7, essence: 1 },
    localAvailable: true,
  },
  { id: 1, summary: null },
  { id: 2, corrupt: true },
  {
    id: 3,
    summary: { time: "2026 <now>", unlocked: 3, total: 9, party: "A&B", gold: 12, essence: 4 },
    conflict: true,
    selectedSource: "local",
    localAvailable: true,
    cloudAvailable: true,
    localSummary: { time: "local" },
    cloudSummary: { time: "cloud" },
  },
];

const loading = SaveSlotsView.render({ mode: "save", slots: null, loadError: "" });
assert(loading.includes("正在读取存档位"), "save slot view should render its loading state");
const failed = SaveSlotsView.render({ mode: "load", slots: null, loadError: "失败 <重试>" });
assert(failed.includes("失败 &lt;重试&gt;") && failed.includes("data-save-retry"), "load errors should be escaped and retryable");
const saveHtml = SaveSlotsView.render({ mode: "save", slots });
const loadHtml = SaveSlotsView.render({ mode: "load", slots });
assert(saveHtml.includes("数据异常") && saveHtml.includes("<em>空</em>"), "save slot view should keep corrupt and empty states");
assert(saveHtml.includes("自动存档") && saveHtml.includes('aria-disabled="true"'), "save mode should show the automatic slot as read-only");
assert(saveHtml.includes("普通变化：本地立即保存") && saveHtml.includes("关键节点：新游戏"), "automatic slots should explain normal and immediate save conditions");
assert(loadHtml.includes("云端约1秒后同步") && loadHtml.includes("稳定操作检查点"), "automatic save conditions should remain visible in load mode");
assert(!saveHtml.includes('data-save-slot="auto"'), "save mode must not allow overwriting the automatic slot");
assert(loadHtml.includes('data-save-slot="auto"'), "load mode should allow selecting the automatic slot");
assert(!loadHtml.includes('data-delete-slot="auto"'), "the automatic slot must never offer deletion");
assert(!saveHtml.includes("data-load-slot-source"), "save mode must not offer conflict-copy loading");
assert(loadHtml.includes('data-load-slot-source="3:local"') && loadHtml.includes('data-load-slot-source="3:cloud"'), "load mode should offer both conflict copies");
assert(loadHtml.includes("2026 &lt;now&gt;") && loadHtml.includes("A&amp;B"), "slot summaries should escape user-facing values");
const unknownHtml = SaveSlotsView.render({
  mode: "load",
  slots: [{ ...slots[3], cloudUnknown: true, conflict: false, cloudAvailable: false }],
});
assert(unknownHtml.includes("云端暂不可用，当前显示本地副本"), "cloud-unknown slots should explain the local fallback");
assert(!unknownHtml.includes("data-delete-slot"), "cloud-unknown slots must not offer destructive deletion");
const overlayHtml = SaveSlotsView.render({
  mode: "load",
  slots,
  confirmText: "确认 <覆盖>",
  noticeText: "忽略",
  noticeAction: () => {},
  noticeLabel: "再次 & 重试",
});
assert(overlayHtml.includes("确认 &lt;覆盖&gt;"), "confirmation text should be escaped");
assert(overlayHtml.includes("再次 &amp; 重试"), "notice action labels should be escaped");

const copies = SaveSlotsView.savedCopies({
  slot: { local: { attempted: true, ok: true }, cloud: { attempted: true, ok: false } },
  main: { local: { attempted: false, ok: false }, cloud: { attempted: true, ok: true } },
});
assert(copies.ok.join(",") === "本地存档位,云端主档", "saved copy success labels should remain stable");
assert(copies.failed.join(",") === "云端存档位", "saved copy failure labels should remain stable");

function element(dataset = {}) {
  return {
    dataset,
    listeners: {},
    addEventListener(type, listener) { this.listeners[type] = listener; },
  };
}

const closeButton = element();
const retryButton = element();
const autoButton = element({ saveSlot: "auto" });
const slotButton = element({ saveSlot: "3" });
const deleteButton = element({ deleteSlot: "3" });
const sourceButton = element({ loadSlotSource: "3:cloud" });
const noticeButton = element();
const noticeActionButton = element();
const confirmCancelButton = element();
const confirmButton = element();
const singles = {
  "[data-save-close]": closeButton,
  "[data-save-retry]": retryButton,
  "[data-notice-ok]": noticeButton,
  "[data-notice-action]": noticeActionButton,
  "[data-confirm-cancel]": confirmCancelButton,
  "[data-confirm-ok]": confirmButton,
};
global.document = {
  querySelector: selector => singles[selector] || null,
  querySelectorAll(selector) {
    return {
      "[data-save-slot]": [autoButton, slotButton],
      "[data-delete-slot]": [deleteButton],
      "[data-load-slot-source]": [sourceButton],
    }[selector] || [];
  },
};

let mode = "load";
let currentSlots = slots;
const calls = [];
const deps = {
  mode: () => mode,
  slots: () => currentSlots,
  close: () => calls.push(["close"]),
  reload: () => calls.push(["reload"]),
  ask: (text, action) => calls.push(["ask", text, action]),
  notice: text => calls.push(["notice", text]),
  runAction: async action => { calls.push(["runAction"]); await action?.(); },
  saveTo: slotId => calls.push(["saveTo", slotId]),
  loadFrom: (slotId, ctx, source) => calls.push(["loadFrom", slotId, source]),
  deleteSlot: slotId => calls.push(["deleteSlot", slotId]),
  clearNotice: () => calls.push(["clearNotice"]),
  takeNoticeAction: () => () => calls.push(["noticeAction"]),
  clearConfirm: () => calls.push(["clearConfirm"]),
  takeConfirmAction: () => () => calls.push(["confirmAction"]),
};
const ctx = { render: () => calls.push(["render"]), getState: () => ({}) };
SaveSlotsBindings(deps)(ctx);

(async () => {
  closeButton.listeners.click();
  retryButton.listeners.click();
  slotButton.onclick();
  assert(calls.some(call => call[0] === "ask" && call[1].startsWith("读取此存档")), "occupied load slots should ask for confirmation");
  const loadAction = calls.find(call => call[0] === "ask")[2];
  await loadAction();
  assert(calls.some(call => call[0] === "loadFrom" && call[1] === 3), "confirmed load should keep its slot id");
  autoButton.onclick();
  const autoLoadAsk = calls.filter(call => call[0] === "ask").at(-1);
  await autoLoadAsk[2]();
  assert(calls.some(call => call[0] === "loadFrom" && call[1] === "auto"), "automatic save loading should preserve its string id");

  let stopped = false;
  deleteButton.onclick({ stopPropagation: () => { stopped = true; } });
  const normalDeleteAskCount = calls.filter(call => call[0] === "ask").length;
  currentSlots = [{ ...slots[3], cloudUnknown: true }];
  deleteButton.onclick({ stopPropagation: () => { stopped = true; } });
  assert(calls.filter(call => call[0] === "ask").length === normalDeleteAskCount, "cloud-unknown deletion must not open confirmation");
  assert(calls.some(call => call[0] === "notice" && call[1].includes("避免误删")), "cloud-unknown deletion should explain why it is blocked");
  currentSlots = slots;
  sourceButton.onclick({ stopPropagation: () => { stopped = true; } });
  assert(stopped, "nested slot actions should stop slot click propagation");
  const sourceAsk = calls.filter(call => call[0] === "ask").at(-1);
  await sourceAsk[2]();
  assert(calls.some(call => call[0] === "loadFrom" && call[2] === "cloud"), "conflict-copy loading should preserve its source");

  mode = "save";
  currentSlots = [{ id: 3, summary: null }];
  await slotButton.onclick();
  assert(calls.some(call => call[0] === "saveTo" && call[1] === 3), "empty save slots should save immediately");

  noticeButton.listeners.click();
  await noticeActionButton.listeners.click();
  confirmCancelButton.listeners.click();
  await confirmButton.listeners.click();
  assert(calls.some(call => call[0] === "noticeAction"), "notice actions should run after being consumed");
  assert(calls.some(call => call[0] === "confirmAction"), "confirm actions should run after being consumed");
  console.log("Save slot module tests passed");
})().catch(error => {
  console.error(error.message);
  process.exit(1);
});
