import { describe, expect, it } from "vitest";

import { fillInput } from "./fill.mts";

describe("fillInput", () => {
  it("bypasses a value setter defined on the element, as React does", () => {
    const input = document.createElement("input");
    let tracked = "";
    Object.defineProperty(input, "value", {
      configurable: true,
      get: () => tracked,
      set: (value: string) => {
        tracked = value;
      },
    });
    const events: string[] = [];
    input.addEventListener("input", () => events.push("input"));
    input.addEventListener("change", () => events.push("change"));

    fillInput(input, "a@example.com");

    expect(tracked).toBe("");
    expect(Reflect.get(HTMLInputElement.prototype, "value", input)).toBe("a@example.com");
    expect(events).toEqual(["input", "change"]);
  });
});
