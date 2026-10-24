import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { COMPLETE_ENV, createFakeCli, type FakeCli } from "./fake-cli.mts";

let cli: FakeCli;

beforeEach(async () => {
  cli = await createFakeCli();
});

afterEach(async () => {
  await cli.remove();
});

async function commands(): Promise<string[]> {
  return (await cli.calls()).map(({ command }) => command);
}

describe("destroy", () => {
  it("removes nothing unless the alias domain is typed back", async () => {
    expect(cli.run("destroy.mts", COMPLETE_ENV, "example.org\n")).not.toBe(0);

    expect(await cli.calls()).toEqual([]);
  });

  it("destroys the infra, then disables the catch-all, then deletes the Worker", async () => {
    expect(cli.run("destroy.mts", COMPLETE_ENV, "example.com\n")).toBe(0);

    const ran = await commands();
    expect(
      ran.map((command) => /destroy|catch-all|profiles|workers delete|init/.exec(command)?.[0]),
    ).toEqual(["init", "destroy", "catch-all", "workers delete"]);
    expect(ran[2]).toMatch(/--zone example\.com --enabled=false .*"type":"drop"/);
    expect(ran[3]).toMatch(/workers delete cloudflare-signed-email-alias --force$/);
  });

  it("restores the default split tunnel only when this project managed it", async () => {
    expect(
      cli.run("destroy.mts", { ...COMPLETE_ENV, MANAGE_DEVICE_PROFILE: "true" }, "example.com\n"),
    ).toBe(0);

    const restore = (await commands()).find((command) =>
      command.includes("profiles default update"),
    );
    expect(restore).toMatch(/--exclude \[.*"address":"10\.0\.0\.0\/8"/);
  });

  it("does not need the signing key", async () => {
    const { SIGNING_KEY: _unused, ...withoutKey } = COMPLETE_ENV;

    expect(cli.run("destroy.mts", withoutKey, "example.com\n")).toBe(0);
  });
});
