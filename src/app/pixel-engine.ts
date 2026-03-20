export type Tool = 'pencil' | 'rectangle' | 'line' | 'circle' | 'fill';
export type CellShape = 'square' | 'circle' | 'triangle' | 'h-stripes' | 'v-stripes' | 'd-stripes';

export const TOOLS: Tool[] = ['pencil', 'rectangle', 'line', 'circle', 'fill'];
export const SHAPES: CellShape[] = ['square', 'circle', 'triangle', 'h-stripes', 'v-stripes', 'd-stripes'];
export const TOOL_LABELS: Record<Tool, string> = { pencil: 'PEN', rectangle: 'RECT', line: 'LINE', circle: 'CIRC', fill: 'FILL' };
export const SHAPE_LABELS: Record<CellShape, string> = { square: '■', circle: '●', triangle: '▲', 'h-stripes': '☰', 'v-stripes': '|||', 'd-stripes': '///' };

const STORAGE_KEY = 'pixatron-state';
const CANVAS_SIZE = 480;

export class PixelEngine {
  frames: boolean[][][] = [];
  currentFrame = 0;
  gridSize = 16;
  gap = 1;
  fps = 8;
  isPlaying = false;
  activeTool: Tool = 'pencil';
  cellShape: CellShape = 'square';
  onionSkin = false;
  onionSkinOpacity = 30;

  // drawing state
  isDrawing = false;
  drawStart = { x: 0, y: 0 };
  drawEnd = { x: 0, y: 0 };
  pencilMode = true;

  get canvasSize() { return CANVAS_SIZE; }
  get pixelSize() { return Math.max(4, Math.floor((CANVAS_SIZE - this.gap) / this.gridSize)); }
  get frame() { return this.frames[this.currentFrame]; }

  constructor() {
    this.load();
    if (!this.frames.length) this.frames = [this.emptyFrame()];
  }

  emptyFrame(): boolean[][] {
    return Array.from({ length: this.gridSize }, () => Array(this.gridSize).fill(false));
  }

  // ── Pixel ops ──
  setPixel(x: number, y: number, val: boolean) {
    const f = this.frame;
    if (f?.[y] !== undefined && x >= 0 && x < this.gridSize && y >= 0 && y < this.gridSize)
      f[y][x] = val;
  }

  floodFill(x: number, y: number) {
    const f = this.frame; if (!f) return;
    const target = f[y]?.[x]; if (target) return;
    const stack: [number, number][] = [[x, y]];
    const seen = new Set<string>();
    while (stack.length) {
      const [cx, cy] = stack.pop()!;
      const k = `${cx},${cy}`;
      if (seen.has(k) || cx < 0 || cx >= this.gridSize || cy < 0 || cy >= this.gridSize) continue;
      if (f[cy][cx] !== target) continue;
      seen.add(k); f[cy][cx] = true;
      stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
  }

  drawLine(x1: number, y1: number, x2: number, y2: number) {
    const dx = Math.abs(x2 - x1), dy = Math.abs(y2 - y1), sx = x1 < x2 ? 1 : -1, sy = y1 < y2 ? 1 : -1;
    let err = dx - dy;
    while (true) {
      this.setPixel(x1, y1, true);
      if (x1 === x2 && y1 === y2) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x1 += sx; }
      if (e2 < dx) { err += dx; y1 += sy; }
    }
  }

  drawRect(x1: number, y1: number, x2: number, y2: number) {
    const [mnX, mxX] = [Math.min(x1, x2), Math.max(x1, x2)];
    const [mnY, mxY] = [Math.min(y1, y2), Math.max(y1, y2)];
    for (let y = mnY; y <= mxY; y++) { this.setPixel(mnX, y, true); this.setPixel(mxX, y, true); }
    for (let x = mnX; x <= mxX; x++) { this.setPixel(x, mnY, true); this.setPixel(x, mxY, true); }
  }

  drawCircle(cx: number, cy: number, r: number) {
    let x = r, y = 0, err = 0;
    while (x >= y) {
      [[cx+x,cy+y],[cx+y,cy+x],[cx-y,cy+x],[cx-x,cy+y],
       [cx-x,cy-y],[cx-y,cy-x],[cx+y,cy-x],[cx+x,cy-y]]
      .forEach(([px, py]) => this.setPixel(px, py, true));
      if (err <= 0) { y++; err += 2 * y + 1; }
      if (err > 0) { x--; err -= 2 * x + 1; }
    }
  }

  // ── Frame ops ──
  addFrame() { this.frames.splice(this.currentFrame + 1, 0, this.emptyFrame()); this.currentFrame++; this.save(); }
  copyFrame() { this.frames.splice(this.currentFrame + 1, 0, this.frame.map(r => [...r])); this.currentFrame++; this.save(); }
  deleteFrame() { if (this.frames.length <= 1) return; this.frames.splice(this.currentFrame, 1); if (this.currentFrame >= this.frames.length) this.currentFrame--; this.save(); }
  clearFrame() { this.frames[this.currentFrame] = this.emptyFrame(); this.save(); }
  invertFrame() { this.frames[this.currentFrame] = this.frame.map(r => r.map(v => !v)); this.save(); }

  movePixels(dx: number, dy: number) {
    const f = this.frame, nf = this.emptyFrame();
    for (let y = 0; y < this.gridSize; y++)
      for (let x = 0; x < this.gridSize; x++)
        if (f[y]?.[x]) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < this.gridSize && ny >= 0 && ny < this.gridSize) nf[ny][nx] = true;
        }
    this.frames[this.currentFrame] = nf;
    this.save();
  }

  goPrev() { if (this.currentFrame > 0) this.currentFrame--; }
  goNext() { if (this.currentFrame >= this.frames.length - 1) this.addFrame(); else this.currentFrame++; }
  goNextLoop() { this.currentFrame = (this.currentFrame + 1) % this.frames.length; }

  cycleTool(dir: 1 | -1) {
    const i = TOOLS.indexOf(this.activeTool);
    this.activeTool = TOOLS[(i + dir + TOOLS.length) % TOOLS.length];
  }

  // ── Mouse handlers (called by p5) ──
  onMouseDown(x: number, y: number) {
    if (x < 0 || x >= this.gridSize || y < 0 || y >= this.gridSize) return;
    if (this.activeTool === 'pencil') {
      this.pencilMode = !this.frame[y]?.[x];
      this.setPixel(x, y, this.pencilMode);
      this.save();
    } else if (this.activeTool === 'fill') {
      this.floodFill(x, y);
      this.save();
    } else {
      this.isDrawing = true;
      this.drawStart = { x, y };
      this.drawEnd = { x, y };
    }
  }

  onMouseDrag(x: number, y: number) {
    if (x < 0 || x >= this.gridSize || y < 0 || y >= this.gridSize) return;
    if (this.activeTool === 'pencil') {
      if (this.frame[y]?.[x] !== this.pencilMode) {
        this.setPixel(x, y, this.pencilMode);
        this.save();
      }
    } else if (this.isDrawing) {
      this.drawEnd = { x, y };
    }
  }

  onMouseUp() {
    if (!this.isDrawing) return;
    const { x: x1, y: y1 } = this.drawStart, { x: x2, y: y2 } = this.drawEnd;
    if (this.activeTool === 'rectangle') this.drawRect(x1, y1, x2, y2);
    else if (this.activeTool === 'line') this.drawLine(x1, y1, x2, y2);
    else if (this.activeTool === 'circle') this.drawCircle(x1, y1, Math.round(Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)));
    this.isDrawing = false;
    this.save();
  }

  // ── Persistence ──
  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        frames: this.frames, currentFrame: this.currentFrame,
        gridSize: this.gridSize, gap: this.gap, fps: this.fps,
        cellShape: this.cellShape, onionSkin: this.onionSkin,
        onionSkinOpacity: this.onionSkinOpacity
      }));
    } catch { }
  }

  load() {
    try {
      const d = JSON.parse(localStorage.getItem(STORAGE_KEY) || '');
      if (!d) return;
      this.frames = d.frames || [];
      this.currentFrame = Math.min(d.currentFrame || 0, Math.max(0, (d.frames?.length || 1) - 1));
      this.gridSize = d.gridSize || 16;
      this.gap = d.gap ?? 1;
      this.fps = d.fps || 8;
      this.cellShape = d.cellShape || 'square';
      this.onionSkin = d.onionSkin || false;
      this.onionSkinOpacity = d.onionSkinOpacity || 30;
    } catch { }
  }
}
