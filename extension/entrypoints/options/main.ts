import { browser } from "wxt/browser";

import { describeToken } from "../../options/saved-view.mts";
import {
  removeOrigin,
  removeSaved,
  saveFromForm,
  type HostPermissions,
  type SaveOutcome,
  type SettingsStore,
} from "../../options/settings-form.mts";
import {
  readOrigins,
  readToken,
  removeSettings,
  saveOrigins,
  saveToken,
} from "../../shared/storage.mts";

const OUTCOME_ERRORS: Record<Exclude<SaveOutcome, "saved">, string> = {
  "invalid-url": "Enter the API URL as https://<host> with nothing after the host.",
  "invalid-token": "Paste the whole output of pnpm run service-token.",
  "duplicate-domain": "An API URL for this domain is already saved.",
  "permission-denied": "Access to the API was not allowed, so nothing was saved.",
};
const SAVE_FAILED = "The settings could not be saved.";
const TOKEN_MISSING = "The saved service token is missing or invalid. Paste it again.";
const REMOVE_FAILED = "Removing did not finish.";

type FormMode = "setup" | "add-url" | "token";

// getAll also lists the manifest's hosts and content script matches, which Chrome refuses to remove.
const manifest = browser.runtime.getManifest();
const REQUIRED_HOSTS = new Set([
  ...(manifest.host_permissions ?? []),
  ...(manifest.content_scripts ?? []).flatMap((script) => script.matches ?? []),
]);

const store: SettingsStore = { readOrigins, saveOrigins, saveToken, remove: removeSettings };
const permissions: HostPermissions = {
  request: (pattern) => browser.permissions.request({ origins: [pattern] }),
  revoke: async (pattern) => {
    await browser.permissions.remove({ origins: [pattern] });
  },
  granted: async () => {
    const { origins = [] } = await browser.permissions.getAll();
    return origins.filter((pattern) => !REQUIRED_HOSTS.has(pattern));
  },
};

const savedView = element("saved", HTMLElement);
const savedToken = element("saved-token", HTMLParagraphElement);
const originList = element("origins", HTMLUListElement);
const form = element("settings", HTMLFormElement);
const urlGroup = element("url-group", HTMLDivElement);
const tokenGroup = element("token-group", HTMLDivElement);
const urlField = element("api-url", HTMLInputElement);
const tokenField = element("service-token", HTMLInputElement);
const cancelButton = element("cancel", HTMLButtonElement);
const statusText = element("status", HTMLParagraphElement);
const errorText = element("error", HTMLParagraphElement);

let shownOrigins: string[] = [];

form.addEventListener("submit", (event) => {
  event.preventDefault();
  errorText.textContent = "";
  statusText.textContent = "";
  const fields = {
    url: urlGroup.hidden ? null : urlField.value,
    token: tokenGroup.hidden ? null : tokenField.value,
    shown: shownOrigins,
  };
  tokenField.value = "";
  void saveFromForm(fields, { store, permissions }).then(
    (outcome) => {
      if (outcome !== "saved") {
        errorText.textContent = OUTCOME_ERRORS[outcome];
        return undefined;
      }
      urlField.value = "";
      statusText.textContent = "Saved.";
      return render();
    },
    (error: unknown) => {
      // Chrome's error names the failing API call; the settings themselves are not in it.
      const detail = error instanceof Error ? error.message : String(error);
      errorText.textContent = `${SAVE_FAILED} ${detail}`;
    },
  );
});

element("change-token", HTMLButtonElement).addEventListener("click", () => {
  statusText.textContent = "";
  showForm("token", true);
});

element("add-origin", HTMLButtonElement).addEventListener("click", () => {
  statusText.textContent = "";
  showForm("add-url", true);
});

cancelButton.addEventListener("click", () => {
  urlField.value = "";
  tokenField.value = "";
  errorText.textContent = "";
  void render();
});

element("remove", HTMLButtonElement).addEventListener("click", () => {
  void settle(removeSaved({ store, permissions }), "Removed.");
});

void render();

async function render(): Promise<void> {
  const [origins, token] = await Promise.all([readOrigins(), readToken()]);
  shownOrigins = origins;
  if (token !== null) {
    savedToken.textContent = describeToken(token);
  }
  originList.replaceChildren(...origins.map(originItem));
  if (token !== null && origins.length > 0) {
    savedView.hidden = false;
    form.hidden = true;
    return;
  }
  if (token === null && origins.length > 0) {
    statusText.textContent = TOKEN_MISSING;
  }
  showForm(token !== null ? "add-url" : origins.length > 0 ? "token" : "setup", false);
}

/** Shows what a removal did, and the saved state even when Chrome refused part of it. */
async function settle(removal: Promise<void>, done: string): Promise<void> {
  statusText.textContent = await removal.then(
    () => done,
    (error: unknown) =>
      `${REMOVE_FAILED} ${error instanceof Error ? error.message : String(error)}`,
  );
  await render();
}

function showForm(mode: FormMode, cancellable: boolean): void {
  savedView.hidden = true;
  form.hidden = false;
  urlGroup.hidden = mode === "token";
  tokenGroup.hidden = mode === "add-url";
  urlField.required = !urlGroup.hidden;
  tokenField.required = !tokenGroup.hidden;
  cancelButton.hidden = !cancellable;
  (mode === "token" ? tokenField : urlField).focus();
}

function originItem(origin: string): HTMLLIElement {
  const item = document.createElement("li");
  const text = document.createElement("span");
  text.textContent = origin;
  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "Remove";
  remove.setAttribute("aria-label", `Remove ${origin}`);
  remove.addEventListener("click", () => {
    void settle(removeOrigin(origin, { store, permissions }), `Removed ${origin}.`);
  });
  item.append(text, remove);
  return item;
}

function element<T extends HTMLElement>(id: string, type: new () => T): T {
  const found = document.getElementById(id);
  if (!(found instanceof type)) {
    throw new TypeError(`#${id} is missing from the options page`);
  }
  return found;
}
