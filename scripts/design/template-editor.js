/* ====================================================================
   LRD PointCalc — Template Editor Controller (Canva-Style)
   ====================================================================
   PURPOSE:
   Interactive, mobile-first editor for customizing point-table templates.
   Allows drag-and-drop field positioning, property editing via bottom sheets,
   and dynamic data binding.
   ==================================================================== */

(function (window) {
  'use strict';

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
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
      this.dragStart = { x: 0, y: 0 };
      this.fieldStart = { x: 0, y: 0, w: 0, h: 0 };
      this.activeHandle = null;

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
        btnSave: elements.btnSave || document.getElementById('te-btn-save'),
        btnPreview: elements.btnPreview || document.getElementById('te-btn-preview'),
        btnAddField: elements.btnAddField || document.getElementById('te-btn-add-field'),
        btnInfo: elements.btnInfo || document.getElementById('te-btn-info'),
        propsSheet: elements.propsSheet || document.getElementById('te-props-sheet'),
        infoDrawer: elements.infoDrawer || document.getElementById('te-info-drawer'),
        addFieldModal: elements.addFieldModal || document.getElementById('te-add-field-modal'),
      };

      this.bindEvents();
    }

    /**
     * Bind UI event listeners
     */
    bindEvents() {
      // Top bar
      this.dom.btnBack?.addEventListener('click', () => this.handleBack());
      this.dom.btnSave?.addEventListener('click', () => this.handleSave());
      this.dom.btnPreview?.addEventListener('click', () => this.handlePreview());

      // Name change
      this.dom.templateNameInput?.addEventListener('input', (e) => {
        if (this.currentTemplate) {
          this.currentTemplate.name = e.target.value.trim() || 'Untitled Template';
        }
      });

      // Bottom bar actions
      this.dom.btnAddField?.addEventListener('click', () => this.openAddFieldModal());
      this.dom.btnInfo?.addEventListener('click', () => this.openInfoDrawer());

      // Close modal backdrops
      document.querySelectorAll('.te-modal-backdrop').forEach((el) => {
        el.addEventListener('click', (e) => {
          if (e.target === el) el.classList.remove('open');
        });
      });

      // Window resize re-scales canvas to fit viewport
      window.addEventListener('resize', () => {
        if (this.isOpen()) this.fitCanvasToViewport();
      });
    }

    /**
     * Open editor with a given template
     *
     * @param {Object} template - Template to edit (clone or new)
     * @param {string} userId - Current user ID
     */
    open(template, userId) {
      this.userId = userId;
      this.currentTemplate = JSON.parse(JSON.stringify(template));
      this.selectedFieldId = null;

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

      this.render();
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
      this.closePropsSheet();
      this.closeInfoDrawer();

      if (typeof this.onCloseCallback === 'function') {
        this.onCloseCallback();
      }
    }

    isOpen() {
      return this.dom.container && this.dom.container.classList.contains('active');
    }

    /**
     * Re-render canvas elements and selection
     */
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

      // Context with sample / template info
      const context = {
        tournament: { name: this.currentTemplate.info?.tournamentName || 'LRD TOURNAMENT' },
        match: { match_number: 1 },
        info: this.currentTemplate.info || {},
        mode: 'overall',
      };

      // Mock sample leaderboard for live editing preview
      const sampleLeaderboard = this.getSampleLeaderboard();

      // 2. Render all fields as interactive elements
      (this.currentTemplate.fields || []).forEach((field) => {
        const fieldEl = this.createEditableFieldElement(field, context, sampleLeaderboard);
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
     * Create an interactive DOM element with selection & transform handles
     */
    createEditableFieldElement(field, context, sampleLeaderboard) {
      const el = document.createElement('div');
      el.className = 'te-editable-field';
      el.dataset.fieldId = field.id;

      el.style.position = 'absolute';
      el.style.left = `${field.x}px`;
      el.style.top = `${field.y}px`;
      el.style.width = `${field.width}px`;
      el.style.height = `${field.height}px`;
      el.style.boxSizing = 'border-box';
      el.style.cursor = 'move';
      el.style.userSelect = 'none';

      if (field.opacity !== undefined) el.style.opacity = field.opacity;
      if (field.borderRadius) el.style.borderRadius = `${field.borderRadius}px`;
      if (field.backgroundColor) el.style.backgroundColor = field.backgroundColor;
      if (field.border) el.style.border = field.border;

      const isSelected = this.selectedFieldId === field.id;
      if (isSelected) {
        el.classList.add('is-selected');
      }

      // Inner content container
      const contentEl = document.createElement('div');
      contentEl.className = 'te-field-inner';
      contentEl.style.width = '100%';
      contentEl.style.height = '100%';
      contentEl.style.pointerEvents = 'none'; // pointer events handled on wrapper

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
        contentEl.style.padding = '0 8px';

        const raw = field.content || '';
        contentEl.textContent = window.TemplateVariables
          ? window.TemplateVariables.resolveVariables(raw, context)
          : raw;
      } else if (field.type === 'leaderboard') {
        contentEl.style.overflow = 'hidden';
        // Render mini version of table
        window.TemplateRenderer?.renderToDOM(
          { canvas: { width: field.width, height: field.height }, background: null, fields: [field] },
          { leaderboard: sampleLeaderboard, info: context.info },
          contentEl
        );
      } else if (field.type === 'image' || field.type === 'logo') {
        contentEl.style.display = 'flex';
        contentEl.style.alignItems = 'center';
        contentEl.style.justifyContent = 'center';
        if (field.src) {
          const img = document.createElement('img');
          img.src = field.src;
          img.style.maxWidth = '100%';
          img.style.maxHeight = '100%';
          img.style.objectFit = 'contain';
          contentEl.appendChild(img);
        } else {
          contentEl.style.border = '1px dashed #d4af37';
          contentEl.style.color = '#d4af37';
          contentEl.textContent = field.type === 'logo' ? 'LOGO' : 'IMAGE';
        }
      }

      el.appendChild(contentEl);

      // Add resize handles if selected
      if (isSelected) {
        this.appendResizeHandles(el);
      }

      // Pointer event listeners for dragging
      el.addEventListener('pointerdown', (e) => this.onFieldPointerDown(e, field));

      return el;
    }

    /**
     * Append 4 corner resize handles
     */
    appendResizeHandles(el) {
      ['tl', 'tr', 'bl', 'br'].forEach((pos) => {
        const handle = document.createElement('div');
        handle.className = `te-resize-handle handle-${pos}`;
        handle.dataset.handle = pos;
        el.appendChild(handle);
      });
    }

    /**
     * Handle pointer down on field
     */
    onFieldPointerDown(e, field) {
      e.stopPropagation();

      const handle = e.target.closest('.te-resize-handle');
      if (handle) {
        // Start resizing
        this.isResizing = true;
        this.activeHandle = handle.dataset.handle;
      } else {
        // Start dragging
        this.isDragging = true;
        this.activeHandle = null;
      }

      this.selectField(field.id);

      this.dragStart = { x: e.clientX, y: e.clientY };
      this.fieldStart = {
        x: field.x,
        y: field.y,
        w: field.width,
        h: field.height,
      };

      const onPointerMove = (moveEvent) => {
        const dx = (moveEvent.clientX - this.dragStart.x) / this.zoomScale;
        const dy = (moveEvent.clientY - this.dragStart.y) / this.zoomScale;

        if (this.isDragging) {
          field.x = Math.round(this.fieldStart.x + dx);
          field.y = Math.round(this.fieldStart.y + dy);
          this.updateFieldElementPosition(field);
          this.updatePropsSheetValues(field);
        } else if (this.isResizing) {
          this.calculateResize(field, dx, dy, this.activeHandle);
          this.updateFieldElementPosition(field);
          this.updatePropsSheetValues(field);
        }
      };

      const onPointerUp = () => {
        this.isDragging = false;
        this.isResizing = false;
        this.activeHandle = null;
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
      };

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    }

    /**
     * Calculate bounding box during resize
     */
    calculateResize(field, dx, dy, handle) {
      const minW = 40;
      const minH = 24;

      if (handle === 'br') {
        field.width = Math.max(minW, Math.round(this.fieldStart.w + dx));
        field.height = Math.max(minH, Math.round(this.fieldStart.h + dy));
      } else if (handle === 'tr') {
        field.width = Math.max(minW, Math.round(this.fieldStart.w + dx));
        const newH = Math.max(minH, Math.round(this.fieldStart.h - dy));
        field.y = Math.round(this.fieldStart.y + (this.fieldStart.h - newH));
        field.height = newH;
      } else if (handle === 'bl') {
        const newW = Math.max(minW, Math.round(this.fieldStart.w - dx));
        field.x = Math.round(this.fieldStart.x + (this.fieldStart.w - newW));
        field.width = newW;
        field.height = Math.max(minH, Math.round(this.fieldStart.h + dy));
      } else if (handle === 'tl') {
        const newW = Math.max(minW, Math.round(this.fieldStart.w - dx));
        const newH = Math.max(minH, Math.round(this.fieldStart.h - dy));
        field.x = Math.round(this.fieldStart.x + (this.fieldStart.w - newW));
        field.y = Math.round(this.fieldStart.y + (this.fieldStart.h - newH));
        field.width = newW;
        field.height = newH;
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

    /**
     * Fit canvas nicely within the viewport area
     */
    fitCanvasToViewport() {
      if (!this.dom.canvasViewport || !this.dom.canvasStage || !this.currentTemplate) return;

      const vpW = this.dom.canvasViewport.clientWidth - 32;
      const vpH = this.dom.canvasViewport.clientHeight - 32;

      const baseW = this.currentTemplate.canvas?.width || 1080;
      const baseH = this.currentTemplate.canvas?.height || 1350;

      const scaleX = vpW / baseW;
      const scaleY = vpH / baseH;
      const scale = Math.min(scaleX, scaleY, 0.95);

      this.zoomScale = Math.max(0.2, scale);

      this.dom.canvasStage.style.transform = `scale(${this.zoomScale})`;
      this.dom.canvasStage.style.transformOrigin = 'center center';
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

      return `
        <div class="te-sheet-header">
          <span class="te-sheet-title">Edit ${field.type.toUpperCase()}</span>
          <div class="te-sheet-actions">
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

          ${isTable ? `
            <div class="te-prop-group">
              <label class="te-prop-label">Max Display Rows</label>
              <input type="number" class="te-prop-input" id="te-prop-maxrows" value="${field.maxRows || 12}" min="2" max="24" />
            </div>
            <div class="te-prop-group">
              <label class="te-prop-label">Row Height (px)</label>
              <input type="number" class="te-prop-input" id="te-prop-rowheight" value="${field.rowHeight || 64}" min="36" max="120" />
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

      // Delete
      sheet.querySelector('#te-prop-delete')?.addEventListener('click', () => {
        this.currentTemplate.fields = this.currentTemplate.fields.filter((f) => f.id !== field.id);
        this.deselectField();
      });

      // Duplicate
      sheet.querySelector('#te-prop-duplicate')?.addEventListener('click', () => {
        const copy = JSON.parse(JSON.stringify(field));
        copy.id = `f_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 4)}`;
        copy.x += 20;
        copy.y += 20;
        this.currentTemplate.fields.push(copy);
        this.selectField(copy.id);
      });

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

      // Dimensions
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

      // Font & Color
      sheet.querySelector('#te-prop-size')?.addEventListener('input', (e) => {
        field.fontSize = Math.max(10, parseInt(e.target.value, 10) || 20);
        this.render();
      });
      sheet.querySelector('#te-prop-color')?.addEventListener('input', (e) => {
        field.color = e.target.value;
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

      // Table settings
      sheet.querySelector('#te-prop-maxrows')?.addEventListener('input', (e) => {
        field.maxRows = Math.max(2, Math.min(24, parseInt(e.target.value, 10) || 12));
        this.render();
      });
      sheet.querySelector('#te-prop-rowheight')?.addEventListener('input', (e) => {
        field.rowHeight = Math.max(30, parseInt(e.target.value, 10) || 64);
        this.render();
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

      if (wInp) wInp.value = field.width;
      if (hInp) hInp.value = field.height;
      if (xInp) xInp.value = field.x;
      if (yInp) yInp.value = field.y;
    }

    // ================================================================
    // DYNAMIC TEXT EDITING: TEMPLATE INFORMATION PANEL (Section 6)
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

      // Bind dynamic inputs for real-time reflection
      const bind = (id, prop) => {
        this.dom.infoDrawer.querySelector(id)?.addEventListener('input', (e) => {
          this.currentTemplate.info[prop] = e.target.value;
          this.render(); // Immediate update across all matching variables!
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
            <h3>+ Add Field to Design</h3>
            <button type="button" class="te-icon-action" id="te-add-close">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
          <div class="te-field-categories">
            <div class="te-field-cat-title">TOURNAMENT</div>
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

            <div class="te-field-cat-title">SOCIAL</div>
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

            <div class="te-field-cat-title">BRANDING</div>
            <div class="te-field-btn-grid">
              <button type="button" class="te-cat-item-btn" data-field-preset="logo">
                <span>Logo / Graphic</span>
              </button>
              <button type="button" class="te-cat-item-btn" data-field-preset="custom_text">
                <span>Custom Text</span>
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

      const centerX = Math.round((this.currentTemplate.canvas.width - 600) / 2);
      const centerY = 300;

      switch (preset) {
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
            },
          };
          break;

        case 'custom_text':
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
        this.render();
        this.selectField(newField.id);
      }
    }

    // ================================================================
    // TOP BAR ACTIONS (Back, Save, Preview)
    // ================================================================

    handleBack() {
      if (confirm('Discard any unsaved changes and return to Designs?')) {
        this.close();
      }
    }

    handleSave() {
      if (!this.userId) {
        alert('Please sign in to save your template.');
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
          if (window.showToast) window.showToast(`Template "${saved.name}" saved!`);
          if (typeof this.onSaveCallback === 'function') {
            this.onSaveCallback(saved);
          }
        }
      } catch (err) {
        console.error('Failed to save template:', err);
        alert(err.message || 'Could not save template.');
      }
    }

    handlePreview() {
      // Trigger preview modal via DesignManager
      if (window.DesignManager) {
        window.DesignManager.openPreviewModal(this.currentTemplate);
      }
    }

    /**
     * Sample leaderboard data for the editor stage
     */
    getSampleLeaderboard() {
      return [
        { rank: 1, teamName: 'Total Gaming', placement: 1, kills: 14, placementPoints: 12, killPoints: 14, totalPoints: 26 },
        { rank: 2, teamName: 'Orangutan Elite', placement: 2, kills: 9, placementPoints: 9, killPoints: 9, totalPoints: 18 },
        { rank: 3, teamName: 'GodLike Esports', placement: 3, kills: 7, placementPoints: 8, killPoints: 7, totalPoints: 15 },
        { rank: 4, teamName: 'Team Elite', placement: 4, kills: 6, placementPoints: 7, killPoints: 6, totalPoints: 13 },
        { rank: 5, teamName: 'Blind Esports', placement: 5, kills: 5, placementPoints: 6, killPoints: 5, totalPoints: 11 },
        { rank: 6, teamName: 'Nigma Galaxy', placement: 6, kills: 4, placementPoints: 5, killPoints: 4, totalPoints: 9 },
        { rank: 7, teamName: 'TSM FTX', placement: 7, kills: 3, placementPoints: 4, killPoints: 3, totalPoints: 7 },
        { rank: 8, teamName: 'Team Chaos', placement: 8, kills: 2, placementPoints: 3, killPoints: 2, totalPoints: 5 },
        { rank: 9, teamName: 'Chemin Esports', placement: 9, kills: 2, placementPoints: 2, killPoints: 2, totalPoints: 4 },
        { rank: 10, teamName: 'Enigma Gaming', placement: 10, kills: 1, placementPoints: 1, killPoints: 1, totalPoints: 2 },
        { rank: 11, teamName: 'Revenant Esports', placement: 11, kills: 1, placementPoints: 0, killPoints: 1, totalPoints: 1 },
        { rank: 12, teamName: 'Hyderabad Hydras', placement: 12, kills: 0, placementPoints: 0, killPoints: 0, totalPoints: 0 },
      ];
    }
  }

  // Export singleton
  window.TemplateEditor = new TemplateEditor();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = window.TemplateEditor;
  }
})(typeof window !== 'undefined' ? window : global);
