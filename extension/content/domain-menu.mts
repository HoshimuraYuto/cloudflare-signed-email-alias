import { watchVisibility } from "./visibility.mts";

export interface DomainMenu {
  element: HTMLElement;
  show: (domains: readonly string[], onChoose: (domain: string) => void) => void;
  hide: () => void;
  isOpen: () => boolean;
}

/** The button's guards hold here too: real input only, and only while fully visible. */
export function createDomainMenu(context: {
  host: HTMLElement;
  /** The button that opens the list. */
  owner: HTMLButtonElement;
  input: HTMLInputElement;
  /** CSS pixels between the top of the host and the list, below the button. */
  top: number;
  onObscuredClick: () => void;
}): DomainMenu {
  const element = document.createElement("div");
  element.setAttribute("role", "menu");
  element.setAttribute("aria-label", "Alias domain");
  Object.assign(element.style, {
    all: "initial",
    display: "none",
    position: "absolute",
    right: "0",
    minWidth: "160px",
    padding: "4px 0",
    borderRadius: "4px",
    background: "#202124",
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.3)",
  });
  let visibility: ReturnType<typeof watchVisibility> | null = null;
  let choose: ((domain: string) => void) | null = null;

  const items = (): HTMLButtonElement[] =>
    [...element.children].filter((child) => child instanceof HTMLButtonElement);
  const closeOnOutsidePointer = (event: PointerEvent): void => {
    if (!event.composedPath().includes(context.host)) {
      hide();
    }
  };
  const hide = (): void => {
    if (visibility === null) {
      return;
    }
    visibility.stop();
    visibility = null;
    choose = null;
    element.replaceChildren();
    element.style.display = "none";
    context.owner.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
  };
  const pick = (domain: string): void => {
    if (visibility?.isVisible() !== true) {
      context.onObscuredClick();
      return;
    }
    const onChoose = choose;
    hide();
    context.input.focus();
    onChoose?.(domain);
  };

  element.addEventListener("keydown", (event) => {
    if (!event.isTrusted) {
      return;
    }
    const list = items();
    const root = element.getRootNode();
    const active = root instanceof ShadowRoot ? root.activeElement : null;
    const index = list.findIndex((item) => item === active);
    const moves: Record<string, number> = { ArrowDown: 1, ArrowUp: -1 };
    const step = moves[event.key];
    if (step !== undefined) {
      event.preventDefault();
      list.at((index + step) % list.length)?.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      hide();
      context.input.focus();
    }
  });

  element.addEventListener("focusout", (event) => {
    if (!(event.relatedTarget instanceof Node && element.contains(event.relatedTarget))) {
      hide();
    }
  });

  return {
    element,
    show: (domains, onChoose) => {
      hide();
      choose = onChoose;
      element.replaceChildren(...domains.map((domain) => createMenuItem(domain, pick)));
      openBelowOrAbove(element, context.top);
      context.owner.setAttribute("aria-haspopup", "menu");
      context.owner.setAttribute("aria-expanded", "true");
      visibility = watchVisibility(element);
      document.addEventListener("pointerdown", closeOnOutsidePointer, true);
      items()[0]?.focus();
    },
    hide,
    isOpen: () => visibility !== null,
  };
}

/** A list cut off by the window never counts as fully visible, so near the bottom it opens upwards. */
function openBelowOrAbove(element: HTMLElement, offset: number): void {
  Object.assign(element.style, { display: "block", top: `${offset}px`, bottom: "auto" });
  if (element.getBoundingClientRect().bottom > innerHeight) {
    Object.assign(element.style, { top: "auto", bottom: `${offset}px` });
  }
}

function createMenuItem(domain: string, pick: (domain: string) => void): HTMLButtonElement {
  const item = document.createElement("button");
  item.type = "button";
  item.setAttribute("role", "menuitem");
  item.textContent = `@${domain}`;
  Object.assign(item.style, {
    all: "initial",
    display: "block",
    boxSizing: "border-box",
    width: "100%",
    padding: "6px 12px",
    color: "#ffffff",
    font: "13px/1.4 system-ui, sans-serif",
    cursor: "pointer",
  });
  const highlight = (on: boolean): void => {
    item.style.background = on ? "#3c4043" : "transparent";
  };
  item.addEventListener("focus", () => {
    highlight(true);
  });
  item.addEventListener("blur", () => {
    highlight(false);
  });
  item.addEventListener("mouseenter", () => {
    item.focus();
  });
  item.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    // Enter on a focused item also arrives as a trusted click.
    if (event.isTrusted) {
      pick(domain);
    }
  });
  return item;
}
