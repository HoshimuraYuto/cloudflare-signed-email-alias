import { afterEach, describe, expect, it } from "vitest";

import type { CreateAliasResult } from "../shared/messages.mts";
import { createTracker, type Tracker } from "./tracker.mts";

const NEVER = {
  listDomains: (): Promise<string[]> => new Promise(() => undefined),
  requestAlias: (): Promise<CreateAliasResult> => new Promise(() => undefined),
};

let tracker: Tracker | undefined;

function emailInput(): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "email";
  document.body.append(input);
  return input;
}

/** Buttons live in closed shadow roots, so their hosts are what the page can count. */
function buttonHosts(): number {
  return [...document.body.children].filter((element) => element instanceof HTMLDivElement).length;
}

afterEach(() => {
  tracker?.removeAll();
  document.body.replaceChildren();
});

describe("createTracker", () => {
  it("gives an input one button however often it is reported", () => {
    tracker = createTracker(NEVER);
    const input = emailInput();
    tracker.track(input);
    tracker.track(input);
    expect(buttonHosts()).toBe(1);
  });

  it("drops the button of an input that left the page", () => {
    tracker = createTracker(NEVER);
    const input = emailInput();
    tracker.track(input);
    input.remove();
    tracker.refresh();
    expect(buttonHosts()).toBe(0);
  });

  it("gives an input back its button when the page puts it back", () => {
    tracker = createTracker(NEVER);
    const input = emailInput();
    tracker.track(input);
    input.remove();
    tracker.refresh();
    document.body.append(input);
    tracker.track(input);
    expect(buttonHosts()).toBe(1);
  });

  it("removes every button", () => {
    tracker = createTracker(NEVER);
    tracker.track(emailInput());
    tracker.track(emailInput());
    tracker.removeAll();
    expect(buttonHosts()).toBe(0);
  });
});
