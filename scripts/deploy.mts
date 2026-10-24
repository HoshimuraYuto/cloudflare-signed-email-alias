import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import { run } from "./run.mts";
import { readSettings, tofuEnv, type Settings } from "./settings.mts";

type Secrets = Record<string, string>;

/** Stands in for the Access values until the first apply creates them; the API answers 403 meanwhile. */
const PENDING_ACCESS_SECRETS: Secrets = {
  ACCESS_TEAM_DOMAIN: "pending.invalid",
  ACCESS_AUD: "pending",
  ACCESS_CLIENT_ID: "pending",
};

const settings = readSettings(process.env);
await initTofu(settings);
const before = await accessSecrets(settings);
await deployWorker(settings, before ?? PENDING_ACCESS_SECRETS);
await run("tofu", ["-chdir=infra", "apply"], { env: tofuEnv(settings) });
const after = await accessSecrets(settings);
if (after === undefined) {
  throw new Error("tofu apply finished without the worker_secrets output");
}
if (JSON.stringify(after) !== JSON.stringify(before)) {
  // The Access application only exists after apply, so its audience reaches the Worker in a second deploy.
  await deployWorker(settings, after);
}

async function initTofu(current: Settings): Promise<void> {
  await mkdir(dirname(current.stateFile), { recursive: true });
  await run(
    "tofu",
    [
      "-chdir=infra",
      "init",
      "-input=false",
      "-reconfigure",
      `-backend-config=path=${current.stateFile}`,
    ],
    { env: tofuEnv(current) },
  );
}

/** The Access values recorded in the state, or undefined before the first apply. */
async function accessSecrets(current: Settings): Promise<Secrets | undefined> {
  const json = await run("tofu", ["-chdir=infra", "output", "-json"], {
    env: tofuEnv(current),
    capture: true,
  });
  const outputs: unknown = JSON.parse(json);
  if (!isRecord(outputs) || !isRecord(outputs["worker_secrets"])) {
    return undefined;
  }
  const secrets = outputs["worker_secrets"]["value"];
  if (!isRecord(secrets)) {
    return undefined;
  }
  return {
    ACCESS_TEAM_DOMAIN: String(secrets["ACCESS_TEAM_DOMAIN"]),
    ACCESS_AUD: String(secrets["ACCESS_AUD"]),
    ACCESS_CLIENT_ID: String(secrets["ACCESS_CLIENT_ID"]),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function deployWorker(current: Settings, access: Secrets): Promise<void> {
  const secrets: Secrets = {
    SIGNING_KEY: current.get("SIGNING_KEY"),
    FORWARD_TO: current.get("FORWARD_TO"),
    ALIAS_DOMAINS: current.get("ALIAS_DOMAIN"),
    ...access,
  };
  await run("pnpm", ["exec", "cf", "deploy", "--secrets-file", "/dev/stdin"], {
    input: JSON.stringify(secrets),
  });
}
