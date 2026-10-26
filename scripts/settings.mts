import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { parseForwarding } from "../src/forwarding.mts";
import { splitList } from "./json.mts";

// Must match worker.name in cloudflare.config.ts and local.worker_name in infra/main.tf.
export const WORKER_NAME = "cloudflare-signed-email-alias";

const DMARC_POLICIES = ["none", "quarantine", "reject"];
const DNS_LABEL = /^[a-z0-9-]+$/;
const MIN_PASSPHRASE_LENGTH = 16;

const CHANGES_CLOUDFLARE = [
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_ACCOUNT_ID",
  "STATE_PASSPHRASE",
  "FORWARD_TO",
] as const;

/** Reading an output needs only the state; anything that changes Cloudflare needs the API. */
const REQUIRED = {
  deploy: [...CHANGES_CLOUDFLARE, "SIGNING_KEY"],
  destroy: CHANGES_CLOUDFLARE,
  output: ["STATE_PASSPHRASE"],
} as const;

export type Command = keyof typeof REQUIRED;

type VariableName = (typeof REQUIRED)[Command][number];

export interface Settings {
  get: (name: VariableName) => string;
  /** Alias domain => inbox; empty when the command reads outputs only. */
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
  resetSharedSettings: boolean;
}

/** Throws listing every missing or malformed variable, so one run reports them all. */
export function readSettings(env: NodeJS.ProcessEnv, command: Command): Settings {
  const problems = [...missingVariables(env, command), ...malformedVariables(env, command)];
  if (problems.length > 0) {
    throw new Error(problems.join("\n"));
  }
  const apiSubdomain = env["API_SUBDOMAIN"] ?? "";
  const dmarcPolicy = env["DMARC_POLICY"] ?? "";
  return {
    get: (name) => env[name] ?? "",
    forwarding: command === "output" ? new Map() : parseForwarding(env["FORWARD_TO"] ?? ""),
    apiSubdomain: apiSubdomain === "" ? undefined : apiSubdomain,
    dmarcPolicy: dmarcPolicy === "" ? undefined : dmarcPolicy,
    stateFile: resolve(
      env["STATE_FILE"] ?? join(homedir(), ".local", "state", WORKER_NAME, "terraform.tfstate"),
    ),
    manageDeviceProfile: env["MANAGE_DEVICE_PROFILE"] === "true",
    manageGatewayProxy: env["MANAGE_GATEWAY_PROXY"] === "true",
    manageDeviceEnrollment: env["MANAGE_DEVICE_ENROLLMENT"] === "true",
    enrollEmails: splitList(env["ENROLL_EMAILS"]),
    resetSharedSettings: env["RESET_SHARED_SETTINGS"] === "true",
  };
}

function missingVariables(env: NodeJS.ProcessEnv, command: Command): string[] {
  const missing: string[] = REQUIRED[command].filter((name) => (env[name] ?? "") === "");
  const enrolling = env["MANAGE_DEVICE_ENROLLMENT"] === "true";
  if (command === "deploy" && enrolling && splitList(env["ENROLL_EMAILS"]).length === 0) {
    missing.push("ENROLL_EMAILS");
  }
  return missing.length > 0 ? [`Set these environment variables: ${missing.join(", ")}`] : [];
}

/** Unset values pass; each check gets a value that is set. */
const FORMATS: [name: string, isValid: (value: string) => boolean, problem: string][] = [
  [
    "STATE_PASSPHRASE",
    (value) => value.length >= MIN_PASSPHRASE_LENGTH,
    `STATE_PASSPHRASE must be at least ${MIN_PASSPHRASE_LENGTH} characters.`,
  ],
  [
    "DMARC_POLICY",
    (value) => DMARC_POLICIES.includes(value),
    `DMARC_POLICY must be one of ${DMARC_POLICIES.join(", ")}.`,
  ],
  [
    "API_SUBDOMAIN",
    (value) => DNS_LABEL.test(value),
    "API_SUBDOMAIN must be one lower-case DNS label, such as email-alias-api.",
  ],
];

/** Checked before anything runs, so a typo cannot stop a deployment halfway. */
function malformedVariables(env: NodeJS.ProcessEnv, command: Command): string[] {
  if (command !== "deploy") {
    return [];
  }
  return FORMATS.filter(([name, isValid]) => {
    const value = env[name] ?? "";
    return value !== "" && !isValid(value);
  }).map(([, , problem]) => problem);
}

/** Variables for OpenTofu; `TF_VAR_` keeps them off the command line. */
export function tofuEnv(settings: Settings): Record<string, string> {
  const passphrase = { TF_VAR_state_passphrase: settings.get("STATE_PASSPHRASE") };
  if (settings.forwarding.size === 0) {
    return passphrase;
  }
  return {
    ...passphrase,
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
