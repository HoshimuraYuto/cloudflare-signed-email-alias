import { existsSync } from "node:fs";
import { chmod, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

import { isRecord } from "./json.mts";
import { run } from "./run.mts";
import { tofuEnv, type Settings } from "./settings.mts";

/** The state holds the service token, so only the owner may read the directory. */
const STATE_DIRECTORY_MODE = 0o700;

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

async function tofuCapturing(settings: Settings, args: string[]): Promise<string> {
  return run("tofu", ["-chdir=infra", ...args], { env: environment(settings), capture: true });
}

export async function initTofu(settings: Settings): Promise<void> {
  const directory = dirname(settings.stateFile);
  await mkdir(directory, { recursive: true });
  // Also for a directory made before, which mkdir leaves as it is.
  await chmod(directory, STATE_DIRECTORY_MODE);
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
  const list = await tofuCapturing(settings, ["state", "list"]);
  return list.split("\n").filter((line) => line !== "");
}

async function outputValue(settings: Settings, name: string): Promise<unknown> {
  const outputs: unknown = JSON.parse(await tofuCapturing(settings, ["output", "-json"]));
  return isRecord(outputs) && isRecord(outputs[name]) ? outputs[name]["value"] : undefined;
}

/** An object output, or undefined when the state does not have it. */
export async function outputRecord(
  settings: Settings,
  name: string,
): Promise<Record<string, unknown> | undefined> {
  const value = await outputValue(settings, name);
  return isRecord(value) ? value : undefined;
}

export async function warpIncludeHosts(settings: Settings): Promise<string[]> {
  const value = await outputValue(settings, "warp_include");
  return (Array.isArray(value) ? value : []).flatMap((entry) =>
    isRecord(entry) && typeof entry["host"] === "string" ? [entry["host"]] : [],
  );
}
