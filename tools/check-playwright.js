require("./repository-toolchain");
const { chromium } = require("@playwright/test");

(async () => {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    console.log(`Playwright Chromium is ready: ${browser.version()}`);
  } catch (err) {
    console.error("Repository Playwright Chromium cannot start.");
    console.error("Run: npm run check:toolchain");
    console.error(err.message);
    process.exitCode = 1;
  } finally {
    await browser?.close();
  }
})();
