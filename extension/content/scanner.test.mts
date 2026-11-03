import { afterEach, describe, expect, it, vi } from "vitest";

import { createScanner, type Scanner } from "./scanner.mts";

let scanner: Scanner | undefined;

// happy-dom has no requestIdleCallback; running the callback at once keeps the scan order.
vi.stubGlobal("requestIdleCallback", (callback: () => void) => {
  callback();
  return 0;
});

function emailInput(): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "email";
  return input;
}

afterEach(() => {
  scanner?.stop();
  document.body.replaceChildren();
});

describe("createScanner", () => {
  it("reports removals so buttons of removed inputs can go", async () => {
    const input = emailInput();
    document.body.append(input);
    const onRemoval = vi.fn();
    scanner = createScanner({ onInput: () => undefined, onRemoval });
    scanner.start();
    input.remove();
    await vi.waitFor(() => {
      expect(onRemoval).toHaveBeenCalled();
    });
  });

  it("reports inputs present at start and added later", async () => {
    const first = emailInput();
    document.body.append(first);
    const found: HTMLInputElement[] = [];
    scanner = createScanner({ onInput: (input) => found.push(input), onRemoval: () => undefined });
    scanner.start();

    const later = emailInput();
    const wrapper = document.createElement("form");
    wrapper.append(later);
    document.body.append(wrapper);
    await vi.waitFor(() => {
      expect(found).toEqual([first, later]);
    });

    document.body.append(document.createElement("div"));
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(found).toEqual([first, later]);
  });

  it("sees inputs added inside a shadow root after start", async () => {
    const host = document.createElement("div");
    const shadowRoot = host.attachShadow({ mode: "open" });
    document.body.append(host);
    const found: HTMLInputElement[] = [];
    scanner = createScanner({ onInput: (input) => found.push(input), onRemoval: () => undefined });
    scanner.start();

    const inner = emailInput();
    shadowRoot.append(inner);
    await vi.waitFor(() => {
      expect(found).toEqual([inner]);
    });
  });

  it("stops reporting after stop", async () => {
    const found: HTMLInputElement[] = [];
    scanner = createScanner({ onInput: (input) => found.push(input), onRemoval: () => undefined });
    scanner.start();
    scanner.stop();
    document.body.append(emailInput());
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(found).toEqual([]);
  });
});
