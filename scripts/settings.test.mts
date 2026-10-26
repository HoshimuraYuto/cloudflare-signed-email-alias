import { describe, expect, it } from "vitest";

import { COMPLETE_ENV } from "./fake-cli.mts";
import { readSettings, tofuEnv } from "./settings.mts";

describe("readSettings", () => {
  it("lists every missing variable in one error", () => {
    expect(() => readSettings({ SIGNING_KEY: "signing-key", FORWARD_TO: "" }, "deploy")).toThrow(
      /: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, STATE_PASSPHRASE, FORWARD_TO$/,
    );
  });

  it("needs only the passphrase to read outputs, so an expired API token does not matter", () => {
    expect(() =>
      readSettings({ STATE_PASSPHRASE: "passphrase-for-tests" }, "output"),
    ).not.toThrow();
    expect(() => readSettings({}, "output")).toThrow(/: STATE_PASSPHRASE$/);
  });

  it("does not need the signing key to destroy", () => {
    const { SIGNING_KEY: _unused, ...withoutKey } = COMPLETE_ENV;
    expect(() => readSettings(withoutKey, "destroy")).not.toThrow();
  });

  it("keeps the state outside the repository and the shared settings untouched by default", () => {
    const settings = readSettings(COMPLETE_ENV, "deploy");
    expect(settings.stateFile).toMatch(
      /\/\.local\/state\/cloudflare-signed-email-alias\/terraform\.tfstate$/,
    );
    expect(settings.manageDeviceProfile).toBe(false);
    expect(settings.manageDeviceEnrollment).toBe(false);
    expect(settings.resetSharedSettings).toBe(false);
  });

  it("reads several alias domains and an API subdomain", () => {
    const settings = readSettings(
      {
        ...COMPLETE_ENV,
        FORWARD_TO: "example.com=inbox@example.net,example.org=other@example.net",
        API_SUBDOMAIN: "aliases",
      },
      "deploy",
    );
    expect(tofuEnv(settings)).toMatchObject({
      TF_VAR_forwarding: JSON.stringify({
        "example.com": "inbox@example.net",
        "example.org": "other@example.net",
      }),
      TF_VAR_api_subdomain: "aliases",
    });
  });

  it("passes DMARC_POLICY only when set", () => {
    expect(tofuEnv(readSettings(COMPLETE_ENV, "deploy"))).not.toHaveProperty("TF_VAR_dmarc_policy");
    expect(
      tofuEnv(readSettings({ ...COMPLETE_ENV, DMARC_POLICY: "reject" }, "deploy")),
    ).toMatchObject({ TF_VAR_dmarc_policy: "reject" });
  });

  it.each([
    ["STATE_PASSPHRASE", "too-short", /at least 16 characters/],
    ["DMARC_POLICY", "strict", /none, quarantine, reject/],
    ["API_SUBDOMAIN", "Email.Alias", /one lower-case DNS label/],
  ])("refuses a malformed %s before anything runs", (name, value, problem) => {
    expect(() => readSettings({ ...COMPLETE_ENV, [name]: value }, "deploy")).toThrow(problem);
  });

  it("refuses a malformed FORWARD_TO before anything runs", () => {
    expect(() =>
      readSettings({ ...COMPLETE_ENV, FORWARD_TO: "inbox@example.net" }, "deploy"),
    ).toThrow(/domain=inbox/);
  });

  it("needs ENROLL_EMAILS only to deploy while it manages device enrollment", () => {
    const enrolling = { ...COMPLETE_ENV, MANAGE_DEVICE_ENROLLMENT: "true" };
    expect(() => readSettings(enrolling, "deploy")).toThrow(/: ENROLL_EMAILS$/);
    expect(() => readSettings(enrolling, "destroy")).not.toThrow();
    const settings = readSettings(
      { ...enrolling, ENROLL_EMAILS: " me@example.net, ,you@example.org " },
      "deploy",
    );
    expect(settings.enrollEmails).toEqual(["me@example.net", "you@example.org"]);
  });

  it("makes a relative STATE_FILE absolute, since tofu runs from infra/", () => {
    const settings = readSettings(
      { ...COMPLETE_ENV, STATE_FILE: "state/terraform.tfstate" },
      "deploy",
    );
    expect(settings.stateFile).toBe(`${process.cwd()}/state/terraform.tfstate`);
  });

  it("honours STATE_FILE and MANAGE_DEVICE_PROFILE", () => {
    const settings = readSettings(
      {
        ...COMPLETE_ENV,
        STATE_FILE: "/elsewhere/terraform.tfstate",
        MANAGE_DEVICE_PROFILE: "true",
      },
      "deploy",
    );
    expect(settings.stateFile).toBe("/elsewhere/terraform.tfstate");
    expect(settings.manageDeviceProfile).toBe(true);
  });
});

describe("tofuEnv", () => {
  it("passes every OpenTofu variable and nothing the infra does not declare", () => {
    expect(tofuEnv(readSettings(COMPLETE_ENV, "deploy"))).toEqual({
      TF_VAR_state_passphrase: COMPLETE_ENV.STATE_PASSPHRASE,
      TF_VAR_account_id: "account",
      TF_VAR_forwarding: JSON.stringify({ "example.com": "inbox@example.net" }),
      TF_VAR_manage_device_profile: "false",
      TF_VAR_manage_gateway_proxy: "false",
      TF_VAR_manage_device_enrollment: "false",
      TF_VAR_enroll_emails: "[]",
    });
  });

  it("passes only the passphrase when reading outputs", () => {
    expect(tofuEnv(readSettings(COMPLETE_ENV, "output"))).toEqual({
      TF_VAR_state_passphrase: COMPLETE_ENV.STATE_PASSPHRASE,
    });
  });
});
