import { afterEach, describe, expect, it } from "vitest";

import { findEmailInputs, isEmailInput } from "./detect.mts";

function input(attributes: Record<string, string>): HTMLInputElement {
  const element = document.createElement("input");
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }
  return element;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("isEmailInput", () => {
  it.each([
    { type: "email" },
    { type: "text", autocomplete: "email" },
    { type: "text", name: "email_address" },
    { type: "text", name: "Mail" },
    { type: "text", placeholder: "E-mail" },
  ])("accepts %j", (attributes) => {
    expect(isEmailInput(input(attributes))).toBe(true);
  });

  it.each([
    { type: "text", name: "username" },
    { type: "text", placeholder: "We will never share your e-mail with anyone, promise." },
    { type: "password", name: "password" },
  ])("rejects %j", (attributes) => {
    expect(isEmailInput(input(attributes))).toBe(false);
  });
});

describe("findEmailInputs", () => {
  it("finds inputs in the document and in open shadow roots", () => {
    const outer = input({ type: "email" });
    const host = document.createElement("div");
    const shadowRoot = host.attachShadow({ mode: "open" });
    const inner = input({ type: "email" });
    shadowRoot.append(inner);
    document.body.append(outer, host, input({ type: "text", name: "username" }));

    const seenRoots: ShadowRoot[] = [];
    expect(findEmailInputs(document, (root) => seenRoots.push(root))).toEqual([outer, inner]);
    expect(seenRoots).toEqual([shadowRoot]);
  });

  it("skips disabled, read-only and hidden inputs", () => {
    const hidden = input({ type: "email" });
    hidden.style.display = "none";
    document.body.append(
      input({ type: "email", disabled: "" }),
      input({ type: "email", readonly: "" }),
      hidden,
    );
    expect(findEmailInputs(document, () => undefined)).toEqual([]);
  });
});
