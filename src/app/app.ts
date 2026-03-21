import { Component, ElementRef, HostListener, OnInit, OnDestroy, ViewChild, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PixelEngine, TOOLS, SHAPES, SHAPE_VARIANTS, TOOL_LABELS, SHAPE_LABELS, VARIANT_LABELS, type Tool, type CellShape } from './pixel-engine';
import { createSketch } from './p5-sketch';
import { exportPNG, exportSpriteSheet, exportSVG, exportGIF, exportVideo, exportHTML, exportGlyph, renderActualSize } from './exporter';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit, OnDestroy {
  E = new PixelEngine();
  TOOLS = TOOLS;
  SHAPES = SHAPES;
  SHAPE_VARIANTS = SHAPE_VARIANTS;
  TOOL_LABELS = TOOL_LABELS;
  SHAPE_LABELS = SHAPE_LABELS;
  VARIANT_LABELS = VARIANT_LABELS;

  private p5Instance: any = null;
  private previewTimer: any = null;

  // preview (inline, exact size, animated)
  showPreview = false;
  previewDataUrl = '';

  // drag/drop frames
  dragIndex: number | null = null;
  dragOverIndex: number | null = null;

  @ViewChild('canvasContainer', { static: true }) canvasRef!: ElementRef<HTMLDivElement>;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.applyPageBg();
    import('p5').then(p5Module => {
      const P5 = p5Module.default;
      this.p5Instance = new P5(createSketch(this.E), this.canvasRef.nativeElement);
    });
  }

  ngOnDestroy() {
    if (this.previewTimer) clearInterval(this.previewTimer);
  }

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const key = e.key;
    if (key === 'Q') { this.E.goFirst(); }
    else if (key === 'E' && e.shiftKey) { this.E.goLast(); }
    else if (key === 'q') { this.E.cycleTool(-1); }
    else if (key === 'e') { this.E.cycleTool(1); }
    else if (key === 'w' || key === 'W') { this.E.onionSkin = !this.E.onionSkin; this.E.save(); }
    else if (key === ' ') { this.E.isPlaying = !this.E.isPlaying; }
    else if (key === 'ArrowLeft' || key === 'a' || key === 'A') { this.E.goPrev(); }
    else if (key === 'ArrowRight' && e.shiftKey) { this.E.goNextOrCreate(); }
    else if (key === 'ArrowRight' || key === 'd' || key === 'D') { this.E.goNext(); }
    else if (key === 'Delete' || key === 'Backspace') { this.E.deleteFrame(); }
    else if ((e.metaKey || e.ctrlKey) && key === 'z' && !e.shiftKey) { this.E.undo(); e.preventDefault(); return; }
    else if ((e.metaKey || e.ctrlKey) && (key === 'y' || (key === 'z' && e.shiftKey))) { this.E.redo(); e.preventDefault(); return; }
    else if (e.key === 'F3') { this.openExport(); e.preventDefault(); return; }
    else if (e.key === 'F2') { this.togglePreview(); e.preventDefault(); return; }
    else { return; }
    e.preventDefault();
    this.cdr.detectChanges();
  }

  setCellFill(e: Event) { this.E.cellFillColor = (e.target as HTMLInputElement).value; this.E.save(); }
  setCellEmpty(e: Event) { this.E.cellEmptyColor = (e.target as HTMLInputElement).value; this.E.save(); }

  setPageBg(e: Event) {
    this.E.pageBg = (e.target as HTMLInputElement).value;
    this.applyPageBg();
    this.E.save();
  }

  applyPageBg() {
    const el = document.querySelector('.canvas-area') as HTMLElement;
    if (el) el.style.background = this.E.pageBg;
    document.documentElement.style.background = this.E.pageBg;
    document.body.style.background = this.E.pageBg;
  }

  setGrid(e: Event) { this.E.gridSize = +(e.target as HTMLInputElement).value; this.E.save(); }
  setGap(e: Event) { this.E.gap = +(e.target as HTMLInputElement).value; this.E.save(); }
  setFps(e: Event) { this.E.fps = +(e.target as HTMLInputElement).value; this.E.save(); this.restartPreviewAnim(); }
  setOpacity(e: Event) { this.E.onionSkinOpacity = +(e.target as HTMLInputElement).value; this.E.save(); }
  toggleOnion() { this.E.onionSkin = !this.E.onionSkin; this.E.save(); }
  setTool(t: Tool) { this.E.activeTool = t; }
  setShape(s: CellShape) { this.E.selectShape(s); }
  selectFrame(i: number) { this.E.currentFrame = i; if (this.showPreview) this.updatePreview(); }

  // ── Shape variant label ──
  activeVariantLabel(shape: CellShape): string {
    if (this.E.cellShape !== shape) return this.SHAPE_LABELS[shape];
    return this.VARIANT_LABELS[this.E.cellVariant] ?? this.SHAPE_LABELS[shape];
  }

  // ── Preview (inline, exact pixel size, animated) ──
  togglePreview() {
    this.showPreview = !this.showPreview;
    if (this.showPreview) {
      this.updatePreview();
      this.startPreviewAnim();
    } else {
      this.stopPreviewAnim();
    }
  }

  private previewFrameIndex = 0;

  updatePreview() {
    const idx = this.E.isPlaying || this.previewTimer
      ? this.previewFrameIndex
      : this.E.currentFrame;
    const c = renderActualSize(this.E, idx);
    this.previewDataUrl = c.toDataURL();
    this.cdr.detectChanges();
  }

  startPreviewAnim() {
    this.stopPreviewAnim();
    this.previewFrameIndex = this.E.currentFrame;
    this.previewTimer = setInterval(() => {
      this.previewFrameIndex = (this.previewFrameIndex + 1) % this.E.frames.length;
      this.updatePreview();
    }, 1000 / this.E.fps);
  }

  stopPreviewAnim() {
    if (this.previewTimer) { clearInterval(this.previewTimer); this.previewTimer = null; }
  }

  restartPreviewAnim() {
    if (this.showPreview) { this.startPreviewAnim(); }
  }

  // ── Drag/drop frames ──
  onFrameDragStart(e: DragEvent, i: number) {
    this.dragIndex = i;
    e.dataTransfer!.effectAllowed = 'move';
  }

  onFrameDragOver(e: DragEvent, i: number) {
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'move';
    this.dragOverIndex = i;
  }

  onFrameDrop(e: DragEvent, i: number) {
    e.preventDefault();
    if (this.dragIndex !== null && this.dragIndex !== i) {
      this.E.reorderFrame(this.dragIndex, i);
    }
    this.dragIndex = null;
    this.dragOverIndex = null;
  }

  onFrameDragEnd() {
    this.dragIndex = null;
    this.dragOverIndex = null;
  }

  insertBefore(i: number) {
    this.E.insertFrameAt(i);
  }

  // ── Export dialog ──
  exportOpen = false;
  exportStatus = '';
  openExport() { this.exportOpen = true; this.exportStatus = ''; this.E.blockInput = true; }
  closeExport() { this.exportOpen = false; this.E.blockInput = false; }

  async doExport(type: string) {
    this.exportStatus = 'Exporting…';
    this.cdr.detectChanges();
    try {
      switch (type) {
        case 'png':   exportPNG(this.E); break;
        case 'svg':   exportSVG(this.E); break;
        case 'sheet': exportSpriteSheet(this.E); break;
        case 'gif':   await exportGIF(this.E); break;
        case 'video': await exportVideo(this.E); break;
        case 'html':  exportHTML(this.E); break;
        case 'glyph': exportGlyph(this.E); break;
      }
      this.exportStatus = (type === 'glyph' || type === 'html') ? '✓ Copied to clipboard + downloaded' : '✓ Done!';
      setTimeout(() => { this.exportStatus = ''; this.exportOpen = false; this.E.blockInput = false; this.cdr.detectChanges(); }, 1500);
    } catch (err: any) {
      this.exportStatus = '✗ ' + (err?.message ?? err);
      this.cdr.detectChanges();
    }
  }
}
