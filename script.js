// ===== 設定 =====
// ホームページを表示するための合言葉。ここを変えればパスワードを変更できます。
const PASSCODE = "raise";
const STORAGE_KEY = "raise_authed";

const loginEl = document.getElementById("login");
const siteEl = document.getElementById("site");
const formEl = document.getElementById("loginForm");
const inputEl = document.getElementById("passcode");
const errorEl = document.getElementById("loginError");

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

formEl.addEventListener("submit", (e) => {
  e.preventDefault();
  const value = inputEl.value.trim().toLowerCase();
  if (value === PASSCODE) {
    sessionStorage.setItem(STORAGE_KEY, "1");
    errorEl.textContent = "";
    loginEl.style.opacity = "0";
    loginEl.style.transition = "opacity 0.5s";
    setTimeout(showSite, 450);
  } else {
    errorEl.textContent = "合言葉が違います。もう一度お試しください。";
    loginEl.classList.add("shake");
    inputEl.select();
    setTimeout(() => loginEl.classList.remove("shake"), 450);
  }
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

  // 空き状況カレンダー
  initCalendar();
}

// ===== 空き状況カレンダー =====
// data/availability.json を読み込み、体育館ごとの空き状況を月カレンダーで表示する。
// JSON の status は "ok"(空きあり) / "few"(残りわずか) / "full"(満)。
// データの無い日は「情報なし」として扱う。
function initCalendar() {
  const root = document.getElementById("cal");
  if (!root) return;

  const gymsEl = document.getElementById("calGyms");
  const gridEl = document.getElementById("calGrid");
  const monthEl = document.getElementById("calMonth");
  const updatedEl = document.getElementById("calUpdated");
  const sourceEl = document.getElementById("calSource");

  const MARK = { ok: "○", few: "△", full: "×" };
  const today = new Date();
  let data = null;
  let activeGym = 0;
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
      renderGyms();
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
    (data.gyms || []).forEach((gym, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cal__gym" + (i === activeGym ? " is-active" : "");
      btn.textContent = gym.name;
      btn.setAttribute("role", "tab");
      btn.addEventListener("click", () => {
        activeGym = i;
        renderGyms();
        renderMonth();
      });
      gymsEl.appendChild(btn);
    });
  }

  function renderMonth() {
    const gym = (data.gyms || [])[activeGym];
    const dates = (gym && gym.dates) || {};
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
      const status = dates[ymd(y, m, d)] || "none";
      const cell = document.createElement("div");
      cell.className = `cal__cell cal__cell--${status}`;
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
      gridEl.appendChild(cell);
    }
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
