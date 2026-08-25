module.exports = `
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY,
  data TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  nameBn TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'kg',
  costPrice REAL NOT NULL DEFAULT 0,
  sellPrice REAL NOT NULL DEFAULT 0,
  marketPrice REAL NOT NULL DEFAULT 0,
  stockQty REAL NOT NULL DEFAULT 0,
  reorderLevel REAL NOT NULL DEFAULT 0,
  isActive INTEGER NOT NULL DEFAULT 1,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  area TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  lat REAL,
  lng REAL,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS riders (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  vehicle TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  orderNo TEXT NOT NULL UNIQUE,
  date TEXT NOT NULL,
  customerId INTEGER,
  customerName TEXT NOT NULL DEFAULT '',
  customerPhone TEXT NOT NULL DEFAULT '',
  area TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  items TEXT NOT NULL DEFAULT '[]',
  subtotal REAL NOT NULL DEFAULT 0,
  deliveryFee REAL NOT NULL DEFAULT 0,
  discount REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  paid REAL NOT NULL DEFAULT 0,
  paymentMethod TEXT NOT NULL DEFAULT 'cod',
  status TEXT NOT NULL DEFAULT 'new',
  source TEXT NOT NULL DEFAULT 'manual',
  deliveryMode TEXT NOT NULL DEFAULT 'own',
  pathaoTrackingId TEXT NOT NULL DEFAULT '',
  pathaoFare REAL NOT NULL DEFAULT 0,
  riderId INTEGER,
  riderCost REAL NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  createdAt TEXT NOT NULL,
  confirmedAt TEXT NOT NULL DEFAULT '',
  deliveredAt TEXT NOT NULL DEFAULT '',
  cancelledAt TEXT NOT NULL DEFAULT '',
  cancelReason TEXT NOT NULL DEFAULT '',
  updatedAt TEXT NOT NULL,
  stockDeducted INTEGER NOT NULL DEFAULT 1,
  wpOrderId TEXT NOT NULL DEFAULT '',
  lat REAL,
  lng REAL,
  riderSeq INTEGER
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id INTEGER PRIMARY KEY,
  productId INTEGER NOT NULL,
  type TEXT NOT NULL,
  qty REAL NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  contact TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  paymentTerms TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  isActive INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id INTEGER PRIMARY KEY,
  poNumber TEXT NOT NULL UNIQUE,
  date TEXT NOT NULL,
  supplierId INTEGER NOT NULL,
  items TEXT NOT NULL DEFAULT '[]',
  subtotal REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  expectedDate TEXT NOT NULL DEFAULT '',
  receivedDate TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS next_ids (
  name TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS area_centroids (
  area TEXT PRIMARY KEY,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  zone TEXT
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customerId);
CREATE INDEX IF NOT EXISTS idx_orders_rider ON orders(riderId);
CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(date);
CREATE INDEX IF NOT EXISTS idx_orders_rider_seq ON orders(riderId, riderSeq);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(isActive);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_stock_product ON stock_movements(productId);
CREATE INDEX IF NOT EXISTS idx_po_supplier ON purchase_orders(supplierId);
CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status);
`;