/* ====================================================================
   LRD PointCalc — AI Result Scanner & Slot List Manager Module
   Full Multi-Screenshot Upload + 12-Slot Review System
   Aesthetic: PointCalc AI Deep-Purple & Glowing Gradients
   Deterministic scoring single source of truth: ScoringEngine
   On-device local storage: LocalDatabaseService
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
  let returnScreen = 'tournament-dashboard';

  // Unified multi-screenshot uploads array
  // Each item: { id, file, previewUrl, name, size, category: 'slot_list'|'end_result'|'unknown', confidence: number, status: string }
  let uploadedScreenshots = [];

  // Exactly 12 slots roster state (Slots 01 to 12)
  // Each item: { slot: 1..12, teamName: string, players: Array<{id, name, kills}>, isActive: boolean, isCleared: boolean, source: string, status: 'verified'|'review'|'inactive' }
  let slots = [];

  // Unassigned players bucket (players where slot was not determinable)
  // Each item: { id, name, kills, source }
  let unassignedPlayers = [];

  // 12-slot Match End Results state (Slots 01 to 12)
  // Each item: { slot: 1..12, teamName: string, placement: number|null, teamKillsOverride: number|null, totalKills: number, isExcluded: boolean, warnings: string[] }
  let results = [];

  // Remember lobby roster preference
  let rememberLobbyEnabled = true;

  // Expanded card tracking for accordion behavior
  const expandedSlotCards = new Set();
  const expandedResultCards = new Set();

  // History stack for undo
  const historyStack = [];

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

  function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 KB';
    const kb = bytes / 1024;
    if (kb < 1024) return Math.round(kb) + ' KB';
    return (kb / 1024).toFixed(1) + ' MB';
  }

  function pushHistory() {
    if (historyStack.length > 20) historyStack.shift();
    historyStack.push(JSON.stringify({ slots, unassignedPlayers, results }));
  }

  // ==================================================================
  // INITIALIZATION & LIFECYCLE
  // ==================================================================
  const AIScanner = {
    init() {
      this.bindUI();
      console.log('LRD PointCalc: AIScanner unified 12-slot module initialized.');
    },

    bindUI() {
      // Header Back button
      document.getElementById('scanner-btn-back')?.addEventListener('click', () => {
        this.close();
      });

      // Mode Switcher buttons (AI vs Manual)
      document.getElementById('scanner-mode-ai')?.addEventListener('click', () => {
        this.switchMode('ai');
      });
      document.getElementById('scanner-mode-manual')?.addEventListener('click', () => {
        this.switchMode('manual');
      });

      // Tutorial banner click
      document.getElementById('scanner-btn-tutorial')?.addEventListener('click', () => {
        if (window.showToast) {
          window.showToast('Tutorial: 1. Upload lobby & result screenshots. 2. Verify roster. 3. Enter kills & placements. 4. Confirm & Save Results.');
        }
      });

      // Unified File input
      const unifiedFileInput = document.getElementById('scanner-unified-file-input');
      unifiedFileInput?.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
          this.addScreenshots(Array.from(e.target.files));
          e.target.value = ''; // reset so same files can be re-selected if desired
        }
      });

      // Sticky "Upload all screenshots" button (matching reference)
      document.getElementById('scanner-btn-ref-upload-all')?.addEventListener('click', () => {
        if (uploadedScreenshots.length === 0) {
          unifiedFileInput?.click();
        } else {
          this.processAllScreenshots();
        }
      });

      // "Enter player kills" action pill button
      document.getElementById('scanner-btn-enter-kills')?.addEventListener('click', () => {
        const panel = document.getElementById('scanner-player-kills-panel');
        if (panel) {
          const isVisible = panel.style.display !== 'none';
          panel.style.display = isVisible ? 'none' : 'block';
          if (!isVisible) {
            this.renderPlayerKillsPanel();
            panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
      });

      // Remember Lobby switch
      const rememberSwitch = document.getElementById('scanner-remember-toggle');
      if (rememberSwitch) {
        rememberSwitch.checked = rememberLobbyEnabled;
        rememberSwitch.addEventListener('change', (e) => {
          rememberLobbyEnabled = e.target.checked;
        });
      }

      // Saved Slot List selector
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

      // Action Bar: Review Next Issue
      document.getElementById('scanner-btn-review-next')?.addEventListener('click', () => {
        this.reviewNextUncertainItem();
      });

      // Action Bar: Reset Overrides
      document.getElementById('scanner-btn-reset-overrides')?.addEventListener('click', () => {
        this.resetAllOverrides();
      });

      // Action Bar: Recalculate Points
      document.getElementById('scanner-btn-recalc')?.addEventListener('click', () => {
        this.recalculateAll();
        if (window.showToast) window.showToast('Points recalculated by ScoringEngine');
      });

      // Action Bar: Confirm & Save Results
      document.getElementById('scanner-btn-save-results')?.addEventListener('click', () => {
        this.confirmAndSaveResults();
      });

      // Saved Slot Lists modal close
      document.getElementById('scanner-btn-close-sl-modal')?.addEventListener('click', () => {
        document.getElementById('scanner-slotlist-modal')?.classList.remove('open');
      });
    },

    /**
     * Open Scanner screen for a tournament and match
     */
    open({ tournamentId = null, matchNumber = 1, matchId = null, multiplier = 1, ownerUserId = null, returnScreen: retScr = null } = {}) {
      currentOwnerId = ownerUserId || (window.currentUser ? window.currentUser.id : null);
      returnScreen = retScr || 'tournament-dashboard';
      activeMatchNumber = Number(matchNumber) || 1;
      activeMultiplier = Number(multiplier) || 1;
      activeMatchId = matchId;

      // Resolve tournament
      if (tournamentId) {
        activeTournamentId = tournamentId;
      } else if (window.LocalDatabaseService && currentOwnerId) {
        const tourns = window.LocalDatabaseService.getTournaments(currentOwnerId);
        if (tourns && tourns.length > 0) {
          activeTournamentId = tourns[0].id;
        } else {
          // Auto-create a default tournament so user is never blocked
          const created = window.LocalDatabaseService.createTournament(currentOwnerId, {
            name: 'Free Fire Cup',
            game_mode: 'squad',
            team_count: 12,
            scoring_system: 'default',
          });
          activeTournamentId = created ? created.id : null;
        }
      }

      // Populate header badge
      const badgeEl = document.getElementById('scanner-match-badge');
      if (badgeEl) {
        badgeEl.textContent = `Match ${activeMatchNumber} • ${activeMultiplier}x`;
      }

      // Initialize exact 12 slots structure
      this.init12SlotsForMatch();

      // Refresh saved slot list dropdown
      this.refreshSlotListsDropdown();

      // Switch to screen
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
        window.navigateTo(returnScreen || 'tournament-dashboard');
      } else {
        document.getElementById('screen-ai-scanner')?.classList.remove('active');
      }
    },

    /**
     * Switch between AI Mode and Manual Mode
     */
    switchMode(mode) {
      if (mode !== 'ai' && mode !== 'manual') return;
      currentMode = mode;

      const aiBtn = document.getElementById('scanner-mode-ai');
      const manualBtn = document.getElementById('scanner-mode-manual');
      aiBtn?.classList.toggle('active', mode === 'ai');
      manualBtn?.classList.toggle('active', mode === 'manual');

      // In manual mode, hide the screenshot upload card
      const uploadCard = document.getElementById('scanner-card-unified-upload');
      if (uploadCard) {
        uploadCard.style.display = mode === 'manual' ? 'none' : 'block';
      }

      const analyzeBottomBtn = document.getElementById('scanner-btn-analyze-bottom');
      if (analyzeBottomBtn) {
        analyzeBottomBtn.style.display = mode === 'manual' ? 'none' : 'flex';
      }

      this.render();
      if (window.showToast) {
        window.showToast(`Switched to ${mode === 'ai' ? 'AI' : 'Manual'} Mode`);
      }
    },

    // ==================================================================
    // 12-SLOT ROSTER INITIALIZATION
    // ==================================================================
    init12SlotsForMatch() {
      historyStack.length = 0;
      slots = [];
      unassignedPlayers = [];
      results = [];

      let existingTeams = [];
      if (window.LocalDatabaseService && activeTournamentId) {
        existingTeams = window.LocalDatabaseService.getTeamsWithPlayers(activeTournamentId);
      }

      // Exactly 12 slots
      for (let i = 1; i <= 12; i++) {
        const team = existingTeams[i - 1];
        const teamName = team ? team.name : `Team ${i}`;
        const pList = team && Array.isArray(team.players)
          ? team.players.map((p) => ({ id: p.id || 'p_' + Math.random().toString(36).substr(2, 6), name: p.name, kills: 0 }))
          : [
              { id: 'p_' + Math.random().toString(36).substr(2, 6), name: `Player ${i}A`, kills: 0 },
              { id: 'p_' + Math.random().toString(36).substr(2, 6), name: `Player ${i}B`, kills: 0 },
              { id: 'p_' + Math.random().toString(36).substr(2, 6), name: `Player ${i}C`, kills: 0 },
              { id: 'p_' + Math.random().toString(36).substr(2, 6), name: `Player ${i}D`, kills: 0 },
            ];

        slots.push({
          slot: i,
          teamId: team ? team.id : null,
          teamName: teamName,
          players: pList,
          isActive: true,
          isCleared: false,
          source: team ? 'Tournament Roster' : 'Default',
          status: 'verified',
        });

        results.push({
          slot: i,
          teamId: team ? team.id : null,
          teamName: teamName,
          placement: i, // default seed
          teamKillsOverride: null,
          totalKills: 0,
          isExcluded: false,
          warnings: [],
        });
      }

      // Check if activeMatchId has existing saved results
      if (window.LocalDatabaseService && activeMatchId) {
        const savedResults = window.LocalDatabaseService.getMatchResults(activeMatchId);
        if (savedResults && savedResults.length > 0) {
          const resMap = new Map(savedResults.map((r) => [r.team_id, r]));
          results.forEach((r, idx) => {
            const team = existingTeams[idx];
            if (team && resMap.has(team.id)) {
              const sr = resMap.get(team.id);
              r.placement = sr.placement;
              r.teamKillsOverride = sr.kills;
              r.totalKills = sr.kills;
            }
          });
        }
      }

      this.recalculateAll();
    },

    // ==================================================================
    // MULTI-SCREENSHOT UNIFIED UPLOAD ENGINE
    // ==================================================================
    addScreenshots(files) {
      if (!Array.isArray(files) || files.length === 0) return;

      let addedCount = 0;
      files.forEach((file) => {
        // Prevent accidental duplicate file
        const isDuplicate = uploadedScreenshots.some(
          (s) => s.file.name === file.name && s.file.size === file.size
        );
        if (isDuplicate) return;

        // Validate format
        const val = window.AIService?.validateImageFile(file);
        if (val && !val.valid) {
          if (window.showToast) window.showToast(val.error);
          return;
        }

        // Automatic heuristic classification
        const classification = window.AIService?.classifyImageFile(file) || {
          category: 'unknown',
          confidence: 0.5,
        };

        const previewUrl = window.AIService?.createPreviewUrl(file) || URL.createObjectURL(file);

        uploadedScreenshots.push({
          id: 'ss_' + Math.random().toString(36).substr(2, 9),
          file,
          previewUrl,
          name: file.name,
          size: file.size,
          category: classification.category,
          confidence: classification.confidence,
          status: 'ready',
        });
        addedCount++;
      });

      if (addedCount > 0 && window.showToast) {
        window.showToast(`Added ${addedCount} screenshot${addedCount > 1 ? 's' : ''}`);
      }

      this.renderUnifiedUploads();
    },

    removeScreenshot(imgId) {
      const idx = uploadedScreenshots.findIndex((s) => s.id === imgId);
      if (idx !== -1) {
        const item = uploadedScreenshots[idx];
        if (item.previewUrl) window.AIService?.revokePreviewUrl(item.previewUrl);
        uploadedScreenshots.splice(idx, 1);
        this.renderUnifiedUploads();
      }
    },

    replaceScreenshot(imgId, newFile) {
      const idx = uploadedScreenshots.findIndex((s) => s.id === imgId);
      if (idx !== -1 && newFile) {
        const old = uploadedScreenshots[idx];
        if (old.previewUrl) window.AIService?.revokePreviewUrl(old.previewUrl);

        const classification = window.AIService?.classifyImageFile(newFile) || {
          category: 'unknown',
          confidence: 0.5,
        };
        const previewUrl = window.AIService?.createPreviewUrl(newFile) || URL.createObjectURL(newFile);

        uploadedScreenshots[idx] = {
          id: old.id,
          file: newFile,
          previewUrl,
          name: newFile.name,
          size: newFile.size,
          category: classification.category,
          confidence: classification.confidence,
          status: 'ready',
        };

        this.renderUnifiedUploads();
      }
    },

    clearAllScreenshots() {
      uploadedScreenshots.forEach((s) => {
        if (s.previewUrl) window.AIService?.revokePreviewUrl(s.previewUrl);
      });
      uploadedScreenshots = [];
      this.renderUnifiedUploads();
      if (window.showToast) window.showToast('Cleared all screenshots');
    },

    renderUnifiedUploads() {
      const container = document.getElementById('scanner-unified-thumbnails');
      const summaryBar = document.getElementById('scanner-upload-summary-bar');
      const countBadge = document.getElementById('scanner-unified-count-badge');
      const breakdownEl = document.getElementById('scanner-unified-breakdown');
      const clearBtn = document.getElementById('scanner-btn-clear-all');

      if (!container) return;
      container.innerHTML = '';

      if (uploadedScreenshots.length === 0) {
        if (summaryBar) summaryBar.style.display = 'none';
        if (clearBtn) clearBtn.style.display = 'none';
        return;
      }

      if (summaryBar) summaryBar.style.display = 'flex';
      if (clearBtn) clearBtn.style.display = 'inline-block';

      // Counts by category
      const slotCount = uploadedScreenshots.filter((s) => s.category === 'slot_list').length;
      const endCount = uploadedScreenshots.filter((s) => s.category === 'end_result').length;
      const unkCount = uploadedScreenshots.filter((s) => s.category === 'unknown').length;

      if (countBadge) {
        countBadge.textContent = `${uploadedScreenshots.length} Screenshot${uploadedScreenshots.length > 1 ? 's' : ''}`;
      }
      if (breakdownEl) {
        const parts = [];
        if (slotCount > 0) parts.push(`${slotCount} Slot List`);
        if (endCount > 0) parts.push(`${endCount} End Result`);
        if (unkCount > 0) parts.push(`${unkCount} Unknown`);
        breakdownEl.textContent = parts.join(' • ');
      }

      uploadedScreenshots.forEach((img) => {
        const card = document.createElement('div');
        card.className = 'scanner-thumb-card';
        card.innerHTML = `
          <div class="scanner-thumb-img-wrap">
            <img src="${img.previewUrl}" alt="${escapeHtml(img.name)}" class="scanner-thumb-img" />
            <button type="button" class="scanner-thumb-remove-btn" title="Remove" data-img-id="${img.id}">×</button>
            <span class="scanner-thumb-cat-badge scanner-cat-${img.category}">
              ${img.category === 'slot_list' ? 'Slot List' : (img.category === 'end_result' ? 'End Result' : 'Uncertain')}
            </span>
          </div>
          <div class="scanner-thumb-meta">
            <div class="scanner-thumb-filename" title="${escapeHtml(img.name)}">${escapeHtml(img.name)}</div>
            <div class="scanner-thumb-size">${formatFileSize(img.size)}</div>
            <div class="scanner-thumb-cat-select-wrap">
              <label class="scanner-thumb-cat-label">Type:</label>
              <select class="scanner-thumb-cat-select" data-img-id="${img.id}">
                <option value="slot_list" ${img.category === 'slot_list' ? 'selected' : ''}>Slot List</option>
                <option value="end_result" ${img.category === 'end_result' ? 'selected' : ''}>End Screenshot</option>
                <option value="unknown" ${img.category === 'unknown' ? 'selected' : ''}>Unknown</option>
              </select>
            </div>
          </div>
        `;

        // Category dropdown handler
        card.querySelector('.scanner-thumb-cat-select')?.addEventListener('change', (e) => {
          img.category = e.target.value;
          this.renderUnifiedUploads();
        });

        // Remove button handler
        card.querySelector('.scanner-thumb-remove-btn')?.addEventListener('click', () => {
          this.removeScreenshot(img.id);
        });

        container.appendChild(card);
      });
    },

    // ==================================================================
    // ANALYZE ALL SCREENSHOTS PIPELINE
    // ==================================================================
    async processAllScreenshots() {
      if (uploadedScreenshots.length === 0) {
        if (window.showToast) window.showToast('Please select at least 1 screenshot to analyze.');
        return;
      }

      // Filter by category
      const slotListFiles = uploadedScreenshots.filter((s) => s.category === 'slot_list').map((s) => s.file);
      const endResultFiles = uploadedScreenshots.filter((s) => s.category === 'end_result').map((s) => s.file);
      const unknownFiles = uploadedScreenshots.filter((s) => s.category === 'unknown');

      // If user hasn't categorized unknown images
      if (slotListFiles.length === 0 && endResultFiles.length === 0 && unknownFiles.length > 0) {
        if (window.showToast) {
          window.showToast('Please select category (Slot List or End Screenshot) on the uploaded images first.');
        }
        return;
      }

      pushHistory();

      // Show progress
      const progressCard = document.getElementById('scanner-progress-card');
      const progressPct = document.getElementById('scanner-progress-pct');
      const progressFill = document.getElementById('scanner-progress-fill');
      const progressMsg = document.getElementById('scanner-progress-msg');

      if (progressCard) progressCard.classList.add('active');

      const updateProgress = (pct, msg) => {
        if (progressPct) progressPct.textContent = `${pct}%`;
        if (progressFill) progressFill.style.width = `${pct}%`;
        if (progressMsg) progressMsg.textContent = msg;
      };

      try {
        updateProgress(15, 'Validating and categorizing screenshots...');

        // Run multi-screenshot extraction pipeline
        const outcome = await window.AIService.extract12SlotsAndResults(
          { slotListFiles, endResultFiles, existingSlots: slots },
          updateProgress
        );

        if (outcome && outcome.success) {
          slots = outcome.slots;
          unassignedPlayers = outcome.unassignedPlayers || [];
          results = outcome.results;

          // Render warnings
          this.renderWarnings(outcome.warnings || []);

          // Recalculate
          this.recalculateAll();

          // Render updated sections
          this.render();

          updateProgress(100, 'All screenshots analyzed successfully!');
          setTimeout(() => {
            if (progressCard) progressCard.classList.remove('active');
          }, 800);

          if (window.showToast) {
            window.showToast(`Analysis complete: 12 slots updated with ${results.length} results.`);
          }
        }
      } catch (err) {
        console.error('AIScanner: Analysis error:', err);
        if (progressCard) progressCard.classList.remove('active');
        if (window.showToast) window.showToast('Analysis encountered an issue: ' + err.message);
      }
    },

    // ==================================================================
    // 12-SLOT ROSTER EDITORS & ACTIONS
    // ==================================================================
    updateTeamName(slotIdx, newName) {
      if (slots[slotIdx]) {
        pushHistory();
        slots[slotIdx].teamName = newName.trim() || `Team ${slots[slotIdx].slot}`;
        if (results[slotIdx]) results[slotIdx].teamName = slots[slotIdx].teamName;
        this.renderStandingsPreview();
      }
    },

    updatePlayerName(slotIdx, playerIdx, newName) {
      if (slots[slotIdx] && slots[slotIdx].players[playerIdx]) {
        pushHistory();
        slots[slotIdx].players[playerIdx].name = newName.trim();
        this.render12ResultsList();
        this.renderStandingsPreview();
      }
    },

    addPlayer(slotIdx, playerName = '') {
      if (!slots[slotIdx]) return;
      pushHistory();
      const pCount = slots[slotIdx].players.length + 1;
      slots[slotIdx].players.push({
        id: 'p_' + Math.random().toString(36).substr(2, 6),
        name: playerName.trim() || `Player ${slots[slotIdx].slot}${String.fromCharCode(64 + pCount)}`,
        kills: 0,
      });
      this.recalculateTeam(slotIdx);
      this.render12SlotsList();
      this.render12ResultsList();
    },

    removePlayer(slotIdx, playerIdx) {
      if (!slots[slotIdx] || !slots[slotIdx].players[playerIdx]) return;
      pushHistory();
      slots[slotIdx].players.splice(playerIdx, 1);
      this.recalculateTeam(slotIdx);
      this.render12SlotsList();
      this.render12ResultsList();
    },

    movePlayer(fromSlotIdx, playerIdx, toSlotIdx) {
      if (!slots[fromSlotIdx] || !slots[toSlotIdx] || fromSlotIdx === toSlotIdx) return;
      const player = slots[fromSlotIdx].players[playerIdx];
      if (!player) return;

      pushHistory();
      slots[fromSlotIdx].players.splice(playerIdx, 1);
      slots[toSlotIdx].players.push(player);

      this.recalculateTeam(fromSlotIdx);
      this.recalculateTeam(toSlotIdx);
      this.render();
      if (window.showToast) {
        window.showToast(`Moved "${player.name}" to Slot ${slots[toSlotIdx].slot}`);
      }
    },

    clearSlot(slotIdx) {
      if (!slots[slotIdx]) return;
      pushHistory();
      slots[slotIdx].players = [];
      slots[slotIdx].isCleared = true;
      if (results[slotIdx]) {
        results[slotIdx].totalKills = 0;
        results[slotIdx].teamKillsOverride = null;
      }
      this.render();
      if (window.showToast) window.showToast(`Cleared Slot ${slots[slotIdx].slot}`);
    },

    toggleSlotActive(slotIdx) {
      if (!slots[slotIdx]) return;
      pushHistory();
      slots[slotIdx].isActive = !slots[slotIdx].isActive;
      if (results[slotIdx]) {
        results[slotIdx].isExcluded = !slots[slotIdx].isActive;
      }
      this.recalculateAll();
      this.render();
    },

    assignUnassignedPlayer(playerId, targetSlotIdx) {
      const idx = unassignedPlayers.findIndex((p) => p.id === playerId);
      if (idx === -1 || !slots[targetSlotIdx]) return;

      pushHistory();
      const p = unassignedPlayers.splice(idx, 1)[0];
      slots[targetSlotIdx].players.push({
        id: p.id,
        name: p.name,
        kills: Number(p.kills) || 0,
      });

      this.recalculateTeam(targetSlotIdx);
      this.render();
      if (window.showToast) {
        window.showToast(`Assigned "${p.name}" to Slot ${slots[targetSlotIdx].slot}`);
      }
    },

    // ==================================================================
    // MATCH END RESULTS EDITORS & ACTIONS
    // ==================================================================
    updatePlayerKill(slotIdx, playerIdx, kills) {
      if (!slots[slotIdx] || !slots[slotIdx].players[playerIdx]) return;
      pushHistory();
      slots[slotIdx].players[playerIdx].kills = Math.max(0, parseInt(kills, 10) || 0);

      // Reset team override if user directly edited player kill
      if (results[slotIdx]) {
        results[slotIdx].teamKillsOverride = null;
      }

      this.recalculateTeam(slotIdx);
      this.updateResultCardKillsDisplay(slotIdx);
      this.renderStandingsPreview();
    },

    overrideTeamKills(slotIdx, totalKills) {
      if (!results[slotIdx]) return;
      pushHistory();
      results[slotIdx].teamKillsOverride = Math.max(0, parseInt(totalKills, 10) || 0);
      results[slotIdx].totalKills = results[slotIdx].teamKillsOverride;

      this.recalculateTeam(slotIdx);
      this.updateResultCardKillsDisplay(slotIdx);
      this.renderStandingsPreview();
    },

    resetTeamKillsOverride(slotIdx) {
      if (!results[slotIdx]) return;
      pushHistory();
      results[slotIdx].teamKillsOverride = null;
      this.recalculateTeam(slotIdx);
      this.updateResultCardKillsDisplay(slotIdx);
      this.renderStandingsPreview();
    },

    resetAllOverrides() {
      pushHistory();
      results.forEach((r) => {
        r.teamKillsOverride = null;
      });
      this.recalculateAll();
      this.render12ResultsList();
      if (window.showToast) window.showToast('Reset all manual overrides to player kill sum');
    },

    updatePlacement(slotIdx, placement) {
      if (!results[slotIdx]) return;
      pushHistory();
      const p = placement ? Math.max(1, parseInt(placement, 10) || 1) : null;
      results[slotIdx].placement = p;

      this.checkPlacementDuplicates();
      this.recalculateAll();
      this.renderStandingsPreview();
    },

    toggleExcludeFromMatch(slotIdx) {
      if (!results[slotIdx]) return;
      pushHistory();
      results[slotIdx].isExcluded = !results[slotIdx].isExcluded;
      this.recalculateAll();
      this.render12ResultsList();
    },

    checkPlacementDuplicates() {
      const placementCount = new Map();
      results.forEach((r) => {
        if (r.placement && !r.isExcluded) {
          placementCount.set(r.placement, (placementCount.get(r.placement) || 0) + 1);
        }
      });

      results.forEach((r) => {
        r.warnings = r.warnings.filter((w) => !w.startsWith('Duplicate placement'));
        if (r.placement && placementCount.get(r.placement) > 1) {
          r.warnings.push(`Duplicate placement #${r.placement}`);
        }
      });
    },

    // ==================================================================
    // DETERMINISTIC SCORING ENGINE INTEGRATION
    // ==================================================================
    recalculateTeam(slotIdx) {
      const slot = slots[slotIdx];
      const res = results[slotIdx];
      if (!slot || !res) return;

      if (res.teamKillsOverride !== null) {
        res.totalKills = Number(res.teamKillsOverride) || 0;
      } else {
        res.totalKills = slot.players.reduce((sum, p) => sum + (Number(p.kills) || 0), 0);
      }
    },

    recalculateAll() {
      for (let i = 0; i < slots.length; i++) {
        this.recalculateTeam(i);
      }
      this.checkPlacementDuplicates();
      this.renderStandingsPreview();
    },

    getScoringBreakdown(resItem) {
      const Engine = window.ScoringEngine;
      const place = Number(resItem.placement) || 0;
      const kills = Number(resItem.totalKills) || 0;

      if (Engine && Engine.calculateTeamPoints) {
        return Engine.calculateTeamPoints(place, kills, null, activeMultiplier);
      }

      // Default fallback scoring
      const placePts = place === 1 ? 12 : place === 2 ? 9 : place === 3 ? 8 : Math.max(0, 11 - place);
      return {
        placement: place,
        kills,
        multiplier: activeMultiplier,
        placementPoints: Math.round(placePts * activeMultiplier),
        killPoints: Math.round(kills * activeMultiplier),
        totalPoints: Math.round((placePts + kills) * activeMultiplier),
      };
    },

    // ==================================================================
    // REVIEW NEXT ISSUE ACTION
    // ==================================================================
    reviewNextUncertainItem() {
      // 1. Check unassigned players
      if (unassignedPlayers.length > 0) {
        const unEl = document.getElementById('scanner-unassigned-section');
        if (unEl) {
          unEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          unEl.classList.add('pulse-highlight');
          setTimeout(() => unEl.classList.remove('pulse-highlight'), 1800);
          if (window.showToast) window.showToast('Please assign unassigned players.');
          return;
        }
      }

      // 2. Check for duplicate placements or warning in results
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        if (r.warnings && r.warnings.length > 0) {
          const cardEl = document.getElementById(`scanner-res-card-${i}`);
          if (cardEl) {
            cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            cardEl.classList.add('pulse-highlight');
            setTimeout(() => cardEl.classList.remove('pulse-highlight'), 1800);
            if (window.showToast) window.showToast(`Issue in Slot ${r.slot}: ${r.warnings[0]}`);
            return;
          }
        }
      }

      // 3. Check for empty or review-needed slots in roster
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i];
        if (s.status === 'review' || s.players.length === 0) {
          const cardEl = document.getElementById(`scanner-slot-card-${i}`);
          if (cardEl) {
            cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            cardEl.classList.add('pulse-highlight');
            setTimeout(() => cardEl.classList.remove('pulse-highlight'), 1800);
            if (window.showToast) window.showToast(`Slot ${s.slot} needs review.`);
            return;
          }
        }
      }

      if (window.showToast) window.showToast('All 12 slots are verified with no warnings!');
    },

    // ==================================================================
    // SAVED SLOT LISTS CRUD
    // ==================================================================
    refreshSlotListsDropdown() {
      const select = document.getElementById('scanner-slotlist-select');
      if (!select || !window.LocalDatabaseService || !currentOwnerId) return;

      const saved = window.LocalDatabaseService.getSlotLists(currentOwnerId);
      select.innerHTML = '<option value="">-- Use Saved Slot List --</option>';

      saved.forEach((sl) => {
        const opt = document.createElement('option');
        opt.value = sl.id;
        opt.textContent = `${sl.name} (${(sl.slots || []).length} slots)`;
        select.appendChild(opt);
      });
    },

    loadSlotList(slotListId) {
      if (!window.LocalDatabaseService || !currentOwnerId || !slotListId) return;
      const sl = window.LocalDatabaseService.getSlotListById(slotListId, currentOwnerId);
      if (!sl || !Array.isArray(sl.slots)) return;

      pushHistory();

      // Overwrite current 12 slots
      sl.slots.forEach((loadedSlot, idx) => {
        if (idx < 12 && slots[idx]) {
          slots[idx].teamName = loadedSlot.teamName || slots[idx].teamName;
          slots[idx].players = Array.isArray(loadedSlot.players)
            ? loadedSlot.players.map((p) => ({
                id: 'p_' + Math.random().toString(36).substr(2, 6),
                name: typeof p === 'string' ? p : p.name,
                kills: 0,
              }))
            : [];
          slots[idx].source = `Saved: ${sl.name}`;
          if (results[idx]) results[idx].teamName = slots[idx].teamName;
        }
      });

      this.recalculateAll();
      this.render();
      if (window.showToast) {
        window.showToast(`Loaded roster "${sl.name}" into current match.`);
      }
    },

    promptSaveSlotList() {
      const defaultName = `Roster Match ${activeMatchNumber}`;
      const name = window.prompt('Enter a name for this 12-slot roster:', defaultName);
      if (!name) return;

      if (window.LocalDatabaseService && currentOwnerId) {
        const saved = window.LocalDatabaseService.saveSlotList(currentOwnerId, {
          name: name.trim(),
          tournament_id: activeTournamentId,
          slots: slots.map((s) => ({
            slot: s.slot,
            teamName: s.teamName,
            players: s.players.map((p) => ({ name: p.name })),
          })),
        });

        if (saved) {
          this.refreshSlotListsDropdown();
          if (window.showToast) window.showToast(`Saved roster "${name}" successfully!`);
        }
      }
    },

    openSlotListModal() {
      const modal = document.getElementById('scanner-slotlist-modal');
      const listEl = document.getElementById('scanner-slotlists-modal-list');
      if (!modal || !listEl || !window.LocalDatabaseService || !currentOwnerId) return;

      const saved = window.LocalDatabaseService.getSlotLists(currentOwnerId);
      listEl.innerHTML = '';

      if (saved.length === 0) {
        listEl.innerHTML = '<div style="color: #94a3b8; font-size: 13px; text-align: center; padding: 20px;">No saved rosters found.</div>';
      } else {
        saved.forEach((sl) => {
          const item = document.createElement('div');
          item.className = 'scanner-slotlist-modal-item';
          item.innerHTML = `
            <div style="flex: 1;">
              <div style="font-weight: 700; color: #fff; font-size: 14px;">${escapeHtml(sl.name)}</div>
              <div style="font-size: 11px; color: #a855f7;">${(sl.slots || []).length} Slots • Saved ${new Date(sl.updated_at || sl.created_at).toLocaleDateString()}</div>
            </div>
            <div style="display: flex; gap: 6px;">
              <button type="button" class="scanner-btn-sm scanner-btn-use" data-sl-id="${sl.id}">Use</button>
              <button type="button" class="scanner-btn-sm scanner-btn-del" data-sl-id="${sl.id}">Delete</button>
            </div>
          `;

          item.querySelector('.scanner-btn-use')?.addEventListener('click', () => {
            this.loadSlotList(sl.id);
            modal.classList.remove('open');
          });

          item.querySelector('.scanner-btn-del')?.addEventListener('click', () => {
            if (confirm(`Delete saved roster "${sl.name}"?`)) {
              window.LocalDatabaseService.deleteSlotList(sl.id, currentOwnerId);
              this.refreshSlotListsDropdown();
              this.openSlotListModal();
            }
          });

          listEl.appendChild(item);
        });
      }

      modal.classList.add('open');
    },

    // ==================================================================
    // CONFIRM & SAVE MATCH RESULTS
    // ==================================================================
    confirmAndSaveResults() {
      if (!window.LocalDatabaseService || !activeTournamentId) {
        if (window.showToast) window.showToast('Please select or create a tournament first.');
        return;
      }

      // Check duplicates
      const dups = results.filter((r) => r.warnings.some((w) => w.startsWith('Duplicate')));
      if (dups.length > 0) {
        if (!confirm('There are duplicate placements detected. Do you want to save anyway?')) {
          this.reviewNextUncertainItem();
          return;
        }
      }

      // Auto-save roster if Remember Lobby is enabled
      if (rememberLobbyEnabled && currentOwnerId) {
        try {
          window.LocalDatabaseService.saveSlotList(currentOwnerId, {
            name: `Auto-saved Match ${activeMatchNumber}`,
            tournament_id: activeTournamentId,
            slots: slots.map((s) => ({
              slot: s.slot,
              teamName: s.teamName,
              players: s.players.map((p) => ({ name: p.name })),
            })),
          });
        } catch (e) {
          console.warn('Auto-save lobby error:', e);
        }
      }

      // Ensure match exists
      let matchId = activeMatchId;
      if (!matchId) {
        const createdMatch = window.LocalDatabaseService.createMatch(
          activeTournamentId,
          activeMatchNumber,
          `Match ${activeMatchNumber}`,
          activeMultiplier
        );
        matchId = createdMatch ? createdMatch.id : null;
      }

      if (!matchId) {
        if (window.showToast) window.showToast('Could not create match record.');
        return;
      }

      // Map results to tournament teams
      let tournTeams = window.LocalDatabaseService.getTeams(activeTournamentId);
      const teamEntries = [];

      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        const res = results[i];
        if (res.isExcluded) continue;

        // Find or create tournament team record
        let teamId = slot.teamId;
        if (!teamId) {
          const matchByName = tournTeams.find(
            (t) => t.name.toLowerCase().trim() === slot.teamName.toLowerCase().trim()
          );
          if (matchByName) {
            teamId = matchByName.id;
          } else {
            const newT = window.LocalDatabaseService.createTeam(activeTournamentId, slot.teamName, i + 1);
            teamId = newT ? newT.id : null;
            if (newT) tournTeams.push(newT);
          }
        }

        if (teamId) {
          teamEntries.push({
            teamId,
            placement: Number(res.placement) || i + 1,
            kills: Number(res.totalKills) || 0,
          });
        }
      }

      // Save match results in LocalDatabaseService
      const savedResults = window.LocalDatabaseService.saveMatchResults(
        activeTournamentId,
        matchId,
        teamEntries,
        null,
        activeMultiplier
      );

      if (window.showToast) {
        window.showToast(`Saved Match ${activeMatchNumber} with ${teamEntries.length} team results!`);
      }

      // Return to tournament dashboard or matches
      if (window.openTournamentTables && activeTournamentId) {
        window.openTournamentTables(activeTournamentId);
      } else {
        this.close();
      }
    },

    // ==================================================================
    // RENDER CONTROLLER
    // ==================================================================
    render() {
      this.renderUnifiedUploads();
      this.renderLobbyPreviews();
      this.renderResultsPreviews();
      this.renderCompactTeamResults();
      this.renderSlotJumpBar();
      this.renderUnassignedPlayers();
      this.render12SlotsList();
      this.renderStandingsPreview();
      this.updateUploadButtonLabel();
    },

    updateUploadButtonLabel() {
      const labelEl = document.getElementById('scanner-ref-upload-label');
      if (!labelEl) return;
      if (uploadedScreenshots.length === 0) {
        labelEl.textContent = 'Upload all screenshots';
      } else {
        labelEl.textContent = `Analyze ${uploadedScreenshots.length} Screenshot${uploadedScreenshots.length > 1 ? 's' : ''}`;
      }
    },

    renderWarnings(warningList) {
      const container = document.getElementById('scanner-warnings-container');
      if (!container) return;
      container.innerHTML = '';

      if (!warningList || warningList.length === 0) return;

      const banner = document.createElement('div');
      banner.className = 'scanner-warnings-banner';
      banner.innerHTML = `
        <div style="font-weight: 700; color: #fbbf24; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          Review Items (${warningList.length})
        </div>
        <ul style="margin: 0; padding-left: 18px; font-size: 12px; color: #e2e8f0; line-height: 1.5;">
          ${warningList.slice(0, 5).map((w) => `<li>${escapeHtml(w)}</li>`).join('')}
          ${warningList.length > 5 ? `<li>...and ${warningList.length - 5} more items</li>` : ''}
        </ul>
      `;
      container.appendChild(banner);
    },

    // Horizontal Lobby Previews matching reference screenshot
    renderLobbyPreviews() {
      const container = document.getElementById('scanner-lobby-previews');
      if (!container) return;
      container.innerHTML = '';

      const lobbyShots = uploadedScreenshots.filter((s) => s.category === 'slot_list');

      if (lobbyShots.length === 0) {
        // Render 2 reference preview cards (Slot 01, Slot 02) matching screenshot
        const ph1 = document.createElement('div');
        ph1.className = 'scanner-preview-card';
        ph1.innerHTML = `
          <div class="scanner-preview-img-wrap" title="Tap to upload lobby screenshot">
            <div class="scanner-preview-empty-tile">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
              </svg>
              <span>+ Add Lobby Screenshot</span>
            </div>
          </div>
          <div class="scanner-preview-footer">
            <span class="scanner-preview-slot-label">Slot 01</span>
            <div class="scanner-preview-footer-actions">
              <button type="button" class="scanner-preview-update-btn">Upload</button>
            </div>
          </div>
        `;
        ph1.querySelector('.scanner-preview-img-wrap')?.addEventListener('click', () => {
          document.getElementById('scanner-unified-file-input')?.click();
        });
        ph1.querySelector('.scanner-preview-update-btn')?.addEventListener('click', () => {
          document.getElementById('scanner-unified-file-input')?.click();
        });
        container.appendChild(ph1);

        const ph2 = document.createElement('div');
        ph2.className = 'scanner-preview-card';
        ph2.style.opacity = '0.65';
        ph2.innerHTML = `
          <div class="scanner-preview-img-wrap" title="Tap to upload lobby screenshot">
            <div class="scanner-preview-empty-tile">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              <span>Lobby Slot 02</span>
            </div>
          </div>
          <div class="scanner-preview-footer">
            <span class="scanner-preview-slot-label">Slot 02</span>
            <div class="scanner-preview-footer-actions">
              <button type="button" class="scanner-preview-update-btn">Upload</button>
            </div>
          </div>
        `;
        ph2.addEventListener('click', () => {
          document.getElementById('scanner-unified-file-input')?.click();
        });
        container.appendChild(ph2);
        return;
      }

      // Render actual uploaded lobby screenshots
      lobbyShots.forEach((img, idx) => {
        const card = document.createElement('div');
        card.className = 'scanner-preview-card';
        const slotLabel = `Slot ${String(idx + 1).padStart(2, '0')}`;
        card.innerHTML = `
          <div class="scanner-preview-img-wrap" title="Tap to replace">
            <img src="${img.previewUrl}" alt="${escapeHtml(img.name)}" class="scanner-preview-img" />
            <span class="scanner-preview-overlay-badge">Tap to update</span>
          </div>
          <div class="scanner-preview-footer">
            <span class="scanner-preview-slot-label">${slotLabel}</span>
            <div class="scanner-preview-footer-actions">
              <button type="button" class="scanner-preview-update-btn" data-img-id="${img.id}">Update</button>
              <button type="button" class="scanner-preview-del-btn" title="Delete" data-img-id="${img.id}">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
              </button>
            </div>
          </div>
        `;

        card.querySelector('.scanner-preview-img-wrap')?.addEventListener('click', () => {
          document.getElementById('scanner-unified-file-input')?.click();
        });
        card.querySelector('.scanner-preview-update-btn')?.addEventListener('click', () => {
          document.getElementById('scanner-unified-file-input')?.click();
        });
        card.querySelector('.scanner-preview-del-btn')?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.removeScreenshot(img.id);
        });

        container.appendChild(card);
      });

      // Add more tile at end of horizontal scroll
      const addTile = document.createElement('div');
      addTile.className = 'scanner-preview-add-tile';
      addTile.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        <span>+ Add</span>
      `;
      addTile.addEventListener('click', () => {
        document.getElementById('scanner-unified-file-input')?.click();
      });
      container.appendChild(addTile);
    },

    // Horizontal Result Previews matching reference screenshot
    renderResultsPreviews() {
      const container = document.getElementById('scanner-results-previews');
      if (!container) return;
      container.innerHTML = '';

      const resShots = uploadedScreenshots.filter((s) => s.category === 'end_result');

      if (resShots.length === 0) {
        const ph = document.createElement('div');
        ph.className = 'scanner-preview-card';
        ph.style.flex = '1 1 100%';
        ph.innerHTML = `
          <div class="scanner-preview-img-wrap" style="height: 72px;" title="Tap to upload result screenshot">
            <div class="scanner-preview-empty-tile" style="flex-direction: row; gap: 10px;">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
              </svg>
              <span>+ Add Match Result Screenshot</span>
            </div>
            <span class="scanner-preview-overlay-badge">Tap to update</span>
          </div>
        `;
        ph.addEventListener('click', () => {
          document.getElementById('scanner-unified-file-input')?.click();
        });
        container.appendChild(ph);
        return;
      }

      resShots.forEach((img, idx) => {
        const card = document.createElement('div');
        card.className = 'scanner-preview-card';
        card.style.flex = '1 1 100%';
        card.innerHTML = `
          <div class="scanner-preview-img-wrap" style="height: 80px;" title="Tap to replace">
            <img src="${img.previewUrl}" alt="${escapeHtml(img.name)}" class="scanner-preview-img" />
            <span class="scanner-preview-overlay-badge">Tap to update</span>
          </div>
          <div class="scanner-preview-footer">
            <span class="scanner-preview-slot-label">Result Screenshot ${idx + 1}</span>
            <div class="scanner-preview-footer-actions">
              <button type="button" class="scanner-preview-del-btn" title="Delete">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
              </button>
            </div>
          </div>
        `;
        card.querySelector('.scanner-preview-img-wrap')?.addEventListener('click', () => {
          document.getElementById('scanner-unified-file-input')?.click();
        });
        card.querySelector('.scanner-preview-del-btn')?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.removeScreenshot(img.id);
        });
        container.appendChild(card);
      });
    },

    // Compact Team Result Rows matching reference screenshot (e.g. 07, 7. TEAM FLUG, 19)
    renderCompactTeamResults() {
      const container = document.getElementById('scanner-compact-team-results');
      if (!container) return;
      container.innerHTML = '';

      // Display up to 6 prominent preview rows
      const displayResults = results.slice(0, 6);

      displayResults.forEach((res, idx) => {
        const slot = slots[idx];
        const slotNumStr = String(res.slot).padStart(2, '0');
        const teamName = slot ? slot.teamName : res.teamName || `Team ${res.slot}`;
        const kills = Number(res.totalKills) || 0;

        const row = document.createElement('div');
        row.className = 'scanner-ref-team-row';
        row.innerHTML = `
          <span class="scanner-ref-slot-pill">${slotNumStr}</span>
          <span class="scanner-ref-team-name">${escapeHtml(res.slot)}. ${escapeHtml(teamName)}</span>
          <span class="scanner-ref-kills-pill">${kills}</span>
        `;

        row.addEventListener('click', () => {
          const panel = document.getElementById('scanner-player-kills-panel');
          if (panel) {
            panel.style.display = 'block';
            this.renderPlayerKillsPanel(idx);
            panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        });

        container.appendChild(row);
      });
    },

    // Inline Player Kills Stepper Panel
    renderPlayerKillsPanel(focusSlotIdx = null) {
      const panel = document.getElementById('scanner-player-kills-panel');
      if (!panel) return;
      panel.innerHTML = `
        <div class="scanner-kills-panel-header">
          <span>✏️ Enter Individual Player Kills</span>
          <button type="button" class="icon-btn" id="scanner-btn-close-kills-panel" style="font-size: 16px; color: #cbd5e1; cursor: pointer;">✕</button>
        </div>
      `;

      panel.querySelector('#scanner-btn-close-kills-panel')?.addEventListener('click', () => {
        panel.style.display = 'none';
      });

      const slotsToRender = focusSlotIdx !== null ? [focusSlotIdx] : slots.map((_, i) => i);

      slotsToRender.forEach((slotIdx) => {
        const slot = slots[slotIdx];
        const res = results[slotIdx];
        if (!slot || !res) return;

        const group = document.createElement('div');
        group.className = 'scanner-kills-team-group';
        group.innerHTML = `
          <div class="scanner-kills-group-title">
            <span>Slot ${String(slot.slot).padStart(2, '0')} • ${escapeHtml(slot.teamName)}</span>
            <span class="scanner-ref-kills-pill">${res.totalKills} Kills</span>
          </div>
          <div class="scanner-kills-players-container">
            ${slot.players.map((p, pIdx) => `
              <div class="scanner-kills-player-row">
                <span class="scanner-kills-player-name">${pIdx + 1}. ${escapeHtml(p.name)}</span>
                <div class="scanner-kills-input-wrap">
                  <button type="button" class="scanner-kills-stepper-btn btn-minus" data-s-idx="${slotIdx}" data-p-idx="${pIdx}">−</button>
                  <input type="number" min="0" max="99" class="scanner-kills-num-input" value="${Number(p.kills) || 0}" data-s-idx="${slotIdx}" data-p-idx="${pIdx}" />
                  <button type="button" class="scanner-kills-stepper-btn btn-plus" data-s-idx="${slotIdx}" data-p-idx="${pIdx}">+</button>
                </div>
              </div>
            `).join('')}
          </div>
        `;

        group.querySelectorAll('.btn-minus').forEach((btn) => {
          btn.addEventListener('click', () => {
            const sIdx = parseInt(btn.dataset.sIdx, 10);
            const pIdx = parseInt(btn.dataset.pIdx, 10);
            const cur = Number(slots[sIdx].players[pIdx].kills) || 0;
            this.updatePlayerKill(sIdx, pIdx, Math.max(0, cur - 1));
            this.renderPlayerKillsPanel(focusSlotIdx);
          });
        });

        group.querySelectorAll('.btn-plus').forEach((btn) => {
          btn.addEventListener('click', () => {
            const sIdx = parseInt(btn.dataset.sIdx, 10);
            const pIdx = parseInt(btn.dataset.pIdx, 10);
            const cur = Number(slots[sIdx].players[pIdx].kills) || 0;
            this.updatePlayerKill(sIdx, pIdx, cur + 1);
            this.renderPlayerKillsPanel(focusSlotIdx);
          });
        });

        group.querySelectorAll('.scanner-kills-num-input').forEach((inp) => {
          inp.addEventListener('change', (e) => {
            const sIdx = parseInt(e.target.dataset.sIdx, 10);
            const pIdx = parseInt(e.target.dataset.pIdx, 10);
            this.updatePlayerKill(sIdx, pIdx, e.target.value);
            this.renderPlayerKillsPanel(focusSlotIdx);
          });
        });

        panel.appendChild(group);
      });
    },

    renderSlotJumpBar() {
      const bar = document.getElementById('scanner-slot-jump-bar');
      if (!bar) return;
      bar.innerHTML = '';

      for (let i = 0; i < 12; i++) {
        const slot = slots[i];
        const res = results[i];
        const hasWarning = res && res.warnings && res.warnings.length > 0;
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = `scanner-jump-chip ${hasWarning ? 'has-warning' : ''}`;
        chip.innerHTML = `
          <span>${String(i + 1).padStart(2, '0')}</span>
          ${hasWarning ? '<span class="jump-dot"></span>' : ''}
        `;
        chip.addEventListener('click', () => {
          const cardEl = document.getElementById(`scanner-slot-card-${i}`);
          if (cardEl) {
            cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            cardEl.classList.add('pulse-highlight');
            setTimeout(() => cardEl.classList.remove('pulse-highlight'), 1500);
          }
        });
        bar.appendChild(chip);
      }
    },

    renderUnassignedPlayers() {
      const section = document.getElementById('scanner-unassigned-section');
      const listEl = document.getElementById('scanner-unassigned-list');
      const countEl = document.getElementById('scanner-unassigned-count');

      if (!section || !listEl) return;
      listEl.innerHTML = '';

      if (unassignedPlayers.length === 0) {
        section.style.display = 'none';
        return;
      }

      section.style.display = 'block';
      if (countEl) countEl.textContent = `${unassignedPlayers.length} player${unassignedPlayers.length > 1 ? 's' : ''}`;

      unassignedPlayers.forEach((p) => {
        const chip = document.createElement('div');
        chip.className = 'scanner-unassigned-item';
        chip.innerHTML = `
          <span class="scanner-unassigned-name">${escapeHtml(p.name)}</span>
          <select class="scanner-assign-select" data-p-id="${p.id}">
            <option value="">Assign to Slot...</option>
            ${slots.map((s, idx) => `<option value="${idx}">Slot ${String(s.slot).padStart(2, '0')} (${escapeHtml(s.teamName)})</option>`).join('')}
          </select>
        `;

        chip.querySelector('.scanner-assign-select')?.addEventListener('change', (e) => {
          const targetSlotIdx = parseInt(e.target.value, 10);
          if (!isNaN(targetSlotIdx)) {
            this.assignUnassignedPlayer(p.id, targetSlotIdx);
          }
        });

        listEl.appendChild(chip);
      });
    },

    // Compact 12-Slot Review Cards matching Section 2 requirements
    render12SlotsList() {
      const container = document.getElementById('scanner-12slots-container');
      if (!container) return;
      container.innerHTML = '';

      slots.forEach((slot, slotIdx) => {
        const isExpanded = expandedSlotCards.has(slotIdx);
        const res = results[slotIdx];
        const pCount = slot.players.length;
        const playerNamesPreview = slot.players.map((p) => p.name).join(', ') || 'No players added';

        const card = document.createElement('div');
        card.className = `scanner-compact-slot-card ${slot.isActive ? '' : 'is-inactive'}`;
        card.id = `scanner-slot-card-${slotIdx}`;

        card.innerHTML = `
          <div class="scanner-compact-slot-header">
            <div class="scanner-compact-header-left">
              <span class="scanner-slot-num-badge">Slot ${String(slot.slot).padStart(2, '0')}</span>
              <span class="scanner-compact-team-title">${escapeHtml(slot.teamName)}</span>
            </div>
            <div class="scanner-compact-header-right">
              <span class="scanner-pcount-badge">${pCount}P</span>
              ${res ? `<span class="scanner-ref-kills-pill" style="font-size: 11px; padding: 2px 8px;">${res.totalKills}K</span>` : ''}
            </div>
          </div>

          <div class="scanner-compact-roster-preview" title="${escapeHtml(playerNamesPreview)}">
            ${escapeHtml(playerNamesPreview)}
          </div>

          <button type="button" class="scanner-btn-expand-slot" data-slot-idx="${slotIdx}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              ${isExpanded ? '<polyline points="18 15 12 9 6 15"/>' : '<polyline points="6 9 12 15 18 9"/>'}
            </svg>
            <span>${isExpanded ? 'Collapse' : 'Expand / Edit'}</span>
          </button>

          ${isExpanded ? `
            <div class="scanner-slot-expanded-body">
              <div class="scanner-team-name-row">
                <input type="text" class="team-name-inp" value="${escapeHtml(slot.teamName)}" placeholder="Team Name" data-slot-idx="${slotIdx}" />
              </div>

              <div class="scanner-players-list-edit" style="display: flex; flex-direction: column; gap: 6px;">
                ${slot.players.map((p, pIdx) => `
                  <div class="scanner-player-edit-row">
                    <span style="font-size: 11px; color: #94a3b8; width: 14px;">${pIdx + 1}.</span>
                    <input type="text" class="player-name-inp" value="${escapeHtml(p.name)}" placeholder="Player Name" data-slot-idx="${slotIdx}" data-p-idx="${pIdx}" />
                    <input type="number" min="0" class="player-kills-inp" value="${Number(p.kills) || 0}" title="Kills" data-slot-idx="${slotIdx}" data-p-idx="${pIdx}" />
                    <select class="player-move-sel" data-slot-idx="${slotIdx}" data-p-idx="${pIdx}">
                      <option value="">Move...</option>
                      ${slots.map((s, targetIdx) => targetIdx !== slotIdx ? `<option value="${targetIdx}">Slot ${String(s.slot).padStart(2, '0')}</option>` : '').join('')}
                    </select>
                    <button type="button" class="player-del-btn" title="Remove" data-slot-idx="${slotIdx}" data-p-idx="${pIdx}">×</button>
                  </div>
                `).join('')}
              </div>

              <div class="scanner-slot-actions-bar">
                <button type="button" class="scanner-btn-add-p" data-slot-idx="${slotIdx}">+ Add Player</button>
                <div style="display: flex; gap: 6px;">
                  <button type="button" class="scanner-btn-clear-slot" data-slot-idx="${slotIdx}">Clear Slot</button>
                  <button type="button" class="scanner-btn-toggle-active" data-slot-idx="${slotIdx}">
                    ${slot.isActive ? 'Mark Inactive' : 'Restore Slot'}
                  </button>
                </div>
              </div>
            </div>
          ` : ''}
        `;

        // Expand / Collapse toggle
        card.querySelector('.scanner-btn-expand-slot')?.addEventListener('click', () => {
          if (expandedSlotCards.has(slotIdx)) {
            expandedSlotCards.delete(slotIdx);
          } else {
            expandedSlotCards.add(slotIdx);
          }
          this.render12SlotsList();
        });

        // Team Name input change
        card.querySelector('.team-name-inp')?.addEventListener('change', (e) => {
          this.updateTeamName(slotIdx, e.target.value);
        });

        // Player Name input changes
        card.querySelectorAll('.player-name-inp').forEach((inp) => {
          inp.addEventListener('change', (e) => {
            const pIdx = parseInt(e.target.dataset.pIdx, 10);
            this.updatePlayerName(slotIdx, pIdx, e.target.value);
          });
        });

        // Player Kills input changes
        card.querySelectorAll('.player-kills-inp').forEach((inp) => {
          inp.addEventListener('change', (e) => {
            const pIdx = parseInt(e.target.dataset.pIdx, 10);
            this.updatePlayerKill(slotIdx, pIdx, e.target.value);
          });
        });

        // Move Player select
        card.querySelectorAll('.player-move-sel').forEach((sel) => {
          sel.addEventListener('change', (e) => {
            const pIdx = parseInt(e.target.dataset.pIdx, 10);
            const targetSlotIdx = parseInt(e.target.value, 10);
            if (!isNaN(targetSlotIdx)) {
              this.movePlayer(slotIdx, pIdx, targetSlotIdx);
            }
          });
        });

        // Remove Player button
        card.querySelectorAll('.player-del-btn').forEach((btn) => {
          btn.addEventListener('click', (e) => {
            const pIdx = parseInt(e.target.dataset.pIdx, 10);
            this.removePlayer(slotIdx, pIdx);
          });
        });

        // Add Player button
        card.querySelector('.scanner-btn-add-p')?.addEventListener('click', () => {
          this.addPlayer(slotIdx);
        });

        // Clear Slot button
        card.querySelector('.scanner-btn-clear-slot')?.addEventListener('click', () => {
          this.clearSlot(slotIdx);
        });

        // Toggle Active button
        card.querySelector('.scanner-btn-toggle-active')?.addEventListener('click', () => {
          this.toggleSlotActive(slotIdx);
        });

        container.appendChild(card);
      });
    },

    render12ResultsList() {
      this.renderCompactTeamResults();
      this.renderPlayerKillsPanel();
    },

    updateResultCardKillsDisplay(slotIdx) {
      this.renderCompactTeamResults();
      this.renderPlayerKillsPanel(slotIdx);
    },

    renderStandingsPreview() {
      const tbody = document.getElementById('scanner-standings-table-body');
      if (!tbody) return;
      tbody.innerHTML = '';

      // Compute scored entries
      const scoredList = results
        .filter((r) => !r.isExcluded)
        .map((r) => {
          const breakdown = this.getScoringBreakdown(r);
          return {
            slot: r.slot,
            teamName: r.teamName,
            placement: Number(r.placement) || 12,
            kills: Number(r.totalKills) || 0,
            placementPoints: breakdown.placementPoints,
            killPoints: breakdown.killPoints,
            multiplier: breakdown.multiplier,
            totalPoints: breakdown.totalPoints,
          };
        });

      // Sort deterministically by placement
      scoredList.sort((a, b) => {
        if (a.totalPoints !== b.totalPoints) return b.totalPoints - a.totalPoints;
        if (a.placementPoints !== b.placementPoints) return b.placementPoints - a.placementPoints;
        if (a.placement !== b.placement) return a.placement - b.placement;
        return b.killPoints - a.killPoints;
      });

      scoredList.forEach((row, rankIdx) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>#${rankIdx + 1}</strong></td>
          <td>Slot ${String(row.slot).padStart(2, '0')}</td>
          <td>${escapeHtml(row.teamName)}</td>
          <td>${row.placementPoints}</td>
          <td>${row.killPoints}</td>
          <td><strong class="scanner-pts-gold">${row.totalPoints}</strong></td>
        `;
        tbody.appendChild(tr);
      });
    },

    // ==================================================================
    // COMPATIBILITY & TESTING METHODS
    // ==================================================================
    setRoster(customRoster) {
      if (!Array.isArray(customRoster)) return;
      slots = [];
      results = [];
      customRoster.forEach((item, idx) => {
        const slotNum = item.slot || (idx + 1);
        const pList = Array.isArray(item.players)
          ? item.players.map((p) => ({
              id: p.id || 'p_' + Math.random().toString(36).substr(2, 6),
              name: p.name || `Player ${slotNum}`,
              kills: Number(p.kills) || 0,
            }))
          : [];

        slots.push({
          slot: slotNum,
          teamId: item.teamId || null,
          teamName: item.teamName || `Team ${slotNum}`,
          players: pList,
          isActive: item.isRemoved ? false : (item.isActive !== false),
          isCleared: false,
          source: 'Custom Roster',
          status: 'verified',
        });

        results.push({
          slot: slotNum,
          teamId: item.teamId || null,
          teamName: item.teamName || `Team ${slotNum}`,
          placement: item.placement !== undefined ? item.placement : (idx + 1),
          teamKillsOverride: item.teamKillsOverride !== undefined ? item.teamKillsOverride : null,
          totalKills: item.totalKills !== undefined ? Number(item.totalKills) : pList.reduce((sum, p) => sum + p.kills, 0),
          isExcluded: !!item.isRemoved,
          warnings: [],
        });
      });
      this.recalculateAll();
      this.render();
    },

    getRoster() {
      return slots.map((s, idx) => {
        const r = results[idx] || {};
        return {
          slot: s.slot,
          teamName: s.teamName,
          players: s.players,
          placement: r.placement,
          teamKillsOverride: r.teamKillsOverride,
          totalKills: r.totalKills,
          isRemoved: !!r.isExcluded,
        };
      });
    },

    removeTeamFromCalc(slotIdx) {
      if (results[slotIdx]) {
        results[slotIdx].isExcluded = !results[slotIdx].isExcluded;
        results[slotIdx].isRemoved = results[slotIdx].isExcluded;
        this.recalculateAll();
        this.render();
      }
    },

    getDuplicatePlacements() {
      const placementCount = new Map();
      results.forEach((r) => {
        if (r.placement && !r.isExcluded) {
          placementCount.set(r.placement, (placementCount.get(r.placement) || 0) + 1);
        }
      });
      const dupes = [];
      placementCount.forEach((count, place) => {
        if (count > 1) dupes.push(place);
      });
      return dupes;
    },

    getSlots() {
      return slots;
    },
    getResults() {
      return results;
    },
    getUnassigned() {
      return unassignedPlayers;
    },
    getUploadedScreenshots() {
      return uploadedScreenshots;
    },
    getMode() {
      return currentMode;
    },
  };

  // Export to global window
  window.AIScanner = AIScanner;
})(typeof window !== 'undefined' ? window : global);
