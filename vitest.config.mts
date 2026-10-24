import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// tsconfig has no Node types; declare only what this file uses.
declare const process: { env: Record<string, string | undefined> };

const signingKey = crypto.getRandomValues(new Uint8Array(32));

// The plugin checks bindings.secret() against process.env, not miniflare.bindings.
process.env["SIGNING_KEY"] = btoa(String.fromCharCode(...signingKey));
process.env["FORWARD_TO"] = "inbox@example.net";
process.env["ALIAS_DOMAINS"] = "example.com,example.org";
process.env["ACCESS_TEAM_DOMAIN"] = "team.example.com";
process.env["ACCESS_AUD"] = crypto.randomUUID();
process.env["ACCESS_CLIENT_ID"] = `${crypto.randomUUID()}.access`;

export default defineConfig({
  plugins: [cloudflareTest({ experimental: { newConfig: true } })],
});
