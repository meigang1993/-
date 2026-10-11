// 《魅魔杀》Windows 桌面版主进程（带边框窗口版）
// Electron 43.3.0
const { app, BrowserWindow, screen, session } = require('electron');
const path = require('path');

const isDev = !!process.env.SK_DEV;

// 默认窗口尺寸（含标题栏与边框）；内容区约 1440×850
const DEFAULT_WIDTH = 1440;
const DEFAULT_HEIGHT = 900;
const MIN_WIDTH = 1100;
const MIN_HEIGHT = 680;

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const workArea = primaryDisplay.workAreaSize;

  // 屏幕不够大时按可用区域收缩，并居中
  const width = Math.max(MIN_WIDTH, Math.min(DEFAULT_WIDTH, workArea.width));
  const height = Math.max(MIN_HEIGHT, Math.min(DEFAULT_HEIGHT, workArea.height));

  const win = new BrowserWindow({
    width,
    height,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    center: true,
    frame: true,                 // 标准窗口：带标题栏与最小化/最大化/关闭按钮
    resizable: true,
    maximizable: true,
    minimizable: true,
    autoHideMenuBar: true,       // 隐藏菜单栏，按 Alt 可临时唤出
    title: '魅魔杀',
    backgroundColor: '#0b0d12',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      backgroundThrottling: false,
    },
  });

  win.once('ready-to-show', () => {
    win.show();
  });

  // 阻止页面自身导航（游戏是单页静态应用）
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file:')) event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  win.loadFile(path.join(__dirname, 'index.html')).catch((err) => {
    console.error('[SuccubusKill] 加载 index.html 失败：', err);
  });

  // F11 切换全屏，Esc 退出全屏，F12 开发者工具
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    } else if (input.key === 'Escape' && win.isFullScreen()) {
      win.setFullScreen(false);
      event.preventDefault();
    } else if (input.key === 'F12') {
      win.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  return win;
}

app.whenReady().then(() => {
  // 单实例锁：避免重复启动
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return;
  }
  app.on('second-instance', () => {
    const all = BrowserWindow.getAllWindows();
    if (all.length) {
      if (all[0].isMinimized()) all[0].restore();
      all[0].focus();
    }
  });

  // 允许 file:// 下的本地资源互相引用
  session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
    cb({ responseHeaders: details.responseHeaders });
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
