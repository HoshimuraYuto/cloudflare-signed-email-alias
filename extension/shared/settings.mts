import { DOMAIN_PATTERN } from "../../src/domain.mts";

export const API_ORIGINS_KEY = "apiOrigins";
export const SERVICE_TOKEN_KEY = "serviceToken";

export interface ServiceToken {
  clientId: string;
  clientSecret: string;
}

/** One deployment issues one service token for every alias domain it serves. */
export interface ExtensionSettings {
  /** One API origin per alias domain, in the order the user added them. */
  origins: string[];
  token: ServiceToken;
}

const CLIENT_ID_PATTERN = /^[\w-]{1,128}\.access$/;
const CLIENT_SECRET_PATTERN = /^[\w-]{1,256}$/;

/** The Worker requires the API host to sit directly under the alias domain. */
export function parseApiOrigin(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  // href equals origin plus "/" only without credentials, path, query and fragment.
  if (url.protocol !== "https:" || url.href !== `${url.origin}/`) {
    return null;
  }
  return aliasDomainOf(url.hostname) === null ? null : url.origin;
}

/** The alias domain an API hostname serves: everything after its first label. */
export function aliasDomainOf(hostname: string): string | null {
  const dot = hostname.indexOf(".");
  const domain = hostname.slice(dot + 1);
  return dot > 0 && DOMAIN_PATTERN.test(domain) ? domain : null;
}

export function originDomain(origin: string): string | null {
  const url = URL.parse(origin);
  return url === null ? null : aliasDomainOf(url.hostname);
}

/** Reads the JSON that `pnpm run service-token` prints. */
export function parseServiceToken(input: string): ServiceToken | null {
  let value: unknown;
  try {
    value = JSON.parse(input);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const token = {
    clientId: "cf-access-client-id" in value ? value["cf-access-client-id"] : undefined,
    clientSecret: "cf-access-client-secret" in value ? value["cf-access-client-secret"] : undefined,
  };
  return isServiceToken(token) ? token : null;
}

export function isServiceToken(value: unknown): value is ServiceToken {
  return (
    typeof value === "object" &&
    value !== null &&
    "clientId" in value &&
    "clientSecret" in value &&
    typeof value.clientId === "string" &&
    typeof value.clientSecret === "string" &&
    CLIENT_ID_PATTERN.test(value.clientId) &&
    CLIENT_SECRET_PATTERN.test(value.clientSecret)
  );
}

export function originPattern(origin: string): string {
  return `${origin}/*`;
}
