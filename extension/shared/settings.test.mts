import { describe, expect, it } from "vitest";

import { aliasDomainOf, isServiceToken, parseApiOrigin, parseServiceToken } from "./settings.mts";

const CLIENT_ID = "0123abcd.access";
const CLIENT_SECRET = "cfast_secret";

describe("parseApiOrigin", () => {
  it.each([
    ["https://email-alias-api.example.com", "https://email-alias-api.example.com"],
    ["  https://email-alias-api.example.com/ ", "https://email-alias-api.example.com"],
    ["https://EMAIL-ALIAS-API.Example.com", "https://email-alias-api.example.com"],
  ])("accepts %j", (input, origin) => {
    expect(parseApiOrigin(input)).toBe(origin);
  });

  it.each([
    "http://email-alias-api.example.com",
    "https://email-alias-api.example.com/api",
    "https://email-alias-api.example.com/?a=1",
    "https://email-alias-api.example.com/#a",
    `https://${["user", crypto.randomUUID()].join(":")}@email-alias-api.example.com`,
    "https://example",
    "https://com",
    "not a url",
    "",
  ])("rejects %j", (input) => {
    expect(parseApiOrigin(input)).toBeNull();
  });
});

describe("aliasDomainOf", () => {
  it("drops the first label", () => {
    expect(aliasDomainOf("email-alias-api.example.co.jp")).toBe("example.co.jp");
  });

  it("rejects a hostname without a parent domain", () => {
    expect(aliasDomainOf("example.com")).toBeNull();
  });
});

describe("parseServiceToken", () => {
  it("reads the output of pnpm run service-token", () => {
    const input = JSON.stringify({
      "cf-access-client-id": CLIENT_ID,
      "cf-access-client-secret": CLIENT_SECRET,
    });
    expect(parseServiceToken(input)).toEqual({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET });
  });

  it.each([
    ["missing secret", JSON.stringify({ "cf-access-client-id": CLIENT_ID })],
    [
      "id without .access",
      JSON.stringify({ "cf-access-client-id": "0123", "cf-access-client-secret": CLIENT_SECRET }),
    ],
    [
      "secret with a header break",
      JSON.stringify({ "cf-access-client-id": CLIENT_ID, "cf-access-client-secret": "a\r\nb" }),
    ],
    [
      "non-string secret",
      JSON.stringify({ "cf-access-client-id": CLIENT_ID, "cf-access-client-secret": 1 }),
    ],
    ["array", "[]"],
    ["not JSON", "cf-access-client-id"],
  ])("rejects %s", (_case, input) => {
    expect(parseServiceToken(input)).toBeNull();
  });
});

describe("isServiceToken", () => {
  it("rejects values read back from storage in another shape", () => {
    expect(isServiceToken({ clientId: CLIENT_ID })).toBe(false);
    expect(isServiceToken("token")).toBe(false);
  });
});
