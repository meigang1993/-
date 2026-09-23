#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

node tools/test-local-core.js
node tools/test-store.js
node tools/test-dungeon-matrix.js

node tools/run-browser-tests.js focus smoke unlocks -- \
  -g "static game shell|offline defeat event"
node tools/run-browser-tests.js focus battle-ui battle-effect-lifecycle -- \
  -g "battle play trail|player card use freezes redraw|consumed cards keep"
node tools/run-browser-tests.js focus smoke storage-core storage-runtime storage-slots -- \
  -g "loading a save|settings opens|only milestone changes|offline manual save|offline deferred dungeon|visual baselines"
node tools/run-browser-tests.js focus hall-ui battle-rewards -- \
  -g "relic codex tooltip|victory settlement"
node tools/run-browser-tests.js focus dungeon-flow
