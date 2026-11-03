import {
  originDomain,
  originPattern,
  parseApiOrigin,
  parseServiceToken,
  type ServiceToken,
} from "../shared/settings.mts";

export interface SettingsStore {
  readOrigins: () => Promise<string[]>;
  saveOrigins: (origins: string[]) => Promise<void>;
  saveToken: (token: ServiceToken) => Promise<void>;
  remove: () => Promise<void>;
}

export interface HostPermissions {
  /** Must be called while the user gesture is still active, before any other await. */
  request: (pattern: string) => Promise<boolean>;
  revoke: (pattern: string) => Promise<void>;
  /** Patterns granted at runtime, without those the manifest requires. */
  granted: () => Promise<string[]>;
}

export type SaveOutcome =
  | "saved"
  | "invalid-url"
  | "invalid-token"
  | "duplicate-domain"
  | "permission-denied";

interface Dependencies {
  store: SettingsStore;
  permissions: HostPermissions;
}

/** A null field is not part of this save. */
interface FormFields {
  url: string | null;
  token: string | null;
  /** The origins the page displays, so a duplicate is refused before Chrome asks for access. */
  shown: readonly string[];
}

interface ParsedFields {
  origin: string | null;
  token: ServiceToken | null;
}

export async function saveFromForm(
  fields: FormFields,
  dependencies: Dependencies,
): Promise<SaveOutcome> {
  const parsed = parseFields(fields);
  if (typeof parsed === "string") {
    return parsed;
  }
  const { origin } = parsed;
  if (origin !== null && !(await dependencies.permissions.request(originPattern(origin)))) {
    return "permission-denied";
  }
  try {
    return await store(parsed, dependencies.store);
  } finally {
    // Whether storing failed, found a duplicate or lost a race with another tab.
    await revokeUnsaved(dependencies);
  }
}

export async function removeOrigin(origin: string, dependencies: Dependencies): Promise<void> {
  const saved = await dependencies.store.readOrigins();
  await dependencies.store.saveOrigins(saved.filter((entry) => entry !== origin));
  await revokeUnsaved(dependencies);
}

export async function removeSaved(dependencies: Dependencies): Promise<void> {
  await dependencies.store.remove();
  await revokeUnsaved(dependencies);
}

/** Runs without awaiting, so the permission request still follows the click. */
function parseFields(fields: FormFields): ParsedFields | Exclude<SaveOutcome, "saved"> {
  const origin = fields.url === null ? null : parseApiOrigin(fields.url);
  if (fields.url !== null && origin === null) {
    return "invalid-url";
  }
  const token = fields.token === null ? null : parseServiceToken(fields.token);
  if (fields.token !== null && token === null) {
    return "invalid-token";
  }
  if (origin !== null && hasDomainOf(fields.shown, origin)) {
    return "duplicate-domain";
  }
  return { origin, token };
}

async function store(parsed: ParsedFields, settings: SettingsStore): Promise<SaveOutcome> {
  if (parsed.origin !== null) {
    const saved = await settings.readOrigins();
    // Another tab may have saved the same domain since this page loaded.
    if (hasDomainOf(saved, parsed.origin)) {
      return "duplicate-domain";
    }
    await settings.saveOrigins([...saved, parsed.origin]);
  }
  if (parsed.token !== null) {
    await settings.saveToken(parsed.token);
  }
  return "saved";
}

/** Tries every pattern before throwing the first one Chrome refused. */
async function revokeUnsaved(dependencies: Dependencies): Promise<void> {
  const [saved, granted] = await Promise.all([
    dependencies.store.readOrigins(),
    dependencies.permissions.granted(),
  ]);
  const kept = new Set(saved.map((origin) => originPattern(origin)));
  const results = await Promise.allSettled(
    granted
      .filter((pattern) => !kept.has(pattern))
      .map(async (pattern) => dependencies.permissions.revoke(pattern)),
  );
  const refused = results.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (refused !== undefined) {
    throw refused.reason instanceof Error ? refused.reason : new Error("Chrome refused to revoke");
  }
}

function hasDomainOf(origins: readonly string[], origin: string): boolean {
  const domain = originDomain(origin);
  return origins.some((entry) => originDomain(entry) === domain);
}
