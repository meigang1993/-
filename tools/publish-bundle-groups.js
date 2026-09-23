"use strict";

const manifest = require("./publish-bundles.json");

const bundleNames = Object.freeze(Object.keys(manifest));
const isStartupBundle = name => name === "startup" || name.startsWith("startup-");
const startupBundleNames = Object.freeze(bundleNames.filter(isStartupBundle));
const startupBundlePaths = Object.freeze(
  startupBundleNames.map(name => `bundles/${name}.min.js`)
);
const publishedBundlePaths = Object.freeze(
  bundleNames.map(name => `bundles/${name}.min.js`)
);

module.exports = {
  bundleNames,
  isStartupBundle,
  manifest,
  publishedBundlePaths,
  startupBundleNames,
  startupBundlePaths,
};
