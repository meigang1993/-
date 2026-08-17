const { spawnSync } = require("child_process");
const path = require("path");
require("./repository-toolchain");
const { chromium } = require("@playwright/test");

async function chromiumReady() {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    return true;
  } catch (error) {
    console.warn(`Existing Chromium is not usable: ${error.message}`);
    return false;
  } finally {
    await browser?.close();
  }
}

(async () => {
  if (await chromiumReady()) {
    console.log("Playwright Chromium is already installed and ready.");
    return;
  }
  const checker = path.resolve(__dirname, "check-original-toolchain.js");
  const result = spawnSync(process.execPath, [checker], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
})();
