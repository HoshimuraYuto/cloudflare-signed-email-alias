// Adapted from the addy.io browser extension (MIT); see public/third-party-notices.txt.

const INPUT_SELECTOR = "input[type='email'], input[type='text'], input:not([type])";
const EMAIL_NAME_PATTERN = /^(e-?mail|mail)(_address)?$/i;
const EMAIL_WORD_PATTERN = /e-?mail/i;
/** Longer placeholders are sentences that merely mention e-mail, not field labels. */
const MAX_PLACEHOLDER_LENGTH = 50;
/** Smaller fields are hidden or honeypot inputs. */
export const MIN_INPUT_WIDTH = 50;
export const MIN_INPUT_HEIGHT = 18;

export type InputRoot = Document | ShadowRoot | Element;

export function isEmailInput(input: HTMLInputElement): boolean {
  const attribute = (name: string): string => (input.getAttribute(name) ?? "").toLowerCase();
  const placeholder = attribute("placeholder");
  return (
    attribute("type") === "email" ||
    attribute("autocomplete") === "email" ||
    EMAIL_NAME_PATTERN.test(attribute("name").trim()) ||
    (placeholder.length > 0 &&
      placeholder.length < MAX_PLACEHOLDER_LENGTH &&
      EMAIL_WORD_PATTERN.test(placeholder))
  );
}

export function isUsableInput(input: HTMLInputElement): boolean {
  if (input.disabled || input.readOnly || (input.type !== "text" && input.type !== "email")) {
    return false;
  }
  const style = getComputedStyle(input);
  if (style.visibility === "hidden" || style.display === "none" || style.opacity === "0") {
    return false;
  }
  // Fields not laid out yet have no size; they get the icon once they have one.
  const laidOut = input.offsetWidth > 0 && input.offsetHeight > 0;
  return !laidOut || isLargeEnough(input.getBoundingClientRect());
}

export function isLargeEnough(rect: DOMRect): boolean {
  return rect.width >= MIN_INPUT_WIDTH && rect.height >= MIN_INPUT_HEIGHT;
}

/** A document MutationObserver misses shadow roots, so each one found is reported to watch. */
export function findEmailInputs(
  root: InputRoot,
  onShadowRoot: (shadowRoot: ShadowRoot) => void,
): HTMLInputElement[] {
  const inputs = [...root.querySelectorAll<HTMLInputElement>(INPUT_SELECTOR)];
  if (root instanceof HTMLInputElement && root.matches(INPUT_SELECTOR)) {
    inputs.push(root);
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  for (let node: Node | null = walker.currentNode; node !== null; node = walker.nextNode()) {
    const shadowRoot = node instanceof Element ? node.shadowRoot : null;
    if (shadowRoot !== null) {
      onShadowRoot(shadowRoot);
      inputs.push(...findEmailInputs(shadowRoot, onShadowRoot));
    }
  }
  return inputs.filter((input) => isEmailInput(input) && isUsableInput(input));
}
