import { createInterface } from "node:readline/promises";

import { run } from "./run.mts";
import { readSettings, WORKER_NAME, type Settings } from "./settings.mts";
import { initTofu, tofu } from "./tofu.mts";

/**
 * Split tunnel entries Cloudflare recommends for a new organization, from
 * developers.cloudflare.com/cloudflare-one/.../split-tunnels/ (Add a route).
 */
export const DEFAULT_SPLIT_TUNNEL_EXCLUDE = [
  { address: "ff05::/16" },
  { address: "ff04::/16" },
  { address: "ff03::/16" },
  { address: "ff02::/16" },
  { address: "ff01::/16" },
  { address: "fe80::/10", description: "IPv6 Link Local" },
  { address: "fd00::/8" },
  { address: "255.255.255.255/32", description: "DHCP Broadcast" },
  { address: "240.0.0.0/4" },
  { address: "224.0.0.0/24" },
  { address: "192.168.0.0/16" },
  { address: "192.0.0.0/24" },
  { address: "172.16.0.0/12" },
  { address: "169.254.0.0/16", description: "DHCP Unspecified" },
  { address: "100.64.0.0/10" },
  { address: "10.0.0.0/8" },
];

/**
 * Account-wide settings that other projects may rely on. Deploy manages them only when asked
 * (MANAGE_DEVICE_PROFILE, MANAGE_DEVICE_ENROLLMENT); destroy removes them only with
 * RESET_SHARED_SETTINGS.
 */
const SHARED_RESOURCES = [
  "cloudflare_zero_trust_device_default_profile.split_tunnel",
  "cloudflare_zero_trust_access_application.enroll",
  "cloudflare_zero_trust_access_policy.enroll",
];

const LEFT_FOR_YOU = `Remove these by hand; they were created outside this project:
  - the forwarder set up in your password manager, and the service token stored there
  - the Cloudflare One client on your devices, if you enrolled them only for this
  - the API token this run used
Keep SIGNING_KEY if you may deploy again: the same key makes old aliases valid again.`;

const settings = readSettings(process.env);
await confirm(settings);
await initTofu(settings);
await tofu(settings, [
  "destroy",
  ...(settings.resetSharedSettings ? [] : SHARED_RESOURCES.map((name) => `-exclude=${name}`)),
]);
await disableCatchAll(settings);
if (settings.resetSharedSettings && settings.manageDeviceProfile) {
  await restoreSplitTunnel();
}
await run("pnpm", ["exec", "cf", "workers", "delete", WORKER_NAME, "--force"]);
console.log(LEFT_FOR_YOU);

/** Mail to every alias stops for good, so the alias domain must be typed back. */
async function confirm(current: Settings): Promise<void> {
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await prompt.question(
    `Every alias at ${current.get("ALIAS_DOMAIN")} stops receiving mail. Type the domain to continue: `,
  );
  prompt.close();
  if (answer.trim() !== current.get("ALIAS_DOMAIN")) {
    throw new Error("The domain did not match; nothing was removed.");
  }
}

// The provider leaves the catch-all in place on destroy.
async function disableCatchAll(current: Settings): Promise<void> {
  await run("pnpm", [
    "exec",
    "cf",
    "email-routing",
    "rules",
    "catch-all",
    "update",
    "--zone",
    current.get("ALIAS_DOMAIN"),
    "--enabled=false",
    "--matchers",
    JSON.stringify([{ type: "all" }]),
    "--actions",
    JSON.stringify([{ type: "drop" }]),
  ]);
}

// The provider leaves the default profile as it is on destroy.
async function restoreSplitTunnel(): Promise<void> {
  await run("pnpm", [
    "exec",
    "cf",
    "zero-trust",
    "devices",
    "profiles",
    "default",
    "update",
    "--exclude",
    JSON.stringify(DEFAULT_SPLIT_TUNNEL_EXCLUDE),
  ]);
}
