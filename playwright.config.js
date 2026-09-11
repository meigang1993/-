require("./tools/repository-toolchain");
const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests",
  timeout: 60000,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  // 容器冷启动下战斗加载常需 5s 以上，默认 5000ms 的断言超时会产生假失败。
  expect: { timeout: 15000 },
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
