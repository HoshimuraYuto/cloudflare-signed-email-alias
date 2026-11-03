import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";

import { createAliasFor, listDomainsFor } from "../background/create-alias.mts";
import { isCreateAliasMessage, isListDomainsMessage } from "../shared/messages.mts";
import { originPattern } from "../shared/settings.mts";
import { readSettings } from "../shared/storage.mts";

export default defineBackground(() => {
  const dependencies = {
    extensionId: browser.runtime.id,
    readSettings,
    hasHostPermission: (origin: string) =>
      browser.permissions.contains({ origins: [originPattern(origin)] }),
    fetch,
  };
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (isListDomainsMessage(message)) {
      void listDomainsFor(sender, dependencies).then(sendResponse);
      return true;
    }
    if (!isCreateAliasMessage(message)) {
      return false;
    }
    void createAliasFor({ sender, domain: message.domain }, dependencies).then((result) => {
      if (!result.ok && result.reason === "not-configured") {
        void browser.runtime.openOptionsPage();
      }
      sendResponse(result);
    });
    return true;
  });
});
