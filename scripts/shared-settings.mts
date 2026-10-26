import { cf } from "./cf.mts";
import { isRecord } from "./json.mts";
import type { Settings } from "./settings.mts";
import { isRecorded, SHARED_RESOURCES } from "./shared-resources.mts";
import { outputRecord, tofu, warpIncludeHosts } from "./tofu.mts";

const ENROLL_APP = SHARED_RESOURCES.MANAGE_DEVICE_ENROLLMENT[0];

/** Put back before destroy, so OpenTofu must not destroy them afterwards. */
const LET_GO = [
  ENROLL_APP,
  ...SHARED_RESOURCES.MANAGE_DEVICE_PROFILE,
  ...SHARED_RESOURCES.MANAGE_GATEWAY_PROXY,
];

/**
 * Puts the shared settings back before anything is destroyed, so a failure leaves the recorded
 * originals in the state for a second run. Destroying these resources would not restore them:
 * the provider deletes the enrollment application, resets every device setting, and leaves the
 * default profile as it is. So they are let go of from the state instead.
 */
export async function resetSharedSettings(settings: Settings, inState: string[]): Promise<void> {
  // The state, not the variables, says what earlier deployments managed.
  const originals = await outputRecord(settings, "shared_originals");
  if (isRecorded(inState, ENROLL_APP)) {
    await tofu(settings, [
      "apply",
      "-auto-approve",
      `-target=${ENROLL_APP}`,
      "-var=manage_device_enrollment=true",
      "-var=release_device_enrollment=true",
    ]);
  }
  if (isRecord(originals?.["split_tunnel"])) {
    await restoreSplitTunnel(originals["split_tunnel"], await warpIncludeHosts(settings));
  }
  if (isRecord(originals?.["gateway_proxy"])) {
    await restoreGatewayProxy(originals["gateway_proxy"]);
  }
  const letGo = LET_GO.filter((name) => isRecorded(inState, name));
  if (letGo.length > 0) {
    // Without -backup, the backup lands in infra/, inside the repository.
    await tofu(settings, ["state", "rm", `-backup=${settings.stateFile}.backup`, ...letGo]);
  }
}

// Setting one list also sets the mode, so the list that was in use goes back.
async function restoreSplitTunnel(
  original: Record<string, unknown>,
  ours: string[],
): Promise<void> {
  const include = withoutNulls(original["include"]);
  if (include.length > 0 && sameHosts(include, ours)) {
    console.warn(
      "The recorded split tunnel is this project's own; set the split tunnel back by hand.",
    );
    return;
  }
  const [mode, entries] =
    include.length > 0 ? ["--include", include] : ["--exclude", withoutNulls(original["exclude"])];
  await cf([
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
  await cf([
    "zero-trust",
    "devices",
    "settings",
    "update",
    `--gateway-proxy-enabled=${String(original["gateway_proxy_enabled"] === true)}`,
    `--gateway-udp-proxy-enabled=${String(original["gateway_udp_proxy_enabled"] === true)}`,
  ]);
}

/** The API rejects the attributes it returned as null. */
function withoutNulls(entries: unknown): Record<string, unknown>[] {
  return (Array.isArray(entries) ? entries : [])
    .filter(isRecord)
    .map((entry) =>
      Object.fromEntries(Object.entries(entry).filter(([, value]) => value !== null)),
    );
}

function sameHosts(entries: Record<string, unknown>[], ours: string[]): boolean {
  const theirs = new Set(entries.map((entry) => String(entry["host"] ?? entry["address"])));
  return theirs.size === ours.length && ours.every((host) => theirs.has(host));
}
