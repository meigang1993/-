module.exports = context => {
  const boundary = require("./skill-audit-active-boundary-catalog-tests")(context);
  require("./skill-audit-active-boundary-guard-tests")({ ...context, ...boundary });
};
