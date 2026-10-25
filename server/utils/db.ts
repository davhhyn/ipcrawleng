import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { COLUMN_BACKFILLS, SCHEMA_STATEMENTS } from './schema'

/**
 * Thin synchronous wrapper over node:sqlite.
 *
 * The whole catalogue is small (a few thousand rows), so synchronous queries
 * are both simpler and faster than a worker/async wrapper, and Nitro's event
 * loop is never blocked long enough to matter. `node:sqlite` is loaded via
 * `process.getBuiltinModule` so the app still boots (with a clear status
 * instead of a crash) on Node builds that don't ship the module.
 */

type SqlValue = string | number | bigint | null | Uint8Array

interface StatementSync {
  all(...params: unknown[]): Record<string, unknown>[]
  get(...params: unknown[]): Record<string, unknown> | undefined
  run(...params: unknown[]): { changes: number | bigint, lastInsertRowid: number | bigint }
}

interface DatabaseSync {
  prepare(sql: string): StatementSync
  exec(sql: string): void
  close(): void
}

interface SqliteModule {
  DatabaseSync: new (path: string) => DatabaseSync
}

interface NodeProcessWithBuiltins {
  getBuiltinModule?: (id: string) => unknown
}

let cachedDb: DatabaseSync | null = null
let loadError: string | null = null
let schemaReady = false

function loadSqlite(): SqliteModule {
  const proc = globalThis.process as unknown as NodeProcessWithBuiltins
  if (typeof proc?.getBuiltinModule !== 'function') {
    throw new Error('node:sqlite is unavailable — run Node 22.5+ (node:sqlite is built in).')
  }
  const mod = proc.getBuiltinModule('node:sqlite') as SqliteModule | undefined
  if (!mod?.DatabaseSync) {
    throw new Error('node:sqlite is unavailable in this Node build.')
  }
  return mod
}

function ensureSchema(db: DatabaseSync) {
  if (schemaReady) return

  for (const statement of SCHEMA_STATEMENTS) {
    db.exec(statement)
  }

  // Self-healing column additions for databases created by older builds.
  for (const backfill of COLUMN_BACKFILLS) {
    try {
      db.exec(backfill.ddl)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!/duplicate column name/i.test(message)) throw error
    }
  }

  db.exec('PRAGMA user_version = 1')
  schemaReady = true
}

export function getDb(): DatabaseSync {
  if (cachedDb) return cachedDb
  if (loadError) throw new Error(loadError)

  try {
    const sqlite = loadSqlite()
    const config = useRuntimeConfig()
    const dbPath = resolve(String(config.dbPath || './.data/ipcrawl.sqlite'))
    mkdirSync(dirname(dbPath), { recursive: true })

    const db = new sqlite.DatabaseSync(dbPath)
    db.exec('PRAGMA journal_mode = WAL')
    db.exec('PRAGMA synchronous = NORMAL')
    db.exec('PRAGMA busy_timeout = 5000')
    db.exec('PRAGMA temp_store = MEMORY')
    ensureSchema(db)
    cachedDb = db
    return db
  } catch (error) {
    loadError = error instanceof Error ? error.message : String(error)
    throw new Error(loadError)
  }
}

export function isDatabaseAvailable(): boolean {
  try {
    getDb()
    return true
  } catch {
    return false
  }
}

export function databaseError(): string | null {
  if (cachedDb) return null
  try {
    getDb()
    return null
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

function clean(params: unknown[]): SqlValue[] {
  return params.map((value) => {
    if (value === undefined || value === null) return null
    if (typeof value === 'boolean') return value ? 1 : 0
    if (value instanceof Date) return value.toISOString()
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') return value
    if (value instanceof Uint8Array) return value
    return JSON.stringify(value)
  })
}

export function all<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
  return getDb().prepare(sql).all(...clean(params)) as T[]
}

export function one<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T | null {
  const row = getDb().prepare(sql).get(...clean(params))
  return (row as T | undefined) ?? null
}

export function run(sql: string, params: unknown[] = []): { changes: number, lastInsertRowid: number } {
  const result = getDb().prepare(sql).run(...clean(params))
  return {
    changes: Number(result.changes),
    lastInsertRowid: Number(result.lastInsertRowid)
  }
}

export function exec(sql: string): void {
  getDb().exec(sql)
}

/** Run a unit of work inside a transaction; rolls back on throw. */
export function transaction<T>(work: () => T): T {
  const db = getDb()
  db.exec('BEGIN')
  try {
    const result = work()
    db.exec('COMMIT')
    return result
  } catch (error) {
    try {
      db.exec('ROLLBACK')
    } catch {
      // The original error is more useful than a rollback failure.
    }
    throw error
  }
}

export function getMeta(key: string): string | null {
  const row = one<{ value: string }>('SELECT value FROM meta WHERE key = ?', [key])
  return row?.value ?? null
}

export function setMeta(key: string, value: string): void {
  run(
    `INSERT INTO meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value]
  )
}
