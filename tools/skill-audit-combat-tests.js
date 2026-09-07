module.exports = context => {
  require("./skill-audit-minotaur-tests")(context);
  require("./skill-audit-enemy-response-tests")(context);
  require("./skill-audit-character-combat-tests")(context);
  require("./skill-audit-character-final-tests")(context);
};
