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

// scale = pixels per grid cell (1 = 1px per cell, 4 = 4px per cell, etc.)
function renderFrameToCanvas(engine: PixelEngine, frameIndex: number, scale = 4): HTMLCanvasElement {
  const { gridSize, gap } = engine;
  const cellShape = engine.cellVariant || engine.cellShape;

  // At scale=1: 1px per cell, no gap. At higher scales, gap is scaled too.
  const ps = scale;                         // pixels per cell (including gap)
  const g  = scale > 1 ? Math.round(gap * scale / engine.pixelSize) : 0;
  const size = gridSize * ps;               // total canvas size

  const filledColor = resolvedColor(engine.exportFilledColor, engine.exportFilledTransparent);
  const emptyColor  = resolvedColor(engine.exportEmptyColor,  engine.exportEmptyTransparent);
  const gapColor    = resolvedColor(engine.exportGapColor,    engine.exportGapTransparent);

  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d')!;

  // Fill background (gap color)
  if (gapColor) { ctx.fillStyle = gapColor; ctx.fillRect(0, 0, size, size); }

  const f = engine.frames[frameIndex];
  if (!f) return c;

  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const filled = !!f[y]?.[x];
      const color = filled ? filledColor : emptyColor;
      if (!color) continue;
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
    case 'circle':    ctx.ellipse(ox+s/2, oy+s/2, s/2, s/2, 0, 0, Math.PI*2); break;
    case 'tri-up':    ctx.moveTo(ox+s/2,oy); ctx.lineTo(ox+s,oy+s); ctx.lineTo(ox,oy+s); break;
    case 'tri-down':  ctx.moveTo(ox,oy); ctx.lineTo(ox+s,oy); ctx.lineTo(ox+s/2,oy+s); break;
    case 'tri-left':  ctx.moveTo(ox+s,oy); ctx.lineTo(ox+s,oy+s); ctx.lineTo(ox,oy+s/2); break;
    case 'tri-right': ctx.moveTo(ox,oy); ctx.lineTo(ox+s,oy+s/2); ctx.lineTo(ox,oy+s); break;
    case 'h-stripes': for(let i=0;i<3;i++) ctx.rect(ox,oy+i*(s/3)+1,s,s/3-2); break;
    case 'v-stripes': for(let i=0;i<3;i++) ctx.rect(ox+i*(s/3)+1,oy,s/3-2,s); break;
    case 'd-stripes-tl':
    case 'd-stripes-tr': {
      ctx.save(); ctx.rect(ox,oy,s,s); ctx.clip();
      const col = ctx.fillStyle as string;
      ctx.strokeStyle = col; ctx.lineWidth = 1.5;
      if (shape === 'd-stripes-tl') {
        for(let i=-s;i<s*2;i+=4){ctx.moveTo(ox+i,oy);ctx.lineTo(ox+i+s,oy+s);}
      } else {
        for(let i=-s;i<s*2;i+=4){ctx.moveTo(ox+s-i,oy);ctx.lineTo(ox-i,oy+s);}
      }
      ctx.stroke(); ctx.restore(); return;
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
  const scale = engine.exportScale || 1;
  const c = renderFrameToCanvas(engine, engine.currentFrame, scale);
  c.toBlob(blob => download(blob!, `pixatron-frame${engine.currentFrame+1}.png`), 'image/png');
}

// ── Sprite sheet ─────────────────────────────────────────────────────────────

export function exportSpriteSheet(engine: PixelEngine) {
  const scale = engine.exportScale || 4;
  const n = engine.frames.length;
  const frames = engine.frames.map((_, i) => renderFrameToCanvas(engine, i, scale));
  const size = frames[0].width;
  const sheet = document.createElement('canvas');
  sheet.width = size * n; sheet.height = size;
  const ctx = sheet.getContext('2d')!;
  for (let i = 0; i < n; i++) ctx.drawImage(frames[i], i * size, 0);
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
  const { GifWriter } = await import('omggif');
  const scale   = engine.exportScale || 4;
  const delay   = Math.round(100 / engine.fps); // GIF delay in 1/100s units
  const loop    = engine.exportLoop ? 0 : -1;   // 0 = infinite, -1 = no loop

  const { gridSize, gap, pixelSize, cellVariant, cellShape } = engine;
  const ps    = scale;
  const g     = scale > 1 ? Math.round(gap * scale / pixelSize) : 0;
  const size  = gridSize * ps;
  const shape = cellVariant || cellShape;

  // For GIF: always use explicit export color values (GIF has no alpha channel)
  // transparent flag = ignore, just use whatever color is set in the picker
  const bgColor    = engine.exportGapColor    || '#000000';
  const fillColor  = engine.exportFilledColor || '#ffffff';
  const emptyColor = engine.exportEmptyColor  || '#000000';

  function hexToRgb(hex: string): [number,number,number] {
    const n = parseInt(hex.replace('#',''), 16);
    return [(n>>16)&255, (n>>8)&255, n&255];
  }

  const [br,bg,bb] = hexToRgb(bgColor);
  const [fr,fg,fb] = hexToRgb(fillColor);
  const [er,eg,eb] = hexToRgb(emptyColor);

  // Build a palette from the unique colors used
  const palette: number[] = [
    (br<<16)|(bg<<8)|bb,
    (fr<<16)|(fg<<8)|fb,
    (er<<16)|(eg<<8)|eb,
    0x000000, // pad to at least 4
  ];
  // Remove duplicates keeping order
  const uniquePalette = [...new Set(palette)];
  // Pad to power of 2 (GIF requirement)
  while (uniquePalette.length < 4 || (uniquePalette.length & (uniquePalette.length-1)) !== 0)
    uniquePalette.push(0);

  const bgIdx   = uniquePalette.indexOf((br<<16)|(bg<<8)|bb);
  const fillIdx = uniquePalette.indexOf((fr<<16)|(fg<<8)|fb);
  const emptyIdx= uniquePalette.indexOf((er<<16)|(eg<<8)|eb);

  // Render each frame using canvas, map pixels to palette indices
  const bufSize = 1024 * 1024 * 4;
  const buf = new Uint8Array(bufSize);
  const gw = new GifWriter(buf, size, size, { loop });

  for (let fi = 0; fi < engine.frames.length; fi++) {
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d')!;

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, size, size);

    const f = engine.frames[fi];
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        ctx.fillStyle = f?.[y]?.[x] ? fillColor : emptyColor;
        const ox = x * ps + g / 2, oy = y * ps + g / 2, s = ps - g;
        drawCell(ctx, shape, ox, oy, s);
      }
    }

    const imageData = ctx.getImageData(0, 0, size, size).data;
    const indexed = new Uint8Array(size * size);
    // nearest-color matching (handles anti-aliasing/sub-pixel rounding)
    const [pr, pg, pb] = uniquePalette.map(c => [(c>>16)&255,(c>>8)&255,c&255]);
    function nearest(r: number, g2: number, b: number): number {
      let best = 0, bestDist = Infinity;
      for (let k = 0; k < uniquePalette.length; k++) {
        const cr = (uniquePalette[k]>>16)&255;
        const cg = (uniquePalette[k]>>8)&255;
        const cb = uniquePalette[k]&255;
        const d = (r-cr)**2 + (g2-cg)**2 + (b-cb)**2;
        if (d < bestDist) { bestDist = d; best = k; }
      }
      return best;
    }
    for (let j = 0; j < size * size; j++) {
      indexed[j] = nearest(imageData[j*4], imageData[j*4+1], imageData[j*4+2]);
    }

    gw.addFrame(0, 0, size, size, indexed, {
      palette: uniquePalette,
      delay,
    });
  }

  const bytes = buf.slice(0, gw.end());
  download(new Blob([bytes], { type: 'image/gif' }), 'pixatron.gif');
}

// ── Video (WebM) ──────────────────────────────────────────────────────────────

export async function exportVideo(engine: PixelEngine) {
  const scale = engine.exportScale || 4;
  const size = engine.gridSize * scale, fps = engine.fps;
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
    ctx.drawImage(renderFrameToCanvas(engine, Math.max(0, fi >= 0 ? fi : 0), scale), 0, 0);
    await new Promise(r => setTimeout(r, 1000 / fps));
  }
  recorder.stop();
}

// ── HTML snippet ──────────────────────────────────────────────────────────────

export function exportHTML(engine: PixelEngine) {
  const { gridSize, gap, fps } = engine;
  const scale    = engine.exportScale || 4;
  const dispSize = gridSize * scale;
  const variant  = engine.cellVariant || engine.cellShape;

  const filledColor = resolvedColor(engine.exportFilledColor, engine.exportFilledTransparent) ?? 'transparent';
  const emptyColor  = resolvedColor(engine.exportEmptyColor,  engine.exportEmptyTransparent)  ?? 'transparent';
  const bgColor     = resolvedColor(engine.exportGapColor,    engine.exportGapTransparent)    ?? 'transparent';

  // Each frame SVG: 1 unit per cell, browser scales via CSS
  const svgFrames = engine.frames.map(f => {
    let shapes = '';
    for (let y = 0; y < gridSize; y++)
      for (let x = 0; x < gridSize; x++) {
        const color = f[y]?.[x] ? filledColor : emptyColor;
        if (!color || color === 'transparent') continue;
        const s = Math.max(0, 1 - gap);
        const ox = x + gap / 2, oy = y + gap / 2;
        shapes += '<g fill="' + color + '">' + cellToSVG(variant, ox, oy, s) + '</g>';
      }
    const svg = '<?xml version="1.0" encoding="UTF-8"?>'
      + '<svg xmlns="http://www.w3.org/2000/svg"'
      + ' width="' + gridSize + '" height="' + gridSize + '"'
      + ' viewBox="0 0 ' + gridSize + ' ' + gridSize + '">'
      + '<rect width="' + gridSize + '" height="' + gridSize + '" fill="' + bgColor + '"/>'
      + shapes
      + '</svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });

  const delayMs = Math.round(1000 / fps);
  const loopStop = engine.exportLoop ? '' : 'if(frame>=frames.length-1){clearInterval(timer);return;}';
  const n = engine.frames.length;

  const animScript = n > 1
    ? 'var timer=setInterval(function(){' + loopStop + 'frame=(frame+1)%frames.length;img.src=frames[frame];}, ' + delayMs + ');'
    : '';

  const html = [
    '<!-- Pixatron animation (' + n + ' frame' + (n > 1 ? 's' : '') + ', ' + fps + 'fps) -->',
    '<div class="pixatron" style="width:' + dispSize + 'px;height:' + dispSize + 'px;position:relative;display:inline-block;">',
    '  <img id="pixatron-frame" src="" alt="pixel art" style="width:' + dispSize + 'px;height:' + dispSize + 'px;image-rendering:pixelated;" />',
    '</div>',
    '<script>',
    '(function() {',
    '  var frames = ' + JSON.stringify(svgFrames) + ';',
    '  var frame = 0;',
    "  var img = document.getElementById('pixatron-frame');",
    '  img.src = frames[0];',
    '  ' + animScript,
    '})();',
    '</script>'
  ].join('\n');

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
