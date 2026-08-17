"use strict";

const path = require("path");

const root = path.resolve(__dirname, "..");

function loadDependency(name) {
  try {
    return require(name);
  } catch (error) {
    if (error.code !== "MODULE_NOT_FOUND") {
      throw error;
    }
    throw new Error(`Missing QA dependency ${name}; install locked dependencies`);
  }
}

module.exports = { loadDependency, root };
