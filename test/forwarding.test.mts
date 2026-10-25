import { describe, expect, it } from "vitest";

import { parseForwarding } from "../src/forwarding.mts";

describe("parseForwarding", () => {
  it("reads one domain", () => {
    expect(parseForwarding("example.com=inbox@example.net")).toEqual(
      new Map([["example.com", "inbox@example.net"]]),
    );
  });

  it("reads several domains, ignoring case, spaces and empty entries", () => {
    expect(
      parseForwarding(" Example.com = inbox@example.net ,, example.org=other@example.net, "),
    ).toEqual(
      new Map([
        ["example.com", "inbox@example.net"],
        ["example.org", "other@example.net"],
      ]),
    );
  });

  it("writes inboxes in lower case, so one inbox written two ways stays one", () => {
    expect(parseForwarding("example.com=Inbox@Example.net,example.org=inbox@example.net")).toEqual(
      new Map([
        ["example.com", "inbox@example.net"],
        ["example.org", "inbox@example.net"],
      ]),
    );
  });

  it.each([
    ["empty", " , "],
    ["without a domain", "=inbox@example.net"],
    ["without an inbox", "example.com="],
    ["without =", "inbox@example.net"],
    ["with two =", "example.com=a=b"],
    ["with a domain an alias cannot carry", "exa_mple.com=inbox@example.net"],
    ["with a bare name", "localhost=inbox@example.net"],
    ["listing a domain twice", "example.com=a@example.net,EXAMPLE.com=b@example.net"],
  ])("throws when %s", (_case, text) => {
    expect(() => parseForwarding(text)).toThrow();
  });

  it("keeps the inbox out of the error message", () => {
    expect(() => parseForwarding("example.com=secret-inbox@example.net=x")).toThrow(
      /^((?!secret-inbox).)*$/,
    );
  });
});
