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
  Every message sent to such a domain goes to this Worker, so it cannot receive mail
  anywhere else. Deployment stops if a domain's catch-all rule already points somewhere
  else. Each domain stays free for everything else: websites, other DNS records, and
  sending mail through another service once its SPF entry is merged into the record Email
  Routing adds.
- A Cloudflare account with Zero Trust enabled (the free plan is enough).
- A password manager with an addy.io forwarder that accepts a custom server URL, such as
  Bitwarden. Bitwarden's web vault cannot use it: browsers send a preflight request that
  Access rejects.
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
   |                                         | DNS & Zones                 | Zone Settings: Edit                                         |
   |                                         | Email & Messaging           | Email Routing Rules: Edit                                   |

   Limit the token further at the bottom of the same screen: set **TTL** to the days you
   plan to deploy, and **Client IP Address Filtering** to the address you deploy from.
   Create a new token whenever you deploy or remove again. The token is shown only once.

3. **State passphrase.** Choose a passphrase of 16 characters or more. It encrypts the
   record OpenTofu keeps of what it created, which includes the service token.

## Deploy

```sh
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

### Account-wide settings

Two settings exist once per Zero Trust account, so other projects may already use them.
Deployment changes them only when you set the variable to `true`; otherwise you configure
them yourself (see below). Once a deployment has managed one, keep its variable `true`:
deployment refuses to run without it, because applying would delete the setting.

| Variable                   | What `true` does                                                                    |
| -------------------------- | ----------------------------------------------------------------------------------- |
| `MANAGE_DEVICE_ENROLLMENT` | Sets who may enroll devices with the addresses in `ENROLL_EMAILS` (comma-separated) |
| `MANAGE_DEVICE_PROFILE`    | Sets the split tunnel of the default device profile with this project's hosts       |

### After the first deployment

1. **Confirm each inbox.** Cloudflare sends a verification email to every inbox in
   `FORWARD_TO`. Mail is forwarded only after you select **Verify email address** in it.
2. **Allow your devices to enroll**, unless `MANAGE_DEVICE_ENROLLMENT` is `true`. In the
   dashboard, open **Zero Trust** → **Team & Resources** → **Devices** → the **Management**
   tab → **Device enrollment permissions** → **Manage**, add a policy that includes your
   email address with the action **Allow**, and save.
3. **Route the API through the Cloudflare One Client**, unless `MANAGE_DEVICE_PROFILE` is
   `true`. Add the hosts in the `warp_include` output to your device profile's split
   tunnel (include mode). Devices that do not send them through the client cannot reach
   the API.
4. **Enroll each device.** Install the Cloudflare One Client (Cloudflare One Agent on
   mobile), choose **Zero Trust security**, enter your team name, and sign in with the
   one-time PIN sent to your email address. The team name is the `<team>` part of
   `<team>.cloudflareaccess.com`.

## Set up the password manager

In Bitwarden, open **Generator** → **Username**, set **Type** to **Forwarded email alias**
and **Service** to **Addy.io**, and enter:

| Field                | Value                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------ |
| API Key              | The output of `pnpm run service-token` (same environment variables as deploy)                          |
| Email domain         | One of your own alias domains (`example.com` stands for yours)                                         |
| Self-host server URL | The API hostname of that domain, such as `https://email-alias-api.example.com`, without a trailing `/` |

To create addresses in another alias domain, change both fields to that domain.

Create addresses from a login item's edit screen: the domain of the item's website then
becomes the first part of the address. Addresses created from the generator tab start with
`mail`.

## Remove

```sh
pnpm run destroy
```

It uses the same environment variables except `SIGNING_KEY` and `ENROLL_EMAILS`, asks you to type every alias
domain, then removes the Worker and everything deployment created for this project. The
account-wide settings stay, because other projects may use them; set
`RESET_SHARED_SETTINGS=true` to remove them too and restore the default split tunnel. It
prints the few things you remove yourself.

## Development

```sh
mise install
pnpm install
tofu -chdir=infra init -backend=false
pnpm check
```

`pnpm check` runs the formatters, linters, type checks and all tests (Worker tests in
workerd, script tests in Node.js, `tofu test` with a mocked provider) without network
access or credentials. `pnpm fix` applies the formatters and lint fixes.
