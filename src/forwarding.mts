import { DOMAIN_PATTERN } from "./domain.mts";

/**
 * Reads FORWARD_TO, such as "example.com=inbox@example.net,example.org=other@example.net":
 * every alias domain and the inbox its mail goes to. Throws when it is empty or malformed.
 */
export function parseForwarding(text: string): Map<string, string> {
  const forwarding = new Map<string, string>();
  for (const entry of text.split(",")) {
    if (entry.trim() === "") {
      continue;
    }
    const [domain, inbox] = parseEntry(entry);
    if (forwarding.has(domain)) {
      throw new Error(`FORWARD_TO lists ${domain} more than once`);
    }
    forwarding.set(domain, inbox);
  }
  if (forwarding.size === 0) {
    throw new Error("FORWARD_TO is not set");
  }
  // Mail forwarded there would come back to this Worker.
  for (const inbox of forwarding.values()) {
    const inboxDomain = inbox.slice(inbox.lastIndexOf("@") + 1);
    if (forwarding.has(inboxDomain)) {
      throw new Error(
        `FORWARD_TO sends mail to an inbox at ${inboxDomain}, which is an alias domain`,
      );
    }
  }
  return forwarding;
}

function parseEntry(entry: string): [domain: string, inbox: string] {
  const [domain = "", inbox = "", ...rest] = entry.split("=").map((part) => part.trim());
  // The message leaves the entry out: it would put the inbox address in the logs.
  if (domain === "" || inbox === "" || rest.length > 0) {
    throw new Error("FORWARD_TO entries must look like domain=inbox");
  }
  const key = domain.toLowerCase();
  if (!DOMAIN_PATTERN.test(key)) {
    throw new Error(`FORWARD_TO lists ${key}, which is not a domain an alias can use`);
  }
  return [key, inbox.toLowerCase()];
}
