import { importSigningKey, verifyAddress } from "./address.mts";
import { parseForwarding } from "./forwarding.mts";

const REJECT_REASON = "Unknown address";

type IncomingMail = Pick<ForwardableEmailMessage, "to" | "forward" | "setReject">;

interface MailSettings {
  signingKey: string;
  /** FORWARD_TO as parseForwarding reads it. */
  forwarding: string;
}

/**
 * Forwards mail sent to a correctly signed alias to the inbox of its domain and rejects
 * everything else. Throws when the settings are unusable, so the sending server retries later
 * instead of the mail being lost.
 */
export async function handleEmail(message: IncomingMail, settings: MailSettings): Promise<void> {
  const key = await importSigningKey(settings.signingKey);
  const forwarding = parseForwarding(settings.forwarding);
  const domain = message.to.trim().toLowerCase().split("@").at(-1) ?? "";
  const inbox = forwarding.get(domain);
  if (inbox !== undefined && (await verifyAddress(message.to, key))) {
    await message.forward(inbox);
    return;
  }
  message.setReject(REJECT_REASON);
}
