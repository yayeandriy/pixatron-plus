import { Component, ElementRef, HostListener, OnInit, ViewChild, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PixelEngine, TOOLS, SHAPES, TOOL_LABELS, SHAPE_LABELS, type Tool, type CellShape } from './pixel-engine';
import { createSketch } from './p5-sketch';
import { exportPNG, exportSpriteSheet, exportSVG, exportGIF, exportVideo } from './exporter';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  E = new PixelEngine();
  TOOLS = TOOLS;
  SHAPES = SHAPES;
  TOOL_LABELS = TOOL_LABELS;
  SHAPE_LABELS = SHAPE_LABELS;

  private p5Instance: any = null;

  @ViewChild('canvasContainer', { static: true }) canvasRef!: ElementRef<HTMLDivElement>;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    import('p5').then(p5Module => {
      const P5 = p5Module.default;
      this.p5Instance = new P5(createSketch(this.E), this.canvasRef.nativeElement);
    });
  }

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    // Use key (not code) — works regardless of layout/shift
    const key = e.key;

    // Shift+Q = first frame, Shift+E = last frame
    if (key === 'Q') { this.E.goFirst(); }
    else if (key === 'E' && e.shiftKey) { this.E.goLast(); }
    // Regular Q/E = cycle tools (no shift)
    else if (key === 'q') { this.E.cycleTool(-1); }
    else if (key === 'e') { this.E.cycleTool(1); }
    else if (key === 'w' || key === 'W') { this.E.onionSkin = !this.E.onionSkin; this.E.save(); }
    else if (key === ' ') { this.E.isPlaying = !this.E.isPlaying; }
    else if (key === 'ArrowLeft' || key === 'a' || key === 'A') { this.E.goPrev(); }
    else if (key === 'ArrowRight' || key === 'd' || key === 'D') { this.E.goNext(); }
    else if (key === 'Delete' || key === 'Backspace') { this.E.deleteFrame(); }
    else if ((e.metaKey || e.ctrlKey) && key === 'z' && !e.shiftKey) { this.E.undo(); }
    else if ((e.metaKey || e.ctrlKey) && (key === 'y' || (key === 'z' && e.shiftKey))) { this.E.redo(); }
    else { return; }

    e.preventDefault();
    e.stopPropagation();
    this.cdr.detectChanges();
  }

  setGrid(e: Event) { this.E.gridSize = +(e.target as HTMLInputElement).value; this.E.save(); }
  setGap(e: Event) { this.E.gap = +(e.target as HTMLInputElement).value; this.E.save(); }
  setFps(e: Event) { this.E.fps = +(e.target as HTMLInputElement).value; this.E.save(); }
  setOpacity(e: Event) { this.E.onionSkinOpacity = +(e.target as HTMLInputElement).value; this.E.save(); }
  toggleOnion() { this.E.onionSkin = !this.E.onionSkin; this.E.save(); }
  setTool(t: Tool) { this.E.activeTool = t; }
  setShape(s: CellShape) { this.E.cellShape = s; this.E.save(); }
  selectFrame(i: number) { this.E.currentFrame = i; }

  exportOpen = false;
  exportStatus = '';

  openExport() { this.exportOpen = true; this.exportStatus = ''; }
  closeExport() { this.exportOpen = false; }

  async doExport(type: string) {
    this.exportStatus = 'Exporting…';
    try {
      switch (type) {
        case 'png':   exportPNG(this.E); break;
        case 'svg':   exportSVG(this.E); break;
        case 'sheet': exportSpriteSheet(this.E); break;
        case 'gif':   await exportGIF(this.E); break;
        case 'video': await exportVideo(this.E); break;
      }
      this.exportStatus = '✓ Done!';
      setTimeout(() => { this.exportStatus = ''; this.exportOpen = false; }, 1200);
    } catch (e: any) {
      this.exportStatus = '✗ Error: ' + (e?.message ?? e);
    }
  }
}
