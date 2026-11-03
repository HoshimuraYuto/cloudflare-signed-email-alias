import { defineConfig } from "vitest/config";
import { WxtVitest } from "wxt/testing/vitest-plugin";

export default defineConfig({
  // WXT resolves its root against the working directory, which is the repository root.
  plugins: [WxtVitest({ root: "extension" })],
  test: {
    include: ["**/*.test.mts"],
    environment: "happy-dom",
  },
});
