import { browser } from "wxt/browser";
import { defineContentScript } from "wxt/utils/define-content-script";

import { createScanner } from "../content/scanner.mts";
import { createTracker } from "../content/tracker.mts";
import {
  CREATE_ALIAS,
  failure,
  isCreateAliasResult,
  isDomainList,
  LIST_DOMAINS,
  type CreateAliasResult,
} from "../shared/messages.mts";

export default defineContentScript({
  matches: ["https://*/*", "http://*/*"],
  allFrames: true,
  runAt: "document_idle",
  main(context) {
    const tracker = createTracker({ listDomains, requestAlias });
    const scanner = createScanner({ onInput: tracker.track, onRemoval: tracker.refresh });
    let frame = 0;
    const refreshOnNextFrame = (): void => {
      frame ||= requestAnimationFrame(() => {
        frame = 0;
        tracker.refresh();
      });
    };

    scanner.start();
    addEventListener("scroll", refreshOnNextFrame, { passive: true, capture: true });
    addEventListener("resize", refreshOnNextFrame, { passive: true });
    context.onInvalidated(() => {
      scanner.stop();
      cancelAnimationFrame(frame);
      removeEventListener("scroll", refreshOnNextFrame, { capture: true });
      removeEventListener("resize", refreshOnNextFrame);
      tracker.removeAll();
    });
  },
});

async function listDomains(): Promise<string[]> {
  const response: unknown = await browser.runtime.sendMessage({ type: LIST_DOMAINS });
  return isDomainList(response) ? response : [];
}

async function requestAlias(domain: string | null): Promise<CreateAliasResult> {
  const response: unknown = await browser.runtime.sendMessage({ type: CREATE_ALIAS, domain });
  return isCreateAliasResult(response) ? response : failure("failed");
}
