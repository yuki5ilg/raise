# raise — Badminton Team Homepage

バドミントンチーム「raise」の公式ホームページです。
モダンでスマホでも綺麗に見えるデザイン。ビルド不要、そのままブラウザで開けます。

## 使い方

1. `index.html` をブラウザで開く
2. ログイン画面で合言葉に **`raise`** と入力すると、ホームページが表示されます

> 合言葉は大文字・小文字どちらでもOKです。同じブラウザのセッション中は再入力不要です。

## ファイル構成

| ファイル | 役割 |
| --- | --- |
| `index.html` | ページ本体（ログイン画面 + ホームページ） |
| `styles.css` | デザイン・レスポンシブ対応 |
| `script.js` | ログイン判定・アニメーション |

## あとから写真を追加する方法

写真を入れたい場所には `data-photo` という目印が付いた要素があります（メンバー紹介・ギャラリー）。
そこに背景画像を設定すると、自動で「PHOTO」のプレースホルダー表示が消えます。

例：メンバーやギャラリーの写真を差し替える場合、HTML を次のように編集します。

```html
<!-- 変更前 -->
<div class="gallery__item reveal" data-photo></div>

<!-- 変更後（images フォルダに置いた写真を指定） -->
<div class="gallery__item reveal" data-photo
     style="background-image:url('images/practice01.jpg'); background-size:cover; background-position:center;"></div>
```

画像は `images/` フォルダなどを作ってまとめておくと管理しやすいです。

## カスタマイズ

- **合言葉を変える**：`script.js` の先頭 `const PASSCODE = "raise";` を編集
- **テーマカラーを変える**：`styles.css` 上部の `:root` 内の色（`--brand` など）を編集
- **連絡先メール**：`index.html` の `mailto:raise.badminton@example.com` を本物のアドレスに変更
- **スケジュールやメンバー名**：`index.html` の該当箇所のテキストを編集

## 補足

- 文章・スケジュール・メンバー名・体育館名などは仮の内容です。実際の情報に合わせて編集してください。
- このログインは簡易的な「合言葉ゲート」です。本格的な認証ではないため、機密情報の保護用途には使わないでください。
