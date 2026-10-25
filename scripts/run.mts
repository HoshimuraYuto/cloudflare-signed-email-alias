import { spawn } from "node:child_process";

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
  const child = spawn(command, args, {
    env: { ...process.env, ...options.env },
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
