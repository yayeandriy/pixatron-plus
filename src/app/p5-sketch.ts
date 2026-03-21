import type p5 from 'p5';
import { PixelEngine } from './pixel-engine';

export function createSketch(engine: PixelEngine) {
  return (p: p5) => {
    const E = engine;

    function ps() { return E.pixelSize; }

    function cell(x: number, y: number, alpha = 255) {
      const s = ps() - E.gap;
      const ox = x * ps() + E.gap / 2;
      const oy = y * ps() + E.gap / 2;
      const v = E.cellVariant;

      switch (v) {
        case 'square':    p.rect(ox, oy, s, s); break;
        case 'circle':    p.ellipse(ox + s/2, oy + s/2, s, s); break;
        case 'tri-up':    p.triangle(ox+s/2, oy, ox+s, oy+s, ox, oy+s); break;
        case 'tri-down':  p.triangle(ox, oy, ox+s, oy, ox+s/2, oy+s); break;
        case 'tri-left':  p.triangle(ox+s, oy, ox+s, oy+s, ox, oy+s/2); break;
        case 'tri-right': p.triangle(ox, oy, ox+s, oy+s/2, ox, oy+s); break;
        case 'h-stripes': for(let i=0;i<3;i++) p.rect(ox, oy+i*(s/3)+1, s, s/3-2); break;
        case 'v-stripes': for(let i=0;i<3;i++) p.rect(ox+i*(s/3)+1,  oy, s/3-2, s); break;
        case 'd-stripes-tl':
        case 'd-stripes-tr': {
          const ctx = (p as any).drawingContext as CanvasRenderingContext2D;
          const fc = (p as any)._renderer.states?.fillColor;
          ctx.save();
          ctx.beginPath(); ctx.rect(ox, oy, s, s); ctx.clip();
          ctx.strokeStyle = fc ? `rgba(${p.red(fc)},${p.green(fc)},${p.blue(fc)},${alpha/255})` : `rgba(255,255,255,${alpha/255})`;
          ctx.lineWidth = 1.5;
          if (v === 'd-stripes-tl') {
            for(let i=-s;i<s*2;i+=4){ ctx.beginPath(); ctx.moveTo(ox+i,oy); ctx.lineTo(ox+i+s,oy+s); ctx.stroke(); }
          } else {
            for(let i=-s;i<s*2;i+=4){ ctx.beginPath(); ctx.moveTo(ox+s-i,oy); ctx.lineTo(ox-i,oy+s); ctx.stroke(); }
          }
          ctx.restore();
          break;
        }
        default: p.rect(ox, oy, s, s);
      }
    }

    function drawFrameCells(frameData: boolean[][], r: number, g: number, b: number, a: number) {
      p.fill(r, g, b, a);
      for (let y = 0; y < E.gridSize; y++)
        for (let x = 0; x < E.gridSize; x++)
          if (frameData[y]?.[x]) cell(x, y, a);
    }

    function coord() {
      return { x: Math.floor(p.mouseX / ps()), y: Math.floor(p.mouseY / ps()) };
    }

    p.setup = () => {
      p.createCanvas(E.canvasSize, E.canvasSize);
      p.noStroke();
      p.frameRate(60);
    };

    p.draw = () => {
      p.background(E.pageBg || '#0e0e0e');

      // Grid (empty cells)
      p.fill(30);
      for (let y = 0; y < E.gridSize; y++)
        for (let x = 0; x < E.gridSize; x++)
          cell(x, y);

      // Onion skin prev (red)
      if (E.onionSkin && E.currentFrame > 0) {
        const prev = E.frames[E.currentFrame - 1];
        if (prev) drawFrameCells(prev, 255, 80, 80, E.onionSkinOpacity * 2.55);
      }
      // Onion skin next (blue)
      if (E.onionSkin && E.currentFrame < E.frames.length - 1) {
        const next = E.frames[E.currentFrame + 1];
        if (next) drawFrameCells(next, 80, 100, 255, E.onionSkinOpacity * 2.55);
      }

      // Current frame — white
      const f = E.frame;
      if (f) {
        p.fill(255);
        for (let y = 0; y < E.gridSize; y++)
          for (let x = 0; x < E.gridSize; x++)
            if (f[y]?.[x]) cell(x, y);
      }

      // Shape preview
      if (E.isDrawing && (E.activeTool === 'rectangle' || E.activeTool === 'line' || E.activeTool === 'circle')) {
        p.fill(255, 255, 255, 100);
        const { x: x1, y: y1 } = E.drawStart, { x: x2, y: y2 } = E.drawEnd;
        if (E.activeTool === 'rectangle') {
          const [mnX, mxX] = [Math.min(x1, x2), Math.max(x1, x2)];
          const [mnY, mxY] = [Math.min(y1, y2), Math.max(y1, y2)];
          for (let y = mnY; y <= mxY; y++)
            for (let x = mnX; x <= mxX; x++)
              if (x === mnX || x === mxX || y === mnY || y === mxY) cell(x, y);
        } else if (E.activeTool === 'line') {
          let lx = x1, ly = y1;
          const dx = Math.abs(x2-lx), dy = Math.abs(y2-ly), sx = lx<x2?1:-1, sy = ly<y2?1:-1;
          let err = dx - dy;
          while (true) {
            cell(lx, ly);
            if (lx === x2 && ly === y2) break;
            const e2 = 2*err;
            if (e2 > -dy) { err -= dy; lx += sx; }
            if (e2 < dx) { err += dx; ly += sy; }
          }
        } else {
          const r = Math.round(Math.sqrt((x2-x1)**2 + (y2-y1)**2));
          let cx = r, cy = 0, er = 0;
          while (cx >= cy) {
            [[x1+cx,y1+cy],[x1+cy,y1+cx],[x1-cy,y1+cx],[x1-cx,y1+cy],
             [x1-cx,y1-cy],[x1-cy,y1-cx],[x1+cy,y1-cx],[x1+cx,y1-cy]]
            .forEach(([px, py]) => cell(px, py));
            if (er <= 0) { cy++; er += 2*cy+1; }
            if (er > 0) { cx--; er -= 2*cx+1; }
          }
        }
      }

      // Auto advance
      if (E.isPlaying && p.frameCount % Math.round(60 / E.fps) === 0) {
        E.goNextLoop();
      }
    };

    p.mousePressed = () => {
      if (p.mouseX < 0 || p.mouseX >= p.width || p.mouseY < 0 || p.mouseY >= p.height) return;
      const { x, y } = coord();
      E.onMouseDown(x, y);
    };

    p.mouseDragged = () => {
      if (p.mouseX < 0 || p.mouseX >= p.width || p.mouseY < 0 || p.mouseY >= p.height) return;
      const { x, y } = coord();
      E.onMouseDrag(x, y);
    };

    p.mouseReleased = () => {
      E.onMouseUp();
    };
  };
}
