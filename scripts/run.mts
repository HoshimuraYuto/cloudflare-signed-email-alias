import { spawn } from "node:child_process";

/**
 * Kept out of every child's environment, so a compromised CLI or provider plugin cannot read
 * them there. Children that need one get it over stdin or as a TF_VAR_.
 */
const WITHHELD = ["SIGNING_KEY", "STATE_PASSPHRASE", "FORWARD_TO", "ENROLL_EMAILS"];

interface RunOptions {
  env?: Record<string, string>;
  /** Written to the child's stdin, so secrets never appear in its arguments. */
  input?: string;
  /**
   * Capture stdout instead of showing it. Uncaptured stdout is shown on stderr, which keeps the
   * script's own stdout for its result, as in `pnpm run service-token | pbcopy`.
   */
  capture?: boolean;
}

/** Throws when the command exits non-zero. */
export async function run(
  command: string,
  args: string[],
  options: RunOptions = {},
): Promise<string> {
  const inherited = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !WITHHELD.includes(name)),
  );
  const child = spawn(command, args, {
    env: { ...inherited, ...options.env },
    stdio: [
      options.input === undefined ? "inherit" : "pipe",
      options.capture ? "pipe" : process.stderr,
      "inherit",
    ],
  });
  child.stdin?.end(options.input);
  let stdout = "";
  child.stdout?.on("data", (chunk: Buffer) => {
    stdout += chunk.toString();
  });
  const code = await new Promise<number | null>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
  if (code !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited with ${String(code)}`);
  }
  return stdout;
}
