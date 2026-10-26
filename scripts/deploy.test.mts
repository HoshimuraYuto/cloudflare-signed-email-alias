import { describe, expect, it } from "vitest";

import { APPLIED_ACCESS, COMPLETE_ENV, useFakeCli } from "./fake-cli.mts";

const PENDING_ACCESS = {
  ACCESS_TEAM_DOMAIN: "pending.invalid",
  ACCESS_AUD: "pending",
  ACCESS_CLIENT_ID: "pending",
};

const fake = useFakeCli();

async function steps(): Promise<string[]> {
  return (await fake.current.calls()).map(
    ({ command }) => /\b(init|output|apply|deploy)\b/.exec(command)?.[1] ?? command,
  );
}

async function deployedSecrets(): Promise<unknown[]> {
  return (await fake.current.calls())
    .filter(({ command }) => command.includes("cf deploy"))
    .map(({ stdin }): unknown => JSON.parse(stdin));
}

function workerSecrets(access: Record<string, string>) {
  return {
    SIGNING_KEY: COMPLETE_ENV.SIGNING_KEY,
    FORWARD_TO: "example.com=inbox@example.net",
    ...access,
  };
}

describe("deploy", () => {
  it("deploys with placeholders first, then again with the Access values from apply", async () => {
    expect(fake.current.run("deploy.mts", COMPLETE_ENV)).toBe(0);

    expect(await steps()).toEqual(["init", "output", "deploy", "apply", "output", "deploy"]);
    expect(await deployedSecrets()).toEqual([
      workerSecrets(PENDING_ACCESS),
      workerSecrets(APPLIED_ACCESS),
    ]);
  });

  it("deploys once with the recorded Access values when nothing changed", async () => {
    fake.current.run("deploy.mts", COMPLETE_ENV);
    await fake.current.forgetCalls();

    expect(fake.current.run("deploy.mts", COMPLETE_ENV)).toBe(0);

    expect(await steps()).toEqual(["init", "output", "deploy", "apply", "output"]);
    expect(await deployedSecrets()).toEqual([workerSecrets(APPLIED_ACCESS)]);
  });

  it("passes secrets on stdin, never as arguments", async () => {
    fake.current.run("deploy.mts", COMPLETE_ENV);

    const secrets = [
      COMPLETE_ENV.SIGNING_KEY,
      COMPLETE_ENV.CLOUDFLARE_API_TOKEN,
      COMPLETE_ENV.STATE_PASSPHRASE,
    ];
    for (const { command } of await fake.current.calls()) {
      expect(command).not.toMatch(new RegExp(secrets.join("|")));
    }
  });

  it.each([
    ["MANAGE_DEVICE_ENROLLMENT", "cloudflare_zero_trust_access_application.enroll[0]"],
    ["MANAGE_DEVICE_PROFILE", "cloudflare_zero_trust_device_default_profile.split_tunnel[0]"],
    ["MANAGE_GATEWAY_PROXY", "cloudflare_zero_trust_device_settings.gateway_proxy[0]"],
    ["DMARC_POLICY", 'cloudflare_dns_record.dmarc["example.com"]'],
  ])("refuses to drop %s while the state holds what it managed", async (flag, resource) => {
    await fake.current.recordState([resource]);

    const { status, stderr } = fake.current.runCapturing("deploy.mts", COMPLETE_ENV);

    expect(status).not.toBe(0);
    expect(stderr).toContain(flag);
    expect(await steps()).toEqual(["init", "tofu -chdir=infra state list"]);
  });

  it("deploys when the flag that created a shared setting is still on", async () => {
    await fake.current.recordState(["cloudflare_zero_trust_access_application.enroll[0]"]);
    const env = {
      ...COMPLETE_ENV,
      MANAGE_DEVICE_ENROLLMENT: "true",
      ENROLL_EMAILS: "me@example.net",
    };

    expect(fake.current.run("deploy.mts", env)).toBe(0);
  });

  it("needs ENROLL_EMAILS while it manages enrollment", async () => {
    const env = { ...COMPLETE_ENV, MANAGE_DEVICE_ENROLLMENT: "true" };

    expect(fake.current.run("deploy.mts", env)).not.toBe(0);
    expect(await fake.current.calls()).toEqual([]);
  });

  it("hands tofu the state encryption and a data directory outside the repository", async () => {
    fake.current.run("deploy.mts", COMPLETE_ENV);

    const environments = await fake.current.tofuEnvironments();
    expect(environments.length).toBeGreaterThan(0);
    for (const { encryption, dataDir } of environments) {
      expect(encryption).toBe(true);
      expect(dataDir).toMatch(/\/\.terraform$/);
      expect(dataDir).not.toContain("/infra/");
    }
  });

  it("refuses a malformed DMARC_POLICY before the Worker is deployed", async () => {
    expect(fake.current.run("deploy.mts", { ...COMPLETE_ENV, DMARC_POLICY: "strict" })).not.toBe(0);

    expect(await fake.current.calls()).toEqual([]);
  });

  it("runs nothing when a variable is missing", async () => {
    expect(fake.current.run("deploy.mts", { ...COMPLETE_ENV, SIGNING_KEY: "" })).not.toBe(0);

    expect(await fake.current.calls()).toEqual([]);
  });
});
