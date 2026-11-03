import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CreateAliasResult } from "../shared/messages.mts";
import { addAliasButton, type AliasApi } from "./alias-field.mts";
import { DEFAULT_COLOUR, LABEL, type AliasIcon } from "./icon.mts";

const ALIAS = "shop.ab12.cd34ef56@example.com";
const visible = vi.hoisted(() => ({ value: true }));

// happy-dom has no IntersectionObserver v2; the e2e tests cover the real visibility check.
vi.mock("./visibility.mts", () => ({
  watchVisibility: () => ({ isVisible: () => visible.value, stop: () => undefined }),
}));

let attached: AliasIcon | undefined;

function api(overrides: Partial<AliasApi> = {}): AliasApi {
  return {
    listDomains: vi.fn(() => Promise.resolve(["example.com"])),
    requestAlias: vi.fn(() => Promise.resolve<CreateAliasResult>({ ok: true, email: ALIAS })),
    ...overrides,
  };
}

function setUp(aliasApi: AliasApi): { input: HTMLInputElement; icon: AliasIcon } {
  const input = document.createElement("input");
  input.type = "email";
  document.body.append(input);
  attached = addAliasButton(input, aliasApi);
  return { input, icon: attached };
}

/** happy-dom marks every dispatched event untrusted, so a real click is simulated this way. */
function trustedClick(target: HTMLElement): void {
  const event = new MouseEvent("click", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "isTrusted", { value: true });
  target.dispatchEvent(event);
}

function menuItems(icon: AliasIcon): HTMLButtonElement[] {
  const root = icon.button.getRootNode();
  return root instanceof ShadowRoot
    ? [...root.querySelectorAll<HTMLButtonElement>("[role=menuitem]")]
    : [];
}

beforeEach(() => {
  visible.value = true;
});

afterEach(() => {
  attached?.remove();
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe("addAliasButton with one domain", () => {
  it("fills the alias on a real click", async () => {
    const aliasApi = api();
    const { input, icon } = setUp(aliasApi);
    trustedClick(icon.button);
    await vi.waitFor(() => {
      expect(input.value).toBe(ALIAS);
    });
    expect(aliasApi.requestAlias).toHaveBeenCalledWith(null);
    expect(menuItems(icon)).toEqual([]);
  });

  it("ignores clicks a page script dispatches", async () => {
    const aliasApi = api();
    const { input, icon } = setUp(aliasApi);
    icon.button.click();
    await Promise.resolve();
    expect(aliasApi.listDomains).not.toHaveBeenCalled();
    expect(input.value).toBe("");
  });

  it("ignores real clicks while the button is hidden or covered", () => {
    visible.value = false;
    const aliasApi = api();
    const { icon } = setUp(aliasApi);
    trustedClick(icon.button);
    expect(aliasApi.listDomains).not.toHaveBeenCalled();
    expect(icon.button.title).toContain("hides or covers");
  });

  it("sends one request while one is in flight", async () => {
    const aliasApi = api({
      requestAlias: vi.fn(() => new Promise<CreateAliasResult>(() => undefined)),
    });
    const { icon } = setUp(aliasApi);
    trustedClick(icon.button);
    await vi.waitFor(() => {
      expect(aliasApi.requestAlias).toHaveBeenCalledTimes(1);
    });
    trustedClick(icon.button);
    await Promise.resolve();
    await Promise.resolve();
    expect(aliasApi.requestAlias).toHaveBeenCalledTimes(1);
  });

  it("shows the reason on the button, then restores it", async () => {
    vi.useFakeTimers();
    const { input, icon } = setUp(
      api({ requestAlias: () => Promise.resolve({ ok: false, reason: "unreachable" }) }),
    );
    trustedClick(icon.button);
    await vi.waitFor(() => {
      expect(icon.button.title).toContain("WARP");
    });
    expect(input.value).toBe("");
    vi.runAllTimers();
    expect(icon.button.title).toBe(LABEL);
  });

  it("returns to the normal colour after two failures in a row", async () => {
    vi.useFakeTimers();
    const { icon } = setUp(
      api({ requestAlias: () => Promise.resolve({ ok: false, reason: "failed" }) }),
    );
    trustedClick(icon.button);
    await vi.waitFor(() => {
      expect(icon.button.title).not.toBe(LABEL);
    });
    trustedClick(icon.button);
    await vi.waitFor(() => {
      expect(icon.button.title).not.toBe(LABEL);
    });
    vi.runAllTimers();
    expect(icon.button.style.color).toBe(DEFAULT_COLOUR);
  });

  it("keeps the button out of the page's reach", () => {
    const { icon } = setUp(api());
    expect(icon.button.getRootNode()).toBeInstanceOf(ShadowRoot);
    expect(document.querySelector("button")).toBeNull();
  });
});

function twoDomains(): AliasApi {
  return api({ listDomains: vi.fn(() => Promise.resolve(["example.com", "example.org"])) });
}

function menuLabels(icon: AliasIcon): (string | null)[] {
  return menuItems(icon).map((item) => item.textContent);
}

describe("addAliasButton with two or more domains", () => {
  it("lists the domains and creates nothing until one is chosen", async () => {
    const aliasApi = twoDomains();
    const { icon } = setUp(aliasApi);
    trustedClick(icon.button);
    await vi.waitFor(() => {
      expect(menuLabels(icon)).toEqual(["@example.com", "@example.org"]);
    });
    expect(aliasApi.requestAlias).not.toHaveBeenCalled();
  });

  it("creates the alias in the chosen domain and closes the list", async () => {
    const aliasApi = twoDomains();
    const { input, icon } = setUp(aliasApi);
    trustedClick(icon.button);
    await vi.waitFor(() => {
      expect(menuItems(icon)).toHaveLength(2);
    });
    trustedClick(menuItems(icon)[1] ?? icon.button);
    await vi.waitFor(() => {
      expect(input.value).toBe(ALIAS);
    });
    expect(aliasApi.requestAlias).toHaveBeenCalledWith("example.org");
    expect(icon.isMenuOpen()).toBe(false);
  });

  it("ignores a choice a page script dispatches", async () => {
    const aliasApi = twoDomains();
    const { icon } = setUp(aliasApi);
    trustedClick(icon.button);
    await vi.waitFor(() => {
      expect(menuItems(icon)).toHaveLength(2);
    });
    menuItems(icon)[0]?.click();
    expect(aliasApi.requestAlias).not.toHaveBeenCalled();
  });

  it("ignores a choice while the list is hidden or covered", async () => {
    const aliasApi = twoDomains();
    const { icon } = setUp(aliasApi);
    trustedClick(icon.button);
    await vi.waitFor(() => {
      expect(menuItems(icon)).toHaveLength(2);
    });
    visible.value = false;
    trustedClick(menuItems(icon)[0] ?? icon.button);
    expect(aliasApi.requestAlias).not.toHaveBeenCalled();
    expect(icon.button.title).toContain("hides or covers");
  });

  it("closes the list on a second click of the button", async () => {
    const { icon } = setUp(twoDomains());
    trustedClick(icon.button);
    await vi.waitFor(() => {
      expect(icon.isMenuOpen()).toBe(true);
    });
    trustedClick(icon.button);
    expect(icon.isMenuOpen()).toBe(false);
  });

  it("closes the list on Escape", async () => {
    const { icon } = setUp(twoDomains());
    trustedClick(icon.button);
    await vi.waitFor(() => {
      expect(icon.isMenuOpen()).toBe(true);
    });
    const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true });
    Object.defineProperty(escape, "isTrusted", { value: true });
    menuItems(icon)[0]?.dispatchEvent(escape);
    expect(icon.isMenuOpen()).toBe(false);
  });

  it("closes the list when the page is clicked elsewhere", async () => {
    const { icon } = setUp(twoDomains());
    trustedClick(icon.button);
    await vi.waitFor(() => {
      expect(icon.isMenuOpen()).toBe(true);
    });
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, composed: true }));
    expect(icon.isMenuOpen()).toBe(false);
  });

  it("marks the button as owning an open list", async () => {
    const { icon } = setUp(twoDomains());
    trustedClick(icon.button);
    await vi.waitFor(() => {
      expect(icon.button.getAttribute("aria-expanded")).toBe("true");
    });
    expect(icon.button.getAttribute("aria-haspopup")).toBe("menu");
    trustedClick(icon.button);
    expect(icon.button.getAttribute("aria-expanded")).toBe("false");
  });

  it("closes the list when the focus leaves it", async () => {
    const { icon } = setUp(twoDomains());
    trustedClick(icon.button);
    await vi.waitFor(() => {
      expect(icon.isMenuOpen()).toBe(true);
    });
    const leave = new FocusEvent("focusout", { bubbles: true, relatedTarget: document.body });
    menuItems(icon)[0]?.dispatchEvent(leave);
    expect(icon.isMenuOpen()).toBe(false);
  });
});
