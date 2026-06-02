# HƯỚNG DẪN GHÉP TRANG ADMIN MỚI VÀO NAPH BOOKSTORE
## Từ A đến Z — Theo từng bước

---

## BƯỚC 1 — Copy 3 file vào thư mục `frontend/`

Sau khi download từ Claude, copy 3 file này vào thư mục `NAMWEB/frontend/`:

```
NAMWEB/
└── frontend/
    ├── index.html      ← file gốc, KHÔNG đổi
    ├── app.js          ← file gốc, chỉnh nhẹ ở Bước 2
    ├── naph.css        ← file gốc, KHÔNG đổi
    ├── admin.html      ← ✅ FILE MỚI (copy vào)
    ├── admin.css       ← ✅ FILE MỚI (copy vào)
    ├── admin.js        ← ✅ FILE MỚI (copy vào)
    └── logo1.png
```

---

## BƯỚC 2 — Sửa nút Admin trong `index.html`

Mở `frontend/index.html`, tìm đoạn sau (khoảng dòng 62):

```html
<button class="nav-btn admin-only hidden" data-target="adminPage">
    <svg ...>...</svg>
    Admin
</button>
```

**Thay bằng:**

```html
<a href="admin.html" class="nav-btn admin-only hidden" id="adminNavBtn"
   style="text-decoration:none;">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="7" height="7"/>
        <rect x="14" y="3" width="7" height="7"/>
        <rect x="14" y="14" width="7" height="7"/>
        <rect x="3" y="14" width="7" height="7"/>
    </svg>
    Admin
</a>
```

> Lưu ý: Đổi `<button>` thành `<a href="admin.html">` để click vào sẽ mở trang admin mới.

---

## BƯỚC 3 — Chạy backend

Mở terminal, chạy backend như bình thường:

```bash
cd NAMWEB/backend
node server.js
```

Backend sẽ chạy tại `http://localhost:3000`

---

## BƯỚC 4 — Truy cập

- **Trang chủ:**  http://localhost:3000  (hoặc mở frontend/index.html)
- **Trang Admin:** http://localhost:3000/admin.html

---

## BƯỚC 5 — Đăng nhập Admin

Trên trang `admin.html`, đăng nhập bằng:
- **Email:** admin@example.com  
- **Mật khẩu:** admin123

> Admin tự kiểm tra quyền: chỉ tài khoản có `role: "admin"` mới vào được.

---

## TÍNH NĂNG MỚI ĐÃ THÊM

### ① Duyệt đơn hàng
Khi khách đặt hàng từ trang chủ, đơn sẽ có status = `Processing`.

**Có 2 cách duyệt:**

**Cách 1 — Duyệt nhanh ngay trong bảng:**
- Vào mục **Đơn hàng**
- Các đơn `Chờ duyệt` sẽ có 2 nút xanh/đỏ: **✓ Duyệt** và **✕ Hủy**
- Nhấn **Duyệt** → đơn chuyển sang `Đang giao`
- Nhấn **Hủy** → đơn chuyển sang `Đã hủy`

**Cách 2 — Xem chi tiết rồi duyệt:**
- Nhấn nút **Chi tiết** → panel bên phải mở ra
- Xem thông tin khách hàng, địa chỉ, danh sách sách
- Nhấn **Xác nhận & Giao hàng** hoặc **Hủy đơn**
- Hoặc chọn trạng thái thủ công trong dropdown

**Banner thông báo:**
- Khi có đơn chờ duyệt → hiện banner vàng ở đầu trang Orders
- Badge số đỏ trên nav "Đơn hàng" hiện số lượng chờ

---

### ② Upload ảnh sách
Khi **Thêm sách** hoặc **Chỉnh sửa sách**:

**Ảnh bìa chính:**
- Nhấp vào vùng upload → chọn file ảnh (JPG/PNG/WEBP)
- Hoặc nhập URL ảnh vào ô text → nhấn **Áp dụng**
- Hoặc nhập emoji (📚 📖 📕...)
- Preview hiện ngay lập tức

**Ảnh phụ / Gallery (chỉ khi Chỉnh sửa):**
- Nhấn **+ Thêm ảnh phụ** → chọn nhiều file cùng lúc
- Preview thumbnail hiện bên dưới
- Nhấn ✕ trên thumbnail để xóa trước khi lưu
- Ảnh phụ hiện trong trang chi tiết sách (detailThumbnails)
- Có thể xóa ảnh phụ đã upload bằng nút ✕ trên ảnh cũ

---

## LƯU Ý QUAN TRỌNG

1. **Backend phải đang chạy** — admin.js gọi `http://localhost:3000/api`
2. **Nút Admin trên nav** chỉ hiện với user có `role: "admin"` (đã xử lý trong app.js cũ)
3. **Session admin riêng** — admin.html dùng `naph_admin_session` trong localStorage, độc lập với session trang chủ
4. **Ảnh lưu dạng base64** trong database SQLite — ảnh lớn sẽ làm DB nặng hơn
5. Nếu muốn test nhanh không cần login, bỏ comment `checkAuth()` trong admin.js

---

## CẤU TRÚC SAU KHI GHÉP XONG

```
NAMWEB/
├── backend/
│   ├── server.js         ← KHÔNG thay đổi
│   ├── database.sqlite
│   └── db.json
└── frontend/
    ├── index.html        ← Sửa nút Admin (Bước 2)
    ├── app.js            ← KHÔNG thay đổi
    ├── naph.css          ← KHÔNG thay đổi
    ├── admin.html        ← ✅ MỚI
    ├── admin.css         ← ✅ MỚI
    ├── admin.js          ← ✅ MỚI
    └── logo1.png
```
