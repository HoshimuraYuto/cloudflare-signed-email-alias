import { describe, expect, it } from "vitest";

import { COMPLETE_ENV, useFakeCli } from "./fake-cli.mts";

const fake = useFakeCli();

describe("service-token", () => {
  it("prints the API key in the shape the addy.io forwarder expects", () => {
    fake.current.run("deploy.mts", COMPLETE_ENV);

    const { status, stdout } = fake.current.runCapturing("service-token.mts", COMPLETE_ENV);

    expect(status).toBe(0);
    // Parsing the whole stdout proves nothing else, such as tofu init output, is mixed in.
    expect(JSON.parse(stdout)).toEqual({
      "cf-access-client-id": "client.access",
      "cf-access-client-secret": "client-secret",
    });
  });

  it("reads the state at STATE_FILE, whatever was initialized before", async () => {
    fake.current.run("deploy.mts", COMPLETE_ENV);
    await fake.current.forgetCalls();

    fake.current.runCapturing("service-token.mts", COMPLETE_ENV);

    const [init] = (await fake.current.calls()).map(({ command }) => command);
    expect(init).toMatch(/ init .*-backend-config=path=\S+terraform\.tfstate$/);
  });

  it("needs only the state passphrase, so it works after the API token expires", () => {
    fake.current.run("deploy.mts", COMPLETE_ENV);

    const { status } = fake.current.runCapturing("service-token.mts", {
      STATE_PASSPHRASE: COMPLETE_ENV.STATE_PASSPHRASE,
    });

    expect(status).toBe(0);
  });

  it("tells you to deploy first", () => {
    const { status, stderr } = fake.current.runCapturing("service-token.mts", COMPLETE_ENV);

    expect(status).not.toBe(0);
    expect(stderr).toContain("run pnpm run deploy first");
  });
});
