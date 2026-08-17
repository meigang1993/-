const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const desktopRoot = __dirname;
const root = path.resolve(desktopRoot, "..");
const stage = path.join(desktopRoot, ".stage");
const output = path.join(desktopRoot, "out");

fs.rmSync(stage, { recursive: true, force: true });
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(path.join(stage, "game"), { recursive: true });
fs.copyFileSync(path.join(desktopRoot, "main.cjs"), path.join(stage, "main.cjs"));
fs.cpSync(path.join(root, "publish"), path.join(stage, "game"), { recursive: true });
fs.writeFileSync(path.join(stage, "package.json"), `${JSON.stringify({
  name: "succubus-kill",
  version: "1.0.0",
  main: "main.cjs",
}, null, 2)}\n`);

const packager = path.join(desktopRoot, "node_modules", ".bin", "electron-packager");
const result = spawnSync(packager, [
  stage,
  "SuccubusKill",
  "--platform=win32",
  "--arch=x64",
  `--out=${output}`,
  "--overwrite",
  "--asar",
  "--prune=true",
], { cwd: desktopRoot, stdio: "inherit" });

fs.rmSync(stage, { recursive: true, force: true });
if (result.status !== 0) process.exit(result.status || 1);
console.log(`Portable build created at ${path.join(output, "SuccubusKill-win32-x64")}`);
