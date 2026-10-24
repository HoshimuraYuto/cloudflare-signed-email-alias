import { describe, expect, it, vi } from "vitest";

import { createAddress, importSigningKey } from "../src/address.mts";
import { handleEmail } from "../src/email.mts";

const FORWARD_TO = "inbox@example.net";

function generateSecret(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
}

function fakeMessage(to: string) {
  const forward = vi.fn(async () => ({ messageId: "forwarded" }));
  const setReject = vi.fn();
  return { message: { to, forward, setReject }, forward, setReject };
}

async function signedAddress(secret: string): Promise<string> {
  return createAddress({ service: "shop", domain: "example.com" }, await importSigningKey(secret));
}

describe("handleEmail", () => {
  it("forwards mail sent to a signed alias", async () => {
    const secret = generateSecret();
    const { message, forward, setReject } = fakeMessage(await signedAddress(secret));

    await handleEmail(message, { signingKey: secret, forwardTo: FORWARD_TO });

    expect(forward).toHaveBeenCalledWith(FORWARD_TO);
    expect(setReject).not.toHaveBeenCalled();
  });

  it("rejects an alias signed with another key", async () => {
    const { message, forward, setReject } = fakeMessage(await signedAddress(generateSecret()));

    await handleEmail(message, { signingKey: generateSecret(), forwardTo: FORWARD_TO });

    expect(setReject).toHaveBeenCalledWith("Unknown address");
    expect(forward).not.toHaveBeenCalled();
  });

  it("rejects a malformed address with the same reason", async () => {
    const { message, forward, setReject } = fakeMessage("info@example.com");

    await handleEmail(message, { signingKey: generateSecret(), forwardTo: FORWARD_TO });

    expect(setReject).toHaveBeenCalledWith("Unknown address");
    expect(forward).not.toHaveBeenCalled();
  });

  it("throws without touching the mail when the signing key is unusable", async () => {
    const { message, forward, setReject } = fakeMessage(await signedAddress(generateSecret()));

    await expect(handleEmail(message, { signingKey: "", forwardTo: FORWARD_TO })).rejects.toThrow();
    expect(forward).not.toHaveBeenCalled();
    expect(setReject).not.toHaveBeenCalled();
  });

  it("throws without touching the mail when the destination is missing", async () => {
    const secret = generateSecret();
    const { message, forward, setReject } = fakeMessage(await signedAddress(secret));

    await expect(handleEmail(message, { signingKey: secret, forwardTo: "" })).rejects.toThrow();
    expect(forward).not.toHaveBeenCalled();
    expect(setReject).not.toHaveBeenCalled();
  });
});
