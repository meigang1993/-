require("./repository-toolchain");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const { chromium } = require("@playwright/test");
const manifest = require("./chromium-system-dependencies.json");

function checkSystemDependencies() {
  for (const [packageName, expectedVersion] of Object.entries(manifest.packages)) {
    const actualVersion = execFileSync("dpkg-query", [
      "-W", "-f=${Version}", packageName,
    ], { encoding: "utf8" }).trim();
    assert.equal(actualVersion, expectedVersion, `Unexpected ${packageName} version`);
  }
  for (const [library, expectedTarget] of Object.entries(manifest.criticalLibraries)) {
    assert(fs.existsSync(library), `Missing Chromium library: ${library}`);
    assert.equal(fs.realpathSync(library), expectedTarget, `Unexpected library target: ${library}`);
  }
}

(async () => {
  let browser;
  try {
    checkSystemDependencies();
    browser = await chromium.launch({ headless: true });
    assert.equal(browser.version(), manifest.playwrightChromium, "Unexpected Chromium version");
    console.log(`Playwright Chromium is ready: ${browser.version()}`);
  } catch (err) {
    console.error("Repository Playwright Chromium cannot start.");
    console.error("Run: npm run playwright:install");
    console.error("If a shared library is missing, run: npm run playwright:install:deps");
    console.error(err.message);
    process.exitCode = 1;
  } finally {
    await browser?.close();
  }
})();
