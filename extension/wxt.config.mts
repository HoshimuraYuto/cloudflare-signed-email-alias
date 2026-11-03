import { defineConfig } from "wxt";

export const E2E_API_ORIGIN = "https://email-alias-api.example.com";
export const E2E_SECOND_API_ORIGIN = "https://email-alias-api.example.org";

export default defineConfig({
  imports: false,
  manifest: ({ mode }) => ({
    name: "Cloudflare Signed Email Alias",
    description: "Creates a signed alias address from an email field.",
    // Chrome requires a version; releases are tagged in git instead.
    version: "0.0.0",
    // URL.parse arrived in Chrome 126.
    minimum_chrome_version: "126",
    permissions: ["storage"],
    // The API host is known only once the user enters it, so it is requested at runtime.
    optional_host_permissions: ["https://*/*"],
    // Headless Chromium cannot answer the permission prompt, so the test build is granted upfront.
    ...(mode === "e2e" && {
      host_permissions: [`${E2E_API_ORIGIN}/*`, `${E2E_SECOND_API_ORIGIN}/*`],
    }),
  }),
});
