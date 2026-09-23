"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { loadDependency, root } = require("./repository-toolchain");

try {
  assert.equal(process.version, "v20.20.2", "Unexpected Node.js version");
  const npmVersion = execFileSync("npm", ["--version"], {
    encoding: "utf8",
  }).trim();
  assert.equal(npmVersion, "11.10.0", "Unexpected npm version");
  for (const lockfile of ["package-lock.json"]) {
    assert(fs.statSync(path.join(root, lockfile)).isFile(), `Missing ${lockfile}`);
  }
  loadDependency("acorn");
  loadDependency("terser");
  console.log("Host Node.js and lockfiles passed");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
