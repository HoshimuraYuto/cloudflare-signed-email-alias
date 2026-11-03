import { DOMAIN_PATTERN } from "../../src/domain.mts";

export const CREATE_ALIAS = "create-alias";
export const LIST_DOMAINS = "list-domains";

export interface CreateAliasMessage {
  type: typeof CREATE_ALIAS;
  /** The alias domain the user chose; null when only one is set up. */
  domain: string | null;
}

export interface ListDomainsMessage {
  type: typeof LIST_DOMAINS;
}

export const ALIAS_FAILURES = [
  "not-configured",
  "no-permission",
  "unreachable",
  "refused",
  "failed",
] as const;

export type AliasFailure = (typeof ALIAS_FAILURES)[number];

export type CreateAliasResult = { ok: true; email: string } | { ok: false; reason: AliasFailure };

export function isCreateAliasMessage(value: unknown): value is CreateAliasMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === CREATE_ALIAS &&
    "domain" in value &&
    (value.domain === null || isDomain(value.domain))
  );
}

export function isListDomainsMessage(value: unknown): value is ListDomainsMessage {
  return (
    typeof value === "object" && value !== null && "type" in value && value.type === LIST_DOMAINS
  );
}

export function isDomainList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isDomain);
}

export function isCreateAliasResult(value: unknown): value is CreateAliasResult {
  if (typeof value !== "object" || value === null || !("ok" in value)) {
    return false;
  }
  if (value.ok === true) {
    return "email" in value && typeof value.email === "string";
  }
  return "reason" in value && ALIAS_FAILURES.some((reason) => reason === value.reason);
}

export function failure(reason: AliasFailure): CreateAliasResult {
  return { ok: false, reason };
}

function isDomain(value: unknown): value is string {
  return typeof value === "string" && DOMAIN_PATTERN.test(value);
}
