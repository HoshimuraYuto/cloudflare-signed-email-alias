import { createInterface } from "node:readline/promises";

import { run } from "./run.mts";
import {
  isRecorded,
  readSettings,
  SHARED_RESOURCES,
  splitList,
  WORKER_NAME,
  type Settings,
} from "./settings.mts";
import { initTofu, stateResources, tofu, tofuOutput } from "./tofu.mts";

const ENROLL_APP = SHARED_RESOURCES.MANAGE_DEVICE_ENROLLMENT[0];

/** Put back or released before destroy, so OpenTofu must not destroy them afterwards. */
const LET_GO = [
  ENROLL_APP,
  ...SHARED_RESOURCES.MANAGE_DEVICE_PROFILE,
  ...SHARED_RESOURCES.MANAGE_GATEWAY_PROXY,
];

const LEFT_FOR_YOU = `Remove these by hand; they were created outside this project:
  - the forwarder set up in your password manager, and the service token stored there
  - the Cloudflare One client on your devices, if you enrolled them only for this
  - the API token this run used
Keep SIGNING_KEY if you may deploy again: the same key makes old aliases valid again.`;

const settings = readSettings(process.env);
await confirm(settings);
await initTofu(settings);
const recorded = await stateResources(settings);
if (settings.resetSharedSettings) {
  await resetSharedSettings(settings, recorded);
}
await tofu(settings, [
  "destroy",
  ...(settings.resetSharedSettings
    ? []
    : Object.values(SHARED_RESOURCES)
        .flat()
        .map((name) => `-exclude=${name}`)),
]);
for (const domain of settings.forwarding.keys()) {
  await disableCatchAll(domain);
}
await run("pnpm", ["exec", "cf", "workers", "delete", WORKER_NAME, "--force"]);
console.log(LEFT_FOR_YOU);

/**
 * Puts the account-wide settings back before anything is destroyed, so a failure leaves the
 * recorded originals in the state for a second run. Destroying these resources would not
 * restore them: the provider deletes the enrollment application, resets every device setting,
 * and leaves the default profile as it is. So they are let go of from the state instead.
 */
async function resetSharedSettings(current: Settings, inState: string[]): Promise<void> {
  // Only the state says what earlier deployments managed; the flags may be off by now.
  const originals = await tofuOutput(current, "shared_originals");
  if (isRecorded(inState, ENROLL_APP)) {
    await tofu(current, [
      "apply",
      "-auto-approve",
      `-target=${ENROLL_APP}`,
      "-var=manage_device_enrollment=true",
      "-var=release_device_enrollment=true",
    ]);
  }
  if (isRecord(originals?.["split_tunnel"])) {
    const warpInclude = await tofuOutput(current, "warp_include", true);
    await restoreSplitTunnel(originals["split_tunnel"], warpInclude);
  }
  if (isRecord(originals?.["gateway_proxy"])) {
    await restoreGatewayProxy(originals["gateway_proxy"]);
  }
  const letGo = LET_GO.filter((name) => isRecorded(inState, name));
  if (letGo.length > 0) {
    // Without -backup, the backup lands in infra/, inside the repository.
    await tofu(current, ["state", "rm", `-backup=${current.stateFile}.backup`, ...letGo]);
  }
}

/** Mail to every alias stops for good, so every alias domain must be typed back. */
async function confirm(current: Settings): Promise<void> {
  const domains = [...current.forwarding.keys()];
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await prompt.question(
    `Every alias at ${domains.join(", ")} stops receiving mail. Type these domains, separated by commas, to continue: `,
  );
  prompt.close();
  const typed = new Set(splitList(answer.toLowerCase()));
  if (typed.size !== domains.length || domains.some((domain) => !typed.has(domain))) {
    throw new Error("The domains did not match; nothing was removed.");
  }
}

// The provider leaves the catch-all in place on destroy.
async function disableCatchAll(domain: string): Promise<void> {
  await run("pnpm", [
    "exec",
    "cf",
    "email-routing",
    "rules",
    "catch-all",
    "update",
    "--zone",
    domain,
    "--enabled=false",
    "--matchers",
    JSON.stringify([{ type: "all" }]),
    "--actions",
    JSON.stringify([{ type: "drop" }]),
  ]);
}

// Setting one list also sets the mode, so the list that was in use goes back.
async function restoreSplitTunnel(
  original: Record<string, unknown>,
  warpInclude: unknown,
): Promise<void> {
  const include = withoutNulls(original["include"]);
  if (include.length > 0 && sameHosts(include, warpInclude)) {
    console.warn(
      "The recorded split tunnel is this project's own; set the split tunnel back by hand.",
    );
    return;
  }
  const [mode, entries] =
    include.length > 0 ? ["--include", include] : ["--exclude", withoutNulls(original["exclude"])];
  await run("pnpm", [
    "exec",
    "cf",
    "zero-trust",
    "devices",
    "profiles",
    "default",
    "update",
    mode,
    JSON.stringify(entries),
  ]);
}

async function restoreGatewayProxy(original: Record<string, unknown>): Promise<void> {
  await run("pnpm", [
    "exec",
    "cf",
    "zero-trust",
    "devices",
    "settings",
    "update",
    `--gateway-proxy-enabled=${String(original["gateway_proxy_enabled"] === true)}`,
    `--gateway-udp-proxy-enabled=${String(original["gateway_udp_proxy_enabled"] === true)}`,
  ]);
}

/** Split tunnel entries with the attributes the API left unset dropped. */
function withoutNulls(entries: unknown): Record<string, unknown>[] {
  return (Array.isArray(entries) ? entries : [])
    .filter(isRecord)
    .map((entry) =>
      Object.fromEntries(Object.entries(entry).filter(([, value]) => value !== null)),
    );
}

function sameHosts(entries: Record<string, unknown>[], warpInclude: unknown): boolean {
  const ours = hostsOf(Array.isArray(warpInclude) ? warpInclude : []);
  const theirs = hostsOf(entries);
  return theirs.size === ours.size && [...theirs].every((host) => ours.has(host));
}

function hostsOf(list: unknown[]): Set<string> {
  return new Set(list.filter(isRecord).map((entry) => String(entry["host"] ?? entry["address"])));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
