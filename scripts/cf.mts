import { run } from "./run.mts";

export async function cf(args: string[], input?: string): Promise<void> {
  await run("pnpm", ["exec", "cf", ...args], input === undefined ? {} : { input });
}
