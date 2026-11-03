import { failure, type CreateAliasResult } from "../shared/messages.mts";
import { originDomain, type ExtensionSettings, type ServiceToken } from "../shared/settings.mts";

const ALIASES_PATH = "/api/v1/aliases";
const REQUEST_TIMEOUT_MS = 15_000;
const LOCAL_PART_PATTERN = /^[a-z0-9.-]{1,64}$/;

export interface Sender {
  id?: string | undefined;
  url?: string | undefined;
  tab?: object | undefined;
}

export interface CreateAliasDependencies {
  extensionId: string;
  readSettings: () => Promise<ExtensionSettings | null>;
  hasHostPermission: (origin: string) => Promise<boolean>;
  fetch: typeof fetch;
}

export async function listDomainsFor(
  sender: Sender,
  dependencies: Pick<CreateAliasDependencies, "extensionId" | "readSettings">,
): Promise<string[]> {
  if (senderSite(sender, dependencies.extensionId) === null) {
    return [];
  }
  const settings = await dependencies.readSettings();
  return (settings?.origins ?? []).flatMap((origin) => originDomain(origin) ?? []);
}

/** Site and API come from Chrome's record of the sender and the settings, never the page. */
export async function createAliasFor(
  request: { sender: Sender; domain: string | null },
  dependencies: CreateAliasDependencies,
): Promise<CreateAliasResult> {
  const site = senderSite(request.sender, dependencies.extensionId);
  if (site === null) {
    return failure("failed");
  }
  const settings = await dependencies.readSettings();
  if (settings === null) {
    return failure("not-configured");
  }
  const origin = originFor(settings.origins, request.domain);
  const domain = origin === null ? null : originDomain(origin);
  if (origin === null || domain === null) {
    // The settings changed after the button listed the domains.
    return failure("failed");
  }
  if (!(await dependencies.hasHostPermission(origin))) {
    return failure("no-permission");
  }
  return postAlias({ origin, domain, token: settings.token, site }, dependencies.fetch);
}

export function originFor(origins: readonly string[], domain: string | null): string | null {
  if (domain === null) {
    return origins.length === 1 ? (origins[0] ?? null) : null;
  }
  return origins.find((origin) => originDomain(origin) === domain) ?? null;
}

export function senderSite(sender: Sender, extensionId: string): string | null {
  if (sender.id !== extensionId || sender.tab === undefined || sender.url === undefined) {
    return null;
  }
  const url = URL.parse(sender.url);
  if (url === null || (url.protocol !== "https:" && url.protocol !== "http:")) {
    return null;
  }
  return url.hostname === "" ? null : url.hostname;
}

async function postAlias(
  request: { origin: string; domain: string; token: ServiceToken; site: string },
  fetchApi: typeof fetch,
): Promise<CreateAliasResult> {
  const { origin, domain, token, site } = request;
  let response: Response;
  try {
    response = await fetchApi(`${origin}${ALIASES_PATH}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        // Access reads the service token JSON from this header (read_service_tokens_from_header).
        Authorization: JSON.stringify({
          "cf-access-client-id": token.clientId,
          "cf-access-client-secret": token.clientSecret,
        }),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ domain, description: site }),
      credentials: "omit",
      cache: "no-store",
      // The API never redirects; a redirect comes from something in between and is not followed.
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return failure("unreachable");
  }
  return readAlias(response, domain);
}

async function readAlias(response: Response, domain: string): Promise<CreateAliasResult> {
  if (response.type === "opaqueredirect" || response.status === 401 || response.status === 403) {
    return failure("refused");
  }
  if (response.status !== 201) {
    return failure("failed");
  }
  const email = await response.json().then(emailOf, () => null);
  return email !== null && isAliasIn(email, domain) ? { ok: true, email } : failure("failed");
}

function emailOf(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("data" in body)) {
    return null;
  }
  const { data } = body;
  if (typeof data !== "object" || data === null || !("email" in data)) {
    return null;
  }
  return typeof data.email === "string" ? data.email : null;
}

function isAliasIn(email: string, domain: string): boolean {
  const suffix = `@${domain}`;
  return email.endsWith(suffix) && LOCAL_PART_PATTERN.test(email.slice(0, -suffix.length));
}
