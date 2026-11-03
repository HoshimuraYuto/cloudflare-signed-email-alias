import { describe, expect, it } from "vitest";

import { describeToken } from "./saved-view.mts";

describe("describeToken", () => {
  const token = { clientId: "0123456789abcdef.access", clientSecret: "secret-value" };

  it("names the token by the end of its client ID", () => {
    expect(describeToken(token)).toBe("Stored (client ID ending abcdef)");
  });

  it("never includes the secret", () => {
    expect(describeToken(token)).not.toContain(token.clientSecret);
  });
});
