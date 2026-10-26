import { describe, expect, it } from "vitest";

import { createAddress, importSigningKey, verifyAddress } from "../src/address.mts";

async function generateKey(): Promise<CryptoKey> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return importSigningKey(btoa(String.fromCharCode(...bytes)));
}

function changeFirstTagCharacter(address: string): string {
  const [local = "", domain = ""] = address.split("@");
  const [service, nonce, tag = ""] = local.split(".");
  const changed = (tag.startsWith("a") ? "b" : "a") + tag.slice(1);
  return `${service}.${nonce}.${changed}@${domain}`;
}

describe("alias addresses", () => {
  it("creates an address that verifies", async () => {
    const key = await generateKey();
    const address = await createAddress({ service: "shop", domain: "example.com" }, key);

    expect(address).toMatch(/^shop\.[a-z0-9]{4}\.[a-z0-9]{8}@example\.com$/);
    expect(await verifyAddress(address, key)).toBe(true);
  });

  it("varies the random part between addresses", async () => {
    const key = await generateKey();
    const target = { service: "shop", domain: "example.com" };

    expect(await createAddress(target, key)).not.toBe(await createAddress(target, key));
  });

  it("accepts the address in upper case or with surrounding spaces", async () => {
    const key = await generateKey();
    const address = await createAddress({ service: "shop", domain: "example.com" }, key);

    expect(await verifyAddress(` ${address.toUpperCase()} `, key)).toBe(true);
  });

  it("rejects a changed signature", async () => {
    const key = await generateKey();
    const address = await createAddress({ service: "shop", domain: "example.com" }, key);

    expect(await verifyAddress(changeFirstTagCharacter(address), key)).toBe(false);
  });

  it("rejects the same local part at another domain", async () => {
    const key = await generateKey();
    const address = await createAddress({ service: "shop", domain: "example.com" }, key);

    expect(await verifyAddress(address.replace("@example.com", "@example.net"), key)).toBe(false);
  });

  it("rejects an address signed with another key", async () => {
    const address = await createAddress(
      { service: "shop", domain: "example.com" },
      await generateKey(),
    );

    expect(await verifyAddress(address, await generateKey())).toBe(false);
  });

  it.each([
    "",
    "shop@example.com",
    "shop.abcd@example.com",
    "shop.abcd.1234567@example.com",
    "shop.abcd.123456789@example.com",
    "sh_op.abcd.12345678@example.com",
    "shop.abcd.12345678.x@example.com",
    "shop.abcd.12345678@localhost",
  ])("rejects the malformed address %j", async (address) => {
    expect(await verifyAddress(address, await generateKey())).toBe(false);
  });

  it.each(["", "Shop", "a.b", "x".repeat(33)])(
    "refuses to create an address for the service %j",
    async (service) => {
      const key = await generateKey();

      await expect(createAddress({ service, domain: "example.com" }, key)).rejects.toThrow(
        RangeError,
      );
    },
  );

  it("refuses a signing key that is not 32 bytes", async () => {
    await expect(importSigningKey(btoa("short"))).rejects.toThrow(RangeError);
  });
});
