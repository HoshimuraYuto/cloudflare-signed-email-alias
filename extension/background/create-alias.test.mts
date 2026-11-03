import { describe, expect, it, vi } from "vitest";

import type { ExtensionSettings } from "../shared/settings.mts";
import {
  createAliasFor,
  listDomainsFor,
  originFor,
  senderSite,
  type CreateAliasDependencies,
  type Sender,
} from "./create-alias.mts";

const EXTENSION_ID = "extension-id";
const COM = "https://email-alias-api.example.com";
const ORG = "https://email-alias-api.example.org";
const SETTINGS: ExtensionSettings = {
  origins: [COM],
  token: { clientId: "0123abcd.access", clientSecret: "cfast_secret" },
};
const TWO_DOMAINS: ExtensionSettings = { ...SETTINGS, origins: [COM, ORG] };
const TAB = { id: 1 };
const PAGE_SENDER: Sender = {
  id: EXTENSION_ID,
  url: "https://shop.example.net/signup",
  tab: TAB,
};

/** What fetch returns for a redirect with redirect: "manual"; Response cannot construct one. */
function redirectResponse(): Response {
  const response = new Response(null, { status: 200 });
  Object.defineProperty(response, "type", { value: "opaqueredirect" });
  Object.defineProperty(response, "status", { value: 0 });
  return response;
}

function dependencies(overrides: Partial<CreateAliasDependencies> = {}): CreateAliasDependencies {
  return {
    extensionId: EXTENSION_ID,
    readSettings: () => Promise.resolve(SETTINGS),
    hasHostPermission: () => Promise.resolve(true),
    fetch: vi.fn<typeof fetch>(() =>
      Promise.resolve(
        Response.json({ data: { email: "shop.ab12.cd34ef56@example.com" } }, { status: 201 }),
      ),
    ),
    ...overrides,
  };
}

describe("createAliasFor", () => {
  it("posts the sender's site with the service token in Authorization", async () => {
    const deps = dependencies();
    const result = await createAliasFor({ sender: PAGE_SENDER, domain: null }, deps);

    expect(result).toEqual({ ok: true, email: "shop.ab12.cd34ef56@example.com" });
    const [url, init] = vi.mocked(deps.fetch).mock.calls[0] ?? [];
    expect(url).toBe("https://email-alias-api.example.com/api/v1/aliases");
    expect(init?.method).toBe("POST");
    expect(init?.redirect).toBe("manual");
    expect(init?.credentials).toBe("omit");
    expect(JSON.parse(typeof init?.body === "string" ? init.body : "")).toEqual({
      domain: "example.com",
      description: "shop.example.net",
    });
    expect(JSON.parse(new Headers(init?.headers).get("Authorization") ?? "")).toEqual({
      "cf-access-client-id": "0123abcd.access",
      "cf-access-client-secret": "cfast_secret",
    });
  });

  it.each([
    ["no settings", { readSettings: () => Promise.resolve(null) }, "not-configured"],
    ["no host permission", { hasHostPermission: () => Promise.resolve(false) }, "no-permission"],
    ["a network error", { fetch: () => Promise.reject(new TypeError("offline")) }, "unreachable"],
    [
      "403 from Access",
      { fetch: () => Promise.resolve(new Response(null, { status: 403 })) },
      "refused",
    ],
    ["401", { fetch: () => Promise.resolve(new Response(null, { status: 401 })) }, "refused"],
    ["500", { fetch: () => Promise.resolve(new Response(null, { status: 500 })) }, "failed"],
    [
      "a redirect, such as an Access login page",
      { fetch: () => Promise.resolve(redirectResponse()) },
      "refused",
    ],
    [
      "200 instead of 201",
      { fetch: () => Promise.resolve(Response.json({ data: { email: "a@example.com" } })) },
      "failed",
    ],
    [
      "a body without data.email",
      { fetch: () => Promise.resolve(Response.json({ data: {} }, { status: 201 })) },
      "failed",
    ],
    [
      "a body that is not JSON",
      { fetch: () => Promise.resolve(new Response("<html>", { status: 201 })) },
      "failed",
    ],
    [
      "an address in another domain",
      {
        fetch: () =>
          Promise.resolve(Response.json({ data: { email: "a@example.org" } }, { status: 201 })),
      },
      "failed",
    ],
    [
      "an address with markup",
      {
        fetch: () =>
          Promise.resolve(Response.json({ data: { email: "<b>@example.com" } }, { status: 201 })),
      },
      "failed",
    ],
  ] as const)("reports %s", async (_case, overrides, reason) => {
    expect(
      await createAliasFor({ sender: PAGE_SENDER, domain: null }, dependencies(overrides)),
    ).toEqual({ ok: false, reason });
  });

  it("sends nothing when the sender is not a page of this extension", async () => {
    const deps = dependencies();
    const result = await createAliasFor(
      { sender: { ...PAGE_SENDER, id: "other-extension" }, domain: null },
      deps,
    );
    expect(result).toEqual({ ok: false, reason: "failed" });
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  it("posts to the API of the chosen domain", async () => {
    const deps = dependencies({
      readSettings: () => Promise.resolve(TWO_DOMAINS),
      fetch: vi.fn<typeof fetch>(() =>
        Promise.resolve(
          Response.json({ data: { email: "shop.ab.cd@example.org" } }, { status: 201 }),
        ),
      ),
    });
    const result = await createAliasFor({ sender: PAGE_SENDER, domain: "example.org" }, deps);

    expect(result).toEqual({ ok: true, email: "shop.ab.cd@example.org" });
    const [url, init] = vi.mocked(deps.fetch).mock.calls[0] ?? [];
    expect(url).toBe(`${ORG}/api/v1/aliases`);
    expect(JSON.parse(typeof init?.body === "string" ? init.body : "")).toMatchObject({
      domain: "example.org",
    });
  });

  it.each([
    ["a domain that is not saved", TWO_DOMAINS, "evil.example"],
    ["no domain while two are saved", TWO_DOMAINS, null],
  ])("sends the token nowhere for %s", async (_case, settings, domain) => {
    const deps = dependencies({ readSettings: () => Promise.resolve(settings) });
    const result = await createAliasFor({ sender: PAGE_SENDER, domain }, deps);
    expect(result).toEqual({ ok: false, reason: "failed" });
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  it("checks access to the chosen origin, not another", async () => {
    const hasHostPermission = vi.fn((origin: string) => Promise.resolve(origin === COM));
    const deps = dependencies({
      readSettings: () => Promise.resolve(TWO_DOMAINS),
      hasHostPermission,
    });
    const result = await createAliasFor({ sender: PAGE_SENDER, domain: "example.org" }, deps);
    expect(result).toEqual({ ok: false, reason: "no-permission" });
    expect(hasHostPermission).toHaveBeenCalledWith(ORG);
  });
});

describe("listDomainsFor", () => {
  it("lists the saved domains in order", async () => {
    const deps = dependencies({ readSettings: () => Promise.resolve(TWO_DOMAINS) });
    expect(await listDomainsFor(PAGE_SENDER, deps)).toEqual(["example.com", "example.org"]);
  });

  it("lists nothing to a sender that is not a page of this extension", async () => {
    const deps = dependencies({ readSettings: () => Promise.resolve(TWO_DOMAINS) });
    expect(await listDomainsFor({ ...PAGE_SENDER, id: "other" }, deps)).toEqual([]);
  });

  it("lists nothing when nothing is set up", async () => {
    const deps = dependencies({ readSettings: () => Promise.resolve(null) });
    expect(await listDomainsFor(PAGE_SENDER, deps)).toEqual([]);
  });
});

describe("originFor", () => {
  it("takes the only origin when no domain is given", () => {
    expect(originFor([COM], null)).toBe(COM);
  });

  it("finds the origin of a domain", () => {
    expect(originFor([COM, ORG], "example.org")).toBe(ORG);
  });

  it("does not match a domain by its suffix", () => {
    expect(originFor([COM], "ple.com")).toBeNull();
  });
});

describe("senderSite", () => {
  it("takes the hostname of the frame that sent the message", () => {
    expect(
      senderSite({ ...PAGE_SENDER, url: "https://login.example.net:8443/a?b" }, EXTENSION_ID),
    ).toBe("login.example.net");
  });

  it.each<[string, Sender]>([
    ["another extension", { ...PAGE_SENDER, id: "other" }],
    [
      "an extension page (no tab)",
      { id: EXTENSION_ID, url: `chrome-extension://${EXTENSION_ID}/options.html` },
    ],
    ["a non-web frame", { ...PAGE_SENDER, url: "file:///tmp/form.html" }],
    ["no url", { id: EXTENSION_ID, tab: TAB }],
  ])("rejects %s", (_case, sender) => {
    expect(senderSite(sender, EXTENSION_ID)).toBeNull();
  });
});
