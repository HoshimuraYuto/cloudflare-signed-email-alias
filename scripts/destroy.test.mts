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
      "-exclude=terraform_data.split_tunnel_original",
      "-exclude=cloudflare_zero_trust_device_settings.gateway_proxy",
      "-exclude=terraform_data.gateway_proxy_original",
      "-exclude=cloudflare_zero_trust_access_application.enroll",
      "-exclude=cloudflare_zero_trust_access_policy.enroll",
      "-exclude=cloudflare_dns_record.dmarc",
    ]);
    expect(ran.some((command) => command.includes("profiles default update"))).toBe(false);
  });

  it("on reset, puts the shared settings back and lets go of them before destroying", async () => {
    await cli.recordState([
      "cloudflare_zero_trust_device_default_profile.split_tunnel[0]",
      "terraform_data.split_tunnel_original[0]",
      "cloudflare_zero_trust_device_settings.gateway_proxy[0]",
      "terraform_data.gateway_proxy_original[0]",
    ]);
    const env = { ...COMPLETE_ENV, RESET_SHARED_SETTINGS: "true" };
    expect(cli.run("destroy.mts", env, "example.com\n")).toBe(0);

    const ran = await commands();
    const step = (pattern: RegExp) => ran.findIndex((command) => pattern.test(command));
    const restored = Math.max(step(/profiles default update/), step(/devices settings update/));
    const letGo = step(
      / state rm -backup=\S+terraform\.tfstate\.backup cloudflare_zero_trust_device_default_profile\.split_tunnel terraform_data\.split_tunnel_original cloudflare_zero_trust_device_settings\.gateway_proxy terraform_data\.gateway_proxy_original$/,
    );
    const destroy = step(/ destroy$/);
    expect(step(/profiles default update/)).toBeGreaterThan(-1);
    expect(letGo).toBeGreaterThan(restored);
    expect(destroy).toBeGreaterThan(letGo);
  });

  it("on reset, puts the split tunnel and Gateway proxy back as they were", async () => {
    await cli.recordState(["cloudflare_zero_trust_device_default_profile.split_tunnel[0]"]);
    // The flags are off on purpose: the state, not the flags, says what was managed.
    const env = { ...COMPLETE_ENV, RESET_SHARED_SETTINGS: "true" };
    expect(cli.run("destroy.mts", env, "example.com\n")).toBe(0);

    const ran = await commands();
    expect(ran.find((command) => command.includes(" destroy"))).not.toContain("-exclude");
    expect(ran.find((command) => command.includes("profiles default update"))).toMatch(
      /update --exclude \[\{"address":"10\.0\.0\.0\/8"\}\]$/,
    );
    expect(ran.find((command) => command.includes("devices settings update"))).toMatch(
      /--gateway-proxy-enabled=false --gateway-udp-proxy-enabled=true$/,
    );
  });

  it("leaves the Gateway proxy on when it was on before", async () => {
    await cli.recordState(["cloudflare_zero_trust_device_settings.gateway_proxy[0]"]);
    await cli.setOriginals({
      split_tunnel: null,
      gateway_proxy: { gateway_proxy_enabled: true, gateway_udp_proxy_enabled: false },
    });
    const env = { ...COMPLETE_ENV, RESET_SHARED_SETTINGS: "true" };
    expect(cli.run("destroy.mts", env, "example.com\n")).toBe(0);

    expect(
      (await commands()).find((command) => command.includes("devices settings update")),
    ).toMatch(/--gateway-proxy-enabled=true --gateway-udp-proxy-enabled=false$/);
  });

  it("does not put back a split tunnel that was recorded as this project's own", async () => {
    await cli.recordState(["cloudflare_zero_trust_device_default_profile.split_tunnel[0]"]);
    await cli.setOriginals({
      split_tunnel: {
        include: [{ host: "team.cloudflareaccess.com" }, { host: "email-alias-api.example.com" }],
        exclude: null,
      },
      gateway_proxy: null,
    });
    const env = { ...COMPLETE_ENV, RESET_SHARED_SETTINGS: "true" };
    const { status, stderr } = cli.runCapturing("destroy.mts", env, "example.com\n");

    expect(status).toBe(0);
    expect(stderr).toContain("set the split tunnel back by hand");
    expect((await commands()).some((command) => command.includes("profiles default update"))).toBe(
      false,
    );
  });

  it("still spots its own split tunnel after releasing the enrollment app", async () => {
    await cli.recordState([
      "cloudflare_zero_trust_access_application.enroll[0]",
      "cloudflare_zero_trust_device_default_profile.split_tunnel[0]",
    ]);
    await cli.setOriginals({
      split_tunnel: {
        include: [{ host: "team.cloudflareaccess.com" }, { host: "email-alias-api.example.com" }],
        exclude: null,
      },
      gateway_proxy: null,
    });
    const env = { ...COMPLETE_ENV, RESET_SHARED_SETTINGS: "true" };
    const { status, stderr } = cli.runCapturing("destroy.mts", env, "example.com\n");

    expect(status).toBe(0);
    expect(stderr).toContain("set the split tunnel back by hand");
  });

  it("puts back an include-mode split tunnel in include mode", async () => {
    await cli.recordState(["cloudflare_zero_trust_device_default_profile.split_tunnel[0]"]);
    await cli.setOriginals({
      split_tunnel: { include: [{ host: "intranet.example.com", address: null }], exclude: null },
      gateway_proxy: null,
    });
    const env = { ...COMPLETE_ENV, RESET_SHARED_SETTINGS: "true" };
    expect(cli.run("destroy.mts", env, "example.com\n")).toBe(0);

    const ran = await commands();
    expect(ran.find((command) => command.includes("profiles default update"))).toMatch(
      /update --include \[\{"host":"intranet\.example\.com"\}\]$/,
    );
    expect(ran.some((command) => command.includes("devices settings update"))).toBe(false);
  });

  it("on reset, detaches its policy from the enrollment app and keeps the app", async () => {
    await cli.recordState(["cloudflare_zero_trust_access_application.enroll[0]"]);
    // The flag is off on purpose: the release must still keep the app in the plan.
    const env = { ...COMPLETE_ENV, RESET_SHARED_SETTINGS: "true" };
    expect(cli.run("destroy.mts", env, "example.com\n")).toBe(0);

    const ran = await commands();
    const step = (pattern: RegExp) => ran.findIndex((command) => pattern.test(command));
    const release = step(
      / apply -auto-approve -target=cloudflare_zero_trust_access_application\.enroll -var=manage_device_enrollment=true -var=release_device_enrollment=true$/,
    );
    const forget = step(
      / state rm -backup=\S+terraform\.tfstate\.backup cloudflare_zero_trust_access_application\.enroll$/,
    );
    const destroy = step(/ destroy$/);
    expect(release).toBeGreaterThan(-1);
    expect(forget).toBeGreaterThan(release);
    expect(destroy).toBeGreaterThan(forget);
  });

  it("without reset, says which shared settings it kept", async () => {
    const { stdout } = cli.runCapturing("destroy.mts", COMPLETE_ENV, "example.com\n");

    expect(stdout).toContain("RESET_SHARED_SETTINGS=true undoes them");
  });

  it("without reset, leaves the enrollment app and its policy untouched", async () => {
    await cli.recordState(["cloudflare_zero_trust_access_application.enroll[0]"]);
    expect(cli.run("destroy.mts", COMPLETE_ENV, "example.com\n")).toBe(0);

    const ran = await commands();
    expect(ran.some((command) => / apply | state rm /.test(command))).toBe(false);
  });

  it("leaves the split tunnel alone when this project never managed it", async () => {
    await cli.recordState(['cloudflare_workers_custom_domain.api["example.com"]']);
    // What the output holds when the flags were off at every deploy.
    await cli.setOriginals({ split_tunnel: null, gateway_proxy: null });
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
