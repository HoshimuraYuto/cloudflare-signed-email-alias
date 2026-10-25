import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { COMPLETE_ENV, createFakeCli, type FakeCli } from "./fake-cli.mts";

let cli: FakeCli;

beforeEach(async () => {
  cli = await createFakeCli();
});

afterEach(async () => {
  await cli.remove();
});

describe("service-token", () => {
  it("prints the API key in the shape the addy.io forwarder expects", () => {
    cli.run("deploy.mts", COMPLETE_ENV);

    const { status, stdout } = cli.runCapturing("service-token.mts", COMPLETE_ENV);

    expect(status).toBe(0);
    // Parsing the whole stdout proves nothing else, such as tofu init output, is mixed in.
    expect(JSON.parse(stdout)).toEqual({
      "cf-access-client-id": "client.access",
      "cf-access-client-secret": "client-secret",
    });
  });

  it("reads the state at STATE_FILE, whatever was initialized before", async () => {
    cli.run("deploy.mts", COMPLETE_ENV);
    await cli.forgetCalls();

    cli.runCapturing("service-token.mts", COMPLETE_ENV);

    const [init] = (await cli.calls()).map(({ command }) => command);
    expect(init).toMatch(/ init .*-backend-config=path=\S+terraform\.tfstate$/);
  });

  it("tells you to deploy first", () => {
    const { status, stderr } = cli.runCapturing("service-token.mts", COMPLETE_ENV);

    expect(status).not.toBe(0);
    expect(stderr).toContain("run pnpm run deploy first");
  });
});
