import { importSigningKey, verifyAddress } from "./address.mts";
import { parseForwarding } from "./forwarding.mts";
import { parseRevoked } from "./revoked.mts";

const REJECT_REASON = "Unknown address";

type IncomingMail = Pick<ForwardableEmailMessage, "to" | "forward" | "setReject">;

interface MailSettings {
  signingKey: string;
  /** FORWARD_TO as parseForwarding reads it. */
  forwarding: string;
  /** REVOKED_ALIASES as parseRevoked reads it. */
  revoked: string;
}

/**
 * Forwards mail sent to a correctly signed alias to the inbox of its domain and rejects
 * everything else. Throws when the settings are unusable, so the sending server retries later
 * instead of the mail being lost.
 */
export async function handleEmail(message: IncomingMail, settings: MailSettings): Promise<void> {
  const key = await importSigningKey(settings.signingKey);
  const forwarding = parseForwarding(settings.forwarding);
  const revoked = parseRevoked(settings.revoked);
  const to = message.to.trim().toLowerCase();
  const inbox = forwarding.get(to.split("@").at(-1) ?? "");
  // A revoked alias gets the same answer as an unknown one, so the reply reveals nothing.
  if (inbox !== undefined && !revoked.has(to) && (await verifyAddress(to, key))) {
    await message.forward(inbox);
    return;
  }
  message.setReject(REJECT_REASON);
}
