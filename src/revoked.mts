/**
 * Reads REVOKED_ALIASES, a JSON array of addresses that no longer receive mail although their
 * signature is valid. Throws when it is not such an array.
 */
export function parseRevoked(text: string): Set<string> {
  const value: unknown = JSON.parse(text);
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    throw new TypeError("REVOKED_ALIASES must be a JSON array of addresses");
  }
  return new Set(value.map((address) => address.trim().toLowerCase()));
}
