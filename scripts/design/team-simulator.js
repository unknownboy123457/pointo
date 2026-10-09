/* ====================================================================
   LRD PointCalc — Auto Team Simulator Module
   ====================================================================
   Generates teams automatically from player pools with configurable
   team sizing, naming, randomization, and skill-balancing.
   Integrates with LocalDatabaseService & existing tournament workflows.
   ==================================================================== */

(function (window) {
  'use strict';

  // ================================================================
  // SIMULATOR STATE
  // ================================================================
  let simState = {
    step: 'config',        // 'config' | 'preview' | 'generating' | 'confirm'
    // Tournament
    targetTournamentId: null,
    newTournamentName: '',
    isNewTournament: true,
    // Players
    totalPlayers: 0,
    playersPerTeam: 4,
    gameMode: 'squad',
    totalTeams: 0,
    // Naming
    namingMode: 'auto',    // 'auto' | 'prefix'
    customPrefix: 'Team',
    // Players list
    playerNames: [],
    // Randomization
    shuffle: true,
    seed: '',
    balanceSkill: false,
    // Generated results
    generatedTeams: [],
    // User context
    userId: null,
  };

  // Keep track of existing tournament for overwrite check
  let existingTournaments = [];

  // ================================================================
  // DOM REFERENCES (bound on init)
  // ================================================================
  let els = {};

  function bindElements() {
    els = {
      overlay: document.getElementById('modal-team-simulator'),
      closeBtn: document.getElementById('sim-close-btn'),
      // Config view
      configView: document.getElementById('sim-view-config'),
      previewView: document.getElementById('sim-view-preview'),
      generatingView: document.getElementById('sim-view-generating'),
      // Config fields
      tournSelect: document.getElementById('sim-tourn-select'),
      newTournToggle: document.getElementById('sim-new-tourn-toggle'),
      newTournForm: document.getElementById('sim-new-tourn-form'),
      newTournName: document.getElementById('sim-new-tourn-name'),
      inputPlayers: document.getElementById('sim-total-players'),
      selectMode: document.getElementById('sim-game-mode'),
      inputPerTeam: document.getElementById('sim-per-team'),
      calcTeamCount: document.getElementById('sim-calc-team-count'),
      calcTeamSub: document.getElementById('sim-calc-team-sub'),
      namingChips: document.getElementById('sim-naming-chips'),
      prefixInput: document.getElementById('sim-prefix-input'),
      prefixContainer: document.getElementById('sim-prefix-container'),
      namingPreview: document.getElementById('sim-naming-preview'),
      playerTextarea: document.getElementById('sim-player-names'),
      csvInput: document.getElementById('sim-csv-input'),
      importBtn: document.getElementById('sim-import-csv'),
      toggleShuffle: document.getElementById('sim-toggle-shuffle'),
      toggleBalance: document.getElementById('sim-toggle-balance'),
      seedInput: document.getElementById('sim-seed-input'),
      seedRandomize: document.getElementById('sim-seed-randomize'),
      errorBanner: document.getElementById('sim-error-banner'),
      // Footer
      btnGenerate: document.getElementById('sim-btn-generate'),
      btnBack: document.getElementById('sim-btn-back'),
      btnSave: document.getElementById('sim-btn-save'),
      btnRegenerate: document.getElementById('sim-btn-regenerate'),
      footerConfig: document.getElementById('sim-footer-config'),
      footerPreview: document.getElementById('sim-footer-preview'),
      // Preview
      previewTeamCount: document.getElementById('sim-preview-team-count'),
      previewPlayerCount: document.getElementById('sim-preview-player-count'),
      previewTeamSize: document.getElementById('sim-preview-team-size'),
      teamList: document.getElementById('sim-team-list'),
      warningBanner: document.getElementById('sim-uneven-warning'),
      warningText: document.getElementById('sim-warning-text'),
      // Confirm overlay
      confirmOverlay: document.getElementById('sim-confirm-overlay'),
      confirmTitle: document.getElementById('sim-confirm-title'),
      confirmDesc: document.getElementById('sim-confirm-desc'),
      btnConfirmYes: document.getElementById('sim-confirm-yes'),
      btnConfirmNo: document.getElementById('sim-confirm-no'),
    };
  }

  // ================================================================
  // INITIALIZATION
  // ================================================================
  function init() {
    bindElements();
    if (!els.overlay) return;
    attachEventListeners();
    console.log('TeamSimulator: Initialized');
  }

  // ================================================================
  // OPEN / CLOSE
  // ================================================================
  function open(userId) {
    if (!els.overlay) bindElements();
    if (!els.overlay) return;

    simState.userId = userId;
    resetState();
    loadExistingTournaments();
    updateConfigUI();
    showView('config');
    els.overlay.classList.add('open');
  }

  function close() {
    if (!els.overlay) return;
    els.overlay.classList.remove('open');
  }

  function resetState() {
    simState = {
      step: 'config',
      targetTournamentId: null,
      newTournamentName: '',
      isNewTournament: true,
      totalPlayers: 48,
      playersPerTeam: 4,
      gameMode: 'squad',
      totalTeams: 0,
      namingMode: 'auto',
      customPrefix: 'Team',
      playerNames: [],
      shuffle: true,
      seed: '',
      balanceSkill: false,
      generatedTeams: [],
      userId: simState.userId,
    };
    recalcTeamCount();
  }

  // ================================================================
  // EVENT LISTENERS
  // ================================================================
  function attachEventListeners() {
    // Close
    els.closeBtn?.addEventListener('click', close);
    els.overlay?.addEventListener('click', (e) => {
      if (e.target === els.overlay) close();
    });

    // Tournament selection
    els.newTournToggle?.addEventListener('click', () => {
      simState.isNewTournament = true;
      simState.targetTournamentId = null;
      els.newTournForm?.classList.add('open');
      highlightTournCards();
      els.newTournName?.focus();
    });

    // Player count input
    els.inputPlayers?.addEventListener('input', () => {
      simState.totalPlayers = Math.max(1, parseInt(els.inputPlayers.value, 10) || 0);
      recalcTeamCount();
      updateCalcDisplay();
    });

    // Game mode change
    els.selectMode?.addEventListener('change', () => {
      simState.gameMode = els.selectMode.value;
      const modeMap = { solo: 1, duo: 2, trio: 3, squad: 4 };
      simState.playersPerTeam = modeMap[simState.gameMode] || 4;
      if (els.inputPerTeam) els.inputPerTeam.value = simState.playersPerTeam;
      recalcTeamCount();
      updateCalcDisplay();
    });

    // Custom per-team count
    els.inputPerTeam?.addEventListener('input', () => {
      simState.playersPerTeam = Math.max(1, parseInt(els.inputPerTeam.value, 10) || 1);
      recalcTeamCount();
      updateCalcDisplay();
    });

    // Naming chips
    els.namingChips?.addEventListener('click', (e) => {
      const chip = e.target.closest('.sim-chip');
      if (!chip) return;
      simState.namingMode = chip.dataset.naming;
      els.namingChips.querySelectorAll('.sim-chip').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
      if (els.prefixContainer) {
        els.prefixContainer.style.display = simState.namingMode === 'prefix' ? 'block' : 'none';
      }
      updateNamingPreview();
    });

    // Prefix input
    els.prefixInput?.addEventListener('input', () => {
      simState.customPrefix = els.prefixInput.value.trim() || 'Team';
      updateNamingPreview();
    });

    // Player names textarea
    els.playerTextarea?.addEventListener('input', () => {
      parsePlayerNames();
      recalcTeamCount();
      updateCalcDisplay();
    });

    // CSV Import
    els.importBtn?.addEventListener('click', () => {
      els.csvInput?.click();
    });

    els.csvInput?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target.result;
        if (els.playerTextarea) {
          els.playerTextarea.value = text.replace(/,/g, '\n').replace(/;/g, '\n');
          parsePlayerNames();
          recalcTeamCount();
          updateCalcDisplay();
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });

    // Toggles
    els.toggleShuffle?.addEventListener('click', () => {
      simState.shuffle = !simState.shuffle;
      els.toggleShuffle.classList.toggle('active', simState.shuffle);
    });

    els.toggleBalance?.addEventListener('click', () => {
      simState.balanceSkill = !simState.balanceSkill;
      els.toggleBalance.classList.toggle('active', simState.balanceSkill);
    });

    // Seed
    els.seedRandomize?.addEventListener('click', () => {
      simState.seed = Math.random().toString(36).substr(2, 8);
      if (els.seedInput) els.seedInput.value = simState.seed;
    });

    els.seedInput?.addEventListener('input', () => {
      simState.seed = els.seedInput.value.trim();
    });

    // Footer buttons
    els.btnGenerate?.addEventListener('click', handleGenerate);
    els.btnBack?.addEventListener('click', () => showView('config'));
    els.btnSave?.addEventListener('click', handleSave);
    els.btnRegenerate?.addEventListener('click', handleRegenerate);

    // Confirm overlay
    els.btnConfirmNo?.addEventListener('click', () => {
      els.confirmOverlay?.classList.remove('open');
    });

    els.btnConfirmYes?.addEventListener('click', () => {
      els.confirmOverlay?.classList.remove('open');
      commitTeams();
    });
  }

  // ================================================================
  // LOAD EXISTING TOURNAMENTS
  // ================================================================
  function loadExistingTournaments() {
    const db = window.LocalDatabaseService;
    if (!db || !simState.userId) {
      existingTournaments = [];
      return;
    }
    existingTournaments = db.getTournaments(simState.userId);
    renderTournamentSelect();
  }

  function renderTournamentSelect() {
    if (!els.tournSelect) return;
    els.tournSelect.innerHTML = '';

    if (existingTournaments.length === 0) {
      els.tournSelect.innerHTML = '<div style="font-size: 12px; color: var(--text-muted, #888); padding: 8px;">No existing tournaments. A new one will be created.</div>';
      simState.isNewTournament = true;
      els.newTournForm?.classList.add('open');
      return;
    }

    existingTournaments.forEach((t) => {
      const card = document.createElement('div');
      card.className = 'sim-tourn-card';
      card.dataset.tournId = t.id;
      card.innerHTML = `
        <div class="sim-tourn-radio"></div>
        <div>
          <div class="sim-tourn-name">${escapeHtml(t.name)}</div>
          <div class="sim-tourn-meta">${t.team_count} teams · ${getGameModeLabel(t.game_mode)}</div>
        </div>
      `;
      card.addEventListener('click', () => {
        simState.isNewTournament = false;
        simState.targetTournamentId = t.id;
        simState.newTournamentName = '';
        els.newTournForm?.classList.remove('open');
        highlightTournCards();
      });
      els.tournSelect.appendChild(card);
    });
  }

  function highlightTournCards() {
    if (!els.tournSelect) return;
    els.tournSelect.querySelectorAll('.sim-tourn-card').forEach((card) => {
      card.classList.toggle('selected', card.dataset.tournId === simState.targetTournamentId && !simState.isNewTournament);
    });
  }

  // ================================================================
  // CONFIG UI UPDATES
  // ================================================================
  function updateConfigUI() {
    if (els.inputPlayers) els.inputPlayers.value = simState.totalPlayers;
    if (els.selectMode) els.selectMode.value = simState.gameMode;
    if (els.inputPerTeam) els.inputPerTeam.value = simState.playersPerTeam;
    if (els.toggleShuffle) els.toggleShuffle.classList.toggle('active', simState.shuffle);
    if (els.toggleBalance) els.toggleBalance.classList.toggle('active', simState.balanceSkill);
    if (els.prefixContainer) els.prefixContainer.style.display = simState.namingMode === 'prefix' ? 'block' : 'none';
    updateCalcDisplay();
    updateNamingPreview();
  }

  function recalcTeamCount() {
    const players = simState.totalPlayers;
    const perTeam = simState.playersPerTeam;
    if (perTeam > 0 && players > 0) {
      simState.totalTeams = Math.ceil(players / perTeam);
    } else {
      simState.totalTeams = 0;
    }
  }

  function updateCalcDisplay() {
    const remainder = simState.totalPlayers % simState.playersPerTeam;
    if (els.calcTeamCount) {
      els.calcTeamCount.textContent = `${simState.totalTeams} Teams`;
    }
    if (els.calcTeamSub) {
      if (remainder > 0) {
        els.calcTeamSub.textContent = `Last team will have ${remainder} player${remainder > 1 ? 's' : ''} (uneven)`;
      } else {
        els.calcTeamSub.textContent = `${simState.playersPerTeam} players per team, evenly distributed`;
      }
    }
    hideError();
  }

  function updateNamingPreview() {
    if (!els.namingPreview) return;
    els.namingPreview.innerHTML = '';

    const prefix = simState.namingMode === 'prefix' ? simState.customPrefix : 'Team';
    const samples = Math.min(4, simState.totalTeams || 3);
    for (let i = 1; i <= samples; i++) {
      const tag = document.createElement('span');
      tag.className = 'sim-naming-tag';
      tag.textContent = `${prefix} ${i}`;
      els.namingPreview.appendChild(tag);
    }
    if ((simState.totalTeams || 3) > 4) {
      const tag = document.createElement('span');
      tag.className = 'sim-naming-tag';
      tag.textContent = '...';
      els.namingPreview.appendChild(tag);
    }
  }

  // ================================================================
  // PLAYER NAME PARSING
  // ================================================================
  function parsePlayerNames() {
    const raw = els.playerTextarea?.value || '';
    if (!raw.trim()) {
      simState.playerNames = [];
      return;
    }
    // Split by newline, comma, semicolon, or tab
    const names = raw
      .split(/[\n,;\t]+/)
      .map((n) => n.trim())
      .filter((n) => n.length > 0);

    // Deduplicate
    const seen = new Set();
    simState.playerNames = [];
    names.forEach((name) => {
      const lower = name.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        simState.playerNames.push(name);
      }
    });

    // Auto-update player count if player names are provided
    if (simState.playerNames.length > 0) {
      simState.totalPlayers = simState.playerNames.length;
      if (els.inputPlayers) els.inputPlayers.value = simState.totalPlayers;
    }
  }

  // ================================================================
  // VIEW SWITCHING
  // ================================================================
  function showView(viewName) {
    simState.step = viewName;

    [els.configView, els.previewView, els.generatingView].forEach((v) => {
      if (v) v.classList.remove('active');
    });

    if (viewName === 'config') {
      els.configView?.classList.add('active');
      if (els.footerConfig) els.footerConfig.style.display = 'flex';
      if (els.footerPreview) els.footerPreview.style.display = 'none';
    } else if (viewName === 'preview') {
      els.previewView?.classList.add('active');
      if (els.footerConfig) els.footerConfig.style.display = 'none';
      if (els.footerPreview) els.footerPreview.style.display = 'flex';
    } else if (viewName === 'generating') {
      els.generatingView?.classList.add('active');
      if (els.footerConfig) els.footerConfig.style.display = 'none';
      if (els.footerPreview) els.footerPreview.style.display = 'none';
    }
  }

  // ================================================================
  // TEAM GENERATION LOGIC
  // ================================================================
  function handleGenerate() {
    if (!validateConfig()) return;

    showView('generating');

    // Simulate a short generation delay for premium feel
    setTimeout(() => {
      generateTeams();
      renderPreview();
      showView('preview');
    }, 800);
  }

  function handleRegenerate() {
    // Re-shuffle with new seed
    simState.seed = Math.random().toString(36).substr(2, 8);
    if (els.seedInput) els.seedInput.value = simState.seed;
    showView('generating');

    setTimeout(() => {
      generateTeams();
      renderPreview();
      showView('preview');
    }, 600);
  }

  function validateConfig() {
    hideError();

    if (simState.isNewTournament) {
      const name = els.newTournName?.value?.trim() || '';
      if (!name) {
        showError('Please enter a tournament name.');
        els.newTournName?.focus();
        return false;
      }
      simState.newTournamentName = name;
    } else if (!simState.targetTournamentId) {
      showError('Please select a tournament or create a new one.');
      return false;
    }

    if (simState.totalPlayers < 2) {
      showError('At least 2 players are required.');
      els.inputPlayers?.focus();
      return false;
    }

    if (simState.playersPerTeam < 1) {
      showError('Players per team must be at least 1.');
      return false;
    }

    if (simState.totalTeams < 2) {
      showError('At least 2 teams are needed.');
      return false;
    }

    if (simState.totalTeams > 48) {
      showError('Maximum 48 teams allowed.');
      return false;
    }

    return true;
  }

  function generateTeams() {
    const perTeam = simState.playersPerTeam;
    const totalTeams = simState.totalTeams;
    const prefix = simState.namingMode === 'prefix' ? simState.customPrefix : 'Team';

    // Build player pool
    let players = [];
    if (simState.playerNames.length > 0) {
      players = [...simState.playerNames];
    } else {
      // Generate generic player names
      for (let i = 1; i <= simState.totalPlayers; i++) {
        players.push(`Player ${i}`);
      }
    }

    // Shuffle using seeded random
    if (simState.shuffle) {
      const rng = createSeededRandom(simState.seed || String(Date.now()));
      shuffleArray(players, rng);
    }

    // Distribute players into teams
    const teams = [];
    let playerIdx = 0;

    for (let t = 0; t < totalTeams; t++) {
      const teamName = `${prefix} ${t + 1}`;
      const teamPlayers = [];

      for (let p = 0; p < perTeam && playerIdx < players.length; p++) {
        teamPlayers.push(players[playerIdx]);
        playerIdx++;
      }

      teams.push({
        name: teamName,
        players: teamPlayers,
      });
    }

    simState.generatedTeams = teams;
  }

  // Seeded PRNG (simple mulberry32)
  function createSeededRandom(seedStr) {
    let hash = 0;
    for (let i = 0; i < seedStr.length; i++) {
      hash = Math.imul(31, hash) + seedStr.charCodeAt(i) | 0;
    }
    return function () {
      hash |= 0;
      hash = hash + 0x6D2B79F5 | 0;
      let t = Math.imul(hash ^ hash >>> 15, 1 | hash);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function shuffleArray(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  // ================================================================
  // PREVIEW RENDERING
  // ================================================================
  function renderPreview() {
    const teams = simState.generatedTeams;
    const totalPlayers = teams.reduce((sum, t) => sum + t.players.length, 0);
    const isUneven = simState.totalPlayers % simState.playersPerTeam !== 0;

    if (els.previewTeamCount) els.previewTeamCount.textContent = teams.length;
    if (els.previewPlayerCount) els.previewPlayerCount.textContent = totalPlayers;
    if (els.previewTeamSize) els.previewTeamSize.textContent = simState.playersPerTeam;

    // Uneven warning
    if (els.warningBanner) {
      if (isUneven) {
        els.warningBanner.style.display = 'flex';
        const lastTeam = teams[teams.length - 1];
        if (els.warningText) {
          els.warningText.textContent = `"${lastTeam.name}" has ${lastTeam.players.length} player${lastTeam.players.length > 1 ? 's' : ''} instead of ${simState.playersPerTeam}. The team distribution is uneven.`;
        }
      } else {
        els.warningBanner.style.display = 'none';
      }
    }

    // Team list
    if (!els.teamList) return;
    els.teamList.innerHTML = '';

    teams.forEach((team, idx) => {
      const card = document.createElement('div');
      card.className = 'sim-team-card';

      const playerText = team.players.length > 0
        ? team.players.map(p => escapeHtml(p)).join(', ')
        : 'No players assigned';

      card.innerHTML = `
        <div class="sim-team-badge">${String(idx + 1).padStart(2, '0')}</div>
        <div class="sim-team-info">
          <input class="sim-team-name-input" value="${escapeHtml(team.name)}" data-team-idx="${idx}" />
          <div class="sim-team-players">${playerText}</div>
        </div>
        <div class="sim-team-size-badge">${team.players.length}P</div>
      `;

      // Editable team name
      const nameInput = card.querySelector('.sim-team-name-input');
      nameInput?.addEventListener('input', () => {
        simState.generatedTeams[idx].name = nameInput.value.trim() || `Team ${idx + 1}`;
      });

      els.teamList.appendChild(card);
    });
  }

  // ================================================================
  // SAVE / COMMIT
  // ================================================================
  function handleSave() {
    // Validate team names are unique
    const names = simState.generatedTeams.map((t) => t.name.toLowerCase());
    const unique = new Set(names);
    if (unique.size !== names.length) {
      showError('All team names must be unique. Please edit duplicate names.');
      showView('preview');
      return;
    }

    // Check if overwriting an existing tournament
    if (!simState.isNewTournament && simState.targetTournamentId) {
      const db = window.LocalDatabaseService;
      if (db) {
        const existing = db.getTeams(simState.targetTournamentId);
        if (existing.length > 0) {
          // Show confirmation overlay
          if (els.confirmTitle) {
            els.confirmTitle.textContent = 'Replace Existing Teams?';
          }
          if (els.confirmDesc) {
            els.confirmDesc.textContent = `This tournament already has ${existing.length} teams. Generating new teams will replace them. Match results will be preserved but may reference old team IDs.`;
          }
          els.confirmOverlay?.classList.add('open');
          return;
        }
      }
    }

    commitTeams();
  }

  function commitTeams() {
    const db = window.LocalDatabaseService;
    if (!db) {
      showError('Database not available.');
      return;
    }

    let tournamentId;

    if (simState.isNewTournament) {
      // Create new tournament with generated teams
      const teamsData = simState.generatedTeams.map((t) => ({
        name: t.name,
        players: t.players,
      }));

      const tournament = db.createTournament(simState.userId, {
        name: simState.newTournamentName,
        team_count: teamsData.length,
        game_mode: simState.gameMode,
        scoring_system: 'default',
        teamsData,
      });

      if (!tournament) {
        showError('Failed to create tournament.');
        return;
      }

      tournamentId = tournament.id;
      showToast(`"${tournament.name}" created with ${teamsData.length} teams!`);
    } else {
      tournamentId = simState.targetTournamentId;

      // Delete existing teams first
      const existingTeams = db.getTeams(tournamentId);
      if (existingTeams.length > 0) {
        // Remove old teams and players from storage
        const allTeams = JSON.parse(localStorage.getItem('lrd_local_teams') || '[]');
        const allPlayers = JSON.parse(localStorage.getItem('lrd_local_players') || '[]');

        const oldTeamIds = new Set(existingTeams.map(t => t.id));
        const filteredTeams = allTeams.filter(t => !oldTeamIds.has(t.id));
        const filteredPlayers = allPlayers.filter(p => !oldTeamIds.has(p.team_id));

        localStorage.setItem('lrd_local_teams', JSON.stringify(filteredTeams));
        localStorage.setItem('lrd_local_players', JSON.stringify(filteredPlayers));
      }

      // Add new teams
      const now = new Date().toISOString();
      const newTeams = JSON.parse(localStorage.getItem('lrd_local_teams') || '[]');
      const newPlayers = JSON.parse(localStorage.getItem('lrd_local_players') || '[]');

      simState.generatedTeams.forEach((team) => {
        const teamId = `team_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 6)}`;
        newTeams.push({
          id: teamId,
          tournament_id: tournamentId,
          owner_user_id: simState.userId,
          name: team.name,
          created_at: now,
          updated_at: now,
        });

        team.players.forEach((pName) => {
          if (pName && pName.trim()) {
            newPlayers.push({
              id: `player_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 6)}`,
              tournament_id: tournamentId,
              team_id: teamId,
              owner_user_id: simState.userId,
              name: pName.trim(),
              created_at: now,
              updated_at: now,
            });
          }
        });
      });

      localStorage.setItem('lrd_local_teams', JSON.stringify(newTeams));
      localStorage.setItem('lrd_local_players', JSON.stringify(newPlayers));

      // Update tournament team_count
      db.updateTournament(tournamentId, simState.userId, {
        team_count: simState.generatedTeams.length,
        game_mode: simState.gameMode,
      });

      showToast(`${simState.generatedTeams.length} teams generated and saved!`);
    }

    close();

    // Navigate to tournament dashboard if available
    if (window.openTournamentDashboard) {
      window.openTournamentDashboard(tournamentId);
    }
    // Refresh tournament list
    if (window.loadTournaments) {
      window.loadTournaments();
    }
  }

  // ================================================================
  // HELPERS
  // ================================================================
  function showError(msg) {
    if (els.errorBanner) {
      els.errorBanner.textContent = msg;
      els.errorBanner.classList.add('show');
    }
  }

  function hideError() {
    if (els.errorBanner) {
      els.errorBanner.classList.remove('show');
    }
  }

  function showToast(msg) {
    const toastEl = document.getElementById('toast');
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    setTimeout(() => toastEl.classList.remove('show'), 2400);
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function getGameModeLabel(mode) {
    const labels = { solo: 'Solo', duo: 'Duo', trio: 'Trio', squad: 'Squad' };
    return labels[mode] || mode;
  }

  // ================================================================
  // EXPORTS
  // ================================================================
  const TeamSimulator = {
    init,
    open,
    close,
  };

  window.TeamSimulator = TeamSimulator;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = TeamSimulator;
  }
})(typeof window !== 'undefined' ? window : global);
