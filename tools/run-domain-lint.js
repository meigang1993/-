"use strict";

const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { root } = require("./repository-toolchain");
const { filesFor } = require("./lint-domain-catalog");

const domain = process.argv[2];
if (domain !== "original") throw new Error(`Unknown lint domain: ${domain}`);
const extras = ["src/original", "tests", "playwright.config.js"];
const files = [...extras, ...filesFor(root, domain)];
const eslint = path.join(root, "node_modules", ".bin", "eslint");
const result = spawnSync(eslint, [
  "--cache",
  "--cache-location",
  `.qa-cache/eslint-${domain}`,
  ...files,
], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error.message);
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 1;
}
