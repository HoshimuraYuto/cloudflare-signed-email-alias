import type { Settings } from "./settings.mts";

/**
 * Settings that exist once per account or domain and other projects may rely on, by the
 * variable that manages them. Destroy keeps them unless RESET_SHARED_SETTINGS is true.
 */
export const SHARED_RESOURCES = {
  MANAGE_DEVICE_PROFILE: [
    "cloudflare_zero_trust_device_default_profile.split_tunnel",
    "terraform_data.split_tunnel_original",
  ],
  MANAGE_GATEWAY_PROXY: [
    "cloudflare_zero_trust_device_settings.gateway_proxy",
    "terraform_data.gateway_proxy_original",
  ],
  MANAGE_DEVICE_ENROLLMENT: [
    "cloudflare_zero_trust_access_application.enroll",
    "cloudflare_zero_trust_access_policy.enroll",
    "terraform_data.enrollment_original",
  ],
  DMARC_POLICY: ["cloudflare_dns_record.dmarc"],
} as const;

/**
 * Variables that are off now although the state holds what they manage: applying would
 * delete those shared settings.
 */
export function flagsThatWouldDelete(settings: Settings, recorded: readonly string[]): string[] {
  const managed = [
    ["MANAGE_DEVICE_PROFILE", settings.manageDeviceProfile],
    ["MANAGE_GATEWAY_PROXY", settings.manageGatewayProxy],
    ["MANAGE_DEVICE_ENROLLMENT", settings.manageDeviceEnrollment],
    ["DMARC_POLICY", settings.dmarcPolicy !== undefined],
  ] as const;
  return managed
    .filter(
      ([flag, on]) => !on && SHARED_RESOURCES[flag].some((name) => isRecorded(recorded, name)),
    )
    .map(([flag]) => flag);
}

/** Matches every instance, since these resources are addressed as `[0]` or by domain. */
export function isRecorded(recorded: readonly string[], name: string): boolean {
  return recorded.some((entry) => entry === name || entry.startsWith(`${name}[`));
}
