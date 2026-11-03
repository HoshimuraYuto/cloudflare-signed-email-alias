/** React replaces the element's own value setter to track changes, so the prototype's is used. */
export function fillInput(input: HTMLInputElement, value: string): void {
  if (!Reflect.set(HTMLInputElement.prototype, "value", value, input)) {
    throw new TypeError("the input rejected the value");
  }
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}
