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

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const k = e.code;
    const handled = true;
    switch (k) {
      case 'Space': this.E.isPlaying = !this.E.isPlaying; break;
      case 'ArrowLeft': case 'KeyA': this.E.goPrev(); break;
      case 'ArrowRight': case 'KeyD': this.E.goNext(); break;
      case 'KeyW': this.E.onionSkin = !this.E.onionSkin; this.E.save(); break;
      case 'KeyE': this.E.cycleTool(1); break;
      case 'KeyQ': this.E.cycleTool(-1); break;
      case 'Delete': case 'Backspace': this.E.deleteFrame(); break;
      default: return; // don't prevent default for unhandled keys
    }
    e.preventDefault();
    e.stopPropagation();
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
