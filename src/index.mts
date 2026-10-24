import { handleApi } from "./api.mts";
import { handleEmail } from "./email.mts";

export default {
  async fetch(request, env, _ctx) {
    return handleApi(request, { signingKey: env.SIGNING_KEY, aliasDomains: env.ALIAS_DOMAINS });
  },
  async email(message, env, _ctx) {
    await handleEmail(message, { signingKey: env.SIGNING_KEY, forwardTo: env.FORWARD_TO });
  },
} satisfies ExportedHandler<Env>;
