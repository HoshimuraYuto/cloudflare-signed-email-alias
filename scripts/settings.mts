import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { parseForwarding } from "../src/forwarding.mts";

// Must match worker.name in cloudflare.config.ts and local.worker_name in infra/main.tf.
export const WORKER_NAME = "cloudflare-signed-email-alias";

const ALWAYS_REQUIRED = [
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_ACCOUNT_ID",
  "STATE_PASSPHRASE",
  "FORWARD_TO",
] as const;

type RequiredName = (typeof ALWAYS_REQUIRED)[number] | "SIGNING_KEY";

/** ENROLL_EMAILS counts as required only while MANAGE_DEVICE_ENROLLMENT is true. */
type AlsoRequired = RequiredName | "ENROLL_EMAILS";

export interface Settings {
  get: (name: RequiredName) => string;
  /** Alias domain => inbox, from FORWARD_TO. */
  forwarding: Map<string, string>;
  /** Unset leaves the default to infra/variables.tf. */
  apiSubdomain: string | undefined;
  /** Unset leaves DMARC alone. */
  dmarcPolicy: string | undefined;
  stateFile: string;
  manageDeviceProfile: boolean;
  manageGatewayProxy: boolean;
  manageDeviceEnrollment: boolean;
  enrollEmails: string[];
  /** Whether destroy also undoes the account-wide settings and the DMARC record. */
  resetSharedSettings: boolean;
}

/** Throws listing every missing variable, so one run reports them all. */
export function readSettings(
  env: NodeJS.ProcessEnv,
  alsoRequired: readonly AlsoRequired[] = [],
): Settings {
  const manageDeviceEnrollment = env["MANAGE_DEVICE_ENROLLMENT"] === "true";
  const enrollEmails = splitList(env["ENROLL_EMAILS"]);
  const missing: string[] = [...ALWAYS_REQUIRED, ...alsoRequired].filter((name) =>
    name === "ENROLL_EMAILS"
      ? manageDeviceEnrollment && enrollEmails.length === 0
      : (env[name] ?? "") === "",
  );
  if (missing.length > 0) {
    throw new Error(`Set these environment variables: ${missing.join(", ")}`);
  }
  const apiSubdomain = env["API_SUBDOMAIN"] ?? "";
  const dmarcPolicy = env["DMARC_POLICY"] ?? "";
  return {
    get: (name: RequiredName) => env[name] ?? "",
    forwarding: parseForwarding(env["FORWARD_TO"] ?? ""),
    apiSubdomain: apiSubdomain === "" ? undefined : apiSubdomain,
    dmarcPolicy: dmarcPolicy === "" ? undefined : dmarcPolicy,
    stateFile: resolve(
      env["STATE_FILE"] ?? join(homedir(), ".local", "state", WORKER_NAME, "terraform.tfstate"),
    ),
    manageDeviceProfile: env["MANAGE_DEVICE_PROFILE"] === "true",
    manageGatewayProxy: env["MANAGE_GATEWAY_PROXY"] === "true",
    manageDeviceEnrollment,
    enrollEmails,
    resetSharedSettings: env["RESET_SHARED_SETTINGS"] === "true",
  };
}

/** Variables for OpenTofu; `TF_VAR_` keeps them off the command line. */
export function tofuEnv(settings: Settings): Record<string, string> {
  return {
    TF_VAR_state_passphrase: settings.get("STATE_PASSPHRASE"),
    TF_VAR_account_id: settings.get("CLOUDFLARE_ACCOUNT_ID"),
    TF_VAR_forwarding: JSON.stringify(Object.fromEntries(settings.forwarding)),
    ...(settings.apiSubdomain === undefined ? {} : { TF_VAR_api_subdomain: settings.apiSubdomain }),
    ...(settings.dmarcPolicy === undefined ? {} : { TF_VAR_dmarc_policy: settings.dmarcPolicy }),
    TF_VAR_manage_device_profile: String(settings.manageDeviceProfile),
    TF_VAR_manage_gateway_proxy: String(settings.manageGatewayProxy),
    TF_VAR_manage_device_enrollment: String(settings.manageDeviceEnrollment),
    TF_VAR_enroll_emails: JSON.stringify(settings.enrollEmails),
  };
}

/**
 * Account-wide settings that other projects may rely on, by the flag that manages them.
 * Destroy keeps them unless RESET_SHARED_SETTINGS is true.
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
  ],
  DMARC_POLICY: ["cloudflare_dns_record.dmarc"],
} as const;

/**
 * Flags that are off now although the state holds what they manage: applying would delete
 * those account-wide settings.
 */
export function flagsThatWouldDelete(settings: Settings, recorded: readonly string[]): string[] {
  const managed = [
    ["MANAGE_DEVICE_PROFILE", settings.manageDeviceProfile, SHARED_RESOURCES.MANAGE_DEVICE_PROFILE],
    ["MANAGE_GATEWAY_PROXY", settings.manageGatewayProxy, SHARED_RESOURCES.MANAGE_GATEWAY_PROXY],
    [
      "MANAGE_DEVICE_ENROLLMENT",
      settings.manageDeviceEnrollment,
      SHARED_RESOURCES.MANAGE_DEVICE_ENROLLMENT,
    ],
    ["DMARC_POLICY", settings.dmarcPolicy !== undefined, SHARED_RESOURCES.DMARC_POLICY],
  ] as const;
  return managed
    .filter(([, on, names]) => !on && names.some((name) => isRecorded(recorded, name)))
    .map(([flag]) => flag);
}

/** Whether the state holds the resource, which these resources always do as instance [0]. */
export function isRecorded(recorded: readonly string[], name: string): boolean {
  return recorded.some((entry) => entry === name || entry.startsWith(`${name}[`));
}

export function splitList(text: string | undefined): string[] {
  return (text ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");
}
