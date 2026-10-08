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
      };

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
      });

      // Category filter pills
      this.dom.catPills?.forEach((pill) => {
        pill.addEventListener('click', () => {
          this.dom.catPills.forEach((p) => p.classList.remove('active'));
          pill.classList.add('active');
          this.currentCategory = pill.dataset.category || 'all';
          this.refreshCarousel();
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
      });

      // Bottom Download & Share
      this.dom.btnDownload?.addEventListener('click', () => this.downloadSelectedDesign());
      this.dom.btnShare?.addEventListener('click', () => this.shareSelectedDesign());

      // Import File input
      this.dom.btnImportAction?.addEventListener('click', () => {
        this.dom.fileInput?.click();
      });
      this.dom.fileInput?.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (file) this.handleImportImage(file);
      });

      // Premium unlock modal
      this.dom.btnPremiumUnlockClose?.addEventListener('click', () => {
        this.dom.premiumModal?.classList.remove('open');
      });
      this.dom.premiumModal?.addEventListener('click', (e) => {
        if (e.target === this.dom.premiumModal) {
          this.dom.premiumModal?.classList.remove('open');
        }
      });
    }

    /**
     * Render the entire screen state
     */
    render() {
      this.loadActiveTournament();
      this.renderMatchesBar();
      this.refreshCarousel();
      this.updateStandingsButtons();
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
      let leaderboard = [];
      let match = null;
      const isOverall = this.activeMatchId === null;

      if (tournament && this.currentUser?.id && window.LocalDatabaseService) {
        const teams = window.LocalDatabaseService.getTeams(tournament.id);

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
          name: tournament.name || 'LRD ESPORTS CUP',
          gameMode: tournament.game_mode || 'squad',
          matchNumber: isOverall ? 'OVERALL STANDINGS' : `MATCH 0${match?.match_number || 1}`,
          organizer: 'LRD Esports',
          youtube: 'LRD ESPORTS',
          instagram: '@LRDESPORTS',
          whatsapp: '+91 98765 43210',
          website: 'lrdesports.com',
          header: isOverall ? 'OVERALL LEADERBOARD' : `MATCH ${match?.match_number || 1} RESULTS`,
          footer: 'OFFICIAL FREE FIRE POINT SYSTEM — 12-9-8-7-6-5-4-3-2-1-0-0',
        },
        match: match || {},
        leaderboard: leaderboard,
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
        if (titleEl) titleEl.textContent = tmpl.name;
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

      if (deleteBtn) {
        deleteBtn.onclick = () => {
          this.closeMoreModal();
          this.deleteCurrentTemplate();
        };
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
    // IMPORT DESIGN WORKFLOW (+ Import Design)
    // ================================================================

    handleImportImage(file) {
      if (!file) return;

      // Validate image
      if (!file.type.match(/^image\/(png|jpeg|jpg)$/i)) {
        window.showToast?.('Please upload a PNG, JPG, or JPEG file.');
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        window.showToast?.('File exceeds 10MB limit.');
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const base64Data = e.target.result;
        this.createCustomTemplateFromImage(file.name, base64Data);
      };
      reader.readAsDataURL(file);
    }

    createCustomTemplateFromImage(filename, base64Data) {
      if (!this.currentUser?.id || !window.TemplateStore) {
        window.showToast?.('Please sign in to import custom designs.');
        return;
      }

      const cleanName = filename.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
      const templateName = `${cleanName.charAt(0).toUpperCase() + cleanName.slice(1)} Table`;

      const newTmpl = window.TemplateStore.saveCustomTemplate(this.currentUser.id, {
        name: templateName,
        description: 'Custom point table imported from image',
        background: {
          type: 'image',
          value: base64Data,
        },
        fields: [
          // Pre-populate with standard table
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
        ],
      });

      window.showToast?.(`Imported "${newTmpl.name}"! Opening editor...`);

      // Switch to custom tab and open in editor
      this.currentCategory = 'custom';
      this.dom.catPills?.forEach((p) => p.classList.toggle('active', p.dataset.category === 'custom'));
      this.selectedTemplate = newTmpl;
      this.refreshCarousel();

      // Open in Template Editor
      if (window.TemplateEditor) {
        const dataContext = this.buildDataContext();
        window.TemplateEditor.open(newTmpl, this.currentUser.id, dataContext);
      }
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
