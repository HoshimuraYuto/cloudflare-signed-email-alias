import { existsSync } from "node:fs";
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

export async function stateResources(settings: Settings): Promise<string[]> {
  if (!existsSync(settings.stateFile)) {
    return [];
  }
  const list = await run("tofu", ["-chdir=infra", "state", "list"], {
    env: tofuEnv(settings),
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
    env: tofuEnv(settings),
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
