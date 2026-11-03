import type { ServiceToken } from "../shared/settings.mts";

const SHOWN_ID_CHARACTERS = 6;

/** The client ID is not secret, and `pnpm run service-token` prints it to compare with. */
export function describeToken(token: ServiceToken): string {
  const id = token.clientId.slice(0, -".access".length);
  return `Stored (client ID ending ${id.slice(-SHOWN_ID_CHARACTERS)})`;
}
