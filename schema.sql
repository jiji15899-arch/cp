-- CloudPress D1 Database Schema

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS sites (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  subdomain TEXT UNIQUE NOT NULL,
  custom_domain TEXT,
  wp_url TEXT,
  wp_admin_url TEXT,
  wp_username TEXT,
  wp_password TEXT,
  instawp_site_id TEXT,
  status TEXT NOT NULL DEFAULT 'provisioning',
  php_version TEXT DEFAULT '8.2',
  region TEXT DEFAULT 'auto',
  plan TEXT NOT NULL DEFAULT 'free',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_sites_user ON sites(user_id);
CREATE INDEX IF NOT EXISTS idx_sites_subdomain ON sites(subdomain);
