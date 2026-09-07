const assert = require("assert");
const fs = require("fs");
const fixtures = require("./pursue-kill-fixtures");
require("../src/original/battle-damage-attributes.js");

const context = { assert, fs, ...fixtures };
require("./card-consistency-contract-tests")(context);
require("./card-consistency-soul-borrow-tests")(context);
require("./card-consistency-picker-tests")(context);
require("./card-consistency-combat-rules-tests")(context);

console.log("Card description/runtime consistency tests passed");
