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
- Mail to an address with a valid signature is forwarded to your inbox. Anything else is
  rejected.
- The API that creates addresses sits behind Cloudflare Access. Only a request with your
  service token, from a device enrolled in your Zero Trust organization, gets through, and
  the Worker checks the Access token again.

## Requirements

- **A domain on Cloudflare whose incoming mail is used only for aliases.** Every message
  sent to the domain goes to this Worker, so it cannot receive mail anywhere else.
  Deployment stops if the domain's catch-all rule already points somewhere else. The
  domain stays free for everything else: websites, other DNS records, and sending mail
  through another service once its SPF entry is merged into the record Email Routing adds.
- A Cloudflare account with Zero Trust enabled (the free plan is enough).
- A password manager with an addy.io forwarder that accepts a custom server URL, such as
  Bitwarden. Bitwarden's web vault cannot use it: browsers send a preflight request that
  Access rejects.
- [mise](https://mise.jdx.dev/), which installs the Node.js, pnpm and OpenTofu versions
  this repository pins.

## One-time setup

1. In Zero Trust, allow your devices to enroll (Device enrollment permissions), then
   install the Cloudflare One Client (Cloudflare One Agent on mobile) on each device and
   log in with your team name.
2. Create an Access service token. Store its client ID and secret in your password
   manager; you need its name for deployment.
3. Create a signing key and store it in your password manager:

   ```sh
   openssl rand -base64 32
   ```

   Keep this key. Every address ever created depends on it: lose it and mail to all of
   them stops; deploy again with the same key and they work again.

4. Create an API token limited to your account with these permissions:

   | Scope   | Permission                                                  |
   | ------- | ----------------------------------------------------------- |
   | Account | Workers Scripts: Edit                                       |
   | Account | Access: Apps and Policies: Edit                             |
   | Account | Access: Service Tokens: Read                                |
   | Account | Access: Organizations, Identity Providers, and Groups: Read |
   | Account | Zero Trust: Edit                                            |
   | Account | Email Routing Addresses: Edit                               |
   | Zone    | Zone: Read                                                  |
   | Zone    | Zone Settings: Edit                                         |
   | Zone    | Email Routing Rules: Edit                                   |

5. Choose a passphrase that encrypts the OpenTofu state (16 characters or more) and store
   it in your password manager.

## Deploy

```sh
mise install
pnpm install
pnpm run deploy
```

`pnpm run deploy` reads its settings from environment variables. Read the secret ones from
your password manager's CLI into the environment; do not write them to a file.

| Variable                | Value                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | The API token from setup step 4                                                                                           |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID                                                                                                |
| `SIGNING_KEY`           | The signing key from setup step 3                                                                                         |
| `STATE_PASSPHRASE`      | The passphrase from setup step 5                                                                                          |
| `ALIAS_DOMAIN`          | The domain used only for aliases                                                                                          |
| `API_HOSTNAME`          | A hostname in that domain for the API, such as `alias-api.example.com`                                                    |
| `FORWARD_TO`            | The inbox that receives your mail                                                                                         |
| `SERVICE_TOKEN_NAME`    | The name of the service token from setup step 2                                                                           |
| `MANAGE_DEVICE_PROFILE` | Optional. `true` lets this project overwrite the split tunnel of your default device profile                              |
| `STATE_FILE`            | Optional. Where the encrypted state is kept; defaults to `~/.local/state/cloudflare-signed-email-alias/terraform.tfstate` |

The command deploys the Worker, shows the Cloudflare changes and waits for your approval,
then passes the Access values to the Worker. Run it again after any change; it is safe to
repeat.

After the first deployment:

- Cloudflare sends a verification email to `FORWARD_TO`. Mail is forwarded only after you
  select **Verify email address** in it.
- Unless `MANAGE_DEVICE_PROFILE` is `true`, add the hosts that the `warp_include` output
  lists to your device profile's split tunnel (include mode). Devices that do not send
  them through the Cloudflare One client cannot reach the API.

## Set up the password manager

In Bitwarden, open **Generator** → **Username**, set **Type** to **Forwarded email alias**
and **Service** to **Addy.io**, and enter:

| Field                | Value                                                                               |
| -------------------- | ----------------------------------------------------------------------------------- |
| API Key              | `{"cf-access-client-id":"<client ID>","cf-access-client-secret":"<client secret>"}` |
| Email domain         | Your alias domain                                                                   |
| Self-host server URL | `https://<API_HOSTNAME>`, without a trailing `/`                                    |

Create addresses from a login item's edit screen: the domain of the item's website then
becomes the first part of the address. Addresses created from the generator tab start with
`mail`.

## Remove

```sh
pnpm run destroy
```

It uses the same environment variables except `SIGNING_KEY`, asks you to type the alias
domain, then removes the Worker and everything deployment created. It prints the few things
created by hand that you remove yourself.

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
