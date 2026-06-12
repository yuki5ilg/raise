# 動画・写真アップロードAPI のセットアップ（約10分・無料）

サイトの「＋動画を追加する」「＋写真を追加する」フォームを有効にする手順。
Cloudflare Worker が投稿を受け取り、このリポジトリに自動コミットします。

セットアップ方法は2通り。お好きな方で：
- **A. 手で貼る**（手順2〜）… Cloudflareの画面にコードを貼り付ける。シンプル
- **B. GitHub連携で自動デプロイ**（末尾の章）… 一度つなげば、以後 push のたびに自動でデプロイ。コードを貼る必要なし

どちらも手順1（GitHubトークン作成）と手順4（URLをサイトに設定）は共通です。

## 1. GitHubトークンを作る

1. GitHub → Settings → Developer settings → **Fine-grained personal access tokens** → Generate new token
2. 設定:
   - **Repository access**: Only select repositories → `yuki5ilg/raise`
   - **Permissions** → Repository permissions → **Contents: Read and write**（それ以外は不要）
   - 有効期限はお好みで（切れたら作り直して差し替え）
3. 生成されたトークン（`github_pat_...`）をコピーしておく

## 2. Cloudflare Worker を作る

1. [Cloudflare](https://dash.cloudflare.com/) に無料登録 → **Workers & Pages** → **Create Worker**
2. 名前は `raise-upload` など → Deploy
3. **Edit code** を開き、中身をぜんぶ消して `worker/worker.js` の内容を貼り付け → **Deploy**

## 3. 環境変数を設定する

Workerの **Settings → Variables and Secrets** で追加:

| 名前 | 値 | 種類 |
|---|---|---|
| `GITHUB_TOKEN` | 手順1のトークン（`github_pat_...` をそのまま。"Bearer" は付けない） | **必須・Secret（Encrypt）** |
| `DELETE_PASS` | 削除・限定公開の保存に使う数字パスワード（限定公開の復号番号と揃える。例 `3810`） | 削除機能を使うなら必須・Secret |
| `REPO` | `yuki5ilg/raise` | 省略可（既定値あり） |
| `ALLOWED_ORIGIN` | サイトのオリジン（例 `https://yuki5ilg.github.io`） | 省略可（未設定なら `*`） |

> 設定が必須なのは **`GITHUB_TOKEN`**。写真・動画の**削除**や**限定公開の登録**を使うなら **`DELETE_PASS`** も設定してね（限定公開の番号 `3810` と同じ値にするのがおすすめ）。`ALLOWED_ORIGIN` は無くても動きます。

## 4. サイトにWorkerのURLを設定する

WorkerのURL（例 `https://raise-upload.xxxx.workers.dev`）をコピーして、
`data/config.json` の `uploadApi` に入れてコミット:

```json
{ "uploadApi": "https://raise-upload.xxxx.workers.dev" }
```

## 5. 動作確認

1. サイトの動画セクション「＋動画を追加する」→ タイトルとYouTube URLを入力（行を増やせば複数同時OK）
2. ギャラリー「＋写真を追加する」→ 写真を複数選択（送信前に自動で縮小されます）
3. 「登録する」を押す → 1〜2分でサイトに反映 🎉

## 仕組み・補足

- WorkerがGitHub APIで
  `data/videos.json` / `images/gallery/` + `data/gallery.json` にコミットします
- GitHubトークンはWorker内（Secret）にだけ存在し、サイト側には一切出ません
- 写真は一度に20枚まで。クライアント側で長辺1600pxのJPEGに縮小してから送信します
- 動画は同じURLの二重登録を自動でスキップします

---

# B. GitHub連携で自動デプロイする場合

リポジトリ直下に `wrangler.toml` を用意済みです。これを使うと、Cloudflare が
GitHub と連携して **push のたびに `worker/worker.js` を自動デプロイ**します
（手順2〜3の「コードを貼り付ける」作業が不要になります）。

> 大事な前提：このリポジトリは「静的サイト」ではなく `wrangler.toml` を持つので、
> Cloudflare は**コード型のWorker**としてデプロイします。以前の
> 「Variables cannot be added to a Worker that only has static assets」エラーは出ません。

## 手順

1. 手順1の **GitHubトークン**を用意しておく（共通）
2. Cloudflare → **Workers & Pages** → **Create** → **Workers** → **Import a repository**
   （または「Connect to Git」）を選ぶ
3. GitHubを認可して **`yuki5ilg/raise`** を選択
4. ビルド設定はそのままでOK（`wrangler.toml` を自動検出します）。
   - Deploy command は既定の `npx wrangler deploy` のままでOK
   - Build command は空でOK
5. **Save and Deploy** → 初回デプロイで `raise-upload` という名前のWorkerができる
6. できたWorkerの **Settings → Variables and Secrets** で **Secret** を登録：
   - `GITHUB_TOKEN` … 手順1のトークン（`github_pat_...` をそのまま。"Bearer" は付けない）
   - ※Secret はダッシュボードに登録すれば、以後の自動デプロイでも消えません
7. WorkerのURL（例 `https://raise-upload.xxxx.workers.dev`）を `data/config.json` の
   `uploadApi` に設定してコミット（手順4と同じ）

これ以降は、`worker/worker.js` を編集して push するだけで自動的に反映されます。

## 補足
- 秘密の値（`GITHUB_TOKEN` 等）は **絶対に `wrangler.toml` に書かない**でください
  （公開リポジトリなので漏れます）。必ずダッシュボードの Secret に登録します。
- `wrangler.toml` がデプロイするのは Worker（API）だけです。サイト本体は
  これまで通り GitHub Pages で公開されます（別物・二重にはなりません）。
