import { DOMAIN_PATTERN } from "./domain.mts";

const SERVICE_PATTERN = /^[a-z0-9-]{1,32}$/;
const NONCE_LENGTH = 4;
const TAG_LENGTH = 8;
const KEY_BYTES = 32;
const UNBIASED_BYTE_LIMIT = 256 - (256 % 36);
const ADDRESS_PATTERN = new RegExp(
  `^([a-z0-9-]{1,32})\\.([a-z0-9]{${NONCE_LENGTH}})\\.([a-z0-9]{${TAG_LENGTH}})@([a-z0-9-]+(?:\\.[a-z0-9-]+)+)$`,
);

interface SignedParts {
  service: string;
  nonce: string;
  domain: string;
}

/** Throws when the secret is not base64 for exactly 32 bytes. */
export async function importSigningKey(secret: string): Promise<CryptoKey> {
  const bytes = Uint8Array.from(atob(secret), (char) => char.charCodeAt(0));
  if (bytes.length !== KEY_BYTES) {
    throw new RangeError(`signing key must be base64 for ${KEY_BYTES} bytes`);
  }
  return crypto.subtle.importKey("raw", bytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

/** Throws when the service or domain is outside the allowed characters. */
export async function createAddress(
  target: { service: string; domain: string },
  key: CryptoKey,
): Promise<string> {
  if (!SERVICE_PATTERN.test(target.service) || !DOMAIN_PATTERN.test(target.domain)) {
    throw new RangeError("service or domain has characters an alias cannot carry");
  }
  const nonce = randomBase36(NONCE_LENGTH);
  const tag = await computeTag({ ...target, nonce }, key);
  return `${target.service}.${nonce}.${tag}@${target.domain}`;
}

export async function verifyAddress(address: string, key: CryptoKey): Promise<boolean> {
  const match = ADDRESS_PATTERN.exec(address.trim().toLowerCase());
  if (match === null) {
    return false;
  }
  const [, service = "", nonce = "", tag = "", domain = ""] = match;
  const encoder = new TextEncoder();
  const expected = encoder.encode(await computeTag({ service, nonce, domain }, key));
  return crypto.subtle.timingSafeEqual(expected, encoder.encode(tag));
}

async function computeTag(parts: SignedParts, key: CryptoKey): Promise<string> {
  // A JSON array keeps the parts apart, so no two different addresses sign the same bytes.
  const message = new TextEncoder().encode(
    JSON.stringify([parts.service, parts.nonce, parts.domain]),
  );
  const mac = new DataView(await crypto.subtle.sign("HMAC", key, message));
  return (mac.getBigUint64(0) % 36n ** BigInt(TAG_LENGTH)).toString(36).padStart(TAG_LENGTH, "0");
}

function randomBase36(length: number): string {
  let result = "";
  while (result.length < length) {
    const [byte = 255] = crypto.getRandomValues(new Uint8Array(1));
    // Bytes at or above the limit would make some characters more likely.
    if (byte < UNBIASED_BYTE_LIMIT) {
      result += (byte % 36).toString(36);
    }
  }
  return result;
}
