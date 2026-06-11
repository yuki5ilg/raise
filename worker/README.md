# 動画・写真アップロードAPI のセットアップ（約10分・無料）

サイトの「＋動画を追加する」「＋写真を追加する」フォームを有効にする手順。
Cloudflare Worker が投稿を受け取り、このリポジトリに自動コミットします。

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
| `GITHUB_TOKEN` | 手順1のトークン | **Secret（Encrypt）** |
| `UPLOAD_PASS` | 投稿パスワード（メンバーに共有する合言葉。好きな文字列） | **Secret（Encrypt）** |
| `REPO` | `yuki5ilg/raise` | Text（省略可・既定値あり） |
| `ALLOWED_ORIGIN` | サイトのURLのオリジン（例 `https://yuki5ilg.github.io`） | Text（省略可） |

## 4. サイトにWorkerのURLを設定する

WorkerのURL（例 `https://raise-upload.xxxx.workers.dev`）をコピーして、
`data/config.json` の `uploadApi` に入れてコミット:

```json
{ "uploadApi": "https://raise-upload.xxxx.workers.dev" }
```

## 5. 動作確認

1. サイトの動画セクション「＋動画を追加する」→ タイトルとYouTube URLを入力（行を増やせば複数同時OK）
2. ギャラリー「＋写真を追加する」→ 写真を複数選択（送信前に自動で縮小されます）
3. 投稿パスワード（`UPLOAD_PASS`）を入れて登録 → 1〜2分でサイトに反映 🎉

## 仕組み・補足

- 投稿パスワードが合っているときだけ、WorkerがGitHub APIで
  `data/videos.json` / `images/gallery/` + `data/gallery.json` にコミットします
- GitHubトークンはWorker内（Secret）にだけ存在し、サイト側には一切出ません
- 写真は一度に20枚まで。クライアント側で長辺1600pxのJPEGに縮小してから送信します
- 動画は同じURLの二重登録を自動でスキップします
