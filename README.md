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
`restaurant` `romance` `travel`（手で送った会話でどれにも当たらないものは `other`）

## いつ更新されるか

毎日 **6時・12時・18時（日本時間）** に、`.github/workflows/collect.yml` が `collect.mjs` を動かします。
1回で新しい会話を約170件集め、新しいものから500件を残します（48時間たった会話は消えます）。
GitHub の都合で、開始が数分〜十数分遅れることがあります。
Actions タブ →「Collect」→ Run workflow で、すぐ1回動かすこともできます。

## 自分で見つけた会話を送る（無料・鍵なし）

自分のXアカウントで普通に検索して見つけた「投稿＋返信」を、このAPIに取り込めます。

1. このリポジトリで新しい Issue を作ります。タイトルは `talk`。
2. 本文に、Xのリンクを1行ずつ書きます。**1行目が投稿、2行目以降が返信**です（返信は最大20件）。
   ```
   https://x.com/投稿した人/status/1234567890
   https://x.com/返信した人/status/1234567999
   ```
3. Submit を押すと、1〜2分で `ingest.mjs` が動いてAPIに入り、Issue は結果のコメント付きで閉じられます。

- 本文は、Xが鍵なしで公開している公式の埋め込みAPI（`publish.x.com/oembed`）で読みます。料金はかかりません。Xにログインしたり、検索を自動で行ったりはしません。
- 読むのは、**このリポジトリの持ち主が作った Issue だけ**です。ほかの人が作った Issue は無視します。
- 返信が複数あるときは、笑いやツッコミのあるものを最大2件選びます。暴力・性的な内容・重い話題・けんか腰の言葉がある投稿は入りません（理由が Issue にコメントされます）。
- ジャンルは、投稿に入っている言葉（`words.json`）から自動で決めます。指定したいときは、本文に `genre: food` のように1行足します。
- 手で送った会話は、14日間APIに残ります（自動で集めた会話は48時間）。

リプライニュースのページからも送れます。`https://githitosh.github.io/reply-news/?owner=1` を一度開くと、
「会話を追加」の欄に「xapiに送る」ボタンが出ます。投稿とリプライのリンクを貼って押すと、上の Issue の画面が内容入りで開きます。

## 自動で集める（`config.json` の `source`）

**今は `off` で、まだ何も集めていません。**

| 値 | 意味 |
|---|---|
| `official` | X公式のAPIから集めます。Xが発行する鍵（Bearer Token）を、Settings → Secrets and variables → Actions に `X_BEARER_TOKEN` として保存します |
| `auto` | 鍵があれば `official`、なければ `off` |
| `off` | 集めません |

取得元につなぐのはこのプログラム（1日3回）だけで、ほかのサービスは使いません。ページは、このリポジトリのファイルだけを読みます。

### 料金について

X公式のAPIは、返した投稿1件ごとに料金がかかります（金額はXが決めています。申し込む前にXの開発者ページで確認してください）。
払いすぎを防ぐため、1回の実行で読む投稿の数に上限（`config.json` の `reads`、初期値300）を付けています。
会話1件を作るには、検索結果と返信を合わせて数十件の投稿を読む必要があるので、`reads` が300だと1回で数件〜十数件の会話になります。
`add`（1回170件）や `keep`（500件）まで集めるには、`reads` を大きくする必要があり、そのぶん料金も増えます。

### 鍵なしでは検索できない理由

api.fxtwitter.com の元になっている公開プログラム（FxEmbed、MITライセンス、https://github.com/FxEmbed/FxEmbed ）を読んで確かめました。

- 投稿1件を読む処理：鍵もログインも不要（`requiresAccount: false`）
- 検索（`SearchTimeline`）、返信の一覧（`TweetDetail`）、ユーザーの投稿一覧（`UserTweets`）：**ログイン済みのXアカウントが必須**（`requiresAccount: true`）。
  設定ファイル（`credentials.example.json`）に、Xアカウントのログイン情報（`authToken` と `csrfToken`）を入れる作りです

つまり、同じプログラムを自分で動かしても、Xアカウントでログインさせない限り、検索と返信の取得はできません。
アカウントにログインさせて自動で検索する使い方は、Xの利用規約で禁止されていて、アカウントが凍結されることがあります。
そのため、このリポジトリには入れていません。

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
| `reads` | 300 | 1回の実行で読む投稿の数の上限（料金の上限になります） |
| `langs` | `["ja"]` | 集める言語。英語も集めるなら `["ja", "en"]` |
| `add` | 170 | 1回で集める新しい会話の数 |
| `keep` | 500 | APIに残す会話の数 |

## ファイル

| ファイル | 役割 |
|---|---|
| `collect.mjs` | 自動で集めるプログラム（Node 20 以上。追加のインストールは不要） |
| `ingest.mjs` | 手で送った会話（Issue）を取り込むプログラム |
| `rules.mjs` | 選ぶルールと、APIのファイルの書き出し（上の2つが共通で使う） |
| `words.json` | ジャンルごとの検索語 |
| `config.json` | 設定 |
| `.github/workflows/collect.yml` | 1日3回の定期実行と、ブランチ `api` への公開 |
| `.github/workflows/ingest.yml` | Issue が作られたときの取り込みと公開 |

手元で動かす場合：

```bash
node collect.mjs --add 20
```

結果は `public/v1/` にできます。`--dry` を付けると、ファイルを変えずに件数だけ表示します。
