export type Tool = 'pencil' | 'rectangle' | 'line' | 'circle' | 'fill';
export type CellShape = 'square' | 'circle' | 'triangle' | 'stripes' | 'd-stripes';

// Variant cycles: clicking a selected shape cycles its variant
export const SHAPE_VARIANTS: Record<CellShape, string[]> = {
  'square':   ['square'],
  'circle':   ['circle'],
  'triangle': ['tri-up', 'tri-down', 'tri-left', 'tri-right'],
  'stripes':  ['h-stripes', 'v-stripes'],
  'd-stripes':['d-stripes-tl', 'd-stripes-tr'],
};

export const TOOLS: Tool[] = ['pencil', 'rectangle', 'line', 'circle', 'fill'];
export const SHAPES: CellShape[] = ['square', 'circle', 'triangle', 'stripes', 'd-stripes'];
export const TOOL_LABELS: Record<Tool, string> = { pencil: 'PEN', rectangle: 'RECT', line: 'LINE', circle: 'CIRC', fill: 'FILL' };
export const SHAPE_LABELS: Record<CellShape, string> = { square: '■', circle: '●', triangle: '▲', stripes: '☰', 'd-stripes': '///' };
export const VARIANT_LABELS: Record<string, string> = {
  'square': '■', 'circle': '●',
  'tri-up': '▲', 'tri-down': '▼', 'tri-left': '◀', 'tri-right': '▶',
  'h-stripes': '☰', 'v-stripes': '|||',
  'd-stripes-tl': '╲╲', 'd-stripes-tr': '╱╱',
};

const STORAGE_KEY = 'pixatron-state';
const CANVAS_SIZE = 480;
const MAX_UNDO = 50;

export class PixelEngine {
  frames: boolean[][][] = [];
  currentFrame = 0;
  gridSize = 16;
  gap = 1;
  fps = 8;
  isPlaying = false;
  activeTool: Tool = 'pencil';
  cellShape: CellShape = 'square';
  cellVariant: string = 'square'; // active variant within the shape
  onionSkin = false;
  onionSkinOpacity = 30;

  // app background
  pageBg = '#0a0a0a';

  // canvas colors
  cellFillColor = '#ffffff';
  cellEmptyColor = '#1e1e1e';

  // export settings
  exportFilledColor = '#ffffff';
  exportFilledTransparent = false;
  exportEmptyColor = '#0e0e0e';
  exportEmptyTransparent = false;
  exportGapColor = '#0e0e0e';
  exportGapTransparent = false;
  exportLoop = true;
  exportScale = 4; // multiplier: 1×, 2×, 4×, 8×, 16× (1 = actual pixel size)

  // drawing state
  isDrawing = false;
  drawStart = { x: 0, y: 0 };
  drawEnd = { x: 0, y: 0 };
  pencilMode = true;

  // undo/redo stacks — each entry is a snapshot of frames + currentFrame
  private undoStack: Array<{ frames: boolean[][][], currentFrame: number }> = [];
  private redoStack: Array<{ frames: boolean[][][], currentFrame: number }> = [];

  get canvasSize() { return CANVAS_SIZE; }
  get pixelSize() { return Math.max(4, Math.floor((CANVAS_SIZE - this.gap) / this.gridSize)); }
  get frame() { return this.frames[this.currentFrame]; }
  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }

  constructor() {
    this.load();
    if (!this.frames.length) this.frames = [this.emptyFrame()];
  }

  emptyFrame(): boolean[][] {
    return Array.from({ length: this.gridSize }, () => Array(this.gridSize).fill(false));
  }

  private cloneFrames(): boolean[][][] {
    return this.frames.map(f => f.map(r => [...r]));
  }

  pushUndo() {
    this.undoStack.push({ frames: this.cloneFrames(), currentFrame: this.currentFrame });
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
    this.redoStack = [];
  }

  undo() {
    if (!this.undoStack.length) return;
    this.redoStack.push({ frames: this.cloneFrames(), currentFrame: this.currentFrame });
    const s = this.undoStack.pop()!;
    this.frames = s.frames;
    this.currentFrame = s.currentFrame;
    this.save();
  }

  redo() {
    if (!this.redoStack.length) return;
    this.undoStack.push({ frames: this.cloneFrames(), currentFrame: this.currentFrame });
    const s = this.redoStack.pop()!;
    this.frames = s.frames;
    this.currentFrame = s.currentFrame;
    this.save();
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

  drawDiagonalStripes(p: any, ox: number, oy: number, size: number) {
    const ctx = p.drawingContext as CanvasRenderingContext2D;
    const fillColor = (p as any)._renderer.states?.fillColor ?? '#fff';
    ctx.save();
    ctx.beginPath(); ctx.rect(ox, oy, size, size); ctx.clip();
    ctx.strokeStyle = fillColor;
    ctx.lineWidth = 1;
    for (let i = -size; i < size * 2; i += 4) {
      ctx.beginPath(); ctx.moveTo(ox + i, oy); ctx.lineTo(ox + i + size, oy + size); ctx.stroke();
    }
    ctx.restore();
  }

  // ── Frame ops ──
  addFrame() { this.pushUndo(); this.frames.splice(this.currentFrame + 1, 0, this.emptyFrame()); this.currentFrame++; this.save(); }
  copyFrame() { this.pushUndo(); this.frames.splice(this.currentFrame + 1, 0, this.frame.map(r => [...r])); this.currentFrame++; this.save(); }
  deleteFrame() { if (this.frames.length <= 1) return; this.pushUndo(); this.frames.splice(this.currentFrame, 1); if (this.currentFrame >= this.frames.length) this.currentFrame--; this.save(); }
  clearFrame() { this.pushUndo(); this.frames[this.currentFrame] = this.emptyFrame(); this.save(); }
  invertFrame() { this.pushUndo(); this.frames[this.currentFrame] = this.frame.map(r => r.map(v => !v)); this.save(); }

  movePixels(dx: number, dy: number) {
    this.pushUndo();
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

  reorderFrame(from: number, to: number) {
    if (from === to) return;
    this.pushUndo();
    const [frame] = this.frames.splice(from, 1);
    this.frames.splice(to, 0, frame);
    this.currentFrame = to;
    this.save();
  }

  insertFrameAt(index: number) {
    this.pushUndo();
    this.frames.splice(index, 0, this.emptyFrame());
    this.currentFrame = index;
    this.save();
  }

  goPrev() { this.currentFrame = (this.currentFrame - 1 + this.frames.length) % this.frames.length; }
  goNext() { this.currentFrame = (this.currentFrame + 1) % this.frames.length; }
  goNextOrCreate() { if (this.currentFrame >= this.frames.length - 1) this.addFrame(); else this.currentFrame++; }
  goFirst() { this.currentFrame = 0; }
  goLast() { this.currentFrame = this.frames.length - 1; }
  goNextLoop() { this.currentFrame = (this.currentFrame + 1) % this.frames.length; }

  cycleTool(dir: 1 | -1) {
    const i = TOOLS.indexOf(this.activeTool);
    this.activeTool = TOOLS[(i + dir + TOOLS.length) % TOOLS.length];
  }

  selectShape(shape: CellShape) {
    if (this.cellShape === shape) {
      // Already selected — cycle variant
      const variants = SHAPE_VARIANTS[shape];
      if (variants.length > 1) {
        const i = variants.indexOf(this.cellVariant);
        this.cellVariant = variants[(i + 1) % variants.length];
      }
    } else {
      this.cellShape = shape;
      this.cellVariant = SHAPE_VARIANTS[shape][0];
    }
    this.save();
  }

  // ── Export ──
  exportPNG(p: any): void {
    p.save('pixatron-frame-' + (this.currentFrame + 1) + '.png');
  }

  exportGIF(_frames: boolean[][][], _gridSize: number, _pixelSize: number): void {
    // placeholder — GIF export would require a GIF encoder library
    alert('GIF export coming soon!');
  }

  exportSpriteSheet(p5Instance: any): void {
    const ps = this.pixelSize;
    const cols = this.frames.length;
    const sheet = document.createElement('canvas');
    sheet.width = CANVAS_SIZE * cols;
    sheet.height = CANVAS_SIZE;
    const ctx = sheet.getContext('2d')!;
    // render each frame to sheet
    for (let fi = 0; fi < this.frames.length; fi++) {
      const f = this.frames[fi];
      ctx.fillStyle = '#000000';
      ctx.fillRect(fi * CANVAS_SIZE, 0, CANVAS_SIZE, CANVAS_SIZE);
      ctx.fillStyle = '#ffffff';
      for (let y = 0; y < this.gridSize; y++)
        for (let x = 0; x < this.gridSize; x++)
          if (f[y]?.[x]) {
            const size = ps - this.gap;
            ctx.fillRect(fi * CANVAS_SIZE + x * ps + this.gap / 2, y * ps + this.gap / 2, size, size);
          }
    }
    const a = document.createElement('a');
    a.href = sheet.toDataURL('image/png');
    a.download = 'pixatron-spritesheet.png';
    a.click();
  }

  // ── Mouse handlers ──
  onMouseDown(x: number, y: number) {
    if (x < 0 || x >= this.gridSize || y < 0 || y >= this.gridSize) return;
    if (this.activeTool === 'pencil') {
      this.pushUndo();
      this.pencilMode = !this.frame[y]?.[x];
      this.setPixel(x, y, this.pencilMode);
      this.save();
    } else if (this.activeTool === 'fill') {
      this.pushUndo();
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
    this.pushUndo();
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
        onionSkinOpacity: this.onionSkinOpacity,
        activeTool: this.activeTool, isPlaying: this.isPlaying, cellVariant: this.cellVariant,
        pageBg: this.pageBg,
        cellFillColor: this.cellFillColor,
        cellEmptyColor: this.cellEmptyColor,
        exportFilledColor: this.exportFilledColor,
        exportFilledTransparent: this.exportFilledTransparent,
        exportEmptyColor: this.exportEmptyColor,
        exportEmptyTransparent: this.exportEmptyTransparent,
        exportGapColor: this.exportGapColor,
        exportGapTransparent: this.exportGapTransparent,
        exportLoop: this.exportLoop,
        exportScale: this.exportScale,
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
      this.activeTool = d.activeTool || 'pencil';
      this.isPlaying = d.isPlaying || false;
      this.cellVariant = d.cellVariant || SHAPE_VARIANTS[this.cellShape as CellShape][0];
      this.pageBg = d.pageBg || '#0a0a0a';
      this.cellFillColor = d.cellFillColor || '#ffffff';
      this.cellEmptyColor = d.cellEmptyColor || '#1e1e1e';
      this.exportFilledColor = d.exportFilledColor || '#ffffff';
      this.exportFilledTransparent = d.exportFilledTransparent || false;
      this.exportEmptyColor = d.exportEmptyColor || '#0e0e0e';
      this.exportEmptyTransparent = d.exportEmptyTransparent || false;
      this.exportGapColor = d.exportGapColor || '#0e0e0e';
      this.exportGapTransparent = d.exportGapTransparent || false;
      this.exportLoop = d.exportLoop ?? true;
      this.exportScale = d.exportScale ?? 4;
    } catch { }
  }
}
