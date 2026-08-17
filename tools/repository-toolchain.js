"use strict";

const path = require("path");

const root = path.resolve(__dirname, "..");
const browsersPath = path.join(root, ".playwright-browsers");

if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath;
}

function loadDependency(name) {
  try {
    return require(name);
  } catch (error) {
    if (error.code !== "MODULE_NOT_FOUND") {
      throw error;
    }
    throw new Error(
      `Missing QA dependency ${name}; install locked dependencies`,
      { cause: error },
    );
  }
}

module.exports = { browsersPath, loadDependency, root };
