/* ====================================================================
   LRD PointCalc — AI Result Scanner & Slot List Manager Module
   Full AI + Manual workflow matching PointCalc AI visual reference
   ==================================================================== */

(function (window) {
  'use strict';

  // Module state
  let currentMode = 'ai'; // 'ai' | 'manual'
  let activeTournamentId = null;
  let activeMatchId = null;
  let activeMatchNumber = 1;
  let activeMultiplier = 1;
  let currentOwnerId = null;

  // History stack for undo
  const historyStack = [];

  // Screenshot previews
  let lobbyScreenshot = null; // { file, previewUrl, name }
  const resultScreenshots = [null, null]; // [0] = Top/Screen 1, [1] = Bottom/Screen 2

  // Roster state
  let currentRoster = [];
  let rememberLobbyEnabled = true;

  // Track expanded team cards
  const expandedCards = new Set();

  /**
   * Escape HTML utility
   */
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Push state snapshot for Undo
   */
  function pushHistory() {
    if (historyStack.length > 20) historyStack.shift();
    historyStack.push(JSON.stringify(currentRoster));
  }

  /**
   * Undo last change
   */
  function undoLastChange() {
    if (historyStack.length === 0) return false;
    const prev = historyStack.pop();
    try {
      currentRoster = JSON.parse(prev);
      renderTeamsList();
      return true;
    } catch (e) {
      return false;
    }
  }

  // ==================================================================
  // INITIALIZATION & LIFECYCLE
  // ==================================================================
  const AIScanner = {
    init() {
      this.bindUI();
      console.log('LRD PointCalc: AIScanner module initialized.');
    },

    bindUI() {
      // Back button
      document.getElementById('scanner-btn-back')?.addEventListener('click', () => {
        this.close();
      });

      // Mode Switcher buttons
      document.getElementById('scanner-mode-ai')?.addEventListener('click', () => {
        this.switchMode('ai');
      });
      document.getElementById('scanner-mode-manual')?.addEventListener('click', () => {
        this.switchMode('manual');
      });

      // Remember Lobby switch
      const rememberSwitch = document.getElementById('scanner-remember-toggle');
      if (rememberSwitch) {
        rememberSwitch.checked = rememberLobbyEnabled;
        rememberSwitch.addEventListener('change', (e) => {
          rememberLobbyEnabled = e.target.checked;
        });
      }

      // Slot List selector
      document.getElementById('scanner-slotlist-select')?.addEventListener('change', (e) => {
        const selectedId = e.target.value;
        if (selectedId) {
          this.loadSlotList(selectedId);
        }
      });

      // Save Roster button
      document.getElementById('scanner-btn-save-roster')?.addEventListener('click', () => {
        this.promptSaveSlotList();
      });

      // Manage Saved Rosters button
      document.getElementById('scanner-btn-manage-roster')?.addEventListener('click', () => {
        this.openSlotListModal();
      });

      // Lobby Screenshot inputs
      const lobbyInput = document.getElementById('scanner-lobby-file-input');
      lobbyInput?.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (file) this.setLobbyScreenshot(file);
      });

      document.getElementById('scanner-btn-update-lobby')?.addEventListener('click', () => {
        lobbyInput?.click();
      });
      document.getElementById('scanner-thumb-lobby')?.addEventListener('click', () => {
        lobbyInput?.click();
      });
      document.getElementById('scanner-btn-del-lobby')?.addEventListener('click', () => {
        this.clearLobbyScreenshot();
      });

      // Result Screenshot 1 inputs
      const res1Input = document.getElementById('scanner-res1-file-input');
      res1Input?.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (file) this.setResultScreenshot(0, file);
      });
      document.getElementById('scanner-btn-update-res1')?.addEventListener('click', () => {
        res1Input?.click();
      });
      document.getElementById('scanner-thumb-res1')?.addEventListener('click', () => {
        res1Input?.click();
      });
      document.getElementById('scanner-btn-del-res1')?.addEventListener('click', () => {
        this.clearResultScreenshot(0);
      });

      // Result Screenshot 2 inputs
      const res2Input = document.getElementById('scanner-res2-file-input');
      res2Input?.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (file) this.setResultScreenshot(1, file);
      });
      document.getElementById('scanner-btn-update-res2')?.addEventListener('click', () => {
        res2Input?.click();
      });
      document.getElementById('scanner-thumb-res2')?.addEventListener('click', () => {
        res2Input?.click();
      });
      document.getElementById('scanner-btn-del-res2')?.addEventListener('click', () => {
        this.clearResultScreenshot(1);
      });

      // Main Upload All Screenshots button
      document.getElementById('scanner-btn-upload-all')?.addEventListener('click', () => {
        this.processAllScreenshots();
      });

      // Save Results button
      document.getElementById('scanner-btn-save-results')?.addEventListener('click', () => {
        this.confirmAndSaveResults();
      });

      // Recalculate button
      document.getElementById('scanner-btn-recalc')?.addEventListener('click', () => {
        this.recalculateAll();
        if (window.showToast) window.showToast('Points recalculated');
      });

      // Reset Overrides button
      document.getElementById('scanner-btn-reset-overrides')?.addEventListener('click', () => {
        this.resetAllOverrides();
      });

      // Add Team button
      document.getElementById('scanner-btn-add-team-slot')?.addEventListener('click', () => {
        this.addSlot();
      });

      // Tutorial play button
      document.getElementById('scanner-btn-tutorial')?.addEventListener('click', () => {
        if (window.showToast) {
          window.showToast('Quick Guide: 1. Add Lobby screenshot or select saved roster. 2. Add 2 result screenshots. 3. Tap Upload All Screenshots.');
        }
      });
    },

    /**
     * Open Scanner screen for a tournament and match
     */
    open({ tournamentId, matchNumber = 1, matchId = null, multiplier = 1, ownerUserId = null }) {
      activeTournamentId = tournamentId;
      activeMatchNumber = Number(matchNumber) || 1;
      activeMatchId = matchId;
      activeMultiplier = Number(multiplier) || 1;
      currentOwnerId = ownerUserId || (window.currentUser ? window.currentUser.id : null);

      // Populate header info
      const tournNameEl = document.getElementById('scanner-tournament-name');
      const badgeEl = document.getElementById('scanner-match-badge');
      if (tournNameEl && window.LocalDatabaseService) {
        const t = window.LocalDatabaseService.getTournamentById(tournamentId, currentOwnerId);
        tournNameEl.textContent = t ? t.name : 'Free Fire Tournament';
      }
      if (badgeEl) {
        badgeEl.textContent = `Match ${activeMatchNumber} • ${activeMultiplier}x`;
      }

      // Initialize or load roster
      this.initRosterForMatch();

      // Refresh saved slot list dropdown
      this.refreshSlotListsDropdown();

      // Show screen
      if (window.navigateTo) {
        window.navigateTo('ai-scanner');
      } else {
        document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
        document.getElementById('screen-ai-scanner')?.classList.add('active');
      }

      this.render();
    },

    close() {
      if (window.navigateTo) {
        window.navigateTo('tournament-dashboard');
      } else {
        document.getElementById('screen-ai-scanner')?.classList.remove('active');
      }
    },

    /**
     * Switch between AI Mode and Manual Mode without losing unsaved roster data
     */
    switchMode(mode) {
      if (mode !== 'ai' && mode !== 'manual') return;
      currentMode = mode;

      const aiBtn = document.getElementById('scanner-mode-ai');
      const manualBtn = document.getElementById('scanner-mode-manual');
      aiBtn?.classList.toggle('active', mode === 'ai');
      manualBtn?.classList.toggle('active', mode === 'manual');

      // Update bottom action buttons
      const uploadBtn = document.getElementById('scanner-btn-upload-all');
      const saveBtn = document.getElementById('scanner-btn-save-results');

      if (mode === 'ai') {
        if (uploadBtn) uploadBtn.style.display = 'flex';
        if (saveBtn) saveBtn.style.display = 'flex';
      } else {
        if (uploadBtn) uploadBtn.style.display = 'none';
        if (saveBtn) saveBtn.style.display = 'flex';
      }

      this.render();
      if (window.showToast) window.showToast(`Switched to ${mode === 'ai' ? 'AI' : 'Manual'} Mode`);
    },

    /**
     * Initialize roster from existing tournament teams or create default slots
     */
    initRosterForMatch() {
      historyStack.length = 0;
      currentRoster = [];

      if (window.LocalDatabaseService && activeTournamentId) {
        // If matchId has existing results, load them
        if (activeMatchId) {
          const results = window.LocalDatabaseService.getMatchResults(activeMatchId);
          const teamsWithPlayers = window.LocalDatabaseService.getTeamsWithPlayers(activeTournamentId);
          const resMap = new Map(results.map((r) => [r.team_id, r]));

          if (teamsWithPlayers.length > 0) {
            teamsWithPlayers.forEach((twp, idx) => {
              const res = resMap.get(twp.id);
              currentRoster.push({
                slot: idx + 1,
                teamId: twp.id,
                teamName: twp.name,
                players: (twp.players || []).map((p) => ({
                  id: p.id,
                  name: p.name,
                  kills: 0,
                })),
                teamKillsOverride: res ? res.kills : null,
                placement: res ? res.placement : (idx + 1),
                isRemoved: false,
              });
            });
            return;
          }
        }

        // Otherwise load registered teams from tournament
        const teamsWithPlayers = window.LocalDatabaseService.getTeamsWithPlayers(activeTournamentId);
        if (teamsWithPlayers.length > 0) {
          teamsWithPlayers.forEach((twp, idx) => {
            currentRoster.push({
              slot: idx + 1,
              teamId: twp.id,
              teamName: twp.name,
              players: (twp.players || []).map((p) => ({
                id: p.id,
                name: p.name,
                kills: 0,
              })),
              teamKillsOverride: null,
              placement: idx + 1,
              isRemoved: false,
            });
          });
          return;
        }
      }

      // Default 12 teams if no database records
      for (let i = 1; i <= 12; i++) {
        currentRoster.push({
          slot: i,
          teamId: `team_${i}`,
          teamName: `Team ${i}`,
          players: [
            { name: `Player ${i}-1`, kills: 0 },
            { name: `Player ${i}-2`, kills: 0 },
            { name: `Player ${i}-3`, kills: 0 },
            { name: `Player ${i}-4`, kills: 0 },
          ],
          teamKillsOverride: null,
          placement: i,
          isRemoved: false,
        });
      }
    },

    // ==================================================================
    // SCREENSHOT MANAGEMENT
    // ==================================================================
    setLobbyScreenshot(file) {
      if (lobbyScreenshot && lobbyScreenshot.previewUrl) {
        URL.revokeObjectURL(lobbyScreenshot.previewUrl);
      }
      const previewUrl = URL.createObjectURL(file);
      lobbyScreenshot = { file, previewUrl, name: file.name };
      this.updateScreenshotCardsUI();
    },

    clearLobbyScreenshot() {
      if (lobbyScreenshot && lobbyScreenshot.previewUrl) {
        URL.revokeObjectURL(lobbyScreenshot.previewUrl);
      }
      lobbyScreenshot = null;
      this.updateScreenshotCardsUI();
    },

    setResultScreenshot(index, file) {
      if (resultScreenshots[index] && resultScreenshots[index].previewUrl) {
        URL.revokeObjectURL(resultScreenshots[index].previewUrl);
      }
      const previewUrl = URL.createObjectURL(file);
      resultScreenshots[index] = { file, previewUrl, name: file.name };
      this.updateScreenshotCardsUI();
    },

    clearResultScreenshot(index) {
      if (resultScreenshots[index] && resultScreenshots[index].previewUrl) {
        URL.revokeObjectURL(resultScreenshots[index].previewUrl);
      }
      resultScreenshots[index] = null;
      this.updateScreenshotCardsUI();
    },

    updateScreenshotCardsUI() {
      // Lobby preview
      const lobbyThumb = document.getElementById('scanner-thumb-lobby');
      if (lobbyThumb) {
        if (lobbyScreenshot) {
          lobbyThumb.innerHTML = `
            <img src="${lobbyScreenshot.previewUrl}" class="scanner-preview-thumb-img" alt="Lobby Screenshot" />
            <span class="scanner-preview-slot-tag">Lobby 1-12</span>
          `;
        } else {
          lobbyThumb.innerHTML = `
            <div class="scanner-preview-empty">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              <span class="scanner-preview-empty-text">Add Lobby</span>
            </div>
            <span class="scanner-preview-slot-tag">Slots 1-12</span>
          `;
        }
      }

      // Result 1 preview
      const res1Thumb = document.getElementById('scanner-thumb-res1');
      if (res1Thumb) {
        if (resultScreenshots[0]) {
          res1Thumb.innerHTML = `
            <img src="${resultScreenshots[0].previewUrl}" class="scanner-preview-thumb-img" alt="Result 1" />
            <span class="scanner-preview-slot-tag">R1 (Top)</span>
          `;
        } else {
          res1Thumb.innerHTML = `
            <div class="scanner-preview-empty">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              <span class="scanner-preview-empty-text">Add Screen 1</span>
            </div>
            <span class="scanner-preview-slot-tag">R1 (Top)</span>
          `;
        }
      }

      // Result 2 preview
      const res2Thumb = document.getElementById('scanner-thumb-res2');
      if (res2Thumb) {
        if (resultScreenshots[1]) {
          res2Thumb.innerHTML = `
            <img src="${resultScreenshots[1].previewUrl}" class="scanner-preview-thumb-img" alt="Result 2" />
            <span class="scanner-preview-slot-tag">R2 (Bottom)</span>
          `;
        } else {
          res2Thumb.innerHTML = `
            <div class="scanner-preview-empty">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              <span class="scanner-preview-empty-text">Add Screen 2</span>
            </div>
            <span class="scanner-preview-slot-tag">R2 (Bottom)</span>
          `;
        }
      }
    },

    // ==================================================================
    // AI EXTRACTION EXECUTION
    // ==================================================================
    async processAllScreenshots() {
      const progressCard = document.getElementById('scanner-progress-card');
      const progressFill = document.getElementById('scanner-progress-fill');
      const progressPct = document.getElementById('scanner-progress-pct');
      const progressMsg = document.getElementById('scanner-progress-msg');
      const warningContainer = document.getElementById('scanner-warnings-container');

      if (warningContainer) warningContainer.innerHTML = '';
      if (progressCard) progressCard.style.display = 'block';

      const updateProgress = (pct, msg) => {
        if (progressFill) progressFill.style.width = `${pct}%`;
        if (progressPct) progressPct.textContent = `${pct}%`;
        if (progressMsg) progressMsg.textContent = msg;
      };

      try {
        pushHistory();
        const lobbyFile = lobbyScreenshot ? lobbyScreenshot.file : null;
        const validResFiles = resultScreenshots.filter((r) => r !== null).map((r) => r.file);

        if (!lobbyFile && validResFiles.length === 0) {
          throw new Error('Please upload either a lobby screenshot or result screenshot to scan.');
        }

        const AIService = window.AIService;
        if (!AIService) {
          throw new Error('AI Service is not loaded.');
        }

        const extraction = await AIService.extractFullMatchScreenshots(
          { lobbyFile, resultFiles: validResFiles },
          updateProgress
        );

        if (extraction && extraction.teams && extraction.teams.length > 0) {
          // Merge extraction into current roster while preserving teamIds
          extraction.teams.forEach((extTeam, idx) => {
            if (idx < currentRoster.length) {
              currentRoster[idx].teamName = extTeam.teamName || currentRoster[idx].teamName;
              if (extTeam.players && extTeam.players.length > 0) {
                currentRoster[idx].players = extTeam.players;
              }
              if (extTeam.placement) {
                currentRoster[idx].placement = extTeam.placement;
              }
              if (extTeam.teamKillsOverride !== null) {
                currentRoster[idx].teamKillsOverride = extTeam.teamKillsOverride;
              }
            } else {
              currentRoster.push(extTeam);
            }
          });

          // Show extraction warnings if any
          if (extraction.warnings && extraction.warnings.length > 0 && warningContainer) {
            warningContainer.innerHTML = `
              <div class="scanner-warning-box">
                <strong>Extraction Warnings (${extraction.warnings.length}):</strong>
                ${extraction.warnings.map((w) => `<div>• ${escapeHtml(w)}</div>`).join('')}
              </div>
            `;
          }

          if (rememberLobbyEnabled && lobbyFile) {
            this.autoSaveLobbyRoster();
          }

          this.recalculateAll();
          this.render();
          if (window.showToast) window.showToast('Screenshots extracted successfully!');
        }
      } catch (err) {
        console.error('AIScanner: Extraction error:', err);
        if (progressMsg) progressMsg.textContent = `Error: ${err.message}`;
        if (window.showToast) window.showToast(err.message);
      } finally {
        setTimeout(() => {
          if (progressCard) progressCard.style.display = 'none';
        }, 2000);
      }
    },

    // ==================================================================
    // SLOT & TEAM EDITING
    // ==================================================================
    updateTeamName(slotIndex, newName) {
      if (!currentRoster[slotIndex]) return;
      pushHistory();
      currentRoster[slotIndex].teamName = String(newName || '').trim();
      this.renderTeamsList();
    },

    updatePlayerKill(slotIndex, playerIndex, kills) {
      if (!currentRoster[slotIndex] || !currentRoster[slotIndex].players[playerIndex]) return;
      pushHistory();
      const numKills = Math.max(0, parseInt(kills, 10) || 0);
      currentRoster[slotIndex].players[playerIndex].kills = numKills;

      // If team override was active, keep it; otherwise recalculate total
      this.recalculateTeam(slotIndex);
      this.renderTeamCard(slotIndex);
    },

    overrideTeamKills(slotIndex, totalKills) {
      if (!currentRoster[slotIndex]) return;
      pushHistory();
      const num = Math.max(0, parseInt(totalKills, 10) || 0);
      currentRoster[slotIndex].teamKillsOverride = num;
      this.recalculateTeam(slotIndex);
      this.renderTeamCard(slotIndex);
    },

    resetTeamKillsOverride(slotIndex) {
      if (!currentRoster[slotIndex]) return;
      pushHistory();
      currentRoster[slotIndex].teamKillsOverride = null;
      this.recalculateTeam(slotIndex);
      this.renderTeamCard(slotIndex);
    },

    addPlayer(slotIndex, playerName = '') {
      if (!currentRoster[slotIndex]) return;
      pushHistory();
      const count = currentRoster[slotIndex].players.length + 1;
      currentRoster[slotIndex].players.push({
        id: `p_new_${Date.now()}_${count}`,
        name: playerName || `Player ${count}`,
        kills: 0,
      });
      this.recalculateTeam(slotIndex);
      this.renderTeamCard(slotIndex);
    },

    removePlayer(slotIndex, playerIndex) {
      if (!currentRoster[slotIndex] || !currentRoster[slotIndex].players[playerIndex]) return;
      pushHistory();
      currentRoster[slotIndex].players.splice(playerIndex, 1);
      this.recalculateTeam(slotIndex);
      this.renderTeamCard(slotIndex);
    },

    movePlayer(fromSlotIdx, playerIdx, toSlotIdx) {
      if (!currentRoster[fromSlotIdx] || !currentRoster[toSlotIdx]) return;
      if (fromSlotIdx === toSlotIdx) return;
      pushHistory();

      const [player] = currentRoster[fromSlotIdx].players.splice(playerIdx, 1);
      if (player) {
        currentRoster[toSlotIdx].players.push(player);
        this.recalculateTeam(fromSlotIdx);
        this.recalculateTeam(toSlotIdx);
        this.renderTeamsList();
      }
    },

    updatePlacement(slotIndex, placement) {
      if (!currentRoster[slotIndex]) return;
      pushHistory();
      currentRoster[slotIndex].placement = placement ? parseInt(placement, 10) : null;
      this.renderTeamsList();
    },

    removeTeamFromCalc(slotIndex) {
      if (!currentRoster[slotIndex]) return;
      pushHistory();
      currentRoster[slotIndex].isRemoved = !currentRoster[slotIndex].isRemoved;
      this.renderTeamsList();
    },

    addSlot() {
      pushHistory();
      const newSlotNum = currentRoster.length + 1;
      currentRoster.push({
        slot: newSlotNum,
        teamId: `team_custom_${Date.now()}`,
        teamName: `Team ${newSlotNum}`,
        players: [
          { name: `Player ${newSlotNum}-1`, kills: 0 },
          { name: `Player ${newSlotNum}-2`, kills: 0 },
        ],
        teamKillsOverride: null,
        placement: newSlotNum,
        isRemoved: false,
      });
      this.renderTeamsList();
    },

    // ==================================================================
    // SCORING ENGINE INTEGRATION
    // ==================================================================
    recalculateTeam(slotIndex) {
      const team = currentRoster[slotIndex];
      if (!team) return;

      if (team.teamKillsOverride !== null) {
        team.totalKills = Number(team.teamKillsOverride) || 0;
      } else {
        team.totalKills = (team.players || []).reduce((sum, p) => sum + (Number(p.kills) || 0), 0);
      }
    },

    recalculateAll() {
      currentRoster.forEach((_, idx) => this.recalculateTeam(idx));
    },

    getScoringBreakdown(team) {
      const ScoringEngine = window.ScoringEngine;
      let scoringCfg = null;
      if (window.LocalDatabaseService && activeTournamentId) {
        const t = window.LocalDatabaseService.getTournamentById(activeTournamentId, currentOwnerId);
        if (t) scoringCfg = t.scoring_config || t.scoring_system;
      }

      const place = Number(team.placement) || 0;
      const kills = Number(team.totalKills) || 0;

      if (ScoringEngine) {
        return ScoringEngine.calculateTeamPoints(place, kills, scoringCfg, activeMultiplier);
      }
      return {
        placement: place,
        kills,
        placementPoints: 0,
        killPoints: kills,
        multiplier: activeMultiplier,
        totalPoints: kills,
      };
    },

    /**
     * Check duplicate placements
     */
    getDuplicatePlacements() {
      const counts = {};
      currentRoster.forEach((t) => {
        if (!t.isRemoved && t.placement) {
          counts[t.placement] = (counts[t.placement] || 0) + 1;
        }
      });
      return Object.keys(counts).filter((p) => counts[p] > 1).map(Number);
    },

    // ==================================================================
    // SLOT LIST MANAGEMENT (SAVING & REUSING)
    // ==================================================================
    autoSaveLobbyRoster() {
      if (!window.LocalDatabaseService || !currentOwnerId) return;
      const name = `Auto Lobby - ${new Date().toLocaleDateString()}`;
      window.LocalDatabaseService.saveSlotList(currentOwnerId, {
        name,
        slots: currentRoster.map((s) => ({
          slot: s.slot,
          teamName: s.teamName,
          players: s.players.map((p) => p.name),
        })),
        tournament_id: activeTournamentId,
      });
      this.refreshSlotListsDropdown();
    },

    promptSaveSlotList() {
      const name = prompt('Enter a name for this slot list (e.g. "Friday Live Lobby"):');
      if (!name || !name.trim()) return;

      if (window.LocalDatabaseService && currentOwnerId) {
        const saved = window.LocalDatabaseService.saveSlotList(currentOwnerId, {
          name: name.trim(),
          slots: currentRoster.map((s) => ({
            slot: s.slot,
            teamName: s.teamName,
            players: s.players.map((p) => p.name),
          })),
          tournament_id: activeTournamentId,
        });
        this.refreshSlotListsDropdown();
        if (window.showToast) window.showToast(`Saved slot list: ${saved.name}`);
      }
    },

    loadSlotList(slotListId) {
      if (!window.LocalDatabaseService || !currentOwnerId) return;
      const sl = window.LocalDatabaseService.getSlotListById(slotListId, currentOwnerId);
      if (!sl || !Array.isArray(sl.slots)) return;

      pushHistory();
      currentRoster = sl.slots.map((s, idx) => ({
        slot: s.slot || (idx + 1),
        teamId: `team_sl_${s.slot || (idx + 1)}`,
        teamName: s.teamName || `Team ${s.slot || (idx + 1)}`,
        players: (s.players || []).map((p, pIdx) => ({
          name: typeof p === 'string' ? p : (p.name || `Player ${pIdx + 1}`),
          kills: 0,
        })),
        teamKillsOverride: null,
        placement: idx + 1,
        isRemoved: false,
      }));

      this.recalculateAll();
      this.renderTeamsList();
      if (window.showToast) window.showToast(`Loaded slot list "${sl.name}"`);
    },

    refreshSlotListsDropdown() {
      const select = document.getElementById('scanner-slotlist-select');
      if (!select || !window.LocalDatabaseService || !currentOwnerId) return;

      const lists = window.LocalDatabaseService.getSlotLists(currentOwnerId);
      select.innerHTML = '<option value="">-- Use Saved Slot List --</option>';

      lists.forEach((sl) => {
        const opt = document.createElement('option');
        opt.value = sl.id;
        opt.textContent = `${sl.name} (${sl.slots ? sl.slots.length : 0} slots)`;
        select.appendChild(opt);
      });
    },

    openSlotListModal() {
      const modal = document.getElementById('scanner-slotlist-modal');
      const listContainer = document.getElementById('scanner-slotlists-modal-list');
      if (!modal || !listContainer || !window.LocalDatabaseService || !currentOwnerId) return;

      const lists = window.LocalDatabaseService.getSlotLists(currentOwnerId);
      listContainer.innerHTML = '';

      if (lists.length === 0) {
        listContainer.innerHTML = '<div style="color: #94a3b8; padding: 12px; text-align: center;">No saved slot lists found.</div>';
      } else {
        lists.forEach((sl) => {
          const row = document.createElement('div');
          row.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 10px; border-bottom: 1px solid rgba(168, 85, 247, 0.2);';
          row.innerHTML = `
            <div>
              <div style="font-weight: 700; color: #ffffff;">${escapeHtml(sl.name)}</div>
              <div style="font-size: 11px; color: #94a3b8;">${sl.slots ? sl.slots.length : 0} slots • Updated ${new Date(sl.updated_at).toLocaleDateString()}</div>
            </div>
            <div style="display: flex; gap: 6px;">
              <button type="button" class="scanner-slotlist-btn" data-action="load" data-id="${sl.id}">Load</button>
              <button type="button" class="scanner-slotlist-btn" data-action="duplicate" data-id="${sl.id}">Duplicate</button>
              <button type="button" class="scanner-slotlist-btn" data-action="delete" data-id="${sl.id}" style="color: #f87171;">Delete</button>
            </div>
          `;

          row.querySelector('[data-action="load"]')?.addEventListener('click', () => {
            this.loadSlotList(sl.id);
            modal.classList.remove('open');
          });

          row.querySelector('[data-action="duplicate"]')?.addEventListener('click', () => {
            window.LocalDatabaseService.duplicateSlotList(sl.id, currentOwnerId);
            this.openSlotListModal();
            this.refreshSlotListsDropdown();
          });

          row.querySelector('[data-action="delete"]')?.addEventListener('click', () => {
            if (confirm(`Delete saved slot list "${sl.name}"?\n\nNote: This deletes only the saved roster template and will NOT affect existing tournament match results.`)) {
              window.LocalDatabaseService.deleteSlotList(sl.id, currentOwnerId);
              this.openSlotListModal();
              this.refreshSlotListsDropdown();
            }
          });

          listContainer.appendChild(row);
        });
      }

      modal.classList.add('open');
      document.getElementById('scanner-btn-close-sl-modal')?.addEventListener('click', () => {
        modal.classList.remove('open');
      });
    },

    // ==================================================================
    // SAVE RESULTS & TOURNAMENT INTEGRATION
    // ==================================================================
    confirmAndSaveResults() {
      const duplicates = this.getDuplicatePlacements();
      if (duplicates.length > 0) {
        if (!confirm(`Warning: Duplicate placements detected for rank(s) ${duplicates.join(', ')}. Do you want to proceed and save anyway?`)) {
          return;
        }
      }

      if (window.LocalDatabaseService && activeTournamentId) {
        // Ensure match exists or create one
        let matchId = activeMatchId;
        if (!matchId) {
          const newMatch = window.LocalDatabaseService.createMatch(
            activeTournamentId,
            activeMatchNumber,
            `Match ${activeMatchNumber}`,
            activeMultiplier
          );
          matchId = newMatch.id;
        }

        // Prepare entries for LocalDatabaseService
        const activeTeams = currentRoster.filter((t) => !t.isRemoved);
        const entries = activeTeams.map((t) => ({
          teamId: t.teamId,
          placement: Number(t.placement) || 0,
          kills: Number(t.totalKills) || 0,
        }));

        const t = window.LocalDatabaseService.getTournamentById(activeTournamentId, currentOwnerId);
        const scoringCfg = t ? (t.scoring_config || t.scoring_system) : null;

        // Save results strictly locally
        window.LocalDatabaseService.saveMatchResults(
          activeTournamentId,
          matchId,
          entries,
          scoringCfg,
          activeMultiplier
        );

        if (window.showToast) window.showToast('Match results saved successfully!');

        // Close scanner and open tournament tables / leaderboard
        this.close();
        if (window.openTournamentTables) {
          window.openTournamentTables(activeTournamentId);
        }
      }
    },

    // ==================================================================
    // RENDERING
    // ==================================================================
    render() {
      this.updateScreenshotCardsUI();
      this.recalculateAll();
      this.renderTeamsList();
    },

    renderTeamsList() {
      const container = document.getElementById('scanner-teams-list');
      if (!container) return;
      container.innerHTML = '';

      const duplicates = new Set(this.getDuplicatePlacements());

      currentRoster.forEach((team, slotIndex) => {
        const card = this.createTeamCardElement(team, slotIndex, duplicates);
        container.appendChild(card);
      });
    },

    renderTeamCard(slotIndex) {
      const container = document.getElementById('scanner-teams-list');
      if (!container) return;
      const oldCard = container.querySelector(`[data-slot-index="${slotIndex}"]`);
      if (!oldCard) return;

      const duplicates = new Set(this.getDuplicatePlacements());
      const newCard = this.createTeamCardElement(currentRoster[slotIndex], slotIndex, duplicates);
      container.replaceChild(newCard, oldCard);
    },

    createTeamCardElement(team, slotIndex, duplicatesSet) {
      const pts = this.getScoringBreakdown(team);
      const isExpanded = expandedCards.has(slotIndex);
      const hasDuplicatePlacement = duplicatesSet.has(Number(team.placement));

      const card = document.createElement('div');
      card.className = `scanner-team-card ${isExpanded ? 'expanded' : ''} ${team.isRemoved ? 'is-removed' : ''}`;
      card.dataset.slotIndex = slotIndex;

      // Placement badge class
      let placeClass = '';
      if (team.placement === 1) placeClass = 'place-1';
      else if (team.placement === 2) placeClass = 'place-2';
      else if (team.placement === 3) placeClass = 'place-3';

      const playerCountStr = `${(team.players || []).length} player${(team.players || []).length === 1 ? '' : 's'}`;

      card.innerHTML = `
        <div class="scanner-team-card-main">
          <div class="scanner-team-left">
            <span class="scanner-slot-num-badge">#${team.slot}</span>
            <div class="scanner-team-name-col">
              <span class="scanner-team-name-text">${escapeHtml(team.teamName)}</span>
              <span class="scanner-team-players-sub">${playerCountStr} • ${pts.totalPoints} pts</span>
            </div>
          </div>
          <div class="scanner-team-right">
            <span class="scanner-placement-pill ${placeClass} ${hasDuplicatePlacement ? 'has-warning' : ''}">
              ${team.placement ? `${team.placement}${this.getOrdinal(team.placement)}` : 'Unranked'}
            </span>
            <span class="scanner-kills-pill ${team.teamKillsOverride !== null ? 'is-manual-override' : ''}">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
              ${team.totalKills} Kills ${team.teamKillsOverride !== null ? '⚡' : ''}
            </span>
            <div class="scanner-edit-toggle-icon" title="Enter player kills">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            </div>
          </div>
        </div>

        <div class="scanner-inline-editor">
          <!-- Top Row: Team Name & Placement -->
          <div class="scanner-inline-row">
            <div class="scanner-field-group" style="flex: 2;">
              <label class="scanner-field-label">Team Name</label>
              <input type="text" class="scanner-input input-team-name" value="${escapeHtml(team.teamName)}" />
            </div>
            <div class="scanner-field-group" style="flex: 1;">
              <label class="scanner-field-label">Placement</label>
              <input type="number" class="scanner-input input-placement ${hasDuplicatePlacement ? 'has-warning' : ''}" min="1" max="48" value="${team.placement || ''}" placeholder="1" />
            </div>
          </div>

          <!-- Players Header -->
          <div class="scanner-players-header">
            <span class="scanner-players-heading">Individual Players & Kills (${(team.players || []).length})</span>
            <button type="button" class="scanner-btn-add-player">+ Add Player</button>
          </div>

          <!-- Player Rows -->
          <div class="scanner-players-container">
            ${(team.players || []).map((p, pIdx) => `
              <div class="scanner-player-row" data-player-idx="${pIdx}">
                <input type="text" class="scanner-player-name-input" value="${escapeHtml(p.name)}" placeholder="Player name" />
                <input type="number" class="scanner-player-kills-input" min="0" value="${p.kills || 0}" title="Kills" />
                <button type="button" class="scanner-player-del-btn" title="Remove player">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            `).join('')}
          </div>

          <!-- Team Override Banner if active -->
          ${team.teamKillsOverride !== null ? `
            <div class="scanner-override-banner">
              <span>⚡ Manual override active: Team total set to <strong>${team.teamKillsOverride}</strong></span>
              <button type="button" class="scanner-btn-reset-override">Reset to Sum (${team.players.reduce((sum, p) => sum + (Number(p.kills) || 0), 0)})</button>
            </div>
          ` : ''}

          <!-- Bottom Card Controls -->
          <div class="scanner-card-actions-row">
            <button type="button" class="scanner-btn-remove-team">
              ${team.isRemoved ? 'Restore to Calculation' : 'Remove from Match'}
            </button>
            <div style="font-size: 11px; color: #a855f7;">
              Points: <strong>${pts.placementPoints}</strong> plc + <strong>${pts.killPoints}</strong> k = <strong>${pts.totalPoints}</strong> total
            </div>
          </div>
        </div>
      `;

      // Header click toggles expand/collapse
      card.querySelector('.scanner-team-card-main')?.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        if (expandedCards.has(slotIndex)) {
          expandedCards.delete(slotIndex);
        } else {
          expandedCards.add(slotIndex);
        }
        card.classList.toggle('expanded');
      });

      // Team name change
      const nameInput = card.querySelector('.input-team-name');
      nameInput?.addEventListener('change', (e) => {
        this.updateTeamName(slotIndex, e.target.value);
      });

      // Placement change
      const placeInput = card.querySelector('.input-placement');
      placeInput?.addEventListener('change', (e) => {
        this.updatePlacement(slotIndex, e.target.value);
      });

      // Add player
      card.querySelector('.scanner-btn-add-player')?.addEventListener('click', () => {
        this.addPlayer(slotIndex);
      });

      // Player row changes
      card.querySelectorAll('.scanner-player-row').forEach((pRow) => {
        const pIdx = parseInt(pRow.dataset.playerIdx, 10);
        const pNameInp = pRow.querySelector('.scanner-player-name-input');
        const pKillsInp = pRow.querySelector('.scanner-player-kills-input');
        const pDelBtn = pRow.querySelector('.scanner-player-del-btn');

        pNameInp?.addEventListener('change', (e) => {
          if (team.players[pIdx]) {
            pushHistory();
            team.players[pIdx].name = e.target.value;
          }
        });

        pKillsInp?.addEventListener('input', (e) => {
          this.updatePlayerKill(slotIndex, pIdx, e.target.value);
        });

        pDelBtn?.addEventListener('click', () => {
          this.removePlayer(slotIndex, pIdx);
        });
      });

      // Reset override
      card.querySelector('.scanner-btn-reset-override')?.addEventListener('click', () => {
        this.resetTeamKillsOverride(slotIndex);
      });

      // Remove / Restore team
      card.querySelector('.scanner-btn-remove-team')?.addEventListener('click', () => {
        this.removeTeamFromCalc(slotIndex);
      });

      return card;
    },

    getOrdinal(n) {
      const s = ['th', 'st', 'nd', 'rd'];
      const v = n % 100;
      return s[(v - 20) % 10] || s[v] || s[0];
    },

    // Getters for testing
    getRoster() {
      return currentRoster;
    },

    setRoster(r) {
      currentRoster = r;
      this.recalculateAll();
    },

    getMode() {
      return currentMode;
    },
  };

  // Export
  window.AIScanner = AIScanner;
})(typeof window !== 'undefined' ? window : global);
