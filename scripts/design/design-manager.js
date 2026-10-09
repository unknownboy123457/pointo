/* ====================================================================
   LRD PointCalc — Design Manager Controller
   ====================================================================
   PURPOSE:
   Main controller for the redesigned "Point Table Designs" section.
   Manages the horizontal carousel, search filtering, category filters,
   Color / Background / More actions, real tournament data binding via
   ScoringEngine, and high-resolution export & share.
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

  class DesignManager {
    constructor() {
      this.currentCategory = 'all'; // 'all' | 'free' | 'premium' | 'custom'
      this.searchQuery = '';
      this.currentUser = null;
      this.activeTournamentId = null;
      this.activeTournament = null;
      this.activeMatchId = null; // null = overall standings, string = match id
      this.selectedTemplate = null;
      this.carousel = null;

      // DOM elements
      this.dom = {};
    }

    /**
     * Initialize DOM references and bind event listeners
     */
    init(user) {
      this.currentUser = user || null;

      this.dom = {
        screen: document.getElementById('screen-design'),
        btnBack: document.getElementById('design-btn-back'),
        btnInfo: document.getElementById('design-btn-info'),
        infoDrawer: document.getElementById('design-info-drawer'),
        infoClose: document.getElementById('design-info-close'),

        // Search & Top Actions
        searchInput: document.getElementById('design-search-input'),
        searchClear: document.getElementById('design-search-clear'),
        btnColor: document.getElementById('design-btn-color'),
        btnBackground: document.getElementById('design-btn-background'),
        btnMore: document.getElementById('design-btn-more'),

        // Category Pills
        catPills: document.querySelectorAll('.design-cat-pill'),

        // Carousel Container
        carouselContainer: document.getElementById('design-carousel-container'),

        // Standings & Match Controls
        btnOverallStandings: document.getElementById('btn-overall-standings'),
        matchesBar: document.getElementById('design-matches-bar'),

        // Bottom Action Bar
        btnDownload: document.getElementById('btn-design-download'),
        btnShare: document.getElementById('btn-design-share'),

        // Import Actions
        fileInput: document.getElementById('design-file-input'),
        btnImportAction: document.getElementById('btn-import-design-action'),

        // Action Modals & Sheets
        colorModal: document.getElementById('modal-design-color'),
        colorClose: document.getElementById('modal-color-close'),
        colorPaletteGrid: document.getElementById('color-palette-presets'),

        bgModal: document.getElementById('modal-design-background'),
        bgClose: document.getElementById('modal-bg-close'),

        moreModal: document.getElementById('modal-design-more'),
        moreClose: document.getElementById('modal-more-close'),

        // Premium Unlock Modal
        premiumModal: document.getElementById('modal-premium-unlock'),
        btnPremiumUnlockClose: document.getElementById('btn-premium-close'),
        premCurrentStatusVal: document.getElementById('prem-current-status-val'),
        btnToggleEntitlement: document.getElementById('btn-toggle-entitlement'),

        // Dedicated Studio Landing Sections
        sectionsContainer: document.getElementById('studio-sections-container'),
        sectionFree: document.getElementById('studio-section-free'),
        gridFree: document.getElementById('studio-grid-free'),
        sectionPremium: document.getElementById('studio-section-premium'),
        gridPremium: document.getElementById('studio-grid-premium'),
        btnPremInfo: document.getElementById('studio-btn-prem-info'),
        sectionImport: document.getElementById('studio-section-import'),
        dropzone: document.getElementById('studio-import-dropzone'),
        btnBrowseFile: document.getElementById('btn-studio-browse-file'),
        gridCustom: document.getElementById('studio-grid-custom'),
        customCountBadge: document.getElementById('studio-custom-count-badge'),

        // Import Confirmation Dialog
        importModal: document.getElementById('modal-import-confirm'),
        importConfirmTitle: document.getElementById('import-confirm-title'),
        importTypeBadge: document.getElementById('import-type-badge'),
        importPreviewThumbnail: document.getElementById('import-preview-thumbnail'),
        importMetaFilename: document.getElementById('import-meta-filename'),
        importMetaFormat: document.getElementById('import-meta-format'),
        importMetaDimensions: document.getElementById('import-meta-dimensions'),
        importMetaSize: document.getElementById('import-meta-size'),
        importImageWarning: document.getElementById('import-image-warning'),
        importLayoutSelectGroup: document.getElementById('import-layout-select-group'),
        importInitialLayout: document.getElementById('import-initial-layout'),
        importBtnConfirm: document.getElementById('import-btn-confirm'),
        importBtnCancel: document.getElementById('import-btn-cancel'),

        // Preview Modal
        pvModal: document.getElementById('modal-template-preview'),
        pvClose: document.getElementById('pv-btn-close'),
        pvCanvasWrap: document.getElementById('pv-canvas-wrap'),
        pvBtnEdit: document.getElementById('pv-btn-edit-design'),
        pvBtnDownloadPng: document.getElementById('pv-btn-download-png'),
      };

      this.pendingImport = null;
      this.bindEvents();

      // Initialize Carousel instance
      if (this.dom.carouselContainer && window.DesignCarousel) {
        this.carousel = new window.DesignCarousel(this.dom.carouselContainer, {
          currentUser: this.currentUser,
          dataContext: this.buildDataContext(),
          onSelect: (tmpl) => this.handleTemplateSelected(tmpl),
          onUse: (tmpl) => this.handleUseTemplate(tmpl),
          onCustomize: (tmpl) => this.handleCustomizeTemplate(tmpl),
          onUnlock: (tmpl) => this.openPremiumModal(tmpl),
        });
      }

      if (this.dom.screen?.classList.contains('active')) {
        this.render();
      }
    }

    /**
     * Set current user session
     */
    setUser(user) {
      this.currentUser = user;
      if (this.carousel) {
        this.carousel.currentUser = user;
      }
      if (this.dom.screen?.classList.contains('active')) {
        this.render();
      }
    }

    /**
     * Set active tournament context (e.g. when opened from Tournament Action Dashboard)
     */
    setActiveTournament(tournamentId) {
      this.activeTournamentId = tournamentId;
      this.activeMatchId = null; // reset to overall standings
      this.loadActiveTournament();
      if (this.dom.screen?.classList.contains('active')) {
        this.render();
      }
    }

    /**
     * Load tournament from local database
     */
    loadActiveTournament() {
      if (this.activeTournamentId && this.currentUser?.id && window.LocalDatabaseService) {
        this.activeTournament = window.LocalDatabaseService.getTournamentById(this.activeTournamentId, this.currentUser.id);
      } else {
        this.activeTournament = null;
      }
    }

    /**
     * Bind all interactive events
     */
    bindEvents() {
      // Back button
      this.dom.btnBack?.addEventListener('click', () => {
        if (this.activeTournamentId) {
          window.openTournamentDashboard?.(this.activeTournamentId);
        } else {
          window.navigateTo?.('home');
        }
      });

      // Info button & drawer
      this.dom.btnInfo?.addEventListener('click', () => {
        this.dom.infoDrawer?.classList.toggle('open');
      });
      this.dom.infoClose?.addEventListener('click', () => {
        this.dom.infoDrawer?.classList.remove('open');
      });

      // Search input with instant filtering
      this.dom.searchInput?.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.trim();
        if (this.dom.searchClear) {
          this.dom.searchClear.style.display = this.searchQuery ? 'flex' : 'none';
        }
        this.refreshCarousel();
      });

      this.dom.searchClear?.addEventListener('click', () => {
        if (this.dom.searchInput) this.dom.searchInput.value = '';
        this.searchQuery = '';
        if (this.dom.searchClear) this.dom.searchClear.style.display = 'none';
        this.refreshCarousel();
        this.renderStudioSections();
      });

      // Category filter pills
      this.dom.catPills?.forEach((pill) => {
        pill.addEventListener('click', () => {
          this.dom.catPills.forEach((p) => p.classList.remove('active'));
          pill.classList.add('active');
          this.currentCategory = pill.dataset.category || 'all';
          this.refreshCarousel();
          this.renderStudioSections();
        });
      });

      // Top Filter Action Buttons (Color, Background, More)
      this.dom.btnColor?.addEventListener('click', () => this.openColorModal());
      this.dom.btnBackground?.addEventListener('click', () => this.openBackgroundModal());
      this.dom.btnMore?.addEventListener('click', () => this.openMoreModal());

      // Color modal events
      this.dom.colorClose?.addEventListener('click', () => this.closeColorModal());
      this.dom.colorModal?.addEventListener('click', (e) => {
        if (e.target === this.dom.colorModal) this.closeColorModal();
      });

      // Background modal events
      this.dom.bgClose?.addEventListener('click', () => this.closeBackgroundModal());
      this.dom.bgModal?.addEventListener('click', (e) => {
        if (e.target === this.dom.bgModal) this.closeBackgroundModal();
      });

      // More modal events
      this.dom.moreClose?.addEventListener('click', () => this.closeMoreModal());
      this.dom.moreModal?.addEventListener('click', (e) => {
        if (e.target === this.dom.moreModal) this.closeMoreModal();
      });

      // Overall Standings button
      this.dom.btnOverallStandings?.addEventListener('click', () => {
        this.activeMatchId = null;
        this.updateStandingsButtons();
        this.updateDataContextOnCarousel();
        this.renderStudioSections();
      });

      // Bottom Download & Share
      this.dom.btnDownload?.addEventListener('click', () => this.downloadSelectedDesign());
      this.dom.btnShare?.addEventListener('click', () => this.shareSelectedDesign());

      // Import File input & button
      this.dom.btnImportAction?.addEventListener('click', () => {
        this.dom.fileInput?.click();
      });
      this.dom.btnBrowseFile?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.dom.fileInput?.click();
      });
      this.dom.dropzone?.addEventListener('click', () => {
        this.dom.fileInput?.click();
      });

      // Dropzone drag-and-drop
      this.dom.dropzone?.addEventListener('dragover', (e) => {
        e.preventDefault();
        this.dom.dropzone.classList.add('dragover');
      });
      this.dom.dropzone?.addEventListener('dragleave', () => {
        this.dom.dropzone.classList.remove('dragover');
      });
      this.dom.dropzone?.addEventListener('drop', (e) => {
        e.preventDefault();
        this.dom.dropzone.classList.remove('dragover');
        const file = e.dataTransfer?.files?.[0];
        if (file) this.handleSelectedFile(file);
      });

      this.dom.fileInput?.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (file) this.handleSelectedFile(file);
      });

      // Import Confirmation Modal Actions
      this.dom.importBtnCancel?.addEventListener('click', () => this.closeImportModal());
      this.dom.importBtnConfirm?.addEventListener('click', () => this.confirmImport());
      this.dom.importModal?.addEventListener('click', (e) => {
        if (e.target === this.dom.importModal) this.closeImportModal();
      });

      // Premium info link & modal
      this.dom.btnPremInfo?.addEventListener('click', () => this.openPremiumModal());
      this.dom.btnPremiumUnlockClose?.addEventListener('click', () => {
        this.dom.premiumModal?.classList.remove('open');
      });
      this.dom.premiumModal?.addEventListener('click', (e) => {
        if (e.target === this.dom.premiumModal) {
          this.dom.premiumModal?.classList.remove('open');
        }
      });

      // Entitlement toggle button
      this.dom.btnToggleEntitlement?.addEventListener('click', () => {
        const status = window.TemplateStore?.getEntitlementStatus(this.currentUser);
        const nextActive = !status.active;
        window.TemplateStore?.setEntitlementOverride(nextActive);
        this.updateEntitlementUI();
        this.refreshCarousel();
        this.renderStudioSections();
        window.showToast?.(nextActive ? 'Pro Organizer Entitlement Activated!' : 'Reverted to Free Tier');
      });

      // Preview Modal events
      this.dom.pvClose?.addEventListener('click', () => {
        if (this.dom.pvModal) this.dom.pvModal.style.display = 'none';
      });
      this.dom.pvModal?.addEventListener('click', (e) => {
        if (e.target === this.dom.pvModal) {
          this.dom.pvModal.style.display = 'none';
        }
      });
      this.dom.pvBtnEdit?.addEventListener('click', () => {
        if (this.dom.pvModal) this.dom.pvModal.style.display = 'none';
        if (this.selectedTemplate) this.handleCustomizeTemplate(this.selectedTemplate);
      });
      this.dom.pvBtnDownloadPng?.addEventListener('click', () => {
        this.downloadSelectedDesign();
      });
    }

    /**
     * Render the entire screen state
     */
    render() {
      this.loadActiveTournament();
      this.renderMatchesBar();
      this.refreshCarousel();
      this.renderStudioSections();
      this.updateStandingsButtons();
      this.updateEntitlementUI();
    }

    /**
     * Compatibility alias called by app navigation
     */
    renderCurrentTab() {
      this.render();
    }

    /**
     * Update Entitlement UI status displays
     */
    updateEntitlementUI() {
      if (!window.TemplateStore) return;
      const status = window.TemplateStore.getEntitlementStatus(this.currentUser);
      if (this.dom.premCurrentStatusVal) {
        this.dom.premCurrentStatusVal.textContent = status.label;
        this.dom.premCurrentStatusVal.style.color = status.active ? 'var(--gold-300)' : '#94a3b8';
      }
      if (this.dom.btnToggleEntitlement) {
        this.dom.btnToggleEntitlement.textContent = status.active ? 'Disable Pro Entitlement (Revert to Free)' : 'Activate Pro Entitlement (Organizer Mode)';
      }
      const modeHeaderEntitlement = document.getElementById('mode-header-entitlement');
      const modeEntitlementLabel = document.getElementById('mode-entitlement-label');
      if (modeEntitlementLabel) {
        modeEntitlementLabel.textContent = status.active ? 'PRO ⚡' : 'FREE';
      }
      if (modeHeaderEntitlement) {
        modeHeaderEntitlement.classList.toggle('pro', status.active);
      }
    }

    /**
     * Render the three dedicated Studio Landing sections: Free, Premium, Import
     */
    renderStudioSections() {
      if (!this.dom.sectionsContainer || !window.TemplateStore) return;

      const cat = this.currentCategory || 'all';

      // 1. Control section visibility based on selected tab pill
      if (this.dom.sectionFree) {
        this.dom.sectionFree.style.display = (cat === 'all' || cat === 'free') ? 'flex' : 'none';
      }
      if (this.dom.sectionPremium) {
        this.dom.sectionPremium.style.display = (cat === 'all' || cat === 'premium') ? 'flex' : 'none';
      }
      if (this.dom.sectionImport) {
        this.dom.sectionImport.style.display = (cat === 'all' || cat === 'custom') ? 'flex' : 'none';
      }

      const dataContext = this.buildDataContext();

      // 2. Render FREE Templates Grid
      if (this.dom.gridFree && (cat === 'all' || cat === 'free')) {
        this.dom.gridFree.innerHTML = '';
        const freeTemplates = window.TemplateStore.searchTemplates(this.searchQuery, 'free', this.currentUser?.id);

        if (freeTemplates.length === 0) {
          this.dom.gridFree.innerHTML = '<div style="color:var(--text-muted); font-size:13px; padding:16px;">No free templates match your search.</div>';
        } else {
          freeTemplates.forEach((tmpl) => {
            const card = this.createStudioCardElement(tmpl, dataContext, false);
            this.dom.gridFree.appendChild(card);
          });
        }
      }

      // 3. Render PREMIUM Templates Grid
      if (this.dom.gridPremium && (cat === 'all' || cat === 'premium')) {
        this.dom.gridPremium.innerHTML = '';
        const premTemplates = window.TemplateStore.searchTemplates(this.searchQuery, 'premium', this.currentUser?.id);

        if (premTemplates.length === 0) {
          this.dom.gridPremium.innerHTML = '<div style="color:var(--text-muted); font-size:13px; padding:16px;">No premium templates match your search.</div>';
        } else {
          premTemplates.forEach((tmpl) => {
            const isAllowed = window.TemplateStore.isPremiumTemplateAllowed(tmpl.id, this.currentUser);
            const card = this.createStudioCardElement(tmpl, dataContext, !isAllowed);
            this.dom.gridPremium.appendChild(card);
          });
        }
      }

      // 4. Render CUSTOM / IMPORTED Templates Grid
      if (this.dom.gridCustom && (cat === 'all' || cat === 'custom')) {
        this.dom.gridCustom.innerHTML = '';
        const customTemplates = window.TemplateStore.getCustomTemplates(this.currentUser?.id);

        if (this.dom.customCountBadge) {
          this.dom.customCountBadge.textContent = `${customTemplates.length} Theme${customTemplates.length === 1 ? '' : 's'}`;
        }

        if (customTemplates.length === 0) {
          this.dom.gridCustom.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 24px 16px; background: rgba(255,255,255,0.02); border-radius: 12px; border: 1px dashed rgba(255,255,255,0.08); color: var(--text-muted); font-size: 12.5px;">
              No custom themes yet. Use the upload zone above to import a .lrdtheme file or background image!
            </div>
          `;
        } else {
          customTemplates.forEach((tmpl) => {
            const card = this.createStudioCardElement(tmpl, dataContext, false, true);
            this.dom.gridCustom.appendChild(card);
          });
        }
      }
    }

    /**
     * Create interactive studio template card DOM element
     */
    createStudioCardElement(tmpl, dataContext, isLocked = false, isCustom = false) {
      const card = document.createElement('div');
      card.className = `studio-card ${isLocked ? 'locked' : ''}`;

      const layouts = tmpl.supportedLayouts || ['12 Teams', 'Overall Standings', 'Match Results'];
      const aspectRatio = tmpl.aspectRatio || '4:5 (1080×1350)';

      const statusBadgeHtml = isCustom
        ? '<span class="studio-card__status-badge studio-badge-custom">CUSTOM</span>'
        : (tmpl.accessType === 'premium'
          ? '<span class="studio-card__status-badge studio-badge-prem">PRO 🔒</span>'
          : '<span class="studio-card__status-badge studio-badge-free">FREE</span>');

      const lockOverlayHtml = isLocked
        ? `
          <div class="studio-card__lock-overlay">
            <div class="studio-card__lock-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
            </div>
            <span class="studio-card__lock-label">PREMIUM ONLY</span>
          </div>
        `
        : '';

      const actionBtnLabel = isLocked ? 'Unlock / Info' : 'Edit in Studio';
      const actionBtnClass = isLocked ? 'studio-btn-card-action unlock-action' : 'studio-btn-card-action';

      card.innerHTML = `
        <div class="studio-card__thumb-frame">
          <div class="studio-card__thumb-canvas"></div>
          <span class="studio-card__aspect-badge">${escapeHtml(aspectRatio)}</span>
          ${statusBadgeHtml}
          ${lockOverlayHtml}
        </div>
        <div class="studio-card__body">
          <h3 class="studio-card__title">${escapeHtml(tmpl.name)}</h3>
          <p class="studio-card__desc">${escapeHtml(tmpl.description || 'Esports tournament point table template.')}</p>
          <div class="studio-card__layouts-row">
            ${layouts.map((l) => `<span class="studio-layout-chip">${escapeHtml(l)}</span>`).join('')}
          </div>
        </div>
        <div class="studio-card__footer">
          <button type="button" class="studio-btn-card-preview">Preview</button>
          <button type="button" class="${actionBtnClass}">${actionBtnLabel}</button>
        </div>
      `;

      // Render miniature canvas preview inside the card
      const thumbCanvas = card.querySelector('.studio-card__thumb-canvas');
      if (thumbCanvas && window.TemplateRenderer) {
        window.TemplateRenderer.renderToDOM(tmpl, dataContext, thumbCanvas, { isThumbnail: true });
      }

      // Card event handlers
      const btnPreview = card.querySelector('.studio-btn-card-preview');
      const btnAction = card.querySelector('.studio-btn-card-action');

      btnPreview?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectedTemplate = tmpl;
        this.openPreviewModal(tmpl);
      });

      btnAction?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectedTemplate = tmpl;
        if (isLocked) {
          this.openPremiumModal(tmpl);
        } else {
          this.handleCustomizeTemplate(tmpl);
        }
      });

      card.addEventListener('click', () => {
        this.selectedTemplate = tmpl;
        if (this.carousel) {
          this.carousel.selectTemplate(tmpl.id);
        }
      });

      return card;
    }

    /**
     * Open rich template preview modal
     */
    openPreviewModal(tmpl) {
      if (!tmpl) tmpl = this.selectedTemplate;
      if (!tmpl) return;

      const modal = this.dom.pvModal;
      if (!modal) return;

      const tournSelect = document.getElementById('pv-tourn-select');
      if (tournSelect && window.LocalDatabaseService && this.currentUser?.id) {
        const tourns = window.LocalDatabaseService.getTournaments(this.currentUser.id);
        if (tourns && tourns.length > 0) {
          tournSelect.innerHTML = tourns.map((t) => `<option value="${t.id}" ${t.id === this.activeTournamentId ? 'selected' : ''}>${escapeHtml(t.name)}</option>`).join('');
        }
      }

      const wrap = this.dom.pvCanvasWrap;
      if (wrap && window.TemplateRenderer) {
        wrap.innerHTML = '';
        window.TemplateRenderer.renderToDOM(tmpl, this.buildDataContext(), wrap);
      }

      modal.style.display = 'flex';
    }

    /**
     * Filter and refresh the design carousel
     */
    refreshCarousel() {
      if (!window.TemplateStore) return;

      const templates = window.TemplateStore.searchTemplates(
        this.searchQuery,
        this.currentCategory,
        this.currentUser?.id
      );

      const currentSelectedId = this.selectedTemplate?.id || null;

      if (this.carousel) {
        this.carousel.setDataContext(this.buildDataContext());
        this.carousel.setTemplates(templates, currentSelectedId);
      }
    }

    /**
     * Render matches bar below the carousel if tournament has matches
     */
    renderMatchesBar() {
      if (!this.dom.matchesBar) return;
      this.dom.matchesBar.innerHTML = '';

      if (!this.activeTournamentId || !this.currentUser?.id || !window.LocalDatabaseService) {
        this.dom.matchesBar.style.display = 'none';
        return;
      }

      const matches = window.LocalDatabaseService.getMatches(this.activeTournamentId);
      if (!matches || matches.length === 0) {
        this.dom.matchesBar.style.display = 'none';
        return;
      }

      this.dom.matchesBar.style.display = 'flex';

      matches.forEach((m) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `match-chip-btn ${this.activeMatchId === m.id ? 'active' : ''}`;
        btn.textContent = `Match ${m.match_number}`;
        btn.dataset.matchId = m.id;

        btn.addEventListener('click', () => {
          this.activeMatchId = m.id;
          this.updateStandingsButtons();
          this.updateDataContextOnCarousel();
        });

        this.dom.matchesBar.appendChild(btn);
      });
    }

    /**
     * Update active state on standings buttons
     */
    updateStandingsButtons() {
      const isOverall = this.activeMatchId === null;
      if (this.dom.btnOverallStandings) {
        this.dom.btnOverallStandings.classList.toggle('active', isOverall);
      }

      const matchChips = this.dom.matchesBar?.querySelectorAll('.match-chip-btn') || [];
      matchChips.forEach((chip) => {
        chip.classList.toggle('active', chip.dataset.matchId === this.activeMatchId);
      });
    }

    /**
     * Update carousel preview with new data context
     */
    updateDataContextOnCarousel() {
      if (this.carousel) {
        this.carousel.setDataContext(this.buildDataContext());
      }
    }

    /**
     * Build the context for dynamic variable resolution & point table rendering
     */
    buildDataContext() {
      let tournament = this.activeTournament;
      if (!tournament && this.currentUser?.id && window.LocalDatabaseService) {
        const userTourns = window.LocalDatabaseService.getTournaments(this.currentUser.id);
        if (userTourns && userTourns.length > 0) {
          tournament = userTourns[0];
          this.activeTournament = tournament;
          this.activeTournamentId = tournament.id;
        }
      }

      let leaderboard = [];
      let match = null;
      const isOverall = this.activeMatchId === null;

      if (tournament && this.currentUser?.id && window.LocalDatabaseService) {
        if (isOverall) {
          leaderboard = window.LocalDatabaseService.getLeaderboard(tournament.id, null);
        } else {
          match = window.LocalDatabaseService.getMatchById(this.activeMatchId);
          leaderboard = window.LocalDatabaseService.getLeaderboard(tournament.id, this.activeMatchId);
        }
      } else {
        // Fallback sample tournament data for vibrant preview
        tournament = {
          id: 'mock_tourn_preview',
          name: 'LRD THUNDER STRIKE CUP',
          game_mode: 'squad',
          scoring_system: 'default',
        };
        leaderboard = this.getMockLeaderboard(12);
        match = { match_number: 1 };
      }

      return {
        tournament: {
          id: tournament.id,
          name: tournament.name || 'LRD ESPORTS CUP',
          gameMode: tournament.game_mode || 'squad',
          matchNumber: isOverall ? 'OVERALL STANDINGS' : `MATCH 0${match?.match_number || 1}`,
          organizer: tournament.organizer || 'LRD Esports',
          youtube: tournament.youtube || 'LRD ESPORTS',
          instagram: tournament.instagram || '@LRDESPORTS',
          whatsapp: tournament.whatsapp || '+91 98765 43210',
          website: tournament.website || 'lrdesports.com',
          header: isOverall ? 'OVERALL LEADERBOARD' : `MATCH ${match?.match_number || 1} RESULTS`,
          footer: 'OFFICIAL FREE FIRE POINT SYSTEM — 12-9-8-7-6-5-4-3-2-1-0-0',
        },
        match: match || {},
        leaderboard: leaderboard && leaderboard.length > 0 ? leaderboard : this.getMockLeaderboard(12),
        mode: isOverall ? 'overall' : 'match',
      };
    }

    /**
     * Mock sample Free Fire esports leaderboard
     */
    getMockLeaderboard(count = 12) {
      const sampleNames = [
        'Total Gaming', 'Orangutan Elite', 'GodLike Esports', 'Team Elite',
        'Blind Esports', 'Nigma Galaxy', 'TSM FTX', 'Team Chaos',
        'Chemin Esports', 'Enigma Gaming', 'Revenant Esports', 'Hyderabad Hydras',
      ];

      const placements = [12, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 0];
      const kills = [14, 9, 11, 7, 8, 5, 4, 6, 3, 2, 1, 0];

      const list = [];
      for (let i = 0; i < count; i++) {
        const placePts = placements[i] !== undefined ? placements[i] : 0;
        const killPts = kills[i] !== undefined ? kills[i] : 0;
        list.push({
          rank: i + 1,
          teamName: sampleNames[i] || `Team ${i + 1}`,
          matchesPlayed: 3,
          position: i + 1,
          kills: killPts,
          booyahs: i === 0 ? 2 : (i === 1 ? 1 : 0),
          placementPoints: placePts,
          killPoints: killPts,
          totalPoints: placePts + killPts,
        });
      }
      return list;
    }

    /**
     * Card selection handler from carousel
     */
    handleTemplateSelected(tmpl) {
      this.selectedTemplate = tmpl;
    }

    /**
     * "Use Design" action
     */
    handleUseTemplate(tmpl) {
      const isAllowed = window.TemplateStore?.isPremiumTemplateAllowed(tmpl.id, this.currentUser);
      if (!isAllowed) {
        this.openPremiumModal(tmpl);
        return;
      }
      this.selectedTemplate = tmpl;
      this.downloadSelectedDesign();
    }

    /**
     * "Customize" action: opens Canva-style template editor
     */
    handleCustomizeTemplate(tmpl) {
      const isAllowed = window.TemplateStore?.isPremiumTemplateAllowed(tmpl.id, this.currentUser);
      if (!isAllowed) {
        this.openPremiumModal(tmpl);
        return;
      }

      if (!window.TemplateEditor) {
        window.showToast?.('Template editor not loaded.');
        return;
      }

      // If built-in template, duplicate it as custom template first so user edits their own copy
      let templateToEdit = tmpl;
      if (tmpl.category !== 'custom' && this.currentUser?.id && window.TemplateStore) {
        templateToEdit = window.TemplateStore.duplicateTemplate(this.currentUser.id, tmpl.id) || tmpl;
      }

      const dataContext = this.buildDataContext();
      window.TemplateEditor.open(templateToEdit, this.currentUser?.id, dataContext);
    }

    /**
     * Open Premium Unlock Modal
     */
    openPremiumModal(tmpl) {
      if (this.dom.premiumModal) {
        const titleEl = document.getElementById('prem-modal-title');
        if (titleEl) {
          titleEl.textContent = tmpl?.name ? `Unlock ${tmpl.name}` : 'Premium Esports Design';
        }
        this.updateEntitlementUI();
        this.dom.premiumModal.classList.add('open');
      }
    }

    // ================================================================
    // COLOR CUSTOMIZATION ACTION (🎨 Color)
    // ================================================================

    openColorModal() {
      if (!this.selectedTemplate) {
        window.showToast?.('Select a template first.');
        return;
      }

      const modal = this.dom.colorModal;
      if (!modal) return;

      const colors = this.selectedTemplate.colors || {
        primary: '#d4af37',
        secondary: '#ff4444',
        text: '#ffffff',
        accent: '#ffd700',
        background: '#0d0f18',
      };

      // Populate color inputs
      const inpPrimary = document.getElementById('color-inp-primary');
      const inpSecondary = document.getElementById('color-inp-secondary');
      const inpText = document.getElementById('color-inp-text');
      const inpAccent = document.getElementById('color-inp-accent');
      const inpBg = document.getElementById('color-inp-bg');

      if (inpPrimary) inpPrimary.value = colors.primary || '#d4af37';
      if (inpSecondary) inpSecondary.value = colors.secondary || '#ff4444';
      if (inpText) inpText.value = colors.text || '#ffffff';
      if (inpAccent) inpAccent.value = colors.accent || '#ffd700';
      if (inpBg) inpBg.value = colors.background || '#0d0f18';

      // Custom color apply button
      const applyBtn = document.getElementById('btn-apply-custom-colors');
      if (applyBtn) {
        applyBtn.onclick = () => {
          this.applyColors({
            primary: inpPrimary?.value || '#d4af37',
            secondary: inpSecondary?.value || '#ff4444',
            text: inpText?.value || '#ffffff',
            accent: inpAccent?.value || '#ffd700',
            background: inpBg?.value || '#0d0f18',
          });
        };
      }

      // Presets
      this.renderColorPresets();

      modal.classList.add('open');
    }

    closeColorModal() {
      this.dom.colorModal?.classList.remove('open');
    }

    renderColorPresets() {
      const container = this.dom.colorPaletteGrid;
      if (!container) return;

      const presets = [
        { name: 'LRD Gold', primary: '#d4af37', text: '#ffffff', accent: '#ffd700', bg: '#0d0f18' },
        { name: 'Cyber Neon', primary: '#00e5ff', text: '#ffffff', accent: '#a855f7', bg: '#050608' },
        { name: 'Crimson War', primary: '#ef4444', text: '#ffffff', accent: '#f97316', bg: '#0f0507' },
        { name: 'Emerald Pro', primary: '#10b981', text: '#ffffff', accent: '#34d399', bg: '#030e09' },
        { name: 'Royal Purple', primary: '#c084fc', text: '#ffffff', accent: '#ec4899', bg: '#0d041a' },
      ];

      container.innerHTML = '';
      presets.forEach((p) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'palette-chip-btn';
        btn.innerHTML = `
          <div class="palette-swatches">
            <span style="background:${p.primary}"></span>
            <span style="background:${p.accent}"></span>
            <span style="background:${p.bg}"></span>
          </div>
          <span>${p.name}</span>
        `;

        btn.addEventListener('click', () => {
          this.applyColors({
            primary: p.primary,
            text: p.text,
            accent: p.accent,
            background: p.bg,
          });
        });

        container.appendChild(btn);
      });
    }

    applyColors(colorObj) {
      if (!this.selectedTemplate || !window.TemplateStore) return;

      const updated = window.TemplateStore.applyColorsToTemplate(this.selectedTemplate, colorObj);
      this.selectedTemplate = updated;

      // If custom template, persist update
      if (this.selectedTemplate.category === 'custom' && this.currentUser?.id) {
        window.TemplateStore.updateCustomTemplate(this.currentUser.id, this.selectedTemplate.id, this.selectedTemplate);
      }

      this.refreshCarousel();
      window.showToast?.('Template colors updated');
      this.closeColorModal();
    }

    // ================================================================
    // BACKGROUND CUSTOMIZATION ACTION (🖼 Background)
    // ================================================================

    openBackgroundModal() {
      if (!this.selectedTemplate) {
        window.showToast?.('Select a template first.');
        return;
      }
      const modal = this.dom.bgModal;
      if (!modal) return;

      modal.classList.add('open');

      document.getElementById('bg-opt-default')?.addEventListener('click', () => {
        this.applyBackground({
          type: 'gradient',
          value: 'linear-gradient(135deg, #0d0f18 0%, #171b26 50%, #0d0f18 100%)',
        });
      }, { once: true });

      document.getElementById('bg-opt-solid-dark')?.addEventListener('click', () => {
        this.applyBackground({
          type: 'color',
          value: '#0d0f18',
        });
      }, { once: true });

      document.getElementById('bg-opt-solid-black')?.addEventListener('click', () => {
        this.applyBackground({
          type: 'color',
          value: '#000000',
        });
      }, { once: true });

      document.getElementById('bg-opt-solid-gold')?.addEventListener('click', () => {
        this.applyBackground({
          type: 'gradient',
          value: 'linear-gradient(135deg, #181408 0%, #2a200a 50%, #120e06 100%)',
        });
      }, { once: true });

      const bgFileInput = document.getElementById('bg-file-input');
      const bgUploadBtn = document.getElementById('bg-opt-upload');
      if (bgUploadBtn && bgFileInput) {
        bgUploadBtn.onclick = () => bgFileInput.click();
        bgFileInput.onchange = (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = (loadEvt) => {
            this.applyBackground({
              type: 'image',
              value: loadEvt.target.result,
            });
          };
          reader.readAsDataURL(file);
        };
      }
    }

    closeBackgroundModal() {
      this.dom.bgModal?.classList.remove('open');
    }

    applyBackground(bgConfig) {
      if (!this.selectedTemplate || !window.TemplateStore) return;

      const updated = window.TemplateStore.applyBackgroundToTemplate(this.selectedTemplate, bgConfig);
      this.selectedTemplate = updated;

      if (this.selectedTemplate.category === 'custom' && this.currentUser?.id) {
        window.TemplateStore.updateCustomTemplate(this.currentUser.id, this.selectedTemplate.id, this.selectedTemplate);
      }

      this.refreshCarousel();
      window.showToast?.('Background applied');
      this.closeBackgroundModal();
    }

    // ================================================================
    // MORE ACTIONS (⚙ More)
    // ================================================================

    openMoreModal() {
      if (!this.selectedTemplate) {
        window.showToast?.('Select a template first.');
        return;
      }

      const modal = this.dom.moreModal;
      if (!modal) return;

      const isCustom = this.selectedTemplate.category === 'custom';
      const deleteBtn = document.getElementById('more-action-delete');
      if (deleteBtn) {
        deleteBtn.style.display = isCustom ? 'flex' : 'none';
      }

      modal.classList.add('open');

      // Bind actions safely
      const editBtn = document.getElementById('more-action-edit');
      if (editBtn) {
        editBtn.onclick = () => {
          this.closeMoreModal();
          this.handleCustomizeTemplate(this.selectedTemplate);
        };
      }

      const dupBtn = document.getElementById('more-action-duplicate');
      if (dupBtn) {
        dupBtn.onclick = () => {
          this.closeMoreModal();
          this.duplicateCurrentTemplate();
        };
      }

      const renameBtn = document.getElementById('more-action-rename');
      if (renameBtn) {
        renameBtn.onclick = () => {
          this.closeMoreModal();
          this.renameCurrentTemplate();
        };
      }

      const saveNewBtn = document.getElementById('more-action-save-new');
      if (saveNewBtn) {
        saveNewBtn.onclick = () => {
          this.closeMoreModal();
          this.saveCurrentAsNewTemplate();
        };
      }

      const exportThemeBtn = document.getElementById('more-action-export-theme');
      if (exportThemeBtn) {
        exportThemeBtn.onclick = () => {
          this.closeMoreModal();
          this.exportCurrentTheme();
        };
      }

      if (deleteBtn) {
        deleteBtn.onclick = () => {
          this.closeMoreModal();
          this.deleteCurrentTemplate();
        };
      }
    }

    exportCurrentTheme() {
      if (!this.selectedTemplate) {
        window.showToast?.('Please select a template first.');
        return;
      }
      try {
        const filename = window.TemplateStore?.downloadThemePackage(this.selectedTemplate);
        if (window.showToast) window.showToast(`Exported theme "${filename}"!`);
      } catch (err) {
        console.error('Failed to export theme:', err);
        window.showToast?.('Failed to export theme: ' + (err.message || err));
      }
    }

    closeMoreModal() {
      this.dom.moreModal?.classList.remove('open');
    }

    duplicateCurrentTemplate() {
      if (!this.selectedTemplate || !this.currentUser?.id || !window.TemplateStore) {
        window.showToast?.('Sign in to duplicate templates.');
        return;
      }

      const copy = window.TemplateStore.duplicateTemplate(this.currentUser.id, this.selectedTemplate.id);
      if (copy) {
        window.showToast?.(`Created copy: "${copy.name}"`);
        this.currentCategory = 'custom';
        this.dom.catPills?.forEach((p) => p.classList.toggle('active', p.dataset.category === 'custom'));
        this.selectedTemplate = copy;
        this.refreshCarousel();
      }
    }

    renameCurrentTemplate() {
      if (!this.selectedTemplate) return;
      const newName = prompt('Enter new template name:', this.selectedTemplate.name);
      if (!newName || !newName.trim()) return;

      if (this.selectedTemplate.category === 'custom' && this.currentUser?.id) {
        window.TemplateStore?.renameTemplate(this.currentUser.id, this.selectedTemplate.id, newName.trim());
      }
      this.selectedTemplate.name = newName.trim();
      this.refreshCarousel();
      window.showToast?.('Template renamed');
    }

    saveCurrentAsNewTemplate() {
      if (!this.selectedTemplate || !this.currentUser?.id || !window.TemplateStore) {
        window.showToast?.('Sign in to save custom templates.');
        return;
      }

      const copyData = {
        ...this.selectedTemplate,
        name: `${this.selectedTemplate.name} (Custom)`,
        category: 'custom',
      };
      delete copyData.id;

      const saved = window.TemplateStore.saveCustomTemplate(this.currentUser.id, copyData);
      if (saved) {
        window.showToast?.(`Saved "${saved.name}" to My Custom Designs`);
        this.currentCategory = 'custom';
        this.dom.catPills?.forEach((p) => p.classList.toggle('active', p.dataset.category === 'custom'));
        this.selectedTemplate = saved;
        this.refreshCarousel();
      }
    }

    deleteCurrentTemplate() {
      if (!this.selectedTemplate || this.selectedTemplate.category !== 'custom') return;
      if (!confirm(`Permanently delete custom template "${this.selectedTemplate.name}"?`)) return;

      const deleted = window.TemplateStore?.deleteCustomTemplate(this.currentUser.id, this.selectedTemplate.id);
      if (deleted) {
        window.showToast?.('Template deleted');
        this.selectedTemplate = null;
        this.refreshCarousel();
      }
    }

    // ================================================================
    // IMPORT DESIGN WORKFLOW (Themes, JSON, Background Images)
    // ================================================================

    handleImportImage(file) {
      this.handleSelectedFile(file);
    }

    handleSelectedFile(file) {
      if (!file) return;

      const isThemeFile = file.name.endsWith('.lrdtheme') || file.name.endsWith('.json');
      const isImageFile = file.type.match(/^image\/(png|jpeg|jpg|webp)$/i) || /\.(png|jpe?g|webp)$/i.test(file.name);

      if (!isThemeFile && !isImageFile) {
        window.showToast?.('Please upload a .lrdtheme file, .json theme, or PNG/JPG image.');
        return;
      }

      if (file.size > 15 * 1024 * 1024) {
        window.showToast?.('File exceeds 15MB limit.');
        return;
      }

      const formatBytes = (bytes) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
      };

      if (isThemeFile) {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const rawContent = e.target.result;
            const validation = window.TemplateStore
              ? window.TemplateStore.validateThemePackage(rawContent)
              : { valid: true, theme: JSON.parse(rawContent), metadata: {} };

            if (!validation.valid) {
              window.showToast?.(`Invalid theme: ${validation.errors.join('; ')}`);
              return;
            }

            const parsed = validation.theme;
            const cleanName = parsed.name || file.name.replace(/\.[^/.]+$/, '');
            const w = parsed.canvas?.width || 1080;
            const h = parsed.canvas?.height || 1350;

            this.pendingImport = {
              type: 'theme',
              file,
              data: parsed,
              rawPackage: rawContent,
              name: cleanName,
            };

            if (this.dom.importConfirmTitle) this.dom.importConfirmTitle.textContent = 'Import Theme Package';
            if (this.dom.importTypeBadge) {
              this.dom.importTypeBadge.textContent = 'LRD Theme';
              this.dom.importTypeBadge.style.color = 'var(--gold-300)';
              this.dom.importTypeBadge.style.borderColor = 'var(--gold-300)';
            }
            if (this.dom.importMetaFilename) this.dom.importMetaFilename.textContent = file.name;
            if (this.dom.importMetaFormat) this.dom.importMetaFormat.textContent = 'LRD Theme (' + (validation.metadata?.schemaVersion || 'v1.0.0') + ')';
            if (this.dom.importMetaDimensions) this.dom.importMetaDimensions.textContent = `${w} × ${h} px`;
            if (this.dom.importMetaSize) this.dom.importMetaSize.textContent = formatBytes(file.size);

            if (this.dom.importImageWarning) this.dom.importImageWarning.style.display = 'none';
            if (this.dom.importLayoutSelectGroup) this.dom.importLayoutSelectGroup.style.display = 'none';

            // Miniature preview
            if (this.dom.importPreviewThumbnail) {
              this.dom.importPreviewThumbnail.innerHTML = '';
              if (window.TemplateRenderer) {
                const previewCtx = this.buildDataContext();
                window.TemplateRenderer.renderToDOM(parsed, previewCtx, this.dom.importPreviewThumbnail, { isThumbnail: true });
              }
            }

            if (this.dom.importModal) this.dom.importModal.style.display = 'flex';
          } catch (err) {
            console.error('Failed to parse theme file:', err);
            window.showToast?.('Failed to parse theme file. Ensure it is valid JSON.');
          }
        };
        reader.readAsText(file);
      } else if (isImageFile) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const dataUrl = e.target.result;
          const img = new Image();
          img.onload = () => {
            const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
            const themeName = `${cleanName.charAt(0).toUpperCase() + cleanName.slice(1)} Table`;

            this.pendingImport = {
              type: 'image',
              file,
              dataUrl,
              width: img.naturalWidth || 1080,
              height: img.naturalHeight || 1350,
              name: themeName,
            };

            if (this.dom.importConfirmTitle) this.dom.importConfirmTitle.textContent = 'Import Background Graphic';
            if (this.dom.importTypeBadge) {
              this.dom.importTypeBadge.textContent = 'Background Image';
              this.dom.importTypeBadge.style.color = '#f59e0b';
              this.dom.importTypeBadge.style.borderColor = '#f59e0b';
            }
            if (this.dom.importMetaFilename) this.dom.importMetaFilename.textContent = file.name;
            if (this.dom.importMetaFormat) this.dom.importMetaFormat.textContent = file.type || 'Image Graphic';
            if (this.dom.importMetaDimensions) this.dom.importMetaDimensions.textContent = `${img.naturalWidth} × ${img.naturalHeight} px`;
            if (this.dom.importMetaSize) this.dom.importMetaSize.textContent = formatBytes(file.size);

            if (this.dom.importImageWarning) this.dom.importImageWarning.style.display = 'flex';
            if (this.dom.importLayoutSelectGroup) this.dom.importLayoutSelectGroup.style.display = 'flex';

            if (this.dom.importPreviewThumbnail) {
              this.dom.importPreviewThumbnail.innerHTML = `<img src="${dataUrl}" alt="Preview" style="width:100%; height:100%; object-fit:cover;" />`;
            }

            if (this.dom.importModal) this.dom.importModal.style.display = 'flex';
          };
          img.src = dataUrl;
        };
        reader.readAsDataURL(file);
      }
    }

    confirmImport() {
      if (!this.pendingImport) return;
      if (!this.currentUser?.id || !window.TemplateStore) {
        window.showToast?.('Please sign in to import custom designs.');
        this.closeImportModal();
        return;
      }

      if (this.pendingImport.type === 'theme') {
        try {
          const saved = window.TemplateStore.importThemePackage(this.pendingImport.data, this.currentUser.id);
          if (saved) {
            window.showToast?.(`Imported theme "${saved.name}"!`);
            this.closeImportModal();
            this.currentCategory = 'custom';
            this.dom.catPills?.forEach((p) => p.classList.toggle('active', p.dataset.category === 'custom'));
            this.selectedTemplate = saved;
            this.refreshCarousel();
            this.renderStudioSections();
            if (window.TemplateEditor) {
              window.TemplateEditor.open(saved, this.currentUser.id, this.buildDataContext());
            }
          }
        } catch (err) {
          console.error('Import theme failed:', err);
          window.showToast?.(`Import failed: ${err.message || err}`);
        }
      } else if (this.pendingImport.type === 'image') {
        const chosenLayout = this.dom.importInitialLayout?.value || 'standard';
        let fields = [];

        if (chosenLayout === 'standard') {
          fields = [
            {
              id: `f_lb_${Date.now()}`,
              type: 'leaderboard',
              x: 60,
              y: 280,
              width: 960,
              height: 900,
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
                backgroundColor: 'rgba(212, 175, 55, 0.2)',
                color: '#d4af37',
                fontSize: 18,
                fontWeight: '800',
                borderBottom: '2px solid #d4af37',
              },
              rowStyle: {
                backgroundColor: 'rgba(255, 255, 255, 0.04)',
                alternateColor: 'rgba(255, 255, 255, 0.08)',
                color: '#ffffff',
                fontSize: 22,
                fontWeight: '600',
                top3Gold: true,
              },
            },
          ];
        } else if (chosenLayout === 'minimal') {
          fields = [
            {
              id: `f_lb_${Date.now()}`,
              type: 'leaderboard',
              x: 90,
              y: 320,
              width: 900,
              height: 850,
              rowHeight: 60,
              headerHeight: 44,
              maxRows: 12,
              columns: [
                { key: 'rank', label: '#', width: 90, align: 'center' },
                { key: 'teamName', label: 'TEAM', width: 560, align: 'left' },
                { key: 'totalPoints', label: 'POINTS', width: 250, align: 'center', highlight: true },
              ],
              headerStyle: {
                backgroundColor: 'rgba(0, 0, 0, 0.4)',
                color: '#ffffff',
                fontSize: 18,
                fontWeight: '800',
              },
              rowStyle: {
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                color: '#ffffff',
                fontSize: 20,
                fontWeight: '600',
              },
            },
          ];
        }

        const newTmpl = window.TemplateStore.saveCustomTemplate(this.currentUser.id, {
          name: this.pendingImport.name || 'Custom BG Table',
          description: 'Custom point table created over imported background image',
          canvas: {
            width: this.pendingImport.width || 1080,
            height: this.pendingImport.height || 1350,
          },
          aspectRatio: `${this.pendingImport.width || 1080}×${this.pendingImport.height || 1350}`,
          supportedLayouts: chosenLayout === 'blank' ? ['Custom Elements'] : ['12 Teams', 'Standings'],
          background: {
            type: 'image',
            value: this.pendingImport.dataUrl,
          },
          fields,
        });

        if (newTmpl) {
          window.showToast?.(`Created custom theme "${newTmpl.name}"! Opening editor...`);
          this.closeImportModal();
          this.currentCategory = 'custom';
          this.dom.catPills?.forEach((p) => p.classList.toggle('active', p.dataset.category === 'custom'));
          this.selectedTemplate = newTmpl;
          this.refreshCarousel();
          this.renderStudioSections();
          if (window.TemplateEditor) {
            window.TemplateEditor.open(newTmpl, this.currentUser.id, this.buildDataContext());
          }
        }
      }
    }

    closeImportModal() {
      if (this.dom.importModal) this.dom.importModal.style.display = 'none';
      this.pendingImport = null;
      if (this.dom.fileInput) this.dom.fileInput.value = '';
    }

    createCustomTemplateFromImage(filename, base64Data) {
      this.handleSelectedFile(new File([base64Data], filename, { type: 'image/png' }));
    }

    // ================================================================
    // DOWNLOAD & SHARE
    // ================================================================

    async downloadSelectedDesign() {
      if (!this.selectedTemplate) {
        window.showToast?.('Please select a design first.');
        return;
      }

      const isAllowed = window.TemplateStore?.isPremiumTemplateAllowed(this.selectedTemplate.id, this.currentUser);
      if (!isAllowed) {
        this.openPremiumModal(this.selectedTemplate);
        return;
      }

      if (!window.ExportEngine) {
        window.showToast?.('Export engine not available.');
        return;
      }

      try {
        window.showToast?.('Generating high-res point table...');
        const dataContext = this.buildDataContext();
        const safeName = `${(this.selectedTemplate.name || 'PointTable').replace(/\s+/g, '_')}_${Date.now()}.png`;
        await window.ExportEngine.downloadPNG(this.selectedTemplate, dataContext, safeName);
        window.showToast?.('Downloaded successfully!');
      } catch (err) {
        console.error('Download error:', err);
        window.showToast?.('Failed to download image.');
      }
    }

    async shareSelectedDesign() {
      if (!this.selectedTemplate) {
        window.showToast?.('Please select a design first.');
        return;
      }

      const isAllowed = window.TemplateStore?.isPremiumTemplateAllowed(this.selectedTemplate.id, this.currentUser);
      if (!isAllowed) {
        this.openPremiumModal(this.selectedTemplate);
        return;
      }

      try {
        const dataContext = this.buildDataContext();
        await window.ExportEngine.share(this.selectedTemplate, dataContext);
      } catch (err) {
        console.warn('Share warning:', err);
        window.showToast?.('Sharing point table...');
      }
    }
  }

  window.DesignManager = new DesignManager();
})(typeof window !== 'undefined' ? window : global);
