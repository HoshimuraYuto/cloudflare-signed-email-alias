import { describe, expect, it } from "vitest";

import { readSettings, tofuEnv } from "./settings.mts";

const complete = {
  CLOUDFLARE_API_TOKEN: "token",
  CLOUDFLARE_ACCOUNT_ID: "account",
  SIGNING_KEY: "signing-key",
  STATE_PASSPHRASE: "passphrase",
  ALIAS_DOMAIN: "example.com",
  API_HOSTNAME: "alias-api.example.com",
  FORWARD_TO: "inbox@example.net",
};

describe("readSettings", () => {
  it("lists every missing variable in one error", () => {
    expect(() => readSettings({ SIGNING_KEY: "signing-key", ALIAS_DOMAIN: "" })).toThrow(
      /: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, STATE_PASSPHRASE, ALIAS_DOMAIN, API_HOSTNAME, FORWARD_TO$/,
    );
  });

  it("keeps the state outside the repository and the device profile untouched by default", () => {
    const settings = readSettings(complete);
    expect(settings.stateFile).toMatch(
      /\/\.local\/state\/cloudflare-signed-email-alias\/terraform\.tfstate$/,
    );
    expect(settings.manageDeviceProfile).toBe(false);
    expect(settings.manageDeviceEnrollment).toBe(false);
    expect(settings.resetSharedSettings).toBe(false);
  });

  it("needs ENROLL_EMAILS only when it manages device enrollment", () => {
    expect(() => readSettings({ ...complete, MANAGE_DEVICE_ENROLLMENT: "true" })).toThrow(
      /: ENROLL_EMAILS$/,
    );
    const settings = readSettings({
      ...complete,
      MANAGE_DEVICE_ENROLLMENT: "true",
      ENROLL_EMAILS: " me@example.net, ,you@example.org ",
    });
    expect(settings.enrollEmails).toEqual(["me@example.net", "you@example.org"]);
  });

  it("honours STATE_FILE and MANAGE_DEVICE_PROFILE", () => {
    const settings = readSettings({
      ...complete,
      STATE_FILE: "/elsewhere/terraform.tfstate",
      MANAGE_DEVICE_PROFILE: "true",
    });
    expect(settings.stateFile).toBe("/elsewhere/terraform.tfstate");
    expect(settings.manageDeviceProfile).toBe(true);
  });
});

describe("tofuEnv", () => {
  it("passes every OpenTofu variable and nothing the infra does not declare", () => {
    expect(tofuEnv(readSettings(complete))).toEqual({
      TF_VAR_state_passphrase: "passphrase",
      TF_VAR_account_id: "account",
      TF_VAR_alias_domain: "example.com",
      TF_VAR_api_hostname: "alias-api.example.com",
      TF_VAR_forward_to: "inbox@example.net",
      TF_VAR_manage_device_profile: "false",
      TF_VAR_manage_device_enrollment: "false",
      TF_VAR_enroll_emails: "[]",
    });
  });
});
