const js = require("@eslint/js");
const globals = require("globals");

const highSignalRules = {
  ...js.configs.recommended.rules,
  "no-constant-condition": ["error", { checkLoops: false }],
  "no-control-regex": "off",
  "no-empty": "off",
  "no-irregular-whitespace": ["error", {
    skipComments: true,
    skipRegExps: true,
    skipStrings: true,
    skipTemplates: true,
  }],
  "no-prototype-builtins": "off",
  "no-regex-spaces": "off",
  "no-useless-escape": "off",
  "no-unused-vars": "off",
};

module.exports = [
  {
    ignores: [
      "node_modules/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  {
    files: ["src/original/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: {
        ...globals.browser,
        dzmm: "readonly",
      },
    },
    rules: {
      ...highSignalRules,
      // Runtime files intentionally share globals through ordered script tags.
      "no-undef": "off",
    },
  },
  {
    files: ["tools/**/*.js", "tests/**/*.js", "playwright*.config.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: highSignalRules,
  },
  {
    files: [
      "tools/test-*.js",
      "tools/*-fixtures.js",
      "tools/*-suites.js",
    ],
    rules: {
      // These Node tests load browser scripts into the current vm context.
      "no-undef": "off",
    },
  },
];
