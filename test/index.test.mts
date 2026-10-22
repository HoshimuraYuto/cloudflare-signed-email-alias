import { SELF } from "cloudflare:test";
import { expect, it } from "vitest";

it("answers a request", async () => {
  const response = await SELF.fetch("https://example.com/");

  expect(await response.text()).toBe("Hello World!");
});
