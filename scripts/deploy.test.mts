import { spawnSync } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SIGNING_KEY = "signing-key-for-tests";
const API_TOKEN = "api-token-for-tests";
const STATE_PASSPHRASE = "passphrase-for-tests";
const ACCESS_OUTPUT = JSON.stringify({
  worker_secrets: {
    value: {
      ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com",
      ACCESS_AUD: "aud",
      ACCESS_CLIENT_ID: "client.access",
    },
  },
});

// Each fake logs "<command line>\t<stdin>"; tofu answers `output` from a marker that `apply` creates.
const FAKE_TOFU = `#!/bin/sh
printf '%s\\t\\n' "tofu $*" >>"$CALLS"
case "$*" in
  *" apply"*) touch "$APPLIED" ;;
  *" output "*) if [ -f "$APPLIED" ]; then echo '${ACCESS_OUTPUT}'; else echo '{}'; fi ;;
esac
`;
const FAKE_PNPM = `#!/bin/sh
printf '%s\\t%s\\n' "pnpm $*" "$(cat)" >>"$CALLS"
`;

const complete = {
  CLOUDFLARE_API_TOKEN: API_TOKEN,
  CLOUDFLARE_ACCOUNT_ID: "account",
  SIGNING_KEY,
  STATE_PASSPHRASE,
  ALIAS_DOMAIN: "example.com",
  API_HOSTNAME: "alias-api.example.com",
  FORWARD_TO: "inbox@example.net",
  SERVICE_TOKEN_NAME: "password-manager",
};
const PENDING = {
  ACCESS_TEAM_DOMAIN: "pending.invalid",
  ACCESS_AUD: "pending",
  ACCESS_CLIENT_ID: "pending",
};
const APPLIED = {
  ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com",
  ACCESS_AUD: "aud",
  ACCESS_CLIENT_ID: "client.access",
};

let dir = "";

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "deploy-test-"));
  await writeFile(join(dir, "tofu"), FAKE_TOFU);
  await writeFile(join(dir, "pnpm"), FAKE_PNPM);
  await chmod(join(dir, "tofu"), 0o755);
  await chmod(join(dir, "pnpm"), 0o755);
});

afterEach(async () => {
  await rm(dir, { recursive: true });
});

function deploy(env: Record<string, string>): number | null {
  const result = spawnSync(process.execPath, ["scripts/deploy.mts"], {
    cwd: new URL("..", import.meta.url),
    env: {
      HOME: dir,
      PATH: `${dir}:${process.env["PATH"] ?? ""}`,
      CALLS: join(dir, "calls.log"),
      APPLIED: join(dir, "applied"),
      STATE_FILE: join(dir, "state", "terraform.tfstate"),
      ...env,
    },
  });
  return result.status;
}

async function calls(): Promise<{ command: string; stdin: string }[]> {
  const log = await readFile(join(dir, "calls.log"), "utf8").catch(() => "");
  return log
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => {
      const [command = "", stdin = ""] = line.split("\t");
      return { command, stdin };
    });
}

async function steps(): Promise<string[]> {
  return (await calls()).map(
    ({ command }) => /\b(init|output|apply|deploy)\b/.exec(command)?.[1] ?? command,
  );
}

async function deployedSecrets(): Promise<unknown[]> {
  return (await calls())
    .filter(({ command }) => command.includes("cf deploy"))
    .map(({ stdin }): unknown => JSON.parse(stdin));
}

function workerSecrets(access: Record<string, string>) {
  return { SIGNING_KEY, FORWARD_TO: "inbox@example.net", ALIAS_DOMAINS: "example.com", ...access };
}

describe("deploy", () => {
  it("deploys with placeholders first, then again with the Access values from apply", async () => {
    expect(deploy(complete)).toBe(0);

    expect(await steps()).toEqual(["init", "output", "deploy", "apply", "output", "deploy"]);
    expect(await deployedSecrets()).toEqual([workerSecrets(PENDING), workerSecrets(APPLIED)]);
  });

  it("deploys once with the recorded Access values when nothing changed", async () => {
    deploy(complete);
    await rm(join(dir, "calls.log"));

    expect(deploy(complete)).toBe(0);

    expect(await steps()).toEqual(["init", "output", "deploy", "apply", "output"]);
    expect(await deployedSecrets()).toEqual([workerSecrets(APPLIED)]);
  });

  it("passes secrets on stdin, never as arguments", async () => {
    deploy(complete);

    for (const { command } of await calls()) {
      expect(command).not.toMatch(new RegExp(`${SIGNING_KEY}|${API_TOKEN}|${STATE_PASSPHRASE}`));
    }
  });

  it("runs nothing when a variable is missing", async () => {
    expect(deploy({ ...complete, SIGNING_KEY: "" })).not.toBe(0);

    expect(await calls()).toEqual([]);
  });
});
