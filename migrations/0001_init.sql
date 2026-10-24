-- IPCrawl Open — initial schema.
--
-- The runtime bootstraps this same schema idempotently on first access
-- (server/utils/schema.ts), so migrations are documentation/ops tooling rather
-- than a required deploy step. Apply with:
--   sqlite3 .data/ipcrawl.sqlite < migrations/0001_init.sql
--
-- One row per camera endpoint. `host` is intentionally internal-only and never
-- serialized by the public API; the catalogue exposes provider-attributed
-- metadata and a proxied frame instead.

CREATE TABLE IF NOT EXISTS cams (
  id              TEXT PRIMARY KEY,            -- sha1(source:external_id), first 16 hex chars
  source          TEXT NOT NULL,               -- curated | osm | tfl | digitraffic | windy
  source_name     TEXT NOT NULL,               -- human-readable provider label
  external_id     TEXT NOT NULL,               -- provider's own id
  title           TEXT NOT NULL,
  host            TEXT NOT NULL DEFAULT '',    -- internal only
  port            INTEGER,
  scheme          TEXT,
  kind            TEXT NOT NULL DEFAULT 'unknown', -- snapshot | mjpeg | hls | video | iframe | page
  protocol        TEXT,
  country         TEXT,
  country_code    TEXT,
  region          TEXT,
  city            TEXT,
  lat             REAL,
  lon             REAL,
  org             TEXT,
  vendor          TEXT,
  tags_json       TEXT NOT NULL DEFAULT '[]',
  image_url       TEXT,
  stream_url      TEXT,
  page_url        TEXT,
  attribution     TEXT,
  license         TEXT,
  status          TEXT NOT NULL DEFAULT 'unknown', -- live | offline | unknown | page
  http_status     INTEGER,
  probe_error     TEXT,
  last_probe_at   INTEGER,
  first_seen_at   INTEGER NOT NULL,
  last_seen_at    INTEGER NOT NULL,
  fav_count       INTEGER NOT NULL DEFAULT 0,
  active          INTEGER NOT NULL DEFAULT 1,
  is_demo         INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_cams_active ON cams(active, status);
CREATE INDEX IF NOT EXISTS idx_cams_country ON cams(active, country);
CREATE INDEX IF NOT EXISTS idx_cams_city ON cams(active, city);
CREATE INDEX IF NOT EXISTS idx_cams_vendor ON cams(active, vendor);
CREATE INDEX IF NOT EXISTS idx_cams_source ON cams(source, active);
CREATE INDEX IF NOT EXISTS idx_cams_fav ON cams(active, fav_count DESC, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_cams_recent ON cams(active, last_probe_at DESC, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_cams_geo ON cams(active, lat, lon);
CREATE INDEX IF NOT EXISTS idx_cams_firstseen ON cams(active, first_seen_at DESC);

CREATE TABLE IF NOT EXISTS cam_favorites (
  cam_id      TEXT NOT NULL,
  voter_hash  TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (cam_id, voter_hash)
);
CREATE INDEX IF NOT EXISTS idx_cam_favorites_voter ON cam_favorites(voter_hash);

CREATE TABLE IF NOT EXISTS sync_runs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at   TEXT NOT NULL,
  finished_at  TEXT,
  status       TEXT NOT NULL DEFAULT 'running',
  trigger      TEXT NOT NULL DEFAULT 'manual',
  summary_json TEXT,
  demo         INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sync_runs_started ON sync_runs(started_at DESC);

CREATE TABLE IF NOT EXISTS source_runs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id      INTEGER NOT NULL,
  source      TEXT NOT NULL,
  ok          INTEGER NOT NULL DEFAULT 0,
  fetched     INTEGER NOT NULL DEFAULT 0,
  inserted    INTEGER NOT NULL DEFAULT 0,
  updated     INTEGER NOT NULL DEFAULT 0,
  skipped     INTEGER NOT NULL DEFAULT 0,
  probed      INTEGER NOT NULL DEFAULT 0,
  live        INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  error       TEXT,
  at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_source_runs_source ON source_runs(source, id DESC);
CREATE INDEX IF NOT EXISTS idx_source_runs_run ON source_runs(run_id);

CREATE TABLE IF NOT EXISTS cam_count_snapshots (
  ts    INTEGER PRIMARY KEY,
  total INTEGER NOT NULL,
  live  INTEGER NOT NULL DEFAULT 0,
  demo  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
