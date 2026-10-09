/* ====================================================================
   LRD PointCalc — AI Service Module
   ====================================================================
   PURPOSE:
   Modular AI service for extracting slot list data from images.
   
   ARCHITECTURE:
   - AIService.extractSlotList(imageFile) → Promise<SlotListResult>
   - The AI ONLY extracts slot number + team name from images.
   - The AI NEVER calculates points, rankings, or makes scoring decisions.
   - API keys are NEVER exposed in frontend code.
   - Uses a configurable backend proxy endpoint for real AI calls.
   - Includes a client-side OCR fallback using Tesseract.js for demo/dev.
   
   CONSTRAINTS:
   - Input: Image file (PNG, JPG, JPEG, WebP)
   - Output: Array of { slot: number, teamName: string }
   - Max image size: 10MB
   - Supported formats: PNG, JPG, JPEG, WebP
   ==================================================================== */

(function (window) {
  'use strict';

  // ================================================================
  // CONFIGURATION
  // ================================================================
  const AI_CONFIG = {
    // Backend proxy endpoint for real AI extraction
    // Developer must configure this to point to their AI backend
    backendEndpoint: window.ENV?.AI_ENDPOINT || null,

    // Maximum file size in bytes (10MB)
    maxFileSize: 10 * 1024 * 1024,

    // Supported image MIME types
    supportedTypes: ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'],

    // Processing timeout in milliseconds
    timeout: 30000,
  };

  // ================================================================
  // SLOT LIST RESULT SCHEMA
  // ================================================================
  /**
   * @typedef {Object} SlotEntry
   * @property {number} slot - The slot number (1-based)
   * @property {string} teamName - The extracted team name
   * @property {number} confidence - Confidence score 0-1
   */

  /**
   * @typedef {Object} SlotListResult
   * @property {boolean} success - Whether extraction succeeded
   * @property {SlotEntry[]} entries - Extracted slot entries
   * @property {string} [error] - Error message if failed
   * @property {string} method - Extraction method used ('ai', 'ocr', 'manual')
   * @property {number} processingTime - Time in ms
   */

  // ================================================================
  // IMAGE UTILITIES
  // ================================================================

  /**
   * Validate an image file before processing
   */
  function validateImageFile(file) {
    if (!file) {
      return { valid: false, error: 'No file provided' };
    }

    if (!AI_CONFIG.supportedTypes.includes(file.type)) {
      return {
        valid: false,
        error: `Unsupported file type: ${file.type}. Use PNG, JPG, or WebP.`,
      };
    }

    if (file.size > AI_CONFIG.maxFileSize) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
      return {
        valid: false,
        error: `File too large (${sizeMB}MB). Maximum is 10MB.`,
      };
    }

    return { valid: true };
  }

  /**
   * Convert a File to a base64 data URL
   */
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  /**
   * Create an image preview URL from a File
   */
  function createPreviewUrl(file) {
    return URL.createObjectURL(file);
  }

  /**
   * Revoke a preview URL to free memory
   */
  function revokePreviewUrl(url) {
    if (url && url.startsWith('blob:')) {
      URL.revokeObjectURL(url);
    }
  }

  // ================================================================
  // CLIENT-SIDE OCR EXTRACTION (Tesseract.js fallback)
  // ================================================================

  /**
   * Extract slot list using client-side OCR via Tesseract.js
   * This is the fallback when no backend AI endpoint is configured.
   */
  async function extractWithOCR(imageFile) {
    const startTime = performance.now();

    // Check if Tesseract is available
    if (typeof Tesseract === 'undefined') {
      // Dynamically load Tesseract.js from CDN
      await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');
    }

    if (typeof Tesseract === 'undefined') {
      throw new Error('OCR engine could not be loaded. Check your internet connection.');
    }

    const base64 = await fileToBase64(imageFile);

    // Use Tesseract.js to recognize text
    const result = await Tesseract.recognize(base64, 'eng', {
      logger: (m) => {
        // Progress updates can be hooked here
        if (m.status === 'recognizing text' && typeof window._aiProgressCallback === 'function') {
          window._aiProgressCallback(Math.round(m.progress * 100));
        }
      },
    });

    const rawText = result.data.text;
    const entries = parseSlotListText(rawText);
    const processingTime = Math.round(performance.now() - startTime);

    return {
      success: entries.length > 0,
      entries,
      rawText,
      method: 'ocr',
      processingTime,
      error: entries.length === 0 ? 'Could not detect slot list entries in the image. Try a clearer image or enter teams manually.' : null,
    };
  }

  /**
   * Parse raw OCR text into structured slot entries.
   * Handles common slot list formats:
   * - "1. TeamName" or "1) TeamName"
   * - "1 - TeamName" or "1 : TeamName"
   * - "Slot 1 TeamName"
   * - "#1 TeamName"
   * - Tab-separated "1\tTeamName"
   */
  function parseSlotListText(rawText) {
    if (!rawText || typeof rawText !== 'string') return [];

    const lines = rawText.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
    const entries = [];
    const seenSlots = new Set();

    // Patterns to match slot number + team name
    const patterns = [
      // "1. Team Name" or "1) Team Name"
      /^(\d{1,2})\s*[.)]\s+(.+)$/,
      // "1 - Team Name" or "1 : Team Name"
      /^(\d{1,2})\s*[-:]\s+(.+)$/,
      // "#1 Team Name"
      /^#(\d{1,2})\s+(.+)$/,
      // "Slot 1 Team Name"
      /^(?:slot|s)\s*(\d{1,2})\s+(.+)$/i,
      // Tab-separated "1\tTeam Name"
      /^(\d{1,2})\t+(.+)$/,
      // "1 TeamName" (number followed by space and word starting with uppercase)
      /^(\d{1,2})\s+([A-Z][\w\s]{1,})$/,
      // Generic: just a number followed by text
      /^(\d{1,2})\s{2,}(.+)$/,
    ];

    for (const line of lines) {
      for (const pattern of patterns) {
        const match = line.match(pattern);
        if (match) {
          const slot = parseInt(match[1], 10);
          const teamName = match[2].trim();

          if (slot > 0 && slot <= 48 && teamName.length > 0 && !seenSlots.has(slot)) {
            seenSlots.add(slot);
            entries.push({
              slot,
              teamName,
              confidence: 0.75, // OCR confidence is moderate
            });
          }
          break;
        }
      }
    }

    // Sort by slot number
    entries.sort((a, b) => a.slot - b.slot);

    // If no structured matches found, try to extract just team names line by line
    if (entries.length === 0 && lines.length > 0) {
      let slotCounter = 1;
      for (const line of lines) {
        // Skip lines that look like headers or empty
        const cleaned = line.replace(/[^a-zA-Z0-9\s_-]/g, '').trim();
        if (cleaned.length >= 2 && cleaned.length <= 40 && !/^(slot|team|name|#|no|number|sr)/i.test(cleaned)) {
          entries.push({
            slot: slotCounter++,
            teamName: cleaned,
            confidence: 0.5,
          });
        }
      }
    }

    return entries;
  }

  // ================================================================
  // BACKEND AI EXTRACTION (Real AI endpoint)
  // ================================================================

  /**
   * Extract slot list using the configured backend AI endpoint
   */
  async function extractWithBackendAI(imageFile) {
    const startTime = performance.now();

    const formData = new FormData();
    formData.append('image', imageFile);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), AI_CONFIG.timeout);

    try {
      const response = await fetch(AI_CONFIG.backendEndpoint, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`AI service returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const processingTime = Math.round(performance.now() - startTime);

      // Validate response schema
      if (!data || !Array.isArray(data.entries)) {
        throw new Error('Invalid response from AI service');
      }

      return {
        success: data.entries.length > 0,
        entries: data.entries.map((e) => ({
          slot: Number(e.slot) || 0,
          teamName: String(e.teamName || '').trim(),
          confidence: Number(e.confidence) || 0.9,
        })),
        method: 'ai',
        processingTime,
        error: data.entries.length === 0 ? 'AI could not detect slot entries in the image.' : null,
      };
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error('AI extraction timed out. Please try again or enter teams manually.');
      }
      throw err;
    }
  }

  // ================================================================
  // SCRIPT LOADER UTILITY
  // ================================================================
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Failed to load: ${src}`));
      document.head.appendChild(script);
    });
  }

  // ================================================================
  // PUBLIC AI SERVICE INTERFACE
  // ================================================================
  const AIService = {
    /**
     * Extract a slot list from an uploaded image file.
     * Automatically chooses the best available extraction method.
     *
     * @param {File} imageFile - The image file to process
     * @param {Function} [onProgress] - Optional progress callback (0-100)
     * @returns {Promise<SlotListResult>}
     */
    async extractSlotList(imageFile, onProgress) {
      // 1. Validate input
      const validation = validateImageFile(imageFile);
      if (!validation.valid) {
        return {
          success: false,
          entries: [],
          error: validation.error,
          method: 'none',
          processingTime: 0,
        };
      }

      // Set up progress callback
      if (typeof onProgress === 'function') {
        window._aiProgressCallback = onProgress;
      }

      try {
        // 2. Choose extraction method
        if (AI_CONFIG.backendEndpoint) {
          // Use real backend AI
          return await extractWithBackendAI(imageFile);
        } else {
          // Fallback to client-side OCR
          return await extractWithOCR(imageFile);
        }
      } catch (err) {
        console.error('AIService: Extraction failed:', err);
        return {
          success: false,
          entries: [],
          error: err.message || 'Extraction failed. Please try again or enter teams manually.',
          method: AI_CONFIG.backendEndpoint ? 'ai' : 'ocr',
          processingTime: 0,
        };
      } finally {
        delete window._aiProgressCallback;
      }
    },

    /**
     * Create a manual slot list result (for the manual entry fallback)
     * @param {Array<{slot: number, teamName: string}>} entries
     * @returns {SlotListResult}
     */
    createManualResult(entries) {
      return {
        success: true,
        entries: entries.map((e, i) => ({
          slot: e.slot || i + 1,
          teamName: e.teamName || '',
          confidence: 1.0,
        })),
        method: 'manual',
        processingTime: 0,
      };
    },

    /**
     * Parse rich lobby roster text including individual player names
     */
    parseLobbyRosterText(rawText) {
      if (!rawText || typeof rawText !== 'string') return [];
      const lines = rawText.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
      const slots = [];
      let currentSlot = null;

      const slotRegex = /^(?:slot|s|#)?\s*(\d{1,2})\s*[:.)-]?\s*(.+)$/i;

      for (const line of lines) {
        // Check if line starts a new slot
        const match = line.match(slotRegex);
        if (match && parseInt(match[1], 10) > 0 && parseInt(match[1], 10) <= 48) {
          const slotNum = parseInt(match[1], 10);
          const rest = match[2].trim();

          // Check if players are inline like "Team Name [P1, P2, P3, P4]" or "Team Name - P1, P2"
          let teamName = rest;
          let inlinePlayers = [];

          const bracketMatch = rest.match(/^(.+?)\s*\[(.*?)\]$/);
          if (bracketMatch) {
            teamName = bracketMatch[1].trim();
            inlinePlayers = bracketMatch[2].split(/[,;/]+/).map((p) => p.trim()).filter(Boolean);
          } else if (rest.includes(' - ')) {
            const parts = rest.split(' - ');
            teamName = parts[0].trim();
            inlinePlayers = parts[1].split(/[,;/]+/).map((p) => p.trim()).filter(Boolean);
          }

          currentSlot = {
            slot: slotNum,
            teamName: teamName || `Team ${slotNum}`,
            players: inlinePlayers.map((p) => ({ name: p, kills: 0 })),
            confidence: 0.85,
          };
          slots.push(currentSlot);
        } else if (currentSlot) {
          // Additional player lines under current slot (e.g. indented or bulleted)
          const cleaned = line.replace(/^[-*•>]\s*/, '').trim();
          if (cleaned && !cleaned.toLowerCase().startsWith('slot')) {
            const parts = cleaned.split(/[,;/]+/).map((p) => p.trim()).filter(Boolean);
            parts.forEach((pName) => {
              if (pName && !currentSlot.players.some((p) => p.name.toLowerCase() === pName.toLowerCase())) {
                currentSlot.players.push({ name: pName, kills: 0 });
              }
            });
          }
        }
      }

      // If no rich format detected, fallback to standard parseSlotListText
      if (slots.length === 0) {
        const standard = parseSlotListText(rawText);
        return standard.map((s) => ({
          ...s,
          players: [],
        }));
      }

      return slots.sort((a, b) => a.slot - b.slot);
    },

    /**
     * Parse end-game result screenshot text for player names, kills, and ranks
     */
    parseMatchResultsText(rawText) {
      if (!rawText || typeof rawText !== 'string') return [];
      const lines = rawText.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
      const extracted = [];

      // Patterns matching:
      // "1. Mafia - 4 Kills"
      // "#1 Mafia (4)"
      // "Rank 1 Total Gaming 12 kills"
      // "PlayerName 4 kills"
      const resultPatterns = [
        /^(?:#|rank\s*)?(\d{1,2})\s*[:.)-]?\s+(.+?)\s+[-—:]?\s*(\d{1,2})\s*(?:kills?|k|pts)?$/i,
        /^(.+?)\s+[-—:]\s*(\d{1,2})\s*(?:kills?|k)$/i,
        /^(\d{1,2})\s+([a-zA-Z0-9_\s]{2,20})\s+(\d{1,2})$/,
      ];

      for (const line of lines) {
        // Skip header lines
        if (/^(match|results|scoreboard|kills|placement|booyah)/i.test(line)) continue;

        let matched = false;
        for (const pattern of resultPatterns) {
          const m = line.match(pattern);
          if (m) {
            if (m.length === 4) {
              const rank = parseInt(m[1], 10);
              const name = m[2].trim();
              const kills = parseInt(m[3], 10);
              extracted.push({ rank, name, kills, confidence: 0.85 });
              matched = true;
              break;
            } else if (m.length === 3) {
              const name = m[1].trim();
              const kills = parseInt(m[2], 10);
              extracted.push({ rank: null, name, kills, confidence: 0.8 });
              matched = true;
              break;
            }
          }
        }
      }

      return extracted;
    },

    /**
     * Merge lobby roster with multiple result screenshots
     * - Associates extracted players with teams from the lobby roster
     * - Aggregates individual player kills into team totals
     * - Prevents duplicate player count across overlapping screenshots
     * - Assigns placements and flags warnings for manual review
     */
    mergeScreenshots(lobbySlots = [], resultScreenshotsData = []) {
      const warnings = [];
      const teams = lobbySlots.map((slot) => ({
        slot: slot.slot,
        teamName: slot.teamName,
        players: (slot.players || []).map((p) => ({
          name: typeof p === 'string' ? p : p.name,
          kills: 0,
        })),
        teamKillsOverride: null,
        placement: slot.placement || null,
        isRemoved: false,
      }));

      // Flatten and deduplicate extracted player results across all screenshots
      const seenPlayers = new Set();
      const allExtracted = [];

      resultScreenshotsData.forEach((screenData, screenIdx) => {
        const entries = Array.isArray(screenData) ? screenData : (screenData.entries || []);
        entries.forEach((entry) => {
          const normName = entry.name.toLowerCase().trim();
          if (seenPlayers.has(normName)) {
            // Already counted from previous screenshot (overlapping screenshot handling)
            return;
          }
          seenPlayers.add(normName);
          allExtracted.push({ ...entry, screenIndex: screenIdx });
        });
      });

      // Match extracted entries to teams in roster
      allExtracted.forEach((ext) => {
        const extName = ext.name.toLowerCase().trim();
        let matched = false;

        // 1. Try matching with registered team players
        for (const team of teams) {
          const pIndex = team.players.findIndex((p) => p.name.toLowerCase().trim() === extName);
          if (pIndex !== -1) {
            team.players[pIndex].kills = ext.kills;
            if (ext.rank && !team.placement) {
              team.placement = ext.rank;
            }
            matched = true;
            break;
          }
        }

        // 2. Try matching with team name itself
        if (!matched) {
          for (const team of teams) {
            if (team.teamName.toLowerCase().trim() === extName) {
              if (team.players.length === 0) {
                // Team-level kill assignment
                team.teamKillsOverride = ext.kills;
              } else {
                // Add as new player or distribute
                team.players.push({ name: `${ext.name} (Player)`, kills: ext.kills });
              }
              if (ext.rank && !team.placement) team.placement = ext.rank;
              matched = true;
              break;
            }
          }
        }

        // 3. Unmatched player: add warning and assign to closest slot or unassigned
        if (!matched) {
          warnings.push(`Player "${ext.name}" (${ext.kills} kills) could not be matched to any lobby team.`);
        }
      });

      // Calculate total team kills for each team
      teams.forEach((t) => {
        if (t.teamKillsOverride === null) {
          t.totalKills = t.players.reduce((sum, p) => sum + (Number(p.kills) || 0), 0);
        } else {
          t.totalKills = Number(t.teamKillsOverride) || 0;
        }
      });

      return {
        teams,
        warnings,
        totalMatchedPlayers: seenPlayers.size,
      };
    },

    /**
     * Full AI extraction pipeline for 1 lobby + 2 result screenshots
     */
    async extractFullMatchScreenshots({ lobbyFile, resultFiles = [] }, onProgress) {
      const progress = (pct, msg) => {
        if (typeof onProgress === 'function') onProgress(pct, msg);
      };

      progress(10, 'Validating uploaded screenshots...');
      if (!lobbyFile && resultFiles.length === 0) {
        throw new Error('Please upload at least one screenshot to scan.');
      }

      let lobbySlots = [];
      if (lobbyFile) {
        progress(25, 'Processing lobby screenshot...');
        const lobbyRes = await this.extractSlotList(lobbyFile);
        if (lobbyRes.success && lobbyRes.entries.length > 0) {
          lobbySlots = lobbyRes.entries.map((e) => ({
            slot: e.slot,
            teamName: e.teamName,
            players: [],
          }));
        } else if (lobbyRes.rawText) {
          lobbySlots = this.parseLobbyRosterText(lobbyRes.rawText);
        }
      }

      // Default 12 slots if lobby extraction did not find all slots
      if (lobbySlots.length === 0) {
        for (let i = 1; i <= 12; i++) {
          lobbySlots.push({ slot: i, teamName: `Team ${i}`, players: [] });
        }
      }

      const resultsData = [];
      for (let i = 0; i < resultFiles.length; i++) {
        const file = resultFiles[i];
        if (!file) continue;
        progress(40 + Math.round((i + 1) * 20), `Scanning result screenshot ${i + 1} of ${resultFiles.length}...`);
        const res = await this.extractSlotList(file);
        if (res.rawText) {
          resultsData.push(this.parseMatchResultsText(res.rawText));
        } else if (res.entries) {
          resultsData.push(res.entries.map((e) => ({ name: e.teamName, kills: 0, rank: e.slot })));
        }
      }

      progress(85, 'Merging rosters and aggregating kills...');
      const merged = this.mergeScreenshots(lobbySlots, resultsData);

      progress(100, 'Extraction complete!');
      return {
        success: true,
        teams: merged.teams,
        warnings: merged.warnings,
      };
    },

    // Expose utilities
    validateImageFile,
    createPreviewUrl,
    revokePreviewUrl,
    parseSlotListText,

    /**
     * Check if backend AI endpoint is configured
     */
    isBackendConfigured() {
      return Boolean(AI_CONFIG.backendEndpoint);
    },
  };

  // Export
  window.AIService = AIService;
})(window);
