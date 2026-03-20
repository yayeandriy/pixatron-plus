import { Component, ElementRef, HostListener, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PixelEngine, TOOLS, SHAPES, TOOL_LABELS, SHAPE_LABELS, type Tool, type CellShape } from './pixel-engine';
import { createSketch } from './p5-sketch';

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

  @ViewChild('canvasContainer', { static: true }) canvasRef!: ElementRef<HTMLDivElement>;

  ngOnInit() {
    import('p5').then(p5Module => {
      const P5 = p5Module.default;
      new P5(createSketch(this.E), this.canvasRef.nativeElement);
    });
  }

  @HostListener('window:keydown', ['$event'])
  onKey(e: KeyboardEvent) {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    e.preventDefault();
    const k = e.code;
    if (k === 'Space') this.E.isPlaying = !this.E.isPlaying;
    else if (k === 'ArrowLeft' || k === 'KeyA') this.E.goPrev();
    else if (k === 'ArrowRight' || k === 'KeyD') this.E.goNext();
    else if (k === 'KeyW') { this.E.onionSkin = !this.E.onionSkin; this.E.save(); }
    else if (k === 'KeyE') this.E.cycleTool(1);
    else if (k === 'KeyQ') this.E.cycleTool(-1);
    else if (k === 'Delete' || k === 'Backspace') this.E.deleteFrame();
  }

  setGrid(e: Event) { this.E.gridSize = +(e.target as HTMLInputElement).value; this.E.save(); }
  setGap(e: Event) { this.E.gap = +(e.target as HTMLInputElement).value; this.E.save(); }
  setFps(e: Event) { this.E.fps = +(e.target as HTMLInputElement).value; this.E.save(); }
  setOpacity(e: Event) { this.E.onionSkinOpacity = +(e.target as HTMLInputElement).value; this.E.save(); }
  toggleOnion() { this.E.onionSkin = !this.E.onionSkin; this.E.save(); }
  setTool(t: Tool) { this.E.activeTool = t; }
  setShape(s: CellShape) { this.E.cellShape = s; this.E.save(); }
  selectFrame(i: number) { this.E.currentFrame = i; }
}
