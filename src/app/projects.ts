import { PixelEngine } from './pixel-engine';

export interface ProjectMeta {
  id: string;
  name: string;
  updatedAt: number;
  thumbnail: string; // data URL of first frame at 32px
}

export interface ProjectData {
  meta: ProjectMeta;
  state: any; // serialized PixelEngine state
}

const PROJECTS_KEY = 'pixatron-projects';
const ACTIVE_KEY   = 'pixatron-active-project';

// ── helpers ──────────────────────────────────────────────────────────────────

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function makeThumbnail(engine: PixelEngine): string {
  const { gridSize, cellFillColor, cellEmptyColor, pageBg } = engine;
  const size = Math.min(32, gridSize);
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = pageBg || '#0a0a0a';
  ctx.fillRect(0, 0, size, size);
  const f = engine.frame;
  if (f) {
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        ctx.fillStyle = f[y]?.[x] ? (cellFillColor || '#fff') : (cellEmptyColor || '#1e1e1e');
        ctx.fillRect(x, y, 1, 1);
      }
  }
  return c.toDataURL('image/png');
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export function listProjects(): ProjectMeta[] {
  try {
    return JSON.parse(localStorage.getItem(PROJECTS_KEY) || '[]');
  } catch { return []; }
}

function saveProjectList(list: ProjectMeta[]) {
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(list));
}

export function getActiveProjectId(): string | null {
  return localStorage.getItem(ACTIVE_KEY);
}

export function setActiveProjectId(id: string) {
  localStorage.setItem(ACTIVE_KEY, id);
}

export function loadProjectState(id: string): any | null {
  try {
    const raw = localStorage.getItem('pixatron-project-' + id);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function saveProject(id: string, engine: PixelEngine, name: string) {
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
  localStorage.setItem('pixatron-project-' + id, JSON.stringify(state));

  const meta: ProjectMeta = {
    id, name, updatedAt: Date.now(),
    thumbnail: makeThumbnail(engine),
  };
  const list = listProjects();
  const idx = list.findIndex(p => p.id === id);
  if (idx >= 0) list[idx] = meta; else list.unshift(meta);
  saveProjectList(list);
  setActiveProjectId(id);
}

export function createProject(engine: PixelEngine, name: string): string {
  const id = uid();
  saveProject(id, engine, name);
  return id;
}

export function deleteProject(id: string) {
  localStorage.removeItem('pixatron-project-' + id);
  const list = listProjects().filter(p => p.id !== id);
  saveProjectList(list);
}

export function renameProject(id: string, name: string) {
  const list = listProjects();
  const p = list.find(p => p.id === id);
  if (p) { p.name = name; saveProjectList(list); }
}

export function duplicateProject(id: string, engine: PixelEngine): string {
  const list = listProjects();
  const src = list.find(p => p.id === id);
  const newId = uid();
  const name = (src?.name || 'Project') + ' copy';
  saveProject(newId, engine, name);
  return newId;
}
