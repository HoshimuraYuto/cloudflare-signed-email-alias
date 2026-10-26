import { describe, expect, it } from "vitest";

import { readSettings, tofuEnv } from "./settings.mts";

const complete = {
  CLOUDFLARE_API_TOKEN: "token",
  CLOUDFLARE_ACCOUNT_ID: "account",
  SIGNING_KEY: "signing-key",
  STATE_PASSPHRASE: "passphrase",
  FORWARD_TO: "example.com=inbox@example.net",
};

describe("readSettings", () => {
  it("lists every missing variable in one error", () => {
    expect(() => readSettings({ SIGNING_KEY: "signing-key", FORWARD_TO: "" })).toThrow(
      /: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, STATE_PASSPHRASE, FORWARD_TO$/,
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

  it("reads several alias domains and an API subdomain", () => {
    const settings = readSettings({
      ...complete,
      FORWARD_TO: "example.com=inbox@example.net,example.org=other@example.net",
      API_SUBDOMAIN: "aliases",
    });
    expect(tofuEnv(settings)).toMatchObject({
      TF_VAR_forwarding: JSON.stringify({
        "example.com": "inbox@example.net",
        "example.org": "other@example.net",
      }),
      TF_VAR_api_subdomain: "aliases",
    });
  });

  it("passes DMARC_POLICY only when set", () => {
    expect(tofuEnv(readSettings(complete))).not.toHaveProperty("TF_VAR_dmarc_policy");
    expect(tofuEnv(readSettings({ ...complete, DMARC_POLICY: "reject" }))).toMatchObject({
      TF_VAR_dmarc_policy: "reject",
    });
  });

  it("refuses a malformed FORWARD_TO before anything runs", () => {
    expect(() => readSettings({ ...complete, FORWARD_TO: "inbox@example.net" })).toThrow(
      /domain=inbox/,
    );
  });

  it("needs ENROLL_EMAILS only when it manages device enrollment", () => {
    const enrolling = { ...complete, MANAGE_DEVICE_ENROLLMENT: "true" };
    expect(() => readSettings(enrolling, ["ENROLL_EMAILS"])).toThrow(/: ENROLL_EMAILS$/);
    expect(() => readSettings(enrolling)).not.toThrow();
    expect(() => readSettings(complete, ["ENROLL_EMAILS"])).not.toThrow();
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
      TF_VAR_forwarding: JSON.stringify({ "example.com": "inbox@example.net" }),
      TF_VAR_manage_device_profile: "false",
      TF_VAR_manage_gateway_proxy: "false",
      TF_VAR_manage_device_enrollment: "false",
      TF_VAR_enroll_emails: "[]",
    });
  });
});
