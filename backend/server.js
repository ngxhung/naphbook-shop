const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs").promises;
const sqlite3 = require("sqlite3").verbose();

const app = express();
const PORT = process.env.PORT || 3000;
const USE_MSSQL = Boolean(
  process.env.DB_TYPE === "mssql" ||
  process.env.MSSQL_CONNECTION_STRING ||
  process.env.MSSQL_CONN,
);

let mssql = null;
if (USE_MSSQL) {
  try {
    mssql = require("mssql");
  } catch (err) {
    console.error(
      "mssql module not installed. Install with: npm install mssql",
    );
    process.exit(1);
  }
}

const FRONTEND_DIR = path.join(__dirname, "..", "frontend");
const DATA_FILE = path.join(__dirname, "db.json");
const DB_FILE = path.join(__dirname, "database.sqlite");

const MSSQL_CONFIG = USE_MSSQL
  ? {
      connectionString:
        process.env.MSSQL_CONNECTION_STRING || process.env.MSSQL_CONN,
      options: {
        enableArithAbort: true,
        trustServerCertificate: true,
      },
    }
  : null;

let sqlPool = null;
const db = USE_MSSQL
  ? null
  : new sqlite3.Database(DB_FILE, (err) => {
      if (err) {
        console.error("Failed to open SQLite database:", err);
        process.exit(1);
      }
    });

app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Serve uploaded files
const UPLOADS_DIR = path.join(__dirname, "../frontend/uploads");
async function ensureUploads() {
  try {
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
  } catch (e) {
    // ignore
  }
}
ensureUploads();
app.use("/uploads", express.static(UPLOADS_DIR));

// Multer for file uploads
let multer;
try {
  multer = require("multer");
} catch (err) {
  console.error(
    "multer not installed. Run `npm install` in backend to enable file uploads.",
  );
}
if (multer) {
  const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, UPLOADS_DIR);
    },
    filename: function (req, file, cb) {
      const ext = path.extname(file.originalname) || "";
      const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
      cb(null, name);
    },
  });
  const upload = multer({ storage });
  app.post("/api/upload", upload.single("file"), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const publicPath = `/uploads/${req.file.filename}`;
    res.json({ url: publicPath });
  });
}

const passwordResetCodes = new Map();
const OTP_EXPIRATION_MS = 10 * 60 * 1000;

function formatQuery(query) {
  if (!USE_MSSQL) return query;
  let index = 0;
  return query.replace(/\?/g, () => `@p${index++}`);
}

function buildRequest(params = []) {
  const request = sqlPool.request();
  params.forEach((value, index) => request.input(`p${index}`, value));
  return request;
}

function run(query, params = []) {
  if (!USE_MSSQL) {
    return new Promise((resolve, reject) => {
      db.run(query, params, function (err) {
        if (err) return reject(err);
        resolve(this);
      });
    });
  }

  const sql = formatQuery(query);
  return buildRequest(params).query(sql);
}

function all(query, params = []) {
  if (!USE_MSSQL) {
    return new Promise((resolve, reject) => {
      db.all(query, params, (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });
  }

  const sql = formatQuery(query);
  return buildRequest(params)
    .query(sql)
    .then((result) => result.recordset);
}

function get(query, params = []) {
  if (!USE_MSSQL) {
    return new Promise((resolve, reject) => {
      db.get(query, params, (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });
  }

  const sql = formatQuery(query);
  return buildRequest(params)
    .query(sql)
    .then((result) => (result.recordset.length ? result.recordset[0] : null));
}

async function initDb() {
  if (USE_MSSQL) {
    sqlPool = await mssql.connect(MSSQL_CONFIG);
    await run(
      "IF OBJECT_ID('users', 'U') IS NULL CREATE TABLE users (id NVARCHAR(100) PRIMARY KEY, name NVARCHAR(255) NOT NULL, email NVARCHAR(255) NOT NULL UNIQUE, password NVARCHAR(255) NOT NULL, role NVARCHAR(50) NOT NULL)",
    );
    await run(
      "IF OBJECT_ID('categories', 'U') IS NULL CREATE TABLE categories (id NVARCHAR(100) PRIMARY KEY, name NVARCHAR(255) NOT NULL)",
    );
    await run(
      "IF OBJECT_ID('products', 'U') IS NULL CREATE TABLE products (id NVARCHAR(100) PRIMARY KEY, title NVARCHAR(255) NOT NULL, author NVARCHAR(255), category NVARCHAR(100), price FLOAT, rating FLOAT, stock INT, description NVARCHAR(MAX), cover NVARCHAR(MAX))",
    );
    await run(
      "IF OBJECT_ID('reviews', 'U') IS NULL CREATE TABLE reviews (id NVARCHAR(100) PRIMARY KEY, productId NVARCHAR(100) NOT NULL, userId NVARCHAR(100), userName NVARCHAR(255), rating FLOAT NOT NULL, comment NVARCHAR(MAX), createdAt NVARCHAR(100) NOT NULL)",
    );
    await run(
      "IF OBJECT_ID('orders', 'U') IS NULL CREATE TABLE orders (id NVARCHAR(100) PRIMARY KEY, userId NVARCHAR(100), items NVARCHAR(MAX), total FLOAT, status NVARCHAR(100), createdAt NVARCHAR(100), shipping NVARCHAR(MAX), paymentMethodId NVARCHAR(100), paymentMethodName NVARCHAR(255), paymentStatus NVARCHAR(100))",
    );
    await run(
      "IF OBJECT_ID('payment_methods', 'U') IS NULL CREATE TABLE payment_methods (id NVARCHAR(100) PRIMARY KEY, name NVARCHAR(255), description NVARCHAR(MAX), image NVARCHAR(MAX), sortOrder INT DEFAULT 0, active BIT DEFAULT 1)",
    );
    await run(
      "IF OBJECT_ID('product_images', 'U') IS NULL CREATE TABLE product_images (id NVARCHAR(100) PRIMARY KEY, productId NVARCHAR(100) NOT NULL, imageData NVARCHAR(MAX) NOT NULL, sortOrder INT DEFAULT 0)",
    );
    await run(
      "IF OBJECT_ID('contact_info', 'U') IS NULL CREATE TABLE contact_info (id INT PRIMARY KEY DEFAULT 1, address NVARCHAR(500), phone NVARCHAR(100), email NVARCHAR(255), mapUrl NVARCHAR(1000), facebook NVARCHAR(500), instagram NVARCHAR(500), youtube NVARCHAR(500))",
    );
    const paymentMethodCount = await get(
      "SELECT COUNT(*) AS cnt FROM payment_methods",
    );
    const codMethodCount = await get(
      "SELECT COUNT(*) AS cnt FROM payment_methods WHERE id = 'cod'",
    );
    if (!codMethodCount || codMethodCount.cnt === 0) {
      await run(
        "INSERT INTO payment_methods (id, name, description, image, sortOrder, active) VALUES ('cod', N'Thanh Toán Khi Nhận Hàng', N'Thanh toán khi nhận hàng tại địa chỉ của bạn.', '', 0, 1)",
      );
    }
    if (!paymentMethodCount || paymentMethodCount.cnt === 0) {
      await run(
        "INSERT INTO payment_methods (id, name, description, image, sortOrder, active) VALUES ('bank-1', N'Ngân hàng A', N'Quét mã QR để thanh toán ngay.', 'https://via.placeholder.com/250x250.png?text=Ngan+hang+A', 1, 1)",
      );
      await run(
        "INSERT INTO payment_methods (id, name, description, image, sortOrder, active) VALUES ('bank-2', N'Ngân hàng B', N'Thanh toán qua mã QR Banking.', 'https://via.placeholder.com/250x250.png?text=Ngan+hang+B', 2, 1)",
      );
    }
    const hasContact = await get("SELECT COUNT(*) AS cnt FROM contact_info");
    if (!hasContact || hasContact.cnt === 0) {
      await run(
        "INSERT INTO contact_info (id, address, phone, email, mapUrl) VALUES (1, N'123 Nguyễn Huệ, Quận 1, TP. Hồ Chí Minh', '+84 28 1234 5678', 'support@naph.com', 'https://maps.google.com/?q=NAPH+Bookstore+Ho+Chi+Minh')",
      );
    }
  } else {
    await run(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role TEXT NOT NULL,
      blocked INTEGER DEFAULT 0
    )`);

    await run(`CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL
    )`);

    await run(`CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      author TEXT,
      category TEXT,
      price REAL,
      rating REAL,
      stock INTEGER,
      description TEXT,
      cover TEXT
    )`);

    await run(`CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      productId TEXT NOT NULL,
      userId TEXT,
      userName TEXT,
      rating REAL NOT NULL,
      comment TEXT,
      createdAt TEXT NOT NULL
    )`);

    await run(`CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      userId TEXT,
      items TEXT,
      total REAL,
      status TEXT,
      createdAt TEXT,
      shipping TEXT,
      paymentMethodId TEXT,
      paymentMethodName TEXT,
      paymentStatus TEXT,
      completedAt TEXT
    )`);

    if (!USE_MSSQL) {
      const orderCols = await all("PRAGMA table_info(orders)");
      if (!orderCols.some((col) => col.name === "paymentMethodId")) {
        await run("ALTER TABLE orders ADD COLUMN paymentMethodId TEXT");
      }
      if (!orderCols.some((col) => col.name === "paymentMethodName")) {
        await run("ALTER TABLE orders ADD COLUMN paymentMethodName TEXT");
      }
      if (!orderCols.some((col) => col.name === "paymentStatus")) {
        await run("ALTER TABLE orders ADD COLUMN paymentStatus TEXT");
      }
      if (!orderCols.some((col) => col.name === "completedAt")) {
        await run("ALTER TABLE orders ADD COLUMN completedAt TEXT");
      }
      const userCols = await all("PRAGMA table_info(users)");
      if (!userCols.some((col) => col.name === "blocked")) {
        await run("ALTER TABLE users ADD COLUMN blocked INTEGER DEFAULT 0");
      }
    } else {
      try {
        await run("ALTER TABLE users ADD blocked INT DEFAULT 0");
      } catch (err) {
        // Column may already exist
      }
    }

    await run(`CREATE TABLE IF NOT EXISTS payment_methods (
      id TEXT PRIMARY KEY,
      name TEXT,
      description TEXT,
      image TEXT,
      sortOrder INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1
    )`);

    await run(`CREATE TABLE IF NOT EXISTS product_images (
      id TEXT PRIMARY KEY,
      productId TEXT NOT NULL,
      imageData TEXT NOT NULL,
      sortOrder INTEGER DEFAULT 0
    )`);

    await run(`CREATE TABLE IF NOT EXISTS contact_info (
      id INTEGER PRIMARY KEY DEFAULT 1,
      address TEXT,
      phone TEXT,
      email TEXT,
      mapUrl TEXT,
      facebook TEXT,
      instagram TEXT,
      youtube TEXT
    )`);
    await run(`CREATE TABLE IF NOT EXISTS banners (
      id TEXT PRIMARY KEY,
      title TEXT,
      subtitle TEXT,
      image TEXT,
      section TEXT DEFAULT 'home',
      buttonText TEXT,
      buttonLink TEXT,
      sortOrder INTEGER DEFAULT 0
    )`);

    if (!USE_MSSQL) {
      const bannerCols = await all("PRAGMA table_info(banners)");
      if (!bannerCols.some((col) => col.name === "section")) {
        await run("ALTER TABLE banners ADD COLUMN section TEXT DEFAULT 'home'");
      }
    }

    await run(`CREATE TABLE IF NOT EXISTS flash_sale (
      id TEXT PRIMARY KEY,
      title TEXT,
      subtitle TEXT,
      endAt TEXT,
      background TEXT
    )`);

    await run(`CREATE TABLE IF NOT EXISTS flash_sale_items (
      id TEXT PRIMARY KEY,
      productId TEXT NOT NULL,
      discountPercent REAL DEFAULT 0,
      discountAmount REAL DEFAULT 0,
      sortOrder INTEGER DEFAULT 0
    )`);

    const hasFlashSale = await get(
      "SELECT COUNT(*) AS cnt FROM flash_sale WHERE id = 'flash-sale'",
    );
    if (!hasFlashSale || hasFlashSale.cnt === 0) {
      await run(
        "INSERT INTO flash_sale (id, title, subtitle, endAt, background) VALUES ('flash-sale', ?, ?, ?, ?)",
        [
          "Flash Sale NAPH",
          "Giảm sốc trong thời gian giới hạn",
          new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          "#da6cf0",
        ],
      );
    }

    const hasContact = await get("SELECT COUNT(*) AS cnt FROM contact_info");
    if (!hasContact || hasContact.cnt === 0) {
      await run(
        "INSERT INTO contact_info (id, address, phone, email, mapUrl) VALUES (1, ?, ?, ?, ?)",
        [
          "123 Nguyễn Huệ, Quận 1, TP. Hồ Chí Minh",
          "+84 28 1234 5678",
          "support@naph.com",
          "https://maps.google.com/?q=NAPH+Bookstore+Ho+Chi+Minh",
        ],
      );
    }

    await run(`CREATE TABLE IF NOT EXISTS payment_methods (
      id TEXT PRIMARY KEY,
      name TEXT,
      description TEXT,
      image TEXT,
      sortOrder INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1
    )`);
    const paymentMethodCount = await get(
      "SELECT COUNT(*) AS cnt FROM payment_methods",
    );
    const codMethodCount = await get(
      "SELECT COUNT(*) AS cnt FROM payment_methods WHERE id = 'cod'",
    );
    if (!codMethodCount || codMethodCount.cnt === 0) {
      await run(
        "INSERT INTO payment_methods (id, name, description, image, sortOrder, active) VALUES (?, ?, ?, ?, ?, ?)",
        [
          "cod",
          "Thanh Toán Khi Nhận Hàng",
          "Thanh toán khi nhận hàng tại địa chỉ của bạn.",
          "",
          0,
          1,
        ],
      );
    }
    if (!paymentMethodCount || paymentMethodCount.cnt === 0) {
      await run(
        "INSERT INTO payment_methods (id, name, description, image, sortOrder, active) VALUES (?, ?, ?, ?, ?, ?)",
        [
          "bank-1",
          "Ngân hàng A",
          "Quét mã QR để thanh toán ngay.",
          "https://via.placeholder.com/250x250.png?text=Ngan+hang+A",
          1,
          1,
        ],
      );
      await run(
        "INSERT INTO payment_methods (id, name, description, image, sortOrder, active) VALUES (?, ?, ?, ?, ?, ?)",
        [
          "bank-2",
          "Ngân hàng B",
          "Thanh toán qua mã QR Banking.",
          "https://via.placeholder.com/250x250.png?text=Ngan+hang+B",
          2,
          1,
        ],
      );
    }
  }

  const count = await get("SELECT COUNT(*) AS cnt FROM users");
  if (count?.cnt === 0) {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const data = JSON.parse(raw);

    if (!USE_MSSQL) {
      await run("BEGIN TRANSACTION");
    }

    for (const user of data.users) {
      if (USE_MSSQL) {
        await run(
          "INSERT INTO users (id, name, email, password, role) SELECT ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM users WHERE id = ?)",
          [user.id, user.name, user.email, user.password, user.role, user.id],
        );
      } else {
        await run(
          "INSERT OR IGNORE INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)",
          [user.id, user.name, user.email, user.password, user.role],
        );
      }
    }

    for (const category of data.categories) {
      if (USE_MSSQL) {
        await run(
          "INSERT INTO categories (id, name) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM categories WHERE id = ?)",
          [category.id, category.name, category.id],
        );
      } else {
        await run("INSERT OR IGNORE INTO categories (id, name) VALUES (?, ?)", [
          category.id,
          category.name,
        ]);
      }
    }

    for (const product of data.products) {
      if (USE_MSSQL) {
        await run(
          "INSERT INTO products (id, title, author, category, price, rating, stock, description, cover) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM products WHERE id = ?)",
          [
            product.id,
            product.title,
            product.author,
            product.category,
            product.price,
            product.rating,
            product.stock,
            product.description,
            product.cover,
            product.id,
          ],
        );
      } else {
        await run(
          "INSERT OR IGNORE INTO products (id, title, author, category, price, rating, stock, description, cover) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [
            product.id,
            product.title,
            product.author,
            product.category,
            product.price,
            product.rating,
            product.stock,
            product.description,
            product.cover,
          ],
        );
      }
    }

    for (const order of data.orders) {
      if (USE_MSSQL) {
        await run(
          "INSERT INTO orders (id, userId, items, total, status, createdAt, shipping) SELECT ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM orders WHERE id = ?)",
          [
            order.id,
            order.userId,
            JSON.stringify(order.items || []),
            order.total || 0,
            order.status || "Processing",
            order.createdAt || new Date().toISOString(),
            JSON.stringify(order.shipping || {}),
            order.id,
          ],
        );
      } else {
        await run(
          "INSERT OR IGNORE INTO orders (id, userId, items, total, status, createdAt, shipping) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [
            order.id,
            order.userId,
            JSON.stringify(order.items || []),
            order.total || 0,
            order.status || "Processing",
            order.createdAt || new Date().toISOString(),
            JSON.stringify(order.shipping || {}),
          ],
        );
      }
    }

    if (!USE_MSSQL) {
      await run("COMMIT");
    }
  }
}

function sanitizeUser(user) {
  const { password, ...safe } = user;
  return safe;
}

function parseOrderRow(row) {
  if (!row) return null;
  return {
    ...row,
    items: row.items ? JSON.parse(row.items) : [],
    shipping: row.shipping ? JSON.parse(row.shipping) : {},
    completedAt: row.completedAt || null,
  };
}

app.use(cors());
app.use(express.json());
app.use(express.static(FRONTEND_DIR));

app.get("/api/categories", async (req, res) => {
  const categories = await all("SELECT id, name FROM categories");
  res.json(categories);
});

app.get("/api/products", async (req, res) => {
  const products = USE_MSSQL
    ? await all(
        "SELECT p.*, COALESCE(ROUND(AVG(CAST(r.rating AS FLOAT)), 1), 0) AS rating, COUNT(r.id) AS reviewCount FROM products p LEFT JOIN reviews r ON r.productId = p.id GROUP BY p.id",
      )
    : await all(
        "SELECT p.*, ROUND(AVG(r.rating), 1) AS rating, COUNT(r.id) AS reviewCount FROM products p LEFT JOIN reviews r ON r.productId = p.id GROUP BY p.id",
      );
  res.json(
    products.map((product) => ({
      ...product,
      rating: Number(product.rating) || 0,
      reviewCount: Number(product.reviewCount) || 0,
    })),
  );
});

app.get("/api/products/:id", async (req, res) => {
  const product = USE_MSSQL
    ? await get(
        "SELECT p.*, COALESCE(ROUND(AVG(CAST(r.rating AS FLOAT)), 1), 0) AS rating, COUNT(r.id) AS reviewCount FROM products p LEFT JOIN reviews r ON r.productId = p.id WHERE p.id = ? GROUP BY p.id",
        [req.params.id],
      )
    : await get(
        "SELECT p.*, ROUND(AVG(r.rating), 1) AS rating, COUNT(r.id) AS reviewCount FROM products p LEFT JOIN reviews r ON r.productId = p.id WHERE p.id = ? GROUP BY p.id",
        [req.params.id],
      );
  if (!product) return res.status(404).json({ error: "Product not found" });
  res.json({
    ...product,
    rating: Number(product.rating) || 0,
    reviewCount: Number(product.reviewCount) || 0,
  });
});

app.get("/api/users", async (req, res) => {
  const users = await all("SELECT * FROM users");
  res.json(users.map(sanitizeUser));
});

app.get("/api/orders", async (req, res) => {
  const userId = req.query.userId;
  let orders;
  if (userId) {
    orders = await all(
      "SELECT * FROM orders WHERE userId = ? ORDER BY createdAt DESC",
      [userId],
    );
  } else {
    orders = await all("SELECT * FROM orders ORDER BY createdAt DESC");
  }
  res.json(orders.map(parseOrderRow));
});

app.get("/api/payment-methods", async (req, res) => {
  const methods = await all(
    "SELECT id, name, description, image, sortOrder, active FROM payment_methods WHERE active = 1 ORDER BY sortOrder ASC, name ASC",
  );
  res.json(
    methods.map((method) => ({
      ...method,
      active: Boolean(method.active),
    })),
  );
});

app.post("/api/payment-methods", async (req, res) => {
  const { id, name, description, image, sortOrder, active } = req.body;
  await run(
    "INSERT INTO payment_methods (id, name, description, image, sortOrder, active) VALUES (?, ?, ?, ?, ?, ?)",
    [id, name, description, image, Number(sortOrder || 0), active ? 1 : 0],
  );
  res.json({
    id,
    name,
    description,
    image,
    sortOrder: Number(sortOrder || 0),
    active: Boolean(active),
  });
});

app.put("/api/payment-methods/:id", async (req, res) => {
  const { name, description, image, sortOrder, active } = req.body;
  await run(
    "UPDATE payment_methods SET name = ?, description = ?, image = ?, sortOrder = ?, active = ? WHERE id = ?",
    [
      name,
      description,
      image,
      Number(sortOrder || 0),
      active ? 1 : 0,
      req.params.id,
    ],
  );
  res.json({
    id: req.params.id,
    name,
    description,
    image,
    sortOrder: Number(sortOrder || 0),
    active: Boolean(active),
  });
});

app.delete("/api/payment-methods/:id", async (req, res) => {
  await run("DELETE FROM payment_methods WHERE id = ?", [req.params.id]);
  res.json({ success: true });
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await get(
    "SELECT * FROM users WHERE LOWER(email) = LOWER(?) AND password = ?",
    [String(email || "").toLowerCase(), password],
  );
  if (!user) return res.status(400).json({ error: "Invalid credentials" });
  if (user.blocked)
    return res.status(403).json({ error: "Tài khoản đã bị khóa" });
  res.json(sanitizeUser(user));
});

app.post("/api/auth/register", async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: "Missing fields" });
  }
  const existing = await get(
    "SELECT id FROM users WHERE LOWER(email) = LOWER(?)",
    [String(email).toLowerCase()],
  );
  if (existing) return res.status(400).json({ error: "Email already exists" });
  const id = `user-${Math.random().toString(36).slice(2, 9)}`;
  await run(
    "INSERT INTO users (id, name, email, password, role, blocked) VALUES (?, ?, ?, ?, ?, ?)",
    [id, name, email, password, "user", 0],
  );
  res.json(
    sanitizeUser({ id, name, email, password, role: "user", blocked: 0 }),
  );
});

app.post("/api/auth/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email required" });
  const user = await get("SELECT * FROM users WHERE LOWER(email) = LOWER(?)", [
    String(email || "").toLowerCase(),
  ]);
  if (!user) return res.status(400).json({ error: "Email chưa đăng ký" });

  const code = String(Math.floor(100000 + Math.random() * 900000));
  passwordResetCodes.set(user.email.toLowerCase(), {
    code,
    expires: Date.now() + OTP_EXPIRATION_MS,
  });
  console.log(`Password reset code for ${user.email}: ${code}`);
  res.json({
    message:
      "Mã xác thực đã được gửi đến email của bạn. Vui lòng kiểm tra email.",
  });
});

app.post("/api/auth/reset-password", async (req, res) => {
  const { email, code, password } = req.body;
  if (!email || !code || !password)
    return res.status(400).json({ error: "Thiếu thông tin" });
  const record = passwordResetCodes.get(String(email || "").toLowerCase());
  if (
    !record ||
    record.code !== String(code).trim() ||
    record.expires < Date.now()
  ) {
    return res
      .status(400)
      .json({ error: "Mã xác thực không hợp lệ hoặc đã hết hạn" });
  }
  const user = await get("SELECT * FROM users WHERE LOWER(email) = LOWER(?)", [
    String(email || "").toLowerCase(),
  ]);
  if (!user) return res.status(400).json({ error: "Email chưa đăng ký" });

  await run("UPDATE users SET password = ? WHERE id = ?", [password, user.id]);
  passwordResetCodes.delete(user.email.toLowerCase());
  res.json({ message: "Mật khẩu đã được thay đổi. Vui lòng đăng nhập lại." });
});

app.post("/api/products", async (req, res) => {
  const product = {
    id: `b-${Math.random().toString(36).slice(2, 9)}`,
    title: req.body.title || "",
    author: req.body.author || "",
    category: req.body.category || "",
    price: Number(req.body.price) || 0,
    rating: 0,
    stock: Number(req.body.stock) || 0,
    description: req.body.description || "",
    cover: req.body.cover || "",
  };
  await run(
    "INSERT INTO products (id, title, author, category, price, rating, stock, description, cover) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      product.id,
      product.title,
      product.author,
      product.category,
      product.price,
      product.rating,
      product.stock,
      product.description,
      product.cover,
    ],
  );
  res.json(product);
});

app.put("/api/products/:id", async (req, res) => {
  const product = await get("SELECT * FROM products WHERE id = ?", [
    req.params.id,
  ]);
  if (!product) return res.status(404).json({ error: "Product not found" });
  const updated = {
    ...product,
    ...req.body,
    price:
      req.body.price !== undefined ? Number(req.body.price) : product.price,
    stock:
      req.body.stock !== undefined ? Number(req.body.stock) : product.stock,
  };
  await run(
    "UPDATE products SET title = ?, author = ?, category = ?, price = ?, rating = ?, stock = ?, description = ?, cover = ? WHERE id = ?",
    [
      updated.title,
      updated.author,
      updated.category,
      updated.price,
      product.rating,
      updated.stock,
      updated.description,
      updated.cover,
      req.params.id,
    ],
  );
  res.json(updated);
});

app.delete("/api/products/:id", async (req, res) => {
  await run("DELETE FROM products WHERE id = ?", [req.params.id]);
  res.json({ success: true });
});

app.get("/api/reviews", async (req, res) => {
  const reviews = await all("SELECT * FROM reviews ORDER BY createdAt DESC");
  res.json(reviews);
});

app.get("/api/products/:id/reviews", async (req, res) => {
  const reviews = await all(
    "SELECT * FROM reviews WHERE productId = ? ORDER BY createdAt DESC",
    [req.params.id],
  );
  res.json(reviews);
});

app.post("/api/products/:id/reviews", async (req, res) => {
  const product = await get("SELECT * FROM products WHERE id = ?", [
    req.params.id,
  ]);
  if (!product) return res.status(404).json({ error: "Product not found" });
  const rating = Number(req.body.rating);
  const comment = String(req.body.comment || "").trim();
  if (!rating || rating < 0.5 || rating > 5)
    return res.status(400).json({ error: "Rating must be between 0.5 and 5" });
  if (!comment) return res.status(400).json({ error: "Comment is required" });
  const review = {
    id: `rev-${Math.random().toString(36).slice(2, 9)}`,
    productId: req.params.id,
    userId: req.body.userId || null,
    userName: req.body.userName || "Khách",
    rating,
    comment,
    createdAt: new Date().toISOString(),
  };
  await run(
    "INSERT INTO reviews (id, productId, userId, userName, rating, comment, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [
      review.id,
      review.productId,
      review.userId,
      review.userName,
      review.rating,
      review.comment,
      review.createdAt,
    ],
  );
  res.json(review);
});

app.delete("/api/reviews/:id", async (req, res) => {
  await run("DELETE FROM reviews WHERE id = ?", [req.params.id]);
  res.json({ success: true });
});

app.post("/api/users", async (req, res) => {
  const user = {
    id: `user-${Math.random().toString(36).slice(2, 9)}`,
    name: req.body.name || "",
    email: req.body.email || "",
    password: req.body.password || "",
    role: req.body.role || "user",
    blocked: req.body.blocked ? 1 : 0,
  };
  await run(
    "INSERT INTO users (id, name, email, password, role, blocked) VALUES (?, ?, ?, ?, ?, ?)",
    [user.id, user.name, user.email, user.password, user.role, user.blocked],
  );
  res.json(sanitizeUser(user));
});

app.put("/api/users/:id", async (req, res) => {
  const user = await get("SELECT * FROM users WHERE id = ?", [req.params.id]);
  if (!user) return res.status(404).json({ error: "User not found" });
  const updated = {
    ...user,
    ...req.body,
  };
  await run(
    "UPDATE users SET name = ?, email = ?, password = ?, role = ?, blocked = ? WHERE id = ?",
    [
      updated.name,
      updated.email,
      updated.password,
      updated.role,
      updated.blocked ? 1 : 0,
      req.params.id,
    ],
  );
  res.json(sanitizeUser(updated));
});

app.delete("/api/users/:id", async (req, res) => {
  await run("DELETE FROM users WHERE id = ?", [req.params.id]);
  res.json({ success: true });
});

app.post("/api/categories", async (req, res) => {
  const category = {
    id:
      req.body.id ||
      String(req.body.name || "")
        .toLowerCase()
        .replace(/\s+/g, "-"),
    name: req.body.name || "",
  };
  await run("INSERT INTO categories (id, name) VALUES (?, ?)", [
    category.id,
    category.name,
  ]);
  res.json(category);
});

app.put("/api/categories/:id", async (req, res) => {
  const existing = await get("SELECT * FROM categories WHERE id = ?", [
    req.params.id,
  ]);
  if (!existing) return res.status(404).json({ error: "Category not found" });
  const updated = { ...existing, ...req.body };
  await run("UPDATE categories SET name = ? WHERE id = ?", [
    updated.name,
    req.params.id,
  ]);
  res.json(updated);
});

app.delete("/api/categories/:id", async (req, res) => {
  await run("DELETE FROM categories WHERE id = ?", [req.params.id]);
  res.json({ success: true });
});

app.post("/api/orders", async (req, res) => {
  const order = {
    id: `order-${Math.random().toString(36).slice(2, 9)}`,
    userId: req.body.userId,
    items: JSON.stringify(req.body.items || []),
    total: Number(req.body.total) || 0,
    status: "Processing",
    paymentMethodId: req.body.paymentMethodId || null,
    paymentMethodName: req.body.paymentMethodName || null,
    paymentStatus: req.body.paymentStatus || "Pending",
    createdAt: new Date().toISOString(),
    shipping: JSON.stringify(req.body.shipping || {}),
  };
  await run(
    "INSERT INTO orders (id, userId, items, total, status, paymentMethodId, paymentMethodName, paymentStatus, createdAt, shipping) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      order.id,
      order.userId,
      order.items,
      order.total,
      order.status,
      order.paymentMethodId,
      order.paymentMethodName,
      order.paymentStatus,
      order.createdAt,
      order.shipping,
    ],
  );
  res.json(parseOrderRow(order));
});

app.put("/api/orders/:id", async (req, res) => {
  const order = await get("SELECT * FROM orders WHERE id = ?", [req.params.id]);
  if (!order) return res.status(404).json({ error: "Order not found" });
  const updated = {
    ...order,
    ...req.body,
    items: req.body.items ? JSON.stringify(req.body.items) : order.items,
    shipping: req.body.shipping
      ? JSON.stringify(req.body.shipping)
      : order.shipping,
    total: req.body.total !== undefined ? Number(req.body.total) : order.total,
    paymentMethodId:
      req.body.paymentMethodId !== undefined
        ? req.body.paymentMethodId
        : order.paymentMethodId,
    paymentMethodName:
      req.body.paymentMethodName !== undefined
        ? req.body.paymentMethodName
        : order.paymentMethodName,
    paymentStatus:
      req.body.paymentStatus !== undefined
        ? req.body.paymentStatus
        : order.paymentStatus,
    completedAt: order.completedAt || null,
  };

  if (req.body.status === "Delivered" && !order.completedAt) {
    updated.completedAt = new Date().toISOString();
  }

  await run(
    "UPDATE orders SET userId = ?, items = ?, total = ?, status = ?, paymentMethodId = ?, paymentMethodName = ?, paymentStatus = ?, createdAt = ?, shipping = ?, completedAt = ? WHERE id = ?",
    [
      updated.userId,
      updated.items,
      updated.total,
      updated.status,
      updated.paymentMethodId,
      updated.paymentMethodName,
      updated.paymentStatus,
      updated.createdAt,
      updated.shipping,
      updated.completedAt,
      req.params.id,
    ],
  );
  res.json(parseOrderRow(updated));
});

app.delete("/api/orders/:id", async (req, res) => {
  await run("DELETE FROM orders WHERE id = ?", [req.params.id]);
  res.json({ success: true });
});

app.get("/api/banners", async (req, res) => {
  const section = req.query.section;
  let query = "SELECT * FROM banners";
  const params = [];
  if (section) {
    query += " WHERE section = ?";
    params.push(section);
  }
  query += " ORDER BY sortOrder ASC, title ASC";
  const banners = await all(query, params);
  res.json(
    banners.map((b) => ({
      ...b,
      section: b.section || "home",
    })),
  );
});

app.get("/api/login-banners", async (req, res) => {
  const banners = await all(
    "SELECT * FROM banners WHERE section = 'login' ORDER BY sortOrder ASC, title ASC",
  );
  res.json(
    banners.map((b) => ({
      ...b,
      section: b.section || "login",
    })),
  );
});

app.post("/api/banners", async (req, res) => {
  const banner = {
    id: `banner-${Math.random().toString(36).slice(2, 9)}`,
    title: req.body.title || "",
    subtitle: req.body.subtitle || "",
    image: req.body.image || "",
    section: req.body.section || "home",
    buttonText: req.body.buttonText || "",
    buttonLink: req.body.buttonLink || "",
    sortOrder: Number(req.body.sortOrder) || 0,
  };
  await run(
    "INSERT INTO banners (id, title, subtitle, image, section, buttonText, buttonLink, sortOrder) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [
      banner.id,
      banner.title,
      banner.subtitle,
      banner.image,
      banner.section,
      banner.buttonText,
      banner.buttonLink,
      banner.sortOrder,
    ],
  );
  res.json(banner);
});

app.put("/api/banners/:id", async (req, res) => {
  const banner = await get("SELECT * FROM banners WHERE id = ?", [
    req.params.id,
  ]);
  if (!banner) return res.status(404).json({ error: "Banner not found" });
  const updated = {
    ...banner,
    ...req.body,
    sortOrder:
      req.body.sortOrder !== undefined
        ? Number(req.body.sortOrder)
        : banner.sortOrder,
  };
  await run(
    "UPDATE banners SET title = ?, subtitle = ?, image = ?, section = ?, buttonText = ?, buttonLink = ?, sortOrder = ? WHERE id = ?",
    [
      updated.title,
      updated.subtitle,
      updated.image,
      updated.section,
      updated.buttonText,
      updated.buttonLink,
      updated.sortOrder,
      req.params.id,
    ],
  );
  res.json(updated);
});

app.delete("/api/banners/:id", async (req, res) => {
  await run("DELETE FROM banners WHERE id = ?", [req.params.id]);
  res.json({ success: true });
});

app.get("/api/flash-sale", async (req, res) => {
  const config = await get("SELECT * FROM flash_sale WHERE id = 'flash-sale'");
  const items = await all(
    `SELECT f.id, f.productId, f.discountPercent, f.discountAmount, f.sortOrder,
      p.title, p.author, p.cover, p.price
      FROM flash_sale_items f
      LEFT JOIN products p ON p.id = f.productId
      ORDER BY f.sortOrder ASC`,
  );
  res.json({ config: config || {}, items });
});

app.put("/api/flash-sale", async (req, res) => {
  const { title, subtitle, endAt, background } = req.body;
  const existing = await get(
    "SELECT * FROM flash_sale WHERE id = 'flash-sale'",
  );
  if (existing) {
    await run(
      "UPDATE flash_sale SET title = ?, subtitle = ?, endAt = ?, background = ? WHERE id = 'flash-sale'",
      [
        title || existing.title,
        subtitle || existing.subtitle,
        endAt || existing.endAt,
        background || existing.background,
      ],
    );
    const updated = { ...existing, title, subtitle, endAt, background };
    res.json(updated);
  } else {
    await run(
      "INSERT INTO flash_sale (id, title, subtitle, endAt, background) VALUES ('flash-sale', ?, ?, ?, ?)",
      [
        title || "Flash Sale NAPH",
        subtitle || "Giảm sốc trong thời gian giới hạn",
        endAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        background || "#da6cf0",
      ],
    );
    res.json({
      id: "flash-sale",
      title: title || "Flash Sale NAPH",
      subtitle: subtitle || "Giảm sốc trong thời gian giới hạn",
      endAt: endAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      background: background || "#da6cf0",
    });
  }
});

app.get("/api/flash-sale/items", async (req, res) => {
  const items = await all(
    `SELECT f.id, f.productId, f.discountPercent, f.discountAmount, f.sortOrder,
      p.title, p.author, p.cover, p.price
      FROM flash_sale_items f
      LEFT JOIN products p ON p.id = f.productId
      ORDER BY f.sortOrder ASC`,
  );
  res.json(items);
});

app.post("/api/flash-sale/items", async (req, res) => {
  const { productId, discountPercent, discountAmount, sortOrder } = req.body;
  const product = await get("SELECT * FROM products WHERE id = ?", [productId]);
  if (!product) return res.status(400).json({ error: "Product not found" });
  const item = {
    id: `flash-${Math.random().toString(36).slice(2, 9)}`,
    productId,
    discountPercent: Number(discountPercent) || 0,
    discountAmount: Number(discountAmount) || 0,
    sortOrder: Number(sortOrder) || 0,
  };
  await run(
    "INSERT INTO flash_sale_items (id, productId, discountPercent, discountAmount, sortOrder) VALUES (?, ?, ?, ?, ?)",
    [
      item.id,
      item.productId,
      item.discountPercent,
      item.discountAmount,
      item.sortOrder,
    ],
  );
  res.json(item);
});

app.put("/api/flash-sale/items/:id", async (req, res) => {
  const existing = await get("SELECT * FROM flash_sale_items WHERE id = ?", [
    req.params.id,
  ]);
  if (!existing)
    return res.status(404).json({ error: "Flash sale item not found" });
  const updated = {
    ...existing,
    productId: req.body.productId || existing.productId,
    discountPercent:
      req.body.discountPercent !== undefined
        ? Number(req.body.discountPercent)
        : existing.discountPercent,
    discountAmount:
      req.body.discountAmount !== undefined
        ? Number(req.body.discountAmount)
        : existing.discountAmount,
    sortOrder:
      req.body.sortOrder !== undefined
        ? Number(req.body.sortOrder)
        : existing.sortOrder,
  };
  await run(
    "UPDATE flash_sale_items SET productId = ?, discountPercent = ?, discountAmount = ?, sortOrder = ? WHERE id = ?",
    [
      updated.productId,
      updated.discountPercent,
      updated.discountAmount,
      updated.sortOrder,
      req.params.id,
    ],
  );
  res.json(updated);
});

app.delete("/api/flash-sale/items/:id", async (req, res) => {
  await run("DELETE FROM flash_sale_items WHERE id = ?", [req.params.id]);
  res.json({ success: true });
});

/* ── PRODUCT IMAGES ── */
app.get("/api/products/:id/images", async (req, res) => {
  const images = await all(
    "SELECT id, imageData, sortOrder FROM product_images WHERE productId = ? ORDER BY sortOrder ASC",
    [req.params.id],
  );
  res.json(images);
});

app.post("/api/products/:id/images", async (req, res) => {
  const { imageData, sortOrder } = req.body;
  if (!imageData) return res.status(400).json({ error: "imageData required" });
  const id = `img-${Math.random().toString(36).slice(2, 9)}`;
  await run(
    "INSERT INTO product_images (id, productId, imageData, sortOrder) VALUES (?, ?, ?, ?)",
    [id, req.params.id, imageData, sortOrder || 0],
  );
  res.json({
    id,
    productId: req.params.id,
    imageData,
    sortOrder: sortOrder || 0,
  });
});

app.delete("/api/products/:productId/images/:imageId", async (req, res) => {
  await run("DELETE FROM product_images WHERE id = ? AND productId = ?", [
    req.params.imageId,
    req.params.productId,
  ]);
  res.json({ success: true });
});

/* ── CONTACT INFO ── */
app.get("/api/contact", async (req, res) => {
  const info = await get("SELECT * FROM contact_info WHERE id = 1");
  res.json(info || {});
});

app.put("/api/contact", async (req, res) => {
  const { address, phone, email, mapUrl, facebook, instagram, youtube } =
    req.body;
  const existing = await get("SELECT id FROM contact_info WHERE id = 1");
  if (existing) {
    await run(
      "UPDATE contact_info SET address = ?, phone = ?, email = ?, mapUrl = ?, facebook = ?, instagram = ?, youtube = ? WHERE id = 1",
      [address, phone, email, mapUrl, facebook, instagram, youtube],
    );
  } else {
    await run(
      "INSERT INTO contact_info (id, address, phone, email, mapUrl, facebook, instagram, youtube) VALUES (1, ?, ?, ?, ?, ?, ?, ?)",
      [address, phone, email, mapUrl, facebook, instagram, youtube],
    );
  }
  res.json({ address, phone, email, mapUrl, facebook, instagram, youtube });
});

app.get("*", (req, res) => {
  if (req.path.startsWith("/api")) {
    return res.status(404).json({ error: "API endpoint not found" });
  }
  res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Backend running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to initialize database:", err);
    process.exit(1);
  });
