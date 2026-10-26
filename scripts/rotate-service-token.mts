import { deploy } from "./deployment.mts";
import { readSettings } from "./settings.mts";

await deploy(readSettings(process.env, "deploy"), [
  "-replace=cloudflare_zero_trust_access_service_token.client",
]);
console.log("The old service token no longer works. Put the new one in your password manager:");
console.log("  pnpm run service-token");
