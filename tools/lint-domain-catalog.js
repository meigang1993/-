"use strict";

const fs = require("node:fs");
const path = require("node:path");

function toolFiles(root) {
  return fs.readdirSync(path.join(root, "tools"))
    .filter(file => file.endsWith(".js"))
    .sort();
}

function validate(root) {
  if (!fs.existsSync(path.join(root, "tools", "qa-test-catalog.js"))) {
    throw new Error("Missing original QA catalog");
  }
}

function filesFor(root, domain) {
  if (domain !== "original") throw new Error(`Unknown lint domain: ${domain}`);
  validate(root);
  return toolFiles(root).map(file => `tools/${file}`);
}

module.exports = { filesFor, validate };
