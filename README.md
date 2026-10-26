# Cloudflare Signed Email Alias

English | [日本語](README.ja.md)

Not an official Cloudflare project.

A Cloudflare Worker that gives every site its own email address and forwards mail sent to
those addresses to your inbox. Your password manager creates the addresses through an
addy.io-compatible API. The Worker stores nothing: each address carries a signature, and
mail is accepted only when the signature matches.

## How it works

- Addresses look like `amazon.k7q2.x3m9p0ab@example.com`: the site, a random
  part, and a signature made with your signing key.
- Mail to an address with a valid signature is forwarded to the inbox of its domain.
  Anything else is rejected.
- One deployment can serve several alias domains. Each has its own inbox and its own API
  hostname, and an API hostname creates addresses only in its own domain.
- The API that creates addresses sits behind Cloudflare Access. Only a request with your
  service token, from a device enrolled in your Zero Trust organization, gets through, and
  the Worker checks the Access token again.

## Requirements

- **One or more domains on Cloudflare whose incoming mail is used only for aliases.**
  - Every message sent to such a domain goes to this Worker, so it cannot receive mail
    anywhere else.
  - Deployment stops if a domain's catch-all rule already points somewhere else.
  - Everything else stays free: websites, other DNS records, and sending mail through
    another service once its SPF entry is merged into the record Email Routing adds.
- A Cloudflare account with Zero Trust enabled (the free plan is enough).
- A password manager with an addy.io forwarder that accepts a custom server URL, such as
  Bitwarden. Bitwarden's web vault cannot use it: browsers send a preflight request that
  Access rejects.
- macOS or Linux to deploy from, with `openssl`.
- [mise](https://mise.jdx.dev/), which installs the Node.js, pnpm and OpenTofu versions
  this repository pins.

## One-time setup

Store each value below in your password manager; deployment reads them from there.

1. **Signing key.** Create it with:

   ```sh
   openssl rand -base64 32
   ```

   Keep this key. Every address ever created depends on it: lose it and mail to all of
   them stops; deploy again with the same key and they work again.

2. **API token.** Deploy and remove use it; mail forwarding and address creation do not.
   In the Cloudflare dashboard, open **Manage Account** → **Account API Tokens** → **Create
   Token** → **Create Custom Token**. Each permission block has one scope, and a block shows
   only the permissions available in that scope. Set up two blocks:

   | Block scope                             | Group                       | Permission                                                  |
   | --------------------------------------- | --------------------------- | ----------------------------------------------------------- |
   | Entire account                          | Developer Platform          | Workers Scripts (legacy): Edit                              |
   |                                         | Cloudflare One / Zero Trust | Access: Apps: Edit                                          |
   |                                         | Cloudflare One / Zero Trust | Access: Policies: Edit                                      |
   |                                         | Cloudflare One / Zero Trust | Access: Service Tokens: Edit                                |
   |                                         | Cloudflare One / Zero Trust | Access: Organizations, Identity Providers, and Groups: Read |
   |                                         | Cloudflare One / Zero Trust | Zero Trust: Edit                                            |
   |                                         | Email & Messaging           | Email Routing Addresses: Edit                               |
   | The alias domains only (**Add policy**) | DNS & Zones                 | Zone: Read                                                  |
   |                                         | DNS & Zones                 | DNS: Edit (only with `DMARC_POLICY`)                        |
   |                                         | DNS & Zones                 | Zone Settings: Edit                                         |
   |                                         | Email & Messaging           | Email Routing Rules: Edit                                   |

   Limit the token further at the bottom of the same screen:
   - **TTL**: the days you plan to deploy. Create a new token whenever you deploy or
     remove again; a token is shown only once.
   - **Client IP Address Filtering**: the address you deploy from. With a filter set:
     - Disconnect WARP while you deploy or remove. With the Gateway proxy on, WARP sends
       the commands out through Cloudflare, from an address the filter rejects.
     - When your own address changes, every account call fails with
       `401 Authentication error` although the token is still valid. An IPv6 address can
       change after a restart. Add the new address to the filter.

3. **State passphrase.** Choose a passphrase of 16 characters or more. It encrypts the
   record OpenTofu keeps of what it created, which includes the service token.

## Deploy

```sh
mise trust
mise install
pnpm install
pnpm run deploy
```

`pnpm run deploy` reads its settings from environment variables. Read the secret ones from
your password manager's CLI into the environment, for example with `op run` (1Password) or
`bws run` (Bitwarden Secrets Manager); do not write them to a file.

| Variable                | Value                                                                                                                             |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | The API token from setup step 2                                                                                                   |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID                                                                                                        |
| `SIGNING_KEY`           | The signing key from setup step 1                                                                                                 |
| `STATE_PASSPHRASE`      | The passphrase from setup step 3                                                                                                  |
| `FORWARD_TO`            | Each alias domain and the inbox its mail goes to, such as `example.com=you@example.net`; separate several domains with commas     |
| `API_SUBDOMAIN`         | Optional. The API hostname created in every alias domain; `email-alias-api` by default, which gives `email-alias-api.example.com` |
| `STATE_FILE`            | Optional. Where the encrypted state is kept; defaults to `~/.local/state/cloudflare-signed-email-alias/terraform.tfstate`         |

The command deploys the Worker, shows the Cloudflare changes and waits for your approval,
then passes the Access values to the Worker. Run it again after any change; it is safe to
repeat.

The output names your alias domains and inboxes; hide them before sharing it, for example
in a bug report.

### Account-wide settings

These settings exist once per Zero Trust account or per domain, so other projects may
already use them. Deployment changes them only when you set the variable to `true` (or
`DMARC_POLICY` to a policy); otherwise you configure them by hand.

| Variable                   | What it sets                                                                                                      |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `MANAGE_DEVICE_ENROLLMENT` | Adds a policy that lets the addresses in `ENROLL_EMAILS` (comma-separated) enroll devices; existing policies stay |
| `MANAGE_DEVICE_PROFILE`    | Sets the split tunnel of the default device profile to include mode with only this project's hosts                |
| `MANAGE_GATEWAY_PROXY`     | Turns on **Allow Secure Web Gateway to proxy traffic** (TCP), which the device check on the API needs             |
| `DMARC_POLICY`             | Publishes a DMARC record with this policy (`none`, `quarantine` or `reject`) on every alias domain                |

- Deployment remembers the values these had before and puts them back when you remove the
  project with `RESET_SHARED_SETTINGS=true`.
- `MANAGE_DEVICE_PROFILE` replaces the split tunnel: a profile that excluded hosts now
  sends only this project's hosts through WARP. Leave it unset if other traffic must go
  through WARP.
- `DMARC_POLICY` stops if a domain already has a DMARC record. `reject` suits domains that
  send no mail.
- Once a deployment has managed one of these, keep its variable set: applying without it
  would delete the setting, so deployment refuses to run.

### After the first deployment

With every variable above set, two steps remain:

1. **Confirm each inbox.** Cloudflare sends a verification email to every inbox in
   `FORWARD_TO`. Mail is forwarded only after you select **Verify email address** in it.
2. **Enroll each device.**
   - Install WARP (the Cloudflare One Client; Cloudflare One Agent on mobile).
   - Choose **Zero Trust security** and enter your team name: the `<team>` part of
     `<team>.cloudflareaccess.com`.
   - Sign in with the one-time PIN sent to your email address.

If the browser on a device uses its own secure DNS (DNS over HTTPS), set it to use the
operating system's DNS. WARP sends a split tunnel host through the tunnel only after it
sees the host looked up, and it cannot see lookups the browser makes itself. Until then
the API answers 403 (Forbidden).

#### Settings to make by hand

Make the settings whose variable you left unset.

- **Device enrollment** (`MANAGE_DEVICE_ENROLLMENT`): open **Zero Trust** → **Team &
  Resources** → **Devices** → the **Management** tab → **Device enrollment permissions** →
  **Manage**. Add a policy that includes your email address with the action **Allow**, and
  save.
- **Split tunnel** (`MANAGE_DEVICE_PROFILE`): add the hosts in the `warp_include` output
  to your device profile's split tunnel. Devices that do not send them through WARP cannot
  reach the API.
- **Gateway proxy** (`MANAGE_GATEWAY_PROXY`): open **Zero Trust** → **Traffic controls** →
  **Traffic settings** and turn on **Allow Secure Web Gateway to proxy traffic** with TCP.
  Without it the API answers 403 even from an enrolled device.

## Set up the password manager

In Bitwarden, open **Generator** → **Username**, set **Type** to **Forwarded email alias**
and **Service** to **Addy.io**, and enter:

| Field                | Value                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------ |
| API Key              | The output of `pnpm run service-token`                                                                 |
| Email domain         | One of your own alias domains (`example.com` stands for yours)                                         |
| Self-host server URL | The API hostname of that domain, such as `https://email-alias-api.example.com`, without a trailing `/` |

`pnpm run service-token` needs only `STATE_PASSPHRASE` (and `STATE_FILE` if you set it).

To create addresses in another alias domain, change both fields to that domain.

Create addresses from a login item's edit screen: the domain of the item's website then
becomes the first part of the address. Addresses created from the generator tab start with
`mail`.

### Replace the service token

If the service token may have leaked, replace it:

```sh
pnpm run rotate-service-token
```

It uses the same environment variables as deploy. The old token stops working at once;
put the new output of `pnpm run service-token` into the password manager.

## Remove

```sh
pnpm run destroy
```

- It uses the same environment variables as deploy except `SIGNING_KEY` and
  `ENROLL_EMAILS`.
- It asks you to type every alias domain, then removes the Worker and everything
  deployment created for this project.
- The account-wide settings and the DMARC record stay, because other projects may use
  them. Set `RESET_SHARED_SETTINGS=true` to undo them too:
  - The split tunnel and the Gateway proxy go back to the values recorded when deployment
    first managed them. If the recorded split tunnel equals this project's hosts, set it
    back by hand.
  - The device enrollment permissions go back to the policies they had; the application
    stays.
- At the end it prints the few things you remove by hand.

## Security

See [SECURITY.md](SECURITY.md) to report a vulnerability.

## Development

```sh
mise trust
mise install
pnpm install
tofu -chdir=infra init -backend=false
pnpm check
```

`pnpm check` runs the formatters, linters, type checks and all tests (Worker tests in
workerd, script tests in Node.js, `tofu test` with a mocked provider) without network
access or credentials. `pnpm fix` applies the formatters and lint fixes.

Worker tests live in `test/` and script tests next to the scripts in `scripts/`: the two
run in different runtimes, each with its own `tsconfig.json` and `vitest.config.mts`.

## License

[MIT](LICENSE)
