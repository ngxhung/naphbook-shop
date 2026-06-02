/* ================================================================
   NAPH ADMIN — admin.js
   Dùng API: localhost:3000/api (server.js cũ)

   MAP FIELD (server cũ → admin mới):
   - products: title, author, category (string id), price, rating, stock, description, cover
   - orders status: "Processing" | "Shipped" | "Delivered" | "Cancelled"
   - users role: "admin" | "user"  (KHÔNG phải "customer")
   - categories: id (string slug tự sinh), name
================================================================ */

const API =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1"
    ? "http://localhost:3000/api"
    : "/api";

let db = {
  categories: [],
  products: [],
  orders: [],
  users: [],
  banners: [],
  flashSale: { config: null, items: [] },
  paymentMethods: [],
};
let currentBannerSection =
  localStorage.getItem("naph_admin_banner_section") || "home";
let currentUser = null;
let bookPage_ = 0,
  userPage_ = 0,
  orderTab_ = "";
let editingOrderId = null;
let notifyTimer;
let pendingCoverData = null; // base64 hoặc URL ảnh bìa mới
let pendingExtraImages = []; // mảng base64 ảnh phụ chưa upload
let bannerImageData = null; // base64 ảnh banner từ file upload
let dashboardSelectedMonth = new Date().getMonth();
let dashboardSelectedYear = new Date().getFullYear();

/* ================================================================
   AUTH — dùng /api/auth/login của server cũ
================================================================ */
function checkAuth() {
  const saved = localStorage.getItem("naph_admin_session");
  if (saved) {
    currentUser = JSON.parse(saved);
    document.getElementById("auth-wrapper").style.display = "none";
    document.getElementById("main-app").style.display = "flex";
    document.getElementById("header-user-name").textContent = currentUser.name;
    document.getElementById("header-user-avatar").textContent = initials(
      currentUser.name,
    );
    fetchAllData();
  } else {
    document.getElementById("auth-wrapper").style.display = "flex";
    document.getElementById("main-app").style.display = "none";
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById("login-email").value.trim();
  const pass = document.getElementById("login-pass").value.trim();
  try {
    const res = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: pass }),
    });
    if (!res.ok) {
      showNotify("Sai email hoặc mật khẩu!", true);
      return;
    }
    const user = await res.json();
    if (user.role !== "admin") {
      showNotify("Tài khoản không có quyền Admin!", true);
      return;
    }
    localStorage.setItem("naph_admin_session", JSON.stringify(user));
    showNotify("Đăng nhập thành công!");
    checkAuth();
  } catch {
    showNotify(
      "Lỗi kết nối! Kiểm tra backend đang chạy (node server.js).",
      true,
    );
  }
}

function toggleDropdown() {
  document.getElementById("user-dropdown").classList.toggle("show");
}

function logout() {
  localStorage.removeItem("naph_admin_session");
  currentUser = null;
  document.getElementById("user-dropdown").classList.remove("show");
  showNotify("Đã đăng xuất!");
  checkAuth();
}

document.addEventListener("click", function (e) {
  const c = document.querySelector(".user-menu-container");
  if (c && !c.contains(e.target))
    document.getElementById("user-dropdown").classList.remove("show");
});

/* ================================================================
   FETCH DATA
   Endpoint server cũ:
     GET /api/categories  → [{id, name}]
     GET /api/products    → [{id, title, author, category, price, rating, stock, description, cover}]
     GET /api/orders      → [{id, userId, items:[{title,quantity,price}], total, status, createdAt, shipping:{address,city,postal,phone}}]
     GET /api/users       → [{id, name, email, role}]  (password đã bị strip bởi sanitizeUser)
================================================================ */
async function fetchAllData() {
  try {
    const [
      catRes,
      prodRes,
      orderRes,
      userRes,
      bannerRes,
      flashSaleRes,
      paymentMethodRes,
    ] = await Promise.all([
      fetch(`${API}/categories`),
      fetch(`${API}/products`),
      fetch(`${API}/orders`),
      fetch(`${API}/users`),
      fetch(
        `${API}/banners${
          document.querySelector(".page.active")?.id === "page-banners"
            ? "?section=" + encodeURIComponent(currentBannerSection)
            : ""
        }`,
      ),
      fetch(`${API}/flash-sale`),
      fetch(`${API}/payment-methods`),
    ]);
    db.categories = await catRes.json();
    db.products = await prodRes.json();
    db.orders = await orderRes.json();
    db.users = await userRes.json();
    db.banners = await bannerRes.json();
    db.flashSale = await flashSaleRes.json();
    db.paymentMethods = await paymentMethodRes.json();

    updatePendingBadge();
    updateApproveBanner();

    const active = document.querySelector(".page.active")?.id;
    if (active === "page-dashboard") renderDashboard();
    if (active === "page-books") {
      renderBookCatFilter();
      renderBooks();
    }
    if (active === "page-categories") renderCats();
    if (active === "page-orders") renderOrders();
    if (active === "page-users") renderUsers();
    if (active === "page-payment-methods") renderPaymentMethods();
    if (active === "page-footer") renderFooterSettings();
    if (active === "page-banners") await setBannerSection(currentBannerSection);
    if (active === "page-flashsale") renderFlashSale();
  } catch {
    showNotify('Lỗi kết nối Backend! Hãy chạy "node server.js".', true);
  }
}

/* ================================================================
   HELPERS
================================================================ */
// category: server cũ lưu string id (e.g. "fiction")
function getCatName(catId) {
  const c = db.categories.find((c) => c.id === catId);
  return c ? c.name : "—";
}

// Giá: server cũ là số thực (price: 12.99)
function fmt(n) {
  return "$" + Number(n || 0).toFixed(2);
}

function initials(name) {
  return (name || "U")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(-2)
    .toUpperCase();
}

function getStockBadge(stock) {
  if (stock === 0)
    return '<span class="badge-status badge-red">Hết hàng</span>';
  if (stock <= 5)
    return '<span class="badge-status badge-orange">Sắp hết</span>';
  return '<span class="badge-status badge-green">Còn hàng</span>';
}

// Status tiếng Anh (server cũ) → label + badge class
const STATUS_LABEL = {
  Processing: "Chờ duyệt",
  Shipped: "Đang giao",
  Delivered: "Hoàn thành",
  Cancelled: "Đã hủy",
};
const STATUS_CLASS = {
  Processing: "badge-yellow",
  Shipped: "badge-blue",
  Delivered: "badge-green",
  Cancelled: "badge-red",
};

function getOrderBadge(s) {
  return `<span class="badge-status ${STATUS_CLASS[s] || "badge-gray"}">${STATUS_LABEL[s] || s}</span>`;
}

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("vi-VN");
  } catch {
    return iso;
  }
}

// Render ảnh bìa sách
function coverHtml(cover, title) {
  const v = String(cover || "").trim();
  if (!v) return "📚";
  if (
    v.startsWith("data:") ||
    v.startsWith("http") ||
    /\.(jpe?g|png|webp|gif|svg)/i.test(v)
  )
    return `<img src="${v}" alt="${title || ""}" style="width:100%;height:100%;object-fit:cover">`;
  return v; // emoji
}

/* ================================================================
   NAVIGATION
================================================================ */
function navigate(page, btn) {
  document
    .querySelectorAll(".page")
    .forEach((p) => p.classList.remove("active"));
  document
    .querySelectorAll(".nav-item")
    .forEach((n) => n.classList.remove("active"));
  document.getElementById("page-" + page).classList.add("active");
  if (btn) btn.classList.add("active");
  fetchAllData();
}

/* ================================================================
   APPROVE BANNER
================================================================ */
function updatePendingBadge() {
  const count = db.orders.filter((o) => o.status === "Processing").length;
  const badge = document.getElementById("pending-badge");
  if (badge) badge.textContent = count;
}

function updateApproveBanner() {
  const pending = db.orders.filter((o) => o.status === "Processing");
  const banner = document.getElementById("approve-banner");
  if (!banner) return;
  if (pending.length > 0) {
    document.getElementById("approve-banner-text").textContent =
      `Có ${pending.length} đơn hàng đang chờ duyệt!`;
    banner.style.display = "flex";
  } else {
    banner.style.display = "none";
  }
}

async function setBannerSection(section, btn) {
  currentBannerSection = section;
  localStorage.setItem("naph_admin_banner_section", section);
  document
    .getElementById("bannerHomeBtn")
    .classList.toggle("active", section === "home");
  document
    .getElementById("bannerLoginBtn")
    .classList.toggle("active", section === "login");
  document.getElementById("banner-page-subtitle").textContent =
    section === "login"
      ? "Thêm, sửa hoặc cập nhật hình ảnh Banner Login cho trang đăng nhập."
      : "Thêm, sửa hoặc cập nhật hình ảnh banner cho trang chủ.";

  try {
    const res = await fetch(
      `${API}/banners?section=${encodeURIComponent(section)}`,
    );
    if (!res.ok) throw new Error("Không thể tải banner.");
    db.banners = await res.json();
  } catch {
    db.banners = [];
  }
  renderBanners();
}

/* ================================================================
   DASHBOARD
================================================================ */
function renderDashboard() {
  const deliveredOrders = db.orders.filter((o) => o.status === "Delivered");
  const totalRev = deliveredOrders.reduce((s, o) => s + (o.total || 0), 0);
  const now = new Date();
  const monthlyRev = deliveredOrders
    .filter((o) => {
      const d = new Date(o.createdAt);
      return (
        !Number.isNaN(d) &&
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth()
      );
    })
    .reduce((s, o) => s + (o.total || 0), 0);
  const yearlyRev = deliveredOrders
    .filter((o) => {
      const d = new Date(o.createdAt);
      return !Number.isNaN(d) && d.getFullYear() === now.getFullYear();
    })
    .reduce((s, o) => s + (o.total || 0), 0);
  const pending = db.orders.filter((o) => o.status === "Processing").length;
  renderRevenueSelectors(deliveredOrders);
  const selectedRev = deliveredOrders
    .filter((o) => {
      const d = new Date(o.createdAt);
      return (
        !Number.isNaN(d) &&
        d.getFullYear() === dashboardSelectedYear &&
        d.getMonth() === dashboardSelectedMonth
      );
    })
    .reduce((s, o) => s + (o.total || 0), 0);

  document.getElementById("stats-grid").innerHTML = `
        <div class="stat-card">
            <div class="stat-icon" style="background:#f5f3ff;color:var(--brand)"><i class="ti ti-wallet"></i></div>
            <div class="stat-label">Doanh thu (đã giao)</div>
            <div class="stat-value">${fmt(totalRev)}</div>
            <div class="stat-footer stat-up">↑ Chỉ tính đơn Hoàn thành</div>
        </div>
        <div class="stat-card">
            <div class="stat-icon" style="background:#eef2ff;color:#4f46e5"><i class="ti ti-calendar"></i></div>
            <div class="stat-label">Doanh thu tháng này</div>
            <div class="stat-value">${fmt(monthlyRev)}</div>
            <div class="stat-footer stat-up">Chỉ tính đơn giao trong tháng</div>
        </div>
        <div class="stat-card">
            <div class="stat-icon" style="background:#ecfdf5;color:#047857"><i class="ti ti-calendar"></i></div>
            <div class="stat-label">Doanh thu năm nay</div>
            <div class="stat-value">${fmt(yearlyRev)}</div>
            <div class="stat-footer stat-up">Chỉ tính đơn giao trong năm</div>
        </div>
        <div class="stat-card">
            <div class="stat-icon" style="background:#fff7ed;color:#c2410c"><i class="ti ti-chart-bar"></i></div>
            <div class="stat-label">Doanh thu tháng ${dashboardSelectedMonth + 1}/${dashboardSelectedYear}</div>
            <div class="stat-value">${fmt(selectedRev)}</div>
            <div class="stat-footer stat-up">Theo thời gian hoàn thành đơn</div>
        </div>
        <div class="stat-card">
            <div class="stat-icon" style="background:#dbeafe;color:#2563eb"><i class="ti ti-shopping-cart"></i></div>
            <div class="stat-label">Đơn hàng</div>
            <div class="stat-value">${db.orders.length}</div>
            <div class="stat-footer stat-warn">${pending} chờ duyệt</div>
        </div>
        <div class="stat-card">
            <div class="stat-icon" style="background:#fef3c7;color:#d97706"><i class="ti ti-book"></i></div>
            <div class="stat-label">Sách trong kho</div>
            <div class="stat-value">${db.products.length}</div>
            <div class="stat-footer stat-warn">${db.products.filter((b) => b.stock === 0).length} hết hàng</div>
        </div>
        <div class="stat-card">
            <div class="stat-icon" style="background:#d1fae5;color:#059669"><i class="ti ti-users"></i></div>
            <div class="stat-label">Người dùng</div>
            <div class="stat-value">${db.users.length}</div>
            <div class="stat-footer stat-up">${db.users.filter((u) => u.role === "admin").length} admin</div>
        </div>`;

  document.getElementById("dash-orders").innerHTML =
    db.orders
      .slice(-5)
      .reverse()
      .map((o) => {
        const user = db.users.find((u) => u.id === o.userId);
        return `<tr>
                <td><strong>#${o.id}</strong></td>
                <td>${user ? user.name : o.userId || "—"}</td>
                <td style="color:var(--txt2)">${formatDate(o.createdAt)}</td>
                <td>${fmt(o.total)}</td>
                <td>${getOrderBadge(o.status)}</td>
            </tr>`;
      })
      .join("") ||
    '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--txt2)">Chưa có đơn hàng</td></tr>';
}

function renderRevenueSelectors(deliveredOrders) {
  const monthSelect = document.getElementById("revenueMonthSelect");
  const yearSelect = document.getElementById("revenueYearSelect");
  if (!monthSelect || !yearSelect) return;

  const years = [
    ...new Set(
      deliveredOrders
        .map((o) => {
          const d = new Date(o.createdAt);
          return Number.isNaN(d) ? null : d.getFullYear();
        })
        .filter(Boolean),
    ),
  ].sort((a, b) => b - a);
  if (!years.length) {
    years.push(new Date().getFullYear());
  }
  if (!years.includes(dashboardSelectedYear)) {
    dashboardSelectedYear = years[0];
  }
  const monthItems = Array.from({ length: 12 }, (_, i) => i);

  monthSelect.innerHTML = monthItems
    .map(
      (m) =>
        `<option value="${m}" ${m === dashboardSelectedMonth ? "selected" : ""}>${m + 1}</option>`,
    )
    .join("");
  yearSelect.innerHTML = years
    .map(
      (y) =>
        `<option value="${y}" ${y === dashboardSelectedYear ? "selected" : ""}>${y}</option>`,
    )
    .join("");

  const updateSelection = () => {
    dashboardSelectedMonth = Number(monthSelect.value);
    dashboardSelectedYear = Number(yearSelect.value);
    renderDashboard();
  };

  monthSelect.onchange = updateSelection;
  yearSelect.onchange = updateSelection;
}

/* ================================================================
   BOOKS — field server cũ: title, author, category, price, rating, stock, description, cover
================================================================ */
function renderBookCatFilter() {
  const s = document.getElementById("book-cat-filter");
  const cur = s.value;
  s.innerHTML =
    '<option value="">Tất cả danh mục</option>' +
    db.categories
      .map((c) => `<option value="${c.id}">${c.name}</option>`)
      .join("");
  s.value = cur;
  const sel = document.getElementById("book-cat");
  if (sel)
    sel.innerHTML = db.categories
      .map((c) => `<option value="${c.id}">${c.name}</option>`)
      .join("");
}

function renderBooks() {
  const q = (document.getElementById("book-search").value || "").toLowerCase();
  const cat = document.getElementById("book-cat-filter").value;
  const stock = document.getElementById("book-stock-filter").value;

  let list = db.products.filter((b) => {
    if (
      q &&
      !(b.title || "").toLowerCase().includes(q) &&
      !(b.author || "").toLowerCase().includes(q)
    )
      return false;
    if (cat && b.category !== cat) return false; // so sánh string id
    if (stock === "in" && b.stock <= 5) return false;
    if (stock === "low" && (b.stock === 0 || b.stock > 5)) return false;
    if (stock === "out" && b.stock !== 0) return false;
    return true;
  });

  const perPage = 8,
    total = list.length,
    pages = Math.ceil(total / perPage) || 1;
  if (bookPage_ >= pages) bookPage_ = pages - 1;
  const slice = list.slice(bookPage_ * perPage, (bookPage_ + 1) * perPage);

  document.getElementById("book-pager-info").textContent =
    `Hiển thị ${slice.length} / ${total} sách`;
  document.getElementById("books-tbody").innerHTML =
    slice
      .map(
        (b) => `
        <tr>
            <td>
                <div style="display:flex;align-items:center;gap:12px">
                    <div class="book-cover">${coverHtml(b.cover, b.title)}</div>
                    <div>
                        <div style="font-weight:600">${b.title || ""}</div>
                        <div style="font-size:12px;color:var(--txt2)">${b.author || ""}</div>
                    </div>
                </div>
            </td>
            <td style="color:var(--txt2)">${getCatName(b.category)}</td>
            <td><strong>${fmt(b.price)}</strong></td>
            <td style="text-align:center;color:${b.stock === 0 ? "var(--danger)" : b.stock <= 5 ? "var(--warn)" : "var(--txt)"}">
                <strong>${b.stock}</strong>
            </td>
            <td>${getStockBadge(b.stock)}</td>
            <td>
                <div class="action-btns">
                    <button class="action-btn" onclick="openBookModal('${b.id}')"><i class="ti ti-edit"></i></button>
                    <button class="action-btn danger" onclick="deleteBook('${b.id}')"><i class="ti ti-trash"></i></button>
                </div>
            </td>
        </tr>`,
      )
      .join("") ||
    '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--txt2)">Không tìm thấy sách nào</td></tr>';
}

function bookPage(d) {
  bookPage_ = Math.max(0, bookPage_ + d);
  renderBooks();
}

function openBookModal(id) {
  pendingCoverData = null;
  pendingExtraImages = [];
  document.getElementById("book-modal-title").textContent = id
    ? "Chỉnh sửa sách"
    : "Thêm sách mới";
  renderBookCatFilter();
  [
    "book-id",
    "book-name",
    "book-author",
    "book-price",
    "book-stock",
    "book-desc",
    "book-cover-url",
  ].forEach((i) => {
    const el = document.getElementById(i);
    if (el) el.value = "";
  });
  resetCoverPreview();
  document.getElementById("extra-preview-list").innerHTML = "";
  document.getElementById("extra-imgs-section").style.display = "none";

  if (id) {
    const b = db.products.find((b) => b.id === id);
    if (!b) return;
    // Map đúng field server cũ
    document.getElementById("book-id").value = b.id;
    document.getElementById("book-name").value = b.title || "";
    document.getElementById("book-author").value = b.author || "";
    document.getElementById("book-cat").value = b.category || "";
    document.getElementById("book-price").value = b.price || 0;
    document.getElementById("book-stock").value = b.stock || 0;
    document.getElementById("book-desc").value = b.description || "";
    if (b.cover) showCoverPreview(b.cover);
    document.getElementById("extra-imgs-section").style.display = "block";
    loadExistingImages(b.id);
  }
  openModal("book-modal");
}

async function loadExistingImages(productId) {
  try {
    const res = await fetch(`${API}/products/${productId}/images`);
    const imgs = await res.json();
    const list = document.getElementById("existing-imgs-list");
    list.innerHTML = imgs.length
      ? imgs
          .map(
            (img) => `
                <div class="extra-thumb">
                    <img src="${img.imageData}" alt="ảnh sách">
                    <button class="del-btn" onclick="deleteExistingImage('${productId}','${img.id}',this.parentElement)">
                        <i class="ti ti-x" style="font-size:10px"></i>
                    </button>
                </div>`,
          )
          .join("")
      : '<span style="font-size:12px;color:var(--txt2)">Chưa có ảnh phụ</span>';
  } catch {
    /* ignore */
  }
}

async function deleteExistingImage(productId, imageId, el) {
  await fetch(`${API}/products/${productId}/images/${imageId}`, {
    method: "DELETE",
  });
  el.remove();
  showNotify("Đã xóa ảnh!");
}

function previewCover(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    pendingCoverData = e.target.result;
    showCoverPreview(pendingCoverData);
  };
  reader.readAsDataURL(file);
}

function showCoverPreview(src) {
  const wrap = document.getElementById("cover-preview-wrap");
  const isEmoji =
    src.length <= 4 && !src.startsWith("http") && !src.startsWith("data:");
  wrap.innerHTML = isEmoji
    ? `<span style="font-size:64px">${src}</span><p style="font-size:11px;color:var(--txt2);margin-top:6px">Nhấp để thay đổi</p>`
    : `<img src="${src}" alt="Bìa sách"><p style="font-size:11px;color:var(--txt2);margin-top:6px">Nhấp để thay đổi</p>`;
}

function resetCoverPreview() {
  document.getElementById("cover-preview-wrap").innerHTML = `
        <i class="ti ti-cloud-upload" style="font-size:28px;color:var(--txt2)"></i>
        <p style="color:var(--txt2);font-size:13px;margin-top:8px">Nhấp để chọn ảnh bìa</p>
        <p style="color:var(--txt2);font-size:11px">JPG, PNG, WEBP — tối đa 2MB</p>`;
  document.getElementById("cover-file").value = "";
}

function applyCoverUrl() {
  const url = document.getElementById("book-cover-url").value.trim();
  if (!url) return;
  pendingCoverData = url;
  showCoverPreview(url);
}

function previewExtraImages(input) {
  Array.from(input.files).forEach((file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = e.target.result;
      pendingExtraImages.push(data);
      const div = document.createElement("div");
      div.className = "extra-thumb";
      div.innerHTML = `<img src="${data}" alt="ảnh phụ">
                <button class="del-btn" type="button"><i class="ti ti-x" style="font-size:10px"></i></button>`;
      div.querySelector(".del-btn").onclick = () => {
        const idx = pendingExtraImages.indexOf(data);
        if (idx > -1) pendingExtraImages.splice(idx, 1);
        div.remove();
      };
      document.getElementById("extra-preview-list").appendChild(div);
    };
    reader.readAsDataURL(file);
  });
  input.value = "";
}

async function saveBook() {
  const name = document.getElementById("book-name").value.trim();
  const author = document.getElementById("book-author").value.trim();
  if (!name || !author) {
    showNotify("Vui lòng điền tên sách và tác giả!", true);
    return;
  }

  const id = document.getElementById("book-id").value;
  let cover =
    pendingCoverData ||
    document.getElementById("book-cover-url").value.trim() ||
    "";
  if (!cover && id) {
    const old = db.products.find((b) => b.id === id);
    cover = old ? old.cover || "" : "";
  }

  // Gửi đúng field mà server.js cũ nhận: title, author, category, price, rating, stock, description, cover
  const body = {
    title: name,
    author: author,
    category: document.getElementById("book-cat").value || "",
    price: parseFloat(document.getElementById("book-price").value) || 0,
    stock: parseInt(document.getElementById("book-stock").value) || 0,
    description: document.getElementById("book-desc").value.trim(),
    cover: cover,
  };

  const method = id ? "PUT" : "POST";
  const url = id ? `${API}/products/${id}` : `${API}/products`;
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const saved = await res.json();
  const productId = id || saved.id;

  for (const imgData of pendingExtraImages) {
    await fetch(`${API}/products/${productId}/images`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageData: imgData, sortOrder: 0 }),
    }).catch(() => {});
  }

  showNotify(id ? "Đã cập nhật sách!" : "Đã thêm sách mới!");
  closeModal("book-modal");
  fetchAllData();
}

async function deleteBook(id) {
  if (!confirm("Xóa sách này?")) return;
  await fetch(`${API}/products/${id}`, { method: "DELETE" });
  showNotify("Đã xóa sách!");
  fetchAllData();
}

/* ================================================================
   CATEGORIES — server cũ: POST {name} → tự sinh id từ name
================================================================ */
function renderCats() {
  document.getElementById("cat-total").textContent = db.categories.length;
  document.getElementById("cat-progress").style.width = db.categories.length
    ? "100%"
    : "0%";
  document.getElementById("cats-tbody").innerHTML =
    db.categories
      .map((c) => {
        const cnt = db.products.filter((b) => b.category === c.id).length;
        return `<tr>
            <td>
                <strong>${c.name}</strong>
                <div style="font-size:11px;color:var(--txt2);font-family:monospace">${c.id}</div>
            </td>
            <td style="text-align:center"><strong>${cnt}</strong></td>
            <td>
                <div class="action-btns">
                    <button class="action-btn" onclick="openCatModal('${c.id}')"><i class="ti ti-edit"></i></button>
                    <button class="action-btn danger" onclick="deleteCat('${c.id}')"><i class="ti ti-trash"></i></button>
                </div>
            </td>
        </tr>`;
      })
      .join("") ||
    '<tr><td colspan="3" style="text-align:center;padding:32px;color:var(--txt2)">Chưa có danh mục</td></tr>';
}

function openCatModal(id) {
  document.getElementById("cat-modal-title").textContent = id
    ? "Chỉnh sửa danh mục"
    : "Thêm danh mục mới";
  document.getElementById("cat-id").value = id || "";
  if (id) {
    const c = db.categories.find((c) => c.id === id);
    document.getElementById("cat-name").value = c ? c.name : "";
  } else {
    document.getElementById("cat-name").value = "";
  }
  openModal("cat-modal");
}

async function saveCat() {
  const name = document.getElementById("cat-name").value.trim();
  if (!name) {
    showNotify("Vui lòng nhập tên danh mục!", true);
    return;
  }
  const id = document.getElementById("cat-id").value;
  const method = id ? "PUT" : "POST";
  const url = id ? `${API}/categories/${id}` : `${API}/categories`;
  await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  showNotify("Đã lưu danh mục!");
  closeModal("cat-modal");
  fetchAllData();
}

async function deleteCat(id) {
  if (!confirm("Xóa danh mục này?")) return;
  await fetch(`${API}/categories/${id}`, { method: "DELETE" });
  showNotify("Đã xóa danh mục!");
  fetchAllData();
}

function renderBanners() {
  const filtered = db.banners.filter(
    (b) => (b.section || "home") === currentBannerSection,
  );
  document.getElementById("banners-tbody").innerHTML =
    filtered
      .map(
        (b) => `
        <tr>
          <td style="width:160px;">
            <div style="display:flex;align-items:center;gap:10px">
              <img src="${b.image || ""}" alt="Banner" style="width:100px;height:60px;object-fit:cover;border-radius:10px;border:1px solid var(--border);" />
            </div>
          </td>
          <td>${b.title || "—"}</td>
          <td>${b.subtitle || "—"}</td>
          <td>${b.section === "login" ? "Banner Login" : "Banner Trang chủ"}</td>
          <td>${b.sortOrder || 0}</td>
          <td>
            <div class="action-btns" style="justify-content:flex-end;">
              <button class="action-btn" onclick="openBannerModal('${b.id}')"><i class="ti ti-edit"></i></button>
              <button class="action-btn danger" onclick="deleteBanner('${b.id}')"><i class="ti ti-trash"></i></button>
            </div>
          </td>
        </tr>
      `,
      )
      .join("") ||
    '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--txt2)">Chưa có banner</td></tr>';
}

function renderFlashSale() {
  const config = db.flashSale.config || {};
  const items = db.flashSale.items || [];
  document.getElementById("flashsale-title").value =
    config.title || "Flash Sale NAPH";
  document.getElementById("flashsale-subtitle").value =
    config.subtitle || "Giảm giá cực sốc trong thời gian giới hạn";
  if (config.endAt) {
    const local = new Date(config.endAt).toISOString().slice(0, 16);
    document.getElementById("flashsale-endat").value = local;
  }
  document.getElementById("flashsale-background").value =
    config.background || "#da6cf0";

  const rows = items
    .map((item) => {
      const product = db.products.find((p) => p.id === item.productId) || {};
      const price = Number(product.price) || 0;
      const discountPercent = Number(item.discountPercent) || 0;
      const discountAmount = Number(item.discountAmount) || 0;
      const computedDiscount =
        discountAmount > 0
          ? discountAmount
          : Math.round(price * discountPercent * 100) / 100;
      const salePrice = Math.max(0, price - computedDiscount);
      return `
        <tr>
          <td>${product.title || "Sản phẩm đã xóa"}</td>
          <td>$${price.toFixed(2)}</td>
          <td>${discountPercent}%</td>
          <td>$${computedDiscount.toFixed(2)}</td>
          <td>$${salePrice.toFixed(2)}</td>
          <td>
            <div class="action-btns" style="justify-content:flex-end;">
              <button class="action-btn" onclick="openFlashSaleItemModal('${item.id}')"><i class="ti ti-edit"></i></button>
              <button class="action-btn danger" onclick="deleteFlashSaleItem('${item.id}')"><i class="ti ti-trash"></i></button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  document.getElementById("flashsale-items-tbody").innerHTML =
    rows ||
    '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--txt2)">Chưa có sản phẩm Flash Sale</td></tr>';
}

function saveFlashSaleConfig() {
  const title = document.getElementById("flashsale-title").value.trim();
  const subtitle = document.getElementById("flashsale-subtitle").value.trim();
  const endAt = document.getElementById("flashsale-endat").value;
  const background =
    document.getElementById("flashsale-background").value || "#da6cf0";
  fetch(`${API}/flash-sale`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, subtitle, endAt, background }),
  })
    .then(() => {
      showNotify("Đã lưu cài đặt Flash Sale!");
      fetchAllData();
    })
    .catch(() => showNotify("Lưu thất bại, hãy thử lại!", true));
}

function openFlashSaleItemModal(id) {
  const item = db.flashSale.items.find((i) => i.id === id) || {};
  document.getElementById("flashsale-item-id").value = item.id || "";
  const productSelect = document.getElementById("flashsale-product");
  productSelect.innerHTML = db.products
    .map(
      (product) =>
        `<option value="${product.id}" ${product.id === item.productId ? "selected" : ""}>${product.title}</option>`,
    )
    .join("");
  document.getElementById("flashsale-discount-percent").value =
    item.discountPercent || 0;
  document.getElementById("flashsale-discount-amount").value =
    item.discountAmount || 0;
  document.getElementById("flashsale-sort").value = item.sortOrder || 0;
  document.getElementById("flashsale-item-modal-title").textContent =
    id && item.id
      ? "Chỉnh sửa sản phẩm Flash Sale"
      : "Thêm sản phẩm Flash Sale";
  openModal("flashsale-item-modal");
}

function saveFlashSaleItem() {
  const id = document.getElementById("flashsale-item-id").value;
  const productId = document.getElementById("flashsale-product").value;
  const discountPercent = Number(
    document.getElementById("flashsale-discount-percent").value,
  );
  const discountAmount = Number(
    document.getElementById("flashsale-discount-amount").value,
  );
  const sortOrder = Number(
    document.getElementById("flashsale-sort").value || 0,
  );

  const body = { productId, discountPercent, discountAmount, sortOrder };
  const method = id ? "PUT" : "POST";
  const url = id ? `${API}/flash-sale/items/${id}` : `${API}/flash-sale/items`;

  fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
    .then(() => {
      showNotify(
        id ? "Cập nhật sản phẩm Flash Sale!" : "Đã thêm sản phẩm Flash Sale!",
      );
      closeModal("flashsale-item-modal");
      fetchAllData();
    })
    .catch(() => showNotify("Lưu thất bại, hãy thử lại!", true));
}

function deleteFlashSaleItem(id) {
  if (!confirm("Xóa sản phẩm này khỏi Flash Sale?")) return;
  fetch(`${API}/flash-sale/items/${id}`, { method: "DELETE" })
    .then(() => {
      showNotify("Đã xóa sản phẩm Flash Sale.");
      fetchAllData();
    })
    .catch(() => showNotify("Xóa thất bại, hãy thử lại!", true));
}

function openBannerModal(id) {
  document.getElementById("banner-id").value = id || "";
  document.getElementById("banner-modal-title").textContent = id
    ? "Chỉnh sửa banner"
    : "Thêm banner";
  const banner = db.banners.find((b) => b.id === id) || {};
  document.getElementById("banner-title").value = banner.title || "";
  document.getElementById("banner-subtitle").value = banner.subtitle || "";
  document.getElementById("banner-section").value =
    banner.section || currentBannerSection || "home";
  document.getElementById("banner-image").value = "";
  document.getElementById("banner-sort").value = banner.sortOrder || 0;
  bannerImageData = null;

  // Hiển thị preview ảnh cũ nếu có
  const previewDiv = document.getElementById("banner-image-preview");
  if (banner.image && id) {
    previewDiv.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;">
        <img src="${banner.image}" alt="Current Banner" style="width:120px;height:70px;object-fit:cover;border-radius:8px;border:1px solid var(--border);" />
        <div style="font-size:12px;color:var(--txt2);">Ảnh hiện tại. Chọn ảnh mới để thay thế.</div>
      </div>
    `;
  } else {
    previewDiv.innerHTML = "";
  }

  openModal("banner-modal");
}

function previewBannerImage() {
  const file = document.getElementById("banner-image").files[0];
  const previewDiv = document.getElementById("banner-image-preview");

  if (!file) {
    bannerImageData = null;
    previewDiv.innerHTML = "";
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    bannerImageData = e.target.result;
    previewDiv.innerHTML = `
      <img src="${bannerImageData}" alt="Preview" style="width:120px;height:70px;object-fit:cover;border-radius:8px;border:1px solid var(--border);" />
    `;
  };
  reader.readAsDataURL(file);
}

async function saveBanner() {
  const id = document.getElementById("banner-id").value;

  // Nếu chỉnh sửa nhưng không chọn ảnh mới, lấy ảnh cũ
  let imageData = bannerImageData;
  if (!imageData && id) {
    const banner = db.banners.find((b) => b.id === id);
    imageData = banner ? banner.image : null;
  }

  if (!imageData) {
    showNotify("Vui lòng chọn ảnh banner.", true);
    return;
  }

  const data = {
    title: document.getElementById("banner-title").value.trim(),
    subtitle: document.getElementById("banner-subtitle").value.trim(),
    section: document.getElementById("banner-section").value || "home",
    image: imageData,
    sortOrder: parseInt(document.getElementById("banner-sort").value, 10) || 0,
  };

  const method = id ? "PUT" : "POST";
  const url = id ? `${API}/banners/${id}` : `${API}/banners`;
  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      throw new Error(payload?.error || "Lưu banner thất bại.");
    }
    showNotify(id ? "Đã cập nhật banner!" : "Đã tạo banner mới!");
    closeModal("banner-modal");
    await setBannerSection(currentBannerSection);
  } catch (err) {
    showNotify(err.message || "Lưu banner thất bại.", true);
  }
}

async function deleteBanner(id) {
  if (!confirm("Xóa banner này?")) return;
  await fetch(`${API}/banners/${id}`, { method: "DELETE" });
  showNotify("Đã xóa banner!");
  fetchAllData();
}

/* ================================================================
   ORDERS + DUYỆT ĐƠN
   Status tiếng Anh: "Processing" | "Shipped" | "Delivered" | "Cancelled"
   userId → tra users để lấy tên
   items → [{title, quantity, price}]
   shipping → {address, city, postal, phone}
================================================================ */
function setOrderTab(btn, filter) {
  document
    .querySelectorAll(".tab")
    .forEach((t) => t.classList.remove("active"));
  if (btn) btn.classList.add("active");
  orderTab_ = filter;
  renderOrders();
}

function renderOrders() {
  const q = (document.getElementById("order-search").value || "").toLowerCase();
  const counts = {
    all: db.orders.length,
    Processing: 0,
    Shipped: 0,
    Delivered: 0,
    Cancelled: 0,
  };
  db.orders.forEach((o) => {
    if (counts[o.status] !== undefined) counts[o.status]++;
  });
  document.getElementById("count-all").textContent = counts.all;
  document.getElementById("count-processing").textContent = counts.Processing;
  document.getElementById("count-shipped").textContent = counts.Shipped;
  document.getElementById("count-delivered").textContent = counts.Delivered;
  document.getElementById("count-cancelled").textContent = counts.Cancelled;

  let list = db.orders.filter((o) => {
    if (orderTab_ && o.status !== orderTab_) return false;
    const user = db.users.find((u) => u.id === o.userId);
    const name = (user ? user.name : o.userId || "").toLowerCase();
    if (q && !o.id.toLowerCase().includes(q) && !name.includes(q)) return false;
    return true;
  });

  document.getElementById("order-pager-info").textContent =
    `${list.length} đơn hàng`;
  document.getElementById("orders-tbody").innerHTML =
    list
      .map((o) => {
        const user = db.users.find((u) => u.id === o.userId);
        const customerName = user ? user.name : o.userId || "—";
        return `<tr>
            <td><strong style="color:var(--brand)">#${o.id}</strong></td>
            <td><div style="font-weight:600">${customerName}</div></td>
            <td style="color:var(--txt2)">${formatDate(o.createdAt)}</td>
            <td><strong>${fmt(o.total)}</strong></td>
            <td>${getOrderBadge(o.status)}</td>
            <td>
                <div class="action-btns">
                    ${
                      o.status === "Processing"
                        ? `
                    <button class="btn btn-success btn-sm" onclick="quickApprove('${o.id}')">
                        <i class="ti ti-check"></i> Duyệt
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="quickReject('${o.id}')">
                        <i class="ti ti-x"></i> Hủy
                    </button>`
                        : ""
                    }
                    <button class="btn btn-ghost btn-sm" onclick="openOrderDetail('${o.id}')">📋 Chi tiết</button>
                </div>
            </td>
        </tr>`;
      })
      .join("") ||
    '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--txt2)">Không có đơn hàng nào</td></tr>';
}

// Gửi lại nguyên order, chỉ đổi status — tránh mất data
async function updateOrderStatusAPI(orderId, newStatus) {
  const o = db.orders.find((o) => o.id === orderId);
  if (!o) return;
  await fetch(`${API}/orders/${orderId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: o.userId,
      items: o.items,
      total: o.total,
      status: newStatus,
      createdAt: o.createdAt,
      shipping: o.shipping,
    }),
  });
}

async function quickApprove(orderId) {
  await updateOrderStatusAPI(orderId, "Shipped");
  showNotify("Đã duyệt → Đang giao hàng!");
  fetchAllData();
}

async function quickReject(orderId) {
  if (!confirm("Hủy đơn hàng này?")) return;
  await updateOrderStatusAPI(orderId, "Cancelled");
  showNotify("Đã hủy đơn hàng!");
  fetchAllData();
}

function openOrderDetail(id) {
  const o = db.orders.find((o) => o.id === id);
  if (!o) return;
  editingOrderId = id;
  const user = db.users.find((u) => u.id === o.userId);
  const customerName = user ? user.name : o.userId || "—";
  const sh = o.shipping || {};
  const items = o.items || [];

  document.getElementById("od-title").textContent = "Chi tiết #" + o.id;
  document.getElementById("od-date").textContent =
    "Đặt lúc: " + formatDate(o.createdAt);

  document.getElementById("od-content").innerHTML = `
        <div style="background:var(--brand-light);border:.5px solid var(--brand-mid);border-radius:var(--radiuslg);padding:16px;margin-bottom:16px">
            <div style="font-size:11px;font-weight:700;color:var(--brand);text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px">Thông tin giao hàng</div>
            <div class="order-info-grid">
                <div class="order-info-item"><div class="order-info-label">Khách hàng</div><div class="order-info-value">${customerName}</div></div>
                <div class="order-info-item"><div class="order-info-label">Tổng tiền</div><div class="order-info-value" style="color:var(--brand)">${fmt(o.total)}</div></div>
                <div class="order-info-item" style="grid-column:1/-1">
                    <div class="order-info-label">Địa chỉ</div>
                    <div class="order-info-value">${[sh.address, sh.city, sh.postal].filter(Boolean).join(", ") || "—"}</div>
                </div>
                ${sh.phone ? `<div class="order-info-item"><div class="order-info-label">Điện thoại</div><div class="order-info-value">${sh.phone}</div></div>` : ""}
            </div>
        </div>

        <div style="font-weight:700;font-size:13px;margin-bottom:10px">Sản phẩm (${items.length})</div>
        <div style="border:.5px solid var(--border);border-radius:var(--radiuslg);overflow:hidden;margin-bottom:16px">
            ${
              items
                .map(
                  (it) => `
                <div style="padding:10px 16px;border-bottom:.5px solid var(--border);font-size:13px;display:flex;justify-content:space-between;align-items:center">
                    <span>${it.title} <span style="color:var(--txt2)">x${it.quantity}</span></span>
                    <span style="font-weight:600">${fmt((it.price || 0) * (it.quantity || 1))}</span>
                </div>`,
                )
                .join("") ||
              '<div style="padding:16px;text-align:center;color:var(--txt2);font-size:13px">Không có sản phẩm</div>'
            }
        </div>

        <div style="margin-bottom:14px">
            <div style="font-size:12px;font-weight:600;color:var(--txt2);margin-bottom:6px">Trạng thái hiện tại</div>
            ${getOrderBadge(o.status)}
        </div>

        ${
          o.status === "Processing"
            ? `
        <div style="background:#fef9c3;border:.5px solid #fcd34d;border-radius:var(--radiuslg);padding:14px;margin-bottom:14px">
            <div style="font-size:12px;font-weight:700;color:#92400e;margin-bottom:10px">⚡ Đơn chờ duyệt — chọn hành động:</div>
            <div class="approve-actions">
                <button class="btn btn-success" onclick="approveFromPanel('${o.id}')"><i class="ti ti-check"></i> ✅ Xác nhận & Giao</button>
                <button class="btn btn-danger"  onclick="rejectFromPanel('${o.id}')"><i class="ti ti-x"></i> ❌ Hủy đơn</button>
            </div>
        </div>`
            : ""
        }

        ${
          o.status === "Cancelled"
            ? `
        <div style="background:#fef2f2;border:.5px solid #fecaca;border-radius:var(--radiuslg);padding:14px;margin-bottom:14px;color:#991b1b">
            Đơn hàng đã bị hủy, không thể thay đổi trạng thái thủ công.
        </div>`
            : `
        <div style="border-top:.5px solid var(--border);padding-top:14px">
            <div style="font-size:12px;font-weight:600;color:var(--txt2);margin-bottom:8px">Cập nhật trạng thái thủ công</div>
            <div style="display:flex;gap:10px">
                <select id="order-status-select" style="flex:1;padding:8px 12px;border:.5px solid var(--border2);border-radius:var(--radius);font-family:inherit;font-size:13px;background:var(--surface);outline:none">
                    <option value="Processing" ${o.status === "Processing" ? "selected" : ""}>Chờ duyệt</option>
                    <option value="Shipped"    ${o.status === "Shipped" ? "selected" : ""}>Đang giao</option>
                    <option value="Delivered"  ${o.status === "Delivered" ? "selected" : ""}>Hoàn thành</option>
                    <option value="Cancelled"  ${o.status === "Cancelled" ? "selected" : ""}>Đã hủy</option>
                </select>
                <button class="btn btn-primary btn-sm" onclick="updateOrderStatus()">💾 Lưu</button>
            </div>
        </div>`
        }`;

  document.getElementById("order-detail").classList.add("open");
}

async function approveFromPanel(orderId) {
  await updateOrderStatusAPI(orderId, "Shipped");
  showNotify("Đã duyệt → Đang giao hàng!");
  closeOrderDetail();
  fetchAllData();
}
async function rejectFromPanel(orderId) {
  if (!confirm("Hủy đơn hàng này?")) return;
  await updateOrderStatusAPI(orderId, "Cancelled");
  showNotify("Đã hủy đơn hàng!");
  closeOrderDetail();
  fetchAllData();
}
async function updateOrderStatus() {
  const order = db.orders.find((o) => o.id === editingOrderId);
  if (!order) return;
  if (order.status === "Cancelled") {
    showNotify("Không thể thay đổi trạng thái của đơn đã hủy.", true);
    return;
  }
  await updateOrderStatusAPI(
    editingOrderId,
    document.getElementById("order-status-select").value,
  );
  closeOrderDetail();
  showNotify("Đã cập nhật trạng thái!");
  fetchAllData();
}
function closeOrderDetail() {
  document.getElementById("order-detail").classList.remove("open");
}

/* ================================================================
   USERS — server cũ role: "admin" | "user"  (KHÔNG phải "customer")
================================================================ */
function renderUsers() {
  const q = (document.getElementById("user-search").value || "").toLowerCase();
  const role = document.getElementById("user-role-filter").value;

  let list = db.users.filter((u) => {
    if (
      q &&
      !(u.name || "").toLowerCase().includes(q) &&
      !(u.email || "").toLowerCase().includes(q)
    )
      return false;
    if (role && u.role !== role) return false; // role: "admin" | "user"
    return true;
  });

  const perPage = 8,
    total = list.length,
    pages = Math.ceil(total / perPage) || 1;
  if (userPage_ >= pages) userPage_ = pages - 1;
  const slice = list.slice(userPage_ * perPage, (userPage_ + 1) * perPage);

  document.getElementById("user-pager-info").textContent =
    `Hiển thị ${slice.length} / ${total} người dùng`;
  const blockedCount = db.users.filter((u) => u.blocked).length;
  document.getElementById("user-stats").innerHTML = `
        <div class="stat-card"><div style="font-size:12px;color:var(--txt2)">Tổng</div><div class="stat-value">${db.users.length}</div></div>
        <div class="stat-card"><div style="font-size:12px;color:var(--txt2)">Admin</div><div class="stat-value" style="color:var(--brand)">${db.users.filter((u) => u.role === "admin").length}</div></div>
        <div class="stat-card"><div style="font-size:12px;color:var(--txt2)">Khách hàng</div><div class="stat-value" style="color:var(--success)">${db.users.filter((u) => u.role === "user").length}</div></div>
        <div class="stat-card"><div style="font-size:12px;color:var(--txt2)">Bị khóa</div><div class="stat-value" style="color:#ef4444">${blockedCount}</div></div>`;
  document.getElementById("users-tbody").innerHTML =
    slice
      .map(
        (u) => `
        <tr>
            <td>
                <div style="display:flex;align-items:center;gap:10px">
                    <div class="user-avatar">${initials(u.name)}</div>
                    <div style="font-weight:600">${u.name}</div>
                </div>
            </td>
            <td>${u.role === "admin" ? '<span class="badge-status badge-blue">Admin</span>' : '<span class="badge-status badge-gray">Khách hàng</span>'}</td>
            <td style="color:var(--txt2);font-size:12px">${u.email}</td>
            <td>${u.blocked ? '<span class="badge-status badge-red">Bị khóa</span>' : '<span class="badge-status badge-green">Hoạt động</span>'}</td>
            <td>
                <div class="action-btns">
                    <button class="action-btn" onclick="openUserModal('${u.id}')"><i class="ti ti-user-edit"></i></button>
                    ${u.role !== "admin" ? `<button class="action-btn ${u.blocked ? "success" : "danger"}" title="${u.blocked ? "Mở khóa người dùng" : "Khóa người dùng"}" aria-label="${u.blocked ? "Mở khóa người dùng" : "Khóa người dùng"}" onclick="toggleUserBlock('${u.id}', ${u.blocked ? "false" : "true"})"><i class="ti ${u.blocked ? "ti-lock-open" : "ti-lock"}"></i></button>` : ""}
                </div>
            </td>
        </tr>`,
      )
      .join("") ||
    '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--txt2)">Không có dữ liệu</td></tr>';
}

function userPage(d) {
  userPage_ = Math.max(0, userPage_ + d);
  renderUsers();
}

function openUserModal(id) {
  document.getElementById("user-modal-title").textContent = id
    ? "Chỉnh sửa người dùng"
    : "Thêm người dùng mới";
  ["user-id", "user-name", "user-email"].forEach((i) => {
    const el = document.getElementById(i);
    if (el) el.value = "";
  });
  document.getElementById("user-role").value = "user"; // server cũ: "user"
  if (id) {
    const u = db.users.find((u) => u.id === id);
    if (!u) return;
    document.getElementById("user-id").value = u.id;
    document.getElementById("user-name").value = u.name;
    document.getElementById("user-email").value = u.email;
    document.getElementById("user-role").value = u.role || "user";
  }
  openModal("user-modal");
}

async function saveUser() {
  const name = document.getElementById("user-name").value.trim();
  const email = document.getElementById("user-email").value.trim();
  if (!name || !email) {
    showNotify("Vui lòng điền đầy đủ!", true);
    return;
  }
  const id = document.getElementById("user-id").value;
  const passInput = document.getElementById("user-password");
  const pass = passInput ? passInput.value.trim() : "";
  // server cũ nhận: name, email, password, role ("admin"|"user")
  const data = {
    name,
    email,
    role: document.getElementById("user-role").value,
  };
  if (pass) data.password = pass;
  if (!id && !pass) data.password = "123456";
  const method = id ? "PUT" : "POST";
  const url = id ? `${API}/users/${id}` : `${API}/users`;
  await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  showNotify(id ? "Đã cập nhật!" : "Đã tạo tài khoản!");
  closeModal("user-modal");
  fetchAllData();
}

function renderPaymentMethods() {
  const tbody = document.getElementById("payment-methods-tbody");
  if (!tbody) return;
  tbody.innerHTML = db.paymentMethods
    .map(
      (method) => `
    <tr>
      <td><strong>${method.name || "—"}</strong></td>
      <td>${method.description ? method.description.substring(0, 40) + "..." : "—"}</td>
      <td>${method.image ? `<img src="${method.image}" style="max-width: 50px; max-height: 50px; border-radius: 6px;" />` : "—"}</td>
      <td>${method.active ? '<span class="badge-status badge-green">Kích hoạt</span>' : '<span class="badge-status badge-gray">Vô hiệu</span>'}</td>
      <td>
        <button class="btn btn-ghost btn-sm" onclick="editPaymentMethod('${method.id}')">
          <i class="ti ti-pencil"></i>
        </button>
        <button class="btn btn-ghost btn-sm" onclick="deletePaymentMethod('${method.id}')">
          <i class="ti ti-trash"></i>
        </button>
      </td>
    </tr>
  `,
    )
    .join("");
}

function openPaymentMethodModal() {
  document.getElementById("payment-method-id").value = "";
  document.getElementById("payment-method-name").value = "";
  document.getElementById("payment-method-description").value = "";
  document.getElementById("payment-method-image").value = "";
  document.getElementById("payment-method-file").value = "";
  const prev = document.getElementById("payment-method-preview");
  if (prev) {
    prev.src = "";
    prev.style.display = "none";
  }
  document.getElementById("payment-method-sort").value =
    db.paymentMethods.length + 1;
  document.getElementById("payment-method-active").checked = true;
  document.getElementById("payment-method-modal-title").textContent =
    "Thêm phương thức thanh toán";
  openModal("payment-method-modal");
}

function editPaymentMethod(id) {
  const method = db.paymentMethods.find((m) => m.id === id);
  if (!method) return;
  document.getElementById("payment-method-id").value = method.id;
  document.getElementById("payment-method-name").value = method.name || "";
  document.getElementById("payment-method-description").value =
    method.description || "";
  document.getElementById("payment-method-image").value = method.image || "";
  const prev = document.getElementById("payment-method-preview");
  if (prev && method.image) {
    prev.src = method.image;
    prev.style.display = "block";
  } else if (prev) {
    prev.src = "";
    prev.style.display = "none";
  }
  document.getElementById("payment-method-sort").value = method.sortOrder || 0;
  document.getElementById("payment-method-active").checked =
    method.active !== false;
  document.getElementById("payment-method-modal-title").textContent =
    "Sửa phương thức thanh toán";
  openModal("payment-method-modal");
}

async function savePaymentMethod() {
  const id =
    document.getElementById("payment-method-id").value.trim() ||
    `pm-${Date.now()}`;
  const name = document.getElementById("payment-method-name").value.trim();
  const description = document
    .getElementById("payment-method-description")
    .value.trim();
  let image = document.getElementById("payment-method-image").value.trim();
  const sortOrder =
    parseInt(document.getElementById("payment-method-sort").value) || 0;
  const active = document.getElementById("payment-method-active").checked;

  // If file selected, upload it first
  const fileInput = document.getElementById("payment-method-file");
  if (fileInput && fileInput.files && fileInput.files[0]) {
    try {
      const fd = new FormData();
      fd.append("file", fileInput.files[0]);
      const upl = await fetch(`${API}/upload`, { method: "POST", body: fd });
      if (!upl.ok) throw new Error("Upload failed");
      const j = await upl.json();
      image = j.url || image;
      // set hidden image input for preview persistence
      document.getElementById("payment-method-image").value = image;
    } catch (err) {
      showNotify("Không thể tải ảnh lên.", true);
      return;
    }
  }

  if (!name) {
    showNotify("Vui lòng nhập tên phương thức.", true);
    return;
  }

  const method = db.paymentMethods.find((m) => m.id === id);
  const url = method
    ? `${API}/payment-methods/${id}`
    : `${API}/payment-methods`;
  const httpMethod = method ? "PUT" : "POST";

  try {
    const payload = { id, name, description, image, sortOrder, active };
    const res = await fetch(url, {
      method: httpMethod,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Lỗi khi lưu phương thức.");
    showNotify("Lưu phương thức thành công!");
    closeModal("payment-method-modal");
    fetchAllData();
  } catch (err) {
    showNotify(err.message || "Lỗi lưu phương thức.", true);
  }
}

async function deletePaymentMethod(id) {
  if (!confirm("Bạn chắc chắn muốn xóa phương thức này?")) return;
  try {
    const res = await fetch(`${API}/payment-methods/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Lỗi khi xóa.");
    showNotify("Xóa phương thức thành công!");
    fetchAllData();
  } catch (err) {
    showNotify(err.message || "Lỗi xóa phương thức.", true);
  }
}

async function renderFooterSettings() {
  const address = document.getElementById("footer-address");
  const phone = document.getElementById("footer-phone");
  const email = document.getElementById("footer-email");
  const map = document.getElementById("footer-map");
  const facebook = document.getElementById("footer-facebook");
  const instagram = document.getElementById("footer-instagram");
  const youtube = document.getElementById("footer-youtube");
  try {
    const res = await fetch(`${API}/contact`);
    const info = await res.json();
    address.value = info.address || "";
    phone.value = info.phone || "";
    email.value = info.email || "";
    map.value = info.mapUrl || "";
    facebook.value = info.facebook || "";
    instagram.value = info.instagram || "";
    youtube.value = info.youtube || "";
  } catch (err) {
    address.value = "";
    phone.value = "";
    email.value = "";
    map.value = "";
    facebook.value = "";
    instagram.value = "";
    youtube.value = "";
    showNotify("Không thể tải dữ liệu Footer.", true);
  }
}

async function saveFooterSettings() {
  const address = document.getElementById("footer-address").value.trim();
  const phone = document.getElementById("footer-phone").value.trim();
  const email = document.getElementById("footer-email").value.trim();
  const mapUrl = document.getElementById("footer-map").value.trim();
  const facebook = document.getElementById("footer-facebook").value.trim();
  const instagram = document.getElementById("footer-instagram").value.trim();
  const youtube = document.getElementById("footer-youtube").value.trim();

  await fetch(`${API}/contact`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      address,
      phone,
      email,
      mapUrl,
      facebook,
      instagram,
      youtube,
    }),
  });

  showNotify("Đã lưu Footer!");
  fetchAllData();
}

async function toggleUserBlock(id, block) {
  const user = db.users.find((u) => u.id === id);
  if (!user) return;
  const action = block ? "Khoá" : "Mở khoá";
  if (!confirm(`${action} người dùng này?`)) return;
  await fetch(`${API}/users/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blocked: block ? 1 : 0 }),
  });
  showNotify(`Đã ${block ? "khoá" : "mở khoá"} người dùng!`);
  fetchAllData();
}

/* ================================================================
   UTILS
================================================================ */
function openModal(id) {
  document.getElementById(id).classList.add("open");
}
function closeModal(id) {
  document.getElementById(id).classList.remove("open");
}

function showNotify(msg, isErr) {
  clearTimeout(notifyTimer);
  const n = document.getElementById("notify");
  document.getElementById("notify-msg").textContent = msg;
  n.className = "notify" + (isErr ? " error" : "") + " show";
  notifyTimer = setTimeout(() => n.classList.remove("show"), 2800);
}

function handleSearch(q) {
  const page = document.querySelector(".page.active");
  if (!page) return;
  if (page.id === "page-books") {
    document.getElementById("book-search").value = q;
    renderBooks();
  }
  if (page.id === "page-users") {
    document.getElementById("user-search").value = q;
    renderUsers();
  }
  if (page.id === "page-orders") {
    document.getElementById("order-search").value = q;
    renderOrders();
  }
}

document.querySelectorAll(".modal-overlay").forEach((m) => {
  m.addEventListener("click", (e) => {
    if (e.target === m) m.classList.remove("open");
  });
});

/* ================================================================
   BOOT
================================================================ */
checkAuth();

// Preview uploaded payment method image
document.addEventListener("DOMContentLoaded", () => {
  const fileInput = document.getElementById("payment-method-file");
  const preview = document.getElementById("payment-method-preview");
  if (fileInput) {
    fileInput.addEventListener("change", async () => {
      const f = fileInput.files && fileInput.files[0];
      if (!f) {
        if (preview) {
          preview.src = "";
          preview.style.display = "none";
        }
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        if (preview) {
          preview.src = reader.result;
          preview.style.display = "block";
        }
      };
      reader.readAsDataURL(f);
    });
  }
});
