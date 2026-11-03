import { browser } from "wxt/browser";

import {
  API_ORIGINS_KEY,
  isServiceToken,
  parseApiOrigin,
  SERVICE_TOKEN_KEY,
  type ExtensionSettings,
  type ServiceToken,
} from "./settings.mts";

export async function readSettings(): Promise<ExtensionSettings | null> {
  const [origins, token] = await Promise.all([readOrigins(), readToken()]);
  return origins.length === 0 || token === null ? null : { origins, token };
}

/** Read apart from the token, so the origins still show when the token is broken. */
export async function readOrigins(): Promise<string[]> {
  const stored: unknown = (await browser.storage.local.get(API_ORIGINS_KEY))[API_ORIGINS_KEY];
  if (!Array.isArray(stored)) {
    return [];
  }
  return stored.filter(
    (origin): origin is string => typeof origin === "string" && parseApiOrigin(origin) === origin,
  );
}

export async function readToken(): Promise<ServiceToken | null> {
  const token: unknown = (await browser.storage.local.get(SERVICE_TOKEN_KEY))[SERVICE_TOKEN_KEY];
  return isServiceToken(token) ? token : null;
}

export async function saveOrigins(origins: string[]): Promise<void> {
  await write({ [API_ORIGINS_KEY]: origins });
}

export async function saveToken(token: ServiceToken): Promise<void> {
  await write({ [SERVICE_TOKEN_KEY]: token });
}

export async function removeSettings(): Promise<void> {
  await browser.storage.local.remove([API_ORIGINS_KEY, SERVICE_TOKEN_KEY]);
}

async function write(items: Record<string, unknown>): Promise<void> {
  // Keeps the token out of content scripts, which run inside web pages.
  await browser.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  await browser.storage.local.set(items);
}
