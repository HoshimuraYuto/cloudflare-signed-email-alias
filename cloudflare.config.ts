import { bindings, defineConfig } from "cf/config";

import * as entrypoint from "./src/index.mts" with { type: "cf-worker" };

export default defineConfig({
  worker: {
    name: "app",
    compatibilityDate: "2026-10-19",
    entrypoint,
    env: {
      WORLD: bindings.text("World"),
    },
  },
});
