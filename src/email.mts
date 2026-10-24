import { importSigningKey, verifyAddress } from "./address.mts";

const REJECT_REASON = "Unknown address";

type IncomingMail = Pick<ForwardableEmailMessage, "to" | "forward" | "setReject">;

interface MailSettings {
  signingKey: string;
  forwardTo: string;
}

/**
 * Forwards mail sent to a correctly signed alias and rejects everything else.
 * Throws when the settings are unusable, so the sending server retries later
 * instead of the mail being lost.
 */
export async function handleEmail(message: IncomingMail, settings: MailSettings): Promise<void> {
  const key = await importSigningKey(settings.signingKey);
  if (settings.forwardTo === "") {
    throw new Error("FORWARD_TO is not set");
  }
  if (await verifyAddress(message.to, key)) {
    await message.forward(settings.forwardTo);
    return;
  }
  message.setReject(REJECT_REASON);
}
