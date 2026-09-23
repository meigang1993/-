"use strict";

const path = require("path");
const { spawnSync } = require("child_process");
const { browsersPath, root } = require("./repository-toolchain");

const executable = path.join(
  root, "node_modules", ".bin",
  process.platform === "win32" ? "playwright.cmd" : "playwright",
);
const result = spawnSync(executable, ["install", "chromium"], {
  cwd: root,
  env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browsersPath },
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
