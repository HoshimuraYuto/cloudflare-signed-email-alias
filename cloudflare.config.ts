import { bindings, defineConfig } from "cf/config";

import * as entrypoint from "./src/index.mts" with { type: "cf-worker" };

export default defineConfig({
  worker: {
    name: "cloudflare-signed-email-alias",
    compatibilityDate: "2026-10-19",
    entrypoint,
    // Written out even where it matches the default: only the custom domain is behind Access.
    workersDev: false,
    previewUrls: false,
    // cf sends observability as off when unset, unlike the dashboard's default for new Workers.
    observability: { enabled: true },
    env: {
      SIGNING_KEY: bindings.secret(),
      FORWARD_TO: bindings.secret(),
      REVOKED_ALIASES: bindings.secret(),
      ACCESS_TEAM_DOMAIN: bindings.secret(),
      ACCESS_AUD: bindings.secret(),
      ACCESS_CLIENT_ID: bindings.secret(),
    },
  },
});
