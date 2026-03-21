# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
yarn start          # dev server (ng serve)
yarn build          # production build
yarn watch          # build --watch in development mode
yarn test           # run unit tests (Karma)
```

No linter is configured. Formatting uses Prettier (`prettier --write`).

## Architecture

Pixatron Plus is a single-page Angular pixel-art editor. It is a **standalone Angular app** (no NgModules) with one component and no routing. All state lives in a plain TypeScript class instance held by that component.

### Core data model

Pixel art is stored as `boolean[][][]` — `frames[frameIndex][row][col]`. The canvas is always 480×480px on screen; `gridSize` (default 16) determines the number of cells. `pixelSize = floor((480 - gap) / gridSize)` pixels per cell.

### Module responsibilities

| File | Role |
|------|------|
| `pixel-engine.ts` | All drawing state and mutation logic. `PixelEngine` holds frames, tools, settings, undo/redo stacks, and exposes mouse event handlers (`onMouseDown/Drag/Up`). It also has a `saveCallback` hook that the app wires to persist to the active project. |
| `p5-sketch.ts` | p5.js rendering. `createSketch(engine)` returns a p5 instance function that reads from `PixelEngine` on every frame. Handles cell shape variants (square, circle, triangles, stripes, diagonal stripes) and onion-skin overlays. |
| `exporter.ts` | All export formats: PNG, sprite sheet, SVG, GIF (via `omggif`), Video (WebM via `MediaRecorder`), HTML snippet, and Unicode glyph art. Uses its own `renderFrameToCanvas` with export-specific colors (separate from canvas display colors). |
| `projects.ts` | Project CRUD over `localStorage`. Each project is stored under key `pixatron-project-<id>`; the index list is under `pixatron-projects`; active project id under `pixatron-active-project`. Thumbnails are 32×32 data URLs stored in the project list entry. |
| `app.ts` | Angular component that owns the `PixelEngine` instance, wires keyboard shortcuts, manages project UI, preview animation, drag-and-drop frame reordering, and dispatches export calls. |

### Two color systems

There are **canvas colors** (`cellFillColor`, `cellEmptyColor`, `pageBg`) used for display in the editor and in the preview, and **export colors** (`exportFilledColor`, `exportEmptyColor`, `exportGapColor`, each with a `*Transparent` flag) used exclusively by `exporter.ts`. These two systems are independent — changing one does not affect the other.

### p5 / Angular integration

p5 is loaded lazily (`import('p5')`) in `ngOnInit` and instantiated in instance mode, mounted to the `#canvasContainer` div. The sketch reads directly from the `PixelEngine` instance on every p5 draw call — there is no event bus or Observable. Angular change detection is triggered manually via `cdr.detectChanges()` where needed.

### Keyboard shortcuts (app.ts)

| Key | Action |
|-----|--------|
| `q` / `e` | Cycle tool backward/forward |
| `Q` / `Shift+E` | Go to first/last frame |
| `a`/`A`/`ArrowLeft` | Previous frame |
| `d`/`D`/`ArrowRight` | Next frame |
| `Shift+ArrowRight` | Next frame or create new |
| `Ctrl/Cmd+Shift+D` | Append new frame at end |
| `Space` | Toggle play/pause |
| `w`/`W` | Toggle onion skin |
| `Delete`/`Backspace` | Delete current frame |
| `Ctrl/Cmd+Z` / `Ctrl/Cmd+Y` | Undo / Redo |
| `F1` | Toggle project manager |
| `F2` | Toggle preview |
| `F3` | Open export dialog |

`E.blockInput = true` disables p5 mouse input while any dialog (export, projects) is open.
