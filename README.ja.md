# Cloudflare Signed Email Alias

[English](README.md) | 日本語

Cloudflareの公式プロジェクトではありません。

サイトごとに専用のメールアドレスを作り、そのアドレスに届いたメールを自分の受信箱へ転送するCloudflare Workerです。アドレスは、パスワードマネージャーがaddy.io互換のAPIを呼んで作ります。Workerは何も保存しません。アドレスそのものに署名が入っていて、署名が正しいメールだけを受け取ります。

## 仕組み

- アドレスは`amazon.k7q2.x3m9p0ab@example.com`の形です。先頭からサイト名、ランダムな文字列、署名鍵で作った署名が並びます。
- 署名が正しいアドレスに届いたメールは、受信箱へ転送されます。それ以外のメールは受け取りを拒否します。
- アドレスを作るAPIはCloudflare Accessで守られています。通るのは、自分のサービストークンを付け、自分のZero Trust組織に登録した端末から送ったリクエストだけです。そのうえで、WorkerもAccessのトークンを確かめ直します。

## 必要なもの

- **受信メールをエイリアス専用にできる、Cloudflare上のドメイン**。このドメインに届くメールはすべてこのWorkerが受け取るため、ほかのサービスでは受信できなくなります。ドメインのキャッチオールルールがすでに別の宛先に向いている場合、デプロイは途中で止まります。メールの受信以外には、これまでどおり使えます。ウェブサイトの公開、ほかのDNSレコードの追加、別のサービスからこのドメインでメールを送ることもできます（送信には、そのサービスのSPFの設定を、Email Routingが追加するSPFレコードにまとめる必要があります）。
- Zero Trustを有効にしたCloudflareアカウント（無料プランで足ります）。
- 接続先のサーバーURLを指定できるaddy.io連携を持つパスワードマネージャー（Bitwardenなど）。Bitwardenのウェブ保管庫からは使えません。ブラウザが送るプリフライトリクエストを、Accessが拒否するためです。
- [mise](https://mise.jdx.dev/)。このリポジトリで指定している版のNode.js、pnpm、OpenTofuを入れます。

## 最初に一度だけ行う準備

1. Zero Trustで端末の登録を許可します（Device enrollment permissions）。続けて、各端末にCloudflare One Client（モバイルではCloudflare One Agent）を入れ、チーム名を入力してログインします。
2. Accessのサービストークンを作ります。クライアントIDとシークレットはパスワードマネージャーに保存します。トークンの名前はデプロイで使います。
3. 署名鍵を作り、パスワードマネージャーに保存します。

   ```sh
   openssl rand -base64 32
   ```

   この鍵は必ず保管してください。これまでに作ったすべてのアドレスがこの鍵に依存しています。鍵をなくすと、すべてのアドレスでメールが届かなくなります。同じ鍵でデプロイし直せば、また届くようになります。

4. 対象を自分のアカウントに限ったAPIトークンを、次の権限で作ります。

   | 範囲    | 権限                                                        |
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

5. OpenTofuのstateを暗号化するパスフレーズ（16文字以上）を決め、パスワードマネージャーに保存します。

## デプロイ

```sh
mise install
pnpm install
pnpm run deploy
```

`pnpm run deploy`は設定を環境変数から読みます。秘密の値は、パスワードマネージャーのCLIで取り出して環境変数に入れてください。ファイルには書かないでください。

| 変数                    | 値                                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | 準備の手順4で作ったAPIトークン                                                                            |
| `CLOUDFLARE_ACCOUNT_ID` | CloudflareのアカウントID                                                                                  |
| `SIGNING_KEY`           | 準備の手順3で作った署名鍵                                                                                 |
| `STATE_PASSPHRASE`      | 準備の手順5で決めたパスフレーズ                                                                           |
| `ALIAS_DOMAIN`          | エイリアス専用のドメイン                                                                                  |
| `API_HOSTNAME`          | そのドメインの中でAPIに使うホスト名（例：`alias-api.example.com`）                                        |
| `FORWARD_TO`            | メールを受け取る受信箱のアドレス                                                                          |
| `SERVICE_TOKEN_NAME`    | 準備の手順2で作ったサービストークンの名前                                                                 |
| `MANAGE_DEVICE_PROFILE` | 任意。`true`にすると、既定のデバイスプロファイルのSplit Tunnelを、このプロジェクトの設定で上書きします    |
| `STATE_FILE`            | 任意。暗号化したstateの保存先。既定は`~/.local/state/cloudflare-signed-email-alias/terraform.tfstate`です |

このコマンドは、Workerをデプロイしたあと、Cloudflareに加える変更を表示して承認を待ちます。承認すると変更を反映し、最後にAccessの値をWorkerに渡します。設定を変えたときは、もう一度実行してください。何度実行しても問題ありません。

初めてデプロイしたあとに、次の2つを行います。

- Cloudflareから`FORWARD_TO`に確認メールが届きます。メールの中の**Verify email address**を押すまで、転送は始まりません。
- `MANAGE_DEVICE_PROFILE`を`true`にしていない場合は、出力`warp_include`に表示されたホストを、デバイスプロファイルのSplit Tunnel（Includeモード）に追加してください。これらのホストへの通信をCloudflare One Client経由で送っていない端末からは、APIを使えません。

## パスワードマネージャーの設定

Bitwardenで**パス生成** → **ユーザ名**を開き、**タイプ**を**転送されるメールエイリアス**、**サービス**を**Addy.io**にして、次のように入力します。

| 項目                     | 値                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------- |
| API キー                 | `{"cf-access-client-id":"<client ID>","cf-access-client-secret":"<client secret>"}` |
| メールアドレスのドメイン | エイリアス専用のドメイン                                                            |
| 自己ホスト型サーバー URL | `https://<API_HOSTNAME>`（末尾に`/`を付けない）                                     |

アドレスは、ログインアイテムの編集画面から作ってください。アイテムに登録したウェブサイトのドメインが、アドレスの先頭に入ります。パス生成のタブから作ったアドレスは、先頭が`mail`になります。

## 削除

```sh
pnpm run destroy
```

`SIGNING_KEY`以外は、デプロイと同じ環境変数を使います。確認のためにエイリアス専用のドメインを入力すると、Workerと、デプロイで作ったものをすべて削除します。手作業で作ったもののうち自分で削除する必要があるものは、最後に一覧で表示されます。

## 開発

```sh
mise install
pnpm install
tofu -chdir=infra init -backend=false
pnpm check
```

`pnpm check`は、フォーマットとリントの確認、型チェック、すべてのテストを実行します。テストは、Workerのテストをworkerdで、スクリプトのテストをNode.jsで、`tofu test`を偽のプロバイダーで実行します。ネットワークにも認証情報にも頼らずに動きます。`pnpm fix`は、フォーマットとリントの自動修正をかけます。
