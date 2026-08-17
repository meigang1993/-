const base = require("./playwright.config");

module.exports = {
  ...base,
  testMatch: ["**/*.spec.js", "**/*.scenario.js"],
};
