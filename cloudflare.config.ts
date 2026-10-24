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
      ALIAS_DOMAINS: bindings.secret(),
      ACCESS_TEAM_DOMAIN: bindings.secret(),
      ACCESS_AUD: bindings.secret(),
      ACCESS_CLIENT_ID: bindings.secret(),
    },
  },
});
