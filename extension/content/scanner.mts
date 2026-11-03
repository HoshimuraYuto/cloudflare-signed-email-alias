// Scan scheduling adapted from the addy.io extension (MIT); see public/third-party-notices.txt.

import { findEmailInputs, type InputRoot } from "./detect.mts";

/** A page that keeps changing is scanned at most this often. */
const SCAN_INTERVAL_MS = 500;
/** Past this many added nodes, one scan of the document is cheaper than one per node. */
const MAX_INCREMENTAL_ROOTS = 50;

export interface Scanner {
  start: () => void;
  stop: () => void;
}

export interface ScannerCallbacks {
  /** An input can be reported again. */
  onInput: (input: HTMLInputElement) => void;
  onRemoval: () => void;
}

export function createScanner(callbacks: ScannerCallbacks): Scanner {
  let watched = new WeakSet<ShadowRoot>();
  let pending = new Set<InputRoot>();
  let removed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const scan = (roots: InputRoot[]): void => {
    for (const root of roots) {
      for (const input of findEmailInputs(root, watch)) {
        callbacks.onInput(input);
      }
    }
  };
  const flush = (): void => {
    timer = undefined;
    const roots = pending.size > MAX_INCREMENTAL_ROOTS ? [document] : [...pending];
    pending = new Set();
    if (removed) {
      removed = false;
      callbacks.onRemoval();
    }
    // Idle time keeps the scan from competing with the page's own work.
    requestIdleCallback(() => {
      scan(
        roots.filter((root) => root === document || ("isConnected" in root && root.isConnected)),
      );
    });
  };
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      removed ||= record.removedNodes.length > 0;
      for (const node of record.addedNodes) {
        if (node instanceof Element) {
          pending.add(node);
        }
      }
    }
    timer ??= setTimeout(flush, SCAN_INTERVAL_MS);
  });
  function watch(shadowRoot: ShadowRoot): void {
    if (!watched.has(shadowRoot)) {
      watched.add(shadowRoot);
      observer.observe(shadowRoot, { childList: true, subtree: true });
    }
  }

  return {
    start: () => {
      observer.observe(document.documentElement, { childList: true, subtree: true });
      scan([document]);
    },
    stop: () => {
      observer.disconnect();
      clearTimeout(timer);
      watched = new WeakSet();
      pending = new Set();
    },
  };
}
