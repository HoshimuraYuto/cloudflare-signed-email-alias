import { spawnSync } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const APPLIED_ACCESS = {
  ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com",
  ACCESS_AUD: "aud",
  ACCESS_CLIENT_ID: "client.access",
};

const ACCESS_OUTPUT = JSON.stringify({ worker_secrets: { value: APPLIED_ACCESS } });

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

export interface Call {
  command: string;
  stdin: string;
}

export interface FakeCli {
  /** Runs a script from scripts/ with the fakes first on PATH; returns its exit code. */
  run: (script: string, env: Record<string, string>, input?: string) => number | null;
  calls: () => Promise<Call[]>;
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

  return {
    run: (script, env, input = "") =>
      spawnSync(process.execPath, [`scripts/${script}`], {
        cwd: new URL("..", import.meta.url),
        input,
        env: {
          HOME: dir,
          PATH: `${dir}:${process.env["PATH"] ?? ""}`,
          CALLS: log,
          APPLIED: join(dir, "applied"),
          STATE_FILE: join(dir, "state", "terraform.tfstate"),
          ...env,
        },
      }).status,
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
    forgetCalls: async () => {
      await rm(log, { force: true });
    },
    remove: async () => {
      await rm(dir, { recursive: true });
    },
  };
}

export const COMPLETE_ENV = {
  CLOUDFLARE_API_TOKEN: "api-token-for-tests",
  CLOUDFLARE_ACCOUNT_ID: "account",
  SIGNING_KEY: "signing-key-for-tests",
  STATE_PASSPHRASE: "passphrase-for-tests",
  ALIAS_DOMAIN: "example.com",
  API_HOSTNAME: "alias-api.example.com",
  FORWARD_TO: "inbox@example.net",
  SERVICE_TOKEN_NAME: "password-manager",
};
