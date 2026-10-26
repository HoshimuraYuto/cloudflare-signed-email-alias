import { describe, expect, it, vi } from "vitest";

import { createAddress, importSigningKey } from "../src/address.mts";
import { handleEmail } from "../src/email.mts";

const FORWARDING = "example.com=inbox@example.net,example.org=other@example.net";
const NONE_REVOKED = "[]";

function generateSecret(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
}

function fakeMessage(to: string) {
  const forward = vi.fn(async () => ({ messageId: "forwarded" }));
  const setReject = vi.fn();
  return { message: { to, forward, setReject }, forward, setReject };
}

async function signedAddress(secret: string, domain = "example.com"): Promise<string> {
  return createAddress({ service: "shop", domain }, await importSigningKey(secret));
}

describe("handleEmail", () => {
  it("forwards mail sent to a signed alias", async () => {
    const secret = generateSecret();
    const { message, forward, setReject } = fakeMessage(await signedAddress(secret));

    await handleEmail(message, {
      signingKey: secret,
      forwarding: FORWARDING,
      revoked: NONE_REVOKED,
    });

    expect(forward).toHaveBeenCalledWith("inbox@example.net");
    expect(setReject).not.toHaveBeenCalled();
  });

  it("forwards each domain to its own inbox", async () => {
    const secret = generateSecret();
    const { message, forward } = fakeMessage(await signedAddress(secret, "example.org"));

    await handleEmail(message, {
      signingKey: secret,
      forwarding: FORWARDING,
      revoked: NONE_REVOKED,
    });

    expect(forward).toHaveBeenCalledWith("other@example.net");
  });

  it("rejects a signed alias at a domain FORWARD_TO does not list", async () => {
    const secret = generateSecret();
    const { message, forward, setReject } = fakeMessage(await signedAddress(secret, "example.edu"));

    await handleEmail(message, {
      signingKey: secret,
      forwarding: FORWARDING,
      revoked: NONE_REVOKED,
    });

    expect(setReject).toHaveBeenCalledWith("Unknown address");
    expect(forward).not.toHaveBeenCalled();
  });

  it("rejects an alias signed with another key", async () => {
    const { message, forward, setReject } = fakeMessage(await signedAddress(generateSecret()));

    await handleEmail(message, {
      signingKey: generateSecret(),
      forwarding: FORWARDING,
      revoked: NONE_REVOKED,
    });

    expect(setReject).toHaveBeenCalledWith("Unknown address");
    expect(forward).not.toHaveBeenCalled();
  });

  it("rejects a revoked alias with the same reason, whatever its case", async () => {
    const secret = generateSecret();
    const address = await signedAddress(secret);
    const { message, forward, setReject } = fakeMessage(address);

    await handleEmail(message, {
      signingKey: secret,
      forwarding: FORWARDING,
      revoked: JSON.stringify([address.toUpperCase()]),
    });

    expect(setReject).toHaveBeenCalledWith("Unknown address");
    expect(forward).not.toHaveBeenCalled();
  });

  it("still forwards the aliases that are not revoked", async () => {
    const secret = generateSecret();
    const { message, forward } = fakeMessage(await signedAddress(secret));

    await handleEmail(message, {
      signingKey: secret,
      forwarding: FORWARDING,
      revoked: JSON.stringify([await signedAddress(secret)]),
    });

    expect(forward).toHaveBeenCalledWith("inbox@example.net");
  });

  it("throws without touching the mail when REVOKED_ALIASES is malformed", async () => {
    const secret = generateSecret();
    const { message, forward, setReject } = fakeMessage(await signedAddress(secret));

    await expect(
      handleEmail(message, {
        signingKey: secret,
        forwarding: FORWARDING,
        revoked: "a@example.com",
      }),
    ).rejects.toThrow();
    expect(forward).not.toHaveBeenCalled();
    expect(setReject).not.toHaveBeenCalled();
  });

  it("rejects a malformed address with the same reason", async () => {
    const { message, forward, setReject } = fakeMessage("info@example.com");

    await handleEmail(message, {
      signingKey: generateSecret(),
      forwarding: FORWARDING,
      revoked: NONE_REVOKED,
    });

    expect(setReject).toHaveBeenCalledWith("Unknown address");
    expect(forward).not.toHaveBeenCalled();
  });

  it("throws without touching the mail when the signing key is unusable", async () => {
    const { message, forward, setReject } = fakeMessage(await signedAddress(generateSecret()));

    await expect(
      handleEmail(message, { signingKey: "", forwarding: FORWARDING, revoked: NONE_REVOKED }),
    ).rejects.toThrow();
    expect(forward).not.toHaveBeenCalled();
    expect(setReject).not.toHaveBeenCalled();
  });

  it("throws without touching the mail when the destination is missing", async () => {
    const secret = generateSecret();
    const { message, forward, setReject } = fakeMessage(await signedAddress(secret));

    await expect(
      handleEmail(message, { signingKey: secret, forwarding: "", revoked: NONE_REVOKED }),
    ).rejects.toThrow();
    expect(forward).not.toHaveBeenCalled();
    expect(setReject).not.toHaveBeenCalled();
  });
});
