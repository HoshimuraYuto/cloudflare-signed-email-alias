import { isFromAccess } from "./access.mts";
import { handleApi } from "./api.mts";
import { handleEmail } from "./email.mts";

export default {
  async fetch(request, env, _ctx) {
    const access = {
      teamDomain: env.ACCESS_TEAM_DOMAIN,
      audience: env.ACCESS_AUD,
      clientId: env.ACCESS_CLIENT_ID,
    };
    if (!(await isFromAccess(request, access))) {
      return Response.json({ message: "Forbidden" }, { status: 403 });
    }
    return handleApi(request, { signingKey: env.SIGNING_KEY, forwarding: env.FORWARD_TO });
  },
  async email(message, env, _ctx) {
    await handleEmail(message, {
      signingKey: env.SIGNING_KEY,
      forwarding: env.FORWARD_TO,
      revoked: env.REVOKED_ALIASES,
    });
  },
} satisfies ExportedHandler<Env>;
