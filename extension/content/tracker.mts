import { addAliasButton, type AliasApi } from "./alias-field.mts";
import type { AliasIcon } from "./icon.mts";

export interface Tracker {
  track: (input: HTMLInputElement) => void;
  /** Moves each button to its input, and removes buttons whose input left the page. */
  refresh: () => void;
  removeAll: () => void;
}

export function createTracker(api: AliasApi): Tracker {
  const icons = new Map<HTMLInputElement, AliasIcon>();
  const untrack = (input: HTMLInputElement): void => {
    icons.get(input)?.remove();
    icons.delete(input);
  };

  return {
    track: (input) => {
      if (!icons.has(input)) {
        icons.set(input, addAliasButton(input, api));
      }
    },
    refresh: () => {
      for (const [input, icon] of icons) {
        if (input.isConnected) {
          icon.reposition();
        } else {
          untrack(input);
        }
      }
    },
    removeAll: () => {
      for (const input of icons.keys()) {
        untrack(input);
      }
    },
  };
}
