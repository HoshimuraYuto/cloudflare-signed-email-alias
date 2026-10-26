import { createRemoteJWKSet, errors, jwtVerify, type JWTVerifyGetKey } from "jose";

const ACCESS_JWT_HEADER = "Cf-Access-Jwt-Assertion";
const ACCESS_ALGORITHM = "RS256";

/** jose errors that mean the token is not acceptable, as opposed to the certs being unreachable. */
const REJECTED_TOKEN_ERRORS = [
  errors.JWTClaimValidationFailed,
  errors.JWTExpired,
  errors.JWTInvalid,
  errors.JWSInvalid,
  errors.JWSSignatureVerificationFailed,
  errors.JOSEAlgNotAllowed,
  errors.JWKSNoMatchingKey,
  errors.JWKSMultipleMatchingKeys,
];

interface AccessSettings {
  /** `<team>.cloudflareaccess.com` */
  teamDomain: string;
  /** Application Audience (AUD) tag of the Access application. */
  audience: string;
  /** Client ID of the service token allowed to call the API. */
  clientId: string;
}

let cachedKeySet: { teamDomain: string; keySet: JWTVerifyGetKey } | undefined;

/**
 * Tells whether the request carries an Access JWT issued to the allowed service token.
 * Throws when the settings are unusable or the Access certs cannot be fetched.
 */
export async function isFromAccess(request: Request, settings: AccessSettings): Promise<boolean> {
  if (Object.values(settings).some((value) => value === "")) {
    throw new Error("ACCESS_TEAM_DOMAIN, ACCESS_AUD and ACCESS_CLIENT_ID must be set");
  }
  const token = request.headers.get(ACCESS_JWT_HEADER);
  if (token === null) {
    return false;
  }
  try {
    const { payload } = await jwtVerify(token, accessKeySet(settings.teamDomain), {
      issuer: `https://${settings.teamDomain}`,
      audience: settings.audience,
      algorithms: [ACCESS_ALGORITHM],
    });
    return payload["common_name"] === settings.clientId;
  } catch (error) {
    if (REJECTED_TOKEN_ERRORS.some((rejected) => error instanceof rejected)) {
      return false;
    }
    throw error;
  }
}

/** Keeps one key set per isolate, so the certs are cached instead of fetched on every request. */
function accessKeySet(teamDomain: string): JWTVerifyGetKey {
  if (cachedKeySet?.teamDomain !== teamDomain) {
    const certs = new URL(`https://${teamDomain}/cdn-cgi/access/certs`);
    cachedKeySet = { teamDomain, keySet: createRemoteJWKSet(certs) };
  }
  return cachedKeySet.keySet;
}
