import { describe, expect, it, vi } from "vitest";

import {
  removeOrigin,
  removeSaved,
  saveFromForm,
  type HostPermissions,
  type SettingsStore,
} from "./settings-form.mts";

const COM = "https://email-alias-api.example.com";
const ORG = "https://email-alias-api.example.org";
const OTHER_COM = "https://other-api.example.com";
const TOKEN_INPUT = JSON.stringify({
  "cf-access-client-id": "0123abcd.access",
  "cf-access-client-secret": "cfast_secret",
});
const TOKEN = { clientId: "0123abcd.access", clientSecret: "cfast_secret" };

/** The store and the permissions keep their state, as storage.local and Chrome do. */
function fakes(initial: string[] = []): {
  store: SettingsStore;
  permissions: HostPermissions;
  granted: Set<string>;
} {
  let saved = initial;
  const granted = new Set(initial.map((origin) => `${origin}/*`));
  return {
    granted,
    store: {
      readOrigins: vi.fn(() => Promise.resolve(saved)),
      saveOrigins: vi.fn((origins: string[]) => {
        saved = origins;
        return Promise.resolve();
      }),
      saveToken: vi.fn(() => Promise.resolve()),
      remove: vi.fn(() => {
        saved = [];
        return Promise.resolve();
      }),
    },
    permissions: {
      request: vi.fn((pattern: string) => {
        granted.add(pattern);
        return Promise.resolve(true);
      }),
      revoke: vi.fn((pattern: string) => {
        granted.delete(pattern);
        return Promise.resolve();
      }),
      granted: vi.fn(() => Promise.resolve([...granted])),
    },
  };
}

describe("saveFromForm", () => {
  it("saves the first URL and the token, asking for that origin only", async () => {
    const deps = fakes();
    expect(await saveFromForm({ url: COM, token: TOKEN_INPUT, shown: [] }, deps)).toBe("saved");
    expect(deps.permissions.request).toHaveBeenCalledWith(`${COM}/*`);
    expect(deps.store.saveOrigins).toHaveBeenCalledWith([COM]);
    expect(deps.store.saveToken).toHaveBeenCalledWith(TOKEN);
    expect([...deps.granted]).toEqual([`${COM}/*`]);
  });

  it("adds a URL after the saved ones and leaves the token alone", async () => {
    const deps = fakes([COM]);
    expect(await saveFromForm({ url: ORG, token: null, shown: [COM] }, deps)).toBe("saved");
    expect(deps.store.saveOrigins).toHaveBeenCalledWith([COM, ORG]);
    expect(deps.store.saveToken).not.toHaveBeenCalled();
    expect(deps.permissions.revoke).not.toHaveBeenCalled();
  });

  it("replaces the token without asking for access", async () => {
    const deps = fakes([COM]);
    expect(await saveFromForm({ url: null, token: TOKEN_INPUT, shown: [COM] }, deps)).toBe("saved");
    expect(deps.store.saveToken).toHaveBeenCalledWith(TOKEN);
    expect(deps.store.saveOrigins).not.toHaveBeenCalled();
    expect(deps.permissions.request).not.toHaveBeenCalled();
  });

  it("asks for permission before any other asynchronous step, while the click still counts", async () => {
    const deps = fakes();
    await saveFromForm({ url: COM, token: TOKEN_INPUT, shown: [] }, deps);
    const requestOrder =
      vi.mocked(deps.permissions.request).mock.invocationCallOrder[0] ?? Infinity;
    const readOrder = vi.mocked(deps.store.readOrigins).mock.invocationCallOrder[0] ?? -Infinity;
    expect(requestOrder).toBeLessThan(readOrder);
  });

  it("refuses a second URL for a domain already shown, before asking for access", async () => {
    const deps = fakes([COM]);
    expect(await saveFromForm({ url: OTHER_COM, token: null, shown: [COM] }, deps)).toBe(
      "duplicate-domain",
    );
    expect(deps.permissions.request).not.toHaveBeenCalled();
  });

  it("withdraws the new access when another tab saved the domain since the page loaded", async () => {
    const deps = fakes([COM]);
    expect(await saveFromForm({ url: OTHER_COM, token: null, shown: [] }, deps)).toBe(
      "duplicate-domain",
    );
    expect(deps.store.saveOrigins).not.toHaveBeenCalled();
    expect(deps.permissions.revoke).toHaveBeenCalledWith(`${OTHER_COM}/*`);
    expect([...deps.granted]).toEqual([`${COM}/*`]);
  });

  it.each([
    ["invalid-url", { url: "http://email-alias-api.example.com", token: TOKEN_INPUT }],
    ["invalid-token", { url: COM, token: "secret" }],
  ] as const)("returns %s and asks for nothing", async (outcome, fields) => {
    const deps = fakes();
    expect(await saveFromForm({ ...fields, shown: [] }, deps)).toBe(outcome);
    expect(deps.permissions.request).not.toHaveBeenCalled();
    expect(deps.store.saveOrigins).not.toHaveBeenCalled();
    expect(deps.store.saveToken).not.toHaveBeenCalled();
  });

  it("saves nothing when access is denied", async () => {
    const deps = fakes();
    vi.mocked(deps.permissions.request).mockResolvedValue(false);
    expect(await saveFromForm({ url: COM, token: TOKEN_INPUT, shown: [] }, deps)).toBe(
      "permission-denied",
    );
    expect(deps.store.saveOrigins).not.toHaveBeenCalled();
    expect(deps.store.saveToken).not.toHaveBeenCalled();
  });

  it("withdraws the new access when saving fails", async () => {
    const deps = fakes([ORG]);
    vi.mocked(deps.store.saveOrigins).mockRejectedValue(new Error("quota"));
    await expect(saveFromForm({ url: COM, token: null, shown: [ORG] }, deps)).rejects.toThrow(
      "quota",
    );
    expect(deps.permissions.revoke).toHaveBeenCalledWith(`${COM}/*`);
    expect(deps.permissions.revoke).not.toHaveBeenCalledWith(`${ORG}/*`);
  });
});

describe("removeOrigin", () => {
  it("keeps the other URLs and revokes access to the removed one only", async () => {
    const deps = fakes([COM, ORG]);
    await removeOrigin(COM, deps);
    expect(deps.store.saveOrigins).toHaveBeenCalledWith([ORG]);
    expect(deps.permissions.revoke).toHaveBeenCalledTimes(1);
    expect(deps.permissions.revoke).toHaveBeenCalledWith(`${COM}/*`);
  });

  it("also withdraws access that an earlier save left behind", async () => {
    const deps = fakes([COM, ORG]);
    deps.granted.add(`${OTHER_COM}/*`);
    await removeOrigin(COM, deps);
    expect([...deps.granted]).toEqual([`${ORG}/*`]);
  });
});

describe("removeSaved", () => {
  it("deletes the settings and revokes access to every URL", async () => {
    const deps = fakes([COM, ORG]);
    await removeSaved(deps);
    expect(deps.store.remove).toHaveBeenCalled();
    expect([...deps.granted]).toEqual([]);
  });

  it("keeps revoking after Chrome refuses one, then reports the refusal", async () => {
    const deps = fakes([COM, ORG]);
    vi.mocked(deps.permissions.revoke).mockRejectedValueOnce(new Error("refused"));
    await expect(removeSaved(deps)).rejects.toThrow("refused");
    expect(deps.permissions.revoke).toHaveBeenCalledWith(`${COM}/*`);
    expect(deps.permissions.revoke).toHaveBeenCalledWith(`${ORG}/*`);
  });
});
