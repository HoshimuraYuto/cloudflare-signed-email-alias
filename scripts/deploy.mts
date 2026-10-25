import { run } from "./run.mts";
import { flagsThatWouldDelete, readSettings, type Settings } from "./settings.mts";
import { initTofu, stateResources, tofu, tofuOutput } from "./tofu.mts";

type Secrets = Record<string, string>;

/** Stands in for the Access values until the first apply creates them; the API answers 403 meanwhile. */
const PENDING_ACCESS_SECRETS: Secrets = {
  ACCESS_TEAM_DOMAIN: "pending.invalid",
  ACCESS_AUD: "pending",
  ACCESS_CLIENT_ID: "pending",
};

const settings = readSettings(process.env, ["SIGNING_KEY", "ENROLL_EMAILS"]);
await initTofu(settings);
const dropped = flagsThatWouldDelete(settings, await stateResources(settings));
if (dropped.length > 0) {
  throw new Error(
    `${dropped.join(", ")} managed account-wide settings in an earlier deployment; deploying without it would delete them. Set it to true again, or remove everything with pnpm run destroy and RESET_SHARED_SETTINGS=true.`,
  );
}
const before = await accessSecrets(settings);
await deployWorker(settings, before ?? PENDING_ACCESS_SECRETS);
await tofu(settings, ["apply"]);
const after = await accessSecrets(settings);
if (after === undefined) {
  throw new Error("tofu apply finished without the worker_secrets output");
}
if (JSON.stringify(after) !== JSON.stringify(before)) {
  // The Access application only exists after apply, so its audience reaches the Worker in a second deploy.
  await deployWorker(settings, after);
}

/** The Access values recorded in the state, or undefined before the first apply. */
async function accessSecrets(current: Settings): Promise<Secrets | undefined> {
  const secrets = await tofuOutput(current, "worker_secrets");
  if (secrets === undefined) {
    return undefined;
  }
  return {
    ACCESS_TEAM_DOMAIN: String(secrets["ACCESS_TEAM_DOMAIN"]),
    ACCESS_AUD: String(secrets["ACCESS_AUD"]),
    ACCESS_CLIENT_ID: String(secrets["ACCESS_CLIENT_ID"]),
  };
}

async function deployWorker(current: Settings, access: Secrets): Promise<void> {
  const secrets: Secrets = {
    SIGNING_KEY: current.get("SIGNING_KEY"),
    FORWARD_TO: current.get("FORWARD_TO"),
    ...access,
  };
  await run("pnpm", ["exec", "cf", "deploy", "--secrets-file", "/dev/stdin"], {
    input: JSON.stringify(secrets),
  });
}
