import { spawnSync } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach } from "vitest";

export const APPLIED_ACCESS = {
  ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com",
  ACCESS_AUD: "aud",
  ACCESS_CLIENT_ID: "client.access",
};

export const SERVICE_TOKEN = { client_id: "client.access", client_secret: "client-secret" };

export const SHARED_ORIGINALS = {
  split_tunnel: {
    include: null,
    exclude: [{ address: "10.0.0.0/8", description: null, host: null }],
  },
  gateway_proxy: { gateway_proxy_enabled: false, gateway_udp_proxy_enabled: true },
};

const WARP_INCLUDE = [
  { host: "email-alias-api.example.com" },
  { host: "team.cloudflareaccess.com" },
];

const ACCESS_OUTPUT = JSON.stringify({
  worker_secrets: { value: APPLIED_ACCESS },
  service_token: { value: SERVICE_TOKEN },
  warp_include: { value: WARP_INCLUDE },
});

/** Appends to $LEAKS the name of every withheld variable the fake finds in its environment. */
const REPORT_LEAKS = `for name in SIGNING_KEY STATE_PASSPHRASE FORWARD_TO ENROLL_EMAILS REVOKED_ALIASES; do
  env | grep -q "^$name=" && echo "$name" >>"$LEAKS"
done
`;

// Each fake logs "<command line>\t<stdin>"; tofu answers `output` from a marker that `apply` creates.
const FAKE_TOFU = `#!/bin/sh
printf '%s\\t\\n' "tofu $*" >>"$CALLS"
printf '%s\\t%s\\n' "\${TF_ENCRYPTION:+set}" "\${TF_DATA_DIR:-}" >>"$TOFU_ENV"
${REPORT_LEAKS}case "$*" in
  *" init"*) echo "OpenTofu has been successfully initialized!" ;;
  *" apply"*) touch "$APPLIED" ;;
  *" output "*)
    if [ -f "$APPLIED" ]; then echo '${ACCESS_OUTPUT}'
    elif [ -f "$STATE_LIST" ]; then cat "$ORIGINALS"
    else echo '{}'; fi ;;
  *" state list"*) cat "$STATE_LIST" ;;
esac
`;
const FAKE_PNPM = `#!/bin/sh
${REPORT_LEAKS}printf '%s\\t%s\\n' "pnpm $*" "$(cat)" >>"$CALLS"
`;

function originalsOutput(originals: unknown): string {
  return JSON.stringify({
    shared_originals: { value: originals },
    warp_include: { value: WARP_INCLUDE },
  });
}

export interface Call {
  command: string;
  stdin: string;
}

export interface FakeCli {
  /** Runs a script from scripts/ with the fakes first on PATH; returns its exit code. */
  run: (script: string, env: Record<string, string>, input?: string) => number | null;
  runCapturing: (
    script: string,
    env: Record<string, string>,
    input?: string,
  ) => { status: number | null; stdout: string; stderr: string };
  /** Makes the state file exist and hold these resource addresses. */
  recordState: (resources: string[]) => Promise<void>;
  /** Replaces the shared_originals output the state reports. */
  setOriginals: (originals: unknown) => Promise<void>;
  calls: () => Promise<Call[]>;
  /** For every tofu run: whether TF_ENCRYPTION was set, and TF_DATA_DIR. */
  tofuEnvironments: () => Promise<{ encryption: boolean; dataDir: string }[]>;
  /** Withheld variables that reached a fake, which must stay empty. */
  leakedSecrets: () => Promise<string[]>;
  forgetCalls: () => Promise<void>;
  remove: () => Promise<void>;
}

export async function createFakeCli(): Promise<FakeCli> {
  const dir = await mkdtemp(join(tmpdir(), "fake-cli-"));
  await writeFile(join(dir, "tofu"), FAKE_TOFU);
  await writeFile(join(dir, "pnpm"), FAKE_PNPM);
  await chmod(join(dir, "tofu"), 0o755);
  await chmod(join(dir, "pnpm"), 0o755);
  const log = join(dir, "calls.log");

  const spawnScript = (script: string, env: Record<string, string>, input = "") =>
    spawnSync(process.execPath, [`scripts/${script}`], {
      cwd: new URL("..", import.meta.url),
      input,
      encoding: "utf8",
      env: {
        HOME: dir,
        PATH: `${dir}:${process.env["PATH"] ?? ""}`,
        CALLS: log,
        TOFU_ENV: join(dir, "tofu-env.log"),
        LEAKS: join(dir, "leaks.log"),
        APPLIED: join(dir, "applied"),
        STATE_FILE: join(dir, "terraform.tfstate"),
        STATE_LIST: join(dir, "state-list"),
        ORIGINALS: join(dir, "originals.json"),
        ...env,
      },
    });

  return {
    run: (script, env, input) => spawnScript(script, env, input).status,
    runCapturing: (script, env, input) => {
      const { status, stdout, stderr } = spawnScript(script, env, input);
      return { status, stdout, stderr };
    },
    recordState: async (resources) => {
      await writeFile(join(dir, "terraform.tfstate"), "");
      await writeFile(join(dir, "state-list"), resources.map((name) => `${name}\n`).join(""));
      await writeFile(join(dir, "originals.json"), originalsOutput(SHARED_ORIGINALS));
    },
    setOriginals: async (originals) => {
      await writeFile(join(dir, "originals.json"), originalsOutput(originals));
    },
    calls: async () => {
      const text = await readFile(log, "utf8").catch(() => "");
      return text
        .split("\n")
        .filter((line) => line !== "")
        .map((line) => {
          const [command = "", stdin = ""] = line.split("\t");
          return { command, stdin };
        });
    },
    tofuEnvironments: async () => {
      const text = await readFile(join(dir, "tofu-env.log"), "utf8").catch(() => "");
      return text
        .split("\n")
        .filter((line) => line !== "")
        .map((line) => {
          const [encryption = "", dataDir = ""] = line.split("\t");
          return { encryption: encryption === "set", dataDir };
        });
    },
    leakedSecrets: async () => {
      const text = await readFile(join(dir, "leaks.log"), "utf8").catch(() => "");
      return [...new Set(text.split("\n").filter((line) => line !== ""))];
    },
    forgetCalls: async () => {
      await rm(log, { force: true });
    },
    remove: async () => {
      await rm(dir, { recursive: true });
    },
  };
}

/** A fresh fake per test; read `.current` inside the test. */
export function useFakeCli(): { readonly current: FakeCli } {
  let cli: FakeCli | undefined;
  beforeEach(async () => {
    cli = await createFakeCli();
  });
  afterEach(async () => {
    await cli?.remove();
  });
  return {
    get current(): FakeCli {
      if (cli === undefined) {
        throw new Error("useFakeCli() is ready only inside a test");
      }
      return cli;
    },
  };
}

export const COMPLETE_ENV = {
  CLOUDFLARE_API_TOKEN: "api-token-for-tests",
  CLOUDFLARE_ACCOUNT_ID: "account",
  SIGNING_KEY: "signing-key-for-tests",
  STATE_PASSPHRASE: "passphrase-for-tests",
  FORWARD_TO: "example.com=inbox@example.net",
};
