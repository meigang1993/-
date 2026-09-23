#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

node tools/run-qa.js prebrowser
node tools/check-playwright.js
node tools/check-startup-performance.js
node tools/run-browser-tests.js all
