import { cf } from "./cf.mts";
import { confirmDomains } from "./confirm.mts";
import { readSettings, WORKER_NAME } from "./settings.mts";
import { SHARED_RESOURCES } from "./shared-resources.mts";
import { resetSharedSettings } from "./shared-settings.mts";
import { initTofu, stateResources, tofu } from "./tofu.mts";

const KEPT_SHARED = `Kept, because other projects may use them (RESET_SHARED_SETTINGS=true undoes them):
  - the split tunnel, Gateway proxy and device enrollment settings, if this project managed them
  - the DMARC record, if DMARC_POLICY was set`;

const LEFT_FOR_YOU = `Remove these by hand; they were created outside this project:
  - the forwarder set up in your password manager, and the service token stored there
  - the Cloudflare One Client on your devices, if you enrolled them only for this
  - the API token this run used
Keep SIGNING_KEY if you may deploy again: the same key makes old aliases valid again.`;

const settings = readSettings(process.env, "destroy");
const domains = [...settings.forwarding.keys()];
await confirmDomains(domains, `Every alias at ${domains.join(", ")} stops receiving mail.`);
await initTofu(settings);
if (settings.resetSharedSettings) {
  await resetSharedSettings(settings, await stateResources(settings));
}
const kept = settings.resetSharedSettings ? [] : Object.values(SHARED_RESOURCES).flat();
await tofu(settings, ["destroy", ...kept.map((name) => `-exclude=${name}`)]);
for (const domain of domains) {
  await disableCatchAll(domain);
}
await cf(["workers", "delete", WORKER_NAME, "--force"]);
console.log(settings.resetSharedSettings ? LEFT_FOR_YOU : `${KEPT_SHARED}\n${LEFT_FOR_YOU}`);

// The provider leaves the catch-all in place on destroy.
async function disableCatchAll(domain: string): Promise<void> {
  await cf([
    "email-routing",
    "rules",
    "catch-all",
    "update",
    "--zone",
    domain,
    "--enabled=false",
    "--matchers",
    JSON.stringify([{ type: "all" }]),
    "--actions",
    JSON.stringify([{ type: "drop" }]),
  ]);
}
