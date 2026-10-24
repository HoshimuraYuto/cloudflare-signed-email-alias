import { setupNetwork } from "@msw/cloudflare";
import { exportJWK, generateKeyPair, SignJWT, type JWTPayload } from "jose";
import { http, HttpResponse } from "msw";

/** Stands in for Cloudflare Access: publishes its certs and signs service token JWTs. */
export async function createFakeAccess(teamDomain: string) {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const kid = crypto.randomUUID();
  const jwks = { keys: [{ ...(await exportJWK(publicKey)), kid, alg: "RS256", use: "sig" }] };

  const network = setupNetwork();
  network.use(
    http.get(`https://${teamDomain}/cdn-cgi/access/certs`, () => HttpResponse.json(jwks)),
  );

  async function sign(
    claims: JWTPayload,
    options: { key?: CryptoKey; expiresIn?: string } = {},
  ): Promise<string> {
    return new SignJWT({ type: "app", sub: "", ...claims })
      .setProtectedHeader({ alg: "RS256", kid })
      .setIssuedAt()
      .setExpirationTime(options.expiresIn ?? "5m")
      .sign(options.key ?? privateKey);
  }

  return { network, sign };
}
