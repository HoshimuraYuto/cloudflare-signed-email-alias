import { defineConfig } from "oxlint";

export default defineConfig({
  plugins: ["typescript", "unicorn", "oxc"],
  categories: {
    correctness: "error",
    suspicious: "error",
  },
  rules: {
    complexity: ["error", 10],
    "max-depth": ["error", 3],
    "max-params": ["error", 3],
    "max-statements": ["error", 20],
    "max-nested-callbacks": ["error", 3],
    "max-lines": ["error", 500],
    "no-param-reassign": "error",
  },
  env: {
    builtin: true,
  },
});
