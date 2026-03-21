import type { PixelEngine } from './pixel-engine';

// ── color helpers ────────────────────────────────────────────────────────────

function resolvedColor(color: string, transparent: boolean): string | null {
  return transparent ? null : color;
}

function hexToRgba(hex: string, alpha = 1): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ── canvas renderer ──────────────────────────────────────────────────────────

function renderFrameToCanvas(engine: PixelEngine, frameIndex: number, scale = 1): HTMLCanvasElement {
  const { gridSize, gap, pixelSize, cellShape } = engine;
  const size = engine.canvasSize * scale;
  const ps = pixelSize * scale;
  const g = gap * scale;

  const filledColor = resolvedColor(engine.exportFilledColor, engine.exportFilledTransparent);
  const emptyColor  = resolvedColor(engine.exportEmptyColor,  engine.exportEmptyTransparent);
  const gapColor    = resolvedColor(engine.exportGapColor,    engine.exportGapTransparent);

  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d')!;

  // Background / gap
  if (gapColor) { ctx.fillStyle = gapColor; ctx.fillRect(0, 0, size, size); }

  const f = engine.frames[frameIndex];
  if (!f) return c;

  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const filled = !!f[y]?.[x];
      const color = filled ? filledColor : emptyColor;
      if (!color) continue; // transparent — skip
      ctx.fillStyle = color;
      const ox = x * ps + g / 2, oy = y * ps + g / 2, s = ps - g;
      drawCell(ctx, cellShape, ox, oy, s);
    }
  }
  return c;
}

function drawCell(ctx: CanvasRenderingContext2D, shape: string, ox: number, oy: number, s: number) {
  ctx.beginPath();
  switch (shape) {
    case 'square':    ctx.rect(ox, oy, s, s); break;
    case 'circle':    ctx.ellipse(ox + s/2, oy + s/2, s/2, s/2, 0, 0, Math.PI*2); break;
    case 'triangle':  ctx.moveTo(ox+s/2,oy); ctx.lineTo(ox+s,oy+s); ctx.lineTo(ox,oy+s); break;
    case 'h-stripes': for(let i=0;i<3;i++) ctx.rect(ox,oy+i*(s/3)+1,s,s/3-2); break;
    case 'v-stripes': for(let i=0;i<3;i++) ctx.rect(ox+i*(s/3)+1,oy,s/3-2,s); break;
    case 'd-stripes': {
      ctx.save(); ctx.rect(ox,oy,s,s); ctx.clip();
      for(let i=-s;i<s*2;i+=4){ctx.moveTo(ox+i,oy);ctx.lineTo(ox+i+s,oy+s);}
      ctx.restore(); break;
    }
    default: ctx.rect(ox, oy, s, s);
  }
  ctx.fill();
}

function download(blob: Blob, filename: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function downloadText(text: string, filename: string, mime = 'text/plain') {
  download(new Blob([text], { type: mime }), filename);
}

// ── PNG ──────────────────────────────────────────────────────────────────────

export function exportPNG(engine: PixelEngine) {
  const c = renderFrameToCanvas(engine, engine.currentFrame);
  c.toBlob(blob => download(blob!, `pixatron-frame${engine.currentFrame+1}.png`), 'image/png');
}

// ── Sprite sheet ─────────────────────────────────────────────────────────────

export function exportSpriteSheet(engine: PixelEngine) {
  const size = engine.canvasSize, n = engine.frames.length;
  const sheet = document.createElement('canvas');
  sheet.width = size * n; sheet.height = size;
  const ctx = sheet.getContext('2d')!;
  for (let i = 0; i < n; i++) ctx.drawImage(renderFrameToCanvas(engine, i), i * size, 0);
  sheet.toBlob(blob => download(blob!, 'pixatron-spritesheet.png'), 'image/png');
}

// ── SVG ───────────────────────────────────────────────────────────────────────

export function exportSVG(engine: PixelEngine) {
  const { gridSize, gap, pixelSize, cellShape, canvasSize } = engine;
  const f = engine.frame, ps = pixelSize;

  const filledColor = resolvedColor(engine.exportFilledColor, engine.exportFilledTransparent) ?? 'none';
  const emptyColor  = resolvedColor(engine.exportEmptyColor,  engine.exportEmptyTransparent)  ?? 'none';
  const bgColor     = resolvedColor(engine.exportGapColor,    engine.exportGapTransparent)    ?? 'none';

  let shapes = '';
  for (let y = 0; y < gridSize; y++)
    for (let x = 0; x < gridSize; x++) {
      const color = f[y]?.[x] ? filledColor : emptyColor;
      if (color === 'none') continue;
      const ox = x*ps+gap/2, oy = y*ps+gap/2, s = ps-gap;
      shapes += `\n  <g fill="${color}">${cellToSVG(cellShape,ox,oy,s)}</g>`;
    }

  const svg = buildSVG(canvasSize, bgColor, shapes);
  downloadText(svg, `pixatron-frame${engine.currentFrame+1}.svg`, 'image/svg+xml');
}

function buildSVG(size: number, bg: string, shapes: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${bg}"/>
  ${shapes}
</svg>`;
}

function cellToSVG(shape: string, ox: number, oy: number, s: number): string {
  switch (shape) {
    case 'square':    return `<rect x="${ox}" y="${oy}" width="${s}" height="${s}"/>`;
    case 'circle':    return `<ellipse cx="${ox+s/2}" cy="${oy+s/2}" rx="${s/2}" ry="${s/2}"/>`;
    case 'triangle':  return `<polygon points="${ox+s/2},${oy} ${ox+s},${oy+s} ${ox},${oy+s}"/>`;
    case 'h-stripes': return [0,1,2].map(i=>`<rect x="${ox}" y="${oy+i*(s/3)+1}" width="${s}" height="${s/3-2}"/>`).join('');
    case 'v-stripes': return [0,1,2].map(i=>`<rect x="${ox+i*(s/3)+1}" y="${oy}" width="${s/3-2}" height="${s}"/>`).join('');
    case 'd-stripes': {
      const id = `c${ox|0}${oy|0}`;
      let lines = `<clipPath id="${id}"><rect x="${ox}" y="${oy}" width="${s}" height="${s}"/></clipPath>`;
      lines += `<g clip-path="url(#${id})" stroke="currentColor" stroke-width="1.5" fill="none">`;
      for(let i=-s;i<s*2;i+=4) lines+=`<line x1="${ox+i}" y1="${oy}" x2="${ox+i+s}" y2="${oy+s}"/>`;
      return lines + '</g>';
    }
    default: return `<rect x="${ox}" y="${oy}" width="${s}" height="${s}"/>`;
  }
}

// ── GIF ───────────────────────────────────────────────────────────────────────

export async function exportGIF(engine: PixelEngine) {
  const { GIFEncoder, quantize, applyPalette } = await import('gifenc');
  const size = engine.canvasSize;
  const delay = Math.round(1000 / engine.fps);
  const loopCount = engine.exportLoop ? 0 : 1; // 0 = infinite, 1 = play once

  const gif = GIFEncoder();

  for (let i = 0; i < engine.frames.length; i++) {
    const c = renderFrameToCanvas(engine, i);
    const data = c.getContext('2d')!.getImageData(0, 0, size, size).data;
    const rgb = new Uint8Array(size * size * 3);
    for (let j = 0; j < size * size; j++) {
      rgb[j*3] = data[j*4]; rgb[j*3+1] = data[j*4+1]; rgb[j*3+2] = data[j*4+2];
    }
    const palette = quantize(rgb, 16);
    const indexed = applyPalette(rgb, palette);
    gif.writeFrame(indexed, size, size, { palette, delay, repeat: loopCount });
  }

  gif.finish();
  download(new Blob([gif.bytes()], { type: 'image/gif' }), 'pixatron.gif');
}

// ── Video (WebM) ──────────────────────────────────────────────────────────────

export async function exportVideo(engine: PixelEngine) {
  const size = engine.canvasSize, fps = engine.fps;
  const offscreen = document.createElement('canvas');
  offscreen.width = size; offscreen.height = size;
  const ctx = offscreen.getContext('2d')!;

  const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
  const recorder = new MediaRecorder(offscreen.captureStream(fps), { mimeType: mime });
  const chunks: Blob[] = [];
  recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
  recorder.onstop = () => download(new Blob(chunks, { type: mime }), 'pixatron.webm');

  recorder.start();
  const frames = engine.exportLoop
    ? [...engine.frames, ...engine.frames] // loop once for preview
    : engine.frames;

  for (const _f of frames) {
    const fi = engine.frames.indexOf(_f);
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(renderFrameToCanvas(engine, Math.max(0, fi)), 0, 0);
    await new Promise(r => setTimeout(r, 1000 / fps));
  }
  recorder.stop();
}

// ── HTML snippet ──────────────────────────────────────────────────────────────

export function exportHTML(engine: PixelEngine) {
  const { gridSize, gap, pixelSize, cellShape, canvasSize, fps } = engine;
  const n = engine.frames.length;
  const ps = pixelSize;

  const filledColor = resolvedColor(engine.exportFilledColor, engine.exportFilledTransparent) ?? 'transparent';
  const emptyColor  = resolvedColor(engine.exportEmptyColor,  engine.exportEmptyTransparent)  ?? 'transparent';
  const bgColor     = resolvedColor(engine.exportGapColor,    engine.exportGapTransparent)    ?? 'transparent';

  // Encode each frame as SVG data URI
  const svgs = engine.frames.map((_, i) => {
    const f = engine.frames[i];
    let shapes = '';
    for (let y = 0; y < gridSize; y++)
      for (let x = 0; x < gridSize; x++) {
        const color = f[y]?.[x] ? filledColor : emptyColor;
        if (color === 'transparent') continue;
        const ox = x*ps+gap/2, oy = y*ps+gap/2, s = ps-gap;
        shapes += `<g fill="${color}">${cellToSVG(cellShape,ox,oy,s)}</g>`;
      }
    return buildSVG(canvasSize, bgColor, shapes).replace(/\n/g,' ');
  });

  const loopJs = engine.exportLoop ? '' : `\n    if (frame >= frames.length - 1) { clearInterval(timer); return; }`;
  const html = `<!-- Pixatron animation (${n} frame${n>1?'s':''}, ${fps}fps) -->
<div class="pixatron" style="width:${canvasSize}px;height:${canvasSize}px;position:relative;display:inline-block;">
  <img id="pixatron-frame" src="" alt="pixel art" style="width:100%;height:100%;image-rendering:pixelated;" />
</div>
<script>
(function() {
  var frames = ${JSON.stringify(svgs.map(s => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s)))};
  var frame = 0;
  var img = document.getElementById('pixatron-frame');
  img.src = frames[0];
  ${n > 1 ? `var timer = setInterval(function() {${loopJs}
    frame = (frame + 1) % frames.length;
    img.src = frames[frame];
  }, ${Math.round(1000/fps)});` : ''}
})();
</script>`;

  downloadText(html, 'pixatron.html', 'text/html');
}

// ── Glyph (Unicode block art) ─────────────────────────────────────────────────

export function exportGlyph(engine: PixelEngine) {
  const { gridSize } = engine;
  const f = engine.frame;

  // Use half-block characters: ▀ (top filled), ▄ (bottom filled), █ (both), space (none)
  let text = '';
  for (let y = 0; y < gridSize; y += 2) {
    for (let x = 0; x < gridSize; x++) {
      const top    = !!f[y]?.[x];
      const bottom = !!f[y+1]?.[x];
      if (top && bottom)  text += '█';
      else if (top)       text += '▀';
      else if (bottom)    text += '▄';
      else                text += ' ';
    }
    text += '\n';
  }

  downloadText(text, `pixatron-frame${engine.currentFrame+1}.txt`, 'text/plain');

  // Also copy to clipboard
  navigator.clipboard?.writeText(text).catch(() => {});
}

// ── Actual-size preview canvas ────────────────────────────────────────────────

export function renderActualSize(engine: PixelEngine, frameIndex: number): HTMLCanvasElement {
  // 1px per grid cell — uses canvas display colors (not export colors)
  const { gridSize } = engine;
  const f = engine.frames[frameIndex];

  const filledColor = engine.cellFillColor  || '#ffffff';
  const emptyColor  = engine.cellEmptyColor || '#1e1e1e';
  const bgColor     = engine.pageBg         || '#0a0a0a';

  const c = document.createElement('canvas');
  c.width = gridSize; c.height = gridSize;
  const ctx = c.getContext('2d')!;

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, gridSize, gridSize);

  if (f) for (let y = 0; y < gridSize; y++)
    for (let x = 0; x < gridSize; x++) {
      ctx.fillStyle = f[y]?.[x] ? filledColor : emptyColor;
      ctx.fillRect(x, y, 1, 1);
    }

  return c;
}
