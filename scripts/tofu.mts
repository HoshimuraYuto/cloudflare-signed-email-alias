import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

import { run } from "./run.mts";
import { tofuEnv, type Settings } from "./settings.mts";

/**
 * Passed through the environment rather than written in infra/: an editor's language server
 * reads the configuration without the passphrase and gives up on an encryption block.
 */
const STATE_ENCRYPTION = `key_provider "pbkdf2" "state" {
  passphrase = var.state_passphrase
}
method "aes_gcm" "state" {
  keys = key_provider.pbkdf2.state
}
state {
  method   = method.aes_gcm.state
  enforced = true
}
plan {
  method   = method.aes_gcm.state
  enforced = true
}`;

function environment(settings: Settings): Record<string, string> {
  return {
    ...tofuEnv(settings),
    TF_ENCRYPTION: STATE_ENCRYPTION,
    // Beside the state, so infra/.terraform stays the editor's and knows no state.
    TF_DATA_DIR: join(dirname(settings.stateFile), ".terraform"),
  };
}

export async function tofu(settings: Settings, args: string[]): Promise<void> {
  await run("tofu", ["-chdir=infra", ...args], { env: environment(settings) });
}

export async function initTofu(settings: Settings): Promise<void> {
  await mkdir(dirname(settings.stateFile), { recursive: true });
  await tofu(settings, [
    "init",
    "-input=false",
    "-reconfigure",
    `-backend-config=path=${settings.stateFile}`,
  ]);
}

export async function stateResources(settings: Settings): Promise<string[]> {
  if (!existsSync(settings.stateFile)) {
    return [];
  }
  const list = await run("tofu", ["-chdir=infra", "state", "list"], {
    env: environment(settings),
    capture: true,
  });
  return list.split("\n").filter((line) => line !== "");
}

/** The value of one output, or undefined when the state does not have it. */
export async function tofuOutput(
  settings: Settings,
  name: string,
): Promise<Record<string, unknown> | undefined>;
export async function tofuOutput(settings: Settings, name: string, list: true): Promise<unknown[]>;
export async function tofuOutput(
  settings: Settings,
  name: string,
  list?: true,
): Promise<Record<string, unknown> | unknown[] | undefined> {
  const json = await run("tofu", ["-chdir=infra", "output", "-json"], {
    env: environment(settings),
    capture: true,
  });
  const outputs: unknown = JSON.parse(json);
  if (!isRecord(outputs) || !isRecord(outputs[name])) {
    return list ? [] : undefined;
  }
  const value = outputs[name]["value"];
  if (list) {
    return Array.isArray(value) ? value : [];
  }
  return isRecord(value) && !Array.isArray(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
