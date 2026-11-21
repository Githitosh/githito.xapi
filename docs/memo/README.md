# アカウント一覧の置き場所

収集アルゴリズム（`people.mjs` / `humor.mjs` / `humor-find.mjs` / `stock.mjs` など）は **この公開リポジトリ** にあります。
アカウントの名前そのものの扱いだけ分けます。

| ファイル | 置き場所 | 用途 |
|---|---|---|
| `news-famous.json` | **公開**（このフォルダ＝`docs/memo/`） | ニュース用の登録アカウント（本人投稿 → ニュース動画） |
| `humor-accounts.json` | **非公開のみ**（`githito.memo`） | ユーモア用の登録アカウント（恋愛リプライ → ユーモア動画）。プライバシーのため公開リポジトリには置きません |
| `accounts.json` | 非公開（`githito.memo`） | 読者が Settings から頼んだ「リプライを流すアカウント」（ingest が書く） |
| `news-read.json` | 非公開（`githito.memo`） | ニュースで誰をいつ読んだか（people.mjs が書く） |

## ニュース（公開）

`docs/memo/news-famous.json` がソースです。Collect は毎回ここを読みます。
形式: `{ "ja": [{ "h", "k?", "g?" }], "en": [...] }`

## ユーモア（非公開）

一覧は非公開リポジトリ `githito.memo`（または変数 `MEMO_REPO`）のルートの `humor-accounts.json` だけです（旧名 `humor-memo-*.json` は使わず、この1ファイルに揃えます）。
`humor-find.mjs` が約30分ごとに約50件追記し（カップル寄り優先・目標おおよそ2000件）、MEMO_TOKEN で書き戻します。
アカウント名は公開の README・実行ログ・`api` ブランチ・ユーモア動画には出しません（本文のみ）。

ニュースとユーモアの一覧は混ぜません。
