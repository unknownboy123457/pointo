/* ====================================================================
   LRD PointCalc — Professional Design Studio & Template Editor Engine
   ====================================================================
   PURPOSE:
   Full-featured, Canva-style mobile & desktop canvas editor.
   Provides:
   - Top Toolbar (Undo, Redo, Data Source binding, Save, Export)
   - Canvas Controls (Zoom in/out/fit, Grid overlay, Snap-to-grid)
   - 8-point resize handles + rotation handle
   - Layer System (Bring forward/back, to front/back, lock, hide, duplicate, delete)
   - Configurable Table Engine (Variable columns, row heights, row gap,
     alternating zebra colors, top-3 podium highlights, pagination)
   - Live tournament standings data binding via LocalDatabaseService & ScoringEngine
   - Autosave & Undo/Redo history stack
   ==================================================================== */

(function (window) {
  'use strict';

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    if (window.escapeHtml) return window.escapeHtml(str);
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  class TemplateEditor {
    constructor() {
      this.currentTemplate = null;
      this.selectedFieldId = null;
      this.userId = null;
      this.zoomScale = 1;
      this.isDragging = false;
      this.isResizing = false;
      this.isRotating = false;
      this.dragStart = { x: 0, y: 0 };
      this.fieldStart = { x: 0, y: 0, w: 0, h: 0, rot: 0 };
      this.activeHandle = null;

      // History & Canvas Controls
      this.undoStack = [];
      this.redoStack = [];
      this.maxHistory = 40;
      this.showGrid = true;
      this.snapToGrid = true;
      this.gridSize = 10;
      this.activeDataContext = null;

      // Callbacks
      this.onSaveCallback = null;
      this.onCloseCallback = null;

      // DOM elements cache
      this.dom = {};
    }

    /**
     * Initialize editor DOM bindings
     */
    init(elements = {}) {
      this.dom = {
        container: elements.container || document.getElementById('screen-template-editor'),
        canvasViewport: elements.canvasViewport || document.getElementById('te-canvas-viewport'),
        canvasStage: elements.canvasStage || document.getElementById('te-canvas-stage'),
        templateNameInput: elements.templateNameInput || document.getElementById('te-template-name'),
        btnBack: elements.btnBack || document.getElementById('te-btn-back'),
        btnUndo: elements.btnUndo || document.getElementById('te-btn-undo'),
        btnRedo: elements.btnRedo || document.getElementById('te-btn-redo'),
        selectDataSource: elements.selectDataSource || document.getElementById('te-select-datasource'),
        btnSave: elements.btnSave || document.getElementById('te-btn-save'),
        btnPreview: elements.btnPreview || document.getElementById('te-btn-preview'),
        btnExport: elements.btnExport || document.getElementById('te-btn-export'),

        // Canvas Controls
        btnZoomOut: elements.btnZoomOut || document.getElementById('te-btn-zoom-out'),
        btnZoomIn: elements.btnZoomIn || document.getElementById('te-btn-zoom-in'),
        btnZoomFit: elements.btnZoomFit || document.getElementById('te-btn-zoom-fit'),
        zoomVal: elements.zoomVal || document.getElementById('te-zoom-val'),
        btnToggleGrid: elements.btnToggleGrid || document.getElementById('te-btn-toggle-grid'),
        btnToggleSnap: elements.btnToggleSnap || document.getElementById('te-btn-toggle-snap'),

        // Bottom Action Bar
        btnAddField: elements.btnAddField || document.getElementById('te-btn-add-field'),
        btnTableEngine: elements.btnTableEngine || document.getElementById('te-btn-table-engine'),
        btnFonts: elements.btnFonts || document.getElementById('te-btn-fonts'),
        btnColors: elements.btnColors || document.getElementById('te-btn-colors'),
        btnBackground: elements.btnBackground || document.getElementById('te-btn-background'),
        btnLayers: elements.btnLayers || document.getElementById('te-btn-layers'),
        btnInfo: elements.btnInfo || document.getElementById('te-btn-info'),

        // Sheets & Drawers
        propsSheet: elements.propsSheet || document.getElementById('te-props-sheet'),
        tableEngineSheet: elements.tableEngineSheet || document.getElementById('te-table-engine-sheet'),
        layersSheet: elements.layersSheet || document.getElementById('te-layers-sheet'),
        fontsSheet: elements.fontsSheet || document.getElementById('te-fonts-sheet'),
        colorsSheet: elements.colorsSheet || document.getElementById('te-colors-sheet'),
        backgroundSheet: elements.backgroundSheet || document.getElementById('te-background-sheet'),
        infoDrawer: elements.infoDrawer || document.getElementById('te-info-drawer'),
        addFieldModal: elements.addFieldModal || document.getElementById('te-add-field-modal'),
        exportModal: elements.exportModal || document.getElementById('te-export-modal'),
        btnExportModalClose: elements.btnExportModalClose || document.getElementById('te-export-modal-close'),
        btnOptExportPNG: elements.btnOptExportPNG || document.getElementById('te-opt-export-png'),
        btnOptExportTheme: elements.btnOptExportTheme || document.getElementById('te-opt-export-theme'),
        btnOptExportPDF: elements.btnOptExportPDF || document.getElementById('te-opt-export-pdf'),

        // Auto-Configure Table Modal
        autoTableModal: elements.autoTableModal || document.getElementById('te-auto-table-modal'),
        btnAutoTableClose: elements.btnAutoTableClose || document.getElementById('te-auto-table-modal-close'),
        btnAutoTableApply: elements.btnAutoTableApply || document.getElementById('te-btn-autotbl-apply'),
        btnAutoTablePreview: elements.btnAutoTablePreview || document.getElementById('te-btn-autotbl-preview'),
        btnAutoTableSaveTheme: elements.btnAutoTableSaveTheme || document.getElementById('te-btn-autotbl-save-theme'),
        selectAutoTablePreset: elements.selectAutoTablePreset || document.getElementById('te-autotbl-preset'),
      };

      this.bindEvents();
    }

    /**
     * Bind UI event listeners
     */
    bindEvents() {
      // Top bar actions
      this.dom.btnBack?.addEventListener('click', () => this.handleBack());
      this.dom.btnSave?.addEventListener('click', () => this.handleSave());
      this.dom.btnPreview?.addEventListener('click', () => this.handlePreview());
      this.dom.btnExport?.addEventListener('click', () => this.handleExport());
      this.dom.btnUndo?.addEventListener('click', () => this.undo());
      this.dom.btnRedo?.addEventListener('click', () => this.redo());

      // Data source selector
      this.dom.selectDataSource?.addEventListener('change', (e) => this.setDataSource(e.target.value));

      // Canvas controls
      this.dom.btnZoomIn?.addEventListener('click', () => this.zoomIn());
      this.dom.btnZoomOut?.addEventListener('click', () => this.zoomOut());
      this.dom.btnZoomFit?.addEventListener('click', () => this.fitCanvasToViewport());
      this.dom.btnToggleGrid?.addEventListener('click', () => this.toggleGrid());
      this.dom.btnToggleSnap?.addEventListener('click', () => this.toggleSnap());

      // Name change
      this.dom.templateNameInput?.addEventListener('input', (e) => {
        if (this.currentTemplate) {
          this.currentTemplate.name = e.target.value.trim() || 'Untitled Template';
          this.autosave();
        }
      });

      // Bottom bar actions
      this.dom.btnAddField?.addEventListener('click', () => this.openAddFieldModal());
      this.dom.btnTableEngine?.addEventListener('click', () => this.openTableEngineSheet());
      this.dom.btnFonts?.addEventListener('click', () => this.openFontsSheet());
      this.dom.btnColors?.addEventListener('click', () => this.openColorsSheet());
      this.dom.btnBackground?.addEventListener('click', () => this.openBackgroundSheet());
      this.dom.btnLayers?.addEventListener('click', () => this.openLayersSheet());
      this.dom.btnInfo?.addEventListener('click', () => this.openInfoDrawer());

      // Export modal options
      this.dom.btnExportModalClose?.addEventListener('click', () => this.closeExportModal());
      this.dom.btnOptExportPNG?.addEventListener('click', () => this.exportAsPNG());
      this.dom.btnOptExportTheme?.addEventListener('click', () => this.exportAsTheme());
      this.dom.btnOptExportPDF?.addEventListener('click', () => this.exportAsPDF());

      // Auto-Configure Table Modal Actions
      this.dom.btnAutoTableClose?.addEventListener('click', () => this.closeAutoTableModal());
      this.dom.btnAutoTableApply?.addEventListener('click', () => this.applyAutoTableFromModal());
      this.dom.btnAutoTablePreview?.addEventListener('click', () => this.previewAutoTableFromModal());
      this.dom.btnAutoTableSaveTheme?.addEventListener('click', () => this.saveAutoTableAsTheme());
      this.dom.selectAutoTablePreset?.addEventListener('change', (e) => this.handleAutoTablePresetChange(e.target.value));

      // Close modal backdrops
      document.querySelectorAll('.te-modal-backdrop').forEach((el) => {
        el.addEventListener('click', (e) => {
          if (e.target === el) {
            el.classList.remove('open');
            el.style.display = 'none';
          }
        });
      });

      // Window resize re-scales canvas to fit viewport
      if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener('resize', () => {
          if (this.isOpen()) this.fitCanvasToViewport();
        });

        // Global keyboard shortcuts (Ctrl+Z: Undo, Ctrl+Y / Ctrl+Shift+Z: Redo)
        window.addEventListener('keydown', (e) => {
          if (!this.isOpen()) return;
          if ((e.ctrlKey || e.metaKey) && !e.altKey) {
            if (e.key.toLowerCase() === 'z') {
              if (e.shiftKey) {
                e.preventDefault();
                this.redo();
              } else {
                e.preventDefault();
                this.undo();
              }
            } else if (e.key.toLowerCase() === 'y') {
              e.preventDefault();
              this.redo();
            }
          }
        });
      }
    }

    /**
     * Open editor with a given template
     *
     * @param {Object} template - Template to edit (clone or new)
     * @param {string} userId - Current user ID
     * @param {Object} [dataContext] - Optional tournament context
     */
    open(template, userId, dataContext) {
      if (!this.dom.container && typeof document !== 'undefined') {
        this.init();
      }
      this.userId = userId;
      this.currentTemplate = JSON.parse(JSON.stringify(template));
      this.selectedFieldId = null;
      this.undoStack = [];
      this.redoStack = [];
      this.activeDataContext = dataContext || this.buildDefaultDataContext();

      if (this.dom.templateNameInput) {
        this.dom.templateNameInput.value = this.currentTemplate.name || 'My Point Table';
      }

      if (this.dom.container) {
        this.dom.container.classList.add('active');
        this.dom.container.style.display = 'flex';
      }

      // Hide app bottom nav while editor is active
      const bottomNav = document.getElementById('bottom-nav');
      if (bottomNav) bottomNav.style.display = 'none';

      this.populateDataSourceSelector();
      this.render();
      this.pushState('Initial');
      setTimeout(() => this.fitCanvasToViewport(), 100);
    }

    /**
     * Close the editor
     */
    close() {
      if (this.dom.container) {
        this.dom.container.classList.remove('active');
        this.dom.container.style.display = 'none';
      }
      this.closeAllDrawers();

      if (typeof this.onCloseCallback === 'function') {
        this.onCloseCallback();
      }
    }

    closeAllDrawers() {
      this.closePropsSheet();
      this.closeTableEngineSheet();
      this.closeLayersSheet();
      this.closeFontsSheet();
      this.closeColorsSheet();
      this.closeBackgroundSheet();
      this.closeInfoDrawer();
    }

    isOpen() {
      return this.dom.container && this.dom.container.classList.contains('active');
    }

    // ================================================================
    // UNDO / REDO & AUTOSAVE
    // ================================================================

    pushState(label = 'Action') {
      if (!this.currentTemplate) return;
      this.undoStack.push(JSON.parse(JSON.stringify(this.currentTemplate)));
      if (this.undoStack.length > this.maxHistory) {
        this.undoStack.shift();
      }
      this.redoStack = [];
      this.updateHistoryButtons();
      this.autosave();
    }

    undo() {
      if (this.undoStack.length <= 1) return;
      const current = this.undoStack.pop();
      this.redoStack.push(current);
      const prev = this.undoStack[this.undoStack.length - 1];
      if (prev) {
        this.currentTemplate = JSON.parse(JSON.stringify(prev));
        this.render();
        const selected = this.currentTemplate.fields.find((f) => f.id === this.selectedFieldId);
        if (selected) this.openPropsSheet(selected);
        else this.closePropsSheet();
      }
      this.updateHistoryButtons();
      this.autosave();
    }

    redo() {
      if (this.redoStack.length === 0) return;
      const next = this.redoStack.pop();
      this.undoStack.push(JSON.parse(JSON.stringify(next)));
      this.currentTemplate = JSON.parse(JSON.stringify(next));
      this.render();
      const selected = this.currentTemplate.fields.find((f) => f.id === this.selectedFieldId);
      if (selected) this.openPropsSheet(selected);
      else this.closePropsSheet();
      this.updateHistoryButtons();
      this.autosave();
    }

    updateHistoryButtons() {
      if (this.dom.btnUndo) {
        this.dom.btnUndo.disabled = !this.canUndo();
      }
      if (this.dom.btnRedo) {
        this.dom.btnRedo.disabled = !this.canRedo();
      }
    }

    canUndo() {
      return this.undoStack.length > 1;
    }

    canRedo() {
      return this.redoStack.length > 0;
    }

    getFieldById(fieldId) {
      if (!this.currentTemplate || !Array.isArray(this.currentTemplate.fields)) return null;
      return this.currentTemplate.fields.find((f) => f.id === fieldId) || null;
    }

    autosave() {
      if (!this.userId || !this.currentTemplate) return;
      try {
        localStorage.setItem(`lrd_template_draft_${this.userId}`, JSON.stringify(this.currentTemplate));
      } catch (e) {
        // quota exceeded or private mode, silent
      }
    }

    // ================================================================
    // CANVAS CONTROLS (Zoom, Grid, Snap)
    // ================================================================

    setZoom(scale) {
      this.zoomScale = Math.max(0.15, Math.min(2.5, scale));
      if (this.dom.canvasStage) {
        this.dom.canvasStage.style.transform = `scale(${this.zoomScale})`;
        this.dom.canvasStage.style.transformOrigin = 'center center';
      }
      if (this.dom.zoomVal) {
        this.dom.zoomVal.textContent = `${Math.round(this.zoomScale * 100)}%`;
      }
    }

    zoomIn() {
      this.setZoom(this.zoomScale * 1.15);
    }

    zoomOut() {
      this.setZoom(this.zoomScale / 1.15);
    }

    fitCanvasToViewport() {
      if (!this.dom.canvasViewport || !this.dom.canvasStage || !this.currentTemplate) return;

      const vpW = this.dom.canvasViewport.clientWidth - 48;
      const vpH = this.dom.canvasViewport.clientHeight - 48;

      const baseW = this.currentTemplate.canvas?.width || 1080;
      const baseH = this.currentTemplate.canvas?.height || 1350;

      const scaleX = vpW / baseW;
      const scaleY = vpH / baseH;
      const scale = Math.min(scaleX, scaleY, 0.95);

      this.setZoom(Math.max(0.2, scale));
    }

    toggleGrid(force) {
      this.showGrid = typeof force === 'boolean' ? force : !this.showGrid;
      if (this.dom.canvasStage) {
        this.dom.canvasStage.classList.toggle('show-grid', this.showGrid);
      }
      if (this.dom.btnToggleGrid) {
        this.dom.btnToggleGrid.classList.toggle('active', this.showGrid);
      }
    }

    toggleSnap(force) {
      this.snapToGrid = typeof force === 'boolean' ? force : !this.snapToGrid;
      if (this.dom.btnToggleSnap) {
        this.dom.btnToggleSnap.classList.toggle('active', this.snapToGrid);
      }
    }

    snapValue(val) {
      if (!this.snapToGrid) return Math.round(val);
      return Math.round(val / this.gridSize) * this.gridSize;
    }

    // ================================================================
    // CANVAS STAGE RENDERING
    // ================================================================

    render() {
      if (!this.currentTemplate || !this.dom.canvasStage) return;

      const stage = this.dom.canvasStage;
      stage.innerHTML = '';

      const baseW = this.currentTemplate.canvas?.width || 1080;
      const baseH = this.currentTemplate.canvas?.height || 1350;

      stage.style.width = `${baseW}px`;
      stage.style.height = `${baseH}px`;
      stage.style.position = 'relative';

      // 1. Apply background
      window.TemplateRenderer?.applyBackgroundToElement(this.currentTemplate.background, stage);

      // Context with template info and tournament data
      const context = {
        tournament: this.activeDataContext?.tournament || { name: this.currentTemplate.info?.tournamentName || 'LRD TOURNAMENT' },
        match: this.activeDataContext?.match || { match_number: 1 },
        info: this.currentTemplate.info || {},
        mode: this.activeDataContext?.mode || 'overall',
      };

      // 2. Render all fields as interactive elements
      (this.currentTemplate.fields || []).forEach((field) => {
        const fieldEl = this.createEditableFieldElement(field, context);
        stage.appendChild(fieldEl);
      });

      // Deselect when clicking empty stage area
      stage.onclick = (e) => {
        if (e.target === stage) {
          this.deselectField();
        }
      };
    }

    /**
     * Create an interactive DOM element with 8-way selection & transform handles
     */
    createEditableFieldElement(field, context) {
      const el = document.createElement('div');
      el.className = `te-editable-field field-type-${field.type}`;
      el.dataset.fieldId = field.id;

      el.style.position = 'absolute';
      el.style.left = `${field.x}px`;
      el.style.top = `${field.y}px`;
      el.style.width = `${field.width}px`;
      el.style.height = `${field.height}px`;
      el.style.boxSizing = 'border-box';
      el.style.cursor = field.locked ? 'default' : 'move';
      el.style.userSelect = 'none';

      if (field.opacity !== undefined) el.style.opacity = field.hidden ? 0.35 : field.opacity;
      if (field.borderRadius) el.style.borderRadius = `${field.borderRadius}px`;
      if (field.backgroundColor) el.style.backgroundColor = field.backgroundColor;
      if (field.border) el.style.border = field.border;

      if (field.rotation) {
        el.style.transform = `rotate(${field.rotation}deg)`;
        el.style.transformOrigin = 'center center';
      }

      const isSelected = this.selectedFieldId === field.id;
      if (isSelected) {
        el.classList.add('is-selected');
      }
      if (field.locked) {
        el.classList.add('is-locked');
        const badge = document.createElement('div');
        badge.className = 'te-lock-badge';
        badge.innerHTML = '🔒 Locked';
        el.appendChild(badge);
      }
      if (field.hidden) {
        el.classList.add('is-hidden');
      }

      // Inner content container
      const contentEl = document.createElement('div');
      contentEl.className = 'te-field-inner';
      contentEl.style.width = '100%';
      contentEl.style.height = '100%';
      contentEl.style.pointerEvents = 'none';

      if (field.type === 'text') {
        contentEl.style.display = 'flex';
        contentEl.style.alignItems = 'center';
        contentEl.style.justifyContent =
          field.alignment === 'center' ? 'center' : field.alignment === 'right' ? 'flex-end' : 'flex-start';
        contentEl.style.fontSize = `${field.fontSize || 20}px`;
        contentEl.style.fontFamily = field.fontFamily || 'Inter, sans-serif';
        contentEl.style.fontWeight = field.fontWeight || '600';
        contentEl.style.color = field.color || '#ffffff';
        contentEl.style.letterSpacing = field.letterSpacing || 'normal';
        contentEl.style.whiteSpace = 'nowrap';
        contentEl.style.overflow = 'hidden';
        contentEl.style.padding = field.padding || '0 8px';

        const raw = field.content || '';
        contentEl.textContent = window.TemplateVariables
          ? window.TemplateVariables.resolveVariables(raw, context)
          : raw;
      } else if (field.type === 'leaderboard') {
        contentEl.style.overflow = 'hidden';
        contentEl.style.width = '100%';
        contentEl.style.height = '100%';
        const rowsToRender = this.getActiveLeaderboard(field);
        if (window.TemplateRenderer?.renderLeaderboardFieldDOM) {
          window.TemplateRenderer.renderLeaderboardFieldDOM(field, contentEl, rowsToRender, context);
        } else {
          const zeroedField = { ...field, x: 0, y: 0 };
          window.TemplateRenderer?.renderToDOM(
            { canvas: { width: field.width, height: field.height }, background: null, fields: [zeroedField] },
            { leaderboard: rowsToRender, info: context.info },
            contentEl
          );
        }
      } else if (field.type === 'image' || field.type === 'logo') {
        contentEl.style.display = 'flex';
        contentEl.style.alignItems = 'center';
        contentEl.style.justifyContent = 'center';
        if (field.src) {
          const img = document.createElement('img');
          img.src = field.src;
          img.style.maxWidth = '100%';
          img.style.maxHeight = '100%';
          img.style.objectFit = field.fit || 'contain';
          contentEl.appendChild(img);
        } else {
          contentEl.style.border = '1px dashed #d4af37';
          contentEl.style.color = '#d4af37';
          contentEl.textContent = field.type === 'logo' ? 'LOGO' : 'IMAGE';
        }
      } else if (field.type === 'shape' || field.type === 'rectangle') {
        contentEl.style.width = '100%';
        contentEl.style.height = '100%';
        contentEl.style.backgroundColor = field.backgroundColor || 'rgba(212, 175, 55, 0.25)';
        if (field.borderRadius) contentEl.style.borderRadius = `${field.borderRadius}px`;
        if (field.border) contentEl.style.border = field.border;
      }

      el.appendChild(contentEl);

      // Add 8 resize handles + rotation handle if selected and not locked
      if (isSelected && !field.locked) {
        this.appendResizeHandles(el, field);
      }

      // Pointer event listeners
      el.addEventListener('pointerdown', (e) => this.onFieldPointerDown(e, field, el));

      return el;
    }

    /**
     * Append 8 perimeter resize handles and 1 rotation handle
     */
    appendResizeHandles(el, field) {
      // 4 corners + 4 edges
      ['tl', 't', 'tr', 'r', 'br', 'b', 'bl', 'l'].forEach((pos) => {
        const handle = document.createElement('div');
        handle.className = `te-resize-handle handle-${pos}`;
        handle.dataset.handle = pos;
        el.appendChild(handle);
      });

      // Rotation handle with indicator line
      const rotLine = document.createElement('div');
      rotLine.className = 'handle-rot-line';
      el.appendChild(rotLine);

      const rotHandle = document.createElement('div');
      rotHandle.className = 'te-resize-handle handle-rot';
      rotHandle.dataset.handle = 'rot';
      rotHandle.title = 'Rotate element';
      el.appendChild(rotHandle);
    }

    /**
     * Handle pointer down on field, resize handle, or rotation handle
     */
    onFieldPointerDown(e, field, el) {
      e.stopPropagation();

      const handle = e.target.closest('.te-resize-handle');
      const handleType = handle ? handle.dataset.handle : null;

      if (handleType === 'rot') {
        this.isRotating = true;
        this.isDragging = false;
        this.isResizing = false;
        this.activeHandle = 'rot';
      } else if (handleType) {
        this.isResizing = true;
        this.isDragging = false;
        this.isRotating = false;
        this.activeHandle = handleType;
      } else {
        if (field.locked) {
          this.selectField(field.id);
          return;
        }
        this.isDragging = true;
        this.isResizing = false;
        this.isRotating = false;
        this.activeHandle = null;
      }

      this.selectField(field.id);

      this.dragStart = { x: e.clientX, y: e.clientY };
      this.fieldStart = {
        x: field.x,
        y: field.y,
        w: field.width,
        h: field.height,
        rot: field.rotation || 0,
      };

      const rect = el.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      let hasMoved = false;

      const onPointerMove = (moveEvent) => {
        hasMoved = true;

        if (this.isRotating) {
          const rad = Math.atan2(moveEvent.clientY - centerY, moveEvent.clientX - centerX);
          let deg = Math.round((rad * 180) / Math.PI + 90);
          if (deg < 0) deg += 360;
          deg = deg % 360;

          // Snap cardinal angles (0, 90, 180, 270) within 4 degrees
          if (deg <= 4 || deg >= 356) deg = 0;
          else if (Math.abs(deg - 90) <= 4) deg = 90;
          else if (Math.abs(deg - 180) <= 4) deg = 180;
          else if (Math.abs(deg - 270) <= 4) deg = 270;

          field.rotation = deg;
          el.style.transform = `rotate(${deg}deg)`;
          this.updatePropsSheetValues(field);
          return;
        }

        const dx = (moveEvent.clientX - this.dragStart.x) / this.zoomScale;
        const dy = (moveEvent.clientY - this.dragStart.y) / this.zoomScale;

        if (this.isDragging) {
          let newX = this.fieldStart.x + dx;
          let newY = this.fieldStart.y + dy;
          if (this.snapToGrid) {
            newX = this.snapValue(newX);
            newY = this.snapValue(newY);
          } else {
            newX = Math.round(newX);
            newY = Math.round(newY);
          }
          field.x = newX;
          field.y = newY;
          this.updateFieldElementPosition(field);
          this.updatePropsSheetValues(field);
        } else if (this.isResizing) {
          this.calculateResize(field, dx, dy, this.activeHandle);
          this.updateFieldElementPosition(field);
          this.updatePropsSheetValues(field);
        }
      };

      const onPointerUp = () => {
        if (hasMoved) {
          this.pushState('Transform Element');
        }
        this.isDragging = false;
        this.isResizing = false;
        this.isRotating = false;
        this.activeHandle = null;
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
      };

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    }

    /**
     * Calculate 8-way resize bounds with grid snapping
     */
    calculateResize(field, dx, dy, handle) {
      const minW = 20;
      const minH = 20;

      let newW = this.fieldStart.w;
      let newH = this.fieldStart.h;
      let newX = this.fieldStart.x;
      let newY = this.fieldStart.y;

      if (handle === 'br') {
        newW = Math.max(minW, this.fieldStart.w + dx);
        newH = Math.max(minH, this.fieldStart.h + dy);
      } else if (handle === 'tr') {
        newW = Math.max(minW, this.fieldStart.w + dx);
        newH = Math.max(minH, this.fieldStart.h - dy);
        newY = this.fieldStart.y + (this.fieldStart.h - newH);
      } else if (handle === 'bl') {
        newW = Math.max(minW, this.fieldStart.w - dx);
        newX = this.fieldStart.x + (this.fieldStart.w - newW);
        newH = Math.max(minH, this.fieldStart.h + dy);
      } else if (handle === 'tl') {
        newW = Math.max(minW, this.fieldStart.w - dx);
        newH = Math.max(minH, this.fieldStart.h - dy);
        newX = this.fieldStart.x + (this.fieldStart.w - newW);
        newY = this.fieldStart.y + (this.fieldStart.h - newH);
      } else if (handle === 'r') {
        newW = Math.max(minW, this.fieldStart.w + dx);
      } else if (handle === 'l') {
        newW = Math.max(minW, this.fieldStart.w - dx);
        newX = this.fieldStart.x + (this.fieldStart.w - newW);
      } else if (handle === 'b') {
        newH = Math.max(minH, this.fieldStart.h + dy);
      } else if (handle === 't') {
        newH = Math.max(minH, this.fieldStart.h - dy);
        newY = this.fieldStart.y + (this.fieldStart.h - newH);
      }

      if (this.snapToGrid) {
        field.x = this.snapValue(newX);
        field.y = this.snapValue(newY);
        field.width = Math.max(minW, this.snapValue(newW));
        field.height = Math.max(minH, this.snapValue(newH));
      } else {
        field.x = Math.round(newX);
        field.y = Math.round(newY);
        field.width = Math.max(minW, Math.round(newW));
        field.height = Math.max(minH, Math.round(newH));
      }
    }

    /**
     * Fast DOM update for position/size without re-rendering entire stage
     */
    updateFieldElementPosition(field) {
      const el = this.dom.canvasStage?.querySelector(`[data-field-id="${field.id}"]`);
      if (el) {
        el.style.left = `${field.x}px`;
        el.style.top = `${field.y}px`;
        el.style.width = `${field.width}px`;
        el.style.height = `${field.height}px`;
      }
    }

    /**
     * Select a field and open properties panel
     */
    selectField(fieldId) {
      this.selectedFieldId = fieldId;
      const field = this.currentTemplate.fields.find((f) => f.id === fieldId);
      if (field) {
        this.openPropsSheet(field);
      }
      this.render();
    }

    /**
     * Deselect current field
     */
    deselectField() {
      this.selectedFieldId = null;
      this.closePropsSheet();
      this.render();
    }

    // ================================================================
    // LAYER & ELEMENT MANAGEMENT (Ordering, Lock, Duplicate, Delete)
    // ================================================================

    lockField(fieldId) {
      const field = this.currentTemplate.fields.find((f) => f.id === fieldId);
      if (field) {
        field.locked = true;
        this.pushState('Lock Element');
        this.render();
        this.openPropsSheet(field);
      }
    }

    unlockField(fieldId) {
      const field = this.currentTemplate.fields.find((f) => f.id === fieldId);
      if (field) {
        field.locked = false;
        this.pushState('Unlock Element');
        this.render();
        this.openPropsSheet(field);
      }
    }

    toggleFieldLock(fieldId) {
      const field = this.currentTemplate.fields.find((f) => f.id === fieldId);
      if (field) {
        field.locked = !field.locked;
        this.pushState(field.locked ? 'Lock Element' : 'Unlock Element');
        this.render();
        this.openPropsSheet(field);
      }
    }

    toggleFieldVisibility(fieldId) {
      const field = this.currentTemplate.fields.find((f) => f.id === fieldId);
      if (field) {
        field.hidden = !field.hidden;
        this.pushState(field.hidden ? 'Hide Element' : 'Show Element');
        this.render();
        this.openPropsSheet(field);
      }
    }

    bringForward(fieldId) {
      const idx = this.currentTemplate.fields.findIndex((f) => f.id === fieldId);
      if (idx >= 0 && idx < this.currentTemplate.fields.length - 1) {
        const temp = this.currentTemplate.fields[idx];
        this.currentTemplate.fields[idx] = this.currentTemplate.fields[idx + 1];
        this.currentTemplate.fields[idx + 1] = temp;
        this.pushState('Bring Forward');
        this.render();
      }
    }

    sendBackward(fieldId) {
      const idx = this.currentTemplate.fields.findIndex((f) => f.id === fieldId);
      if (idx > 0) {
        const temp = this.currentTemplate.fields[idx];
        this.currentTemplate.fields[idx] = this.currentTemplate.fields[idx - 1];
        this.currentTemplate.fields[idx - 1] = temp;
        this.pushState('Send Backward');
        this.render();
      }
    }

    bringToFront(fieldId) {
      const idx = this.currentTemplate.fields.findIndex((f) => f.id === fieldId);
      if (idx >= 0 && idx < this.currentTemplate.fields.length - 1) {
        const item = this.currentTemplate.fields.splice(idx, 1)[0];
        this.currentTemplate.fields.push(item);
        this.pushState('Bring to Front');
        this.render();
      }
    }

    sendToBack(fieldId) {
      const idx = this.currentTemplate.fields.findIndex((f) => f.id === fieldId);
      if (idx > 0) {
        const item = this.currentTemplate.fields.splice(idx, 1)[0];
        this.currentTemplate.fields.unshift(item);
        this.pushState('Send to Back');
        this.render();
      }
    }

    duplicateField(fieldId) {
      const field = this.currentTemplate.fields.find((f) => f.id === fieldId);
      if (!field) return;
      const copy = JSON.parse(JSON.stringify(field));
      copy.id = `f_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 4)}`;
      copy.x = (copy.x || 0) + 20;
      copy.y = (copy.y || 0) + 20;
      copy.locked = false;
      this.currentTemplate.fields.push(copy);
      this.pushState('Duplicate Element');
      this.render();
      this.selectField(copy.id);
    }

    deleteField(fieldId) {
      this.currentTemplate.fields = this.currentTemplate.fields.filter((f) => f.id !== fieldId);
      this.deselectField();
      this.pushState('Delete Element');
    }

    // ================================================================
    // PROPERTIES PANEL / BOTTOM SHEET
    // ================================================================

    openPropsSheet(field) {
      if (!this.dom.propsSheet) return;

      this.dom.propsSheet.innerHTML = this.buildPropsSheetHTML(field);
      this.dom.propsSheet.classList.add('open');
      this.bindPropsSheetEvents(field);
    }

    closePropsSheet() {
      this.dom.propsSheet?.classList.remove('open');
    }

    buildPropsSheetHTML(field) {
      const isText = field.type === 'text';
      const isTable = field.type === 'leaderboard';
      const isShape = field.type === 'shape' || field.type === 'rectangle';

      return `
        <div class="te-sheet-header">
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="te-sheet-title">Edit ${field.type.toUpperCase()}</span>
            ${field.locked ? '<span style="font-size:11px; background:rgba(239,68,68,0.2); color:#ef4444; padding:2px 6px; border-radius:4px; font-weight:800;">LOCKED</span>' : ''}
          </div>
          <div class="te-sheet-actions">
            <button type="button" class="te-icon-action" id="te-prop-lock" title="${field.locked ? 'Unlock' : 'Lock'}">
              ${field.locked ? '🔓' : '🔒'}
            </button>
            <button type="button" class="te-icon-action" id="te-prop-visibility" title="${field.hidden ? 'Show' : 'Hide'}">
              ${field.hidden ? '👁️' : '🙈'}
            </button>
            <button type="button" class="te-icon-action" id="te-prop-duplicate" title="Duplicate">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
            </button>
            <button type="button" class="te-icon-action text-danger" id="te-prop-delete" title="Delete">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
            </button>
            <button type="button" class="te-icon-action" id="te-prop-close">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </div>

        <div class="te-sheet-scroll">
          <!-- Layer Z-Order Quick Actions -->
          <div class="te-prop-group" style="padding-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.06);">
            <label class="te-prop-label">Layer Arrangement</label>
            <div style="display:flex; gap:6px;">
              <button type="button" class="te-chip-btn" id="te-layer-bring-fwd" title="Bring Forward">Bring Fwd ↑</button>
              <button type="button" class="te-chip-btn" id="te-layer-send-back" title="Send Backward">Send Back ↓</button>
              <button type="button" class="te-chip-btn" id="te-layer-to-front" title="Bring to Front">To Front ⤒</button>
              <button type="button" class="te-chip-btn" id="te-layer-to-back" title="Send to Back">To Back ⤓</button>
            </div>
          </div>

          ${isText ? `
            <div class="te-prop-group">
              <label class="te-prop-label">Content / Variable</label>
              <input type="text" class="te-prop-input" id="te-prop-content" value="${escapeHtml(field.content || '')}" />
              <div class="te-var-chips">
                <button type="button" class="te-chip-btn" data-insert-var="{{tournament.name}}">Tourn Name</button>
                <button type="button" class="te-chip-btn" data-insert-var="{{tournament.matchNumber}}">Match #</button>
                <button type="button" class="te-chip-btn" data-insert-var="{{tournament.youtube}}">YouTube</button>
                <button type="button" class="te-chip-btn" data-insert-var="{{tournament.instagram}}">Instagram</button>
              </div>
            </div>
          ` : ''}

          <div class="te-prop-row">
            <div class="te-prop-group">
              <label class="te-prop-label">Width (px)</label>
              <input type="number" class="te-prop-input" id="te-prop-w" value="${field.width}" />
            </div>
            <div class="te-prop-group">
              <label class="te-prop-label">Height (px)</label>
              <input type="number" class="te-prop-input" id="te-prop-h" value="${field.height}" />
            </div>
          </div>

          <div class="te-prop-row">
            <div class="te-prop-group">
              <label class="te-prop-label">X Position</label>
              <input type="number" class="te-prop-input" id="te-prop-x" value="${field.x}" />
            </div>
            <div class="te-prop-group">
              <label class="te-prop-label">Y Position</label>
              <input type="number" class="te-prop-input" id="te-prop-y" value="${field.y}" />
            </div>
          </div>

          <div class="te-prop-row">
            <div class="te-prop-group">
              <label class="te-prop-label">Rotation (°)</label>
              <input type="number" class="te-prop-input" id="te-prop-rotation" value="${field.rotation || 0}" min="0" max="360" />
            </div>
            <div class="te-prop-group">
              <label class="te-prop-label">Border Radius</label>
              <input type="number" class="te-prop-input" id="te-prop-radius" value="${field.borderRadius || 0}" min="0" max="100" />
            </div>
          </div>

          ${isText ? `
            <div class="te-prop-row">
              <div class="te-prop-group">
                <label class="te-prop-label">Font Size</label>
                <input type="number" class="te-prop-input" id="te-prop-size" value="${field.fontSize || 20}" />
              </div>
              <div class="te-prop-group">
                <label class="te-prop-label">Color</label>
                <input type="color" class="te-prop-color" id="te-prop-color" value="${field.color || '#ffffff'}" />
              </div>
            </div>

            <div class="te-prop-group">
              <label class="te-prop-label">Alignment</label>
              <div class="te-align-group">
                <button type="button" class="te-align-btn ${field.alignment === 'left' ? 'active' : ''}" data-align="left">Left</button>
                <button type="button" class="te-align-btn ${field.alignment === 'center' ? 'active' : ''}" data-align="center">Center</button>
                <button type="button" class="te-align-btn ${field.alignment === 'right' ? 'active' : ''}" data-align="right">Right</button>
              </div>
            </div>
          ` : ''}

          ${isShape ? `
            <div class="te-prop-row">
              <div class="te-prop-group">
                <label class="te-prop-label">Fill Color</label>
                <input type="color" class="te-prop-color" id="te-prop-bgcolor" value="${field.backgroundColor || '#d4af37'}" />
              </div>
              <div class="te-prop-group">
                <label class="te-prop-label">Border</label>
                <input type="text" class="te-prop-input" id="te-prop-border" value="${escapeHtml(field.border || '')}" placeholder="1px solid #d4af37" />
              </div>
            </div>
          ` : ''}

          ${isTable ? `
            <div style="background:rgba(212,175,55,0.08); border:1px solid rgba(212,175,55,0.3); border-radius:8px; padding:12px; margin-bottom:12px;">
              <span style="font-size:12px; font-weight:800; color:var(--gold-300);">⚡ Point Table Configurator</span>
              <p style="font-size:11px; color:#cbd5e1; margin:4px 0 8px;">Access full column toggles, row gaps, and pagination engine.</p>
              <button type="button" class="te-cat-item-btn te-cat-item-btn--highlight" id="te-btn-launch-table-engine" style="width:100%; text-align:center;">
                Open Full Table Engine
              </button>
            </div>
          ` : ''}

          <div class="te-prop-group">
            <label class="te-prop-label">Opacity (${Math.round((field.opacity ?? 1) * 100)}%)</label>
            <input type="range" class="te-prop-range" id="te-prop-opacity" min="0" max="1" step="0.05" value="${field.opacity ?? 1}" />
          </div>
        </div>
      `;
    }

    bindPropsSheetEvents(field) {
      const sheet = this.dom.propsSheet;
      if (!sheet) return;

      // Close
      sheet.querySelector('#te-prop-close')?.addEventListener('click', () => this.deselectField());

      // Lock / Unlock
      sheet.querySelector('#te-prop-lock')?.addEventListener('click', () => this.toggleFieldLock(field.id));

      // Visibility toggle
      sheet.querySelector('#te-prop-visibility')?.addEventListener('click', () => this.toggleFieldVisibility(field.id));

      // Layer buttons
      sheet.querySelector('#te-layer-bring-fwd')?.addEventListener('click', () => this.bringForward(field.id));
      sheet.querySelector('#te-layer-send-back')?.addEventListener('click', () => this.sendBackward(field.id));
      sheet.querySelector('#te-layer-to-front')?.addEventListener('click', () => this.bringToFront(field.id));
      sheet.querySelector('#te-layer-to-back')?.addEventListener('click', () => this.sendToBack(field.id));

      // Launch Table Engine drawer from table prop sheet
      sheet.querySelector('#te-btn-launch-table-engine')?.addEventListener('click', () => {
        this.closePropsSheet();
        this.openTableEngineSheet();
      });

      // Delete
      sheet.querySelector('#te-prop-delete')?.addEventListener('click', () => this.deleteField(field.id));

      // Duplicate
      sheet.querySelector('#te-prop-duplicate')?.addEventListener('click', () => this.duplicateField(field.id));

      // Inputs
      const contentInp = sheet.querySelector('#te-prop-content');
      contentInp?.addEventListener('input', (e) => {
        field.content = e.target.value;
        this.render();
      });

      // Insert variable chips
      sheet.querySelectorAll('[data-insert-var]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const v = btn.dataset.insertVar;
          if (contentInp) {
            contentInp.value = `${contentInp.value} ${v}`.trim();
            field.content = contentInp.value;
            this.render();
          }
        });
      });

      // Dimensions & Position
      sheet.querySelector('#te-prop-w')?.addEventListener('input', (e) => {
        field.width = Math.max(20, parseInt(e.target.value, 10) || 100);
        this.updateFieldElementPosition(field);
      });
      sheet.querySelector('#te-prop-h')?.addEventListener('input', (e) => {
        field.height = Math.max(20, parseInt(e.target.value, 10) || 40);
        this.updateFieldElementPosition(field);
      });
      sheet.querySelector('#te-prop-x')?.addEventListener('input', (e) => {
        field.x = parseInt(e.target.value, 10) || 0;
        this.updateFieldElementPosition(field);
      });
      sheet.querySelector('#te-prop-y')?.addEventListener('input', (e) => {
        field.y = parseInt(e.target.value, 10) || 0;
        this.updateFieldElementPosition(field);
      });

      // Rotation & Border Radius
      sheet.querySelector('#te-prop-rotation')?.addEventListener('input', (e) => {
        field.rotation = parseInt(e.target.value, 10) || 0;
        this.render();
      });
      sheet.querySelector('#te-prop-radius')?.addEventListener('input', (e) => {
        field.borderRadius = Math.max(0, parseInt(e.target.value, 10) || 0);
        this.render();
      });

      // Font & Color
      sheet.querySelector('#te-prop-size')?.addEventListener('input', (e) => {
        field.fontSize = Math.max(10, parseInt(e.target.value, 10) || 20);
        this.render();
      });
      sheet.querySelector('#te-prop-color')?.addEventListener('input', (e) => {
        field.color = e.target.value;
        this.render();
      });

      // Shape background & border
      sheet.querySelector('#te-prop-bgcolor')?.addEventListener('input', (e) => {
        field.backgroundColor = e.target.value;
        this.render();
      });
      sheet.querySelector('#te-prop-border')?.addEventListener('input', (e) => {
        field.border = e.target.value;
        this.render();
      });

      // Alignment
      sheet.querySelectorAll('[data-align]').forEach((btn) => {
        btn.addEventListener('click', () => {
          field.alignment = btn.dataset.align;
          sheet.querySelectorAll('[data-align]').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          this.render();
        });
      });

      // Opacity
      sheet.querySelector('#te-prop-opacity')?.addEventListener('input', (e) => {
        field.opacity = parseFloat(e.target.value);
        this.render();
      });
    }

    updatePropsSheetValues(field) {
      const sheet = this.dom.propsSheet;
      if (!sheet || this.selectedFieldId !== field.id) return;

      const wInp = sheet.querySelector('#te-prop-w');
      const hInp = sheet.querySelector('#te-prop-h');
      const xInp = sheet.querySelector('#te-prop-x');
      const yInp = sheet.querySelector('#te-prop-y');
      const rotInp = sheet.querySelector('#te-prop-rotation');

      if (wInp) wInp.value = field.width;
      if (hInp) hInp.value = field.height;
      if (xInp) xInp.value = field.x;
      if (yInp) yInp.value = field.y;
      if (rotInp) rotInp.value = field.rotation || 0;
    }

    // ================================================================
    // CONFIGURABLE TABLE ENGINE (Columns, Row Gap, Pagination)
    // ================================================================

    getTableField() {
      if (!this.currentTemplate) return null;
      let field = this.currentTemplate.fields.find((f) => f.type === 'leaderboard');
      if (!field) {
        // Fallback: create default table
        field = {
          id: `f_lb_${Date.now().toString(36)}`,
          type: 'leaderboard',
          x: 60,
          y: 280,
          width: 960,
          height: 880,
          rowHeight: 64,
          headerHeight: 46,
          maxRows: 12,
          rowGap: 4,
          pageIndex: 0,
          columns: [
            { key: 'rank', label: '#', width: 80, align: 'center' },
            { key: 'teamName', label: 'TEAM NAME', width: 440, align: 'left' },
            { key: 'position', label: 'PLC', width: 140, align: 'center' },
            { key: 'kills', label: 'KILLS', width: 140, align: 'center' },
            { key: 'totalPoints', label: 'PTS', width: 160, align: 'center', highlight: true },
          ],
          headerStyle: {
            backgroundColor: 'rgba(212, 175, 55, 0.15)',
            color: '#d4af37',
            fontSize: 18,
            fontWeight: '800',
          },
          rowStyle: {
            backgroundColor: 'rgba(255, 255, 255, 0.03)',
            alternateColor: 'rgba(255, 255, 255, 0.06)',
            color: '#ffffff',
            fontSize: 22,
            fontWeight: '600',
            top3Gold: true,
            borderRadius: 6,
          },
        };
        this.currentTemplate.fields.push(field);
      }
      return field;
    }

    openTableEngineSheet() {
      const sheet = this.dom.tableEngineSheet;
      if (!sheet || !this.currentTemplate) return;

      const field = this.getTableField();
      this.closePropsSheet();

      const availableCols = [
        { key: 'rank', label: '#', defaultW: 80, name: 'Rank' },
        { key: 'teamName', label: 'TEAM NAME', defaultW: 400, name: 'Team Name' },
        { key: 'matchesPlayed', label: 'M', defaultW: 100, name: 'Matches' },
        { key: 'position', label: 'PLC', defaultW: 120, name: 'Placement / Place' },
        { key: 'kills', label: 'KILLS', defaultW: 120, name: 'Kills' },
        { key: 'placementPoints', label: 'PLC PTS', defaultW: 140, name: 'Placement Points' },
        { key: 'killPoints', label: 'KILL PTS', defaultW: 140, name: 'Kill Points' },
        { key: 'totalPoints', label: 'TOTAL PTS', defaultW: 160, name: 'Total Points' },
        { key: 'booyahs', label: 'BOOYAH', defaultW: 120, name: 'Booyahs / Wins' },
      ];

      const activeColKeys = (field.columns || []).map((c) => c.key);

      sheet.innerHTML = `
        <div class="te-sheet-header">
          <span class="te-sheet-title">Configurable Table Engine</span>
          <button type="button" class="te-icon-action" id="te-table-close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div class="te-tab-strip">
          <button type="button" class="te-tab-btn active" data-tab="cols">Columns</button>
          <button type="button" class="te-tab-btn" data-tab="style">Row & Cell Style</button>
          <button type="button" class="te-tab-btn" data-tab="page">Pagination & Data</button>
        </div>

        <div class="te-sheet-scroll" id="te-table-pane-content">
          <!-- Pane 1: Columns -->
          <div class="te-tab-pane" id="te-pane-cols" style="display:block;">
            <div style="margin-bottom:12px; padding:10px; background:rgba(212, 175, 55, 0.08); border:1px solid rgba(212, 175, 55, 0.3); border-radius:6px; display:flex; justify-content:space-between; align-items:center;">
              <div>
                <div style="font-size:12px; font-weight:800; color:var(--gold-300, #d4af37);">⚡ Auto-Align to Background</div>
                <div style="font-size:10px; color:#cbd5e1;">Calibrate cells to fit imported graphic</div>
              </div>
              <button type="button" class="te-btn-auto-configure-table" id="te-btn-table-auto-align" style="width:auto; padding:6px 12px; font-size:11px;">
                Auto-Align
              </button>
            </div>
            <p style="font-size:11px; color:#cbd5e1; margin-bottom:8px;">Toggle table columns to match your tournament rules:</p>
            <div class="te-col-chips">
              ${availableCols.map((c) => `
                <button type="button" class="te-col-chip ${activeColKeys.includes(c.key) ? 'active' : ''}" data-col-key="${c.key}">
                  ${activeColKeys.includes(c.key) ? '✓ ' : '+ '}${c.name}
                </button>
              `).join('')}
            </div>

            <div style="margin-top:14px;">
              <label class="te-prop-label">Active Columns Width & Label</label>
              ${(field.columns || []).map((col, idx) => `
                <div class="te-prop-row" style="margin-bottom:6px; align-items:center;">
                  <span style="font-size:11px; font-weight:800; color:var(--gold-300); width:70px;">${col.key}</span>
                  <input type="text" class="te-prop-input" data-col-label-idx="${idx}" value="${escapeHtml(col.label)}" style="flex:1;" />
                  <input type="number" class="te-prop-input" data-col-w-idx="${idx}" value="${col.width}" style="width:70px;" title="Width (px)" />
                </div>
              `).join('')}
            </div>
          </div>

          <!-- Pane 2: Row & Cell Style -->
          <div class="te-tab-pane" id="te-pane-style" style="display:none;">
            <div class="te-prop-row">
              <div class="te-prop-group">
                <label class="te-prop-label">Row Height (px)</label>
                <input type="number" class="te-prop-input" id="te-tbl-row-h" value="${field.rowHeight || 64}" min="36" max="120" />
              </div>
              <div class="te-prop-group">
                <label class="te-prop-label">Row Gap (Spacing)</label>
                <input type="number" class="te-prop-input" id="te-tbl-row-gap" value="${field.rowGap || 0}" min="0" max="24" />
              </div>
            </div>

            <div class="te-prop-row">
              <div class="te-prop-group">
                <label class="te-prop-label">Header Height</label>
                <input type="number" class="te-prop-input" id="te-tbl-hdr-h" value="${field.headerHeight || 46}" min="30" max="80" />
              </div>
              <div class="te-prop-group">
                <label class="te-prop-label">Row Border Radius</label>
                <input type="number" class="te-prop-input" id="te-tbl-row-radius" value="${field.rowStyle?.borderRadius || 0}" min="0" max="20" />
              </div>
            </div>

            <div class="te-prop-group">
              <label style="display:flex; align-items:center; gap:8px; font-size:12px; font-weight:700; color:#fff; cursor:pointer;">
                <input type="checkbox" id="te-tbl-top3" ${field.rowStyle?.top3Gold ? 'checked' : ''} />
                <span>Top 3 Podium Highlights (Gold 1st, Silver 2nd, Bronze 3rd)</span>
              </label>
            </div>
          </div>

          <!-- Pane 3: Pagination & Data -->
          <div class="te-tab-pane" id="te-pane-page" style="display:none;">
            <div class="te-prop-row">
              <div class="te-prop-group">
                <label class="te-prop-label">Teams Per Page</label>
                <select class="te-select-datasource" id="te-tbl-maxrows" style="width:100%;">
                  <option value="6" ${field.maxRows === 6 ? 'selected' : ''}>6 Teams</option>
                  <option value="8" ${field.maxRows === 8 ? 'selected' : ''}>8 Teams</option>
                  <option value="10" ${field.maxRows === 10 ? 'selected' : ''}>10 Teams</option>
                  <option value="12" ${field.maxRows === 12 ? 'selected' : ''}>12 Teams (Standard FF)</option>
                  <option value="16" ${field.maxRows === 16 ? 'selected' : ''}>16 Teams</option>
                  <option value="24" ${field.maxRows === 24 ? 'selected' : ''}>24 Teams</option>
                </select>
              </div>
              <div class="te-prop-group">
                <label class="te-prop-label">Page Slice</label>
                <select class="te-select-datasource" id="te-tbl-page-idx" style="width:100%;">
                  <option value="0" ${(field.pageIndex || 0) === 0 ? 'selected' : ''}>Page 1 (Top Ranks)</option>
                  <option value="1" ${(field.pageIndex || 0) === 1 ? 'selected' : ''}>Page 2 (Bottom Ranks)</option>
                </select>
              </div>
            </div>

            <p style="font-size:11px; color:#cbd5e1; margin-top:8px;">Live standings data is bound from the top Data Source selector in real time.</p>
          </div>
        </div>
      `;

      sheet.classList.add('open');

      // Bind Drawer Events
      sheet.querySelector('#te-table-close')?.addEventListener('click', () => this.closeTableEngineSheet());
      sheet.querySelector('#te-btn-table-auto-align')?.addEventListener('click', () => {
        this.closeTableEngineSheet();
        this.openAutoTableModal();
      });

      // Tabs
      sheet.querySelectorAll('.te-tab-btn').forEach((tabBtn) => {
        tabBtn.addEventListener('click', () => {
          sheet.querySelectorAll('.te-tab-btn').forEach((b) => b.classList.remove('active'));
          tabBtn.classList.add('active');
          const tab = tabBtn.dataset.tab;
          sheet.querySelectorAll('.te-tab-pane').forEach((p) => (p.style.display = 'none'));
          const targetPane = sheet.querySelector(`#te-pane-${tab}`);
          if (targetPane) targetPane.style.display = 'block';
        });
      });

      // Toggle columns
      sheet.querySelectorAll('[data-col-key]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const key = btn.dataset.colKey;
          const exists = field.columns.some((c) => c.key === key);
          if (exists) {
            field.columns = field.columns.filter((c) => c.key !== key);
          } else {
            const def = availableCols.find((c) => c.key === key);
            field.columns.push({
              key,
              label: def.label,
              width: def.defaultW,
              align: key === 'teamName' ? 'left' : 'center',
            });
          }
          this.pushState('Toggle Table Column');
          this.render();
          this.openTableEngineSheet(); // refresh
        });
      });

      // Column widths & labels
      sheet.querySelectorAll('[data-col-label-idx]').forEach((inp) => {
        inp.addEventListener('input', (e) => {
          const idx = parseInt(e.target.dataset.colLabelIdx, 10);
          if (field.columns[idx]) {
            field.columns[idx].label = e.target.value;
            this.render();
          }
        });
      });

      sheet.querySelectorAll('[data-col-w-idx]').forEach((inp) => {
        inp.addEventListener('input', (e) => {
          const idx = parseInt(e.target.dataset.colWIdx, 10);
          if (field.columns[idx]) {
            field.columns[idx].width = Math.max(30, parseInt(e.target.value, 10) || 50);
            this.render();
          }
        });
      });

      // Row settings
      sheet.querySelector('#te-tbl-row-h')?.addEventListener('input', (e) => {
        field.rowHeight = Math.max(30, parseInt(e.target.value, 10) || 64);
        this.render();
      });

      sheet.querySelector('#te-tbl-row-gap')?.addEventListener('input', (e) => {
        field.rowGap = Math.max(0, parseInt(e.target.value, 10) || 0);
        this.render();
      });

      sheet.querySelector('#te-tbl-hdr-h')?.addEventListener('input', (e) => {
        field.headerHeight = Math.max(24, parseInt(e.target.value, 10) || 46);
        this.render();
      });

      sheet.querySelector('#te-tbl-row-radius')?.addEventListener('input', (e) => {
        if (!field.rowStyle) field.rowStyle = {};
        field.rowStyle.borderRadius = Math.max(0, parseInt(e.target.value, 10) || 0);
        this.render();
      });

      sheet.querySelector('#te-tbl-top3')?.addEventListener('change', (e) => {
        if (!field.rowStyle) field.rowStyle = {};
        field.rowStyle.top3Gold = e.target.checked;
        this.pushState('Toggle Top 3 Highlight');
        this.render();
      });

      // Pagination
      sheet.querySelector('#te-tbl-maxrows')?.addEventListener('change', (e) => {
        field.maxRows = parseInt(e.target.value, 10) || 12;
        this.pushState('Change Table Rows');
        this.render();
      });

      sheet.querySelector('#te-tbl-page-idx')?.addEventListener('change', (e) => {
        field.pageIndex = parseInt(e.target.value, 10) || 0;
        this.pushState('Change Table Page');
        this.render();
      });
    }

    closeTableEngineSheet() {
      this.dom.tableEngineSheet?.classList.remove('open');
    }

    // ================================================================
    // LAYERS DRAWER (Z-Order, Lock, Hide)
    // ================================================================

    openLayersSheet() {
      const sheet = this.dom.layersSheet;
      if (!sheet || !this.currentTemplate) return;

      this.closePropsSheet();
      this.closeTableEngineSheet();

      const fields = this.currentTemplate.fields || [];

      sheet.innerHTML = `
        <div class="te-sheet-header">
          <span class="te-sheet-title">Layers & Arrangement (${fields.length})</span>
          <button type="button" class="te-icon-action" id="te-layers-close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <p style="font-size:11px; color:#cbd5e1; margin-bottom:10px;">Layers are listed from top (front) to bottom (back):</p>
        <div class="te-sheet-scroll">
          ${fields.slice().reverse().map((f) => `
            <div class="te-layer-item ${this.selectedFieldId === f.id ? 'is-selected' : ''}" data-layer-id="${f.id}">
              <div class="te-layer-item__info">
                <span class="te-layer-type-tag">${f.type}</span>
                <span class="te-layer-name">${escapeHtml(f.content || (f.type === 'leaderboard' ? 'Point Table' : f.type))}</span>
              </div>
              <div class="te-layer-actions">
                <button type="button" class="te-layer-btn" data-layer-up="${f.id}" title="Bring Forward">↑</button>
                <button type="button" class="te-layer-btn" data-layer-down="${f.id}" title="Send Backward">↓</button>
                <button type="button" class="te-layer-btn ${f.locked ? 'active' : ''}" data-layer-lock="${f.id}" title="${f.locked ? 'Unlock' : 'Lock'}">
                  ${f.locked ? '🔒' : '🔓'}
                </button>
                <button type="button" class="te-layer-btn ${f.hidden ? 'active' : ''}" data-layer-hide="${f.id}" title="${f.hidden ? 'Show' : 'Hide'}">
                  ${f.hidden ? '🙈' : '👁️'}
                </button>
                <button type="button" class="te-layer-btn text-danger" data-layer-del="${f.id}" title="Delete">✕</button>
              </div>
            </div>
          `).join('')}
        </div>
      `;

      sheet.classList.add('open');

      sheet.querySelector('#te-layers-close')?.addEventListener('click', () => this.closeLayersSheet());

      sheet.querySelectorAll('[data-layer-id]').forEach((item) => {
        item.querySelector('.te-layer-item__info')?.addEventListener('click', () => {
          this.selectField(item.dataset.layerId);
          this.closeLayersSheet();
        });
      });

      sheet.querySelectorAll('[data-layer-up]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.bringForward(btn.dataset.layerUp);
          this.openLayersSheet();
        });
      });

      sheet.querySelectorAll('[data-layer-down]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.sendBackward(btn.dataset.layerDown);
          this.openLayersSheet();
        });
      });

      sheet.querySelectorAll('[data-layer-lock]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.toggleFieldLock(btn.dataset.layerLock);
          this.openLayersSheet();
        });
      });

      sheet.querySelectorAll('[data-layer-hide]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.toggleFieldVisibility(btn.dataset.layerHide);
          this.openLayersSheet();
        });
      });

      sheet.querySelectorAll('[data-layer-del]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.deleteField(btn.dataset.layerDel);
          this.openLayersSheet();
        });
      });
    }

    closeLayersSheet() {
      this.dom.layersSheet?.classList.remove('open');
    }

    // ================================================================
    // FONTS & TYPOGRAPHY DRAWER
    // ================================================================

    openFontsSheet() {
      const sheet = this.dom.fontsSheet;
      if (!sheet || !this.currentTemplate) return;

      this.closePropsSheet();

      const fonts = [
        { name: 'Inter', desc: 'Clean Modern Esports', family: 'Inter, sans-serif' },
        { name: 'Rajdhani', desc: 'Futuristic Battle Royale', family: 'Rajdhani, sans-serif' },
        { name: 'Orbitron', desc: 'Cyber Tournament Pro', family: 'Orbitron, sans-serif' },
        { name: 'Outfit', desc: 'Sleek Broadcast Championship', family: 'Outfit, sans-serif' },
        { name: 'Montserrat', desc: 'Classic Tournament Display', family: 'Montserrat, sans-serif' },
      ];

      sheet.innerHTML = `
        <div class="te-sheet-header">
          <span class="te-sheet-title">Global Typography</span>
          <button type="button" class="te-icon-action" id="te-fonts-close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <p style="font-size:11px; color:#cbd5e1; margin-bottom:12px;">Apply consistent typography across all headings and tables:</p>
        <div class="te-sheet-scroll">
          ${fonts.map((f) => `
            <button type="button" class="te-cat-item-btn" data-apply-font="${f.name}" style="font-family:${f.family}; width:100%; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:16px; font-weight:800;">${f.name}</span>
              <span style="font-size:11px; color:#8e92a4;">${f.desc}</span>
            </button>
          `).join('')}
        </div>
      `;

      sheet.classList.add('open');

      sheet.querySelector('#te-fonts-close')?.addEventListener('click', () => this.closeFontsSheet());

      sheet.querySelectorAll('[data-apply-font]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const font = btn.dataset.applyFont;
          (this.currentTemplate.fields || []).forEach((f) => {
            if (f.type === 'text') f.fontFamily = font;
          });
          this.pushState(`Apply Font ${font}`);
          this.render();
          this.closeFontsSheet();
        });
      });
    }

    closeFontsSheet() {
      this.dom.fontsSheet?.classList.remove('open');
    }

    // ================================================================
    // COLOR PALETTE DRAWER
    // ================================================================

    openColorsSheet() {
      const sheet = this.dom.colorsSheet;
      if (!sheet || !this.currentTemplate) return;

      this.closePropsSheet();

      const palettes = [
        { name: 'LRD Gold & Obsidian', gold: '#d4af37', bg: '#0a0b10', text: '#ffffff' },
        { name: 'Cyber Neon Cyan', gold: '#00f0ff', bg: '#060913', text: '#ffffff' },
        { name: 'Blood Crimson', gold: '#ff3344', bg: '#0f0709', text: '#ffffff' },
        { name: 'Royal Amethyst', gold: '#a855f7', bg: '#0b0714', text: '#ffffff' },
        { name: 'Clean Monolith', gold: '#38bdf8', bg: '#090d16', text: '#ffffff' },
      ];

      sheet.innerHTML = `
        <div class="te-sheet-header">
          <span class="te-sheet-title">Color Palettes</span>
          <button type="button" class="te-icon-action" id="te-colors-close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <p style="font-size:11px; color:#cbd5e1; margin-bottom:12px;">Apply curated esports color themes in one click:</p>
        <div class="te-sheet-scroll">
          ${palettes.map((p, idx) => `
            <div class="te-layer-item" data-palette-idx="${idx}" style="cursor:pointer; display:flex; align-items:center; justify-content:space-between;">
              <span style="font-size:13px; font-weight:700; color:#fff;">${p.name}</span>
              <div style="display:flex; gap:6px;">
                <span style="width:20px; height:20px; border-radius:50%; background:${p.gold}; border:1px solid #fff;"></span>
                <span style="width:20px; height:20px; border-radius:50%; background:${p.bg}; border:1px solid #fff;"></span>
              </div>
            </div>
          `).join('')}
        </div>
      `;

      sheet.classList.add('open');

      sheet.querySelector('#te-colors-close')?.addEventListener('click', () => this.closeColorsSheet());

      sheet.querySelectorAll('[data-palette-idx]').forEach((item) => {
        item.addEventListener('click', () => {
          const p = palettes[parseInt(item.dataset.paletteIdx, 10)];
          if (p) {
            // Apply gold to headers and accent
            const tbl = this.getTableField();
            if (tbl && tbl.headerStyle) {
              tbl.headerStyle.color = p.gold;
            }
            if (this.currentTemplate.background && this.currentTemplate.background.type === 'color') {
              this.currentTemplate.background.value = p.bg;
            }
            this.pushState(`Apply Palette ${p.name}`);
            this.render();
            this.closeColorsSheet();
          }
        });
      });
    }

    closeColorsSheet() {
      this.dom.colorsSheet?.classList.remove('open');
    }

    // ================================================================
    // BACKGROUND DRAWER
    // ================================================================

    openBackgroundSheet() {
      const sheet = this.dom.backgroundSheet;
      if (!sheet || !this.currentTemplate) return;

      this.closePropsSheet();

      sheet.innerHTML = `
        <div class="te-sheet-header">
          <span class="te-sheet-title">Canvas Background</span>
          <button type="button" class="te-icon-action" id="te-bg-close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="te-sheet-scroll">
          <div class="te-prop-group">
            <label class="te-prop-label">Solid Color</label>
            <input type="color" class="te-prop-color" id="te-bg-solid-color" value="${this.currentTemplate.background?.value || '#0a0b10'}" />
          </div>

          <div class="te-prop-group">
            <label class="te-prop-label">Custom Image Background</label>
            <input type="file" id="te-bg-file-inp" accept="image/*" class="te-prop-input" />
          </div>

          <div style="margin-top:14px; margin-bottom:14px; padding:12px; background:rgba(212, 175, 55, 0.08); border:1px solid rgba(212, 175, 55, 0.28); border-radius:8px;">
            <div style="font-weight:800; font-size:12px; color:var(--gold-300, #d4af37); margin-bottom:4px; display:flex; align-items:center; gap:6px;">
              <span>⚡</span> <span>Auto-Configure Table Elements</span>
            </div>
            <p style="font-size:11px; color:#cbd5e1; line-height:1.4; margin-bottom:10px;">
              Imported a graphic with empty table cells (like MLE SCRIMS)? Automatically calibrate and overlay editable table elements (POS, TEAM, MATCH, PLACE, FINISH, TOTAL, WINS) bound to real tournament standings.
            </p>
            <button type="button" class="te-btn-auto-configure-table" id="te-btn-auto-configure-table">
              ⚡ Auto-Configure Table on Background
            </button>
          </div>

          <div class="te-prop-group">
            <label class="te-prop-label">Default Esports Presets</label>
            <div style="display:flex; flex-direction:column; gap:6px;">
              <button type="button" class="te-cat-item-btn" data-set-bg-preset="obsidian">Obsidian Dark Arena</button>
              <button type="button" class="te-cat-item-btn" data-set-bg-preset="gold">Gold Broadcast Radial</button>
              <button type="button" class="te-cat-item-btn" data-set-bg-preset="cyber">Cyber Neon Blue</button>
            </div>
          </div>
        </div>
      `;

      sheet.classList.add('open');

      sheet.querySelector('#te-bg-close')?.addEventListener('click', () => this.closeBackgroundSheet());

      sheet.querySelector('#te-btn-auto-configure-table')?.addEventListener('click', () => {
        this.closeBackgroundSheet();
        this.openAutoTableModal();
      });

      sheet.querySelector('#te-bg-solid-color')?.addEventListener('input', (e) => {
        this.currentTemplate.background = { type: 'color', value: e.target.value };
        this.render();
      });

      sheet.querySelector('#te-bg-file-inp')?.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (evt) => {
            this.currentTemplate.background = { type: 'image', value: evt.target.result };
            this.pushState('Upload Background');
            this.render();
            this.closeBackgroundSheet();
            if (window.showToast) window.showToast('Background updated! Opening Auto-Configure Table...', 'info');
            this.openAutoTableModal();
          };
          reader.readAsDataURL(file);
        }
      });

      sheet.querySelectorAll('[data-set-bg-preset]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const type = btn.dataset.setBgPreset;
          if (type === 'obsidian') {
            this.currentTemplate.background = { type: 'color', value: '#08090f' };
          } else if (type === 'gold') {
            this.currentTemplate.background = {
              type: 'gradient',
              value: 'radial-gradient(circle at 50% 20%, rgba(212,175,55,0.2) 0%, #06070a 80%)',
            };
          } else if (type === 'cyber') {
            this.currentTemplate.background = {
              type: 'gradient',
              value: 'linear-gradient(180deg, #060913 0%, #0b1528 100%)',
            };
          }
          this.pushState(`Background Preset ${type}`);
          this.render();
          this.closeBackgroundSheet();
        });
      });
    }

    closeBackgroundSheet() {
      this.dom.backgroundSheet?.classList.remove('open');
    }

    // ================================================================
    // AUTO-CONFIGURE TABLE ELEMENT DETECTION & BINDING
    // ================================================================

    getStandardTableColumns() {
      return [
        { key: 'rank', label: 'POS', defaultW: 70, align: 'center', enabled: true },
        { key: 'teamName', label: 'TEAM NAME', defaultW: 360, align: 'left', enabled: true },
        { key: 'matchesPlayed', label: 'MATCH', defaultW: 85, align: 'center', enabled: true },
        { key: 'position', label: 'PLACE', defaultW: 95, align: 'center', enabled: true },
        { key: 'kills', label: 'FINISH', defaultW: 95, align: 'center', enabled: true },
        { key: 'totalPoints', label: 'TOTAL', defaultW: 120, align: 'center', highlight: true, enabled: true },
        { key: 'booyahs', label: 'WINS', defaultW: 85, align: 'center', enabled: true },
      ];
    }

    openAutoTableModal() {
      const modal = this.dom.autoTableModal || document.getElementById('te-auto-table-modal');
      if (!modal || !this.currentTemplate) return;

      this.closePropsSheet();
      this.closeTableEngineSheet();
      this.closeBackgroundSheet();

      // Check existing leaderboard field
      const existingTbl = this.currentTemplate.fields.find((f) => f.type === 'leaderboard');
      const canvasW = this.currentTemplate.canvas?.width || 1080;
      const canvasH = this.currentTemplate.canvas?.height || 1350;

      // Populate input values
      const inpX = modal.querySelector('#te-autotbl-x');
      const inpY = modal.querySelector('#te-autotbl-y');
      const inpW = modal.querySelector('#te-autotbl-w');
      const inpH = modal.querySelector('#te-autotbl-h');
      const selRows = modal.querySelector('#te-autotbl-rows');
      const inpRowH = modal.querySelector('#te-autotbl-row-h');
      const inpRowGap = modal.querySelector('#te-autotbl-row-gap');
      const chkHideHeader = modal.querySelector('#te-autotbl-hide-header');
      const chkTransparent = modal.querySelector('#te-autotbl-transparent-cells');
      const chkTop3 = modal.querySelector('#te-autotbl-top3-gold');
      const selPreset = modal.querySelector('#te-autotbl-preset');

      if (existingTbl) {
        if (inpX) inpX.value = existingTbl.x;
        if (inpY) inpY.value = existingTbl.y;
        if (inpW) inpW.value = existingTbl.width;
        if (inpH) inpH.value = existingTbl.height;
        if (selRows) selRows.value = String(existingTbl.maxRows || 12);
        if (inpRowH) inpRowH.value = existingTbl.rowHeight || 75;
        if (inpRowGap) inpRowGap.value = existingTbl.rowGap !== undefined ? existingTbl.rowGap : 0;
        if (chkHideHeader) chkHideHeader.checked = !!existingTbl.hideHeader;
        if (chkTransparent) chkTransparent.checked = existingTbl.rowStyle?.backgroundColor === 'transparent';
        if (chkTop3) chkTop3.checked = !!existingTbl.rowStyle?.top3Gold;
      } else {
        // Defaults optimized for scrims grids on 1080x1350
        const defaultW = Math.min(960, canvasW - 80);
        const defaultX = Math.round((canvasW - defaultW) / 2);
        if (inpX) inpX.value = defaultX;
        if (inpY) inpY.value = 260;
        if (inpW) inpW.value = defaultW;
        if (inpH) inpH.value = 920;
        if (selRows) selRows.value = '12';
        if (inpRowH) inpRowH.value = 75;
        if (inpRowGap) inpRowGap.value = 0;
        if (chkHideHeader) chkHideHeader.checked = true;
        if (chkTransparent) chkTransparent.checked = true;
        if (chkTop3) chkTop3.checked = false;
        if (selPreset) selPreset.value = 'mle_scrims';
      }

      this.renderAutoTableColumnsList(existingTbl?.columns);

      modal.style.display = 'flex';
      modal.classList.add('open');
    }

    closeAutoTableModal() {
      const modal = this.dom.autoTableModal || document.getElementById('te-auto-table-modal');
      if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('open');
      }
    }

    handleAutoTablePresetChange(presetKey) {
      const modal = this.dom.autoTableModal || document.getElementById('te-auto-table-modal');
      if (!modal) return;

      const inpX = modal.querySelector('#te-autotbl-x');
      const inpY = modal.querySelector('#te-autotbl-y');
      const inpW = modal.querySelector('#te-autotbl-w');
      const inpH = modal.querySelector('#te-autotbl-h');
      const selRows = modal.querySelector('#te-autotbl-rows');
      const inpRowH = modal.querySelector('#te-autotbl-row-h');
      const inpRowGap = modal.querySelector('#te-autotbl-row-gap');
      const chkHideHeader = modal.querySelector('#te-autotbl-hide-header');
      const chkTransparent = modal.querySelector('#te-autotbl-transparent-cells');
      const chkTop3 = modal.querySelector('#te-autotbl-top3-gold');

      if (presetKey === 'mle_scrims') {
        if (inpX) inpX.value = 60;
        if (inpY) inpY.value = 260;
        if (inpW) inpW.value = 960;
        if (inpH) inpH.value = 930;
        if (selRows) selRows.value = '12';
        if (inpRowH) inpRowH.value = 75;
        if (inpRowGap) inpRowGap.value = 0;
        if (chkHideHeader) chkHideHeader.checked = true;
        if (chkTransparent) chkTransparent.checked = true;
        if (chkTop3) chkTop3.checked = false;
      } else if (presetKey === 'standard_esports') {
        if (inpX) inpX.value = 60;
        if (inpY) inpY.value = 240;
        if (inpW) inpW.value = 960;
        if (inpH) inpH.value = 950;
        if (selRows) selRows.value = '12';
        if (inpRowH) inpRowH.value = 68;
        if (inpRowGap) inpRowGap.value = 4;
        if (chkHideHeader) chkHideHeader.checked = false;
        if (chkTransparent) chkTransparent.checked = false;
        if (chkTop3) chkTop3.checked = true;
      } else if (presetKey === 'top6_lobby') {
        if (inpX) inpX.value = 75;
        if (inpY) inpY.value = 280;
        if (inpW) inpW.value = 930;
        if (inpH) inpH.value = 540;
        if (selRows) selRows.value = '6';
        if (inpRowH) inpRowH.value = 85;
        if (inpRowGap) inpRowGap.value = 0;
        if (chkHideHeader) chkHideHeader.checked = true;
        if (chkTransparent) chkTransparent.checked = true;
        if (chkTop3) chkTop3.checked = false;
      }
    }

    renderAutoTableColumnsList(existingCols = null) {
      const container = document.getElementById('te-autotbl-cols-list');
      if (!container) return;

      const standard = this.getStandardTableColumns();
      let activeMap = new Map();
      if (Array.isArray(existingCols) && existingCols.length > 0) {
        existingCols.forEach((c) => activeMap.set(c.key, c));
      } else {
        standard.forEach((c) => activeMap.set(c.key, c));
      }

      container.innerHTML = standard
        .map((col) => {
          const isActive = activeMap.has(col.key);
          const currentW = activeMap.get(col.key)?.width || col.defaultW;
          return `
            <div class="te-autotbl-col-tag ${isActive ? 'active' : ''}" data-col-key="${col.key}">
              <input type="checkbox" class="te-autotbl-col-check" data-col-key="${col.key}" ${isActive ? 'checked' : ''} />
              <span>${col.label}</span>
              <input type="number" class="te-autotbl-col-w-input" data-col-w="${col.key}" value="${currentW}" title="Width (px)" />
              <span style="font-size:9px; color:#94a3b8;">px</span>
            </div>
          `;
        })
        .join('');

      container.querySelectorAll('.te-autotbl-col-check').forEach((chk) => {
        chk.addEventListener('change', (e) => {
          const parent = e.target.closest('.te-autotbl-col-tag');
          if (parent) parent.classList.toggle('active', e.target.checked);
        });
      });
    }

    getAutoTableModalConfig() {
      const modal = this.dom.autoTableModal || document.getElementById('te-auto-table-modal');
      if (!modal) return {};

      const x = parseInt(modal.querySelector('#te-autotbl-x')?.value, 10) || 60;
      const y = parseInt(modal.querySelector('#te-autotbl-y')?.value, 10) || 260;
      const width = parseInt(modal.querySelector('#te-autotbl-w')?.value, 10) || 960;
      const height = parseInt(modal.querySelector('#te-autotbl-h')?.value, 10) || 920;
      const maxRows = parseInt(modal.querySelector('#te-autotbl-rows')?.value, 10) || 12;
      const rowHeight = parseInt(modal.querySelector('#te-autotbl-row-h')?.value, 10) || 75;
      const rowGap = parseInt(modal.querySelector('#te-autotbl-row-gap')?.value, 10) || 0;
      const hideHeader = !!modal.querySelector('#te-autotbl-hide-header')?.checked;
      const transparentCells = !!modal.querySelector('#te-autotbl-transparent-cells')?.checked;
      const top3Gold = !!modal.querySelector('#te-autotbl-top3-gold')?.checked;

      // Collect selected columns
      const standard = this.getStandardTableColumns();
      const columns = [];
      const colTags = modal.querySelectorAll('.te-autotbl-col-tag');
      colTags.forEach((tag) => {
        const key = tag.dataset.colKey;
        const chk = tag.querySelector('.te-autotbl-col-check');
        const wInp = tag.querySelector('.te-autotbl-col-w-input');
        if (chk && chk.checked) {
          const colDef = standard.find((c) => c.key === key) || { label: key, align: 'center' };
          const w = parseInt(wInp?.value, 10) || colDef.defaultW || 80;
          columns.push({
            key,
            label: colDef.label,
            width: w,
            align: key === 'teamName' ? 'left' : 'center',
            highlight: key === 'totalPoints',
          });
        }
      });

      return {
        x,
        y,
        width,
        height,
        maxRows,
        rowHeight,
        rowGap,
        hideHeader,
        transparentCells,
        top3Gold,
        columns: columns.length > 0 ? columns : standard,
      };
    }

    previewAutoTableFromModal() {
      const config = this.getAutoTableModalConfig();
      this.applyAutoTable(config);
      if (window.showToast) window.showToast('Test preview updated on canvas.', 'info');
    }

    applyAutoTableFromModal() {
      const config = this.getAutoTableModalConfig();
      const tbl = this.applyAutoTable(config);
      this.closeAutoTableModal();
      if (window.showToast) window.showToast('Table auto-configured and bound to standings!', 'success');
      return tbl;
    }

    saveAutoTableAsTheme() {
      const config = this.getAutoTableModalConfig();
      this.applyAutoTable(config);
      this.closeAutoTableModal();
      this.exportAsTheme();
    }

    /**
     * Programmatic & UI application of auto-configured table
     *
     * @param {Object} [customConfig] - Overrides for table coordinates and styling
     * @returns {Object} Configured table field
     */
    applyAutoTable(customConfig = {}) {
      if (!this.currentTemplate) return null;
      const canvasW = this.currentTemplate.canvas?.width || 1080;
      const canvasH = this.currentTemplate.canvas?.height || 1350;

      const defaults = {
        x: 60,
        y: 260,
        width: 960,
        height: 920,
        maxRows: 12,
        rowHeight: 75,
        rowGap: 0,
        headerHeight: 46,
        hideHeader: true,
        transparentCells: true,
        top3Gold: false,
        columns: [
          { key: 'rank', label: 'POS', width: 70, align: 'center' },
          { key: 'teamName', label: 'TEAM NAME', width: 360, align: 'left' },
          { key: 'matchesPlayed', label: 'MATCH', width: 85, align: 'center' },
          { key: 'position', label: 'PLACE', width: 95, align: 'center' },
          { key: 'kills', label: 'FINISH', width: 95, align: 'center' },
          { key: 'totalPoints', label: 'TOTAL', width: 120, align: 'center', highlight: true },
          { key: 'booyahs', label: 'WINS', width: 85, align: 'center' },
        ],
      };

      const cfg = { ...defaults, ...customConfig };

      // Calculate proportional column widths if user adjusted width
      const totalColW = (cfg.columns || []).reduce((acc, c) => acc + (c.width || 80), 0);
      if (totalColW > 0 && Math.abs(totalColW - cfg.width) > 5) {
        const ratio = cfg.width / totalColW;
        cfg.columns = cfg.columns.map((c) => ({
          ...c,
          width: Math.round(c.width * ratio),
        }));
      }

      // Get or create table field
      let tableField = this.currentTemplate.fields.find((f) => f.type === 'leaderboard');
      if (!tableField) {
        tableField = {
          id: `f_lb_${Date.now().toString(36)}`,
          type: 'leaderboard',
        };
        this.currentTemplate.fields.push(tableField);
      }

      tableField.x = cfg.x;
      tableField.y = cfg.y;
      tableField.width = cfg.width;
      tableField.height = cfg.height;
      tableField.maxRows = cfg.maxRows;
      tableField.rowHeight = cfg.rowHeight;
      tableField.rowGap = cfg.rowGap;
      tableField.headerHeight = cfg.headerHeight;
      tableField.hideHeader = cfg.hideHeader;
      tableField.columns = cfg.columns;
      tableField.pageIndex = cfg.pageIndex || 0;

      if (!tableField.headerStyle) {
        tableField.headerStyle = {
          backgroundColor: cfg.hideHeader ? 'transparent' : 'rgba(212, 175, 55, 0.15)',
          color: '#d4af37',
          fontSize: 18,
          fontWeight: '800',
        };
      }

      tableField.rowStyle = {
        backgroundColor: cfg.transparentCells ? 'transparent' : 'rgba(255, 255, 255, 0.03)',
        alternateColor: cfg.transparentCells ? 'transparent' : 'rgba(255, 255, 255, 0.06)',
        borderBottom: cfg.transparentCells ? 'none' : 'rgba(255, 255, 255, 0.08)',
        color: '#ffffff',
        fontSize: 22,
        fontWeight: '600',
        top3Gold: !!cfg.top3Gold,
        borderRadius: cfg.rowGap > 0 ? 6 : 0,
      };

      // Ensure activeDataContext is bound with real scores from LocalDatabaseService
      if (!this.activeDataContext || !this.activeDataContext.leaderboard?.length) {
        this.activeDataContext = this.buildDefaultDataContext();
      }

      this.selectedFieldId = tableField.id;
      this.pushState('Auto-Configure Table');
      this.render();
      return tableField;
    }

    // ================================================================
    // DYNAMIC TEXT & TEMPLATE INFO
    // ================================================================

    openInfoDrawer() {
      if (!this.dom.infoDrawer || !this.currentTemplate) return;

      const info = this.currentTemplate.info || window.TemplateVariables.getDefaultInfo();

      this.dom.infoDrawer.innerHTML = `
        <div class="te-drawer-header">
          <span class="te-drawer-title">Template Information</span>
          <button type="button" class="te-icon-action" id="te-info-close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <p class="te-drawer-sub">Updating dynamic fields immediately populates everywhere in the design without re-importing.</p>
        <div class="te-drawer-body">
          <div class="te-prop-group">
            <label class="te-prop-label">Tournament Name</label>
            <input type="text" class="te-prop-input" id="te-info-tname" value="${escapeHtml(info.tournamentName || '')}" placeholder="LRD THUNDER STRIKE CUP" />
          </div>
          <div class="te-prop-group">
            <label class="te-prop-label">Match Title / Number</label>
            <input type="text" class="te-prop-input" id="te-info-match" value="${escapeHtml(info.matchNumber || '')}" placeholder="MATCH 01" />
          </div>
          <div class="te-prop-group">
            <label class="te-prop-label">YouTube Channel</label>
            <input type="text" class="te-prop-input" id="te-info-yt" value="${escapeHtml(info.youtube || '')}" placeholder="LRD ESPORTS" />
          </div>
          <div class="te-prop-group">
            <label class="te-prop-label">Instagram Handle</label>
            <input type="text" class="te-prop-input" id="te-info-ig" value="${escapeHtml(info.instagram || '')}" placeholder="@LRDESPORTS" />
          </div>
          <div class="te-prop-group">
            <label class="te-prop-label">Organizer Name</label>
            <input type="text" class="te-prop-input" id="te-info-org" value="${escapeHtml(info.organizer || '')}" placeholder="LRD Esports" />
          </div>
          <div class="te-prop-group">
            <label class="te-prop-label">Website</label>
            <input type="text" class="te-prop-input" id="te-info-web" value="${escapeHtml(info.website || '')}" placeholder="lrdesports.com" />
          </div>
          <div class="te-prop-group">
            <label class="te-prop-label">Custom Header</label>
            <input type="text" class="te-prop-input" id="te-info-hdr" value="${escapeHtml(info.header || '')}" placeholder="OVERALL STANDINGS" />
          </div>
          <div class="te-prop-group">
            <label class="te-prop-label">Custom Footer / Rules</label>
            <input type="text" class="te-prop-input" id="te-info-ftr" value="${escapeHtml(info.footer || '')}" placeholder="OFFICIAL FREE FIRE SCORING" />
          </div>
        </div>
      `;

      this.dom.infoDrawer.classList.add('open');

      const bind = (id, prop) => {
        this.dom.infoDrawer.querySelector(id)?.addEventListener('input', (e) => {
          if (!this.currentTemplate.info) this.currentTemplate.info = {};
          this.currentTemplate.info[prop] = e.target.value;
          this.render();
        });
      };

      bind('#te-info-tname', 'tournamentName');
      bind('#te-info-match', 'matchNumber');
      bind('#te-info-yt', 'youtube');
      bind('#te-info-ig', 'instagram');
      bind('#te-info-org', 'organizer');
      bind('#te-info-web', 'website');
      bind('#te-info-hdr', 'header');
      bind('#te-info-ftr', 'footer');

      this.dom.infoDrawer.querySelector('#te-info-close')?.addEventListener('click', () => {
        this.closeInfoDrawer();
      });
    }

    closeInfoDrawer() {
      this.dom.infoDrawer?.classList.remove('open');
    }

    // ================================================================
    // ADD FIELD MODAL
    // ================================================================

    openAddFieldModal() {
      if (!this.dom.addFieldModal) return;

      this.dom.addFieldModal.innerHTML = `
        <div class="te-modal-box">
          <div class="te-modal-header">
            <h3>+ Add Element to Design</h3>
            <button type="button" class="te-icon-action" id="te-add-close">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
          <div class="te-field-categories">
            <div class="te-field-cat-title">TABLE & STATS</div>
            <div class="te-field-btn-grid">
              <button type="button" class="te-cat-item-btn te-cat-item-btn--highlight" data-field-preset="leaderboard_table">
                <span>Leaderboard Table (Full)</span>
              </button>
              <button type="button" class="te-cat-item-btn" data-field-preset="rank_badge">
                <span>Rank #</span>
              </button>
              <button type="button" class="te-cat-item-btn" data-field-preset="team_name_field">
                <span>Team Name</span>
              </button>
              <button type="button" class="te-cat-item-btn" data-field-preset="position_badge">
                <span>Position</span>
              </button>
              <button type="button" class="te-cat-item-btn" data-field-preset="kills_badge">
                <span>Kills</span>
              </button>
              <button type="button" class="te-cat-item-btn" data-field-preset="placement_pts_badge">
                <span>Placement Pts</span>
              </button>
              <button type="button" class="te-cat-item-btn" data-field-preset="kill_pts_badge">
                <span>Kill Pts</span>
              </button>
              <button type="button" class="te-cat-item-btn" data-field-preset="total_pts_badge">
                <span>Total Points</span>
              </button>
            </div>

            <div class="te-field-cat-title">SHAPES & ACCENTS</div>
            <div class="te-field-btn-grid">
              <button type="button" class="te-cat-item-btn" data-field-preset="shape_rect">
                <span>Accent Bar / Rectangle</span>
              </button>
              <button type="button" class="te-cat-item-btn" data-field-preset="logo">
                <span>Team / Tournament Logo</span>
              </button>
            </div>

            <div class="te-field-cat-title">TOURNAMENT HEADINGS</div>
            <div class="te-field-btn-grid">
              <button type="button" class="te-cat-item-btn" data-field-preset="tournament_name">
                <span>Tournament Name</span>
              </button>
              <button type="button" class="te-cat-item-btn" data-field-preset="match_number">
                <span>Match Number</span>
              </button>
              <button type="button" class="te-cat-item-btn" data-field-preset="date">
                <span>Date</span>
              </button>
              <button type="button" class="te-cat-item-btn" data-field-preset="organizer">
                <span>Organizer</span>
              </button>
            </div>

            <div class="te-field-cat-title">SOCIAL MEDIA</div>
            <div class="te-field-btn-grid">
              <button type="button" class="te-cat-item-btn" data-field-preset="youtube">
                <span>YouTube</span>
              </button>
              <button type="button" class="te-cat-item-btn" data-field-preset="instagram">
                <span>Instagram</span>
              </button>
              <button type="button" class="te-cat-item-btn" data-field-preset="whatsapp">
                <span>WhatsApp</span>
              </button>
              <button type="button" class="te-cat-item-btn" data-field-preset="website">
                <span>Website</span>
              </button>
            </div>
          </div>
        </div>
      `;

      this.dom.addFieldModal.classList.add('open');

      this.dom.addFieldModal.querySelector('#te-add-close')?.addEventListener('click', () => {
        this.dom.addFieldModal.classList.remove('open');
      });

      this.dom.addFieldModal.querySelectorAll('[data-field-preset]').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.addFieldByPreset(btn.dataset.fieldPreset);
          this.dom.addFieldModal.classList.remove('open');
        });
      });
    }

    /**
     * Add field by preset key
     */
    addFieldByPreset(preset) {
      const id = `f_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 4)}`;
      let newField = null;

      const centerX = Math.round(((this.currentTemplate?.canvas?.width || 1080) - 600) / 2);
      const centerY = 300;

      switch (preset) {
        case 'shape_rect':
          newField = {
            id,
            type: 'shape',
            x: centerX,
            y: centerY,
            width: 440,
            height: 50,
            backgroundColor: 'rgba(212, 175, 55, 0.25)',
            border: '1px solid #d4af37',
            borderRadius: 8,
          };
          break;

        case 'tournament_name':
          newField = {
            id,
            type: 'text',
            content: '{{tournament.name}}',
            x: centerX,
            y: centerY,
            width: 600,
            height: 60,
            fontSize: 42,
            fontFamily: 'Inter',
            fontWeight: '900',
            color: '#ffffff',
            alignment: 'center',
          };
          break;

        case 'match_number':
          newField = {
            id,
            type: 'text',
            content: '{{tournament.matchNumber}}',
            x: centerX,
            y: centerY,
            width: 300,
            height: 44,
            fontSize: 22,
            fontFamily: 'Inter',
            fontWeight: '800',
            color: '#d4af37',
            alignment: 'center',
          };
          break;

        case 'date':
          newField = {
            id,
            type: 'text',
            content: '{{tournament.date}}',
            x: centerX,
            y: centerY,
            width: 260,
            height: 36,
            fontSize: 18,
            fontFamily: 'Inter',
            fontWeight: '600',
            color: '#8e92a4',
            alignment: 'center',
          };
          break;

        case 'organizer':
          newField = {
            id,
            type: 'text',
            content: 'ORGANIZED BY {{tournament.organizer}}',
            x: centerX,
            y: centerY,
            width: 440,
            height: 36,
            fontSize: 16,
            fontFamily: 'Inter',
            fontWeight: '700',
            color: '#d4af37',
            alignment: 'center',
            letterSpacing: '2px',
          };
          break;

        case 'youtube':
          newField = {
            id,
            type: 'text',
            content: '▶ YouTube: {{tournament.youtube}}',
            x: 80,
            y: 1200,
            width: 400,
            height: 40,
            fontSize: 20,
            fontFamily: 'Inter',
            fontWeight: '700',
            color: '#ff4444',
            alignment: 'left',
          };
          break;

        case 'instagram':
          newField = {
            id,
            type: 'text',
            content: '📷 Instagram: {{tournament.instagram}}',
            x: 580,
            y: 1200,
            width: 400,
            height: 40,
            fontSize: 20,
            fontFamily: 'Inter',
            fontWeight: '700',
            color: '#e1306c',
            alignment: 'right',
          };
          break;

        case 'whatsapp':
          newField = {
            id,
            type: 'text',
            content: '💬 WhatsApp: {{tournament.whatsapp}}',
            x: centerX,
            y: 1200,
            width: 440,
            height: 40,
            fontSize: 20,
            fontFamily: 'Inter',
            fontWeight: '700',
            color: '#25d366',
            alignment: 'center',
          };
          break;

        case 'website':
          newField = {
            id,
            type: 'text',
            content: '🌐 {{tournament.website}}',
            x: centerX,
            y: 1240,
            width: 500,
            height: 36,
            fontSize: 18,
            fontFamily: 'Inter',
            fontWeight: '600',
            color: '#ffffff',
            alignment: 'center',
          };
          break;

        case 'rank_badge':
          newField = {
            id,
            type: 'text',
            content: '#{{row.rank}}',
            x: 100,
            y: centerY,
            width: 80,
            height: 50,
            fontSize: 26,
            fontFamily: 'Inter',
            fontWeight: '900',
            color: '#ffd700',
            backgroundColor: 'rgba(212, 175, 55, 0.2)',
            borderRadius: 8,
            alignment: 'center',
          };
          break;

        case 'team_name_field':
          newField = {
            id,
            type: 'text',
            content: '{{row.teamName}}',
            x: 200,
            y: centerY,
            width: 400,
            height: 50,
            fontSize: 26,
            fontFamily: 'Inter',
            fontWeight: '800',
            color: '#ffffff',
            alignment: 'left',
          };
          break;

        case 'position_badge':
          newField = {
            id,
            type: 'text',
            content: 'PLC: {{row.position}}',
            x: 620,
            y: centerY,
            width: 120,
            height: 50,
            fontSize: 22,
            fontFamily: 'Inter',
            fontWeight: '700',
            color: '#8e92a4',
            alignment: 'center',
          };
          break;

        case 'kills_badge':
          newField = {
            id,
            type: 'text',
            content: 'KILLS: {{row.kills}}',
            x: 760,
            y: centerY,
            width: 140,
            height: 50,
            fontSize: 22,
            fontFamily: 'Inter',
            fontWeight: '800',
            color: '#ef4444',
            alignment: 'center',
          };
          break;

        case 'placement_pts_badge':
          newField = {
            id,
            type: 'text',
            content: 'PLACE: {{row.placementPoints}} pts',
            x: centerX,
            y: centerY + 60,
            width: 260,
            height: 44,
            fontSize: 20,
            fontFamily: 'Inter',
            fontWeight: '700',
            color: '#d4af37',
            alignment: 'center',
          };
          break;

        case 'kill_pts_badge':
          newField = {
            id,
            type: 'text',
            content: 'KILL: {{row.killPoints}} pts',
            x: centerX,
            y: centerY + 110,
            width: 260,
            height: 44,
            fontSize: 20,
            fontFamily: 'Inter',
            fontWeight: '700',
            color: '#f97316',
            alignment: 'center',
          };
          break;

        case 'total_pts_badge':
          newField = {
            id,
            type: 'text',
            content: 'TOTAL: {{row.totalPoints}} PTS',
            x: centerX,
            y: centerY + 160,
            width: 320,
            height: 54,
            fontSize: 24,
            fontFamily: 'Inter',
            fontWeight: '900',
            color: '#ffd700',
            backgroundColor: 'rgba(212, 175, 55, 0.2)',
            borderRadius: 12,
            alignment: 'center',
          };
          break;

        case 'logo':
          newField = {
            id,
            type: 'logo',
            x: centerX,
            y: 80,
            width: 140,
            height: 140,
            src: '',
          };
          break;

        case 'leaderboard_table':
          newField = {
            id,
            type: 'leaderboard',
            x: 60,
            y: 280,
            width: 960,
            height: 880,
            rowHeight: 64,
            headerHeight: 46,
            maxRows: 12,
            rowGap: 4,
            columns: [
              { key: 'rank', label: '#', width: 80, align: 'center' },
              { key: 'teamName', label: 'TEAM NAME', width: 440, align: 'left' },
              { key: 'position', label: 'PLC', width: 140, align: 'center' },
              { key: 'kills', label: 'KILLS', width: 140, align: 'center' },
              { key: 'totalPoints', label: 'PTS', width: 160, align: 'center', highlight: true },
            ],
            headerStyle: {
              backgroundColor: 'rgba(212, 175, 55, 0.15)',
              color: '#d4af37',
              fontSize: 18,
              fontWeight: '800',
            },
            rowStyle: {
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              alternateColor: 'rgba(255, 255, 255, 0.06)',
              color: '#ffffff',
              fontSize: 22,
              fontWeight: '600',
              top3Gold: true,
              borderRadius: 6,
            },
          };
          break;

        default:
          newField = {
            id,
            type: 'text',
            content: 'CUSTOM TEXT',
            x: centerX,
            y: centerY,
            width: 400,
            height: 48,
            fontSize: 24,
            fontFamily: 'Inter',
            fontWeight: '700',
            color: '#ffffff',
            alignment: 'center',
          };
          break;
      }

      if (newField) {
        this.currentTemplate.fields.push(newField);
        this.pushState(`Add ${newField.type}`);
        this.render();
        this.selectField(newField.id);
      }
    }

    // ================================================================
    // DATA SOURCE & LIVE STANDINGS BINDING
    // ================================================================

    populateDataSourceSelector() {
      const select = this.dom.selectDataSource;
      if (!select) return;

      select.innerHTML = '';

      let hasTournaments = false;
      if (this.userId && window.LocalDatabaseService) {
        const tourns = window.LocalDatabaseService.getTournaments(this.userId) || [];
        tourns.forEach((t) => {
          hasTournaments = true;
          const opt = document.createElement('option');
          opt.value = t.id;
          opt.textContent = `🏆 ${t.name || 'Tournament'} (${t.game_mode || 'Squad'})`;
          select.appendChild(opt);
        });
      }

      // Add Sample option
      const sampleOpt = document.createElement('option');
      sampleOpt.value = 'sample';
      sampleOpt.textContent = '📊 Sample Standings (12 Teams)';
      select.appendChild(sampleOpt);

      // Synchronize selected tournament
      const targetId = this.activeDataContext?.tournament?.id;
      if (targetId && targetId !== 'sample') {
        select.value = targetId;
      } else if (hasTournaments && select.options.length > 1) {
        select.selectedIndex = 0;
      } else {
        select.value = 'sample';
      }
    }

    setDataSource(sourceId) {
      if (sourceId === 'sample' || !sourceId) {
        this.activeDataContext = {
          tournament: {
            id: 'sample',
            name: this.currentTemplate?.info?.tournamentName || 'LRD THUNDER STRIKE CUP',
            gameMode: 'squad',
            matchNumber: 'OVERALL STANDINGS',
            organizer: 'LRD Esports',
            youtube: 'LRD ESPORTS',
            instagram: '@LRDESPORTS',
            footer: 'OFFICIAL FREE FIRE POINT SYSTEM — 12-9-8-7-6-5-4-3-2-1-0-0',
          },
          match: { match_number: 1 },
          leaderboard: this.getSampleLeaderboard(),
          mode: 'overall',
        };
      } else if (window.LocalDatabaseService) {
        const tourn = window.LocalDatabaseService.getTournamentById(sourceId, this.userId);
        if (tourn) {
          const leaderboard = window.LocalDatabaseService.getLeaderboard(sourceId, null);
          this.activeDataContext = {
            tournament: {
              id: tourn.id,
              name: tourn.name,
              gameMode: tourn.game_mode,
              matchNumber: 'OVERALL STANDINGS',
              organizer: tourn.organizer || 'LRD Esports',
              youtube: tourn.youtube || 'LRD ESPORTS',
              instagram: tourn.instagram || '@LRDESPORTS',
              footer: 'OFFICIAL FREE FIRE POINT SYSTEM — 12-9-8-7-6-5-4-3-2-1-0-0',
            },
            match: { match_number: 1 },
            leaderboard: leaderboard && leaderboard.length > 0 ? leaderboard : this.getSampleLeaderboard(),
            mode: 'overall',
          };
          if (this.currentTemplate?.info) {
            this.currentTemplate.info.tournamentName = tourn.name;
          }
        }
      }
      this.pushState('Change Data Source');
      this.render();
    }

    buildDefaultDataContext() {
      if (this.userId && window.LocalDatabaseService) {
        const tourns = window.LocalDatabaseService.getTournaments(this.userId) || [];
        if (tourns.length > 0) {
          const tourn = tourns[0];
          const leaderboard = window.LocalDatabaseService.getLeaderboard(tourn.id, null);
          return {
            tournament: {
              id: tourn.id,
              name: tourn.name,
              gameMode: tourn.game_mode,
              matchNumber: 'OVERALL STANDINGS',
              organizer: tourn.organizer || 'LRD Esports',
              youtube: tourn.youtube || 'LRD ESPORTS',
              instagram: tourn.instagram || '@LRDESPORTS',
              footer: 'OFFICIAL FREE FIRE POINT SYSTEM — 12-9-8-7-6-5-4-3-2-1-0-0',
            },
            match: { match_number: 1 },
            leaderboard: leaderboard && leaderboard.length > 0 ? leaderboard : this.getSampleLeaderboard(),
            mode: 'overall',
          };
        }
      }

      return {
        tournament: {
          id: 'sample',
          name: this.currentTemplate?.info?.tournamentName || 'LRD THUNDER STRIKE CUP',
          gameMode: 'squad',
          matchNumber: 'OVERALL STANDINGS',
          organizer: 'LRD Esports',
          youtube: 'LRD ESPORTS',
          instagram: '@LRDESPORTS',
          footer: 'OFFICIAL FREE FIRE POINT SYSTEM — 12-9-8-7-6-5-4-3-2-1-0-0',
        },
        match: { match_number: 1 },
        leaderboard: this.getSampleLeaderboard(),
        mode: 'overall',
      };
    }

    getActiveLeaderboard(field) {
      const data = this.activeDataContext?.leaderboard || this.getSampleLeaderboard();
      const maxRows = field?.maxRows || 12;
      const pageIndex = field?.pageIndex || 0;
      const startIdx = pageIndex * maxRows;
      return data.slice(startIdx, startIdx + maxRows);
    }

    // ================================================================
    // TOP BAR ACTIONS (Back, Save, Preview, Export)
    // ================================================================

    handleBack() {
      if (confirm('Discard any unsaved changes and return to Designs?')) {
        this.close();
      }
    }

    handleSave() {
      if (!this.userId) {
        if (window.showToast) window.showToast('Please sign in to save your template.', 'error');
        return;
      }

      try {
        const isExistingCustom = this.currentTemplate.category === 'custom' && !this.currentTemplate.id.startsWith('tmpl_free');

        let saved = null;
        if (isExistingCustom) {
          saved = window.TemplateStore?.updateCustomTemplate(this.userId, this.currentTemplate.id, this.currentTemplate);
        } else {
          saved = window.TemplateStore?.saveCustomTemplate(this.userId, this.currentTemplate);
        }

        if (saved) {
          this.currentTemplate = saved;
          if (window.showToast) window.showToast(`Template "${saved.name}" saved!`, 'success');
          if (typeof this.onSaveCallback === 'function') {
            this.onSaveCallback(saved);
          }
        }
      } catch (err) {
        console.error('Failed to save template:', err);
        if (window.showToast) window.showToast(err.message || 'Could not save template.', 'error');
      }
    }

    handlePreview() {
      if (window.DesignManager) {
        window.DesignManager.openPreviewModal(this.currentTemplate);
      }
    }

    handleExport() {
      if (this.dom.exportModal) {
        this.dom.exportModal.style.display = 'flex';
      } else {
        this.exportAsPNG();
      }
    }

    closeExportModal() {
      if (this.dom.exportModal) {
        this.dom.exportModal.style.display = 'none';
      }
    }

    async exportAsPNG() {
      this.closeExportModal();
      if (!window.ExportEngine) {
        if (window.showToast) window.showToast('Export engine is not loaded.', 'error');
        return;
      }
      try {
        if (window.showToast) window.showToast('Generating high-res PNG export...', 'info');
        const ctx = this.activeDataContext || this.buildDefaultDataContext();
        await window.ExportEngine.downloadPNG(this.currentTemplate, ctx);
        if (window.showToast) window.showToast('Export downloaded successfully!', 'success');
      } catch (err) {
        console.error('Export failed:', err);
        if (window.showToast) window.showToast('Failed to generate export: ' + (err.message || err), 'error');
      }
    }

    exportAsTheme() {
      this.closeExportModal();
      if (!window.TemplateStore?.downloadThemePackage) {
        if (window.showToast) window.showToast('Template store does not support theme export.', 'error');
        return;
      }
      try {
        const exportedFilename = window.TemplateStore.downloadThemePackage(this.currentTemplate);
        if (window.showToast) window.showToast(`Exported theme "${exportedFilename}"!`, 'success');
      } catch (err) {
        console.error('Failed to export theme:', err);
        if (window.showToast) window.showToast('Failed to export theme: ' + (err.message || err), 'error');
      }
    }

    async exportAsPDF() {
      this.closeExportModal();
      if (!window.ExportEngine?.downloadPDF) {
        if (window.showToast) window.showToast('PDF export not supported.', 'error');
        return;
      }
      try {
        if (window.showToast) window.showToast('Generating PDF layout...', 'info');
        const ctx = this.activeDataContext || this.buildDefaultDataContext();
        await window.ExportEngine.downloadPDF(this.currentTemplate, ctx);
        if (window.showToast) window.showToast('PDF downloaded successfully!', 'success');
      } catch (err) {
        console.error('Failed to generate PDF:', err);
        if (window.showToast) window.showToast('Failed to generate PDF: ' + (err.message || err), 'error');
      }
    }

    /**
     * Sample leaderboard data for the editor stage
     */
    getSampleLeaderboard() {
      return [
        { rank: 1, teamName: 'Total Gaming', placement: 1, kills: 14, placementPoints: 12, killPoints: 14, totalPoints: 26, matchesPlayed: 3, booyahs: 2 },
        { rank: 2, teamName: 'Orangutan Elite', placement: 2, kills: 9, placementPoints: 9, killPoints: 9, totalPoints: 18, matchesPlayed: 3, booyahs: 1 },
        { rank: 3, teamName: 'GodLike Esports', placement: 3, kills: 7, placementPoints: 8, killPoints: 7, totalPoints: 15, matchesPlayed: 3, booyahs: 0 },
        { rank: 4, teamName: 'Team Elite', placement: 4, kills: 6, placementPoints: 7, killPoints: 6, totalPoints: 13, matchesPlayed: 3, booyahs: 0 },
        { rank: 5, teamName: 'Blind Esports', placement: 5, kills: 5, placementPoints: 6, killPoints: 5, totalPoints: 11, matchesPlayed: 3, booyahs: 0 },
        { rank: 6, teamName: 'Nigma Galaxy', placement: 6, kills: 4, placementPoints: 5, killPoints: 4, totalPoints: 9, matchesPlayed: 3, booyahs: 0 },
        { rank: 7, teamName: 'TSM FTX', placement: 7, kills: 3, placementPoints: 4, killPoints: 3, totalPoints: 7, matchesPlayed: 3, booyahs: 0 },
        { rank: 8, teamName: 'Team Chaos', placement: 8, kills: 2, placementPoints: 3, killPoints: 2, totalPoints: 5, matchesPlayed: 3, booyahs: 0 },
        { rank: 9, teamName: 'Chemin Esports', placement: 9, kills: 2, placementPoints: 2, killPoints: 2, totalPoints: 4, matchesPlayed: 3, booyahs: 0 },
        { rank: 10, teamName: 'Enigma Gaming', placement: 10, kills: 1, placementPoints: 1, killPoints: 1, totalPoints: 2, matchesPlayed: 3, booyahs: 0 },
        { rank: 11, teamName: 'Revenant Esports', placement: 11, kills: 1, placementPoints: 0, killPoints: 1, totalPoints: 1, matchesPlayed: 3, booyahs: 0 },
        { rank: 12, teamName: 'Hyderabad Hydras', placement: 12, kills: 0, placementPoints: 0, killPoints: 0, totalPoints: 0, matchesPlayed: 3, booyahs: 0 },
      ];
    }
  }

  // Export singleton
  window.TemplateEditor = new TemplateEditor();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = window.TemplateEditor;
  }
})(typeof window !== 'undefined' ? window : global);
