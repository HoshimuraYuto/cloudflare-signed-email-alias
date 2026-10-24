import { createExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";

import { createAddress, importSigningKey } from "../src/address.mts";
import worker from "../src/index.mts";

function incomingMail(to: string) {
  const forward = vi.fn(async () => ({ messageId: "forwarded" }));
  const setReject = vi.fn();
  const message: ForwardableEmailMessage = {
    from: "sender@example.org",
    to,
    headers: new Headers(),
    raw: new Blob(["hello"]).stream(),
    rawSize: 5,
    forward,
    setReject,
    reply: vi.fn(async () => ({ messageId: "replied" })),
  };
  return { message, forward, setReject };
}

describe("worker email entrypoint", () => {
  it("forwards a signed alias to the configured destination", async () => {
    const key = await importSigningKey(env.SIGNING_KEY);
    const to = await createAddress({ service: "shop", domain: "example.com" }, key);
    const { message, forward, setReject } = incomingMail(to);

    await worker.email(message, env, createExecutionContext());

    expect(forward).toHaveBeenCalledWith(env.FORWARD_TO);
    expect(setReject).not.toHaveBeenCalled();
  });

  it("rejects an unsigned address", async () => {
    const { message, forward, setReject } = incomingMail("info@example.com");

    await worker.email(message, env, createExecutionContext());

    expect(setReject).toHaveBeenCalledWith("Unknown address");
    expect(forward).not.toHaveBeenCalled();
  });
});
