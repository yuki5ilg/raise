// ===== 設定 =====
// ログインの合言葉は平文では持たず、PBKDF2-SHA256 の検証ハッシュだけを置く。
// 入力を同じ方式でハッシュ化して照合するため、ソースを見ても元の合言葉は分からない。
// 合言葉を変えるには tools/passcode.html で新しい検証ハッシュを生成して差し替える。
const PASS_VERIFIER = {
  salt: "tJQUOC5I/1Bjptdg1zwLMQ==",
  iterations: 200000,
  hash: "LDl9EINX/zHDb86x2+Sv+AVB/GdJIWkdCcz4zivSwx8=",
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

  // スクロールで要素をふわっと表示
  const reveals = document.querySelectorAll(".reveal");
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

function renderVideos(grid, list) {
  grid.innerHTML = "";
  (list || [])
    .map((v) => ({ title: v.title || "", id: youTubeId(v.url) }))
    .filter((v) => v.id)
    .forEach((v) => {
      const fig = document.createElement("figure");
      fig.className = "video__item";
      const frame = document.createElement("div");
      frame.className = "video__frame";
      const iframe = document.createElement("iframe");
      iframe.src = `https://www.youtube-nocookie.com/embed/${v.id}`;
      iframe.title = v.title || "raise video";
      iframe.loading = "lazy";
      iframe.allow =
        "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
      iframe.allowFullscreen = true;
      frame.appendChild(iframe);
      fig.appendChild(frame);
      if (v.title) {
        const cap = document.createElement("figcaption");
        cap.textContent = v.title;
        fig.appendChild(cap);
      }
      grid.appendChild(fig);
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
            '<p class="video__empty">参考動画は準備中です。<br />動画リンクを登録すると、ここに表示されます。</p>';
          return;
        }
        renderVideos(grid, vids);
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
        msgEl.textContent = "";
        passEl.value = "";
        form.style.display = "none";
        if (!vids.length) {
          msgEl.textContent = "登録されている限定動画はありません。";
          return;
        }
        renderVideos(grid, vids);
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
      cell.addEventListener("click", () => {
        selectedDate = dateStr;
        renderMonth();
        renderDetail(dateStr);
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

// 起動
checkAuth();
