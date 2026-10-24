import { homedir } from "node:os";
import { join } from "node:path";

// Must match worker.name in cloudflare.config.ts and local.worker_name in infra/main.tf.
export const WORKER_NAME = "cloudflare-signed-email-alias";

const REQUIRED = [
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_ACCOUNT_ID",
  "SIGNING_KEY",
  "STATE_PASSPHRASE",
  "ALIAS_DOMAIN",
  "API_HOSTNAME",
  "FORWARD_TO",
  "SERVICE_TOKEN_NAME",
] as const;

type RequiredName = (typeof REQUIRED)[number];

export interface Settings {
  get: (name: RequiredName) => string;
  stateFile: string;
  manageDeviceProfile: boolean;
}

/** Throws listing every missing variable, so one run reports them all. */
export function readSettings(env: NodeJS.ProcessEnv): Settings {
  const missing = REQUIRED.filter((name) => (env[name] ?? "") === "");
  if (missing.length > 0) {
    throw new Error(`Set these environment variables: ${missing.join(", ")}`);
  }
  return {
    get: (name) => env[name] ?? "",
    stateFile:
      env["STATE_FILE"] ?? join(homedir(), ".local", "state", WORKER_NAME, "terraform.tfstate"),
    manageDeviceProfile: env["MANAGE_DEVICE_PROFILE"] === "true",
  };
}

/** Variables for OpenTofu; `TF_VAR_` keeps them off the command line. */
export function tofuEnv(settings: Settings): Record<string, string> {
  return {
    TF_VAR_state_passphrase: settings.get("STATE_PASSPHRASE"),
    TF_VAR_account_id: settings.get("CLOUDFLARE_ACCOUNT_ID"),
    TF_VAR_alias_domain: settings.get("ALIAS_DOMAIN"),
    TF_VAR_api_hostname: settings.get("API_HOSTNAME"),
    TF_VAR_forward_to: settings.get("FORWARD_TO"),
    TF_VAR_service_token_name: settings.get("SERVICE_TOKEN_NAME"),
    TF_VAR_manage_device_profile: String(settings.manageDeviceProfile),
  };
}
