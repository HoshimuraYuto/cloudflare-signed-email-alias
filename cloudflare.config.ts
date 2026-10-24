import { bindings, defineConfig } from "cf/config";

import * as entrypoint from "./src/index.mts" with { type: "cf-worker" };

export default defineConfig({
  worker: {
    name: "cloudflare-signed-email-alias",
    compatibilityDate: "2026-10-19",
    entrypoint,
    env: {
      SIGNING_KEY: bindings.secret(),
      FORWARD_TO: bindings.secret(),
    },
  },
});
