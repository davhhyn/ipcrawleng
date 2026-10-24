/**
 * SQLite schema — the runtime source of truth. Mirrored for operators in
 * migrations/0001_init.sql. Every statement is idempotent so a fresh database
 * (and any older one) self-heals on boot.
 */
export const SCHEMA_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS cams (
    id              TEXT PRIMARY KEY,
    source          TEXT NOT NULL,
    source_name     TEXT NOT NULL,
    external_id     TEXT NOT NULL,
    title           TEXT NOT NULL,
    host            TEXT NOT NULL DEFAULT '',
    port            INTEGER,
    scheme          TEXT,
    kind            TEXT NOT NULL DEFAULT 'unknown',
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
    status          TEXT NOT NULL DEFAULT 'unknown',
    http_status     INTEGER,
    probe_error     TEXT,
    last_probe_at   INTEGER,
    first_seen_at   INTEGER NOT NULL,
    last_seen_at    INTEGER NOT NULL,
    fav_count       INTEGER NOT NULL DEFAULT 0,
    active          INTEGER NOT NULL DEFAULT 1,
    is_demo         INTEGER NOT NULL DEFAULT 0
  )`,

  'CREATE INDEX IF NOT EXISTS idx_cams_active ON cams(active, status)',
  'CREATE INDEX IF NOT EXISTS idx_cams_country ON cams(active, country)',
  'CREATE INDEX IF NOT EXISTS idx_cams_city ON cams(active, city)',
  'CREATE INDEX IF NOT EXISTS idx_cams_vendor ON cams(active, vendor)',
  'CREATE INDEX IF NOT EXISTS idx_cams_source ON cams(source, active)',
  'CREATE INDEX IF NOT EXISTS idx_cams_fav ON cams(active, fav_count DESC, last_seen_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_cams_recent ON cams(active, last_probe_at DESC, last_seen_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_cams_geo ON cams(active, lat, lon)',
  'CREATE INDEX IF NOT EXISTS idx_cams_firstseen ON cams(active, first_seen_at DESC)',

  `CREATE TABLE IF NOT EXISTS cam_favorites (
    cam_id      TEXT NOT NULL,
    voter_hash  TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    PRIMARY KEY (cam_id, voter_hash)
  )`,
  'CREATE INDEX IF NOT EXISTS idx_cam_favorites_voter ON cam_favorites(voter_hash)',

  `CREATE TABLE IF NOT EXISTS sync_runs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at   TEXT NOT NULL,
    finished_at  TEXT,
    status       TEXT NOT NULL DEFAULT 'running',
    trigger      TEXT NOT NULL DEFAULT 'manual',
    summary_json TEXT,
    demo         INTEGER NOT NULL DEFAULT 0
  )`,
  'CREATE INDEX IF NOT EXISTS idx_sync_runs_started ON sync_runs(started_at DESC)',

  `CREATE TABLE IF NOT EXISTS source_runs (
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
  )`,
  'CREATE INDEX IF NOT EXISTS idx_source_runs_source ON source_runs(source, id DESC)',
  'CREATE INDEX IF NOT EXISTS idx_source_runs_run ON source_runs(run_id)',

  `CREATE TABLE IF NOT EXISTS cam_count_snapshots (
    ts    INTEGER PRIMARY KEY,
    total INTEGER NOT NULL,
    live  INTEGER NOT NULL DEFAULT 0,
    demo  INTEGER NOT NULL DEFAULT 0
  )`,

  `CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`
]

/** Columns added after the first schema — applied only when missing. */
export const COLUMN_BACKFILLS: { table: string, column: string, ddl: string }[] = [
  { table: 'cams', column: 'region', ddl: 'ALTER TABLE cams ADD COLUMN region TEXT' },
  { table: 'cams', column: 'country_code', ddl: 'ALTER TABLE cams ADD COLUMN country_code TEXT' },
  { table: 'cams', column: 'protocol', ddl: 'ALTER TABLE cams ADD COLUMN protocol TEXT' },
  { table: 'cams', column: 'probe_error', ddl: 'ALTER TABLE cams ADD COLUMN probe_error TEXT' },
  { table: 'cams', column: 'is_demo', ddl: 'ALTER TABLE cams ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0' },
  { table: 'cams', column: 'active', ddl: 'ALTER TABLE cams ADD COLUMN active INTEGER NOT NULL DEFAULT 1' }
]
