import { cf } from "./cf.mts";
import type { Settings } from "./settings.mts";
import { flagsThatWouldDelete } from "./shared-resources.mts";
import { initTofu, outputRecord, stateResources, tofu } from "./tofu.mts";

type Secrets = Record<string, string>;

/** Stands in for the Access values until the first apply creates them; the API answers 403 meanwhile. */
const PENDING_ACCESS_SECRETS: Secrets = {
  ACCESS_TEAM_DOMAIN: "pending.invalid",
  ACCESS_AUD: "pending",
  ACCESS_CLIENT_ID: "pending",
};

/** Deploys the Worker and applies the infrastructure; applyArgs go to `tofu apply`. */
export async function deploy(settings: Settings, applyArgs: string[] = []): Promise<void> {
  await initTofu(settings);
  const dropped = flagsThatWouldDelete(settings, await stateResources(settings));
  if (dropped.length > 0) {
    throw new Error(
      `${dropped.join(", ")} managed shared settings in an earlier deployment; deploying without it would delete them. Set it again, or remove everything with pnpm run destroy and RESET_SHARED_SETTINGS=true.`,
    );
  }
  const before = await accessSecrets(settings);
  await deployWorker(settings, before ?? PENDING_ACCESS_SECRETS);
  await tofu(settings, ["apply", ...applyArgs]);
  const after = await accessSecrets(settings);
  if (after === undefined) {
    throw new Error("tofu apply finished without the worker_secrets output");
  }
  if (JSON.stringify(after) !== JSON.stringify(before)) {
    // The Access application only exists after apply, so its audience reaches the Worker in a second deploy.
    await deployWorker(settings, after);
  }
}

async function accessSecrets(settings: Settings): Promise<Secrets | undefined> {
  const secrets = await outputRecord(settings, "worker_secrets");
  if (secrets === undefined) {
    return undefined;
  }
  return {
    ACCESS_TEAM_DOMAIN: String(secrets["ACCESS_TEAM_DOMAIN"]),
    ACCESS_AUD: String(secrets["ACCESS_AUD"]),
    ACCESS_CLIENT_ID: String(secrets["ACCESS_CLIENT_ID"]),
  };
}

async function deployWorker(settings: Settings, access: Secrets): Promise<void> {
  const secrets: Secrets = {
    SIGNING_KEY: settings.get("SIGNING_KEY"),
    FORWARD_TO: settings.get("FORWARD_TO"),
    ...access,
  };
  await cf(["deploy", "--secrets-file", "/dev/stdin"], JSON.stringify(secrets));
}
