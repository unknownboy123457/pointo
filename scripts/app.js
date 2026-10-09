/* ====================================================================
   LRD PointCalc — Main Controller & Application Logic
   ====================================================================
   ARCHITECTURE:
   - Supabase: Authentication & User Identity only.
   - ScoringEngine: Single Source of Truth for Free Fire calculations.
   - LocalDatabaseService: On-Device persistent tournament/match storage.
   - Zero tournament data sent to or stored in Supabase.
   ==================================================================== */

(function () {
  'use strict';

  // ========================================
  // CONSTANTS & PROTECTED ROUTES
  // ========================================
  const APP_NAME = 'LRD PointCalc';
  const APP_VERSION = '1.0.0';

  const PROTECTED_SCREENS = ['home', 'tournaments', 'design', 'tournament-dashboard', 'tournament-detail', 'account', 'ai-scanner'];

  // ========================================
  // APPLICATION STATE
  // ========================================
  let currentUser = {
    id: null,
    email: null,
    displayName: null,
    avatarUrl: null,
    isAuthenticated: false,
  };
  window.currentUser = currentUser;

  let tournaments = [];
  let currentScreen = null;
  let activeTournament = null;
  let activeMatch = null;
  let tournamentToDelete = null;
  let matchToDelete = null;

  // Setup Calculate State
  let setupCalcMultiplier = 1;
  let setupCalcPosMode = 'increment';

  // Tournament Creation State
  let selectedGameMode = 'squad';
  let selectedScoring = 'default';

  // Tournament Edit State
  let editSelectedGameMode = 'squad';
  let editSelectedScoring = 'default';

  // Application Mode State (Tournament vs Design Studio)
  let currentMode = 'tournament'; // 'tournament' | 'studio'
  let lastTournamentScreen = 'home';

  // ========================================
  // DOM REFERENCES
  // ========================================
  const appShellEl = document.getElementById('app');
  const appModeHeader = document.getElementById('app-mode-header');
  const modeBtnTournament = document.getElementById('mode-btn-tournament');
  const modeBtnStudio = document.getElementById('mode-btn-studio');
  const modeHeaderEntitlement = document.getElementById('mode-header-entitlement');
  const modeEntitlementLabel = document.getElementById('mode-entitlement-label');
  const btnAvatarMode = document.getElementById('btn-avatar-mode');
  const modeAvatarLetter = document.getElementById('mode-avatar-letter');

  const splashEl = document.getElementById('screen-splash');
  const loginScreen = document.getElementById('screen-login');
  const bottomNav = document.getElementById('bottom-nav');
  const fabCreate = document.getElementById('fab-create');
  const toastEl = document.getElementById('toast');
  const loginErrorBanner = document.getElementById('login-error');
  const btnGoogleLogin = document.getElementById('btn-google-login');
  const btnGuestLogin = document.getElementById('btn-guest-login');

  // Account Screen
  const accountAvatarContainer = document.getElementById('account-avatar-container');
  const accountAvatarLetter = document.getElementById('account-avatar-letter');
  const accountName = document.getElementById('account-name');
  const accountEmail = document.getElementById('account-email');
  const appVersionEl = document.getElementById('app-version');
  const btnAvatarHome = document.getElementById('btn-avatar-home');

  // Tournament Lists
  const tournamentList = document.getElementById('tournament-list');
  const tournamentsTabList = document.getElementById('tournaments-tab-list');

  // Tournament Action Dashboard Screen
  const btnBackDashboard = document.getElementById('btn-back-dashboard');
  const btnDeleteDashboardTourn = document.getElementById('btn-delete-dashboard-tourn');
  const dashHeroName = document.getElementById('dash-hero-name');
  const dashHeroTeamsCount = document.getElementById('dash-hero-teams-count');
  const dashBadgeMode = document.getElementById('dash-badge-mode');
  const dashBadgeTeams = document.getElementById('dash-badge-teams');
  const dashBadgeScoring = document.getElementById('dash-badge-scoring');
  const btnActionCalculate = document.getElementById('btn-action-calculate');
  const btnActionTables = document.getElementById('btn-action-tables');
  const btnActionWarheads = document.getElementById('btn-action-warheads');
  const btnActionFraggers = document.getElementById('btn-action-fraggers');
  const btnActionPoster = document.getElementById('btn-action-poster');
  const btnActionSlots = document.getElementById('btn-action-slots');
  const btnActionCertificate = document.getElementById('btn-action-certificate');
  const btnActionMatches = document.getElementById('btn-action-matches');
  const btnActionShare = document.getElementById('btn-action-share');
  const btnActionEdit = document.getElementById('btn-action-edit');

  // Tournament Detail Screen (Tables & Matches)
  const btnBackTournament = document.getElementById('btn-back-tournament');
  const tdHeroName = document.getElementById('td-hero-name');
  const tdBadgeMode = document.getElementById('td-badge-mode');
  const tdBadgeTeams = document.getElementById('td-badge-teams');
  const tdBadgeScoring = document.getElementById('td-badge-scoring');
  const tdMatchesCount = document.getElementById('td-matches-count');
  const subtabBtnLeaderboard = document.getElementById('subtab-btn-leaderboard');
  const subtabBtnMatches = document.getElementById('subtab-btn-matches');
  const subtabViewLeaderboard = document.getElementById('subtab-view-leaderboard');
  const subtabViewMatches = document.getElementById('subtab-view-matches');
  const tdLeaderboardBody = document.getElementById('td-leaderboard-body');
  const tdMatchesList = document.getElementById('td-matches-list');
  const btnAddMatch = document.getElementById('btn-add-match');
  const btnDeleteCurrentTournament = document.getElementById('btn-delete-current-tournament');

  // Setup Calculate Modal
  const modalSetupCalculate = document.getElementById('modal-setup-calculate');
  const formSetupCalculate = document.getElementById('form-setup-calculate');
  const calcMatchNumber = document.getElementById('calc-match-number');
  const multSelectorGroup = document.getElementById('mult-selector-group');
  const posToggleGroup = document.getElementById('pos-toggle-group');
  const btnCloseSetupCalc = document.getElementById('btn-close-setup-calc');

  // Match Entry Modal
  const modalMatchEntry = document.getElementById('modal-match-entry');
  const formMatchEntry = document.getElementById('form-match-entry');
  const meTitle = document.getElementById('me-title');
  const meMultiplierBadge = document.getElementById('me-multiplier-badge');
  const meTeamsContainer = document.getElementById('me-teams-container');
  const meErrorBanner = document.getElementById('me-error-banner');
  const btnCloseMatchEntry = document.getElementById('btn-close-match-entry');
  const btnCancelMatchEntry = document.getElementById('btn-cancel-match-entry');

  // Create Tournament Modal
  const modalCreate = document.getElementById('modal-create');
  const formCreate = document.getElementById('form-create-tournament');
  const inputName = document.getElementById('input-tournament-name');
  const inputTeams = document.getElementById('input-team-count');
  const customScoringContainer = document.getElementById('custom-scoring-container');
  const createTeamsContainer = document.getElementById('create-teams-container');
  const createTeamsCountLabel = document.getElementById('create-teams-count-label');
  const createErrorBanner = document.getElementById('create-error-banner');
  const btnCloseCreateModal = document.getElementById('btn-close-create-modal');

  // Edit Tournament Modal
  const modalEditTournament = document.getElementById('modal-edit-tournament');
  const formEditTournament = document.getElementById('form-edit-tournament');
  const editTournamentName = document.getElementById('edit-tournament-name');
  const editSelectGameMode = document.getElementById('edit-select-game-mode');
  const editSelectScoring = document.getElementById('edit-select-scoring');
  const editCustomScoringContainer = document.getElementById('edit-custom-scoring-container');
  const editErrorBanner = document.getElementById('edit-error-banner');
  const btnCloseEditTournament = document.getElementById('btn-close-edit-tournament');

  // Confirmation Modals
  const modalSignout = document.getElementById('modal-signout');
  const btnCancelSignout = document.getElementById('btn-cancel-signout');
  const btnConfirmSignout = document.getElementById('btn-confirm-signout');

  const modalDeleteTourn = document.getElementById('modal-delete-tournament');
  const btnCancelDeleteTourn = document.getElementById('btn-cancel-delete-tournament');
  const btnConfirmDeleteTourn = document.getElementById('btn-confirm-delete-tournament');

  const modalDeleteMatch = document.getElementById('modal-delete-match');
  const btnCancelDeleteMatch = document.getElementById('btn-cancel-delete-match');
  const btnConfirmDeleteMatch = document.getElementById('btn-confirm-delete-match');

  // ========================================
  // ROUTE & ACCESS CONTROL
  // ========================================

  function updateModeHeaderStatus() {
    if (!currentUser) return;
    const ent = window.TemplateStore?.getEntitlementStatus?.(currentUser) || { tier: 'free', label: 'FREE' };
    if (modeEntitlementLabel) {
      modeEntitlementLabel.textContent = ent.tier === 'pro' ? 'PRO ⚡' : 'FREE';
    }
    if (modeHeaderEntitlement) {
      modeHeaderEntitlement.classList.toggle('pro', ent.tier === 'pro');
    }
    if (modeAvatarLetter) {
      const initial = (currentUser.name || currentUser.email || 'O').trim().charAt(0).toUpperCase();
      modeAvatarLetter.textContent = initial || '?';
    }
  }

  function switchMode(targetMode) {
    if (targetMode === currentMode) return;
    if (targetMode === 'studio') {
      if (currentScreen && currentScreen !== 'design') {
        lastTournamentScreen = currentScreen;
      }
      navigateTo('design');
    } else {
      const screenToRestore = (activeTournament && ['tournament-dashboard', 'tournament-detail'].includes(lastTournamentScreen))
        ? lastTournamentScreen
        : (lastTournamentScreen || 'home');
      navigateTo(screenToRestore);
    }
  }

  window.switchMode = switchMode;
  window.getCurrentMode = () => currentMode;

  function navigateTo(screenId) {
    if (PROTECTED_SCREENS.includes(screenId) && !currentUser.isAuthenticated) {
      console.warn(`LRD PointCalc: Access denied to "${screenId}". Redirecting to login.`);
      screenId = 'login';
    }

    const targetScreen = document.getElementById(`screen-${screenId}`);
    if (screenId === currentScreen && targetScreen && targetScreen.classList.contains('active')) {
      return;
    }

    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach((n) => n.classList.remove('active'));

    const targetNav = document.querySelector(`[data-screen="${screenId}"]`);

    if (targetScreen) targetScreen.classList.add('active');
    if (targetNav) targetNav.classList.add('active');

    // UI visibility controls
    if (screenId === 'login' || screenId === 'splash' || screenId === 'ai-scanner') {
      if (appModeHeader) appModeHeader.style.display = 'none';
      if (appShellEl) appShellEl.classList.remove('has-mode-header');
      if (bottomNav) bottomNav.style.display = 'none';
      if (fabCreate) fabCreate.style.display = 'none';
    } else {
      if (appModeHeader) appModeHeader.style.display = 'flex';
      if (appShellEl) appShellEl.classList.add('has-mode-header');
      updateModeHeaderStatus();

      if (screenId === 'tournament-detail' || screenId === 'tournament-dashboard') {
        if (bottomNav) bottomNav.style.display = 'flex';
        if (fabCreate) fabCreate.style.display = 'none';
      } else {
        if (bottomNav) bottomNav.style.display = 'flex';
        if (fabCreate) fabCreate.style.display = screenId === 'home' ? 'flex' : 'none';
      }
    }

    // Mode state synchronization
    if (screenId === 'design') {
      currentMode = 'studio';
      if (appShellEl) {
        appShellEl.classList.add('mode-studio');
        appShellEl.classList.remove('mode-scanner');
      }
      if (modeBtnStudio) modeBtnStudio.classList.add('active');
      if (modeBtnTournament) modeBtnTournament.classList.remove('active');
    } else if (screenId === 'ai-scanner') {
      if (appShellEl) {
        appShellEl.classList.add('mode-scanner');
        appShellEl.classList.remove('mode-studio');
      }
    } else if (['home', 'tournaments', 'tournament-dashboard', 'tournament-detail', 'account'].includes(screenId)) {
      currentMode = 'tournament';
      if (appShellEl) {
        appShellEl.classList.remove('mode-studio');
        appShellEl.classList.remove('mode-scanner');
      }
      if (modeBtnTournament) modeBtnTournament.classList.add('active');
      if (modeBtnStudio) modeBtnStudio.classList.remove('active');
      lastTournamentScreen = screenId;
    }

    const scrollContainer = targetScreen?.querySelector('.screen-scroll');
    if (scrollContainer) scrollContainer.scrollTop = 0;

    if (screenId === 'design' && window.DesignManager) {
      window.DesignManager.setUser(currentUser);
      window.DesignManager.renderCurrentTab();
    }

    currentScreen = screenId;
  }

  // Navigation Items
  document.querySelectorAll('.nav-item').forEach((item) => {
    item.addEventListener('click', () => {
      const screen = item.dataset.screen;
      if (screen) navigateTo(screen);
    });
  });

  // Mode Switcher Controls
  modeBtnTournament?.addEventListener('click', () => switchMode('tournament'));
  modeBtnStudio?.addEventListener('click', () => switchMode('studio'));
  modeHeaderEntitlement?.addEventListener('click', () => {
    if (currentMode !== 'studio') switchMode('studio');
    window.DesignManager?.openPremiumModal?.();
  });
  btnAvatarMode?.addEventListener('click', () => navigateTo('account'));

  btnAvatarHome?.addEventListener('click', () => navigateTo('account'));

  // Header Back Buttons
  btnBackDashboard?.addEventListener('click', () => navigateTo('home'));

  btnBackTournament?.addEventListener('click', () => {
    if (activeTournament) {
      openTournamentDashboard(activeTournament.id);
    } else {
      navigateTo('home');
    }
  });

  // ========================================
  // USER PROFILE RENDERING (Real Google Auth)
  // ========================================

  function renderUserProfile() {
    if (!currentUser.isAuthenticated) return;

    const initial = (currentUser.displayName || currentUser.email || '?').charAt(0).toUpperCase();

    if (btnAvatarHome) {
      if (currentUser.avatarUrl) {
        btnAvatarHome.innerHTML = `<img src="${escapeHtml(currentUser.avatarUrl)}" alt="Avatar" referrerpolicy="no-referrer" />`;
      } else {
        btnAvatarHome.innerHTML = `<span class="avatar-btn__letter">${initial}</span>`;
      }
    }

    if (accountAvatarContainer) {
      if (currentUser.avatarUrl) {
        accountAvatarContainer.innerHTML = `<img src="${escapeHtml(currentUser.avatarUrl)}" alt="Profile" referrerpolicy="no-referrer" />`;
      } else {
        accountAvatarContainer.innerHTML = `<span class="profile-card__letter">${initial}</span>`;
      }
    }

    if (accountName) accountName.textContent = currentUser.displayName || 'Google User';
    if (accountEmail) accountEmail.textContent = currentUser.email || 'No email associated';
  }

  // ========================================
  // TOURNAMENTS LIST & OVERVIEW
  // ========================================

  function loadTournaments() {
    if (!window.LocalDatabaseService || !currentUser.id) {
      tournaments = [];
      renderTournamentsList();
      return;
    }

    tournaments = window.LocalDatabaseService.getTournaments(currentUser.id);
    renderTournamentsList();
  }

  function padNumber(n) {
    return n.toString().padStart(2, '0');
  }

  function getGameModeLabel(mode) {
    const labels = { solo: 'Solo', duo: 'Duo', squad: 'Squad' };
    return labels[mode] || mode;
  }

  function createTournamentCardElement(tournament, index) {
    const card = document.createElement('div');
    card.className = 'tournament-card';
    card.id = `tournament-${tournament.id}`;

    card.innerHTML = `
      <div class="tournament-card__main" data-card-tourn-id="${tournament.id}">
        <div class="tournament-card__badge">${padNumber(index + 1)}</div>
        <div class="tournament-card__info">
          <div class="tournament-card__name">${escapeHtml(tournament.name)}</div>
          <div class="tournament-card__meta">
            <span>Total teams: ${tournament.team_count}</span>
            <span class="tournament-card__meta-dot"></span>
            <span>${getGameModeLabel(tournament.game_mode)}</span>
            <span class="tournament-card__meta-dot"></span>
            <span style="color: var(--gold-300);">${tournament.scoring_system === 'custom' ? 'Custom' : 'Official'}</span>
          </div>
        </div>
      </div>
      <div class="tournament-card__quick-actions">
        <button type="button" class="btn-card-quick btn-card-calc" data-quick-calc="${tournament.id}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z"/><path d="M8 8h8M8 12h8M8 16h4"/></svg>
          <span>Calculate</span>
        </button>
        <button type="button" class="btn-card-quick btn-card-tables" data-quick-tables="${tournament.id}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18"/></svg>
          <span>Tables</span>
        </button>
        <button type="button" class="btn-card-quick btn-card-more" data-quick-more="${tournament.id}" aria-label="More options">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/><circle cx="5" cy="12" r="1.5"/></svg>
        </button>
      </div>
    `;

    // Clicking the card body opens Tournament Action Dashboard
    card.querySelector('.tournament-card__main')?.addEventListener('click', () => {
      openTournamentDashboard(tournament.id);
    });

    // Quick Calculate button
    card.querySelector('[data-quick-calc]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      openSetupCalculate(tournament.id);
    });

    // Quick Tables button
    card.querySelector('[data-quick-tables]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      openTournamentTables(tournament.id);
    });

    // Quick More button
    card.querySelector('[data-quick-more]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      openTournamentDashboard(tournament.id);
    });

    return card;
  }

  function createEmptyState() {
    const container = document.createElement('div');
    container.className = 'empty-state';
    container.innerHTML = `
      <div class="empty-state__icon">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
          <path d="M6 9H4.5a2.5 2.5 0 010-5H6"/><path d="M18 9h1.5a2.5 2.5 0 000-5H18"/>
          <path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 19.24 7 20v2"/>
          <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 19.24 17 20v2"/>
          <path d="M18 2H6v7a6 6 0 0012 0V2z"/>
        </svg>
      </div>
      <p class="empty-state__title">No tournaments yet</p>
      <p class="empty-state__sub">Create your first tournament to get started.</p>
      <button class="empty-state__btn" id="btn-empty-create">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
        <span>Create Tournament</span>
      </button>
    `;
    container.querySelector('#btn-empty-create').addEventListener('click', openWizard);
    return container;
  }

  function renderTournamentsList() {
    const renderInto = (el) => {
      if (!el) return;
      el.innerHTML = '';
      if (tournaments.length === 0) {
        el.appendChild(createEmptyState());
      } else {
        tournaments.forEach((t, i) => {
          el.appendChild(createTournamentCardElement(t, i));
        });
      }
    };

    renderInto(tournamentList);
    renderInto(tournamentsTabList);
  }

  // ========================================
  // TOURNAMENT ACTION DASHBOARD
  // ========================================

  function openTournamentDashboard(tournamentId) {
    if (!window.LocalDatabaseService || !currentUser.id) return;

    activeTournament = window.LocalDatabaseService.getTournamentById(tournamentId, currentUser.id);
    if (!activeTournament) {
      showToast('Tournament not found');
      return;
    }

    // Populate Hero Info
    if (dashHeroName) dashHeroName.textContent = activeTournament.name;
    if (dashHeroTeamsCount) dashHeroTeamsCount.textContent = `Total teams: ${activeTournament.team_count}`;
    if (dashBadgeMode) dashBadgeMode.textContent = getGameModeLabel(activeTournament.game_mode);
    if (dashBadgeTeams) dashBadgeTeams.textContent = `${activeTournament.team_count} Teams`;
    if (dashBadgeScoring) {
      dashBadgeScoring.textContent = activeTournament.scoring_system === 'custom' ? 'Custom Points' : 'Official Scoring';
    }

    navigateTo('tournament-dashboard');
  }

  // Action Dashboard Buttons
  btnActionCalculate?.addEventListener('click', () => {
    if (activeTournament) openSetupCalculate(activeTournament.id);
  });

  btnActionTables?.addEventListener('click', () => {
    if (activeTournament) openTournamentTables(activeTournament.id);
  });

  btnActionMatches?.addEventListener('click', () => {
    if (activeTournament) openTournamentMatches(activeTournament.id);
  });

  btnActionWarheads?.addEventListener('click', () => showToast('Warheads — Coming Soon'));

  // Auto Team Simulator button
  const btnActionSimulator = document.getElementById('btn-action-simulator');
  btnActionSimulator?.addEventListener('click', () => {
    if (window.TeamSimulator && currentUser.id) {
      window.TeamSimulator.open(currentUser.id);
    }
  });

  const btnActionDesign = document.getElementById('btn-action-design');
  btnActionDesign?.addEventListener('click', () => {
    if (activeTournament && window.DesignManager) {
      window.DesignManager.setActiveTournament(activeTournament.id);
      navigateTo('design');
    }
  });
  function resolveOrCreateActiveTournament() {
    if (activeTournament) return activeTournament;
    if (window.LocalDatabaseService && currentUser?.id) {
      const list = window.LocalDatabaseService.getTournaments(currentUser.id);
      if (list && list.length > 0) {
        activeTournament = list[0];
        return activeTournament;
      }
      // Auto-create a default 12-slot tournament so organizer is never blocked
      const created = window.LocalDatabaseService.createTournament(currentUser.id, {
        name: 'Free Fire Cup',
        game_mode: 'squad',
        team_count: 12,
        scoring_system: 'default',
      });
      activeTournament = created;
      if (typeof loadTournaments === 'function') loadTournaments();
      return activeTournament;
    }
    return null;
  }

  btnActionSlots?.addEventListener('click', () => {
    const tourn = resolveOrCreateActiveTournament();
    if (window.AIScanner) {
      window.AIScanner.open({
        tournamentId: tourn ? tourn.id : null,
        ownerUserId: currentUser.id,
        returnScreen: currentScreen || 'tournament-dashboard',
      });
    } else {
      showToast('AI Scanner module initializing...');
    }
  });

  // Launch AI scanner from setup calculate modal
  document.getElementById('btn-open-scanner-from-setup')?.addEventListener('click', () => {
    const matchNum = parseInt(calcMatchNumber?.value, 10) || 1;
    closeSetupCalculate();
    const tourn = resolveOrCreateActiveTournament();
    if (window.AIScanner) {
      window.AIScanner.open({
        tournamentId: tourn ? tourn.id : null,
        matchNumber: matchNum,
        multiplier: setupCalcMultiplier || 1,
        ownerUserId: currentUser.id,
        returnScreen: currentScreen || 'tournament-dashboard',
      });
    }
  });

  // Launch AI scanner from match entry modal
  document.getElementById('btn-open-scanner-from-me')?.addEventListener('click', () => {
    closeMatchEntryModal();
    const tourn = resolveOrCreateActiveTournament();
    if (window.AIScanner) {
      window.AIScanner.open({
        tournamentId: tourn ? tourn.id : null,
        matchNumber: activeMatch ? activeMatch.match_number : 1,
        matchId: activeMatch ? activeMatch.id : null,
        multiplier: activeMatch ? (activeMatch.multiplier || 1) : 1,
        ownerUserId: currentUser.id,
        returnScreen: currentScreen || 'tournament-dashboard',
      });
    }
  });

  btnActionCertificate?.addEventListener('click', () => showToast('Certificate — Coming Soon'));

  btnActionShare?.addEventListener('click', async () => {
    if (navigator.share && activeTournament) {
      try {
        await navigator.share({
          title: activeTournament.name,
          text: `Check out the Free Fire standings for ${activeTournament.name} on LRD PointCalc!`,
        });
      } catch (e) {
        // user cancelled or share failed
      }
    } else {
      showToast('Sharing will be available soon.');
    }
  });

  btnActionEdit?.addEventListener('click', () => {
    if (activeTournament) openEditTournamentModal(activeTournament.id);
  });

  btnDeleteDashboardTourn?.addEventListener('click', () => {
    if (activeTournament) openDeleteTournamentModal(activeTournament.id);
  });

  // ========================================
  // TOURNAMENT TABLES & MATCHES SCREENS
  // ========================================

  function openTournamentTables(tournamentId) {
    openTournamentDetail(tournamentId, 'leaderboard');
  }

  function openTournamentMatches(tournamentId) {
    openTournamentDetail(tournamentId, 'matches');
  }

  function openTournamentDetail(tournamentId, defaultTab = 'leaderboard') {
    if (!window.LocalDatabaseService || !currentUser.id) return;

    activeTournament = window.LocalDatabaseService.getTournamentById(tournamentId, currentUser.id);
    if (!activeTournament) {
      showToast('Tournament not found');
      return;
    }

    // Populate Hero Info
    if (tdHeroName) tdHeroName.textContent = activeTournament.name;
    if (tdBadgeMode) tdBadgeMode.textContent = getGameModeLabel(activeTournament.game_mode);
    if (tdBadgeTeams) tdBadgeTeams.textContent = `${activeTournament.team_count} Teams`;
    if (tdBadgeScoring) {
      tdBadgeScoring.textContent = activeTournament.scoring_system === 'custom' ? 'Custom Points' : 'Official Free Fire';
    }

    // Switch to requested Sub-tab
    switchSubtab(defaultTab);

    // Refresh Leaderboard & Matches views
    refreshTournamentDetailViews();

    navigateTo('tournament-detail');
  }

  function refreshTournamentDetailViews() {
    if (!activeTournament || !window.LocalDatabaseService) return;

    const scoringCfg = activeTournament.scoring_config || activeTournament.scoring_system;

    // 1. Overall Leaderboard
    const leaderboard = window.LocalDatabaseService.getTournamentLeaderboard(activeTournament.id, scoringCfg);
    renderOverallLeaderboard(leaderboard);

    // 2. Matches List
    const matches = window.LocalDatabaseService.getMatches(activeTournament.id);
    if (tdMatchesCount) tdMatchesCount.textContent = matches.length;
    renderMatchesList(matches, scoringCfg);
  }

  function renderOverallLeaderboard(leaderboard) {
    if (!tdLeaderboardBody) return;
    tdLeaderboardBody.innerHTML = '';

    if (!leaderboard || leaderboard.length === 0) {
      tdLeaderboardBody.innerHTML = `
        <tr>
          <td colspan="7" style="padding: 28px 12px; color: var(--text-muted); font-size: var(--fs-xs);">
            No matches played yet.<br/>Use Calculate to enter match results.
          </td>
        </tr>
      `;
      return;
    }

    leaderboard.forEach((row) => {
      const tr = document.createElement('tr');
      const booyahBadge = row.booyahs > 0 ? `<span class="team-booyah-badge">${row.booyahs} Booyah</span>` : '';

      tr.innerHTML = `
        <td class="col-rank">${row.rank}</td>
        <td class="col-team">
          <span>${escapeHtml(row.teamName)}</span>
          ${booyahBadge}
        </td>
        <td>${row.matchesPlayed}</td>
        <td>${row.totalKills}</td>
        <td>${row.placementPoints}</td>
        <td>${row.killPoints}</td>
        <td class="col-total">${row.totalPoints}</td>
      `;
      tdLeaderboardBody.appendChild(tr);
    });
  }

  function renderMatchesList(matches, scoringCfg) {
    if (!tdMatchesList) return;
    tdMatchesList.innerHTML = '';

    if (!matches || matches.length === 0) {
      tdMatchesList.innerHTML = `
        <div style="text-align: center; padding: 36px 16px; color: var(--text-muted); background: var(--bg-card); border-radius: var(--radius-md); border: 1px dashed var(--border-subtle);">
          <p style="font-weight: 600; color: var(--text-secondary); margin-bottom: 6px;">No matches recorded yet</p>
          <p style="font-size: var(--fs-xs); margin-bottom: 12px;">Tap "+ Add Match" or use Calculate to record scores.</p>
        </div>
      `;
      return;
    }

    matches.forEach((m) => {
      const matchLb = window.LocalDatabaseService.getMatchLeaderboard(m.id, scoringCfg);
      const winner = matchLb.length > 0 ? matchLb[0] : null;

      const card = document.createElement('div');
      card.className = 'match-card';

      const winnerText = winner
        ? `Winner: <strong>${escapeHtml(winner.teamName)}</strong> (${winner.totalPoints} pts)`
        : 'Status: Pending entry';

      const multBadge = m.multiplier && m.multiplier !== 1 ? ` · <span style="color: var(--gold-300);">${m.multiplier}x</span>` : '';

      card.innerHTML = `
        <div class="match-card__info">
          <span class="match-card__title">${escapeHtml(m.match_name || `Match ${m.match_number}`)}${multBadge}</span>
          <span class="match-card__sub">${winnerText}</span>
        </div>
        <div class="match-card__actions">
          <button type="button" class="btn-match-edit" data-edit-match="${m.id}">Edit</button>
          <button type="button" class="btn-match-del" data-del-match="${m.id}">Delete</button>
        </div>
      `;

      card.querySelector('[data-edit-match]').addEventListener('click', () => {
        openMatchEntryScreen({
          matchNumber: m.match_number,
          multiplier: m.multiplier || 1,
          matchId: m.id,
        });
      });

      card.querySelector('[data-del-match]').addEventListener('click', () => {
        openDeleteMatchModal(m.id);
      });

      tdMatchesList.appendChild(card);
    });
  }

  function switchSubtab(tab) {
    if (tab === 'leaderboard') {
      subtabBtnLeaderboard?.classList.add('active');
      subtabBtnMatches?.classList.remove('active');
      subtabViewLeaderboard?.classList.add('active');
      subtabViewMatches?.classList.remove('active');
    } else {
      subtabBtnMatches?.classList.add('active');
      subtabBtnLeaderboard?.classList.remove('active');
      subtabViewMatches?.classList.add('active');
      subtabViewLeaderboard?.classList.remove('active');
    }
  }

  subtabBtnLeaderboard?.addEventListener('click', () => switchSubtab('leaderboard'));
  subtabBtnMatches?.addEventListener('click', () => switchSubtab('matches'));

  // ========================================
  // SETUP CALCULATE MODAL
  // ========================================

  function openSetupCalculate(tournamentId) {
    if (!tournamentId || !window.LocalDatabaseService || !currentUser.id) return;
    activeTournament = window.LocalDatabaseService.getTournamentById(tournamentId, currentUser.id);
    if (!activeTournament) {
      showToast('Tournament not found');
      return;
    }

    setupCalcMultiplier = 1;
    setupCalcPosMode = 'increment';

    const matches = window.LocalDatabaseService.getMatches(tournamentId);
    if (calcMatchNumber) {
      calcMatchNumber.value = matches.length + 1;
    }

    // Reset multiplier chips
    if (multSelectorGroup) {
      multSelectorGroup.querySelectorAll('.mult-chip').forEach((c) => {
        c.classList.toggle('selected', c.dataset.mult === '1');
      });
    }

    // Reset pos toggle
    if (posToggleGroup) {
      posToggleGroup.querySelectorAll('.pos-toggle-card').forEach((c) => {
        c.classList.toggle('selected', c.dataset.posMode === 'increment');
      });
    }

    modalSetupCalculate?.classList.add('open');
  }

  function closeSetupCalculate() {
    modalSetupCalculate?.classList.remove('open');
  }

  multSelectorGroup?.addEventListener('click', (e) => {
    const chip = e.target.closest('.mult-chip');
    if (!chip) return;
    multSelectorGroup.querySelectorAll('.mult-chip').forEach((c) => c.classList.remove('selected'));
    chip.classList.add('selected');
    setupCalcMultiplier = Number(chip.dataset.mult) || 1;
  });

  posToggleGroup?.addEventListener('click', (e) => {
    const card = e.target.closest('.pos-toggle-card');
    if (!card) return;
    posToggleGroup.querySelectorAll('.pos-toggle-card').forEach((c) => c.classList.remove('selected'));
    card.classList.add('selected');
    setupCalcPosMode = card.dataset.posMode || 'increment';
  });

  btnCloseSetupCalc?.addEventListener('click', closeSetupCalculate);

  formSetupCalculate?.addEventListener('submit', (e) => {
    e.preventDefault();
    const matchNum = parseInt(calcMatchNumber?.value, 10) || 1;
    closeSetupCalculate();
    openMatchEntryScreen({
      matchNumber: matchNum,
      multiplier: setupCalcMultiplier,
      posMode: setupCalcPosMode,
    });
  });

  // ========================================
  // MATCH ENTRY / LIVE SCORING SCREEN
  // ========================================

  function openMatchEntryScreen({ matchNumber, multiplier = 1, posMode = 'increment', matchId = null }) {
    if (!activeTournament || !window.LocalDatabaseService) return;

    if (matchId) {
      activeMatch = window.LocalDatabaseService.getMatchById(matchId);
    } else {
      activeMatch = window.LocalDatabaseService.createMatch(
        activeTournament.id,
        matchNumber,
        `Match ${matchNumber}`,
        multiplier
      );
    }

    if (!activeMatch) return;

    const currentMult = activeMatch.multiplier || multiplier || 1;

    if (meTitle) {
      meTitle.textContent = activeMatch.match_name || `Match ${activeMatch.match_number} Results`;
    }
    if (meMultiplierBadge) {
      meMultiplierBadge.textContent = `${currentMult}x Multiplier`;
    }
    if (meErrorBanner) meErrorBanner.style.display = 'none';

    // Get teams with players from local DB
    const teamsWithPlayers = window.LocalDatabaseService.getTeamsWithPlayers(activeTournament.id);
    const existingResults = window.LocalDatabaseService.getMatchResults(activeMatch.id);
    const resultMap = new Map(existingResults.map((r) => [r.team_id, r]));

    renderMatchEntryCards(teamsWithPlayers, resultMap, currentMult, posMode);

    modalMatchEntry?.classList.add('open');
  }

  function closeMatchEntryModal() {
    modalMatchEntry?.classList.remove('open');
    activeMatch = null;
  }

  btnCloseMatchEntry?.addEventListener('click', closeMatchEntryModal);
  btnCancelMatchEntry?.addEventListener('click', closeMatchEntryModal);
  btnAddMatch?.addEventListener('click', () => {
    if (activeTournament) openSetupCalculate(activeTournament.id);
  });

  function renderMatchEntryCards(teamsWithPlayers, resultMap, multiplier, posMode) {
    if (!meTeamsContainer) return;
    meTeamsContainer.innerHTML = '';

    const totalTeams = teamsWithPlayers.length;
    const scoringCfg = activeTournament.scoring_config || activeTournament.scoring_system;

    teamsWithPlayers.forEach((team, idx) => {
      const prev = resultMap.get(team.id);
      let defaultPlace = idx + 1;
      if (prev) {
        defaultPlace = prev.placement;
      } else if (posMode === 'decrement') {
        defaultPlace = totalTeams - idx;
      }

      const defaultKills = prev ? prev.kills : 0;
      const pts = window.ScoringEngine.calculateTeamPoints(defaultPlace, defaultKills, scoringCfg, multiplier);

      const card = document.createElement('div');
      card.className = 'match-team-card';
      card.dataset.teamId = team.id;

      const playersListText = (team.players && team.players.length > 0)
        ? team.players.map((p) => escapeHtml(p.name)).join(', ')
        : 'No players registered';

      card.innerHTML = `
        <div class="match-team-card-top">
          <span class="match-team-name">${escapeHtml(team.name)}</span>
          <button type="button" class="match-team-players-toggle" data-toggle-players="${team.id}">
            <span>Players</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>
          </button>
        </div>

        <div class="match-team-players-panel" id="players-panel-${team.id}">
          <strong>Registered:</strong> ${playersListText}
        </div>

        <div class="match-team-inputs-grid">
          <div class="match-input-field">
            <label>Position</label>
            <input type="number" class="input-match-place" min="1" max="${totalTeams}" value="${defaultPlace}" required />
          </div>
          <div class="match-input-field">
            <label>Kills</label>
            <input type="number" class="input-match-kills" min="0" value="${defaultKills}" required />
          </div>
        </div>

        <div class="match-team-live-breakdown">
          <span>Place: <strong class="bd-place-pts">${pts.placementPoints}</strong> pts</span>
          <span>Kills: <strong class="bd-kill-pts">${pts.killPoints}</strong> pts</span>
          <span>Mult: <strong>${multiplier}x</strong></span>
          <span>Total: <strong class="pts-highlight bd-total-pts">${pts.totalPoints}</strong></span>
        </div>
      `;

      // Players toggle button
      const toggleBtn = card.querySelector(`[data-toggle-players="${team.id}"]`);
      const panel = card.querySelector(`#players-panel-${team.id}`);
      toggleBtn?.addEventListener('click', () => {
        panel.classList.toggle('open');
      });

      // Inputs live score update
      const placeInp = card.querySelector('.input-match-place');
      const killsInp = card.querySelector('.input-match-kills');

      const updateScoreRow = () => {
        const p = Math.floor(Number(placeInp.value)) || 0;
        const k = Math.max(0, Math.floor(Number(killsInp.value)) || 0);
        const calculated = window.ScoringEngine.calculateTeamPoints(p, k, scoringCfg, multiplier);

        card.querySelector('.bd-place-pts').textContent = calculated.placementPoints;
        card.querySelector('.bd-kill-pts').textContent = calculated.killPoints;
        card.querySelector('.bd-total-pts').textContent = calculated.totalPoints;

        validateMatchCards(false);
      };

      placeInp.addEventListener('input', updateScoreRow);
      killsInp.addEventListener('input', updateScoreRow);

      meTeamsContainer.appendChild(card);
    });

    validateMatchCards(false);
  }

  function validateMatchCards(showAlert = true) {
    if (!meTeamsContainer || !activeTournament) return true;

    const cards = meTeamsContainer.querySelectorAll('.match-team-card');
    const entries = [];

    cards.forEach((card) => {
      const teamId = card.dataset.teamId;
      const teamName = card.querySelector('.match-team-name').textContent;
      const place = card.querySelector('.input-match-place').value;
      const kills = card.querySelector('.input-match-kills').value;
      entries.push({ teamId, teamName, placement: place, kills });
    });

    const validation = window.ScoringEngine.validateMatchResults(entries, activeTournament.team_count);

    // Visual highlights on error inputs
    cards.forEach((card) => {
      const input = card.querySelector('.input-match-place');
      const placeVal = Number(input.value);
      if (validation.duplicatePlacements.includes(placeVal) || placeVal <= 0 || placeVal > activeTournament.team_count) {
        input.classList.add('duplicate-error');
      } else {
        input.classList.remove('duplicate-error');
      }
    });

    if (!validation.valid) {
      if (meErrorBanner) {
        meErrorBanner.textContent = validation.errors[0];
        if (showAlert) meErrorBanner.style.display = 'block';
      }
      return false;
    } else {
      if (meErrorBanner) meErrorBanner.style.display = 'none';
      return true;
    }
  }

  // Save Match Form Submit
  formMatchEntry?.addEventListener('submit', (e) => {
    e.preventDefault();

    if (!validateMatchCards(true)) {
      showToast('Please fix placement errors before saving');
      return;
    }

    const cards = meTeamsContainer.querySelectorAll('.match-team-card');
    const entries = [];
    const currentMult = activeMatch?.multiplier || setupCalcMultiplier || 1;

    cards.forEach((card) => {
      const teamId = card.dataset.teamId;
      const place = Math.floor(Number(card.querySelector('.input-match-place').value)) || 0;
      const kills = Math.max(0, Math.floor(Number(card.querySelector('.input-match-kills').value)) || 0);
      entries.push({ teamId, placement: place, kills });
    });

    const scoringCfg = activeTournament.scoring_config || activeTournament.scoring_system;

    // Save strictly to local database
    window.LocalDatabaseService.saveMatchResults(activeTournament.id, activeMatch.id, entries, scoringCfg, currentMult);

    closeMatchEntryModal();
    showToast('Match results saved');

    // Immediately open Tournament Tables (Overall Leaderboard)!
    openTournamentTables(activeTournament.id);
  });

  // ========================================
  // DELETE MATCH MODAL
  // ========================================

  function openDeleteMatchModal(matchId) {
    matchToDelete = matchId;
    modalDeleteMatch?.classList.add('open');
  }

  function closeDeleteMatchModal() {
    modalDeleteMatch?.classList.remove('open');
    matchToDelete = null;
  }

  btnCancelDeleteMatch?.addEventListener('click', closeDeleteMatchModal);

  btnConfirmDeleteMatch?.addEventListener('click', () => {
    if (matchToDelete && activeTournament) {
      window.LocalDatabaseService.deleteMatch(matchToDelete, activeTournament.id);
      closeDeleteMatchModal();
      refreshTournamentDetailViews();
      showToast('Match deleted');
    }
  });

  // ========================================
  // CREATE TOURNAMENT & DYNAMIC TEAM FORM
  // ========================================

  function getPlayerSlotCountForMode(mode) {
    if (mode === 'solo') return 1;
    if (mode === 'duo') return 2;
    return 4; // squad
  }

  function renderCreateTeamsList() {
    if (!createTeamsContainer) return;
    const count = Math.max(2, Math.min(48, parseInt(inputTeams?.value, 10) || 12));

    if (createTeamsCountLabel) {
      createTeamsCountLabel.textContent = `(${count} Teams)`;
    }

    // Preserve any values typed so far if re-rendering
    const existingValues = [];
    createTeamsContainer.querySelectorAll('.team-creation-card').forEach((card) => {
      const tName = card.querySelector('.team-name-input')?.value || '';
      const pInps = Array.from(card.querySelectorAll('.player-text-input')).map((p) => p.value);
      existingValues.push({ name: tName, players: pInps });
    });

    createTeamsContainer.innerHTML = '';
    const initialPlayerSlots = getPlayerSlotCountForMode(selectedGameMode);

    for (let i = 1; i <= count; i++) {
      const prev = existingValues[i - 1] || null;
      const card = document.createElement('div');
      card.className = 'team-creation-card';
      card.dataset.teamIdx = i;

      const currentPlayers = (prev && prev.players && prev.players.length > 0)
        ? prev.players
        : Array(initialPlayerSlots).fill('');

      let playersHtml = '';
      currentPlayers.forEach((pVal, pIdx) => {
        playersHtml += `
          <div class="player-input-wrap">
            <span class="player-slot-label">P${pIdx + 1}</span>
            <input type="text" class="player-text-input" placeholder="Player ${pIdx + 1}" value="${escapeHtml(pVal)}" />
          </div>
        `;
      });

      card.innerHTML = `
        <div class="team-creation-card-header">
          <span class="team-creation-num-badge">TEAM ${i}</span>
        </div>
        <div class="form-group" style="margin-bottom: 8px;">
          <label class="form-label">Team Name <span style="color: var(--gold-300);">*</span></label>
          <input type="text" class="form-input team-name-input" placeholder="Team ${i}" value="${escapeHtml(prev ? prev.name : '')}" required />
        </div>
        <div class="players-creation-box">
          <div class="players-creation-box-header">
            <span class="players-creation-box-title">Players (Optional)</span>
            <button type="button" class="btn-add-player-slot" data-team-slot="${i}">+ Add Player</button>
          </div>
          <div class="players-inputs-list" id="players-list-${i}">
            ${playersHtml}
          </div>
        </div>
      `;

      // Event listener for [+ Add Player]
      const addBtn = card.querySelector('.btn-add-player-slot');
      addBtn?.addEventListener('click', () => {
        const listEl = card.querySelector(`#players-list-${i}`);
        if (!listEl) return;
        const curCount = listEl.querySelectorAll('.player-input-wrap').length + 1;
        const wrap = document.createElement('div');
        wrap.className = 'player-input-wrap';
        wrap.innerHTML = `
          <span class="player-slot-label">P${curCount}</span>
          <input type="text" class="player-text-input" placeholder="Player ${curCount}" />
        `;
        listEl.appendChild(wrap);
      });

      createTeamsContainer.appendChild(card);
    }
  }

  function openCreateModal() {
    if (!currentUser.isAuthenticated) {
      navigateTo('login');
      return;
    }
    formCreate?.reset();
    selectedGameMode = 'squad';
    selectedScoring = 'default';
    if (inputTeams) inputTeams.value = 12;

    updateChipSelection('select-game-mode', selectedGameMode);
    updateChipSelection('select-scoring', selectedScoring);

    if (customScoringContainer) customScoringContainer.classList.remove('open');
    if (createErrorBanner) createErrorBanner.style.display = 'none';

    renderCreateTeamsList();

    modalCreate?.classList.add('open');
    setTimeout(() => inputName?.focus(), 300);
  }

  function closeCreateModal() {
    modalCreate?.classList.remove('open');
  }

  btnCloseCreateModal?.addEventListener('click', closeCreateModal);

  function updateChipSelection(groupId, value) {
    const group = document.getElementById(groupId);
    if (!group) return;
    group.querySelectorAll('.form-chip').forEach((chip) => {
      chip.classList.toggle('selected', chip.dataset.value === value);
    });
  }

  document.getElementById('select-game-mode')?.addEventListener('click', (e) => {
    const chip = e.target.closest('.form-chip');
    if (!chip) return;
    selectedGameMode = chip.dataset.value;
    updateChipSelection('select-game-mode', selectedGameMode);
    renderCreateTeamsList();
  });

  document.getElementById('select-scoring')?.addEventListener('click', (e) => {
    const chip = e.target.closest('.form-chip');
    if (!chip) return;
    selectedScoring = chip.dataset.value;
    updateChipSelection('select-scoring', selectedScoring);

    if (customScoringContainer) {
      customScoringContainer.classList.toggle('open', selectedScoring === 'custom');
    }
  });

  // Re-generate teams on team count change
  inputTeams?.addEventListener('input', () => {
    renderCreateTeamsList();
  });

  modalCreate?.addEventListener('click', (e) => {
    if (e.target === modalCreate) closeCreateModal();
  });

  function showCreateError(msg) {
    if (createErrorBanner) {
      createErrorBanner.textContent = msg;
      createErrorBanner.style.display = 'block';
    }
    showToast(msg);
  }

  formCreate?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (createErrorBanner) createErrorBanner.style.display = 'none';

    const tournName = inputName?.value?.trim();
    const count = parseInt(inputTeams?.value, 10);

    if (!tournName) {
      showCreateError('Tournament Name is required.');
      inputName?.focus();
      return;
    }

    if (!count || count < 2 || count > 48) {
      showCreateError('Number of Teams must be between 2 and 48.');
      inputTeams?.focus();
      return;
    }

    // Validate all dynamic team cards
    const teamCards = createTeamsContainer.querySelectorAll('.team-creation-card');
    const teamsData = [];
    const seenTeamNames = new Set();

    for (let i = 0; i < teamCards.length; i++) {
      const card = teamCards[i];
      const teamIdx = card.dataset.teamIdx;
      const nameInput = card.querySelector('.team-name-input');
      const name = nameInput?.value?.trim();

      if (!name) {
        showCreateError(`Team ${teamIdx} Name is required.`);
        nameInput?.focus();
        return;
      }

      const lowerName = name.toLowerCase();
      if (seenTeamNames.has(lowerName)) {
        showCreateError(`Duplicate team name: "${name}". Team names must be unique.`);
        nameInput?.focus();
        return;
      }
      seenTeamNames.add(lowerName);

      // Validate players (optional)
      const pInputs = card.querySelectorAll('.player-text-input');
      const players = [];
      const seenPlayers = new Set();
      for (let p = 0; p < pInputs.length; p++) {
        const pName = pInputs[p].value.trim();
        if (pName) {
          const lowerPName = pName.toLowerCase();
          if (seenPlayers.has(lowerPName)) {
            showCreateError(`Team "${name}" has duplicate player: "${pName}".`);
            pInputs[p].focus();
            return;
          }
          seenPlayers.add(lowerPName);
          players.push(pName);
        }
      }

      teamsData.push({ name, players });
    }

    // Scoring config if custom
    let scoringConfig = null;
    if (selectedScoring === 'custom') {
      const placementPoints = {};
      for (let i = 1; i <= 10; i++) {
        const inp = document.getElementById(`csp-${i}`);
        placementPoints[i] = Math.max(0, Math.floor(Number(inp?.value)) || 0);
      }
      const killVal = Math.max(0, Math.floor(Number(document.getElementById('csp-kill')?.value)) || 1);
      scoringConfig = {
        type: 'custom',
        placementPoints,
        killPointValue: killVal,
      };
    }

    const tournament = window.LocalDatabaseService.createTournament(currentUser.id, {
      name: tournName,
      team_count: teamsData.length,
      game_mode: selectedGameMode,
      scoring_system: selectedScoring,
      scoring_config: scoringConfig,
      teamsData,
    });

    closeCreateModal();
    loadTournaments();

    if (tournament) {
      showToast(`"${tournament.name}" created with ${teamsData.length} teams`);
      openTournamentDashboard(tournament.id);
    }
  });

  // ====================================================================
  // PRIMARY CREATE ACTIONS → Open AI Wizard instead of old modal
  // ====================================================================
  fabCreate?.addEventListener('click', () => openWizard());
  document.getElementById('qa-create-tournament')?.addEventListener('click', () => openWizard());
  document.getElementById('qa-design-studio')?.addEventListener('click', () => navigateTo('design'));

  // Quick Action placeholders
  ['qa-import-tournament', 'qa-merge-tournament'].forEach((id) => {
    document.getElementById(id)?.addEventListener('click', () => {
      showToast('Coming soon');
    });
  });

  // Import Team → Open Auto Team Simulator
  document.getElementById('qa-import-team')?.addEventListener('click', () => {
    if (window.TeamSimulator && currentUser.id) {
      window.TeamSimulator.open(currentUser.id);
    }
  });

  // AI Result Scanner Quick Action
  document.getElementById('qa-ai-scanner')?.addEventListener('click', () => {
    const tourn = resolveOrCreateActiveTournament();
    if (window.AIScanner) {
      window.AIScanner.open({
        tournamentId: tourn ? tourn.id : null,
        ownerUserId: currentUser.id,
        returnScreen: 'home',
      });
    } else {
      showToast('AI Scanner module initializing...');
    }
  });

  // ========================================
  // AI WIZARD — PREMIUM TOURNAMENT CREATION
  // ========================================
  const wizardOverlay = document.getElementById('wizard-create');
  const wizBackBtn = document.getElementById('wizard-back-btn');
  const wizCloseBtn = document.getElementById('wizard-close-btn');
  const wizNextBtn = document.getElementById('wiz-next-btn');
  const wizCreateBtn = document.getElementById('wiz-create-btn');
  const wizPrevBtn = document.getElementById('wiz-prev-btn');
  const wizFooterSingle = document.getElementById('wiz-footer-single');
  const wizFooterDual = document.getElementById('wiz-footer-dual');

  // Step elements
  const wizSteps = [
    document.getElementById('wiz-step-1'),
    document.getElementById('wiz-step-2'),
    document.getElementById('wiz-step-3'),
  ];
  const wizDots = [
    document.getElementById('wiz-dot-1'),
    document.getElementById('wiz-dot-2'),
    document.getElementById('wiz-dot-3'),
  ];
  const wizLines = [
    document.getElementById('wiz-line-1'),
    document.getElementById('wiz-line-2'),
  ];

  // Wizard state
  let wizCurrentStep = 0;
  let wizGameMode = 'squad';
  let wizScoring = 'default';
  let wizImportMethod = 'ai'; // 'ai' or 'manual'
  let wizSelectedFile = null;
  let wizPreviewUrl = null;
  let wizExtractedTeams = []; // Array of { slot, teamName, confidence }
  let wizIsProcessing = false;

  // Step 1 Elements
  const wizTournamentName = document.getElementById('wiz-tournament-name');
  const wizGameModeGroup = document.getElementById('wiz-game-mode');
  const wizScoringGroup = document.getElementById('wiz-scoring');
  const wizCustomScoring = document.getElementById('wiz-custom-scoring');

  // Step 2 Elements
  const wizMethodAI = document.getElementById('wiz-method-ai');
  const wizMethodManual = document.getElementById('wiz-method-manual');
  const wizAIContent = document.getElementById('wiz-ai-content');
  const wizManualContent = document.getElementById('wiz-manual-content');
  const wizDropzone = document.getElementById('wiz-dropzone');
  const wizFileInput = document.getElementById('wiz-file-input');
  const wizPreviewArea = document.getElementById('wiz-preview-area');
  const wizPreviewImg = document.getElementById('wiz-preview-img');
  const wizPreviewFilename = document.getElementById('wiz-preview-filename');
  const wizChangeImage = document.getElementById('wiz-change-image');
  const wizProcessing = document.getElementById('wiz-processing');
  const wizProcessingText = document.getElementById('wiz-processing-text');
  const wizProgressFill = document.getElementById('wiz-progress-fill');
  const wizAIError = document.getElementById('wiz-ai-error');
  const wizErrorMsg = document.getElementById('wiz-error-msg');
  const wizErrorSub = document.getElementById('wiz-error-sub');
  const wizRetryBtn = document.getElementById('wiz-retry-btn');
  const wizManualFallbackBtn = document.getElementById('wiz-manual-fallback-btn');
  const wizManualCount = document.getElementById('wiz-manual-count');
  const wizManualTeamsList = document.getElementById('wiz-manual-teams-list');
  const wizManualAddTeam = document.getElementById('wiz-manual-add-team');

  // Step 3 Elements
  const wizResultCount = document.getElementById('wiz-result-count');
  const wizResultMethod = document.getElementById('wiz-result-method');
  const wizReviewTeamsList = document.getElementById('wiz-review-teams-list');
  const wizReviewAddTeam = document.getElementById('wiz-review-add-team');

  // ----------------------------
  // WIZARD OPEN/CLOSE
  // ----------------------------
  function openWizard() {
    if (!currentUser.isAuthenticated) {
      navigateTo('login');
      return;
    }
    resetWizard();
    wizardOverlay?.classList.add('open');
    setTimeout(() => wizTournamentName?.focus(), 350);
  }

  function closeWizard() {
    wizardOverlay?.classList.remove('open');
    // Cleanup preview URL
    if (wizPreviewUrl) {
      window.AIService?.revokePreviewUrl(wizPreviewUrl);
      wizPreviewUrl = null;
    }
    wizSelectedFile = null;
  }

  function resetWizard() {
    wizCurrentStep = 0;
    wizGameMode = 'squad';
    wizScoring = 'default';
    wizImportMethod = 'ai';
    wizSelectedFile = null;
    wizExtractedTeams = [];
    wizIsProcessing = false;

    if (wizTournamentName) wizTournamentName.value = '';
    updateWizardChips(wizGameModeGroup, 'squad');
    updateWizardChips(wizScoringGroup, 'default');
    if (wizCustomScoring) wizCustomScoring.classList.remove('open');

    // Reset method toggle
    wizMethodAI?.classList.add('selected');
    wizMethodManual?.classList.remove('selected');
    if (wizAIContent) wizAIContent.style.display = '';
    if (wizManualContent) wizManualContent.style.display = 'none';

    // Reset dropzone
    showWizAIView('dropzone');

    // Reset file input
    if (wizFileInput) wizFileInput.value = '';

    // Cleanup preview
    if (wizPreviewUrl) {
      window.AIService?.revokePreviewUrl(wizPreviewUrl);
      wizPreviewUrl = null;
    }

    goToWizardStep(0);
  }

  wizCloseBtn?.addEventListener('click', closeWizard);

  wizBackBtn?.addEventListener('click', () => {
    if (wizCurrentStep > 0) {
      goToWizardStep(wizCurrentStep - 1);
    } else {
      closeWizard();
    }
  });

  // ----------------------------
  // WIZARD STEP NAVIGATION
  // ----------------------------
  function goToWizardStep(step) {
    wizCurrentStep = step;

    wizSteps.forEach((s, i) => {
      if (s) {
        s.classList.toggle('active', i === step);
      }
    });

    wizDots.forEach((d, i) => {
      if (d) {
        d.classList.remove('active', 'completed');
        if (i === step) d.classList.add('active');
        else if (i < step) d.classList.add('completed');
      }
    });

    wizLines.forEach((l, i) => {
      if (l) {
        l.classList.toggle('completed', i < step);
      }
    });

    // Footer visibility
    if (step === 2) {
      // Step 3: Show dual footer (Back + Create)
      if (wizFooterSingle) wizFooterSingle.style.display = 'none';
      if (wizFooterDual) wizFooterDual.style.display = 'flex';
    } else {
      if (wizFooterSingle) wizFooterSingle.style.display = '';
      if (wizFooterDual) wizFooterDual.style.display = 'none';
    }

    // Update next button text
    if (step === 1) {
      if (wizNextBtn) {
        if (wizImportMethod === 'ai' && wizSelectedFile) {
          wizNextBtn.textContent = 'Extract & Continue';
        } else if (wizImportMethod === 'manual') {
          wizNextBtn.textContent = 'Continue';
        } else {
          wizNextBtn.textContent = 'Continue';
        }
      }
    } else if (step === 0) {
      if (wizNextBtn) wizNextBtn.textContent = 'Continue';
    }

    // Hide next button during processing
    if (wizFooterSingle) {
      wizFooterSingle.style.display = wizIsProcessing ? 'none' : '';
    }

    // Scroll wizard body to top
    const body = wizardOverlay?.querySelector('.wizard-body');
    if (body) body.scrollTop = 0;
  }

  // ----------------------------
  // STEP 1: Tournament Config Chips
  // ----------------------------
  function updateWizardChips(group, value) {
    if (!group) return;
    group.querySelectorAll('.wizard-chip').forEach((c) => {
      c.classList.toggle('selected', c.dataset.value === value);
    });
  }

  wizGameModeGroup?.addEventListener('click', (e) => {
    const chip = e.target.closest('.wizard-chip');
    if (!chip) return;
    wizGameMode = chip.dataset.value;
    updateWizardChips(wizGameModeGroup, wizGameMode);
  });

  wizScoringGroup?.addEventListener('click', (e) => {
    const chip = e.target.closest('.wizard-chip');
    if (!chip) return;
    wizScoring = chip.dataset.value;
    updateWizardChips(wizScoringGroup, wizScoring);
    if (wizCustomScoring) {
      wizCustomScoring.classList.toggle('open', wizScoring === 'custom');
    }
  });

  // ----------------------------
  // STEP 2: Import Method Toggle
  // ----------------------------
  wizMethodAI?.addEventListener('click', () => {
    wizImportMethod = 'ai';
    wizMethodAI.classList.add('selected');
    wizMethodManual?.classList.remove('selected');
    if (wizAIContent) wizAIContent.style.display = '';
    if (wizManualContent) wizManualContent.style.display = 'none';
    updateStep2NextButton();
  });

  wizMethodManual?.addEventListener('click', () => {
    wizImportMethod = 'manual';
    wizMethodManual.classList.add('selected');
    wizMethodAI?.classList.remove('selected');
    if (wizAIContent) wizAIContent.style.display = 'none';
    if (wizManualContent) wizManualContent.style.display = '';
    renderManualTeamCards();
    updateStep2NextButton();
  });

  function updateStep2NextButton() {
    if (wizNextBtn) {
      if (wizImportMethod === 'ai' && wizSelectedFile) {
        wizNextBtn.textContent = 'Extract & Continue';
      } else {
        wizNextBtn.textContent = 'Continue';
      }
    }
  }

  // ----------------------------
  // AI IMAGE UPLOAD
  // ----------------------------
  function showWizAIView(view) {
    const views = {
      dropzone: wizDropzone,
      preview: wizPreviewArea,
      processing: wizProcessing,
      error: wizAIError,
    };
    Object.values(views).forEach((el) => {
      if (el) el.style.display = 'none';
    });
    if (views[view]) views[view].style.display = '';
  }

  // File input change
  wizFileInput?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) handleImageSelected(file);
  });

  // Drag & drop
  wizDropzone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    wizDropzone.classList.add('drag-over');
  });

  wizDropzone?.addEventListener('dragleave', () => {
    wizDropzone.classList.remove('drag-over');
  });

  wizDropzone?.addEventListener('drop', (e) => {
    e.preventDefault();
    wizDropzone.classList.remove('drag-over');
    const file = e.dataTransfer?.files?.[0];
    if (file) handleImageSelected(file);
  });

  function handleImageSelected(file) {
    // Validate
    const validation = window.AIService?.validateImageFile(file);
    if (validation && !validation.valid) {
      showToast(validation.error);
      return;
    }

    wizSelectedFile = file;

    // Show preview
    if (wizPreviewUrl) window.AIService?.revokePreviewUrl(wizPreviewUrl);
    wizPreviewUrl = window.AIService?.createPreviewUrl(file) || URL.createObjectURL(file);

    if (wizPreviewImg) wizPreviewImg.src = wizPreviewUrl;
    if (wizPreviewFilename) wizPreviewFilename.textContent = file.name;

    showWizAIView('preview');
    updateStep2NextButton();
  }

  // Change image button
  wizChangeImage?.addEventListener('click', () => {
    wizSelectedFile = null;
    if (wizFileInput) wizFileInput.value = '';
    showWizAIView('dropzone');
    updateStep2NextButton();
  });

  // Retry button
  wizRetryBtn?.addEventListener('click', () => {
    showWizAIView('dropzone');
    wizSelectedFile = null;
    if (wizFileInput) wizFileInput.value = '';
    updateStep2NextButton();
  });

  // Manual fallback button from error state
  wizManualFallbackBtn?.addEventListener('click', () => {
    wizImportMethod = 'manual';
    wizMethodManual?.classList.add('selected');
    wizMethodAI?.classList.remove('selected');
    if (wizAIContent) wizAIContent.style.display = 'none';
    if (wizManualContent) wizManualContent.style.display = '';
    showWizAIView('dropzone');
    renderManualTeamCards();
    updateStep2NextButton();
  });

  // ----------------------------
  // MANUAL TEAM ENTRY
  // ----------------------------
  function renderManualTeamCards() {
    if (!wizManualTeamsList) return;
    const count = Math.max(2, Math.min(48, parseInt(wizManualCount?.value, 10) || 12));

    // Preserve existing values
    const existing = [];
    wizManualTeamsList.querySelectorAll('.ai-team-name-edit').forEach((inp) => {
      existing.push(inp.value.trim());
    });

    wizManualTeamsList.innerHTML = '';

    for (let i = 0; i < count; i++) {
      const card = document.createElement('div');
      card.className = 'ai-team-review-card';
      card.innerHTML = `
        <div class="ai-slot-badge">${String(i + 1).padStart(2, '0')}</div>
        <input type="text" class="ai-team-name-edit" placeholder="Team ${i + 1}" value="${escapeHtml(existing[i] || '')}" />
        <button type="button" class="ai-team-remove-btn" data-remove-manual="${i}" aria-label="Remove">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      `;

      card.querySelector('[data-remove-manual]')?.addEventListener('click', () => {
        card.remove();
        reindexManualCards();
      });

      wizManualTeamsList.appendChild(card);
    }
  }

  function reindexManualCards() {
    if (!wizManualTeamsList) return;
    wizManualTeamsList.querySelectorAll('.ai-team-review-card').forEach((card, i) => {
      const badge = card.querySelector('.ai-slot-badge');
      if (badge) badge.textContent = String(i + 1).padStart(2, '0');
      const input = card.querySelector('.ai-team-name-edit');
      if (input && !input.value) input.placeholder = `Team ${i + 1}`;
    });
  }

  wizManualCount?.addEventListener('input', () => {
    renderManualTeamCards();
  });

  wizManualAddTeam?.addEventListener('click', () => {
    if (!wizManualTeamsList) return;
    const currentCount = wizManualTeamsList.querySelectorAll('.ai-team-review-card').length;
    if (currentCount >= 48) {
      showToast('Maximum 48 teams');
      return;
    }
    const idx = currentCount;
    const card = document.createElement('div');
    card.className = 'ai-team-review-card';
    card.innerHTML = `
      <div class="ai-slot-badge">${String(idx + 1).padStart(2, '0')}</div>
      <input type="text" class="ai-team-name-edit" placeholder="Team ${idx + 1}" />
      <button type="button" class="ai-team-remove-btn" aria-label="Remove">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    `;
    card.querySelector('.ai-team-remove-btn')?.addEventListener('click', () => {
      card.remove();
      reindexManualCards();
    });
    wizManualTeamsList.appendChild(card);
    card.querySelector('.ai-team-name-edit')?.focus();
    if (wizManualCount) wizManualCount.value = idx + 1;
  });

  // ----------------------------
  // AI EXTRACTION
  // ----------------------------
  async function runAIExtraction() {
    if (!wizSelectedFile || !window.AIService) {
      showToast('No image selected');
      return;
    }

    wizIsProcessing = true;
    showWizAIView('processing');
    if (wizFooterSingle) wizFooterSingle.style.display = 'none';

    // Progress updates
    if (wizProgressFill) wizProgressFill.style.width = '0%';
    if (wizProcessingText) wizProcessingText.textContent = 'Loading OCR engine...';

    try {
      const result = await window.AIService.extractSlotList(wizSelectedFile, (progress) => {
        if (wizProgressFill) wizProgressFill.style.width = `${progress}%`;
        if (progress < 30) {
          if (wizProcessingText) wizProcessingText.textContent = 'Loading OCR engine...';
        } else if (progress < 70) {
          if (wizProcessingText) wizProcessingText.textContent = 'Analyzing slot list image...';
        } else {
          if (wizProcessingText) wizProcessingText.textContent = 'Extracting team names...';
        }
      });

      wizIsProcessing = false;

      if (result.success && result.entries.length > 0) {
        wizExtractedTeams = result.entries;
        populateReviewStep(result.method);
        goToWizardStep(2);
      } else {
        // Show error state
        if (wizErrorMsg) wizErrorMsg.textContent = 'Extraction Failed';
        if (wizErrorSub) wizErrorSub.textContent = result.error || 'Could not read teams from the image. Try a clearer image or enter teams manually.';
        showWizAIView('error');
        if (wizFooterSingle) wizFooterSingle.style.display = '';
      }
    } catch (err) {
      wizIsProcessing = false;
      console.error('Wizard AI extraction error:', err);
      if (wizErrorMsg) wizErrorMsg.textContent = 'Extraction Error';
      if (wizErrorSub) wizErrorSub.textContent = err.message || 'An unexpected error occurred.';
      showWizAIView('error');
      if (wizFooterSingle) wizFooterSingle.style.display = '';
    }
  }

  // ----------------------------
  // STEP 3: REVIEW & VERIFY TEAMS
  // ----------------------------
  function populateReviewStep(method) {
    wizExtractedTeams.sort((a, b) => a.slot - b.slot);

    if (wizResultCount) wizResultCount.textContent = `${wizExtractedTeams.length} teams`;
    if (wizResultMethod) {
      const methodLabels = { ai: 'AI Extracted', ocr: 'OCR Extracted', manual: 'Manual Entry' };
      wizResultMethod.textContent = methodLabels[method] || method;
    }

    renderReviewTeamCards();
  }

  function renderReviewTeamCards() {
    if (!wizReviewTeamsList) return;
    wizReviewTeamsList.innerHTML = '';

    wizExtractedTeams.forEach((entry, idx) => {
      const card = document.createElement('div');
      card.className = 'ai-team-review-card';
      card.dataset.reviewIdx = idx;

      const confidenceClass = entry.confidence >= 0.8 ? 'high' : entry.confidence >= 0.6 ? 'medium' : 'low';
      const confidenceText = Math.round(entry.confidence * 100) + '%';

      card.innerHTML = `
        <div class="ai-slot-badge">${String(entry.slot).padStart(2, '0')}</div>
        <input type="text" class="ai-team-name-edit" value="${escapeHtml(entry.teamName)}" placeholder="Team name" />
        <span class="ai-team-confidence ${confidenceClass}">${confidenceText}</span>
        <button type="button" class="ai-team-remove-btn" aria-label="Remove">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      `;

      // Focus highlight
      const input = card.querySelector('.ai-team-name-edit');
      input?.addEventListener('focus', () => card.classList.add('editing'));
      input?.addEventListener('blur', () => {
        card.classList.remove('editing');
        wizExtractedTeams[idx].teamName = input.value.trim();
      });

      // Remove button
      card.querySelector('.ai-team-remove-btn')?.addEventListener('click', () => {
        wizExtractedTeams.splice(idx, 1);
        renderReviewTeamCards();
        if (wizResultCount) wizResultCount.textContent = `${wizExtractedTeams.length} teams`;
      });

      wizReviewTeamsList.appendChild(card);
    });
  }

  // Add team in review step
  wizReviewAddTeam?.addEventListener('click', () => {
    const nextSlot = wizExtractedTeams.length > 0
      ? Math.max(...wizExtractedTeams.map((e) => e.slot)) + 1
      : 1;

    if (nextSlot > 48) {
      showToast('Maximum 48 teams');
      return;
    }

    wizExtractedTeams.push({
      slot: nextSlot,
      teamName: '',
      confidence: 1.0,
    });

    renderReviewTeamCards();
    if (wizResultCount) wizResultCount.textContent = `${wizExtractedTeams.length} teams`;

    // Focus the new input
    const lastInput = wizReviewTeamsList?.querySelector('.ai-team-review-card:last-child .ai-team-name-edit');
    lastInput?.focus();
  });

  // ----------------------------
  // NEXT BUTTON HANDLER
  // ----------------------------
  wizNextBtn?.addEventListener('click', () => {
    if (wizCurrentStep === 0) {
      // Validate Step 1
      const name = wizTournamentName?.value?.trim();
      if (!name) {
        showToast('Enter a tournament name');
        wizTournamentName?.focus();
        return;
      }
      goToWizardStep(1);
    } else if (wizCurrentStep === 1) {
      if (wizImportMethod === 'ai') {
        if (!wizSelectedFile) {
          showToast('Upload a slot list image first');
          return;
        }
        // Run AI extraction
        runAIExtraction();
      } else {
        // Manual: Collect entries and go to step 3
        collectManualEntries();
        goToWizardStep(2);
      }
    }
  });

  function collectManualEntries() {
    wizExtractedTeams = [];
    const cards = wizManualTeamsList?.querySelectorAll('.ai-team-review-card') || [];
    cards.forEach((card, i) => {
      const input = card.querySelector('.ai-team-name-edit');
      const name = input?.value?.trim() || `Team ${i + 1}`;
      wizExtractedTeams.push({
        slot: i + 1,
        teamName: name,
        confidence: 1.0,
      });
    });

    populateReviewStep('manual');
  }

  // ----------------------------
  // PREV BUTTON (Step 3 → Step 2)
  // ----------------------------
  wizPrevBtn?.addEventListener('click', () => {
    if (wizCurrentStep > 0) {
      goToWizardStep(wizCurrentStep - 1);
    }
  });

  // ----------------------------
  // CREATE TOURNAMENT FROM WIZARD
  // ----------------------------
  wizCreateBtn?.addEventListener('click', () => {
    // 1. Sync all review inputs back to wizExtractedTeams
    const reviewCards = wizReviewTeamsList?.querySelectorAll('.ai-team-review-card') || [];
    const finalTeams = [];
    const seenNames = new Set();
    let hasError = false;

    reviewCards.forEach((card, i) => {
      const input = card.querySelector('.ai-team-name-edit');
      const name = input?.value?.trim();

      if (!name) {
        showToast(`Team ${i + 1} needs a name`);
        input?.focus();
        hasError = true;
        return;
      }

      const lowerName = name.toLowerCase();
      if (seenNames.has(lowerName)) {
        showToast(`Duplicate team name: "${name}"`);
        input?.focus();
        hasError = true;
        return;
      }
      seenNames.add(lowerName);

      finalTeams.push({ name, players: [] });
    });

    if (hasError) return;

    if (finalTeams.length < 2) {
      showToast('Add at least 2 teams');
      return;
    }

    // 2. Build scoring config
    let scoringConfig = null;
    if (wizScoring === 'custom') {
      const placementPoints = {};
      for (let i = 1; i <= 10; i++) {
        const inp = document.getElementById(`wiz-csp-${i}`);
        placementPoints[i] = Math.max(0, Math.floor(Number(inp?.value)) || 0);
      }
      const killVal = Math.max(0, Math.floor(Number(document.getElementById('wiz-csp-kill')?.value)) || 1);
      scoringConfig = { type: 'custom', placementPoints, killPointValue: killVal };
    }

    // 3. Create via LocalDatabaseService
    const tournament = window.LocalDatabaseService.createTournament(currentUser.id, {
      name: wizTournamentName?.value?.trim(),
      team_count: finalTeams.length,
      game_mode: wizGameMode,
      scoring_system: wizScoring,
      scoring_config: scoringConfig,
      teamsData: finalTeams,
    });

    // 4. Close wizard & navigate
    closeWizard();
    loadTournaments();

    if (tournament) {
      showToast(`"${tournament.name}" created with ${finalTeams.length} teams`);
      openTournamentDashboard(tournament.id);
    }
  });

  // ========================================
  // EDIT TOURNAMENT MODAL
  // ========================================

  function openEditTournamentModal(tournamentId) {
    if (!tournamentId || !window.LocalDatabaseService || !currentUser.id) return;
    activeTournament = window.LocalDatabaseService.getTournamentById(tournamentId, currentUser.id);
    if (!activeTournament) return;

    if (editTournamentName) editTournamentName.value = activeTournament.name;

    editSelectedGameMode = activeTournament.game_mode || 'squad';
    editSelectedScoring = activeTournament.scoring_system || 'default';
    updateChipSelection('edit-select-game-mode', editSelectedGameMode);
    updateChipSelection('edit-select-scoring', editSelectedScoring);

    if (editCustomScoringContainer) {
      editCustomScoringContainer.classList.toggle('open', editSelectedScoring === 'custom');
      if (activeTournament.scoring_config && activeTournament.scoring_config.placementPoints) {
        for (let i = 1; i <= 10; i++) {
          const inp = document.getElementById(`edit-csp-${i}`);
          if (inp) inp.value = activeTournament.scoring_config.placementPoints[i] ?? 0;
        }
        const kInp = document.getElementById('edit-csp-kill');
        if (kInp) kInp.value = activeTournament.scoring_config.killPointValue ?? 1;
      }
    }

    if (editErrorBanner) editErrorBanner.style.display = 'none';
    modalEditTournament?.classList.add('open');
  }

  function closeEditTournamentModal() {
    modalEditTournament?.classList.remove('open');
  }

  btnCloseEditTournament?.addEventListener('click', closeEditTournamentModal);

  document.getElementById('edit-select-game-mode')?.addEventListener('click', (e) => {
    const chip = e.target.closest('.form-chip');
    if (!chip) return;
    editSelectedGameMode = chip.dataset.value;
    updateChipSelection('edit-select-game-mode', editSelectedGameMode);
  });

  document.getElementById('edit-select-scoring')?.addEventListener('click', (e) => {
    const chip = e.target.closest('.form-chip');
    if (!chip) return;
    editSelectedScoring = chip.dataset.value;
    updateChipSelection('edit-select-scoring', editSelectedScoring);

    if (editCustomScoringContainer) {
      editCustomScoringContainer.classList.toggle('open', editSelectedScoring === 'custom');
    }
  });

  formEditTournament?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!activeTournament) return;

    const newName = editTournamentName?.value?.trim();
    if (!newName) {
      if (editErrorBanner) {
        editErrorBanner.textContent = 'Tournament Name cannot be blank.';
        editErrorBanner.style.display = 'block';
      }
      return;
    }

    let scoringConfig = null;
    if (editSelectedScoring === 'custom') {
      const placementPoints = {};
      for (let i = 1; i <= 10; i++) {
        const inp = document.getElementById(`edit-csp-${i}`);
        placementPoints[i] = Math.max(0, Math.floor(Number(inp?.value)) || 0);
      }
      const killVal = Math.max(0, Math.floor(Number(document.getElementById('edit-csp-kill')?.value)) || 1);
      scoringConfig = {
        type: 'custom',
        placementPoints,
        killPointValue: killVal,
      };
    }

    const updated = window.LocalDatabaseService.updateTournament(activeTournament.id, currentUser.id, {
      name: newName,
      game_mode: editSelectedGameMode,
      scoring_system: editSelectedScoring,
      scoring_config: scoringConfig,
    });

    closeEditTournamentModal();

    if (updated) {
      activeTournament = updated;
      showToast('Tournament updated');
      openTournamentDashboard(updated.id);
      loadTournaments();
    }
  });

  // ========================================
  // DELETE TOURNAMENT CONFIRMATION
  // ========================================

  function openDeleteTournamentModal(tournamentId) {
    tournamentToDelete = tournamentId;
    modalDeleteTourn?.classList.add('open');
  }

  function closeDeleteTournamentModal() {
    tournamentToDelete = null;
    modalDeleteTourn?.classList.remove('open');
  }

  btnCancelDeleteTourn?.addEventListener('click', closeDeleteTournamentModal);

  btnConfirmDeleteTourn?.addEventListener('click', () => {
    const id = tournamentToDelete;
    closeDeleteTournamentModal();
    if (id && currentUser.id) {
      window.LocalDatabaseService.deleteTournament(id, currentUser.id);
      loadTournaments();
      navigateTo('home');
      showToast('Tournament deleted');
    }
  });

  btnDeleteCurrentTournament?.addEventListener('click', () => {
    if (activeTournament) {
      openDeleteTournamentModal(activeTournament.id);
    }
  });

  // ========================================
  // REAL SUPABASE GOOGLE AUTHENTICATION
  // ========================================

  function setUserSession(supabaseUser) {
    if (!supabaseUser || !supabaseUser.id) {
      clearSession();
      return;
    }

    const metadata = supabaseUser.user_metadata || {};
    const fullName = metadata.full_name || metadata.name || supabaseUser.displayName || '';
    const email = supabaseUser.email || '';
    const avatar = metadata.avatar_url || metadata.picture || supabaseUser.avatarUrl || null;

    currentUser = {
      id: supabaseUser.id,
      email: email,
      displayName: fullName || (email ? email.split('@')[0] : 'Tournament Host'),
      avatarUrl: avatar,
      isAuthenticated: true,
    };
    window.currentUser = currentUser;

    console.log('LRD PointCalc: Authenticated User:', currentUser.email || currentUser.displayName, '| UID:', currentUser.id);

    renderUserProfile();
    loadTournaments();
    if (window.DesignManager) window.DesignManager.setUser(currentUser);

    if (loginErrorBanner) loginErrorBanner.classList.remove('show');
    dismissSplash();
    navigateTo('home');
  }

  function clearSession() {
    currentUser = {
      id: null,
      email: null,
      displayName: null,
      avatarUrl: null,
      isAuthenticated: false,
    };
    window.currentUser = currentUser;

    try {
      localStorage.removeItem('lrd_guest_user');
    } catch (e) {}

    tournaments = [];
    activeTournament = null;

    if (accountName) accountName.textContent = '';
    if (accountEmail) accountEmail.textContent = '';
    if (accountAvatarContainer) accountAvatarContainer.innerHTML = '<span class="profile-card__letter">?</span>';
    if (btnAvatarHome) btnAvatarHome.innerHTML = '<span class="avatar-btn__letter">?</span>';

    dismissSplash();
    navigateTo('login');
  }

  function checkUrlForAuthErrors() {
    const hash = window.location.hash;
    const search = window.location.search;

    if (hash.includes('error=') || search.includes('error=')) {
      console.warn('LRD PointCalc: OAuth error in callback:', hash || search);
      if (loginErrorBanner) {
        loginErrorBanner.textContent = 'Google sign-in failed. Please try again.';
        loginErrorBanner.classList.add('show');
      }
      try {
        window.history.replaceState(null, '', window.location.pathname);
      } catch (e) {}
      return true;
    }
    return false;
  }

  async function checkInitialSession() {
    const hasAuthError = checkUrlForAuthErrors();
    const supabase = window.LRD_CONFIG?.getClient();

    // 1. Development & test user fallback via query parameter
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get('demo') === '1' || searchParams.get('test_user') === '1' || searchParams.get('demo') === 'true') {
      setUserSession({
        id: 'usr_esports_lead_8829',
        email: 'esports@lrd.gg',
        displayName: 'LRD Esports Admin',
        user_metadata: { full_name: 'LRD Esports Admin', is_premium: false },
      });
      return;
    }

    // 2. Saved guest session in local storage
    try {
      const savedGuest = localStorage.getItem('lrd_guest_user');
      if (savedGuest) {
        const parsedGuest = JSON.parse(savedGuest);
        if (parsedGuest && parsedGuest.id) {
          setUserSession(parsedGuest);
          return;
        }
      }
    } catch (e) {
      console.warn('LRD PointCalc: Guest session read error:', e);
    }

    // 3. Supabase Auth Session
    if (supabase && !hasAuthError) {
      const hasAuthCode = window.location.search.includes('code=') || window.location.hash.includes('access_token=');

      if (hasAuthCode) {
        // Allow up to 2 seconds for Supabase PKCE / token exchange to finish
        for (let i = 0; i < 20; i++) {
          try {
            const { data } = await supabase.auth.getSession();
            if (data?.session?.user) {
              console.log('LRD PointCalc: OAuth code exchanged successfully for', data.session.user.email);
              setUserSession(data.session.user);
              try {
                window.history.replaceState(null, '', window.location.pathname);
              } catch (e) {}
              return;
            }
          } catch (codeErr) {
            console.warn('LRD PointCalc: Code check:', codeErr);
          }
          await new Promise((r) => setTimeout(r, 100));
        }
      } else {
        try {
          const { data, error } = await supabase.auth.getSession();
          if (error) console.warn('LRD PointCalc: Supabase getSession note:', error.message);

          if (data && data.session && data.session.user) {
            console.log('LRD PointCalc: Session restored for', data.session.user.email);
            setUserSession(data.session.user);
            return;
          }
        } catch (err) {
          console.warn('LRD PointCalc: Session check exception:', err);
        }
      }
    }

    clearSession();
  }

  function dismissSplash() {
    if (splashEl) {
      splashEl.classList.add('fade-out');
      setTimeout(() => {
        splashEl.style.display = 'none';
      }, 350);
    }
  }

  function setupSupabaseAuthListener() {
    const supabase = window.LRD_CONFIG?.getClient();
    if (!supabase) return;

    supabase.auth.onAuthStateChange((event, session) => {
      console.log('LRD PointCalc: Auth event:', event);
      switch (event) {
        case 'SIGNED_IN':
        case 'TOKEN_REFRESHED':
        case 'INITIAL_SESSION':
        case 'USER_UPDATED':
          if (session?.user) setUserSession(session.user);
          break;
        case 'SIGNED_OUT':
          clearSession();
          showToast('Signed out');
          break;
        default:
          break;
      }
    });
  }

  async function handleGoogleLogin() {
    if (loginErrorBanner) loginErrorBanner.classList.remove('show');
    const supabase = window.LRD_CONFIG?.getClient();

    if (!supabase || !window.LRD_CONFIG?.isConfigured()) {
      if (loginErrorBanner) {
        loginErrorBanner.textContent = 'Developer Notice: Supabase configuration missing in scripts/config.js.';
        loginErrorBanner.classList.add('show');
      }
      return;
    }

    try {
      btnGoogleLogin.disabled = true;
      btnGoogleLogin.style.opacity = '0.7';

      const redirectUrl = window.location.origin + window.location.pathname;

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            access_type: 'offline',
            prompt: 'select_account',
          },
        },
      });

      if (error) throw error;
      if (data?.url) window.location.href = data.url;
    } catch (err) {
      console.error('LRD PointCalc: Google OAuth failed:', err);
      btnGoogleLogin.disabled = false;
      btnGoogleLogin.style.opacity = '1';

      if (loginErrorBanner) {
        loginErrorBanner.textContent = 'Google sign-in failed. Please try again.';
        loginErrorBanner.classList.add('show');
      }
    }
  }

  function handleGuestLogin() {
    const guestUser = {
      id: 'usr_guest_' + Date.now().toString(36),
      email: 'organizer@local.device',
      displayName: 'Guest Organizer',
      user_metadata: { full_name: 'Guest Organizer' },
    };
    try {
      localStorage.setItem('lrd_guest_user', JSON.stringify(guestUser));
    } catch (e) {}
    setUserSession(guestUser);
    showToast('Logged in as Guest Organizer');
  }

  btnGoogleLogin?.addEventListener('click', handleGoogleLogin);
  btnGuestLogin?.addEventListener('click', handleGuestLogin);

  // Sign out confirmation
  function openSignoutModal() {
    modalSignout?.classList.add('open');
  }

  function closeSignoutModal() {
    modalSignout?.classList.remove('open');
  }

  btnCancelSignout?.addEventListener('click', closeSignoutModal);
  document.getElementById('menu-signout')?.addEventListener('click', openSignoutModal);

  btnConfirmSignout?.addEventListener('click', async () => {
    closeSignoutModal();
    const supabase = window.LRD_CONFIG?.getClient();
    if (supabase) {
      try {
        await supabase.auth.signOut();
      } catch (e) {
        console.warn('Sign out warning:', e);
      }
    }
    clearSession();
    showToast('Signed out successfully');
  });

  // Toast helper
  let toastTimeout = null;
  function showToast(message, duration = 2400) {
    if (!toastEl) return;
    clearTimeout(toastTimeout);
    toastEl.textContent = message;
    toastEl.classList.add('show');
    toastTimeout = setTimeout(() => {
      toastEl.classList.remove('show');
    }, duration);
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Placeholder rows
  [
    'menu-manage-devices',
    'menu-subscription',
    'menu-restore-subscription',
    'menu-themes',
    'menu-trash',
    'menu-email-support',
    'menu-rate',
    'menu-share',
    'menu-privacy',
    'menu-delete-account',
    'link-terms',
    'link-privacy',
  ].forEach((id) => {
    document.getElementById(id)?.addEventListener('click', (e) => {
      e.preventDefault();
      showToast('Coming soon');
    });
  });

  // App Initialization
  async function init() {
    try {
      if (appVersionEl) appVersionEl.textContent = `Version ${APP_VERSION}`;

      // Initialize Design Studio & Scanner modules gracefully
      try {
        window.TemplateEditor?.init();
        window.DesignManager?.init(currentUser);
        window.TeamSimulator?.init();
        window.AIScanner?.init();
      } catch (designInitErr) {
        console.warn('LRD PointCalc: Design/Scanner init note:', designInitErr);
      }

      // Expose navigation for simulator and scanner integration
      window.openTournamentDashboard = openTournamentDashboard;
      window.openTournamentTables = openTournamentTables;
      window.loadTournaments = loadTournaments;
      window.navigateTo = navigateTo;

      setupSupabaseAuthListener();
      await checkInitialSession();

      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('autoGuest') === '1' && !currentUser.isAuthenticated) {
        handleGuestLogin();
      }
      if (urlParams.get('screen')) {
        setTimeout(() => {
          const scr = urlParams.get('screen');
          if (scr === 'ai-scanner') {
            const tourn = resolveOrCreateActiveTournament();
            window.AIScanner?.open({ tournamentId: tourn ? tourn.id : null, ownerUserId: currentUser.id });
          } else {
            navigateTo(scr);
          }
        }, 350);
      }
    } catch (startupErr) {
      console.error('LRD PointCalc: Critical startup error:', startupErr);
      clearSession();
      dismissSplash();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
