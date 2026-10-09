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

      // Tutorial play button
      document.getElementById('scanner-btn-tutorial')?.addEventListener('click', () => {
        if (window.showToast) {
          window.showToast('Guide: 1. Upload screenshots. 2. Verify categories. 3. Tap Analyze. 4. Review 12 slots & points. 5. Confirm & Save.');
        }
      });

      // Unified File input & Dropzone
      const unifiedFileInput = document.getElementById('scanner-unified-file-input');
      unifiedFileInput?.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
          this.addScreenshots(Array.from(e.target.files));
          e.target.value = ''; // reset so same files can be re-selected if desired
        }
      });

      document.getElementById('scanner-btn-add-screenshots')?.addEventListener('click', () => {
        unifiedFileInput?.click();
      });
      document.getElementById('scanner-btn-add-more')?.addEventListener('click', () => {
        unifiedFileInput?.click();
      });

      document.getElementById('scanner-btn-clear-all')?.addEventListener('click', () => {
        this.clearAllScreenshots();
      });

      // Drag and drop on unified dropzone
      const dropzone = document.getElementById('scanner-unified-dropzone');
      if (dropzone) {
        ['dragenter', 'dragover'].forEach((evName) => {
          dropzone.addEventListener(evName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.add('drag-active');
          });
        });

        ['dragleave', 'drop'].forEach((evName) => {
          dropzone.addEventListener(evName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.remove('drag-active');
          });
        });

        dropzone.addEventListener('drop', (e) => {
          if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            this.addScreenshots(Array.from(e.dataTransfer.files));
          }
        });
      }

      // Analyze All Screenshots CTA buttons
      document.getElementById('scanner-btn-analyze-all')?.addEventListener('click', () => {
        this.processAllScreenshots();
      });
      document.getElementById('scanner-btn-analyze-bottom')?.addEventListener('click', () => {
        this.processAllScreenshots();
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
      this.renderSlotJumpBar();
      this.renderUnassignedPlayers();
      this.render12SlotsList();
      this.render12ResultsList();
      this.renderStandingsPreview();
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

    render12SlotsList() {
      const container = document.getElementById('scanner-12slots-container');
      if (!container) return;
      container.innerHTML = '';

      slots.forEach((slot, slotIdx) => {
        const isExpanded = expandedSlotCards.has(slotIdx) || slotIdx === 0; // first card expanded by default
        const pCount = slot.players.length;

        const card = document.createElement('div');
        card.className = `scanner-12slot-card ${slot.isActive ? '' : 'is-inactive'} ${isExpanded ? 'is-expanded' : ''}`;
        card.id = `scanner-slot-card-${slotIdx}`;

        card.innerHTML = `
          <div class="scanner-12slot-header" data-slot-idx="${slotIdx}">
            <div class="scanner-12slot-header-left">
              <span class="scanner-slot-badge">Slot ${String(slot.slot).padStart(2, '0')}</span>
              <input type="text" class="scanner-team-name-input" value="${escapeHtml(slot.teamName)}" placeholder="Team Name" data-slot-idx="${slotIdx}" />
            </div>
            <div class="scanner-12slot-header-right">
              <span class="scanner-slot-count-badge">${pCount}P</span>
              <button type="button" class="scanner-collapse-toggle-btn" aria-label="Toggle details">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
            </div>
          </div>

          <div class="scanner-12slot-body" style="display: ${isExpanded ? 'block' : 'none'};">
            <div class="scanner-players-list" id="scanner-players-list-${slotIdx}">
              ${slot.players.map((p, pIdx) => `
                <div class="scanner-player-row">
                  <span class="scanner-player-idx">${pIdx + 1}.</span>
                  <input type="text" class="scanner-player-name-input" value="${escapeHtml(p.name)}" placeholder="Player Name" data-slot-idx="${slotIdx}" data-p-idx="${pIdx}" />
                  <select class="scanner-player-move-select" data-slot-idx="${slotIdx}" data-p-idx="${pIdx}">
                    <option value="">Move...</option>
                    ${slots.map((s, targetIdx) => targetIdx !== slotIdx ? `<option value="${targetIdx}">Slot ${String(s.slot).padStart(2, '0')}</option>` : '').join('')}
                  </select>
                  <button type="button" class="scanner-player-del-btn" title="Remove" data-slot-idx="${slotIdx}" data-p-idx="${pIdx}">×</button>
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
        `;

        // Accordion toggle
        card.querySelector('.scanner-collapse-toggle-btn')?.addEventListener('click', (e) => {
          e.stopPropagation();
          if (expandedSlotCards.has(slotIdx)) {
            expandedSlotCards.delete(slotIdx);
          } else {
            expandedSlotCards.add(slotIdx);
          }
          this.render12SlotsList();
        });

        // Team Name input change
        card.querySelector('.scanner-team-name-input')?.addEventListener('change', (e) => {
          this.updateTeamName(slotIdx, e.target.value);
        });

        // Player Name input changes
        card.querySelectorAll('.scanner-player-name-input').forEach((inp) => {
          inp.addEventListener('change', (e) => {
            const pIdx = parseInt(e.target.dataset.pIdx, 10);
            this.updatePlayerName(slotIdx, pIdx, e.target.value);
          });
        });

        // Move Player select
        card.querySelectorAll('.scanner-player-move-select').forEach((sel) => {
          sel.addEventListener('change', (e) => {
            const pIdx = parseInt(e.target.dataset.pIdx, 10);
            const targetSlotIdx = parseInt(e.target.value, 10);
            if (!isNaN(targetSlotIdx)) {
              this.movePlayer(slotIdx, pIdx, targetSlotIdx);
            }
          });
        });

        // Remove Player button
        card.querySelectorAll('.scanner-player-del-btn').forEach((btn) => {
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
      const container = document.getElementById('scanner-12results-container');
      if (!container) return;
      container.innerHTML = '';

      results.forEach((res, slotIdx) => {
        const slot = slots[slotIdx];
        if (!slot) return;

        const isExpanded = expandedResultCards.has(slotIdx) || slotIdx === 0;
        const pts = this.getScoringBreakdown(res);
        const isOverride = res.teamKillsOverride !== null;

        const card = document.createElement('div');
        card.className = `scanner-12result-card ${res.isExcluded ? 'is-excluded' : ''} ${res.warnings.length > 0 ? 'has-warning' : ''}`;
        card.id = `scanner-res-card-${slotIdx}`;

        card.innerHTML = `
          <div class="scanner-12result-header">
            <div class="scanner-12result-header-left">
              <span class="scanner-slot-badge">Slot ${String(slot.slot).padStart(2, '0')}</span>
              <span class="scanner-result-teamname">${escapeHtml(slot.teamName)}</span>
              ${res.warnings.map((w) => `<span class="scanner-warning-tag">${escapeHtml(w)}</span>`).join('')}
            </div>
            <div class="scanner-12result-header-right">
              <div class="scanner-place-input-group">
                <span class="scanner-place-hash">#</span>
                <input type="number" class="scanner-place-input" min="1" max="12" value="${res.placement || ''}" placeholder="-" data-slot-idx="${slotIdx}" />
              </div>
              <div class="scanner-kills-total-pill ${isOverride ? 'is-override' : ''}">
                <span class="pill-dot"></span>
                <span id="scanner-kills-count-${slotIdx}">${res.totalKills}</span> Kills
              </div>
            </div>
          </div>

          <div class="scanner-12result-body">
            <!-- Individual Matched Players Kills -->
            <div class="scanner-result-players-wrap">
              <div class="scanner-result-players-title">Player Eliminations:</div>
              <div class="scanner-result-players-grid">
                ${slot.players.map((p, pIdx) => `
                  <div class="scanner-player-kill-item">
                    <span class="scanner-pk-name" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</span>
                    <input type="number" min="0" max="99" class="scanner-pk-input" value="${Number(p.kills) || 0}" data-slot-idx="${slotIdx}" data-p-idx="${pIdx}" />
                  </div>
                `).join('')}
              </div>
            </div>

            <!-- Team Override & Points Summary Row -->
            <div class="scanner-result-override-row">
              <div class="scanner-override-controls">
                <label class="scanner-override-label">Manual Override Team Kills:</label>
                <input type="number" min="0" max="99" class="scanner-override-input" value="${isOverride ? res.totalKills : ''}" placeholder="${res.totalKills}" data-slot-idx="${slotIdx}" />
                ${isOverride ? `<button type="button" class="scanner-btn-reset-ov" data-slot-idx="${slotIdx}">Reset</button>` : ''}
              </div>
              <div class="scanner-result-pts-tag">
                ${pts.totalPoints} Points
              </div>
            </div>
          </div>
        `;

        // Placement input change
        card.querySelector('.scanner-place-input')?.addEventListener('change', (e) => {
          this.updatePlacement(slotIdx, e.target.value);
        });

        // Player Kills input changes
        card.querySelectorAll('.scanner-pk-input').forEach((inp) => {
          inp.addEventListener('input', (e) => {
            const pIdx = parseInt(e.target.dataset.pIdx, 10);
            this.updatePlayerKill(slotIdx, pIdx, e.target.value);
          });
        });

        // Team Override input change
        card.querySelector('.scanner-override-input')?.addEventListener('change', (e) => {
          if (e.target.value !== '') {
            this.overrideTeamKills(slotIdx, e.target.value);
          }
        });

        // Reset Override button
        card.querySelector('.scanner-btn-reset-ov')?.addEventListener('click', () => {
          this.resetTeamKillsOverride(slotIdx);
        });

        container.appendChild(card);
      });
    },

    updateResultCardKillsDisplay(slotIdx) {
      const res = results[slotIdx];
      const countEl = document.getElementById(`scanner-kills-count-${slotIdx}`);
      if (countEl && res) {
        countEl.textContent = res.totalKills;
      }
    },

    renderStandingsPreview() {
      const tbody = document.getElementById('scanner-standings-table-body');
      if (!tbody) return;
      tbody.innerHTML = '';

      // Compute scored entries
      const scoredList = results
        .filter((r) => !r.isExcluded)
        .map((r, originalIdx) => {
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
          <td>${row.multiplier}x</td>
          <td><strong style="color: #c084fc;">${row.totalPoints}</strong></td>
        `;
        tbody.appendChild(tr);
      });
    },

    // Testing getters
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
