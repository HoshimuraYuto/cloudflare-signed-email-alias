import type { AliasFailure, CreateAliasResult } from "../shared/messages.mts";
import { fillInput } from "./fill.mts";
import { attachIcon, DEFAULT_COLOUR, LABEL, type AliasIcon } from "./icon.mts";

const FAILURE_MESSAGES: Record<AliasFailure, string> = {
  "not-configured": "Set the API URL and service token in the extension options first.",
  "no-permission": "Allow access to the API in the extension options.",
  unreachable: "The API could not be reached. Is WARP connected?",
  refused: "The API refused the request. Check WARP and the service token.",
  failed: "The alias could not be created.",
};
const OBSCURED_MESSAGE = "The page hides or covers this button, so the click was ignored.";
const ERROR_COLOUR = "#d93025";
const FAILURE_DISPLAY_MS = 5000;

export interface AliasApi {
  listDomains: () => Promise<string[]>;
  requestAlias: (domain: string | null) => Promise<CreateAliasResult>;
}

export function addAliasButton(input: HTMLInputElement, api: AliasApi): AliasIcon {
  let busy = false;
  let failureTimer: ReturnType<typeof setTimeout> | undefined;
  const reset = (cursor: string): void => {
    clearTimeout(failureTimer);
    icon.showMessage(null);
    showState(icon.button, { colour: DEFAULT_COLOUR, label: LABEL, cursor });
  };
  const showFailure = (label: string): void => {
    clearTimeout(failureTimer);
    icon.showMessage(label);
    showState(icon.button, { colour: ERROR_COLOUR, label, cursor: "pointer" });
    failureTimer = setTimeout(() => {
      reset("pointer");
    }, FAILURE_DISPLAY_MS);
  };
  const create = (domain: string | null): void => {
    if (busy) {
      return;
    }
    busy = true;
    reset("progress");
    void api
      .requestAlias(domain)
      .catch((): CreateAliasResult => ({ ok: false, reason: "failed" }))
      .then((result) => {
        reset("pointer");
        if (result.ok) {
          fillInput(input, result.email);
        } else {
          showFailure(FAILURE_MESSAGES[result.reason]);
        }
      })
      .finally(() => {
        busy = false;
      });
  };
  const onActivate = (): void => {
    if (icon.isMenuOpen()) {
      icon.hideMenu();
      return;
    }
    if (busy) {
      return;
    }
    reset("pointer");
    void api
      .listDomains()
      .catch((): string[] => [])
      .then((domains) => {
        if (domains.length < 2) {
          create(null);
        } else {
          icon.showMenu(domains, create);
        }
      });
  };
  const icon = attachIcon(input, {
    onActivate,
    onObscuredClick: () => {
      showFailure(OBSCURED_MESSAGE);
    },
  });
  return icon;
}

function showState(
  button: HTMLButtonElement,
  state: { colour: string; label: string; cursor: string },
): void {
  button.style.color = state.colour;
  button.style.cursor = state.cursor;
  button.title = state.label;
  button.setAttribute("aria-label", state.label);
}
