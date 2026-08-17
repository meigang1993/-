const { contextBridge, ipcRenderer } = require('electron');

let lifecycleHandler = null;
let loadingState = { ready: false, error: null, message: '正在启动游戏...' };

function whenBodyReady(callback) {
  if (document.body) callback();
  else window.addEventListener('DOMContentLoaded', callback, { once: true });
}

function ensureStyle() {
  if (document.getElementById('desktop-bridge-style')) return;
  const style = document.createElement('style');
  style.id = 'desktop-bridge-style';
  style.textContent = `
    #desktop-loading{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;
      background:#09080d;color:#f7edf4;font:600 15px/1.5 system-ui,sans-serif}
    #desktop-loading>div{max-width:520px;padding:22px 28px;border:1px solid #684256;
      background:#171119;box-shadow:0 18px 50px #0008;text-align:center}
    #desktop-toasts{position:fixed;right:18px;top:18px;z-index:2147483646;display:grid;gap:8px;
      width:min(360px,calc(100vw - 36px));pointer-events:none}
    .desktop-toast{padding:11px 14px;border:1px solid #6d4a5d;background:#181117ee;color:#fff;
      box-shadow:0 8px 24px #0008;font:500 14px/1.45 system-ui,sans-serif}
    .desktop-toast.success{border-color:#4c8a69}.desktop-toast.warning{border-color:#b18442}
    .desktop-toast.error{border-color:#b54d5f}
  `;
  document.head.append(style);
}

function renderLoading() {
  whenBodyReady(() => {
    ensureStyle();
    let overlay = document.getElementById('desktop-loading');
    if (loadingState.ready) {
      overlay?.remove();
      return;
    }
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'desktop-loading';
      overlay.innerHTML = '<div role="status"></div>';
      document.body.append(overlay);
    }
    const panel = overlay.firstElementChild;
    panel.textContent = loadingState.error
      ? `启动失败：${loadingState.error}`
      : loadingState.message;
    panel.setAttribute('role', loadingState.error ? 'alert' : 'status');
  });
}

function showToast(level, message) {
  const text = String(message || '').trim().slice(0, 500);
  if (!text) return Promise.resolve();
  whenBodyReady(() => {
    ensureStyle();
    let root = document.getElementById('desktop-toasts');
    if (!root) {
      root = document.createElement('div');
      root.id = 'desktop-toasts';
      root.setAttribute('aria-live', 'polite');
      document.body.append(root);
    }
    const item = document.createElement('div');
    item.className = `desktop-toast ${level}`;
    item.textContent = text;
    root.append(item);
    window.setTimeout(() => item.remove(), 3600);
  });
  return Promise.resolve();
}

const dzmm = {
  kv: {
    get: key => ipcRenderer.invoke('desktop-kv:get', key),
    put: (key, value) => ipcRenderer.invoke('desktop-kv:put', key, value),
    delete: key => ipcRenderer.invoke('desktop-kv:delete', key),
  },
  toast: {
    success: message => showToast('success', message),
    error: message => showToast('error', message),
    warning: message => showToast('warning', message),
    info: message => showToast('info', message),
  },
  loading: {
    progress(payload = {}) {
      loadingState.message = String(payload.message || loadingState.message).slice(0, 240);
      renderLoading();
    },
    ready() {
      loadingState = { ...loadingState, ready: true };
      renderLoading();
    },
    error(code, message) {
      loadingState = {
        ...loadingState,
        error: String(message || code || '未知错误').slice(0, 300),
      };
      renderLoading();
    },
  },
  save: {
    onAction(handler) {
      if (typeof handler === 'function') lifecycleHandler = handler;
    },
  },
  capabilities: {
    get: async () => ({
      environment: 'desktop',
      kv: true,
      kvBatch: false,
      kvList: false,
      loading: true,
      toast: true,
      workshop: false,
      chatStableIds: false,
    }),
  },
};

ipcRenderer.on('desktop-save-action', async (_event, request) => {
  if (!lifecycleHandler) {
    ipcRenderer.send('desktop-save-action-result', request.requestId, {
      ok: false,
      code: 'unsupported',
    });
    return;
  }
  try {
    const result = await lifecycleHandler(request);
    ipcRenderer.send('desktop-save-action-result', request.requestId, result);
  } catch (error) {
    ipcRenderer.send('desktop-save-action-result', request.requestId, {
      ok: false,
      code: error.code || 'SAVE_ACTION_FAILED',
      message: error.message,
    });
  }
});

contextBridge.exposeInMainWorld('dzmm', dzmm);
renderLoading();
