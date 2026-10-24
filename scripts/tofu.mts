import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import { run } from "./run.mts";
import { tofuEnv, type Settings } from "./settings.mts";

export async function tofu(settings: Settings, args: string[]): Promise<void> {
  await run("tofu", ["-chdir=infra", ...args], { env: tofuEnv(settings) });
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

/** The value of one output, or undefined when the state does not have it. */
export async function tofuOutput(
  settings: Settings,
  name: string,
): Promise<Record<string, unknown> | undefined> {
  const json = await run("tofu", ["-chdir=infra", "output", "-json"], {
    env: tofuEnv(settings),
    capture: true,
  });
  const outputs: unknown = JSON.parse(json);
  if (!isRecord(outputs) || !isRecord(outputs[name])) {
    return undefined;
  }
  const value = outputs[name]["value"];
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
