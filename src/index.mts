import { handleEmail } from "./email.mts";

export default {
  async email(message, env, _ctx) {
    await handleEmail(message, { signingKey: env.SIGNING_KEY, forwardTo: env.FORWARD_TO });
  },
} satisfies ExportedHandler<Env>;
