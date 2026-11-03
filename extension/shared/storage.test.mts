import { beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { fakeBrowser } from "wxt/testing/fake-browser";

import { API_ORIGINS_KEY, SERVICE_TOKEN_KEY } from "./settings.mts";
import {
  readOrigins,
  readSettings,
  readToken,
  removeSettings,
  saveOrigins,
  saveToken,
} from "./storage.mts";

const COM = "https://email-alias-api.example.com";
const ORG = "https://email-alias-api.example.org";
const ORIGINS = [COM, ORG];
const TOKEN = { clientId: "0123abcd.access", clientSecret: "cfast_secret" };

const setAccessLevel = vi.fn((_options: { accessLevel: string }) => Promise.resolve());

beforeEach(() => {
  fakeBrowser.reset();
  setAccessLevel.mockClear();
  setAccessLevel.mockImplementation(() => Promise.resolve());
  // The fake browser does not implement access levels.
  vi.spyOn(browser.storage.local, "setAccessLevel").mockImplementation(setAccessLevel);
});

describe("saveToken and saveOrigins", () => {
  it.each([
    ["saveToken", () => saveToken(TOKEN)],
    ["saveOrigins", () => saveOrigins(ORIGINS)],
  ])("%s restricts local storage to the extension before writing", async (_case, save) => {
    const set = vi.spyOn(browser.storage.local, "set");
    await save();
    expect(setAccessLevel).toHaveBeenCalledWith({ accessLevel: "TRUSTED_CONTEXTS" });
    expect(setAccessLevel.mock.invocationCallOrder[0]).toBeLessThan(
      set.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("does not write the token when the restriction fails", async () => {
    setAccessLevel.mockImplementation(() => Promise.reject(new Error("denied")));
    await expect(saveToken(TOKEN)).rejects.toThrow("denied");
    expect(await browser.storage.local.get(SERVICE_TOKEN_KEY)).toEqual({});
  });
});

describe("readSettings", () => {
  it("returns the token with every origin, in order", async () => {
    await saveOrigins(ORIGINS);
    await saveToken(TOKEN);
    expect(await readSettings()).toEqual({ origins: ORIGINS, token: TOKEN });
  });

  it.each<[string, Record<string, unknown>]>([
    ["no settings", {}],
    ["no origins", { [API_ORIGINS_KEY]: [], [SERVICE_TOKEN_KEY]: TOKEN }],
    ["no token", { [API_ORIGINS_KEY]: ORIGINS }],
    ["a malformed token", { [API_ORIGINS_KEY]: ORIGINS, [SERVICE_TOKEN_KEY]: "token" }],
  ])("returns null for %s", async (_case, stored) => {
    await browser.storage.local.set(stored);
    expect(await readSettings()).toBeNull();
  });
});

describe("readOrigins", () => {
  it("drops entries that are not API origins", async () => {
    await browser.storage.local.set({
      [API_ORIGINS_KEY]: [COM, `${ORG}/x`, 1, "http://email-alias-api.example.net"],
    });
    expect(await readOrigins()).toEqual([COM]);
  });

  it("reads the origins even without a token, so their access can still be revoked", async () => {
    await browser.storage.local.set({ [API_ORIGINS_KEY]: ORIGINS, [SERVICE_TOKEN_KEY]: 1 });
    expect(await readOrigins()).toEqual(ORIGINS);
    expect(await readToken()).toBeNull();
  });

  it("reads nothing from a value that is not a list", async () => {
    await browser.storage.local.set({ [API_ORIGINS_KEY]: COM });
    expect(await readOrigins()).toEqual([]);
  });
});

describe("removeSettings", () => {
  it("deletes both values", async () => {
    await saveOrigins(ORIGINS);
    await saveToken(TOKEN);
    await removeSettings();
    expect(await browser.storage.local.get(null)).toEqual({});
  });
});
