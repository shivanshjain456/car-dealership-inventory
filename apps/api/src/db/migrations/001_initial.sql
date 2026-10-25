CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('customer', 'admin')),
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE vehicles (
  id TEXT PRIMARY KEY NOT NULL,
  make TEXT NOT NULL CHECK (length(trim(make)) BETWEEN 1 AND 80),
  model TEXT NOT NULL CHECK (length(trim(model)) BETWEEN 1 AND 80),
  category TEXT NOT NULL CHECK (length(trim(category)) BETWEEN 1 AND 80),
  price_minor INTEGER NOT NULL CHECK (price_minor BETWEEN 0 AND 9007199254740991),
  currency TEXT NOT NULL CHECK (currency GLOB '[A-Z][A-Z][A-Z]'),
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 0 AND 9007199254740991),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE INDEX idx_vehicles_currency_price ON vehicles (currency, price_minor);
CREATE INDEX idx_vehicles_make_nocase ON vehicles (make COLLATE NOCASE);
CREATE INDEX idx_vehicles_model_nocase ON vehicles (model COLLATE NOCASE);
CREATE INDEX idx_vehicles_category_nocase ON vehicles (category COLLATE NOCASE);
