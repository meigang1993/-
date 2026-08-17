const { app, BrowserWindow, Menu, shell } = require("electron");
const path = require("node:path");
const { fileURLToPath } = require("node:url");

const GAME_ENTRY = path.join(__dirname, "game", "index.html");
const GAME_ROOT = path.dirname(GAME_ENTRY);
let mainWindow = null;

function isGameFile(url) {
  try {
    const target = fileURLToPath(url);
    const relative = path.relative(GAME_ROOT, target);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  } catch (_) {
    return false;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 960,
    minHeight: 540,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#08070a",
    title: "魅魔杀",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  mainWindow.setAspectRatio(16 / 9);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", event => {
    if (isGameFile(event.url)) return;
    event.preventDefault();
    if (/^https?:/i.test(event.url)) shell.openExternal(event.url);
  });
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown" || input.key !== "F11") return;
    event.preventDefault();
    mainWindow.setFullScreen(!mainWindow.isFullScreen());
  });
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.loadFile(GAME_ENTRY);
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();
});

app.on("window-all-closed", () => app.quit());
