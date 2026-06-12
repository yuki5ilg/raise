/**
 * raise アップロードAPI（Cloudflare Worker）
 *
 * サイトの「＋動画を追加する」「＋写真を追加する」フォームから受け取った内容を
 * GitHub リポジトリに自動コミットする。
 *
 *   POST /add-videos   { videos: [{ title, url }, ...] }       … 非公開動画を追記
 *   POST /add-photos   { photos: [{ name, data(base64 jpeg) }] } … 写真を保存・追記
 *   POST /delete-video { pass, url }   … 非公開動画を削除（要 DELETE_PASS）
 *   POST /delete-photo { pass, src }   … 写真を削除（要 DELETE_PASS）
 *   POST /put-vault    { pass, content } … 限定公開(private.enc)を保存（要 DELETE_PASS）
 *
 * 環境変数（Workerの Settings → Variables で設定）:
 *   GITHUB_TOKEN   … Fine-grained PAT（対象リポジトリの Contents: Read and write）※必須・Secret推奨
 *   DELETE_PASS    … 削除・限定公開保存に必要な数字パスワード（限定公開の復号番号と揃える。例 3810）
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
    const repo = env.REPO || "yuki5ilg/raise";
    // 削除など破壊的操作は数字パスワード(DELETE_PASS)で保護する。
    // 限定公開(private.enc)の保存も同じ番号で守る（復号番号3810と揃える運用）。
    const passOk = !!env.DELETE_PASS && String(body.pass || "") === String(env.DELETE_PASS);
    const denyPass = () =>
      json(
        { error: env.DELETE_PASS ? "パスワードが違います" : "削除用パスワード(DELETE_PASS)が未設定です" },
        403
      );
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
    const deleteFile = async (path, message) => {
      const res = await gh(`contents/${path}`);
      if (res.status === 404) return; // すでに無い
      if (!res.ok) throw new Error(`GitHub読み取り失敗(${res.status}): ${path}`);
      const data = await res.json();
      const del = await gh(`contents/${path}`, {
        method: "DELETE",
        body: JSON.stringify({ message, sha: data.sha }),
      });
      if (!del.ok && del.status !== 404) {
        const e = await del.json().catch(() => ({}));
        throw new Error(e.message || `GitHub削除失敗: ${path}`);
      }
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

      // ===== 動画の削除（非公開：videos.json から url で消す）=====
      if (url.pathname === "/delete-video") {
        if (!passOk) return denyPass();
        const vurl = String(body.url || "").trim();
        if (!vurl) return json({ error: "urlがありません" }, 400);
        const { sha, text } = await getFile("data/videos.json");
        const data = text ? JSON.parse(text) : { videos: [] };
        const before = (data.videos || []).length;
        data.videos = (data.videos || []).filter((v) => v.url !== vurl);
        if (data.videos.length === before) return json({ error: "該当する動画が見つかりません" }, 404);
        await putFile(
          "data/videos.json",
          b64encode(JSON.stringify(data, null, 2) + "\n"),
          `chore: 動画を削除 [skip ci]`,
          sha
        );
        return json({ ok: true });
      }

      // ===== 写真の削除（gallery.json から消し、画像ファイルも消す）=====
      if (url.pathname === "/delete-photo") {
        if (!passOk) return denyPass();
        const src = String(body.src || "").trim();
        if (!src) return json({ error: "srcがありません" }, 400);
        const { sha, text } = await getFile("data/gallery.json");
        const data = text ? JSON.parse(text) : { photos: [] };
        const before = (data.photos || []).length;
        data.photos = (data.photos || []).filter((p) => p.src !== src);
        if (data.photos.length === before) return json({ error: "該当する写真が見つかりません" }, 404);
        await putFile(
          "data/gallery.json",
          b64encode(JSON.stringify(data, null, 2) + "\n"),
          `chore: ギャラリー写真を削除 [skip ci]`,
          sha
        );
        // 画像ファイル本体も削除（アップロードした images/gallery/ 配下のみ）
        if (/^images\/gallery\//.test(src)) {
          try { await deleteFile(src, `chore: ギャラリー画像を削除 [skip ci]`); } catch (_) {}
        }
        return json({ ok: true });
      }

      // ===== 限定公開動画の保存（暗号化済みblobをそのままコミット）=====
      // クライアント側で復号→追加/削除→再暗号化した private.enc の中身(base64文字列)を受け取る。
      if (url.pathname === "/put-vault") {
        if (!passOk) return denyPass();
        const content = String(body.content || "");
        if (!content) return json({ error: "contentがありません" }, 400);
        const { sha } = await getFile("data/private.enc");
        await putFile(
          "data/private.enc",
          b64encode(content),
          `chore: 限定公開動画を更新 [skip ci]`,
          sha
        );
        return json({ ok: true });
      }

      return json({ error: "不明なエンドポイント" }, 404);
    } catch (err) {
      return json({ error: err.message || "サーバーエラー" }, 500);
    }
  },
};
