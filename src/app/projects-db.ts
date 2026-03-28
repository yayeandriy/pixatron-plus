/**
 * Async project storage backed by SQLite (via tauri-plugin-sql) when running
 * inside Tauri, with automatic fallback to localStorage in the browser.
 *
 * All public functions are async so callers are the same regardless of the
 * storage backend.
 */

import { PixelEngine } from './pixel-engine';
import { makeThumbnail } from './projects';

export type { ProjectMeta } from './projects';
import type { ProjectMeta } from './projects';

// ── Tauri environment detection ───────────────────────────────────────────────

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

// ── SQLite layer (Tauri only) ─────────────────────────────────────────────────

let _db: any = null;

async function getDb(): Promise<any> {
  if (_db) return _db;
  const { default: Database } = await import('@tauri-apps/plugin-sql');
  _db = await Database.load('sqlite:pixatron.db');

  await _db.execute(`
    CREATE TABLE IF NOT EXISTS projects (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      thumbnail  TEXT NOT NULL
    )
  `);
  await _db.execute(`
    CREATE TABLE IF NOT EXISTS project_states (
      id    TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
      state TEXT NOT NULL
    )
  `);
  await _db.execute(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  return _db;
}

// ── localStorage fallback helpers ────────────────────────────────────────────

const LS_PROJECTS_KEY = 'pixatron-projects';
const LS_ACTIVE_KEY   = 'pixatron-active-project';

function lsListProjects(): ProjectMeta[] {
  try { return JSON.parse(localStorage.getItem(LS_PROJECTS_KEY) || '[]'); }
  catch { return []; }
}
function lsSaveList(list: ProjectMeta[]) {
  localStorage.setItem(LS_PROJECTS_KEY, JSON.stringify(list));
}
function lsLoadState(id: string): any | null {
  try {
    const raw = localStorage.getItem('pixatron-project-' + id);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function dbListProjects(): Promise<ProjectMeta[]> {
  if (!isTauri()) return lsListProjects();
  const db = await getDb();
  const rows: { id: string; name: string; updated_at: number; thumbnail: string }[] =
    await db.select('SELECT id, name, updated_at, thumbnail FROM projects ORDER BY updated_at DESC');
  return rows.map(r => ({ id: r.id, name: r.name, updatedAt: r.updated_at, thumbnail: r.thumbnail }));
}

export async function dbGetActiveProjectId(): Promise<string | null> {
  if (!isTauri()) return localStorage.getItem(LS_ACTIVE_KEY);
  const db = await getDb();
  const rows: { value: string }[] =
    await db.select("SELECT value FROM settings WHERE key = 'active_project'");
  return rows[0]?.value ?? null;
}

export async function dbSetActiveProjectId(id: string): Promise<void> {
  if (!isTauri()) { localStorage.setItem(LS_ACTIVE_KEY, id); return; }
  const db = await getDb();
  await db.execute(
    "INSERT INTO settings (key, value) VALUES ('active_project', $1) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [id],
  );
}

export async function dbLoadProjectState(id: string): Promise<any | null> {
  if (!isTauri()) return lsLoadState(id);
  const db = await getDb();
  const rows: { state: string }[] =
    await db.select('SELECT state FROM project_states WHERE id = $1', [id]);
  if (!rows[0]) return null;
  try { return JSON.parse(rows[0].state); } catch { return null; }
}

export async function dbSaveProject(id: string, engine: PixelEngine, name: string): Promise<void> {
  const state = {
    frames: engine.frames, currentFrame: engine.currentFrame,
    gridSize: engine.gridSize, gap: engine.gap, fps: engine.fps,
    cellShape: engine.cellShape, cellVariant: engine.cellVariant,
    onionSkin: engine.onionSkin, onionSkinOpacity: engine.onionSkinOpacity,
    activeTool: engine.activeTool, isPlaying: engine.isPlaying,
    pageBg: engine.pageBg, cellFillColor: engine.cellFillColor, cellEmptyColor: engine.cellEmptyColor,
    exportFilledColor: engine.exportFilledColor, exportFilledTransparent: engine.exportFilledTransparent,
    exportEmptyColor: engine.exportEmptyColor, exportEmptyTransparent: engine.exportEmptyTransparent,
    exportGapColor: engine.exportGapColor, exportGapTransparent: engine.exportGapTransparent,
    exportLoop: engine.exportLoop, exportScale: engine.exportScale,
  };
  const thumbnail = makeThumbnail(engine);
  const updatedAt = Date.now();

  if (!isTauri()) {
    localStorage.setItem('pixatron-project-' + id, JSON.stringify(state));
    const list = lsListProjects();
    const meta: ProjectMeta = { id, name, updatedAt, thumbnail };
    const idx = list.findIndex(p => p.id === id);
    if (idx >= 0) list[idx] = meta; else list.unshift(meta);
    lsSaveList(list);
    localStorage.setItem(LS_ACTIVE_KEY, id);
    return;
  }

  const db = await getDb();
  await db.execute(
    `INSERT INTO projects (id, name, updated_at, thumbnail)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at, thumbnail = excluded.thumbnail`,
    [id, name, updatedAt, thumbnail],
  );
  await db.execute(
    `INSERT INTO project_states (id, state)
     VALUES ($1, $2)
     ON CONFLICT(id) DO UPDATE SET state = excluded.state`,
    [id, JSON.stringify(state)],
  );
  await dbSetActiveProjectId(id);
}

export async function dbCreateProject(engine: PixelEngine, name: string): Promise<string> {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  await dbSaveProject(id, engine, name);
  return id;
}

export async function dbDeleteProject(id: string): Promise<void> {
  if (!isTauri()) {
    localStorage.removeItem('pixatron-project-' + id);
    lsSaveList(lsListProjects().filter(p => p.id !== id));
    return;
  }
  const db = await getDb();
  // ON DELETE CASCADE removes the project_states row too.
  await db.execute('DELETE FROM projects WHERE id = $1', [id]);
}

export async function dbRenameProject(id: string, name: string): Promise<void> {
  if (!isTauri()) {
    const list = lsListProjects();
    const p = list.find(p => p.id === id);
    if (p) { p.name = name; lsSaveList(list); }
    return;
  }
  const db = await getDb();
  await db.execute('UPDATE projects SET name = $1 WHERE id = $2', [name, id]);
}

export async function dbDuplicateProject(id: string, engine: PixelEngine): Promise<string> {
  const list = await dbListProjects();
  const src = list.find(p => p.id === id);
  const name = (src?.name || 'Project') + ' copy';
  return dbCreateProject(engine, name);
}

/** Migrate any existing localStorage data into SQLite on first Tauri launch. */
export async function migrateLocalStorageToSQLite(): Promise<void> {
  if (!isTauri()) return;
  const db = await getDb();
  const rows: { value: string }[] =
    await db.select("SELECT value FROM settings WHERE key = 'ls_migrated'");
  if (rows[0]?.value === '1') return; // already done

  const lsProjects = lsListProjects();
  for (const meta of lsProjects) {
    const state = lsLoadState(meta.id);
    if (!state) continue;
    // Write directly rather than re-computing thumbnail (use stored one).
    await db.execute(
      `INSERT OR IGNORE INTO projects (id, name, updated_at, thumbnail) VALUES ($1, $2, $3, $4)`,
      [meta.id, meta.name, meta.updatedAt, meta.thumbnail],
    );
    await db.execute(
      `INSERT OR IGNORE INTO project_states (id, state) VALUES ($1, $2)`,
      [meta.id, JSON.stringify(state)],
    );
  }

  const activeId = localStorage.getItem(LS_ACTIVE_KEY);
  if (activeId) {
    await db.execute(
      "INSERT INTO settings (key, value) VALUES ('active_project', $1) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      [activeId],
    );
  }

  await db.execute(
    "INSERT INTO settings (key, value) VALUES ('ls_migrated', '1') ON CONFLICT(key) DO UPDATE SET value = '1'",
  );
}
