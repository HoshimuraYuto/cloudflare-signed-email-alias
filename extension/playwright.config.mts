import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  testMatch: "*.spec.mts",
  forbidOnly: true,
  reporter: "line",
  outputDir: ".output/e2e-results",
});
