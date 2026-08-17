const path = require('node:path');
const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  net,
  protocol,
} = require('electron');
const { pathToFileURL } = require('node:url');
const { DurableKvStore } = require('./kv-store');
const { gameRoot, resolveGameAsset } = require('./runtime-paths');

const GAME_URL = 'game://app/index.html';
let mainWindow = null;
let store = null;

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'game',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

function validSender(event) {
  try {
    const url = new URL(event.senderFrame.url);
    return url.protocol === 'game:' && url.hostname === 'app';
  } catch (_) {
    return false;
  }
}

function registerStorageHandlers() {
  const invoke = handler => async (event, ...args) => {
    if (!validSender(event)) {
      const error = new Error('Blocked IPC sender');
      error.code = 'FORBIDDEN';
      throw error;
    }
    return handler(...args);
  };
  ipcMain.handle('desktop-kv:get', invoke(key => store.get(key)));
  ipcMain.handle('desktop-kv:put', invoke((key, value) => store.put(key, value)));
  ipcMain.handle('desktop-kv:delete', invoke(key => store.delete(key)));
}

async function registerAssetProtocol() {
  const root = gameRoot({
    isPackaged: app.isPackaged,
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath,
  });
  await protocol.handle('game', request => {
    const filename = resolveGameAsset(root, request.url);
    if (!filename) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(filename).toString());
  });
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 844,
    minHeight: 520,
    backgroundColor: '#09080d',
    autoHideMenuBar: true,
    show: false,
    title: '魅魔杀',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => {
    if (event.url !== GAME_URL) event.preventDefault();
  });
  window.once('ready-to-show', () => {
    if (process.env.DESKTOP_SMOKE !== '1') window.show();
  });
  window.loadURL(GAME_URL).catch(error => {
    console.error('desktop load failed:', error.message, error.stack);
  });
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null;
  });
  return window;
}

async function runSmoke(window) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const result = await window.webContents.executeJavaScript(`({
      title: document.title,
      hasDzmm: Boolean(window.dzmm?.kv?.put),
      ready: Boolean(document.querySelector('[data-start-game], [data-start-retry-load]')),
      bodyText: document.body?.innerText?.slice(0, 300) || ''
    })`);
    if (result.ready) {
      console.log(JSON.stringify({ ok: true, ...result }));
      app.exit(0);
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  console.error(JSON.stringify({ ok: false, error: 'desktop smoke timed out' }));
  app.exit(1);
}

const lock = app.requestSingleInstanceLock();
if (!lock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  app.whenReady().then(async () => {
    app.setName('魅魔杀');
    store = new DurableKvStore({
      directory: path.join(app.getPath('userData'), 'save'),
    });
    await store.initialize();
    await registerAssetProtocol();
    registerStorageHandlers();
    mainWindow = createWindow();
    if (process.env.DESKTOP_SMOKE === '1') {
      mainWindow.webContents.once('did-finish-load', () => runSmoke(mainWindow));
    }
  }).catch(error => {
    console.error('desktop startup failed:', error.code, error.message, error.stack);
    dialog.showErrorBox(
      '魅魔杀启动失败',
      error.code === 'KV_STORE_CORRUPT'
        ? '本地存档及备份均已损坏。请保留存档目录并联系开发者处理。'
        : `桌面版启动失败：${error.message}`,
    );
    app.exit(1);
  });
}

app.on('window-all-closed', () => app.quit());
