import { readSettings } from "./settings.mts";
import { initTofu, tofuOutput } from "./tofu.mts";

// Printed in the shape the addy.io forwarder's API key field expects, so it can be piped
// straight to the clipboard.
const settings = readSettings(process.env, "output");
await initTofu(settings);
const token = await tofuOutput(settings, "service_token");
if (token === undefined) {
  throw new Error("No service token yet; run pnpm run deploy first.");
}
console.log(
  JSON.stringify({
    "cf-access-client-id": token["client_id"],
    "cf-access-client-secret": token["client_secret"],
  }),
);
