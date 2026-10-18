import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const parser = require("@typescript-eslint/parser");
const sonarjs = require("eslint-plugin-sonarjs");
export default [
  {
    files: ["**/*.ts", "**/*.js", "**/*.mjs"],
    languageOptions: { parser },
    linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: "off" },
    plugins: { sonarjs },
    rules: { "sonarjs/cognitive-complexity": ["error", 0] },
  },
];
