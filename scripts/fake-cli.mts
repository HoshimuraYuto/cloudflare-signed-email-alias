import { spawnSync } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const APPLIED_ACCESS = {
  ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com",
  ACCESS_AUD: "aud",
  ACCESS_CLIENT_ID: "client.access",
};

export const SERVICE_TOKEN = { client_id: "client.access", client_secret: "client-secret" };

const ACCESS_OUTPUT = JSON.stringify({
  worker_secrets: { value: APPLIED_ACCESS },
  service_token: { value: SERVICE_TOKEN },
});

// Each fake logs "<command line>\t<stdin>"; tofu answers `output` from a marker that `apply` creates.
const FAKE_TOFU = `#!/bin/sh
printf '%s\\t\\n' "tofu $*" >>"$CALLS"
case "$*" in
  *" init"*) echo "OpenTofu has been successfully initialized!" ;;
  *" apply"*) touch "$APPLIED" ;;
  *" output "*) if [ -f "$APPLIED" ]; then echo '${ACCESS_OUTPUT}'; else echo '{}'; fi ;;
  *" state list"*) cat "$STATE_LIST" ;;
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
  runCapturing: (
    script: string,
    env: Record<string, string>,
  ) => { status: number | null; stdout: string; stderr: string };
  /** Makes the state file exist and hold these resource addresses. */
  recordState: (resources: string[]) => Promise<void>;
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

  const spawnScript = (script: string, env: Record<string, string>, input = "") =>
    spawnSync(process.execPath, [`scripts/${script}`], {
      cwd: new URL("..", import.meta.url),
      input,
      encoding: "utf8",
      env: {
        HOME: dir,
        PATH: `${dir}:${process.env["PATH"] ?? ""}`,
        CALLS: log,
        APPLIED: join(dir, "applied"),
        STATE_FILE: join(dir, "terraform.tfstate"),
        STATE_LIST: join(dir, "state-list"),
        ...env,
      },
    });

  return {
    run: (script, env, input) => spawnScript(script, env, input).status,
    runCapturing: (script, env) => {
      const { status, stdout, stderr } = spawnScript(script, env);
      return { status, stdout, stderr };
    },
    recordState: async (resources) => {
      await writeFile(join(dir, "terraform.tfstate"), "");
      await writeFile(join(dir, "state-list"), resources.map((name) => `${name}\n`).join(""));
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
  FORWARD_TO: "example.com=inbox@example.net",
};
