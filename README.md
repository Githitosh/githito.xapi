# githito.xapi

リプライニュース（https://githitosh.github.io/reply-news/ ）のための、**自分専用の「偽検索API」**です。

ページはXを直接検索しません。このリポジトリのプログラムが、あらかじめ1日3回、Xの投稿とリプライを集めて
ファイルに保存しておき、ページはそのファイルを「検索結果」として読みます。検索を待たないので、動画がすぐ作れます。
プログラムもデータもこのリポジトリの中にあり、内容を変えられるのは持ち主だけです。

## APIの入口

ブランチ `api` に置いたファイルが、そのままAPIの応答です（GitHub が配信します。鍵は要りません）。

| 入口 | 内容 |
|---|---|
| `https://raw.githubusercontent.com/Githitosh/githito.xapi/api/v1/talks-ja.json` | その日の会話すべて（日本語、最大500件） |
| `https://raw.githubusercontent.com/Githitosh/githito.xapi/api/v1/search/ja/food.json` | ジャンルごとの会話（`food` の部分がジャンル） |
| `https://raw.githubusercontent.com/Githitosh/githito.xapi/api/v1/index.json` | 最終更新の時刻と、ジャンルごとの件数 |

ジャンル：`space` `politics` `science` `culture` `local` `entertainment` `safety` `sports` `food`
`restaurant` `romance` `travel`

## いつ更新されるか

毎日 **6時・12時・18時（日本時間）** に、`.github/workflows/collect.yml` が `collect.mjs` を動かします。
1回で新しい会話を約170件集め、新しいものから500件を残します（48時間たった会話は消えます）。
GitHub の都合で、開始が数分〜十数分遅れることがあります。
Actions タブ →「Collect」→ Run workflow で、すぐ1回動かすこともできます。

## どこから集めるか（`config.json` の `source`）

**今は `off` で、まだ何も集めていません。** 次のどちらかに変えると動き始めます。

| 値 | 取得元 | 必要なもの |
|---|---|---|
| `official` | X公式のAPI | Xが発行する鍵（Bearer Token）。Settings → Secrets and variables → Actions に `X_BEARER_TOKEN` として保存。読んだ投稿の数に応じてXに料金を払います |
| `fxtwitter` | api.fxtwitter.com（鍵なしでXを検索できる、他社の無料サービス） | なし。ただし他社のサービスなので、止まったり仕様が変わったりすることがあります |
| `auto` | 鍵があれば `official`、なければ `off` | — |
| `off` | 集めない | — |

どちらの場合も、取得元につなぐのはこのプログラム（1日3回）だけです。ページは、このリポジトリのファイルだけを読みます。

## 何を集めるか

`words.json` のジャンルごとの言葉を順番に検索します。同じ言葉が続かないよう、最近使った言葉は後回しにします。

- 最初の投稿：個人の投稿だけ（返信・リポスト・引用は除く）。企業・官公庁の認証アカウントや、
  名前に「公式」「ニュース」などが付くアカウントは選びません。日本語は10〜110文字で、返信が付いているもの。
- リプライ：その投稿に直接付いた返信のうち、笑いやツッコミがあるもの（最大2件）。挨拶や当たりさわりのない返信は選びません。
- 暴力、性的な内容、重い話題、けんか腰の言葉、広告は、投稿・リプライのどちらにあっても選びません。

## 応答の形（`v1/talks-ja.json`）

```json
{
  "version": 1,
  "lang": "ja",
  "updated": "2026-11-18T21:04:10Z",
  "source": "official",
  "count": 500,
  "talks": [
    {
      "id": "投稿のID",
      "genre": "food",
      "word": "ラーメン",
      "found": "2026-11-18T21:02:33Z",
      "post": { "id": "…", "handle": "投稿者", "text": "投稿の文", "url": "https://x.com/…/status/…", "at": "投稿の日時" },
      "replies": [ { "id": "…", "handle": "返信者", "text": "リプライの文", "url": "https://x.com/…/status/…" } ]
    }
  ]
}
```

## 設定（`config.json`）

| 名前 | 初期値 | 意味 |
|---|---|---|
| `source` | `off` | 取得元（上の表） |
| `langs` | `["ja"]` | 集める言語。英語も集めるなら `["ja", "en"]` |
| `add` | 170 | 1回で集める新しい会話の数 |
| `keep` | 500 | APIに残す会話の数 |

## ファイル

| ファイル | 役割 |
|---|---|
| `collect.mjs` | 集めるプログラム（Node 20 以上。追加のインストールは不要） |
| `words.json` | ジャンルごとの検索語 |
| `config.json` | 設定 |
| `.github/workflows/collect.yml` | 1日3回の定期実行と、ブランチ `api` への公開 |

手元で動かす場合：

```bash
node collect.mjs --add 20
```

結果は `public/v1/` にできます。`--dry` を付けると、ファイルを変えずに件数だけ表示します。
