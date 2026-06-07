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
    const duration = 1400;
    const start = performance.now();
    const step = (now) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased);
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
    counters.forEach((el) => (el.textContent = el.dataset.count));
  }
}

// 起動
checkAuth();
