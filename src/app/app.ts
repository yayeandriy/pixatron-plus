import { Component, ElementRef, HostListener, OnInit, OnDestroy, ViewChild, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PixelEngine, TOOLS, SHAPES, SHAPE_VARIANTS, TOOL_LABELS, SHAPE_LABELS, VARIANT_LABELS, type Tool, type CellShape } from './pixel-engine';
import { createSketch } from './p5-sketch';
import { exportPNG, exportSpriteSheet, exportSVG, exportGIF, exportVideo, exportHTML, exportGlyph, renderActualSize } from './exporter';
import { ProjectMeta } from './projects';
import {
  dbListProjects, dbGetActiveProjectId, dbSetActiveProjectId,
  dbLoadProjectState, dbSaveProject, dbCreateProject, dbDeleteProject,
  dbRenameProject, dbDuplicateProject, migrateLocalStorageToSQLite,
} from './projects-db';

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

  // ── Projects ──
  projects: ProjectMeta[] = [];
  activeProjectId: string | null = null;
  activeProjectName = 'Untitled';
  projectsOpen = false;
  editingNameId: string | null = null;
  editingNameValue = '';

  // ── Preview ──
  showPreview = false;
  previewDataUrl = '';

  // ── Drag/drop frames ──
  dragIndex: number | null = null;
  dragOverIndex: number | null = null;

  // ── Export ──
  exportOpen = false;
  exportStatus = '';

  @ViewChild('canvasContainer', { static: true }) canvasRef!: ElementRef<HTMLDivElement>;
  @ViewChild('fileImport') fileImportRef!: ElementRef<HTMLInputElement>;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    migrateLocalStorageToSQLite().then(() => this.loadActiveProject());
    this.applyPageBg();
    import('p5').then(p5Module => {
      const P5 = p5Module.default;
      this.p5Instance = new P5(createSketch(this.E), this.canvasRef.nativeElement);
    });
  }

  ngOnDestroy() {
    if (this.previewTimer) clearInterval(this.previewTimer);
  }

  // ── Project management ──

  async loadActiveProject() {
    this.projects = await dbListProjects();
    let id = await dbGetActiveProjectId();

    if (id && await dbLoadProjectState(id)) {
      this.activeProjectId = id;
    } else if (this.projects.length > 0) {
      id = this.projects[0].id;
      this.activeProjectId = id;
    } else {
      // First run — create default project
      this.E.load();
      id = await dbCreateProject(this.E, 'My First Project');
      this.activeProjectId = id;
      this.projects = await dbListProjects();
    }

    const state = await dbLoadProjectState(id!);
    if (state) this.E.loadFromState(state);
    this.activeProjectName = this.projects.find(p => p.id === id)?.name || 'Untitled';
    this.setupSaveCallback();
    this.applyPageBg();
    this.cdr.detectChanges();
  }

  setupSaveCallback() {
    this.E.saveCallback = () => {
      if (this.activeProjectId) {
        dbSaveProject(this.activeProjectId, this.E, this.activeProjectName).then(() => {
          dbListProjects().then(list => {
            this.projects = list;
            this.cdr.detectChanges();
          });
        });
      }
    };
  }

  async switchToProject(id: string) {
    // Save current first
    if (this.activeProjectId) await dbSaveProject(this.activeProjectId, this.E, this.activeProjectName);

    const state = await dbLoadProjectState(id);
    if (!state) return;

    this.E.loadFromState(state);
    this.activeProjectId = id;
    this.activeProjectName = this.projects.find(p => p.id === id)?.name || 'Untitled';
    await dbSetActiveProjectId(id);
    this.setupSaveCallback();
    this.applyPageBg();
    this.projectsOpen = false;
    this.cdr.detectChanges();
  }

  async newProject() {
    if (this.activeProjectId) await dbSaveProject(this.activeProjectId, this.E, this.activeProjectName);
    const newEngine = new PixelEngine();
    newEngine.frames = [newEngine.emptyFrame()];
    const id = await dbCreateProject(newEngine, 'New Project');
    const state = await dbLoadProjectState(id);
    this.E.loadFromState(state!);
    this.activeProjectId = id;
    this.activeProjectName = 'New Project';
    this.projects = await dbListProjects();
    this.setupSaveCallback();
    this.applyPageBg();
    this.projectsOpen = false;
    this.cdr.detectChanges();
  }

  async deleteProjectAction(id: string, e: Event) {
    e.stopPropagation();
    if (this.projects.length <= 1) return; // don't delete last
    await dbDeleteProject(id);
    this.projects = await dbListProjects();
    if (id === this.activeProjectId) await this.switchToProject(this.projects[0].id);
    else this.cdr.detectChanges();
  }

  async duplicateProjectAction(id: string, e: Event) {
    e.stopPropagation();
    const state = await dbLoadProjectState(id);
    if (!state) return;
    const tmpEngine = new PixelEngine();
    tmpEngine.loadFromState(state);
    await dbDuplicateProject(id, tmpEngine);
    this.projects = await dbListProjects();
    this.cdr.detectChanges();
  }

  startRename(p: ProjectMeta, e: Event) {
    e.stopPropagation();
    this.editingNameId = p.id;
    this.editingNameValue = p.name;
    setTimeout(() => (document.getElementById('rename-input') as HTMLInputElement)?.focus(), 50);
  }

  async commitRename() {
    if (!this.editingNameId || !this.editingNameValue.trim()) { this.editingNameId = null; return; }
    await dbRenameProject(this.editingNameId, this.editingNameValue.trim());
    if (this.editingNameId === this.activeProjectId) this.activeProjectName = this.editingNameValue.trim();
    this.projects = await dbListProjects();
    this.editingNameId = null;
    this.cdr.detectChanges();
  }

  // ── Keyboard ──

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const key = e.key;
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (key === 'D' || key === 'd')) { this.E.copyFrame(); e.preventDefault(); return; }
    else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (key === 'E' || key === 'e')) { this.exportAllProjects(); e.preventDefault(); return; }
    else if ((e.metaKey || e.ctrlKey) && key === 'z' && !e.shiftKey) { this.E.undo(); e.preventDefault(); return; }
    else if ((e.metaKey || e.ctrlKey) && (key === 'y' || (key === 'z' && e.shiftKey))) { this.E.redo(); e.preventDefault(); return; }
    // Bail out on any remaining Cmd/Ctrl combos so OS shortcuts are not eaten
    else if (e.metaKey || e.ctrlKey) { return; }
    else if (key === 'Q') { this.E.goFirst(); }
    else if (key === 'E' && e.shiftKey) { this.E.goLast(); }
    else if (key === 'q') { this.E.cycleTool(-1); }
    else if (key === 'e') { this.E.cycleTool(1); }
    else if (key === 'w' || key === 'W') { this.E.onionSkin = !this.E.onionSkin; this.E.save(); }
    else if (key === ' ') { this.E.isPlaying = !this.E.isPlaying; }
    else if (key === 'ArrowLeft' || key === 'a' || key === 'A') { this.E.goPrev(); }
    else if (key === 'ArrowRight' && e.shiftKey) { this.E.goNextOrCreate(); }
    else if (!e.metaKey && !e.ctrlKey && (key === 'ArrowRight' || key === 'd' || key === 'D')) { this.E.goNext(); }
    else if (key === 'Delete' || key === 'Backspace' || (key === 'Z' && e.shiftKey)) { this.E.deleteFrame(); }
    else if (e.key === 'F3') { this.openExport(); e.preventDefault(); return; }
    else if (e.key === 'F2') { this.togglePreview(); e.preventDefault(); return; }
    else if (e.key === 'F1') { this.projectsOpen = !this.projectsOpen; this.E.blockInput = this.projectsOpen; e.preventDefault(); return; }
    else { return; }
    e.preventDefault();
    this.cdr.detectChanges();
  }

  // ── Canvas settings ──
  setCellFill(e: Event) { this.E.cellFillColor = (e.target as HTMLInputElement).value; this.E.save(); }
  setCellEmpty(e: Event) { this.E.cellEmptyColor = (e.target as HTMLInputElement).value; this.E.save(); }
  setPageBg(e: Event) { this.E.pageBg = (e.target as HTMLInputElement).value; this.applyPageBg(); this.E.save(); }
  setGrid(e: Event) { this.E.gridSize = +(e.target as HTMLInputElement).value; this.E.save(); }
  setGap(e: Event) { this.E.gap = +(e.target as HTMLInputElement).value; this.E.save(); }
  setFps(e: Event) { this.E.fps = +(e.target as HTMLInputElement).value; this.E.save(); this.restartPreviewAnim(); }
  setOpacity(e: Event) { this.E.onionSkinOpacity = +(e.target as HTMLInputElement).value; this.E.save(); }
  toggleOnion() { this.E.onionSkin = !this.E.onionSkin; this.E.save(); }
  setTool(t: Tool) { this.E.activeTool = t; }
  setShape(s: CellShape) { this.E.selectShape(s); }
  selectFrame(i: number) { this.E.currentFrame = i; if (this.showPreview) this.updatePreview(); }

  applyPageBg() {
    const el = document.querySelector('.canvas-area') as HTMLElement;
    if (el) el.style.background = this.E.pageBg;
    document.documentElement.style.background = this.E.pageBg;
    document.body.style.background = this.E.pageBg;
  }

  activeVariantLabel(shape: CellShape): string {
    if (this.E.cellShape !== shape) return this.SHAPE_LABELS[shape];
    return this.VARIANT_LABELS[this.E.cellVariant] ?? this.SHAPE_LABELS[shape];
  }

  // ── Preview ──
  togglePreview() {
    this.showPreview = !this.showPreview;
    if (this.showPreview) { this.updatePreview(); this.startPreviewAnim(); }
    else this.stopPreviewAnim();
  }

  private previewFrameIndex = 0;

  updatePreview() {
    const idx = this.previewTimer ? this.previewFrameIndex : this.E.currentFrame;
    this.previewDataUrl = renderActualSize(this.E, idx).toDataURL();
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

  stopPreviewAnim() { if (this.previewTimer) { clearInterval(this.previewTimer); this.previewTimer = null; } }
  restartPreviewAnim() { if (this.showPreview) this.startPreviewAnim(); }

  // ── Drag/drop frames ──
  onFrameDragStart(e: DragEvent, i: number) { this.dragIndex = i; e.dataTransfer!.effectAllowed = 'move'; }
  onFrameDragOver(e: DragEvent, i: number) { e.preventDefault(); e.dataTransfer!.dropEffect = 'move'; this.dragOverIndex = i; }
  onFrameDrop(e: DragEvent, i: number) { e.preventDefault(); if (this.dragIndex !== null && this.dragIndex !== i) this.E.reorderFrame(this.dragIndex, i); this.dragIndex = null; this.dragOverIndex = null; }
  onFrameDragEnd() { this.dragIndex = null; this.dragOverIndex = null; }
  insertBefore(i: number) { this.E.insertFrameAt(i); }

  // ── File save/load ──

  async saveProjectFile(id: string, e: Event) {
    e.stopPropagation();
    if (id === this.activeProjectId) await dbSaveProject(id, this.E, this.activeProjectName);
    const state = await dbLoadProjectState(id);
    if (!state) return;
    const name = this.projects.find(p => p.id === id)?.name || 'project';
    const json = JSON.stringify({ pixatron: '1', name, state }, null, 2);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = name.replace(/[^a-z0-9]/gi, '-').toLowerCase() + '.pixatron';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  triggerImport() {
    this.fileImportRef.nativeElement.click();
  }

  async exportAllProjects() {
    if (this.activeProjectId) await dbSaveProject(this.activeProjectId, this.E, this.activeProjectName);
    const list = await dbListProjects();
    const entries = await Promise.all(list.map(async meta => ({
      name: meta.name,
      state: await dbLoadProjectState(meta.id),
    })));
    const all = entries.filter(p => p.state);
    const json = JSON.stringify({ pixatron: '1', projects: all }, null, 2);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = 'pixatron-all-projects.pixatron';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  onImportFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        if (!parsed.pixatron) return;
        if (parsed.projects) {
          // Bundle import
          let lastId: string | null = null;
          for (const p of parsed.projects) {
            if (!p.state) continue;
            const eng = new PixelEngine();
            eng.loadFromState(p.state);
            lastId = await dbCreateProject(eng, p.name || 'Imported');
          }
          this.projects = await dbListProjects();
          if (lastId) await this.switchToProject(lastId);
        } else if (parsed.state) {
          // Single project import
          const eng = new PixelEngine();
          eng.loadFromState(parsed.state);
          const id = await dbCreateProject(eng, parsed.name || file.name.replace(/\.pixatron$/i, ''));
          this.projects = await dbListProjects();
          await this.switchToProject(id);
        }
      } catch {}
      (e.target as HTMLInputElement).value = '';
    };
    reader.readAsText(file);
  }

  // ── Export ──
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
