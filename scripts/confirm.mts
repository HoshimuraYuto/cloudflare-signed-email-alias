import { createInterface } from "node:readline/promises";

import { splitList } from "./json.mts";

/** Asks for every domain to be typed back; throws unless the answer lists exactly those. */
export async function confirmDomains(domains: string[], warning: string): Promise<void> {
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await prompt.question(
    `${warning} Type ${domains.join(", ")}, separated by commas, to continue: `,
  );
  prompt.close();
  const typed = new Set(splitList(answer.toLowerCase()));
  if (typed.size !== domains.length || domains.some((domain) => !typed.has(domain))) {
    throw new Error("The domains did not match; nothing was changed.");
  }
}
