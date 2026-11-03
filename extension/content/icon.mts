// Placement adapted from the addy.io browser extension (MIT); see public/third-party-notices.txt.

import { isLargeEnough } from "./detect.mts";
import { createDomainMenu } from "./domain-menu.mts";
import { watchVisibility } from "./visibility.mts";

const ICON_SIZE = 20;
const ICON_INSET = 8;
const POPUP_OFFSET = ICON_SIZE + 4;
/** Fields less than half visible keep no icon, so it never floats over other content. */
const MIN_VISIBLE_RATIO = 0.5;
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const AT_SIGN_PATH =
  "M12 2a10 10 0 1 0 5.2 18.5l-1-1.7A8 8 0 1 1 20 12v1.5a1.5 1.5 0 0 1-3 0V12a5 5 0 1 0-1.5 3.6A3.5 3.5 0 0 0 22 13.5V12A10 10 0 0 0 12 2Zm0 13a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z";

export const LABEL = "Create a signed alias address";
export const DEFAULT_COLOUR = "#f38020";

export interface AliasIcon {
  button: HTMLButtonElement;
  /** Shows text under the button; null hides it. */
  showMessage: (text: string | null) => void;
  showMenu: (domains: readonly string[], onChoose: (domain: string) => void) => void;
  hideMenu: () => void;
  isMenuOpen: () => boolean;
  reposition: () => void;
  remove: () => void;
}

/** Page scripts can still restyle or cover the host, so clicks count only while fully visible. */
export function attachIcon(
  input: HTMLInputElement,
  handlers: { onActivate: () => void; onObscuredClick: () => void },
): AliasIcon {
  const host = document.createElement("div");
  const button = createButton();
  const message = createMessage();
  const menu = createDomainMenu({
    host,
    owner: button,
    input,
    top: POPUP_OFFSET,
    onObscuredClick: handlers.onObscuredClick,
  });
  host.attachShadow({ mode: "closed" }).append(button, message, menu.element);
  Object.assign(host.style, { all: "initial", position: "fixed", zIndex: "2147483647" });

  let inView = true;
  const reposition = (): void => {
    placeIcon({ input, host, inView });
  };
  const intersection = new IntersectionObserver(
    ([entry]) => {
      inView = entry !== undefined && entry.intersectionRatio >= MIN_VISIBLE_RATIO;
      reposition();
    },
    { threshold: [0, MIN_VISIBLE_RATIO, 1] },
  );
  const resize = new ResizeObserver(reposition);
  intersection.observe(input);
  resize.observe(input);
  reposition();
  const visibility = watchVisibility(button);
  listenForActivation(button, () => {
    if (visibility.isVisible()) {
      handlers.onActivate();
    } else {
      handlers.onObscuredClick();
    }
  });

  return {
    button,
    showMessage: (text) => {
      message.textContent = text ?? "";
      message.style.display = text === null ? "none" : "block";
    },
    showMenu: menu.show,
    hideMenu: menu.hide,
    isMenuOpen: menu.isOpen,
    reposition,
    remove: () => {
      menu.hide();
      intersection.disconnect();
      resize.disconnect();
      visibility.stop();
      host.remove();
    },
  };
}

function createButton(): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.title = LABEL;
  button.setAttribute("aria-label", LABEL);
  Object.assign(button.style, {
    all: "initial",
    display: "block",
    width: `${ICON_SIZE}px`,
    height: `${ICON_SIZE}px`,
    cursor: "pointer",
    color: DEFAULT_COLOUR,
  });
  button.append(createAtSign());
  return button;
}

function createMessage(): HTMLElement {
  const message = document.createElement("div");
  message.setAttribute("role", "status");
  Object.assign(message.style, {
    all: "initial",
    display: "none",
    position: "absolute",
    top: `${POPUP_OFFSET}px`,
    right: "0",
    maxWidth: "280px",
    width: "max-content",
    padding: "4px 8px",
    borderRadius: "4px",
    background: "#202124",
    color: "#ffffff",
    font: "12px/1.4 system-ui, sans-serif",
  });
  return message;
}

function createAtSign(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(ICON_SIZE));
  svg.setAttribute("height", String(ICON_SIZE));
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(SVG_NAMESPACE, "path");
  path.setAttribute("d", AT_SIGN_PATH);
  path.setAttribute("fill", "currentColor");
  svg.append(path);
  return svg;
}

function listenForActivation(button: HTMLButtonElement, onActivate: () => void): void {
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    // Page scripts can dispatch synthetic clicks; only real user input counts.
    if (event.isTrusted) {
      onActivate();
    }
  });
  // Keeps the focus, and the page's own focus handling, on the input.
  button.addEventListener("mousedown", (event) => {
    event.preventDefault();
  });
}

function placeIcon(target: { input: HTMLInputElement; host: HTMLElement; inView: boolean }): void {
  const { input, host, inView } = target;
  // Modal dialogs and popovers sit in the top layer, above anything in body.
  const container = input.closest("dialog[open], [popover]") ?? document.body;
  if (host.parentNode !== container) {
    container.append(host);
  }
  const rect = input.getBoundingClientRect();
  Object.assign(host.style, {
    left: `${rect.right - ICON_SIZE - ICON_INSET}px`,
    top: `${rect.top + (rect.height - ICON_SIZE) / 2}px`,
    visibility: inView && isLargeEnough(rect) ? "visible" : "hidden",
  });
}
