import {
  chromium,
  expect,
  test as base,
  type BrowserContext,
  type Page,
  type Worker,
} from "@playwright/test";

import { E2E_API_ORIGIN, E2E_SECOND_API_ORIGIN } from "../wxt.config.mts";

const EXTENSION_PATH = new URL("../.output/chrome-mv3-e2e", import.meta.url).pathname;
const SITE = "https://shop.example.net";
const ALIAS = "shop.ab12.cd34ef56@example.com";
const TOKEN = { clientId: "0123abcd.access", clientSecret: "cfast_secret" };
const SIGNUP_PAGE = `<!doctype html><form><input type="email" name="email" style="width:240px;height:32px"></form>`;
/** The content script adds the button's host as the only other child of body. */
const BUTTON_HOST = "body > div";

interface Fixtures {
  context: BrowserContext;
  worker: Worker;
  page: Page;
}

const test = base.extend<Fixtures>({
  context: async ({ headless }, use) => {
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      headless,
      args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
    });
    await context.route(`${SITE}/**`, (route) =>
      route.fulfill({ contentType: "text/html", body: SIGNUP_PAGE }),
    );
    await use(context);
    await context.close();
  },
  worker: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
    await use(worker);
  },
  page: async ({ context, worker }, use) => {
    await saveOnOptionsPage(context, worker);
    const page = await context.newPage();
    await page.goto(`${SITE}/signup`);
    await page.locator(BUTTON_HOST).waitFor({ state: "visible" });
    await use(page);
  },
});

function optionsUrl(worker: Worker): string {
  return `chrome-extension://${new URL(worker.url()).host}/options.html`;
}

async function saveOnOptionsPage(context: BrowserContext, worker: Worker): Promise<void> {
  const options = await context.newPage();
  await options.goto(optionsUrl(worker));
  await options.fill("#api-url", E2E_API_ORIGIN);
  await options.fill(
    "#service-token",
    JSON.stringify({
      "cf-access-client-id": TOKEN.clientId,
      "cf-access-client-secret": TOKEN.clientSecret,
    }),
  );
  await options.click("button[type=submit]");
  await expect(options.locator("#status")).toHaveText("Saved.");
  await expect(options.locator("#origins li span")).toHaveText([E2E_API_ORIGIN]);
  await expect(options.locator("#saved-token")).toHaveText(
    `Stored (client ID ending ${TOKEN.clientId.slice(0, -".access".length).slice(-6)})`,
  );
  await expect(options.locator("#settings")).toBeHidden();
  await options.reload();
  await expect(options.locator("#origins li span")).toHaveText([E2E_API_ORIGIN]);
  await options.close();
}

async function addSecondOrigin(context: BrowserContext, worker: Worker): Promise<void> {
  const options = await context.newPage();
  await options.goto(optionsUrl(worker));
  await options.click("#add-origin");
  await expect(options.locator("#token-group")).toBeHidden();
  await options.fill("#api-url", E2E_SECOND_API_ORIGIN);
  await options.click("button[type=submit]");
  await expect(options.locator("#origins li span")).toHaveText([
    E2E_API_ORIGIN,
    E2E_SECOND_API_ORIGIN,
  ]);
  await options.close();
}

/** Labels of the domain list, read through CDP because the list is in a closed shadow root. */
async function menuLabels(context: BrowserContext, page: Page): Promise<string[]> {
  const session = await context.newCDPSession(page);
  const { root } = await session.send("DOM.getDocument", { depth: -1, pierce: true });
  const labels: string[] = [];
  const walk = (node: typeof root): void => {
    const attributes = node.attributes ?? [];
    const role = attributes.indexOf("role");
    if (role >= 0 && attributes[role + 1] === "menuitem") {
      labels.push(node.children?.[0]?.nodeValue ?? "");
    }
    for (const child of [...(node.children ?? []), ...(node.shadowRoots ?? [])]) {
      walk(child);
    }
  };
  walk(root);
  await session.detach();
  return labels;
}

/** Bottom edge of the domain list in CSS pixels, read through CDP (closed shadow root). */
async function menuBottom(context: BrowserContext, page: Page): Promise<number> {
  const session = await context.newCDPSession(page);
  const { root } = await session.send("DOM.getDocument", { depth: -1, pierce: true });
  const find = (node: typeof root): typeof root | undefined => {
    const attributes = node.attributes ?? [];
    const role = attributes.indexOf("role");
    if (role >= 0 && attributes[role + 1] === "menu") {
      return node;
    }
    return [...(node.children ?? []), ...(node.shadowRoots ?? [])].map(find).find(Boolean);
  };
  const menu = find(root);
  const { model } = await session.send("DOM.getBoxModel", { nodeId: menu?.nodeId ?? 0 });
  await session.detach();
  return Math.max(...model.border.filter((_value, index) => index % 2 === 1));
}

/** Opens the list with a real click and waits until Chrome reports it visible. */
async function openDomainList(
  context: BrowserContext,
  page: Page,
  path = "/signup",
): Promise<void> {
  await page.goto(`${SITE}${path}`);
  await page.locator(BUTTON_HOST).waitFor({ state: "visible" });
  await page.locator(BUTTON_HOST).click();
  await expect.poll(() => menuLabels(context, page)).toEqual(["@example.com", "@example.org"]);
  // The visibility check reports after its shortest delay (100 ms).
  await page.waitForTimeout(300);
}

async function countApiRequests(
  context: BrowserContext,
  status: number,
): Promise<{ count: number }> {
  const seen = { count: 0 };
  await context.route(`${E2E_API_ORIGIN}/**`, async (route) => {
    seen.count += 1;
    await route.fulfill(status === 201 ? { status, json: { data: { email: ALIAS } } } : { status });
  });
  return seen;
}

test("fills an alias created for the page's site", async ({ context, page }) => {
  const requests: { authorization: string | null; body: unknown; method: string }[] = [];
  await context.route(`${E2E_API_ORIGIN}/**`, async (route) => {
    const request = route.request();
    requests.push({
      method: request.method(),
      authorization: await request.headerValue("authorization"),
      body: request.postDataJSON(),
    });
    await route.fulfill({ status: 201, json: { data: { email: ALIAS } } });
  });

  await page.locator(BUTTON_HOST).click();

  await expect(page.locator("input[name=email]")).toHaveValue(ALIAS);
  expect(requests).toEqual([
    {
      method: "POST",
      authorization: JSON.stringify({
        "cf-access-client-id": TOKEN.clientId,
        "cf-access-client-secret": TOKEN.clientSecret,
      }),
      body: { domain: "example.com", description: "shop.example.net" },
    },
  ]);
});

test("content scripts cannot read the stored token", async ({ context, page }) => {
  const session = await context.newCDPSession(page);
  const contentScriptWorlds: number[] = [];
  session.on("Runtime.executionContextCreated", ({ context: created }) => {
    // Playwright adds its own isolated world; the extension's carries the extension origin.
    if (created.origin.startsWith("chrome-extension://")) {
      contentScriptWorlds.push(created.id);
    }
  });
  await session.send("Runtime.enable");
  expect(contentScriptWorlds).toHaveLength(1);

  const { result } = await session.send("Runtime.evaluate", {
    contextId: contentScriptWorlds[0] ?? 0,
    awaitPromise: true,
    returnByValue: true,
    expression: "chrome.storage.local.get(null).then(() => 'readable', (error) => String(error))",
  });
  expect(result.value).toMatch(/access/i);
});

test("page scripts cannot reach the button", async ({ page }) => {
  const reachable = await page.evaluate(
    (selector) => document.querySelector(selector)?.shadowRoot !== null,
    BUTTON_HOST,
  );
  expect(reachable).toBe(false);
});

test("a real click on a button the page made transparent does nothing", async ({
  context,
  page,
}) => {
  const seen = await countApiRequests(context, 201);
  await page.addStyleTag({ content: `${BUTTON_HOST} { opacity: 0 !important; }` });
  await page.waitForTimeout(300);
  await page.locator(BUTTON_HOST).click({ force: true });
  await page.waitForTimeout(500);

  expect(seen.count).toBe(0);
  await expect(page.locator("input[name=email]")).toHaveValue("");
});

test("a real click through a decoy covering the button does nothing", async ({ context, page }) => {
  const seen = await countApiRequests(context, 201);
  await page.evaluate((selector) => {
    const box = document.querySelector(selector)?.getBoundingClientRect();
    const decoy = document.createElement("div");
    decoy.style.cssText = `position:fixed;left:${box?.left}px;top:${box?.top}px;width:40px;height:40px;background:white;pointer-events:none;z-index:2147483647`;
    document.documentElement.append(decoy);
  }, BUTTON_HOST);
  await page.waitForTimeout(300);
  await page.locator(BUTTON_HOST).click({ force: true });
  await page.waitForTimeout(500);

  expect(seen.count).toBe(0);
  await expect(page.locator("input[name=email]")).toHaveValue("");
});

test("leaves the field empty when Access refuses", async ({ context, page }) => {
  const seen = await countApiRequests(context, 403);
  await page.locator(BUTTON_HOST).click();
  await expect.poll(() => seen.count).toBe(1);
  await expect(page.locator("input[name=email]")).toHaveValue("");
});

test("refuses a second API URL for a domain already saved", async ({ context, worker }) => {
  await saveOnOptionsPage(context, worker);
  const options = await context.newPage();
  await options.goto(optionsUrl(worker));
  await options.click("#add-origin");
  await options.fill("#api-url", "https://other-api.example.com");
  await options.click("button[type=submit]");
  await expect(options.locator("#error")).toHaveText(
    "An API URL for this domain is already saved.",
  );
  await options.click("#cancel");
  await expect(options.locator("#origins li span")).toHaveText([E2E_API_ORIGIN]);
});

test("lists the domains and creates the alias in the one chosen", async ({
  context,
  worker,
  page,
}) => {
  await addSecondOrigin(context, worker);
  const hits: string[] = [];
  for (const origin of [E2E_API_ORIGIN, E2E_SECOND_API_ORIGIN]) {
    await context.route(`${origin}/**`, async (route) => {
      hits.push(origin);
      const domain = new URL(origin).hostname.split(".").slice(1).join(".");
      await route.fulfill({
        status: 201,
        json: { data: { email: `shop.ab12.cd34ef56@${domain}` } },
      });
    });
  }
  await openDomainList(context, page);
  expect(hits).toEqual([]);

  // The first domain has the focus; move to the second and choose it.
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.locator("input[name=email]")).toHaveValue("shop.ab12.cd34ef56@example.org");
  expect(hits).toEqual([E2E_SECOND_API_ORIGIN]);
  await expect.poll(() => menuLabels(context, page)).toEqual([]);
});

test("closes the domain list on Escape without creating anything", async ({
  context,
  worker,
  page,
}) => {
  await addSecondOrigin(context, worker);
  const seen = await countApiRequests(context, 201);
  await openDomainList(context, page);
  await page.keyboard.press("Escape");
  await expect.poll(() => menuLabels(context, page)).toEqual([]);
  expect(seen.count).toBe(0);
});

test("removing one API URL keeps the other", async ({ context, worker }) => {
  await saveOnOptionsPage(context, worker);
  await addSecondOrigin(context, worker);
  const options = await context.newPage();
  await options.goto(optionsUrl(worker));
  await options.getByRole("button", { name: `Remove ${E2E_API_ORIGIN}` }).click();
  await expect(options.locator("#origins li span")).toHaveText([E2E_SECOND_API_ORIGIN]);
  await expect(options.locator("#status")).toHaveText(`Removed ${E2E_API_ORIGIN}.`);
});

test("opens the domain list upwards at the bottom of the window", async ({
  context,
  worker,
  page,
}) => {
  await addSecondOrigin(context, worker);
  await page.route(`${SITE}/bottom`, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: SIGNUP_PAGE.replace("height:32px", "height:32px;position:fixed;bottom:0"),
    }),
  );
  await openDomainList(context, page, "/bottom");
  const height = await page.evaluate(() => innerHeight);
  expect(await menuBottom(context, page)).toBeLessThanOrEqual(height);
});
