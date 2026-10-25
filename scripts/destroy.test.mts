import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { COMPLETE_ENV, createFakeCli, type FakeCli } from "./fake-cli.mts";

const TWO_DOMAINS = {
  ...COMPLETE_ENV,
  FORWARD_TO: "example.com=inbox@example.net,example.org=other@example.net",
};

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

  it.each([
    ["only one of them", "example.com\n"],
    ["one more", "example.com, example.org, example.edu\n"],
  ])("with two domains, removes nothing when %s is typed", async (_case, answer) => {
    expect(cli.run("destroy.mts", TWO_DOMAINS, answer)).not.toBe(0);

    expect(await cli.calls()).toEqual([]);
  });

  it("with two domains, disables the catch-all of each", async () => {
    expect(cli.run("destroy.mts", TWO_DOMAINS, " Example.org ,example.com\n")).toBe(0);

    const catchAlls = (await commands()).filter((command) => command.includes("catch-all"));
    expect(catchAlls.map((command) => /--zone (\S+)/.exec(command)?.[1])).toEqual([
      "example.com",
      "example.org",
    ]);
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

  it("keeps the account-wide settings unless asked to reset them", async () => {
    expect(
      cli.run("destroy.mts", { ...COMPLETE_ENV, MANAGE_DEVICE_PROFILE: "true" }, "example.com\n"),
    ).toBe(0);

    const ran = await commands();
    const destroy = ran.find((command) => command.includes(" destroy"));
    expect(destroy?.match(/-exclude=\S+/g)).toEqual([
      "-exclude=cloudflare_zero_trust_device_default_profile.split_tunnel",
      "-exclude=cloudflare_zero_trust_access_application.enroll",
      "-exclude=cloudflare_zero_trust_access_policy.enroll",
    ]);
    expect(ran.some((command) => command.includes("profiles default update"))).toBe(false);
  });

  it("removes the account-wide settings and restores the split tunnel on request", async () => {
    await cli.recordState(["cloudflare_zero_trust_device_default_profile.split_tunnel[0]"]);
    // The flag is off on purpose: the state, not the flag, says the profile was managed.
    const env = { ...COMPLETE_ENV, RESET_SHARED_SETTINGS: "true" };
    expect(cli.run("destroy.mts", env, "example.com\n")).toBe(0);

    const ran = await commands();
    expect(ran.find((command) => command.includes(" destroy"))).not.toContain("-exclude");
    const restore = ran.find((command) => command.includes("profiles default update"));
    expect(restore).toMatch(/--exclude \[.*"address":"10\.0\.0\.0\/8"/);
  });

  it("leaves the split tunnel alone when this project never managed it", async () => {
    await cli.recordState(['cloudflare_workers_custom_domain.api["example.com"]']);
    const env = { ...COMPLETE_ENV, MANAGE_DEVICE_PROFILE: "true", RESET_SHARED_SETTINGS: "true" };
    expect(cli.run("destroy.mts", env, "example.com\n")).toBe(0);

    expect((await commands()).some((command) => command.includes("profiles default update"))).toBe(
      false,
    );
  });

  it("does not need ENROLL_EMAILS even while enrollment is managed", async () => {
    const env = { ...COMPLETE_ENV, MANAGE_DEVICE_ENROLLMENT: "true" };

    expect(cli.run("destroy.mts", env, "example.com\n")).toBe(0);
  });

  it("does not need the signing key", async () => {
    const { SIGNING_KEY: _unused, ...withoutKey } = COMPLETE_ENV;

    expect(cli.run("destroy.mts", withoutKey, "example.com\n")).toBe(0);
  });
});
