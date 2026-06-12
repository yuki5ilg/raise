/**
 * raise アップロードAPI（Cloudflare Worker）
 *
 * サイトの「＋動画を追加する」「＋写真を追加する」フォームから受け取った内容を
 * GitHub リポジトリに自動コミットする。
 *
 *   POST /add-videos  { pass, videos: [{ title, url }, ...] }
 *     → data/videos.json に追記してコミット
 *   POST /add-photos  { pass, photos: [{ name, data(base64 jpeg) }, ...] }
 *     → images/gallery/ に画像を保存し data/gallery.json に追記してコミット
 *
 * 環境変数（Workerの Settings → Variables で設定）:
 *   GITHUB_TOKEN   … Fine-grained PAT（対象リポジトリの Contents: Read and write）※必須・Secret推奨
 *   UPLOAD_PASS    … 省略可。設定した場合のみ投稿パスワードを要求する（未設定なら誰でも投稿可）
 *   REPO           … 省略可。既定 "yuki5ilg/raise"
 *   ALLOWED_ORIGIN … 省略可。CORSで許可するオリジン。未設定なら "*"（どこからでも許可）
 */

export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj), {
        status,
        headers: { "Content-Type": "application/json; charset=utf-8", ...cors },
      });

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return json({ error: "POSTのみ対応" }, 405);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "JSONが不正です" }, 400);
    }
    // UPLOAD_PASS を設定したときだけパスワードを要求する（未設定なら誰でも投稿可）
    if (env.UPLOAD_PASS && body.pass !== env.UPLOAD_PASS) {
      return json({ error: "パスワードが違います" }, 403);
    }

    const repo = env.REPO || "yuki5ilg/raise";
    // トークンの前後に空白/改行が混ざると "Bad credentials" になるので落とす
    const token = (env.GITHUB_TOKEN || "").trim();
    if (!token) return json({ error: "GITHUB_TOKEN が未設定です" }, 500);
    const gh = (path, init = {}) =>
      fetch(`https://api.github.com/repos/${repo}/${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "raise-upload-worker",
          ...(init.headers || {}),
        },
      });

    // GitHub contents API ヘルパー（UTF-8セーフなbase64変換つき）
    const b64encode = (str) => {
      const bytes = new TextEncoder().encode(str);
      let bin = "";
      bytes.forEach((b) => (bin += String.fromCharCode(b)));
      return btoa(bin);
    };
    const b64decode = (b64) => {
      const bin = atob(b64.replace(/\n/g, ""));
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    };
    const getFile = async (path) => {
      const res = await gh(`contents/${path}`);
      if (res.status === 404) return { sha: undefined, text: null };
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        // GitHubの生メッセージ（例: "Bad credentials"）をそのまま見せる
        throw new Error(`GitHub読み取り失敗(${res.status}): ${e.message || path}`);
      }
      const data = await res.json();
      return { sha: data.sha, text: b64decode(data.content) };
    };
    const putFile = async (path, contentB64, message, sha) => {
      const res = await gh(`contents/${path}`, {
        method: "PUT",
        body: JSON.stringify({ message, content: contentB64, sha }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.message || `GitHub書き込み失敗: ${path}`);
      }
      return res.json();
    };

    const url = new URL(request.url);
    try {
      // ===== 動画の追加 =====
      if (url.pathname === "/add-videos") {
        const items = (body.videos || [])
          .map((v) => ({ title: String(v.title || "").trim(), url: String(v.url || "").trim() }))
          .filter((v) => /(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/)[\w-]{11}/.test(v.url));
        if (!items.length) return json({ error: "有効なYouTube URLがありません" }, 400);

        const { sha, text } = await getFile("data/videos.json");
        const data = text ? JSON.parse(text) : { videos: [] };
        data.videos = data.videos || [];
        const now = new Date().toISOString();
        for (const v of items) {
          // 同じURLは二重登録しない
          if (data.videos.some((x) => x.url === v.url)) continue;
          // added = 登録日時（時系列の並べ替えに使う）
          data.videos.push({ title: v.title || "タイトル未設定", url: v.url, private: true, added: now });
        }
        await putFile(
          "data/videos.json",
          b64encode(JSON.stringify(data, null, 2) + "\n"),
          `chore: 動画を追加 (${items.length}本) [skip ci]`,
          sha
        );
        return json({ ok: true, added: items.length });
      }

      // ===== 写真の追加 =====
      if (url.pathname === "/add-photos") {
        const photos = (body.photos || []).filter((p) => p && p.data);
        if (!photos.length) return json({ error: "写真がありません" }, 400);
        if (photos.length > 20) return json({ error: "一度に登録できるのは20枚まで" }, 400);

        const ts = Date.now();
        const now = new Date().toISOString();
        const saved = [];
        for (let i = 0; i < photos.length; i++) {
          const path = `images/gallery/${ts}-${i + 1}.jpeg`;
          await putFile(path, photos[i].data, `chore: ギャラリー写真を追加 [skip ci]`);
          // taken = 写真の撮影日(EXIF・あれば) / added = アップロード日時。並べ替えに使う
          const taken = typeof photos[i].taken === "string" ? photos[i].taken : null;
          saved.push({ src: path, alt: String(photos[i].name || "").replace(/\.[^.]+$/, ""), taken, added: now });
        }

        const { sha, text } = await getFile("data/gallery.json");
        const data = text ? JSON.parse(text) : { photos: [] };
        data.photos = (data.photos || []).concat(saved);
        await putFile(
          "data/gallery.json",
          b64encode(JSON.stringify(data, null, 2) + "\n"),
          `chore: ギャラリーを更新 (${saved.length}枚) [skip ci]`,
          sha
        );
        return json({ ok: true, added: saved.length });
      }

      return json({ error: "不明なエンドポイント" }, 404);
    } catch (err) {
      return json({ error: err.message || "サーバーエラー" }, 500);
    }
  },
};
