/* ═══════════════════════════════════════════════
   NAPH BOOKSTORE — app.js
   Full-featured frontend logic
   ═══════════════════════════════════════════════ */

const API_URL =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1"
    ? "http://localhost:3000/api"
    : "/api";

/* ── STATE ── */
const state = {
  currentUser: null,
  products: [],
  categories: [],
  orders: [],
  users: [],
  banners: [],
  homeBanners: [],
  loginBanners: [],
  flashSale: { config: null, items: [] },
  paymentMethods: [],
  selectedPaymentMethodId: null,
  filters: {
    category: "all",
    minPrice: 0,
    maxPrice: 100,
    sort: "featured",
    query: "",
  },
};
const adminEditorState = { section: null, mode: null, item: null };
let pendingAvatarData = null;
let heroBannerIndex = 0;
let heroBannerTimer = null;
let loginBannerIndex = 0;
let loginBannerTimer = null;
let flashSaleTimer = null;
const HERO_ROTATION_INTERVAL = 5000;
const LOGIN_ROTATION_INTERVAL = 5000;

/* ── DOM HELPERS ── */
const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

/* ── TOAST ── */
let toastTimer = null;
function showToast(message, type = "success") {
  const toast = $("toast");
  const msg = $("toastMsg");
  const icon = $("toastIcon");
  toast.className = `toast ${type}`;
  msg.textContent = message;
  icon.textContent = type === "success" ? "✓" : "✕";
  toast.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add("hidden"), 3200);
}

function updateCheckoutButtonLabel() {
  const btn = $("checkoutSubmit");
  if (!btn) return;
  const paymentMethod = state.paymentMethods.find(
    (m) => m.id === state.selectedPaymentMethodId,
  );
  const isCod = paymentMethod?.id === "cod";
  btn.textContent = isCod ? "Xác Nhận" : "Đã thanh toán";
}

/* ── ESCAPE HTML ── */
function esc(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* ── COVER MARKUP ── */
function coverMarkup(cover, alt = "Book", cls = "") {
  const v = String(cover || "").trim();
  if (!v) return `<span>📚</span>`;
  if (
    /^data:image\/[a-zA-Z]+;base64,/.test(v) ||
    /\.(jpe?g|png|gif|webp|svg)(\?.*)?$/i.test(v) ||
    /^https?:\/\//i.test(v)
  ) {
    return `<img src="${esc(v)}" alt="${esc(alt)}" class="${cls}" loading="lazy" />`;
  }
  return `<span>${esc(v)}</span>`;
}

function avatarMarkup(name = "U", avatarSrc = "", size = "sm") {
  const initial =
    String(name || "U")
      .trim()[0]
      ?.toUpperCase() || "U";
  if (avatarSrc) {
    return `<div class="avatar-circle avatar-${size}"><img src="${esc(avatarSrc)}" alt="${esc(name)}" /></div>`;
  }
  return `<div class="avatar-circle avatar-${size}">${esc(initial)}</div>`;
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Không thể đọc tệp ảnh."));
    reader.readAsDataURL(file);
  });
}

/* ── API ── */
function api(path, opts = {}) {
  return fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  }).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "API error");
    return data;
  });
}

function renderStars(rating, max = 5) {
  const full = Math.floor(rating);
  const half = rating % 1 >= 0.5 ? 1 : 0;
  const empty = max - full - half;
  return (
    Array.from({ length: full })
      .map(() => `<span class="star star--full">★</span>`)
      .join("") +
    (half ? `<span class="star star--half">★</span>` : "") +
    Array.from({ length: empty })
      .map(() => `<span class="star star--empty">★</span>`)
      .join("")
  );
}

function renderHeroBanner() {
  const hero = $("heroBannerBg")?.closest(".hero");
  const bg = $("heroBannerBg");
  const eyebrow = $("heroSubtitle");
  const title = $("heroTitle");
  const desc = $("heroDescription");
  const defaultText = {
    subtitle: "Khám phá kho sách của chúng tôi",
    title: "Mỗi cuốn sách<br /><em>một hành trình</em>",
    description:
      "Hàng nghìn đầu sách được tuyển chọn kỹ lưỡng — từ tiểu thuyết đến khoa học, từ thơ đến lịch sử.",
  };
  const banners = state.homeBanners;

  if (!banners.length) {
    if (hero) hero.classList.remove("image-only");
    if (bg)
      bg.style.backgroundImage =
        "radial-gradient(circle at 80% 50%, rgba(76, 53, 117, 0.06) 0%, transparent 60%), radial-gradient(circle at 20% 80%, rgba(176, 125, 58, 0.05) 0%, transparent 50%)";
    if (eyebrow) eyebrow.textContent = defaultText.subtitle;
    if (title) title.innerHTML = defaultText.title;
    if (desc) desc.textContent = defaultText.description;
    renderHeroIndicators();
    return;
  }

  if (heroBannerIndex >= banners.length) heroBannerIndex = 0;
  const banner = banners[heroBannerIndex];
  if (hero) hero.classList.add("image-only");
  if (bg) {
    bg.style.backgroundColor = "transparent";
    bg.style.backgroundImage = `url('${esc(banner.image || "")}')`;
  }
  if (eyebrow) eyebrow.textContent = "";
  if (title) title.innerHTML = "";
  if (desc) desc.textContent = "";
  renderHeroIndicators();
}

function renderHeroIndicators() {
  const indicators = $("heroIndicators");
  const controls = $("heroControls");
  const banners = state.homeBanners;
  if (controls) controls.classList.toggle("hidden", !banners.length);
  if (!indicators) return;
  if (!banners.length) {
    indicators.innerHTML = "";
    return;
  }
  indicators.innerHTML = banners
    .map(
      (_, index) =>
        `<button type="button" class="hero-indicator${
          index === heroBannerIndex ? " active" : ""
        }" data-index="${index}" aria-label="Chuyển tới banner ${index + 1}"></button>`,
    )
    .join("");
}

function showHeroSlide(index) {
  const banners = state.homeBanners;
  if (!banners.length) return;
  heroBannerIndex =
    ((index % banners.length) + banners.length) % banners.length;
  renderHeroBanner();
  renderHeroIndicators();
  startHeroRotation();
}

function startHeroRotation() {
  if (heroBannerTimer) clearInterval(heroBannerTimer);
  const banners = state.homeBanners;
  if (!banners.length) return;
  heroBannerTimer = setInterval(() => {
    heroBannerIndex = (heroBannerIndex + 1) % banners.length;
    renderHeroBanner();
  }, HERO_ROTATION_INTERVAL);
}

function renderLoginBanner() {
  const carousel = $("authBannerCarousel");
  if (!carousel) return;

  const banners = state.loginBanners;
  if (!banners.length) {
    carousel.innerHTML = `
      <div class="login-banner-slide active">
        <div class="login-banner-placeholder">
          <div class="placeholder-title">Banner đăng nhập đang chờ cập nhật</div>
          <div class="placeholder-copy">Thêm ảnh Banner Login trong trang quản trị để hiển thị nội dung ấn tượng ở cạnh form đăng nhập.</div>
        </div>
      </div>`;
    return;
  }

  if (loginBannerIndex >= banners.length) loginBannerIndex = 0;
  carousel.innerHTML = banners
    .map(
      (banner, index) => `
      <div class="login-banner-slide${index === loginBannerIndex ? " active" : ""}">
        <img src="${esc(banner.image || "")}" alt="Banner ${index + 1}" />
      </div>`,
    )
    .join("");
}

function showLoginBannerSlide(index) {
  if (!state.loginBanners.length) return;
  loginBannerIndex =
    ((index % state.loginBanners.length) + state.loginBanners.length) %
    state.loginBanners.length;
  renderLoginBanner();
  startLoginBannerRotation();
}

function startLoginBannerRotation() {
  if (loginBannerTimer) clearInterval(loginBannerTimer);
  if (!state.loginBanners.length) return;
  loginBannerTimer = setInterval(() => {
    loginBannerIndex = (loginBannerIndex + 1) % state.loginBanners.length;
    renderLoginBanner();
  }, LOGIN_ROTATION_INTERVAL);
}

function getFlashSaleItem(productId) {
  return state.flashSale.items.find((item) => item.productId === productId);
}

function calculateFlashSalePrice(productId, basePrice) {
  const item = getFlashSaleItem(productId);
  if (!item || !isFlashSaleActive()) return basePrice;
  const discountAmount = Number(item.discountAmount) || 0;
  const discountPercent = Number(item.discountPercent) || 0;
  const discount =
    discountAmount > 0 ? discountAmount : (basePrice * discountPercent) / 100;
  return Math.max(0, basePrice - discount);
}

function isFlashSaleActive() {
  const endAt = state.flashSale.config?.endAt;
  if (!endAt) return false;
  return new Date(endAt) > new Date();
}

function formatCountdown(ms) {
  if (ms <= 0) return "00:00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(
    2,
    "0",
  );
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function renderFlashSaleSection() {
  const section = $("flashSaleSection");
  if (!section) return;
  const config = state.flashSale.config;
  const items = state.flashSale.items || [];
  if (!config || !items.length || !isFlashSaleActive()) {
    section.style.display = "none";
    return;
  }
  section.style.display = "block";
  $("flashSaleTitle").textContent = config.title || "Flash Sale NAPH";
  $("flashSaleSubtitle").textContent =
    config.subtitle || "Giảm giá cực sốc chỉ trong thời gian giới hạn";
  $("flashSaleCountdown").textContent = formatCountdown(
    new Date(config.endAt) - new Date(),
  );

  const list = $("flashSaleList");
  list.innerHTML = items
    .map((item) => {
      const product = state.products.find((p) => p.id === item.productId);
      if (!product) return "";
      const discountPercent = Number(item.discountPercent) || 0;
      const discountAmount = Number(item.discountAmount) || 0;
      const computedDiscount =
        discountAmount > 0
          ? discountAmount
          : Math.round(((product.price * discountPercent) / 100) * 100) / 100;
      const salePrice = Math.max(0, product.price - computedDiscount);
      return `
        <article class="flash-sale-card" data-id="${product.id}">
          <div class="flash-sale-media">
            <div class="flash-sale-cover">${coverMarkup(product.cover, product.title)}</div>
            <span class="flash-sale-tag">-${discountPercent || Math.round((computedDiscount / product.price) * 100)}%</span>
          </div>
          <div class="flash-sale-body">
            <div class="flash-sale-name">${esc(product.title)}</div>
            <div class="flash-sale-author">bởi ${esc(product.author)}</div>
            <div class="flash-sale-prices">
              <span class="flash-sale-price-old">$${product.price.toFixed(2)}</span>
              <span class="flash-sale-price-new">$${salePrice.toFixed(2)}</span>
            </div>
            <div class="flash-sale-meta">
              <span>${discountPercent ? `${discountPercent}% OFF` : `$${computedDiscount.toFixed(2)} giảm`}</span>
              <span>Tiết kiệm $${computedDiscount.toFixed(2)}</span>
            </div>
            <button class="btn-primary flash-sale-buy" data-id="${product.id}">✨ Mua ngay</button>
          </div>
        </article>
      `;
    })
    .join("");

  list.querySelectorAll(".flash-sale-buy").forEach((btn) =>
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      addToCart(btn.dataset.id);
    }),
  );

  list.querySelectorAll(".flash-sale-card").forEach((card) => {
    card.addEventListener("click", () => openDetail(card.dataset.id));
  });
}

function renderFlashSaleCountdown() {
  const countdown = $("flashSaleCountdown");
  if (!countdown || !state.flashSale.config?.endAt) return;
  const diff = new Date(state.flashSale.config.endAt) - new Date();
  countdown.textContent = formatCountdown(diff);
  if (diff <= 0) {
    stopFlashSaleCountdown();
    renderFlashSaleSection();
  }
}

function startFlashSaleCountdown() {
  stopFlashSaleCountdown();
  if (!isFlashSaleActive()) return;
  renderFlashSaleCountdown();
  flashSaleTimer = setInterval(renderFlashSaleCountdown, 1000);
}

function stopFlashSaleCountdown() {
  if (flashSaleTimer) {
    clearInterval(flashSaleTimer);
    flashSaleTimer = null;
  }
}

function scrollToSaleProducts() {
  document
    .querySelector("#flashSaleSection")
    ?.scrollIntoView({ behavior: "smooth" });
}

function formatReviewDate(iso) {
  try {
    return new Date(iso).toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

/* ── LOCAL STORAGE ── */
function loadLocal() {
  state.currentUser = JSON.parse(localStorage.getItem("naph_user")) || null;
}
function saveLocal() {
  localStorage.setItem("naph_user", JSON.stringify(state.currentUser));
}
function getCart() {
  if (!state.currentUser) return {};
  const all = JSON.parse(localStorage.getItem("naph_cart") || "{}");
  return all[state.currentUser.id] || {};
}
function setCart(cart) {
  if (!state.currentUser) return;
  const all = JSON.parse(localStorage.getItem("naph_cart") || "{}");
  all[state.currentUser.id] = cart;
  localStorage.setItem("naph_cart", JSON.stringify(all));
}
function cartCount() {
  return Object.values(getCart()).reduce((s, v) => s + v, 0);
}

/* ── CART BADGE ── */
function updateCartBadge() {
  const badge = $("cartBadge");
  const count = cartCount();
  badge.textContent = count;
  badge.classList.toggle("hidden", count === 0);
}

function getPageFromHash() {
  return window.location.hash?.slice(1) || null;
}

function showPage(id, pushState = true) {
  const currentPage = Array.from($$(".page")).find(
    (p) => !p.classList.contains("hidden"),
  )?.id;
  $$(".page").forEach((p) => p.classList.add("hidden"));
  const section = $(id);
  if (!section) return;
  section.classList.remove("hidden");
  $$(".nav-btn").forEach((b) =>
    b.classList.toggle("active", b.dataset.target === id),
  );
  if (id === "cartPage") renderCart();
  if (id === "checkoutPage") {
    renderCheckoutSummary();
    renderCheckoutPaymentOptions();
  }
  if (id === "ordersPage") renderOrders();
  if (id === "adminPage") renderAdmin();
  if (id === "accountPage") renderAccount();
  if (id === "contactPage") renderContactPage();
  if (pushState && currentPage !== id) {
    history.pushState({ page: id }, "", `#${id}`);
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ── AUTH UI ── */
function updateAuthUI() {
  const loggedIn = Boolean(state.currentUser);
  $("showLogin").classList.toggle("hidden", loggedIn);
  $("showRegister").classList.toggle("hidden", loggedIn);
  $("userChip").classList.toggle("hidden", !loggedIn);
  $$(".admin-only").forEach((el) =>
    el.classList.toggle(
      "hidden",
      !loggedIn || state.currentUser?.role !== "admin",
    ),
  );
  if (loggedIn) {
    const u = state.currentUser;
    const initial = (u.name || "U")[0].toUpperCase();
    $("userChipName").textContent = u.name;
    $("userAvatar").innerHTML = u.avatar
      ? `<img src="${esc(u.avatar)}" alt="${esc(u.name || "Avatar")}" />`
      : initial;
    $("userAvatar").style.background = u.avatar
      ? "transparent"
      : "var(--purple)";
    $("userAvatar").style.border = u.avatar
      ? "1px solid var(--border)"
      : "none";
    updateCartBadge();
    showPage("shopPage");
  } else {
    showPage("authPage");
  }
}

/* ── LOGIN / REGISTER / LOGOUT ── */
function handleLogin() {
  const email = $("loginEmail").value.trim();
  const password = $("loginPassword").value.trim();
  if (!email || !password)
    return showToast("Vui lòng điền đầy đủ thông tin.", "error");
  api("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  })
    .then((user) => {
      const savedUser = JSON.parse(localStorage.getItem("naph_user")) || {};
      if (savedUser?.id === user.id) {
        user = {
          ...user,
          avatar: savedUser.avatar,
          shipping: savedUser.shipping,
        };
      }
      state.currentUser = user;
      saveLocal();
      updateAuthUI();
      showToast(`Chào mừng, ${user.name}!`);
      refreshData();
    })
    .catch((err) => showToast(err.message, "error"));
}

function handleRegister() {
  const name = $("registerName").value.trim();
  const email = $("registerEmail").value.trim();
  const password = $("registerPassword").value.trim();
  const confirm = $("registerConfirm").value.trim();
  if (!name || !email || !password)
    return showToast("Vui lòng điền đầy đủ thông tin.", "error");
  if (password !== confirm) return showToast("Mật khẩu không khớp.", "error");
  api("/auth/register", {
    method: "POST",
    body: JSON.stringify({ name, email, password }),
  })
    .then((user) => {
      state.currentUser = user;
      saveLocal();
      updateAuthUI();
      showToast(`Đăng ký thành công! Chào mừng, ${user.name}!`);
      refreshData();
    })
    .catch((err) => showToast(err.message, "error"));
}

function showLoginForm() {
  $("loginTab").classList.add("active");
  $("registerTab").classList.remove("active");
  $("loginForm").classList.remove("hidden");
  $("registerForm").classList.add("hidden");
  $("forgotPasswordForm").classList.add("hidden");
  resetForgotPasswordState();
}

function showForgotPasswordForm() {
  $("loginTab").classList.remove("active");
  $("registerTab").classList.remove("active");
  $("loginForm").classList.add("hidden");
  $("registerForm").classList.add("hidden");
  $("forgotPasswordForm").classList.remove("hidden");
  resetForgotPasswordState();
}

function resetForgotPasswordState() {
  $("forgotEmail").value = "";
  $("forgotCode").value = "";
  $("forgotNewPassword").value = "";
  $("forgotConfirmPassword").value = "";
  $("forgotVerifySection").classList.add("hidden");
  $("forgotStatus").classList.add("hidden");
  $("forgotStatus").textContent = "";
}

function handleForgotPasswordRequest() {
  const email = $("forgotEmail").value.trim();
  if (!email) return showToast("Vui lòng nhập email đã đăng ký.", "error");
  api("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  })
    .then((response) => {
      showToast(response.message || "Mã xác thực đã được gửi.");
      $("forgotVerifySection").classList.remove("hidden");
      $("forgotStatus").classList.remove("hidden");
      $("forgotStatus").textContent =
        "Mã xác thực đã được gửi đến email của bạn. Vui lòng kiểm tra email và nhập mã 6 chữ số.";
    })
    .catch((err) => showToast(err.message, "error"));
}

function handleForgotPasswordReset() {
  const email = $("forgotEmail").value.trim();
  const code = $("forgotCode").value.trim();
  const password = $("forgotNewPassword").value.trim();
  const confirm = $("forgotConfirmPassword").value.trim();
  if (!email || !code || !password || !confirm)
    return showToast("Vui lòng điền đầy đủ thông tin.", "error");
  if (!/^\d{6}$/.test(code))
    return showToast("Mã xác thực phải là 6 chữ số.", "error");
  if (password.length < 6)
    return showToast("Mật khẩu mới phải có ít nhất 6 ký tự.", "error");
  if (password !== confirm) return showToast("Mật khẩu không khớp.", "error");

  api("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ email, code, password }),
  })
    .then((response) => {
      showToast(response.message || "Đổi mật khẩu thành công!");
      showLoginForm();
    })
    .catch((err) => showToast(err.message, "error"));
}

function handleLogout() {
  state.currentUser = null;
  saveLocal();
  setCart({});
  updateAuthUI();
  showToast("Đã đăng xuất.");
}

/* ── CATEGORY FILTERS ── */
function renderCategoryFilters() {
  const container = $("categoryFilters");
  container.innerHTML = `<label class="filter-item">
    <input type="radio" name="category" value="all" ${state.filters.category === "all" ? "checked" : ""}>
    <span>Tất cả</span>
  </label>`;
  state.categories.forEach((cat) => {
    const label = document.createElement("label");
    label.className = "filter-item";
    label.innerHTML = `<input type="radio" name="category" value="${cat.id}" ${state.filters.category === cat.id ? "checked" : ""}><span>${esc(cat.name)}</span>`;
    container.appendChild(label);
  });
}

/* ── PRODUCT FILTER ── */
function filterProducts() {
  let products = [...state.products];
  const q = state.filters.query.toLowerCase();
  if (state.filters.category !== "all")
    products = products.filter((p) => p.category === state.filters.category);
  products = products.filter(
    (p) =>
      p.price >= state.filters.minPrice && p.price <= state.filters.maxPrice,
  );
  if (q)
    products = products.filter(
      (p) =>
        p.title.toLowerCase().includes(q) || p.author.toLowerCase().includes(q),
    );
  if (state.filters.sort === "price-asc")
    products.sort((a, b) => a.price - b.price);
  else if (state.filters.sort === "price-desc")
    products.sort((a, b) => b.price - a.price);
  else if (state.filters.sort === "rating")
    products.sort((a, b) => b.rating - a.rating);
  return products;
}

/* ── SEARCH DROPDOWN ── */
function updateSearchDropdown(query) {
  const q = query.toLowerCase();
  const results = state.products
    .filter(
      (p) =>
        p.title.toLowerCase().includes(q) || p.author.toLowerCase().includes(q),
    )
    .slice(0, 8);

  const list = $("searchResultsList");
  const dropdown = $("searchDropdown");

  if (results.length === 0) {
    list.innerHTML = `
      <li style="padding: 20px 12px; text-align: center; color: var(--ink-faint); font-size: 14px;">
        Không tìm thấy sách phù hợp
      </li>
    `;
    dropdown.classList.remove("hidden");
    return;
  }

  list.innerHTML = results
    .map((product) => {
      const salePrice = calculateFlashSalePrice(product.id, product.price);
      const isOnSale = salePrice < product.price;
      const catName =
        state.categories.find((c) => c.id === product.category)?.name || "Sách";
      return `
      <li class="search-result-item" data-id="${esc(product.id)}">
        <div class="search-result-cover">${coverMarkup(product.cover, product.title)}</div>
        <div class="search-result-info">
          <div class="search-result-title">${esc(product.title)}</div>
          <div class="search-result-author">bởi ${esc(product.author)}</div>
        </div>
        <div class="search-result-price">
          ${
            isOnSale
              ? `<span class="search-result-price-old">$${product.price.toFixed(2)}</span><span class="search-result-price-current">$${salePrice.toFixed(2)}</span>`
              : `<span class="search-result-price-current">$${salePrice.toFixed(2)}</span>`
          }
        </div>
      </li>
    `;
    })
    .join("");

  dropdown.classList.remove("hidden");

  // Add click event to items
  list.querySelectorAll(".search-result-item").forEach((item) => {
    item.addEventListener("click", () => {
      const productId = item.dataset.id;
      $("searchDropdown").classList.add("hidden");
      $("searchInput").value = "";
      openDetail(productId);
    });
  });
}

/* ── RENDER PRODUCT GRID ── */
function renderProductGrid() {
  const grid = $("productGrid");
  const books = filterProducts();
  $("productCount").textContent = `${books.length} cuốn sách`;

  if (!books.length) {
    grid.innerHTML = `<div class="grid-loading"><div style="font-size:48px">🔍</div><p>Không tìm thấy sách phù hợp.</p></div>`;
    return;
  }

  grid.innerHTML = books
    .map((book) => {
      const catName =
        state.categories.find((c) => c.id === book.category)?.name || "Khác";
      const stars =
        "★".repeat(Math.floor(book.rating)) +
        (book.rating % 1 >= 0.5 ? "½" : "");
      const salePrice = calculateFlashSalePrice(book.id, book.price);
      const isOnSale = salePrice < book.price;
      return `
      <article class="product-card" data-id="${book.id}">
        <div class="book-cover">${coverMarkup(book.cover, book.title)}</div>
        <div class="card-body">
          <div class="book-category-tag">${esc(catName)}</div>
          <div class="book-title">${esc(book.title)}</div>
          <div class="book-author">bởi ${esc(book.author)}</div>
          <div class="book-footer">
            ${isOnSale ? `<span class="book-price-old">$${book.price.toFixed(2)}</span><span class="book-price-sale">$${salePrice.toFixed(2)}</span>` : `<span class="book-price">$${salePrice.toFixed(2)}</span>`}
            <span class="book-rating">${stars} ${book.rating.toFixed(1)}</span>
          </div>
        </div>
        <div class="card-actions">
          <button class="btn-ghost view-detail" data-id="${book.id}">👁️ Chi tiết</button>
          <button class="btn-primary add-cart" data-id="${book.id}" title="Thêm vào giỏ hàng" aria-label="Thêm vào giỏ hàng">
            🛒 Thêm giỏ hàng
          </button>
        </div>
      </article>
    `;
    })
    .join("");

  grid.querySelectorAll(".view-detail").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openDetail(btn.dataset.id);
    }),
  );
  grid.querySelectorAll(".add-cart").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      addToCart(btn.dataset.id);
    }),
  );
  grid
    .querySelectorAll(".product-card")
    .forEach((card) =>
      card.addEventListener("click", () => openDetail(card.dataset.id)),
    );
}

/* ── CONTACT PAGE ── */
function renderContactPage() {
  api("/contact")
    .then((info) => {
      const addr = document.getElementById("contactAddress");
      const phone = document.getElementById("contactPhone");
      const email = document.getElementById("contactEmail");
      const map = document.getElementById("contactMap");
      const socials = document.getElementById("contactSocials");
      if (addr)
        addr.textContent = info.address || "123 Nguyễn Huệ, Quận 1, TP. HCM";
      if (phone) phone.textContent = info.phone || "+84 28 1234 5678";
      if (email) email.textContent = info.email || "support@naph.com";
      if (map && info.mapUrl) {
        // Convert normal Google Maps URL to embed URL
        let embedUrl = info.mapUrl;
        if (
          embedUrl.includes("maps.google.com/?q=") ||
          embedUrl.includes("google.com/maps")
        ) {
          const q = encodeURIComponent(info.address || "NAPH Bookstore");
          embedUrl = `https://maps.google.com/maps?q=${q}&output=embed`;
        }
        map.src = embedUrl;
      } else if (map) {
        const q = encodeURIComponent(info.address || "Ho Chi Minh City");
        map.src = `https://maps.google.com/maps?q=${q}&output=embed`;
      }
      // Social links
      if (socials) {
        const links = [];
        if (info.facebook)
          links.push(
            `<a href="${esc(info.facebook)}" target="_blank" class="social-link">📘 Facebook</a>`,
          );
        if (info.instagram)
          links.push(
            `<a href="${esc(info.instagram)}" target="_blank" class="social-link">📸 Instagram</a>`,
          );
        if (info.youtube)
          links.push(
            `<a href="${esc(info.youtube)}" target="_blank" class="social-link">▶️ YouTube</a>`,
          );
        socials.innerHTML = links.join("");
      }
      renderFooter(info);
    })
    .catch(() => {});
}

function renderFooter(info = {}) {
  const addr = $("footerAddress");
  const phone = $("footerPhone");
  const email = $("footerEmail");
  const socials = $("footerSocials");
  const copy = $("footerCopy");

  const addressValue = info.address || "123 Nguyễn Huệ, Quận 1, TP.HCM";
  const phoneValue = info.phone || "+84 28 1234 5678";
  const emailValue = info.email || "support@naph.com";
  const mapUrl = info.mapUrl || "";

  if (addr) {
    addr.textContent = addressValue;
    addr.href = mapUrl || "#";
  }
  if (phone) {
    phone.textContent = phoneValue;
    phone.href = `tel:${phoneValue.replace(/[^0-9+]/g, "")}`;
  }
  if (email) {
    email.textContent = emailValue;
    email.href = `mailto:${emailValue}`;
  }
  if (socials) {
    const links = [];
    if (info.facebook)
      links.push(
        `<a href="${esc(info.facebook)}" target="_blank" class="social-link" aria-label="Facebook"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M22 12.07C22 6.5 17.52 2 12 2S2 6.5 2 12.07C2 17.08 5.66 21.25 10.44 22v-7.03H7.9v-2.9h2.54V9.41c0-2.5 1.49-3.88 3.77-3.88 1.09 0 2.23.2 2.23.2v2.45h-1.25c-1.23 0-1.61.76-1.61 1.54v1.85h2.74l-.44 2.9H14.4V22C19.18 21.25 22 17.08 22 12.07z"/></svg><span>Facebook</span></a>`,
      );
    if (info.instagram)
      links.push(
        `<a href="${esc(info.instagram)}" target="_blank" class="social-link" aria-label="Instagram"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5zm5 6.2a4.8 4.8 0 1 0 0 9.6 4.8 4.8 0 0 0 0-9.6zm6.4-2.6a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4z"/></svg><span>Instagram</span></a>`,
      );
    if (info.youtube)
      links.push(
        `<a href="${esc(info.youtube)}" target="_blank" class="social-link" aria-label="YouTube"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M23.5 6.2a3 3 0 0 0-2.11-2.12C19.66 3.5 12 3.5 12 3.5s-7.66 0-9.39.58A3 3 0 0 0 .5 6.2 31.5 31.5 0 0 0 0 12a31.5 31.5 0 0 0 .5 5.8 3 3 0 0 0 2.11 2.12C4.34 20.5 12 20.5 12 20.5s7.66 0 9.39-.58A3 3 0 0 0 23.5 17.8 31.5 31.5 0 0 0 24 12a31.5 31.5 0 0 0-.5-5.8zM9.8 15.6V8.4l6.7 3.6-6.7 3.6z"/></svg><span>YouTube</span></a>`,
      );
    socials.innerHTML = links.join("");
  }
  if (copy)
    copy.textContent = `© ${new Date().getFullYear()} NAPH Bookstore. All rights reserved.`;
}

function refreshFooter() {
  api("/contact")
    .then(renderFooter)
    .catch(() => {
      renderFooter();
    });
}

/* ── MULTI-IMAGE GALLERY ── */
function openDetail(id) {
  const book = state.products.find((p) => p.id === id);
  if (!book) return;
  const catName =
    state.categories.find((c) => c.id === book.category)?.name || "Khác";
  const stars =
    "★".repeat(Math.floor(book.rating)) + (book.rating % 1 >= 0.5 ? "½" : "");
  $("detailImage").innerHTML = coverMarkup(book.cover, book.title);
  $("detailTitle").textContent = book.title;
  $("detailAuthor").textContent = `bởi ${book.author}`;
  $("detailCategory").textContent = catName;
  const detailSalePrice = calculateFlashSalePrice(book.id, book.price);
  const isDetailOnSale = detailSalePrice < book.price;
  $("detailPrice").innerHTML = isDetailOnSale
    ? `<span class="detail-price-old">$${book.price.toFixed(2)}</span> <span class="detail-price-sale">$${detailSalePrice.toFixed(2)}</span>`
    : `$${detailSalePrice.toFixed(2)}`;
  $("detailRating").innerHTML =
    `<span style="color:var(--gold)">${stars}</span> ${book.rating.toFixed(1)}`;
  const detailAvgScore = $("detailAvgScore");
  if (detailAvgScore)
    detailAvgScore.innerHTML = `${renderStars(book.rating)} ${book.rating.toFixed(1)}`;
  $("detailReviewSummary").textContent =
    book.reviewCount > 0
      ? `${book.reviewCount} nhận xét từ khách hàng`
      : "Chưa có nhận xét nào. Hãy là người đầu tiên chia sẻ cảm nhận.";
  $("detailStock").textContent =
    book.stock > 0 ? `${book.stock} còn hàng` : "Hết hàng";
  $("detailDescription").textContent = book.description;
  $("detailAddCart").dataset.id = id;
  renderReviewStarsPicker(0);
  loadReviewsForProduct(id);

  // Load extra images
  const thumbContainer = $("detailThumbnails");
  if (thumbContainer) {
    thumbContainer.innerHTML = "";
    api(`/products/${id}/images`)
      .then((images) => {
        if (!images.length) return;
        thumbContainer.innerHTML = images
          .map(
            (img) =>
              `<div class="thumb-item" data-src="${esc(img.imageData)}">
                <img src="${esc(img.imageData)}" alt="Ảnh sách" loading="lazy" />
              </div>`,
          )
          .join("");
        thumbContainer.querySelectorAll(".thumb-item").forEach((item) => {
          item.addEventListener("click", () => {
            $("detailImage").innerHTML =
              `<img src="${item.dataset.src}" alt="${esc(book.title)}" class="detail-main-img" />`;
          });
        });
      })
      .catch(() => {});
  }

  showPage("productDetailPage");
}

let detailSelectedRating = 0;

function renderReviewStarsPicker(rating) {
  detailSelectedRating = rating;
  const container = $("detailReviewStars");
  const previewText = $("detailReviewSelectedValue");
  if (previewText) previewText.textContent = rating ? rating.toFixed(1) : "0.0";
  if (!container) return;
  container.innerHTML = Array.from({ length: 5 }, (_, index) => {
    const starIndex = index + 1;
    const isActive = rating >= starIndex;
    const isHalf = rating >= starIndex - 0.5 && rating < starIndex;
    return `<button type="button" data-index="${index}" class="${isActive ? "active" : ""} ${isHalf ? "half" : ""}" aria-label="${starIndex - 0.5} đến ${starIndex} sao">★</button>`;
  }).join("");
  container.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", (event) => {
      const index = Number(button.dataset.index);
      const bounds = button.getBoundingClientRect();
      const ratio = (event.clientX - bounds.left) / bounds.width;
      const value = index + (ratio < 0.5 ? 0.5 : 1);
      renderReviewStarsPicker(value);
    });
    button.addEventListener("mousemove", (event) => {
      const index = Number(button.dataset.index);
      const bounds = button.getBoundingClientRect();
      const ratio = (event.clientX - bounds.left) / bounds.width;
      const preview = index + (ratio < 0.5 ? 0.5 : 1);
      container.querySelectorAll("button").forEach((btn, btnIndex) => {
        btn.classList.toggle("active", btnIndex + 1 <= Math.floor(preview));
        btn.classList.toggle(
          "half",
          btnIndex + 1 === Math.ceil(preview) && preview % 1 === 0.5,
        );
      });
      if (previewText) previewText.textContent = preview.toFixed(1);
    });
    button.addEventListener("mouseleave", () =>
      renderReviewStarsPicker(detailSelectedRating),
    );
  });
}

function loadReviewsForProduct(productId) {
  api(`/products/${productId}/reviews`)
    .then((reviews) => {
      renderReviewList(reviews);
    })
    .catch(() => {
      $("detailReviewList").innerHTML =
        "<div class='review-empty'>Không thể tải nhận xét.</div>";
    });
}

function renderReviewList(reviews) {
  const list = $("detailReviewList");
  if (!list) return;
  if (!reviews.length) {
    list.innerHTML = `<div class="review-card"><div class="review-comment">Chưa có nhận xét nào. Hãy bật đánh giá đầu tiên cho cuốn sách này.</div></div>`;
    return;
  }
  list.innerHTML = reviews
    .map(
      (review) => `
        <div class="review-card">
          <div class="review-card-header">
            <div class="review-user-block">
              ${avatarMarkup(
                review.userName,
                review.userAvatar ||
                  (state.currentUser && review.userId === state.currentUser.id
                    ? state.currentUser.avatar
                    : ""),
                "sm",
              )}
              <div>
                <div class="review-user">${esc(review.userName || "Khách")}</div>
                <div class="review-date">${formatReviewDate(review.createdAt)}</div>
              </div>
            </div>
            <div class="review-rating">${renderStars(review.rating)}</div>
          </div>
          <div class="review-comment">${esc(review.comment)}</div>
        </div>
      `,
    )
    .join("");
}

function submitReview(productId) {
  if (!state.currentUser) {
    showToast("Vui lòng đăng nhập để gửi nhận xét.", "error");
    showPage("authPage");
    return;
  }
  const comment = $("reviewComment").value.trim();
  if (!detailSelectedRating) {
    showToast("Chọn số sao trước khi gửi nhận xét.", "error");
    return;
  }
  if (!comment) {
    showToast("Viết nhận xét ngắn gọn để giúp người khác.", "error");
    return;
  }
  api(`/products/${productId}/reviews`, {
    method: "POST",
    body: JSON.stringify({
      userId: state.currentUser.id,
      userName: state.currentUser.name,
      userAvatar: state.currentUser.avatar || "",
      rating: detailSelectedRating,
      comment,
    }),
  })
    .then(() => {
      showToast("Cảm ơn bạn đã gửi nhận xét!");
      $("reviewComment").value = "";
      renderReviewStarsPicker(0);
      loadReviewsForProduct(productId);
      refreshData();
    })
    .catch((err) => showToast(err.message, "error"));
}

/* ── CART ── */
function addToCart(id) {
  if (!state.currentUser) {
    showPage("authPage");
    showToast("Vui lòng đăng nhập để thêm vào giỏ.", "error");
    return;
  }
  const book = state.products.find((p) => p.id === id);
  if (!book) return;
  const cart = getCart();
  cart[id] = (cart[id] || 0) + 1;
  setCart(cart);
  updateCartBadge();
  showToast(`Đã thêm "${book.title}" vào giỏ!`);
}

function renderCart() {
  if (!state.currentUser) {
    showPage("authPage");
    return;
  }
  const cart = getCart();
  const items = Object.keys(cart)
    .map((id) => {
      const p = state.products.find((p) => p.id === id);
      if (!p) return null;
      return {
        ...p,
        quantity: cart[id],
        salePrice: calculateFlashSalePrice(p.id, p.price),
      };
    })
    .filter(Boolean);

  if (!items.length) {
    $("cartContent").innerHTML = `
      <div class="cart-empty">
        <div class="cart-empty-icon">🛒</div>
        <h3>Giỏ hàng trống</h3>
        <p>Thêm sách từ cửa hàng để tiếp tục.</p>
        <button class="btn-primary" onclick="showPage('shopPage')">🏪 Tiếp tục mua sắm</button>
      </div>`;
    return;
  }

  const total = items.reduce((s, i) => s + i.salePrice * i.quantity, 0);
  $("cartContent").innerHTML = `
    <div class="cart-layout">
      <div class="cart-items-card">
        ${items
          .map(
            (item) => `
          <div class="cart-item">
            <div class="cart-cover">${coverMarkup(item.cover, item.title)}</div>
            <div class="cart-info">
              <div class="cart-title">${esc(item.title)}</div>
              <div class="cart-author">${esc(item.author)}</div>
              <div class="cart-unit-price">
                ${
                  item.salePrice < item.price
                    ? `
                  <span class="price-old">$${item.price.toFixed(2)}</span>
                  <span class="price-sale">$${item.salePrice.toFixed(2)}</span>
                `
                    : `$${item.price.toFixed(2)} / cuốn`
                }
              </div>
            </div>
            <div class="cart-controls">
              <input type="number" class="qty-input" min="1" value="${item.quantity}" data-id="${item.id}" />
              <button class="btn-danger remove-item" data-id="${item.id}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
                🗑️ Xóa
              </button>
            </div>
          </div>
        `,
          )
          .join("")}
      </div>
      <div class="cart-summary-card">
        <h3>Tóm tắt đơn hàng</h3>
        ${items
          .map(
            (i) => `
          <div class="summary-row">
            <span>${esc(i.title)} x${i.quantity}</span>
            <span>$${(i.salePrice * i.quantity).toFixed(2)}</span>
          </div>`,
          )
          .join("")}
        <div class="summary-total">
          <span>Tổng cộng</span>
          <span>$${total.toFixed(2)}</span>
        </div>
        <button class="btn-primary btn-full btn-lg" id="goCheckout">💳 Thanh toán</button>
        <button class="btn-ghost btn-full" onclick="showPage('shopPage')" style="margin-top:8px;">🏪 Tiếp tục mua sắm</button>
      </div>
    </div>`;

  $("cartContent")
    .querySelectorAll(".qty-input")
    .forEach((inp) => {
      inp.addEventListener("change", () => {
        const id = inp.dataset.id;
        const qty = Math.max(1, parseInt(inp.value) || 1);
        const cart = getCart();
        cart[id] = qty;
        setCart(cart);
        renderCart();
        updateCartBadge();
      });
    });
  $("cartContent")
    .querySelectorAll(".remove-item")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        const cart = getCart();
        delete cart[btn.dataset.id];
        setCart(cart);
        renderCart();
        updateCartBadge();
        showToast("Đã xóa khỏi giỏ hàng.");
      });
    });
  const goCheckout = $("goCheckout");
  if (goCheckout) goCheckout.addEventListener("click", showCheckout);
}

/* ── CHECKOUT ── */
function showCheckout() {
  if (!state.currentUser) {
    showPage("authPage");
    return;
  }
  renderCheckoutSummary();
  renderCheckoutPaymentOptions();
  showPage("checkoutPage");
}

function renderCheckoutSummary() {
  const cart = getCart();
  const items = Object.keys(cart)
    .map((id) => {
      const p = state.products.find((p) => p.id === id);
      if (!p) return null;
      return {
        ...p,
        quantity: cart[id],
        salePrice: calculateFlashSalePrice(p.id, p.price),
      };
    })
    .filter(Boolean);
  if (!items.length) {
    $("checkoutSummary").innerHTML = "<p>Giỏ hàng trống.</p>";
    $("checkoutPaymentMethods")?.classList.add("hidden");
    $("checkoutPaymentPreview")?.classList.add("hidden");
    return;
  }
  const total = items.reduce((s, i) => s + i.salePrice * i.quantity, 0);
  $("checkoutSummary").innerHTML = `
    <h3>Đơn hàng của bạn</h3>
    ${items
      .map(
        (i) => `
      <div class="checkout-item">
        <div class="checkout-item-info">
          <div class="checkout-item-title">${esc(i.title)}</div>
          <div class="checkout-item-qty">x${i.quantity}</div>
        </div>
        <span>$${(i.salePrice * i.quantity).toFixed(2)}</span>
      </div>`,
      )
      .join("")}
    <div class="checkout-total">
      <span>Tổng cộng</span>
      <span>$${total.toFixed(2)}</span>
    </div>`;
  $("checkoutPaymentMethods")?.classList.remove("hidden");
  $("checkoutPaymentPreview")?.classList.remove("hidden");
}

function renderCheckoutPaymentOptions() {
  const methods = state.paymentMethods.filter((m) => m.active);
  const methodsContainer = $("checkoutPaymentMethods");
  const previewContainer = $("checkoutPaymentPreview");
  if (!methodsContainer || !previewContainer) return;
  if (!methods.length) {
    methodsContainer.innerHTML = `
      <div class="checkout-payment-empty">
        Chưa có phương thức thanh toán QR. Vui lòng thử lại sau.
      </div>`;
    previewContainer.innerHTML = "";
    return;
  }

  if (
    !state.selectedPaymentMethodId ||
    !methods.some((m) => m.id === state.selectedPaymentMethodId)
  ) {
    const codMethod = methods.find((m) => m.id === "cod");
    state.selectedPaymentMethodId = codMethod ? codMethod.id : methods[0].id;
  }

  methodsContainer.innerHTML = methods
    .map(
      (method) => `
        <div class="payment-method-list-item ${method.id === state.selectedPaymentMethodId ? "selected" : ""}" data-id="${esc(
          method.id,
        )}">
          <div class="payment-method-list-left">
            <input type="radio" name="paymentMethod" value="${esc(
              method.id,
            )}" ${method.id === state.selectedPaymentMethodId ? "checked" : ""} />
          </div>
          <div class="payment-method-list-body">
            <div class="payment-method-name">${esc(method.name)}</div>
            <div class="payment-method-description">${esc(
              method.description || "Quét mã QR để thanh toán.",
            )}</div>
          </div>
        </div>`,
    )
    .join("");

  document.querySelectorAll(".payment-method-list-item").forEach((el) => {
    el.addEventListener("click", () => {
      const id = el.dataset.id;
      state.selectedPaymentMethodId = id;
      renderCheckoutPaymentOptions();
    });
  });

  document.querySelectorAll('[name="paymentMethod"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      state.selectedPaymentMethodId = radio.value;
      renderCheckoutPaymentOptions();
    });
  });

  updateCheckoutPaymentPreview();
  updateCheckoutButtonLabel();
}

function updateCheckoutPaymentPreview() {
  const previewContainer = $("checkoutPaymentPreview");
  if (!previewContainer) return;
  const method = state.paymentMethods.find(
    (m) => m.id === state.selectedPaymentMethodId,
  );
  if (!method) {
    previewContainer.innerHTML = "";
    return;
  }
  const imgSrc = method.image || method.qrImage || "";
  previewContainer.innerHTML = `
    <div class="payment-preview-card">
      <div class="payment-preview-header">
        <h4>Quét mã QR</h4>
        <span>${esc(method.name)}</span>
      </div>
      <div class="payment-preview-body">
        ${imgSrc ? `<img src="${esc(imgSrc)}" alt="QR ${esc(method.name)}" />` : ""}
        <p>${esc(method.description || "Sử dụng mã QR để chuyển khoản.")}</p>
      </div>
    </div>`;
}

function handleCheckout() {
  if (!state.currentUser) {
    showPage("authPage");
    return;
  }
  const fullName = $("shippingFullName").value.trim();
  const address = $("shippingAddress").value.trim();
  const city = $("shippingCity").value.trim();
  const phone = $("shippingPhone").value.trim();
  if (!fullName || !address || !city || !phone)
    return showToast("Vui lòng điền đầy đủ thông tin giao hàng.", "error");
  const cart = getCart();
  const items = Object.keys(cart)
    .map((id) => {
      const p = state.products.find((p) => p.id === id);
      if (!p) return null;
      const salePrice = calculateFlashSalePrice(p.id, p.price);
      return {
        productId: id,
        title: p.title,
        quantity: cart[id],
        price: salePrice,
      };
    })
    .filter(Boolean);
  if (!items.length) return showToast("Giỏ hàng trống.", "error");
  const paymentMethod = state.paymentMethods.find(
    (method) => method.id === state.selectedPaymentMethodId,
  );
  if (!paymentMethod)
    return showToast("Vui lòng chọn phương thức thanh toán.", "error");
  const total = items.reduce((s, i) => s + i.price * i.quantity, 0);
  api("/orders", {
    method: "POST",
    body: JSON.stringify({
      userId: state.currentUser.id,
      items,
      total,
      shipping: { fullName, address, city, phone },
      paymentMethodId: paymentMethod.id,
      paymentMethodName: paymentMethod.name,
      paymentStatus: paymentMethod.id === "cod" ? "Pending" : "Paid",
      status: "Processing",
    }),
  })
    .then(() => {
      setCart({});
      updateCartBadge();
      showToast("Đặt hàng thành công! 🎉");
      showPage("ordersPage");
    })
    .catch((err) => showToast(err.message, "error"));
}

async function updateOrderStatus(orderId, status) {
  await api(`/orders/${orderId}`, {
    method: "PUT",
    body: JSON.stringify({ status }),
  });
  showToast(
    status === "Cancelled"
      ? "Đơn hàng đã được hủy thành công."
      : "Cập nhật trạng thái đơn hàng thành công.",
  );
  renderOrders();
}

/* ── ORDERS ── */
function renderOrders() {
  if (!state.currentUser) {
    showPage("authPage");
    return;
  }
  $("orderList").innerHTML =
    `<div class="grid-loading"><div class="spinner"></div><p>Đang tải đơn hàng…</p></div>`;
  api(`/orders?userId=${state.currentUser.id}`)
    .then((orders) => {
      if (!orders.length) {
        $("orderList").innerHTML =
          `<div class="orders-empty"><div style="font-size:48px;margin-bottom:12px">📦</div><h3>Chưa có đơn hàng</h3><p>Đặt hàng từ cửa hàng để xem lịch sử tại đây.</p></div>`;
        return;
      }
      const statusClass = {
        Processing: "status-processing",
        Shipped: "status-shipped",
        Delivered: "status-delivered",
        Cancelled: "status-cancelled",
      };
      const statusLabel = {
        Processing: "Đang xử lý",
        Shipped: "Đang giao",
        Delivered: "Đã giao",
        Cancelled: "Đã hủy",
      };
      $("orderList").innerHTML = `<div class="orders-list">${orders
        .map((o) => {
          const canCancel = o.status === "Processing" || o.status === "Shipped";
          const canConfirm = o.status === "Shipped";
          const actionButtons = [];
          if (canCancel) {
            actionButtons.push(
              `<button class="btn btn-ghost btn-sm order-action-cancel" data-id="${esc(
                o.id,
              )}">🚫 Hủy đơn</button>`,
            );
          }
          if (canConfirm) {
            actionButtons.push(
              `<button class="btn btn-primary btn-sm order-action-received" data-id="${esc(
                o.id,
              )}">Đã nhận hàng</button>`,
            );
          }
          return `
        <div class="order-card">
          <div class="order-card-header">
            <div>
              <div class="order-id">Đơn #${esc(o.id)}</div>
              <div class="order-date">${new Date(
                o.createdAt,
              ).toLocaleDateString("vi-VN", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              })}</div>
            </div>
            <span class="order-status ${statusClass[o.status] || ""}">${statusLabel[o.status] || o.status}</span>
          </div>
          <div class="order-items">
            ${(o.items || [])
              .map(
                (item) =>
                  `<div class="order-item"><span>${esc(item.title)} <span style="color:var(--ink-faint)">x${item.quantity}</span></span><span>$${(
                    item.price * item.quantity
                  ).toFixed(2)}</span></div>`,
              )
              .join("")}
          </div>
          <div class="order-card-footer">
            <div>
              <div class="order-shipping">📍 ${esc(
                o.shipping?.address || "",
              )}, ${esc(o.shipping?.city || "")}</div>
              <div class="order-total">$${o.total.toFixed(2)}</div>
            </div>
            <div class="order-actions">${actionButtons.join("")}</div>
          </div>
        </div>`;
        })
        .join("")}</div>`;
      document.querySelectorAll(".order-action-cancel").forEach((btn) => {
        btn.addEventListener("click", () => {
          updateOrderStatus(btn.dataset.id, "Cancelled");
        });
      });
      document.querySelectorAll(".order-action-received").forEach((btn) => {
        btn.addEventListener("click", () => {
          updateOrderStatus(btn.dataset.id, "Delivered");
        });
      });
    })
    .catch((err) => {
      $("orderList").innerHTML =
        `<div class="orders-empty"><p style="color:red">${err.message}</p></div>`;
    });
}

/* ── ACCOUNT ── */
function renderAccount() {
  if (!state.currentUser) return;
  const u = state.currentUser;
  const initial = (u.name || "U")[0].toUpperCase();
  const avatarElem = $("accountAvatarLarge");
  const avatarPreview = $("accountAvatarPreview");
  const avatarSrc = u.avatar || "";
  const avatarContent = avatarSrc
    ? `<img src="${esc(avatarSrc)}" alt="${esc(u.name || "Avatar")}" />`
    : initial;

  if (avatarElem) {
    avatarElem.innerHTML = avatarContent;
    avatarElem.style.background = avatarSrc ? "transparent" : "var(--purple)";
    avatarElem.style.border = avatarSrc ? "1px solid var(--border)" : "none";
  }
  if (avatarPreview) {
    avatarPreview.innerHTML = avatarContent;
  }

  $("accountName").textContent = u.name || "Người dùng";
  $("accountEmail").textContent = u.email || "—";
  $("accountPhoneTop").textContent = u.shipping?.phone
    ? `SĐT: ${u.shipping.phone}`
    : "SĐT chưa cập nhật";
  $("accountAddressTop").textContent =
    u.shipping?.address || "Địa chỉ nhận hàng chưa cập nhật";
  $("accountRole").textContent = u.role === "admin" ? "Admin" : "Thành viên";

  if ($("accountNameInput")) $("accountNameInput").value = u.name || "";
  if ($("accountEmailInput")) $("accountEmailInput").value = u.email || "";
  if ($("accountAddressInput"))
    $("accountAddressInput").value = u.shipping?.address || "";
  if ($("accountPhoneInput"))
    $("accountPhoneInput").value = u.shipping?.phone || "";
  if ($("accountPasswordInput")) $("accountPasswordInput").value = "";
  if ($("accountConfirmPasswordInput"))
    $("accountConfirmPasswordInput").value = "";

  api(`/orders?userId=${u.id}`)
    .then((orders) => {
      $("statOrders").textContent = orders.length;
      $("statSpent").textContent =
        `$${orders.reduce((s, o) => s + o.total, 0).toFixed(2)}`;
    })
    .catch(() => {});
}

function handleAvatarUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!/^image\/(jpeg|png)$/i.test(file.type)) {
    showToast("Chỉ chấp nhận ảnh JPG/PNG.", "error");
    event.target.value = "";
    return;
  }
  readFileAsDataURL(file)
    .then((data) => {
      pendingAvatarData = data;
      const preview = $("accountAvatarPreview");
      const large = $("accountAvatarLarge");
      const markup = `<img src="${esc(data)}" alt="Avatar" />`;
      if (preview) preview.innerHTML = markup;
      if (large) {
        large.innerHTML = markup;
        large.style.background = "transparent";
        large.style.border = "1px solid var(--border)";
      }
    })
    .catch((err) => showToast(err.message, "error"));
}

function handleAccountSave() {
  if (!state.currentUser) return;
  const name = $("accountNameInput").value.trim();
  const address = $("accountAddressInput").value.trim();
  const phone = $("accountPhoneInput").value.trim();
  const password = $("accountPasswordInput").value;
  const confirm = $("accountConfirmPasswordInput").value;
  if (!name) return showToast("Vui lòng nhập họ và tên.", "error");
  if (password && password !== confirm)
    return showToast("Mật khẩu mới không khớp.", "error");

  const payload = { name };
  if (password) payload.password = password;

  api(`/users/${state.currentUser.id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  })
    .then((updated) => {
      state.currentUser = {
        ...state.currentUser,
        ...updated,
        avatar: pendingAvatarData || state.currentUser.avatar,
        shipping: { address, phone },
      };
      saveLocal();
      renderAccount();
      showToast("Cập nhật tài khoản thành công!");
    })
    .catch((err) => showToast(err.message, "error"));
}

/* ── ADMIN RENDER ── */
function renderAdmin() {
  renderAdminProducts();
  renderAdminAccounts();
  renderAdminCategories();
  renderAdminOrders();
  renderAdminReviews();
}

function renderAdminProducts() {
  api("/products").then((products) => {
    $("productTable").innerHTML = `
      <table class="admin-table">
        <thead><tr><th>Bìa</th><th>Tiêu đề</th><th>Tác giả</th><th>Danh mục</th><th>Giá</th><th>Tồn</th><th>Đánh giá</th><th>Thao tác</th></tr></thead>
        <tbody>${products
          .map(
            (p) => `
          <tr>
            <td><div class="td-cover">${coverMarkup(p.cover, p.title)}</div></td>
            <td class="td-title">${esc(p.title)}</td>
            <td>${esc(p.author)}</td>
            <td>${state.categories.find((c) => c.id === p.category)?.name || "—"}</td>
            <td>$${p.price.toFixed(2)}</td>
            <td>${p.stock}</td>
            <td>★ ${p.rating.toFixed(1)}</td>
            <td><div class="td-actions">
              <button class="btn-edit admin-edit-product" data-id="${p.id}">✏ Sửa</button>
              <button class="btn-danger admin-delete-product" data-id="${p.id}">🗑 Xóa</button>
            </div></td>
          </tr>`,
          )
          .join("")}
        </tbody>
      </table>`;
    $("productTable")
      .querySelectorAll(".admin-edit-product")
      .forEach((b) =>
        b.addEventListener("click", () => {
          const p = state.products.find((x) => x.id === b.dataset.id);
          showEditor("products", "edit", p);
        }),
      );
    $("productTable")
      .querySelectorAll(".admin-delete-product")
      .forEach((b) =>
        b.addEventListener("click", () =>
          confirmDelete(`/products/${b.dataset.id}`, "sách này"),
        ),
      );
  });
}

function renderAdminAccounts() {
  api("/users").then((users) => {
    $("accountTable").innerHTML = `
      <table class="admin-table">
        <thead><tr><th>Tên</th><th>Email</th><th>Vai trò</th><th>Thao tác</th></tr></thead>
        <tbody>${users
          .map(
            (u) => `
          <tr>
            <td class="td-title">${esc(u.name)}</td>
            <td>${esc(u.email)}</td>
            <td><span class="role-badge" style="font-size:11px">${esc(u.role)}</span></td>
            <td><div class="td-actions">
              <button class="btn-edit admin-edit-account" data-id="${u.id}">✏ Sửa</button>
              ${u.role !== "admin" ? `<button class="btn-danger admin-delete-account" data-id="${u.id}">🗑 Xóa</button>` : ""}
            </div></td>
          </tr>`,
          )
          .join("")}
        </tbody>
      </table>`;
    $("accountTable")
      .querySelectorAll(".admin-edit-account")
      .forEach((b) =>
        b.addEventListener("click", () => {
          const u = state.users.find((x) => x.id === b.dataset.id);
          showEditor("accounts", "edit", u);
        }),
      );
    $("accountTable")
      .querySelectorAll(".admin-delete-account")
      .forEach((b) =>
        b.addEventListener("click", () =>
          confirmDelete(`/users/${b.dataset.id}`, "tài khoản này"),
        ),
      );
  });
}

function renderAdminCategories() {
  api("/categories").then((cats) => {
    $("categoryTable").innerHTML = `
      <table class="admin-table">
        <thead><tr><th>Tên danh mục</th><th>ID</th><th>Thao tác</th></tr></thead>
        <tbody>${cats
          .map(
            (c) => `
          <tr>
            <td class="td-title">${esc(c.name)}</td>
            <td style="color:var(--ink-faint);font-family:monospace;font-size:12px">${esc(c.id)}</td>
            <td><div class="td-actions">
              <button class="btn-edit admin-edit-category" data-id="${c.id}">✏ Sửa</button>
              <button class="btn-danger admin-delete-category" data-id="${c.id}">🗑 Xóa</button>
            </div></td>
          </tr>`,
          )
          .join("")}
        </tbody>
      </table>`;
    $("categoryTable")
      .querySelectorAll(".admin-edit-category")
      .forEach((b) =>
        b.addEventListener("click", () => {
          const c = state.categories.find((x) => x.id === b.dataset.id);
          showEditor("categories", "edit", c);
        }),
      );
    $("categoryTable")
      .querySelectorAll(".admin-delete-category")
      .forEach((b) =>
        b.addEventListener("click", () =>
          confirmDelete(`/categories/${b.dataset.id}`, "danh mục này"),
        ),
      );
  });
}

function renderAdminOrders() {
  api("/orders").then((orders) => {
    const statusOpts = ["Processing", "Shipped", "Delivered", "Cancelled"];
    const statusLabel = {
      Processing: "Đang xử lý",
      Shipped: "Đang giao",
      Delivered: "Đã giao",
      Cancelled: "Đã hủy",
    };
    const statusClass = {
      Processing: "status-processing",
      Shipped: "status-shipped",
      Delivered: "status-delivered",
      Cancelled: "status-cancelled",
    };
    $("orderTable").innerHTML = `
      <table class="admin-table">
        <thead><tr><th>Mã đơn</th><th>Khách hàng</th><th>Tổng tiền</th><th>Trạng thái</th><th>Ngày</th><th>Thao tác</th></tr></thead>
        <tbody>${orders
          .map((o) => {
            const cust = state.users.find((u) => u.id === o.userId);
            const date = o.createdAt
              ? new Date(o.createdAt).toLocaleDateString("vi-VN")
              : "—";
            return `<tr>
            <td style="font-family:monospace;font-size:12px">${esc(o.id)}</td>
            <td class="td-title">${esc(cust?.name || o.userId)}</td>
            <td>$${o.total.toFixed(2)}</td>
            <td><span class="table-status ${statusClass[o.status] || ""}">${statusLabel[o.status] || o.status}</span></td>
            <td>${date}</td>
            <td><div class="td-actions">
              <button class="btn-edit admin-edit-order" data-id="${o.id}">✏ Cập nhật</button>
              <button class="btn-danger admin-delete-order" data-id="${o.id}">🗑 Xóa</button>
            </div></td>
          </tr>`;
          })
          .join("")}
        </tbody>
      </table>`;
    $("orderTable")
      .querySelectorAll(".admin-edit-order")
      .forEach((b) =>
        b.addEventListener("click", () => {
          const o = state.orders.find((x) => x.id === b.dataset.id);
          if (!o) return;
          showEditor("orders", "edit", {
            ...o,
            productId: o.items?.[0]?.productId,
            quantity: o.items?.[0]?.quantity,
          });
        }),
      );
    $("orderTable")
      .querySelectorAll(".admin-delete-order")
      .forEach((b) =>
        b.addEventListener("click", () =>
          confirmDelete(`/orders/${b.dataset.id}`, "đơn hàng này"),
        ),
      );
  });
}

function renderAdminReviews() {
  api("/reviews").then((reviews) => {
    $("reviewTable").innerHTML = `
      <table class="admin-table">
        <thead><tr><th>Sản phẩm</th><th>Người dùng</th><th>Đánh giá</th><th>Nhận xét</th><th>Ngày</th><th>Hành động</th></tr></thead>
        <tbody>${reviews
          .map((review) => {
            const book = state.products.find((p) => p.id === review.productId);
            return `
              <tr>
                <td class="td-title">${esc(book?.title || review.productId)}</td>
                <td>${esc(review.userName || "Khách")}</td>
                <td>${renderStars(review.rating)}</td>
                <td style="max-width:240px;word-break:break-word;">${esc(review.comment)}</td>
                <td>${formatReviewDate(review.createdAt)}</td>
                <td><div class="td-actions">
                  <button class="btn-danger admin-delete-review" data-id="${review.id}">🗑 Xóa</button>
                </div></td>
              </tr>`;
          })
          .join("")}
        </tbody>
      </table>`;
    $("reviewTable")
      .querySelectorAll(".admin-delete-review")
      .forEach((btn) =>
        btn.addEventListener("click", () =>
          confirmDelete(`/reviews/${btn.dataset.id}`, "nhận xét này"),
        ),
      );
  });
}

/* ── CONFIRM DELETE ── */
function confirmDelete(path, label) {
  if (!confirm(`Bạn có chắc muốn xóa ${label}?`)) return;
  api(path, { method: "DELETE" })
    .then(() => {
      showToast("Đã xóa thành công.");
      refreshData();
    })
    .catch((err) => showToast(err.message, "error"));
}

/* ── ADMIN EDITOR ── */
function showEditor(section, mode, item = {}) {
  adminEditorState.section = section;
  adminEditorState.mode = mode;
  adminEditorState.item = item;
  const labels = {
    products: "sách",
    accounts: "tài khoản",
    categories: "danh mục",
    orders: "đơn hàng",
  };
  const action = mode === "edit" ? "Cập nhật" : "Thêm";
  $("adminEditorTitle").textContent = `${action} ${labels[section] || section}`;
  renderEditorFields();
  $("adminEditorModal").classList.remove("hidden");

  // Load existing images for product edit
  if (section === "products" && mode === "edit" && item?.id) {
    setTimeout(() => {
      api(`/products/${item.id}/images`)
        .then((images) => {
          const list = $("existingImagesList");
          if (!list) return;
          list.innerHTML = images.length
            ? images
                .map(
                  (img) =>
                    `<div style="position:relative;display:inline-block;">
                      <img src="${esc(img.imageData)}" style="width:72px;height:72px;object-fit:cover;border-radius:8px;border:2px solid var(--border);" />
                      <button type="button" onclick="deleteProductImage('${esc(item.id)}','${esc(img.id)}')" style="position:absolute;top:-6px;right:-6px;background:var(--danger,#e74c3c);color:#fff;border:none;border-radius:50%;width:20px;height:20px;cursor:pointer;font-size:11px;line-height:1;">✕</button>
                    </div>`,
                )
                .join("")
            : '<span style="color:var(--ink-faint);font-size:13px;">Chưa có ảnh phụ</span>';
        })
        .catch(() => {});
    }, 100);
  }
}

function hideEditor() {
  $("adminEditorModal").classList.add("hidden");
  adminEditorState.section = null;
  adminEditorState.mode = null;
  adminEditorState.item = null;
  $("adminEditorFields").innerHTML = "";
}

function renderEditorFields() {
  const item = adminEditorState.item || {};
  const section = adminEditorState.section;
  let html = "";

  if (section === "products") {
    const catOpts = state.categories
      .map(
        (c) =>
          `<option value="${esc(c.id)}" ${c.id === item.category ? "selected" : ""}>${esc(c.name)}</option>`,
      )
      .join("");
    html = `
      <div class="form-group"><label>Tiêu đề *</label><input name="title" value="${esc(item.title)}" required /></div>
      <div class="form-group"><label>Tác giả *</label><input name="author" value="${esc(item.author)}" required /></div>
      <div class="form-group"><label>Danh mục *</label><select name="category" required>${catOpts}</select></div>
      <div class="form-row">
        <div class="form-group"><label>Giá ($) *</label><input name="price" type="number" step="0.01" value="${item.price ?? 0}" required /></div>
      </div>
      <div class="form-group"><label>Số lượng tồn</label><input name="stock" type="number" min="0" value="${item.stock ?? 0}" /></div>
      <div class="form-group"><label>Mô tả</label><textarea name="description" rows="3">${esc(item.description)}</textarea></div>
      <div class="form-group"><label>Bìa sách chính (chọn tệp ảnh hoặc nhập URL/emoji)</label><input type="file" name="coverFile" accept="image/*" /></div>
      <div class="form-group"><label>Bìa sách (URL ảnh hoặc emoji)</label><input name="cover" value="${esc(item.cover)}" placeholder="https://… hoặc 📚" /></div>
      ${
        adminEditorState.mode === "edit"
          ? `
      <div class="form-group">
        <label>Thêm nhiều ảnh cho sách này</label>
        <input type="file" name="extraImages" accept="image/*" multiple />
        <div style="font-size:12px;color:var(--ink-faint);margin-top:4px;">Chọn nhiều file cùng lúc để upload nhiều ảnh</div>
      </div>
      <div class="form-group" id="existingImagesContainer">
        <label>Ảnh hiện có</label>
        <div id="existingImagesList" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;"></div>
      </div>`
          : ""
      }`;
  } else if (section === "accounts") {
    const isEdit = adminEditorState.mode === "edit";
    html = `
      <div class="form-group"><label>Họ và tên *</label><input name="name" value="${esc(item.name)}" required /></div>
      <div class="form-group"><label>Email *</label><input name="email" type="email" value="${esc(item.email)}" required /></div>
      <div class="form-group"><label>Vai trò</label><select name="role"><option value="user" ${item.role === "user" ? "selected" : ""}>User</option><option value="admin" ${item.role === "admin" ? "selected" : ""}>Admin</option></select></div>
      <div class="form-group"><label>Mật khẩu ${isEdit ? "(bỏ trống để giữ nguyên)" : "*"}</label><input name="password" type="password" ${!isEdit ? "required" : ""} placeholder="${isEdit ? "Bỏ trống để giữ nguyên" : "Nhập mật khẩu"}" /></div>`;
  } else if (section === "categories") {
    html = `<div class="form-group"><label>Tên danh mục *</label><input name="name" value="${esc(item.name)}" required /></div>`;
  } else if (section === "orders") {
    const userOpts = state.users
      .map(
        (u) =>
          `<option value="${esc(u.id)}" ${u.id === item.userId ? "selected" : ""}>${esc(u.name)} (${esc(u.email)})</option>`,
      )
      .join("");
    const prodOpts = state.products
      .map(
        (p) =>
          `<option value="${esc(p.id)}" ${p.id === item.productId ? "selected" : ""}>${esc(p.title)}</option>`,
      )
      .join("");
    const sh = item.shipping || {};
    const statuses = ["Processing", "Shipped", "Delivered", "Cancelled"];
    const statusOpts = statuses
      .map(
        (s) =>
          `<option value="${s}" ${item.status === s ? "selected" : ""}>${s}</option>`,
      )
      .join("");
    const isCancelledOrder = item.status === "Cancelled";
    html = `
      <div class="form-group"><label>Khách hàng</label><select name="userId">${userOpts}</select></div>
      <div class="form-group">
        <label>Trạng thái</label>
        <select name="status" ${isCancelledOrder ? "disabled" : ""}>${statusOpts}</select>
        ${
          isCancelledOrder
            ? `<div class="field-note" style="color:#b45309;font-size:13px;margin-top:6px">Đơn hàng đã hủy, trạng thái không thể thay đổi thủ công.</div>`
            : ""
        }
      </div>
      <div class="form-group"><label>Tổng tiền ($)</label><input name="total" type="number" step="0.01" value="${item.total ?? 0}" /></div>
      <div class="form-group"><label>Sản phẩm</label><select name="productId">${prodOpts}</select></div>
      <div class="form-group"><label>Số lượng</label><input name="quantity" type="number" min="1" value="${item.quantity ?? 1}" /></div>
      <div class="form-row">
        <div class="form-group"><label>Địa chỉ</label><input name="address" value="${esc(sh.address)}" /></div>
        <div class="form-group"><label>Thành phố</label><input name="city" value="${esc(sh.city)}" /></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Mã bưu chính</label><input name="postal" value="${esc(sh.postal)}" /></div>
        <div class="form-group"><label>Số điện thoại</label><input name="phone" value="${esc(sh.phone)}" /></div>
      </div>`;
  } else if (section === "contact") {
    html = `
      <div class="form-group"><label>Địa chỉ</label><input name="address" value="${esc(item.address || "")}" /></div>
      <div class="form-group"><label>Số điện thoại</label><input name="phone" value="${esc(item.phone || "")}" /></div>
      <div class="form-group"><label>Email liên hệ</label><input name="email" type="email" value="${esc(item.email || "")}" /></div>
      <div class="form-group"><label>Google Maps URL</label><input name="mapUrl" value="${esc(item.mapUrl || "")}" placeholder="https://maps.google.com/..." /></div>
      <div class="form-group"><label>Facebook URL</label><input name="facebook" value="${esc(item.facebook || "")}" /></div>
      <div class="form-group"><label>Instagram URL</label><input name="instagram" value="${esc(item.instagram || "")}" /></div>
      <div class="form-group"><label>YouTube URL</label><input name="youtube" value="${esc(item.youtube || "")}" /></div>`;
  }
  $("adminEditorFields").innerHTML = html;
}

async function handleEditorSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const formData = new FormData(form);
  const data = Object.fromEntries(
    [...formData.entries()].filter(([key]) => key !== "coverFile"),
  );
  const { section, mode, item } = adminEditorState;
  let path, method, body;

  if (section === "products") {
    body = {
      title: data.title,
      author: data.author,
      category: data.category,
      price: Number(data.price),
      stock: Number(data.stock),
      description: data.description,
      cover: data.cover,
    };
    const coverFile = form.querySelector('[name="coverFile"]')?.files?.[0];
    if (coverFile) {
      body.cover = await readFileAsDataURL(coverFile);
    }
    path = mode === "edit" ? `/products/${item.id}` : "/products";
    method = mode === "edit" ? "PUT" : "POST";
  } else if (section === "accounts") {
    body = { name: data.name, email: data.email, role: data.role };
    if (data.password) body.password = data.password;
    path = mode === "edit" ? `/users/${item.id}` : "/users";
    method = mode === "edit" ? "PUT" : "POST";
  } else if (section === "categories") {
    body = { name: data.name };
    path = mode === "edit" ? `/categories/${item.id}` : "/categories";
    method = mode === "edit" ? "PUT" : "POST";
  } else if (section === "orders") {
    const selProd = state.products.find((p) => p.id === data.productId);
    const items = selProd
      ? [
          {
            productId: selProd.id,
            title: selProd.title,
            quantity: Number(data.quantity) || 1,
            price: selProd.price,
          },
        ]
      : [];
    const status = data.status || item.status;
    if (item.status === "Cancelled" && status !== "Cancelled") {
      showToast("Không thể đổi trạng thái của đơn đã hủy.", "error");
      return;
    }
    body = {
      userId: data.userId,
      status,
      total: Number(data.total),
      items,
      shipping: {
        address: data.address,
        city: data.city,
        postal: data.postal,
        phone: data.phone,
      },
    };
    path = mode === "edit" ? `/orders/${item.id}` : "/orders";
    method = mode === "edit" ? "PUT" : "POST";
  } else if (section === "contact") {
    body = {
      address: data.address,
      phone: data.phone,
      email: data.email,
      mapUrl: data.mapUrl,
      facebook: data.facebook,
      instagram: data.instagram,
      youtube: data.youtube,
    };
    path = "/contact";
    method = "PUT";
  }

  api(path, { method, body: JSON.stringify(body) })
    .then(async (savedProduct) => {
      // Upload extra images for products
      if (section === "products") {
        const extraFilesInput = document.querySelector('[name="extraImages"]');
        const extraFiles = extraFilesInput ? [...extraFilesInput.files] : [];
        const productId = mode === "edit" ? item.id : savedProduct?.id || "";
        if (productId && extraFiles.length) {
          for (let i = 0; i < extraFiles.length; i++) {
            try {
              const imgData = await readFileAsDataURL(extraFiles[i]);
              await api(`/products/${productId}/images`, {
                method: "POST",
                body: JSON.stringify({ imageData: imgData, sortOrder: i }),
              });
            } catch (e) {
              console.error("Image upload error:", e);
            }
          }
        }
      }
      hideEditor();
      refreshData();
      if (section === "contact") refreshFooter();
      showToast("Lưu thành công!");
    })
    .catch((err) => showToast(err.message, "error"));
}

function deleteProductImage(productId, imageId) {
  api(`/products/${productId}/images/${imageId}`, { method: "DELETE" })
    .then(() => {
      showToast("Đã xóa ảnh.");
      // Reload existing images list
      const item = adminEditorState.item;
      if (item) {
        api(`/products/${item.id}/images`).then((images) => {
          const list = $("existingImagesList");
          if (!list) return;
          list.innerHTML = images.length
            ? images
                .map(
                  (img) =>
                    `<div style="position:relative;display:inline-block;"><img src="${esc(img.imageData)}" style="width:72px;height:72px;object-fit:cover;border-radius:8px;border:2px solid var(--border);" /><button type="button" onclick="deleteProductImage('${esc(item.id)}','${esc(img.id)}')" style="position:absolute;top:-6px;right:-6px;background:var(--danger,#e74c3c);color:#fff;border:none;border-radius:50%;width:20px;height:20px;cursor:pointer;font-size:11px;line-height:1;">✕</button></div>`,
                )
                .join("")
            : '<span style="color:var(--ink-faint);font-size:13px;">Chưa có ảnh phụ</span>';
        });
      }
    })
    .catch((err) => showToast(err.message, "error"));
}

/* ── REFRESH DATA ── */
function refreshData() {
  Promise.all([
    api("/products"),
    api("/categories"),
    api("/users"),
    api("/orders"),
    api("/banners"),
    api("/login-banners"),
    api("/flash-sale"),
    api("/payment-methods"),
  ])
    .then(
      ([
        products,
        categories,
        users,
        orders,
        banners,
        loginBanners,
        flashSale,
        paymentMethods,
      ]) => {
        state.products = products;
        state.categories = categories;
        state.users = users;
        state.orders = orders;
        state.banners = banners || [];
        state.homeBanners = (banners || []).filter(
          (b) => (b.section || "home") === "home",
        );
        state.loginBanners = loginBanners || [];
        state.flashSale = flashSale || { config: null, items: [] };
        state.paymentMethods = paymentMethods || [];
        renderCategoryFilters();
        renderProductGrid();
        renderHeroBanner();
        startHeroRotation();
        renderLoginBanner();
        startLoginBannerRotation();
        renderFlashSaleSection();
        startFlashSaleCountdown();
      },
    )
    .catch((err) => console.error("Data load error:", err));
}

/* ── INIT EVENTS ── */
function initEvents() {
  // Auth
  $("showLogin").addEventListener("click", () => {
    showPage("authPage");
    $("loginTab").click();
  });
  $("showRegister").addEventListener("click", () => {
    showPage("authPage");
    $("registerTab").click();
  });
  $("logoutBtn").addEventListener("click", handleLogout);

  // Auth tabs
  $("loginTab").addEventListener("click", () => {
    $("loginTab").classList.add("active");
    $("registerTab").classList.remove("active");
    $("loginForm").classList.remove("hidden");
    $("registerForm").classList.add("hidden");
    $("forgotPasswordForm").classList.add("hidden");
  });
  $("registerTab").addEventListener("click", () => {
    $("registerTab").classList.add("active");
    $("loginTab").classList.remove("active");
    $("registerForm").classList.remove("hidden");
    $("loginForm").classList.add("hidden");
    $("forgotPasswordForm").classList.add("hidden");
  });

  $("loginSubmit").addEventListener("click", handleLogin);
  $("registerSubmit").addEventListener("click", handleRegister);
  $("forgotPasswordLink").addEventListener("click", showForgotPasswordForm);
  $("forgotPasswordBack").addEventListener("click", showLoginForm);
  $("forgotSendCode").addEventListener("click", handleForgotPasswordRequest);
  $("forgotResetSubmit").addEventListener("click", handleForgotPasswordReset);

  $("loginPassword").addEventListener(
    "keydown",
    (e) => e.key === "Enter" && handleLogin(),
  );
  $("registerConfirm").addEventListener(
    "keydown",
    (e) => e.key === "Enter" && handleRegister(),
  );
  $("forgotConfirmPassword").addEventListener(
    "keydown",
    (e) => e.key === "Enter" && handleForgotPasswordReset(),
  );

  // Logo
  $("logoLink").addEventListener("click", (e) => {
    e.preventDefault();
    showPage("shopPage");
  });

  // Hero buttons
  const heroShopBtn = $("heroShop");
  const heroSection = document.querySelector(".hero");
  const scrollTarget = () =>
    document.querySelector(".shop-layout") ||
    document.querySelector("#productGrid");

  const scrollToProducts = () => {
    scrollTarget()?.scrollIntoView({ behavior: "smooth" });
  };

  if (heroShopBtn) {
    heroShopBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      scrollToProducts();
    });
  }

  if (heroSection) {
    heroSection.addEventListener("click", (event) => {
      if (
        event.target.closest(".hero-arrow") ||
        event.target.closest(".hero-indicator") ||
        event.target.closest("#heroAuth") ||
        event.target.closest("#heroShop")
      ) {
        return;
      }
      scrollToProducts();
    });
  }

  $("heroAuth").addEventListener("click", () => {
    if (state.currentUser) {
      showPage("accountPage");
    } else {
      showPage("authPage");
    }
  });

  const heroPrev = $("heroPrev");
  const heroNext = $("heroNext");
  const heroIndicators = $("heroIndicators");

  if (heroPrev)
    heroPrev.addEventListener("click", () =>
      showHeroSlide(heroBannerIndex - 1),
    );
  if (heroNext)
    heroNext.addEventListener("click", () =>
      showHeroSlide(heroBannerIndex + 1),
    );
  if (heroIndicators)
    heroIndicators.addEventListener("click", (e) => {
      const btn = e.target.closest(".hero-indicator");
      if (!btn) return;
      showHeroSlide(Number(btn.dataset.index));
    });

  // Nav buttons
  $$(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => showPage(btn.dataset.target));
  });

  // Filters
  $("categoryFilters").addEventListener("change", (e) => {
    state.filters.category = e.target.value;
    renderProductGrid();
  });
  $("priceMin").addEventListener("input", () => {
    state.filters.minPrice = Number($("priceMin").value) || 0;
    renderProductGrid();
  });
  $("priceMax").addEventListener("input", () => {
    state.filters.maxPrice = Number($("priceMax").value) || 100;
    renderProductGrid();
  });
  $("sortSelect").addEventListener("change", () => {
    state.filters.sort = $("sortSelect").value;
    renderProductGrid();
  });
  $("clearFilters").addEventListener("click", () => {
    state.filters = {
      category: "all",
      minPrice: 0,
      maxPrice: 100,
      sort: "featured",
      query: "",
    };
    $("priceMin").value = "0";
    $("priceMax").value = "100";
    $("sortSelect").value = "featured";
    $("searchInput").value = "";
    renderCategoryFilters();
    renderProductGrid();
  });

  // Search
  $("searchButton").addEventListener("click", () => {
    state.filters.query = $("searchInput").value;
    renderProductGrid();
    $("searchDropdown").classList.add("hidden");
  });
  $("searchInput").addEventListener("input", (e) => {
    const query = e.target.value.trim();
    if (query.length > 0) {
      updateSearchDropdown(query);
    } else {
      $("searchDropdown").classList.add("hidden");
    }
  });
  $("searchInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      state.filters.query = $("searchInput").value;
      renderProductGrid();
      $("searchDropdown").classList.add("hidden");
    }
    if (e.key === "Escape") {
      $("searchDropdown").classList.add("hidden");
    }
  });

  // Close dropdown when clicking outside
  document.addEventListener("click", (e) => {
    const searchContainer = document.querySelector(".header-search");
    if (searchContainer && !searchContainer.contains(e.target)) {
      $("searchDropdown").classList.add("hidden");
    }
  });

  // Detail
  $("detailBack").addEventListener("click", () => showPage("shopPage"));
  $("detailAddCart").addEventListener("click", () =>
    addToCart($("detailAddCart").dataset.id),
  );
  $("submitReviewBtn").addEventListener("click", () =>
    submitReview($("detailAddCart").dataset.id),
  );
  $("avatarUpload").addEventListener("change", handleAvatarUpload);
  $("saveAccountBtn").addEventListener("click", handleAccountSave);

  // Checkout
  $("checkoutSubmit").addEventListener("click", handleCheckout);

  // Admin tabs
  $$(".admin-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      $$(".admin-tab").forEach((t) => t.classList.remove("active"));
      $$(".admin-panel").forEach((p) => p.classList.add("hidden"));
      tab.classList.add("active");
      const key = tab.dataset.admin;
      $(`admin${key.charAt(0).toUpperCase() + key.slice(1)}`).classList.remove(
        "hidden",
      );
    });
  });

  // Admin new buttons
  $("newProductBtn").addEventListener("click", () =>
    showEditor("products", "create"),
  );
  $("newAccountBtn").addEventListener("click", () =>
    showEditor("accounts", "create"),
  );
  $("newCategoryBtn").addEventListener("click", () =>
    showEditor("categories", "create"),
  );
  $("newOrderBtn").addEventListener("click", () =>
    showEditor("orders", "create"),
  );

  // Edit contact info (admin)
  document.addEventListener("click", (e) => {
    if (e.target && e.target.id === "editContactBtn") {
      api("/contact")
        .then((info) => {
          showEditor("contact", "edit", info);
        })
        .catch(() => showEditor("contact", "edit", {}));
    }
  });

  // Editor modal
  $("closeAdminEditor").addEventListener("click", hideEditor);
  $("adminEditorCancel").addEventListener("click", hideEditor);
  $("adminEditorModal").addEventListener("click", (e) => {
    if (e.target === $("adminEditorModal")) hideEditor();
  });
  $("adminEditorForm").addEventListener("submit", handleEditorSubmit);
}

/* ── INIT APP ── */
function initHistory() {
  window.addEventListener("popstate", (event) => {
    const page = event.state?.page || getPageFromHash() || "shopPage";
    showPage(page, false);
  });
}

function initApp() {
  loadLocal();
  initHistory();
  initEvents();
  updateAuthUI();
  const initialPage = getPageFromHash();
  if (initialPage) {
    showPage(initialPage, false);
  } else {
    history.replaceState(
      { page: document.querySelector(".page:not(.hidden)")?.id || "shopPage" },
      "",
      `#${document.querySelector(".page:not(.hidden)")?.id || "shopPage"}`,
    );
  }
  refreshData();
  refreshFooter();
}

initApp();
