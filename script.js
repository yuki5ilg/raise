// ===== 設定 =====
// ログインの合言葉は平文では持たず、PBKDF2-SHA256 の検証ハッシュだけを置く。
// 入力を同じ方式でハッシュ化して照合するため、ソースを見ても元の合言葉は分からない。
// 合言葉を変えるには tools/passcode.html で新しい検証ハッシュを生成して差し替える。
const PASS_VERIFIER = {
  salt: "Wjrpxg9PgNpAYPagvVdxSA==",
  iterations: 200000,
  hash: "I2na1NZk5v2KYQLxmR3qgj1wD7oAYWsNe5YbNrpVNCU=",
};
const STORAGE_KEY = "raise_authed";

const loginEl = document.getElementById("login");
const siteEl = document.getElementById("site");
const formEl = document.getElementById("loginForm");
const inputEl = document.getElementById("passcode");
const errorEl = document.getElementById("loginError");

const b64ToBytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const bytesToB64 = (buf) => {
  let s = "";
  new Uint8Array(buf).forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s);
};

// 入力された合言葉が検証ハッシュと一致するか（PBKDF2-SHA256）
async function verifyPasscode(password) {
  const km = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: b64ToBytes(PASS_VERIFIER.salt), iterations: PASS_VERIFIER.iterations, hash: "SHA-256" },
    km, 256
  );
  return bytesToB64(bits) === PASS_VERIFIER.hash;
}

// ===== ログイン判定 =====
function showSite() {
  loginEl.hidden = true;
  loginEl.style.display = "none";
  siteEl.hidden = false;
  document.body.style.overflow = "";
  initSite();
}

function checkAuth() {
  // 一度ログインしたら同じブラウザでは再入力不要（セッション中のみ保持）
  if (sessionStorage.getItem(STORAGE_KEY) === "1") {
    showSite();
  } else {
    document.body.style.overflow = "hidden";
    inputEl.focus();
  }
}

function rejectLogin() {
  errorEl.textContent = "合言葉が違います。もう一度お試しください。";
  loginEl.classList.add("shake");
  inputEl.select();
  setTimeout(() => loginEl.classList.remove("shake"), 450);
}

formEl.addEventListener("submit", (e) => {
  e.preventDefault();
  const value = inputEl.value.trim();
  if (!value) return;
  verifyPasscode(value)
    .then((ok) => {
      if (ok) {
        sessionStorage.setItem(STORAGE_KEY, "1");
        errorEl.textContent = "";
        loginEl.style.opacity = "0";
        loginEl.style.transition = "opacity 0.5s";
        setTimeout(showSite, 450);
      } else {
        rejectLogin();
      }
    })
    .catch(rejectLogin);
});

// ===== ホームページの初期化（ログイン後に実行） =====
let siteInitialized = false;
function initSite() {
  if (siteInitialized) return;
  siteInitialized = true;

  // 年号
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // ヘッダーのスクロール時の見た目
  const header = document.getElementById("header");
  const onScroll = () => {
    header.classList.toggle("scrolled", window.scrollY > 30);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // モバイルメニュー
  const navToggle = document.getElementById("navToggle");
  const nav = document.getElementById("nav");
  const closeNav = () => {
    nav.classList.remove("open");
    navToggle.setAttribute("aria-expanded", "false");
  };
  navToggle.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    navToggle.setAttribute("aria-expanded", open ? "true" : "false");
  });
  nav.querySelectorAll("a").forEach((a) => a.addEventListener("click", closeNav));

  // スクロールで要素をふわっと表示（兄弟どうしは少しずつ遅らせてスタッガー）
  const reveals = document.querySelectorAll(".reveal");
  const groups = new Map();
  reveals.forEach((el) => {
    const p = el.parentElement;
    const arr = groups.get(p) || [];
    arr.push(el);
    groups.set(p, arr);
  });
  groups.forEach((arr) => {
    if (arr.length > 1) arr.forEach((el, i) => el.style.setProperty("--rd", (i * 0.08).toFixed(2) + "s"));
  });
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add("in"));
  }

  // リッチモーション：スクロール進捗バー＋ヒーローのパララックス
  initMotion();

  // 数字のカウントアップ
  const counters = document.querySelectorAll(".stats__num");
  const animateCount = (el) => {
    const target = Number(el.dataset.count || 0);
    const suffix = el.dataset.suffix || "";
    const duration = 1400;
    const start = performance.now();
    const step = (now) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased) + suffix;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  if ("IntersectionObserver" in window) {
    const co = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            animateCount(entry.target);
            co.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.5 }
    );
    counters.forEach((el) => co.observe(el));
  } else {
    counters.forEach((el) => (el.textContent = el.dataset.count + (el.dataset.suffix || "")));
  }

  // 限定公開動画
  initVideos();

  // 空き状況カレンダー
  initCalendar();

  // ギャラリー（gallery.json から描画＋ライトボックス）
  initGallery();

  // 動画・写真の追加フォーム
  initUpload();
}

// ===== アップロードAPI（Cloudflare Worker）共通 =====
let UPLOAD_API = "";
function apiUrl(path) {
  return UPLOAD_API ? UPLOAD_API.replace(/\/$/, "") + path : "";
}
// 削除の保護は「3810でprivate.encを復号できるか」で確認する（限定動画の閲覧と同じ仕組み）。
// 一度確認できたらこのセッション中は覚えておき、続けて消すとき再入力を省く。
// 限定欄を開いて閲覧したときも、その番号をここに覚える。
let vaultKey = "";
async function ensureVaultKey() {
  if (vaultKey) return vaultKey;
  const pw = prompt("数字パスワードを入力してね");
  if (pw === null) return null; // キャンセル
  try {
    await loadVault(pw); // 復号できれば正解（private.encが無ければ素通り）
    vaultKey = pw;
    return pw;
  } catch (_) {
    alert("パスワードが違うみたい");
    return null;
  }
}

// 写真を削除（gallery.json と画像ファイル）。成功したら figure をDOMから消す。
async function deletePhoto(photo, fig) {
  if (!apiUrl("/delete-photo")) { alert("アップロードAPIが未設定です"); return; }
  if (!confirm("この写真を削除する？")) return;
  if (!(await ensureVaultKey())) return;
  try {
    const res = await fetch(apiUrl("/delete-photo"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ src: photo.src }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || "削除に失敗しました");
    fig.remove();
  } catch (e) {
    alert(e.message || "削除に失敗しました");
  }
}

// 非公開動画を削除（videos.json）。成功したら row をDOMから消す。
async function deletePublicVideo(video, row) {
  if (!apiUrl("/delete-video")) { alert("アップロードAPIが未設定です"); return; }
  if (!confirm(`「${video.title || "この動画"}」を削除する？`)) return;
  if (!(await ensureVaultKey())) return;
  try {
    const res = await fetch(apiUrl("/delete-video"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: video.url }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || "削除に失敗しました");
    row.remove();
  } catch (e) {
    alert(e.message || "削除に失敗しました");
  }
}

// ===== ギャラリー =====
// data/gallery.json があればそこから描画（追加機能の反映先）。
// 無ければHTMLに書かれた初期の4枚をそのまま使う。
function initGallery() {
  const grid = document.getElementById("galleryGrid");
  if (!grid) return;
  let photos = [];

  const collect = () => {
    photos = Array.from(grid.querySelectorAll("img")).map((img) => ({ src: img.getAttribute("src"), alt: img.alt || "" }));
  };

  const render = (list) => {
    grid.innerHTML = "";
    sortByDateDesc(list).forEach((p) => {
      const fig = document.createElement("figure");
      fig.className = "gallery__item";
      const img = document.createElement("img");
      img.src = p.src;
      img.alt = p.alt || "";
      img.loading = "lazy";
      fig.appendChild(img);
      // アップロードした写真（images/gallery/配下）には削除ボタンを付ける
      if (/^images\/gallery\//.test(p.src || "")) {
        const del = document.createElement("button");
        del.type = "button";
        del.className = "gallery__del";
        del.setAttribute("aria-label", "この写真を削除");
        del.textContent = "×";
        del.addEventListener("click", (e) => { e.stopPropagation(); deletePhoto(p, fig); });
        fig.appendChild(del);
      }
      grid.appendChild(fig);
    });
    collect();
  };

  fetch("data/gallery.json", { cache: "no-store" })
    .then((res) => (res.ok ? res.json() : null))
    .then((json) => {
      if (json && Array.isArray(json.photos) && json.photos.length) render(json.photos);
      else collect();
    })
    .catch(collect);
  collect();

  // ライトボックス
  const lb = document.getElementById("lightbox");
  const lbImg = document.getElementById("lbImg");
  const lbCap = document.getElementById("lbCap");
  if (!lb) return;
  let cur = 0;

  const show = (i) => {
    cur = (i + photos.length) % photos.length;
    lbImg.src = photos[cur].src;
    lbImg.alt = photos[cur].alt || "";
    lbCap.textContent = photos[cur].alt || "";
  };
  const open = (i) => {
    show(i);
    lb.hidden = false;
    document.body.style.overflow = "hidden";
  };
  const close = () => {
    lb.hidden = true;
    lbImg.src = "";
    document.body.style.overflow = "";
  };

  grid.addEventListener("click", (e) => {
    const fig = e.target.closest(".gallery__item");
    if (!fig) return;
    open(Array.from(grid.children).indexOf(fig));
  });
  document.getElementById("lbClose").addEventListener("click", close);
  document.getElementById("lbPrev").addEventListener("click", () => show(cur - 1));
  document.getElementById("lbNext").addEventListener("click", () => show(cur + 1));
  lb.addEventListener("click", (e) => {
    if (e.target === lb) close();
  });
  document.addEventListener("keydown", (e) => {
    if (lb.hidden) return;
    if (e.key === "Escape") close();
    if (e.key === "ArrowLeft") show(cur - 1);
    if (e.key === "ArrowRight") show(cur + 1);
  });
  // スワイプで前後移動
  let touchX = null;
  lb.addEventListener("touchstart", (e) => { touchX = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener("touchend", (e) => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 48) show(cur + (dx < 0 ? 1 : -1));
    touchX = null;
  }, { passive: true });
}

// 並べ替え用：撮影日(taken) > 登録日時(added) の順で日付を取り、新しい順に並べる。
// 日付が無いもの（初期の写真・動画）は末尾に、元の並び順を保って置く。
function sortByDateDesc(list) {
  const t = (x) => {
    const d = Date.parse(x && (x.taken || x.added));
    return isNaN(d) ? -Infinity : d;
  };
  return list
    .map((item, i) => ({ item, i }))
    .sort((a, b) => t(b.item) - t(a.item) || a.i - b.i)
    .map((x) => x.item);
}

// JPEGのEXIFから撮影日時(DateTimeOriginal)を読み、ISO文字列で返す。無ければnull。
// 先頭128KBだけ読むので軽い。失敗してもnullを返すだけでアップロードは止めない。
function readExifDate(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve(null);
    reader.onload = () => {
      try {
        const view = new DataView(reader.result);
        if (view.getUint16(0) !== 0xffd8) return resolve(null); // JPEGでない
        const len = view.byteLength;
        let offset = 2;
        while (offset + 4 < len) {
          const marker = view.getUint16(offset);
          if (marker === 0xffe1) {
            const exifStart = offset + 4;
            if (view.getUint32(exifStart) !== 0x45786966) return resolve(null); // "Exif"
            const tiff = exifStart + 6;
            const little = view.getUint16(tiff) === 0x4949;
            const u16 = (o) => view.getUint16(o, little);
            const u32 = (o) => view.getUint32(o, little);
            const readStr = (o, n) => {
              let s = "";
              for (let j = 0; j < n; j++) s += String.fromCharCode(view.getUint8(o + j));
              return s;
            };
            const findDate = (dir) => {
              const count = u16(dir);
              for (let i = 0; i < count; i++) {
                const e = dir + 2 + i * 12;
                const tag = u16(e);
                if (tag === 0x9003 || tag === 0x0132) {
                  return readStr(tiff + u32(e + 8), 19); // "YYYY:MM:DD HH:MM:SS"
                }
                if (tag === 0x8769) {
                  const r = findDate(tiff + u32(e + 8)); // Exif サブIFD
                  if (r) return r;
                }
              }
              return null;
            };
            const raw = findDate(tiff + u32(tiff + 4));
            const m = raw && raw.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
            return resolve(m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}` : null);
          }
          if ((marker & 0xff00) !== 0xff00) break;
          offset += 2 + view.getUint16(offset + 2);
        }
        resolve(null);
      } catch {
        resolve(null);
      }
    };
    reader.readAsArrayBuffer(file.slice(0, 131072));
  });
}

// ===== 動画・写真の追加（Cloudflare Worker 経由でリポジトリにコミット） =====
// data/config.json の uploadApi にWorkerのURLを設定すると有効になる。
function initUpload() {
  let api = "";
  fetch("data/config.json", { cache: "no-store" })
    .then((res) => (res.ok ? res.json() : {}))
    .then((cfg) => { api = (cfg && cfg.uploadApi) || ""; UPLOAD_API = api; })
    .catch(() => {});

  const needSetup = (msgEl) => {
    if (api) return false;
    msgEl.textContent = "アップロードAPIが未設定です（worker/README.md の手順でセットアップしてね）";
    return true;
  };

  // --- 開閉トグル（共通） ---
  const wireToggle = (btnId, formId) => {
    const btn = document.getElementById(btnId);
    const form = document.getElementById(formId);
    if (!btn || !form) return;
    btn.addEventListener("click", () => {
      const opened = form.hidden;
      form.hidden = !opened;
      btn.setAttribute("aria-expanded", String(opened));
    });
  };
  wireToggle("videoUpToggle", "videoUpForm");
  wireToggle("photoUpToggle", "photoUpForm");

  // --- 動画の追加（複数行） ---
  const videoForm = document.getElementById("videoUpForm");
  if (videoForm) {
    const rows = document.getElementById("videoRows");
    const msg = document.getElementById("videoMsg");
    const addRow = () => {
      const row = document.createElement("div");
      row.className = "uploader__row";
      row.innerHTML =
        '<input type="text" placeholder="タイトル" aria-label="動画タイトル" />' +
        '<input type="url" placeholder="https://youtu.be/..." aria-label="動画URL" inputmode="url" />' +
        '<button type="button" class="uploader__rowdel" aria-label="この行を削除">×</button>';
      row.querySelector(".uploader__rowdel").addEventListener("click", () => {
        if (rows.children.length > 1) row.remove();
      });
      rows.appendChild(row);
    };
    addRow();
    document.getElementById("videoAddRow").addEventListener("click", addRow);

    // 種類（非公開/限定公開）の切替
    const currentType = () => videoForm.querySelector('input[name="videoType"]:checked').value;

    videoForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (needSetup(msg)) return;
      const items = Array.from(rows.querySelectorAll(".uploader__row"))
        .map((row) => {
          const [t, u] = row.querySelectorAll("input");
          return { title: t.value.trim(), url: u.value.trim() };
        })
        .filter((v) => v.url);
      if (!items.length) { msg.textContent = "URLを入力してね"; return; }
      if (items.some((v) => !youTubeId(v.url))) { msg.textContent = "YouTubeのURLじゃないみたい…確認してね"; return; }

      // --- 限定公開：暗号化保管庫(private.enc)に追記 ---
      // 暗号化に数字が要るので、限定欄を開いてあればその番号を使い、無ければ一度だけ確認する。
      if (currentType() === "unlisted") {
        const password = await ensureVaultKey();
        if (!password) return;
        msg.textContent = "登録しています…";
        try {
          let vault;
          try { vault = await loadVault(password); }
          catch { msg.textContent = "パスワードが違うか、保管庫を読めませんでした"; return; }
          const now = new Date().toISOString();
          let added = 0;
          for (const v of items) {
            if (vault.videos.some((x) => x.url === v.url)) continue;
            vault.videos.push({ title: v.title || "タイトル未設定", url: v.url, added: now });
            added++;
          }
          const content = await encryptVault(password, vault);
          const res = await fetch(api.replace(/\/$/, "") + "/put-vault", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content }),
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(json.error || "登録に失敗しました");
          msg.textContent = `${added}本 限定公開に登録したよ！反映まで1〜2分。パスワードを入れて開き直すと出るよ`;
          rows.innerHTML = "";
          addRow();
        } catch (err) {
          msg.textContent = err.message || "登録に失敗しました";
        }
        return;
      }

      // --- 非公開：videos.json に追記 ---
      msg.textContent = "登録しています…";
      try {
        const res = await fetch(api.replace(/\/$/, "") + "/add-videos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videos: items }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "登録に失敗しました");
        msg.textContent = `${items.length}本 登録したよ！反映まで1〜2分待ってね`;
        rows.innerHTML = "";
        addRow();
      } catch (err) {
        msg.textContent = err.message || "登録に失敗しました";
      }
    });
  }

  // --- 写真の追加（複数枚・送信前に縮小） ---
  const photoForm = document.getElementById("photoUpForm");
  if (photoForm) {
    const fileEl = document.getElementById("photoFiles");
    const prevEl = document.getElementById("photoPreviews");
    const msg = document.getElementById("photoMsg");
    let picked = []; // { name, dataUrl, taken }

    const resize = (file) =>
      new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = async () => {
          URL.revokeObjectURL(url);
          const max = 1600;
          const scale = Math.min(1, max / Math.max(img.width, img.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
          // 縮小すると元のEXIFは消えるので、撮影日は元ファイルから先に読む
          const taken = await readExifDate(file).catch(() => null);
          resolve({ name: file.name, dataUrl: canvas.toDataURL("image/jpeg", 0.82), taken });
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("読み込めない画像があるよ")); };
        img.src = url;
      });

    fileEl.addEventListener("change", async () => {
      msg.textContent = "";
      try {
        picked = await Promise.all(Array.from(fileEl.files || []).map(resize));
      } catch (err) {
        picked = [];
        msg.textContent = err.message;
        return;
      }
      prevEl.innerHTML = "";
      picked.forEach((p) => {
        const img = document.createElement("img");
        img.src = p.dataUrl;
        img.alt = p.name;
        prevEl.appendChild(img);
      });
    });

    photoForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (needSetup(msg)) return;
      if (!picked.length) { msg.textContent = "写真を選んでね"; return; }
      msg.textContent = `${picked.length}枚 アップロード中…`;
      try {
        const res = await fetch(api.replace(/\/$/, "") + "/add-photos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            photos: picked.map((p) => ({ name: p.name, data: p.dataUrl.split(",")[1], taken: p.taken || null })),
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "アップロードに失敗しました");
        msg.textContent = `${picked.length}枚 登録したよ！反映まで1〜2分待ってね`;
        picked = [];
        prevEl.innerHTML = "";
        fileEl.value = "";
      } catch (err) {
        msg.textContent = err.message || "アップロードに失敗しました";
      }
    });
  }
}

// ===== リッチモーション（スクロール進捗バー＋パララックス） =====
function initMotion() {
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  // 上部のスクロール進捗バー
  let bar = document.querySelector(".scrollprog");
  if (!bar) {
    bar = document.createElement("div");
    bar.className = "scrollprog";
    document.body.appendChild(bar);
  }
  const heroPhoto = document.querySelector(".hero__photo");
  const doc = document.documentElement;
  let ticking = false;

  const update = () => {
    const max = doc.scrollHeight - doc.clientHeight;
    bar.style.width = max > 0 ? (doc.scrollTop / max) * 100 + "%" : "0";
    // ヒーロー写真をゆっくり沈める（画面内のときだけ）
    if (heroPhoto && window.scrollY < window.innerHeight) {
      heroPhoto.style.transform = "translateY(" + window.scrollY * 0.06 + "px)";
    }
    ticking = false;
  };
  window.addEventListener(
    "scroll",
    () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    },
    { passive: true }
  );
  update();

  // ヒーロー写真の3Dチルト（マウス端末のみ）
  if (heroPhoto && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    const hero = document.querySelector(".hero");
    hero.addEventListener("pointermove", (e) => {
      const r = heroPhoto.getBoundingClientRect();
      const dx = (e.clientX - r.left - r.width / 2) / r.width;
      const dy = (e.clientY - r.top - r.height / 2) / r.height;
      heroPhoto.style.transform =
        `translateY(${window.scrollY * 0.06}px) perspective(900px) rotateY(${dx * 4}deg) rotateX(${dy * -4}deg)`;
    });
    hero.addEventListener("pointerleave", () => {
      heroPhoto.style.transform = `translateY(${window.scrollY * 0.06}px)`;
    });
  }
}

// ===== 限定公開YouTube動画 =====
// 参考動画(顔なし)は data/videos.json から表示。
// 限定動画(顔出し)は data/private.enc に AES-256-GCM で暗号化して保存し、
// 正しいパスワードを入れたときだけブラウザ内で復号して表示する。
// パスワードはどこにも保存しないため、公開リポジトリでも中身は守られる。
function youTubeId(url) {
  const m = String(url).match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/)([\w-]{11})/);
  return m ? m[1] : null;
}

// 動画名は YouTube の実タイトルを使う。noembed 経由で取得（CORS許可あり）。
// 非公開動画は取得できない(403)ので、その場合は JSON の title をそのまま使う。
function fetchYtTitle(id) {
  return fetch(`https://noembed.com/embed?url=https://youtu.be/${id}`, { cache: "force-cache" })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => (j && j.title && !j.error ? j.title : null))
    .catch(() => null);
}

function renderVideos(grid, list, onDelete) {
  grid.innerHTML = "";
  sortByDateDesc(list || [])
    .map((v) => ({ title: v.title || "動画", id: youTubeId(v.url), url: v.url, isPrivate: !!v.private }))
    .filter((v) => v.id)
    .forEach((v) => {
      const row = document.createElement("div");
      row.className = "video-row";

      const titleEl = document.createElement("span");
      titleEl.className = "video-row__title";
      titleEl.textContent = v.title;
      // YouTube の実タイトルが取れたら差し替える（取れなければ JSON の title のまま）
      fetchYtTitle(v.id).then((t) => {
        if (t) titleEl.textContent = t;
      });

      if (v.isPrivate) {
        // 非公開動画は埋め込み不可。タイトル行をタップでYouTubeを開く。
        const link = document.createElement("a");
        link.className = "video-row__link";
        link.href = v.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.innerHTML = '<span class="video-row__icon video-row__icon--yt" aria-hidden="true"></span>';
        link.appendChild(titleEl);
        link.insertAdjacentHTML(
          "beforeend",
          '<span class="video-row__hint">YouTubeで再生</span>' +
            '<span class="video-row__arrow" aria-hidden="true">↗</span>'
        );
        row.appendChild(link);
      } else {
        // 限定公開動画はタイトル行をタップでサイト内に埋め込み再生（アコーディオン）。
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "video-row__link";
        btn.setAttribute("aria-expanded", "false");
        btn.innerHTML = '<span class="video-row__icon video-row__icon--play" aria-hidden="true"></span>';
        btn.appendChild(titleEl);
        btn.insertAdjacentHTML(
          "beforeend",
          '<span class="video-row__hint">タップで再生</span>' +
            '<span class="video-row__chevron" aria-hidden="true"></span>'
        );
        const embed = document.createElement("div");
        embed.className = "video-row__embed";
        btn.addEventListener("click", () => {
          const open = row.classList.toggle("is-open");
          btn.setAttribute("aria-expanded", open ? "true" : "false");
          if (open && !embed.dataset.loaded) {
            const iframe = document.createElement("iframe");
            iframe.src = `https://www.youtube-nocookie.com/embed/${v.id}`;
            iframe.title = v.title;
            iframe.loading = "lazy";
            iframe.allow =
              "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
            iframe.allowFullscreen = true;
            embed.appendChild(iframe);
            embed.dataset.loaded = "1";
          }
        });
        row.appendChild(btn);
        row.appendChild(embed);
      }
      // 削除ボタン（ハンドラが渡されたときだけ）
      if (typeof onDelete === "function") {
        row.classList.add("video-row--del");
        const del = document.createElement("button");
        del.type = "button";
        del.className = "video-row__del";
        del.setAttribute("aria-label", "この動画を削除");
        del.textContent = "×";
        del.addEventListener("click", (e) => { e.stopPropagation(); onDelete(v, row); });
        row.appendChild(del);
      }
      grid.appendChild(row);
    });
}

function initVideos() {
  const grid = document.getElementById("videoGrid");
  if (grid) {
    fetch("data/videos.json", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { videos: [] }))
      .then((json) => {
        const vids = (json.videos || []).filter((v) => youTubeId(v.url));
        if (!vids.length) {
          grid.innerHTML =
            '<p class="video__empty">非公開動画は準備中です。<br />動画リンクを登録すると、ここに表示されます。</p>';
          return;
        }
        renderVideos(grid, vids, deletePublicVideo);
      })
      .catch(() => {
        grid.innerHTML = '<p class="video__empty">動画を読み込めませんでした。</p>';
      });
  }
  initVault();
}

// ===== 限定動画の復号（AES-256-GCM / PBKDF2-SHA256） =====
// data/private.enc は base64( salt[16] | iv[12] | ciphertext )。
// 平文は { "videos": [ {title,url}, ... ] } のJSON。
async function decryptVault(password, b64) {
  const raw = Uint8Array.from(atob(b64.replace(/\s+/g, "")), (c) => c.charCodeAt(0));
  const salt = raw.slice(0, 16);
  const iv = raw.slice(16, 28);
  const data = raw.slice(28);
  const km = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]
  );
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 200000, hash: "SHA-256" },
    km, { name: "AES-GCM", length: 256 }, false, ["decrypt"]
  );
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return JSON.parse(new TextDecoder().decode(pt));
}

// 平文オブジェクトを private.enc 形式(base64: salt|iv|ciphertext)に暗号化する。decryptVaultと対。
async function encryptVault(password, obj) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const km = await crypto.subtle.importKey(
    "raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]
  );
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 200000, hash: "SHA-256" },
    km, { name: "AES-GCM", length: 256 }, false, ["encrypt"]
  );
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(obj)))
  );
  const out = new Uint8Array(16 + 12 + ct.length);
  out.set(salt, 0); out.set(iv, 16); out.set(ct, 28);
  let bin = "";
  out.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

// 現在の限定公開リストを取得（private.encが無ければ空）。パスワード違いは例外を投げる。
async function loadVault(password) {
  const res = await fetch("data/private.enc", { cache: "no-store" });
  if (!res.ok) return { videos: [] };
  return decryptVault(password, await res.text());
}

function initVault() {
  const form = document.getElementById("vaultForm");
  if (!form) return;
  const passEl = document.getElementById("vaultPass");
  const msgEl = document.getElementById("vaultMsg");
  const grid = document.getElementById("vaultGrid");

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const password = passEl.value;
    if (!password) return;
    msgEl.textContent = "復号しています…";
    fetch("data/private.enc", { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error("nofile");
        return res.text();
      })
      .then((b64) => decryptVault(password, b64))
      .then((json) => {
        const vids = (json.videos || []).filter((v) => youTubeId(v.url));
        vaultKey = password; // 以後の追加・削除で再入力を省くため覚える
        msgEl.textContent = "";
        passEl.value = "";
        form.style.display = "none";
        if (!vids.length) {
          msgEl.textContent = "登録されている限定動画はありません。";
          return;
        }
        // 限定公開の削除：パスワードを使って復号→該当を除外→再暗号化して保存
        const onDelete = async (video, row) => {
          if (!apiUrl("/put-vault")) { alert("アップロードAPIが未設定です"); return; }
          if (!confirm(`「${video.title || "この動画"}」を削除する？`)) return;
          try {
            const cur = await loadVault(password);
            cur.videos = (cur.videos || []).filter((v) => v.url !== video.url);
            const content = await encryptVault(password, cur);
            const res = await fetch(apiUrl("/put-vault"), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ content }),
            });
            const j = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(j.error || "削除に失敗しました");
            row.remove();
          } catch (e) {
            alert(e.message || "削除に失敗しました");
          }
        };
        renderVideos(grid, vids, onDelete);
      })
      .catch((err) => {
        if (err && err.message === "nofile") {
          msgEl.textContent = "限定動画はまだ登録されていません。";
        } else {
          msgEl.textContent = "パスワードが違います。";
        }
      });
  });
}

// ===== 空き状況カレンダー =====
// data/availability.json を読み込み、体育館×時間帯ごとの空き状況を月カレンダーで表示する。
// dates[日付] は { "時間帯": "ok"|"full"|"closed" } の形。
// 既定の時間帯は練習枠の 21:00～23:00。日をタップするとその日の全時間帯を表示する。
function initCalendar() {
  const root = document.getElementById("cal");
  if (!root) return;

  const gymsEl = document.getElementById("calGyms");
  const slotsEl = document.getElementById("calSlots");
  const gridEl = document.getElementById("calGrid");
  const detailEl = document.getElementById("calDetail");
  const monthEl = document.getElementById("calMonth");
  const updatedEl = document.getElementById("calUpdated");
  const sourceEl = document.getElementById("calSource");

  const MARK = { ok: "○", full: "×", closed: "休" };
  const LABEL = { ok: "空き", full: "予約済み", closed: "休館", none: "情報なし" };
  const today = new Date();
  let data = null;
  let activeGym = "all"; // "all" または gyms のインデックス
  let activeSlot = null;
  let selectedDate = null;
  let view = new Date(today.getFullYear(), today.getMonth(), 1);

  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;

  fetch("data/availability.json", { cache: "no-store" })
    .then((res) => {
      if (!res.ok) throw new Error("not found");
      return res.json();
    })
    .then((json) => {
      data = json;
      if (sourceEl && json.source) sourceEl.href = json.source;
      if (updatedEl && json.updated) {
        const d = new Date(json.updated);
        updatedEl.textContent = isNaN(d)
          ? json.updated
          : `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
      }
      // 既定の時間帯：21:00枠を優先、無ければ最後の枠
      const slots = json.slots || [];
      activeSlot = slots.find((s) => s.indexOf("21:00") === 0) || slots[slots.length - 1] || null;
      renderGyms();
      renderSlots();
      renderMonth();
    })
    .catch(() => {
      gridEl.innerHTML = "";
      const p = document.createElement("p");
      p.className = "cal__empty";
      p.textContent = "空き状況データを読み込めませんでした。";
      root.appendChild(p);
    });

  function renderGyms() {
    gymsEl.innerHTML = "";
    const mk = (label, val) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cal__gym" + (val === activeGym ? " is-active" : "");
      btn.textContent = label;
      btn.setAttribute("role", "tab");
      btn.addEventListener("click", () => {
        activeGym = val;
        selectedDate = null;
        if (detailEl) detailEl.innerHTML = "";
        renderGyms();
        renderMonth();
      });
      gymsEl.appendChild(btn);
    };
    // 先頭に「すべて」（既定）、続いて各体育館（「体育館」の文字は省く）
    mk("すべて", "all");
    (data.gyms || []).forEach((gym, i) => mk(gym.name.replace("体育館", ""), i));
  }

  function renderSlots() {
    if (!slotsEl) return;
    slotsEl.innerHTML = "";
    (data.slots || []).forEach((slot) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cal__slot" + (slot === activeSlot ? " is-active" : "");
      btn.textContent = slot;
      btn.addEventListener("click", () => {
        activeSlot = slot;
        renderSlots();
        renderMonth();
      });
      slotsEl.appendChild(btn);
    });
  }

  function gymStatusAt(gym, dateStr) {
    const day = gym && gym.dates && gym.dates[dateStr];
    if (!day) return "none";
    return day[activeSlot] || "none";
  }
  function statusFor(dateStr) {
    // 「すべて」のときは、いずれかの体育館が空いていれば ○ にする
    if (activeGym === "all") {
      const sts = (data.gyms || []).map((g) => gymStatusAt(g, dateStr));
      if (sts.includes("ok")) return "ok";
      if (sts.includes("full")) return "full";
      if (sts.includes("closed")) return "closed";
      return "none";
    }
    return gymStatusAt((data.gyms || [])[activeGym], dateStr);
  }

  function renderMonth() {
    const y = view.getFullYear();
    const m = view.getMonth();
    monthEl.textContent = `${y}年 ${m + 1}月`;

    const firstDay = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    gridEl.innerHTML = "";

    for (let i = 0; i < firstDay; i++) {
      const cell = document.createElement("div");
      cell.className = "cal__cell cal__cell--empty";
      gridEl.appendChild(cell);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = ymd(y, m, d);
      const status = statusFor(dateStr);
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = `cal__cell cal__cell--${status}`;
      if (dateStr === selectedDate) cell.classList.add("cal__cell--sel");
      if (y === today.getFullYear() && m === today.getMonth() && d === today.getDate()) {
        cell.classList.add("cal__cell--today");
      }
      const num = document.createElement("span");
      num.className = "num";
      num.textContent = d;
      const mark = document.createElement("span");
      mark.className = "mark";
      mark.textContent = MARK[status] || "–";
      cell.append(num, mark);
      // タップでボタンがフォーカスされると、ブラウザが要素を画面内へ
      // スクロールして位置が飛ぶ。mousedown/touchの既定動作を抑えて防ぐ。
      cell.addEventListener("mousedown", (e) => e.preventDefault());
      cell.addEventListener("click", () => {
        // 月全体を再構築するとスクロール位置が飛ぶため、
        // 選択クラスの付け替えと詳細の更新だけ行う
        const keepY = window.scrollY;
        selectedDate = dateStr;
        gridEl.querySelectorAll(".cal__cell--sel").forEach((c) => c.classList.remove("cal__cell--sel"));
        cell.classList.add("cal__cell--sel");
        renderDetail(dateStr);
        // 詳細パネルの描画でレイアウトが動いてもスクロール位置を保つ
        window.scrollTo({ top: keepY });
        requestAnimationFrame(() => window.scrollTo({ top: keepY }));
      });
      gridEl.appendChild(cell);
    }
    if (selectedDate) renderDetail(selectedDate);
  }

  function slotListHtml(day) {
    let html = '<ul class="cal__slotlist">';
    (data.slots || []).forEach((slot) => {
      const st = (day && day[slot]) || "none";
      html += `<li class="cal__slotrow cal__slotrow--${st}"><span>${slot}</span><span class="mark">${MARK[st] || "–"} ${LABEL[st]}</span></li>`;
    });
    return html + "</ul>";
  }
  function cardHtml(gym, dateStr, single) {
    const day = (gym && gym.dates && gym.dates[dateStr]) || null;
    return `<div class="cal__card${single ? " cal__card--single" : ""}">`
      + `<div class="cal__cardname">${gym.name}</div>${slotListHtml(day)}</div>`;
  }
  function hasOk(gym, dateStr) {
    const day = gym && gym.dates && gym.dates[dateStr];
    return !!day && Object.values(day).includes("ok");
  }
  function renderDetail(dateStr) {
    if (!detailEl) return;
    const dt = new Date(dateStr + "T00:00:00");
    const wd = "日月火水木金土"[dt.getDay()];
    let html = `<div class="cal__detailhead">${dt.getMonth() + 1}月${dt.getDate()}日（${wd}）</div>`;
    if (activeGym === "all") {
      // 空きのある体育館を、磯上→須磨→垂水→東灘（=配列順=優先度）で
      const avail = (data.gyms || []).filter((g) => hasOk(g, dateStr));
      if (!avail.length) {
        html += `<p class="cal__empty">この日に空きのある体育館はありません。</p>`;
      } else {
        if (avail.length > 1) html += `<p class="cal__cardhint">← 横にスライドで他の体育館 →</p>`;
        html += '<div class="cal__cards">' + avail.map((g) => cardHtml(g, dateStr, false)).join("") + "</div>";
      }
    } else {
      const gym = (data.gyms || [])[activeGym];
      html += '<div class="cal__cards">'
        + (gym ? cardHtml(gym, dateStr, true) : `<p class="cal__empty">情報がありません。</p>`)
        + "</div>";
    }
    detailEl.innerHTML = html;
  }

  document.getElementById("calPrev").addEventListener("click", () => {
    view = new Date(view.getFullYear(), view.getMonth() - 1, 1);
    renderMonth();
  });
  document.getElementById("calNext").addEventListener("click", () => {
    view = new Date(view.getFullYear(), view.getMonth() + 1, 1);
    renderMonth();
  });
}

// ===== ログイン背景スライドショー（ギャラリーの画像をランダムに） =====
function initLoginSlides() {
  const wrap = document.getElementById("loginSlides");
  if (!wrap) return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  // フォールバック（読み込み前/失敗時）として現在のスライドのURLを控える
  const fallback = Array.from(wrap.querySelectorAll(".login__slide"))
    .map((el) => {
      const m = /url\(['"]?(.*?)['"]?\)/.exec(el.style.backgroundImage || "");
      return m ? m[1] : null;
    })
    .filter(Boolean);

  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const start = (srcs) => {
    const list = shuffle(srcs);
    if (!list.length) return;
    wrap.innerHTML = "";
    const slides = list.map((src) => {
      const div = document.createElement("div");
      div.className = "login__slide";
      div.style.backgroundImage = `url('${src}')`;
      wrap.appendChild(div);
      return div;
    });
    let i = 0;
    slides[0].classList.add("is-active");
    if (slides.length < 2) return;
    setInterval(() => {
      slides[i].classList.remove("is-active");
      i = (i + 1) % slides.length;
      slides[i].classList.add("is-active");
    }, 6000);
  };

  fetch("data/gallery.json", { cache: "no-store" })
    .then((res) => (res.ok ? res.json() : null))
    .then((json) => {
      const srcs = json && Array.isArray(json.photos) ? json.photos.map((p) => p.src).filter(Boolean) : [];
      start(srcs.length ? srcs : fallback);
    })
    .catch(() => start(fallback));
}

// 起動
initLoginSlides();
checkAuth();
