import { generateKeyPair } from "jose";
import { http, HttpResponse } from "msw";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { isFromAccess } from "../src/access.mts";
import { createFakeAccess } from "./fake-access.mts";

const settings = {
  teamDomain: "team.example.com",
  audience: crypto.randomUUID(),
  clientId: `${crypto.randomUUID()}.access`,
};
const access = await createFakeAccess(settings.teamDomain);
const validClaims = {
  iss: `https://${settings.teamDomain}`,
  aud: [settings.audience],
  common_name: settings.clientId,
};

function requestWith(token?: string): Request {
  const headers = token === undefined ? {} : { "Cf-Access-Jwt-Assertion": token };
  return new Request("https://alias.example.com/api/v1/aliases", { method: "POST", headers });
}

beforeAll(() => access.network.enable());
afterEach(() => access.network.resetHandlers());
afterAll(() => access.network.disable());

describe("isFromAccess", () => {
  it("accepts a token Access issued to the allowed service token", async () => {
    const token = await access.sign(validClaims);
    expect(await isFromAccess(requestWith(token), settings)).toBe(true);
  });

  it("refuses a request without the Access header", async () => {
    expect(await isFromAccess(requestWith(), settings)).toBe(false);
  });

  it.each([
    ["another audience", { aud: [crypto.randomUUID()] }],
    ["another issuer", { iss: "https://other.example.com" }],
    ["another service token", { common_name: `${crypto.randomUUID()}.access` }],
    ["a user login", { common_name: undefined, email: "someone@example.com" }],
  ])("refuses a token for %s", async (_case, override) => {
    const token = await access.sign({ ...validClaims, ...override });
    expect(await isFromAccess(requestWith(token), settings)).toBe(false);
  });

  it("refuses an expired token", async () => {
    const token = await access.sign(validClaims, { expiresIn: "-1m" });
    expect(await isFromAccess(requestWith(token), settings)).toBe(false);
  });

  it("refuses a token signed with a key Access does not publish", async () => {
    const { privateKey } = await generateKeyPair("RS256");
    const token = await access.sign(validClaims, { key: privateKey });
    expect(await isFromAccess(requestWith(token), settings)).toBe(false);
  });

  it("refuses a malformed token", async () => {
    expect(await isFromAccess(requestWith("not-a-jwt"), settings)).toBe(false);
  });

  it("throws when the settings are incomplete", async () => {
    const token = await access.sign(validClaims);
    await expect(isFromAccess(requestWith(token), { ...settings, clientId: "" })).rejects.toThrow();
  });

  it("throws when the Access certs cannot be fetched", async () => {
    access.network.use(
      http.get("https://down.example.com/cdn-cgi/access/certs", () =>
        HttpResponse.text("unavailable", { status: 503 }),
      ),
    );
    const token = await access.sign({ ...validClaims, iss: "https://down.example.com" });
    const down = { ...settings, teamDomain: "down.example.com" };
    await expect(isFromAccess(requestWith(token), down)).rejects.toThrow();
  });
});
