import type { PixelEngine } from './pixel-engine';

// ── helpers ─────────────────────────────────────────────────────────────────

function renderFrameToCanvas(
  engine: PixelEngine,
  frameIndex: number,
  scale = 1
): HTMLCanvasElement {
  const { gridSize, gap, pixelSize, cellShape } = engine;
  const size = engine.canvasSize * scale;
  const ps = pixelSize * scale;
  const g = gap * scale;

  const filledColor = engine.exportFilledColor || '#ffffff';
  const emptyColor  = engine.exportEmptyColor  || '#0e0e0e';
  const gapColor    = engine.exportGapTransparent ? null : (engine.exportGapColor || emptyColor);

  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d')!;

  // Background (gap color or transparent)
  if (gapColor) {
    ctx.fillStyle = gapColor;
    ctx.fillRect(0, 0, size, size);
  }

  const f = engine.frames[frameIndex];
  if (!f) return c;

  // Draw all cells (filled + empty)
  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const filled = !!f[y]?.[x];
      ctx.fillStyle = filled ? filledColor : emptyColor;
      const ox = x * ps + g / 2, oy = y * ps + g / 2, s = ps - g;
      drawCell(ctx, cellShape, ox, oy, s);
    }
  }
  return c;
}

function drawCell(
  ctx: CanvasRenderingContext2D,
  shape: string,
  ox: number, oy: number, s: number
) {
  ctx.beginPath();
  switch (shape) {
    case 'square':
      ctx.rect(ox, oy, s, s); break;
    case 'circle':
      ctx.ellipse(ox + s / 2, oy + s / 2, s / 2, s / 2, 0, 0, Math.PI * 2); break;
    case 'triangle':
      ctx.moveTo(ox + s / 2, oy); ctx.lineTo(ox + s, oy + s); ctx.lineTo(ox, oy + s); break;
    case 'h-stripes':
      for (let i = 0; i < 3; i++) ctx.rect(ox, oy + i * (s / 3) + 1, s, s / 3 - 2); break;
    case 'v-stripes':
      for (let i = 0; i < 3; i++) ctx.rect(ox + i * (s / 3) + 1, oy, s / 3 - 2, s); break;
    case 'd-stripes': {
      ctx.save();
      ctx.rect(ox, oy, s, s); ctx.clip();
      for (let i = -s; i < s * 2; i += 4) {
        ctx.moveTo(ox + i, oy); ctx.lineTo(ox + i + s, oy + s);
      }
      ctx.restore();
      break;
    }
    default:
      ctx.rect(ox, oy, s, s);
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

// ── PNG (current frame) ──────────────────────────────────────────────────────

export function exportPNG(engine: PixelEngine) {
  const c = renderFrameToCanvas(engine, engine.currentFrame);
  c.toBlob(blob => download(blob!, `pixatron-frame${engine.currentFrame + 1}.png`));
}

// ── Spritesheet PNG ──────────────────────────────────────────────────────────

export function exportSpriteSheet(engine: PixelEngine) {
  const size = engine.canvasSize;
  const n = engine.frames.length;
  const sheet = document.createElement('canvas');
  sheet.width = size * n; sheet.height = size;
  const ctx = sheet.getContext('2d')!;
  for (let i = 0; i < n; i++) {
    const fc = renderFrameToCanvas(engine, i);
    ctx.drawImage(fc, i * size, 0);
  }
  sheet.toBlob(blob => download(blob!, 'pixatron-spritesheet.png'));
}

// ── SVG (current frame) ──────────────────────────────────────────────────────

export function exportSVG(engine: PixelEngine) {
  const { gridSize, gap, pixelSize, cellShape, canvasSize } = engine;
  const f = engine.frame;
  const ps = pixelSize;

  const filledColor = engine.exportFilledColor || '#ffffff';
  const emptyColor  = engine.exportEmptyColor  || '#0e0e0e';
  const bgColor     = engine.exportGapTransparent ? 'none' : (engine.exportGapColor || emptyColor);

  let shapes = '';
  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const filled = !!f[y]?.[x];
      const color = filled ? filledColor : emptyColor;
      const ox = x * ps + gap / 2, oy = y * ps + gap / 2, s = ps - gap;
      shapes += `\n  <g fill="${color}">` + cellToSVG(cellShape, ox, oy, s) + '\n  </g>';
    }
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${canvasSize}" height="${canvasSize}" viewBox="0 0 ${canvasSize} ${canvasSize}">
  <rect width="${canvasSize}" height="${canvasSize}" fill="${bgColor}"/>
  ${shapes}
</svg>`;

  download(new Blob([svg], { type: 'image/svg+xml' }), `pixatron-frame${engine.currentFrame + 1}.svg`);
}

function cellToSVG(shape: string, ox: number, oy: number, s: number): string {
  switch (shape) {
    case 'square': return `\n    <rect x="${ox}" y="${oy}" width="${s}" height="${s}"/>`;
    case 'circle': return `\n    <ellipse cx="${ox + s / 2}" cy="${oy + s / 2}" rx="${s / 2}" ry="${s / 2}"/>`;
    case 'triangle': return `\n    <polygon points="${ox + s / 2},${oy} ${ox + s},${oy + s} ${ox},${oy + s}"/>`;
    case 'h-stripes': return [0, 1, 2].map(i =>
      `\n    <rect x="${ox}" y="${oy + i * (s / 3) + 1}" width="${s}" height="${s / 3 - 2}"/>`).join('');
    case 'v-stripes': return [0, 1, 2].map(i =>
      `\n    <rect x="${ox + i * (s / 3) + 1}" y="${oy}" width="${s / 3 - 2}" height="${s}"/>`).join('');
    case 'd-stripes': {
      let lines = `\n    <g clip-path="url(#c${ox}${oy})" stroke="white" stroke-width="1.5">`;
      lines += `\n      <clipPath id="c${ox}${oy}"><rect x="${ox}" y="${oy}" width="${s}" height="${s}"/></clipPath>`;
      for (let i = -s; i < s * 2; i += 4)
        lines += `\n      <line x1="${ox + i}" y1="${oy}" x2="${ox + i + s}" y2="${oy + s}"/>`;
      return lines + '\n    </g>';
    }
    default: return `\n    <rect x="${ox}" y="${oy}" width="${s}" height="${s}"/>`;
  }
}

// ── GIF ──────────────────────────────────────────────────────────────────────

export async function exportGIF(engine: PixelEngine) {
  const { GIFEncoder, quantize, applyPalette } = await import('gifenc');
  const size = engine.canvasSize;
  const delay = Math.round(1000 / engine.fps);

  const gif = GIFEncoder();

  for (let i = 0; i < engine.frames.length; i++) {
    const c = renderFrameToCanvas(engine, i);
    const ctx = c.getContext('2d')!;
    const imageData = ctx.getImageData(0, 0, size, size).data;

    // Convert RGBA to RGB array
    const rgb = new Uint8Array(size * size * 3);
    for (let j = 0; j < size * size; j++) {
      rgb[j * 3]     = imageData[j * 4];
      rgb[j * 3 + 1] = imageData[j * 4 + 1];
      rgb[j * 3 + 2] = imageData[j * 4 + 2];
    }

    const palette = quantize(rgb, 16);
    const indexed = applyPalette(rgb, palette);
    gif.writeFrame(indexed, size, size, { palette, delay });
  }

  gif.finish();
  download(new Blob([gif.bytes()], { type: 'image/gif' }), 'pixatron.gif');
}

// ── MOV / WebM (via MediaRecorder) ──────────────────────────────────────────

export async function exportVideo(engine: PixelEngine) {
  const size = engine.canvasSize;
  const fps = engine.fps;
  const frameMs = 1000 / fps;

  // Render all frames to offscreen canvas, record via MediaRecorder
  const offscreen = document.createElement('canvas');
  offscreen.width = size; offscreen.height = size;
  const ctx = offscreen.getContext('2d')!;

  const stream = offscreen.captureStream(fps);
  const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : 'video/webm';

  const recorder = new MediaRecorder(stream, { mimeType: mime });
  const chunks: Blob[] = [];
  recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: mime });
    download(blob, 'pixatron.webm');
  };

  recorder.start();

  // Draw each frame with proper timing
  for (let i = 0; i < engine.frames.length; i++) {
    const fc = renderFrameToCanvas(engine, i);
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(fc, 0, 0);
    await new Promise(r => setTimeout(r, frameMs));
  }

  recorder.stop();
}
