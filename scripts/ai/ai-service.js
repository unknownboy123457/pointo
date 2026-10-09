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
     * Normalize player name for deterministic comparison:
     * - Trims surrounding whitespace
     * - Lowercases
     * - Removes zero-width Unicode characters
     * - Collapses internal whitespace
     */
    normalizePlayerName(name) {
      if (!name || typeof name !== 'string') return '';
      return name
        .trim()
        .toLowerCase()
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/\s+/g, ' ');
    },

    /**
     * Compare two player names with harmless OCR tolerance
     */
    matchPlayerName(nameA, nameB) {
      const normA = this.normalizePlayerName(nameA);
      const normB = this.normalizePlayerName(nameB);
      if (!normA || !normB) return false;
      if (normA === normB) return true;
      // Secondary check: trim non-alphanumeric noise at boundaries (e.g. OCR bracket or dot)
      const cleanA = normA.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');
      const cleanB = normB.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');
      if (cleanA && cleanB && cleanA === cleanB) return true;
      return false;
    },

    /**
     * Parse rich lobby roster text including individual player names
     * Supports:
     * 1. Free Fire lobby column grid (Slot number on line, followed by player names)
     * 2. Inline brackets: "Slot 1: Team Name [P1, P2, P3, P4]"
     * 3. Dashed lines: "1. Team Name - P1, P2, P3, P4"
     * 4. Bulleted player rows under slot header
     * 5. Table / pipe format: "1 | Team Name | P1 | P2 | P3 | P4"
     * Preserves punctuation, underscores, dots, and special characters.
     */
    parseLobbyRosterText(rawText, sourceInfo = 'Lobby Screenshot') {
      if (!rawText || typeof rawText !== 'string') return [];
      const lines = rawText.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
      const slots = [];
      let currentSlot = null;

      // Slot indicator regex: "Slot 1: Team Name", "Slot 01", "#1 Team", "1. Team", "1 - Team", or standalone "1" / "Slot 1"
      const slotHeaderRegex = /^(?:slot|s|#)?\s*(\d{1,2})\s*(?:[:.)-]\s*(.*)|$)/i;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const match = line.match(slotHeaderRegex);

        // Check if line starts a slot definition (1 to 48)
        if (match && parseInt(match[1], 10) > 0 && parseInt(match[1], 10) <= 48) {
          const slotNum = parseInt(match[1], 10);
          const rest = (match[2] || '').trim();

          let teamName = `Team ${slotNum}`;
          let inlinePlayers = [];

          if (rest) {
            const bracketMatch = rest.match(/^(.+?)\s*\[(.*?)\]$/);
            if (bracketMatch) {
              teamName = bracketMatch[1].trim();
              inlinePlayers = bracketMatch[2].split(/[,;/]+/).map((p) => p.trim()).filter(Boolean);
            } else if (rest.includes(' - ')) {
              const parts = rest.split(' - ');
              teamName = parts[0].trim();
              inlinePlayers = parts[1].split(/[,;/]+/).map((p) => p.trim()).filter(Boolean);
            } else if (rest.includes('|')) {
              const parts = rest.split('|').map((p) => p.trim()).filter(Boolean);
              teamName = parts[0] || `Team ${slotNum}`;
              inlinePlayers = parts.slice(1);
            } else {
              teamName = rest;
            }
          }

          currentSlot = {
            slot: slotNum,
            teamName: teamName || `Team ${slotNum}`,
            players: inlinePlayers.map((p) => ({
              id: 'p_' + Math.random().toString(36).substr(2, 6),
              name: p,
              slot: slotNum,
              teamName: teamName || `Team ${slotNum}`,
              kills: 0,
              confidence: 0.9,
              source: sourceInfo,
              region: `Slot ${slotNum}`,
              verificationStatus: 'verified',
            })),
            source: sourceInfo,
            confidence: 0.85,
            status: 'verified',
          };
          slots.push(currentSlot);
        } else if (currentSlot) {
          // Additional player lines under current slot (indented, bulleted, or plain names)
          const cleaned = line.replace(/^[-*•>]\s*/, '').trim();
          if (cleaned && !/^(?:slot|match|roster|lobby|room)\b/i.test(cleaned)) {
            const parts = cleaned.includes(',') || cleaned.includes(';')
              ? cleaned.split(/[,;]+/).map((p) => p.trim()).filter(Boolean)
              : [cleaned];

            parts.forEach((pName) => {
              if (pName && !currentSlot.players.some((p) => this.matchPlayerName(p.name, pName))) {
                currentSlot.players.push({
                  id: 'p_' + Math.random().toString(36).substr(2, 6),
                  name: pName,
                  slot: currentSlot.slot,
                  teamName: currentSlot.teamName,
                  kills: 0,
                  confidence: 0.85,
                  source: sourceInfo,
                  region: `Slot ${currentSlot.slot}`,
                  verificationStatus: 'verified',
                });
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
          status: 'verified',
          confidence: s.confidence || 0.75,
        }));
      }

      return slots.sort((a, b) => a.slot - b.slot);
    },

    /**
     * Parse end-game result screenshot text for player names, kills, eliminations, and ranks
     * Specifically handles:
     * - Free Fire in-game scoreboard: "AYUSHMAN_ 7 Eliminations"
     * - "#1 Mafia - 6 Kills" / "Rank 1 Total Gaming 12 kills"
     * - Visible rank headers: "#7 7. TEAM FLUG"
     * - "Player (4)" / "Player : 5 kills"
     * Preserves underscores, punctuation, dots, and special characters.
     */
    parseMatchResultsText(rawText, sourceInfo = 'Result Screenshot') {
      if (!rawText || typeof rawText !== 'string') return [];
      const lines = rawText.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
      const extracted = [];
      let currentRank = null;

      const ignoreRegex = /^(match|results?|scoreboard|summary|booyah!?|kills?|placement|eliminations?|alive|survival)/i;
      const rankHeaderRegex = /^(?:#|rank\s*)?(\d{1,2})\s*[:.)-]?\s*(?:(?:team|slot)?\s*.+)?$/i;

      for (const line of lines) {
        // Skip pure headers without digits
        if (ignoreRegex.test(line) && !/\d/.test(line)) continue;

        // Check if line sets rank context (e.g. "#7 7. TEAM FLUG" or "Rank 2")
        if (!/(?:kills?|elim|pts|\b\d{1,2}\s*$)/i.test(line)) {
          const rm = line.match(rankHeaderRegex);
          if (rm && parseInt(rm[1], 10) >= 1 && parseInt(rm[1], 10) <= 48) {
            currentRank = parseInt(rm[1], 10);
            continue;
          }
        }

        // Pattern 1: Rank + Name + Kills/Elims, e.g. "#1 Mafia - 6 Kills", "Rank 1 Total Gaming 12 kills", "#7 AYUSHMAN_ 7 Eliminations"
        const p1 = line.match(/^(?:#|rank\s*)?(\d{1,2})\s*[:.)-]?\s+(.+?)\s+[-—:x]?\s*(\d{1,2})\s*(?:eliminations?|elims?|elim|kills?|k|pts)?$/i);
        if (p1 && p1[2] && p1[3] !== undefined) {
          const rank = parseInt(p1[1], 10);
          const name = p1[2].trim();
          const kills = parseInt(p1[3], 10);
          if (name.length > 0 && !isNaN(kills)) {
            extracted.push({
              rank,
              name,
              kills,
              confidence: 0.9,
              source: sourceInfo,
              region: `Rank ${rank}`,
            });
            currentRank = rank;
            continue;
          }
        }

        // Pattern 2: Name + Eliminations/Kills, e.g. "AYUSHMAN_ 7 Eliminations", "11X MAF!YA 1 Eliminations", "Player - 4 kills"
        const p2 = line.match(/^(.+?)\s+[-—:x]?\s*(\d{1,2})\s*(?:eliminations?|elims?|elim|kills?|k)$/i);
        if (p2 && p2[1] && p2[2] !== undefined) {
          const name = p2[1].trim();
          const kills = parseInt(p2[2], 10);
          if (name.length > 0 && !isNaN(kills)) {
            extracted.push({
              rank: currentRank,
              name,
              kills,
              confidence: 0.88,
              source: sourceInfo,
              region: currentRank ? `Rank ${currentRank}` : 'Scoreboard',
            });
            continue;
          }
        }

        // Pattern 3: Name with parentheses count, e.g. "Mafia (6)", "Player (4 kills)"
        const p3 = line.match(/^(.+?)\s*\(\s*(\d{1,2})\s*(?:eliminations?|elims?|elim|kills?|k)?\s*\)$/i);
        if (p3 && p3[1] && p3[2] !== undefined) {
          const name = p3[1].trim();
          const kills = parseInt(p3[2], 10);
          if (name.length > 0 && !isNaN(kills)) {
            extracted.push({
              rank: currentRank,
              name,
              kills,
              confidence: 0.85,
              source: sourceInfo,
              region: currentRank ? `Rank ${currentRank}` : 'Scoreboard',
            });
            continue;
          }
        }

        // Pattern 4: Generic Digit + Name + Digit, e.g. "1 Mafia 6"
        const p4 = line.match(/^(\d{1,2})\s+([a-zA-Z0-9_.!#\s-]{2,30})\s+(\d{1,2})$/);
        if (p4 && p4[2] && p4[3] !== undefined) {
          const rank = parseInt(p4[1], 10);
          const name = p4[2].trim();
          const kills = parseInt(p4[3], 10);
          if (name.length > 0 && !isNaN(kills)) {
            extracted.push({
              rank,
              name,
              kills,
              confidence: 0.8,
              source: sourceInfo,
              region: `Rank ${rank}`,
            });
            currentRank = rank;
            continue;
          }
        }
      }

      return extracted;
    },

    /**
     * Merge lobby roster with multiple result screenshots
     * - Lobby roster is the single source of truth for slot assignments
     * - Normalizes letter case and harmless spacing
     * - Aggregates individual player kills into team totals
     * - Prevents duplicate player count across overlapping screenshots
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
          const normName = this.normalizePlayerName(entry.name);
          if (seenPlayers.has(normName)) {
            // Already counted from previous screenshot (overlapping screenshot handling)
            return;
          }
          seenPlayers.add(normName);
          allExtracted.push({ ...entry, normName, screenIndex: screenIdx });
        });
      });

      // Match extracted entries to teams in roster using deterministic lookup
      allExtracted.forEach((ext) => {
        let matched = false;

        // 1. Try matching with registered team players using normalized matching
        for (const team of teams) {
          const pIndex = team.players.findIndex((p) => this.matchPlayerName(p.name, ext.name));
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
            if (this.matchPlayerName(team.teamName, ext.name)) {
              if (team.players.length === 0) {
                team.teamKillsOverride = ext.kills;
              } else {
                team.players.push({ name: `${ext.name} (Player)`, kills: ext.kills });
              }
              if (ext.rank && !team.placement) team.placement = ext.rank;
              matched = true;
              break;
            }
          }
        }

        // 3. Unmatched player: add warning
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

    /**
     * Classify an image file as 'slot_list', 'end_result', or 'unknown'
     * Inspects filename and OCR text (if available) with Free Fire tournament domain heuristics
     */
    classifyImageFile(file, ocrText = '') {
      if (!file) return { category: 'unknown', confidence: 0.3, reason: 'No file provided' };

      const name = (file.name || '').toLowerCase();
      const text = (ocrText || '').toLowerCase();

      // Check slot list / lobby keywords
      const slotKeywords = ['slot', 'lobby', 'roster', 'room', 'waiting', 'invite', 'custom', 'squad', 'bermuda', 'purgatory'];
      const endKeywords = ['result', 'end', 'booyah', 'kill', 'elim', 'match', 'score', 'damage', 'survival', 'rank', 'mvp'];

      let slotScore = 0;
      let endScore = 0;

      slotKeywords.forEach((kw) => {
        if (name.includes(kw)) slotScore += 2;
        if (text.includes(kw)) slotScore += 1;
      });

      endKeywords.forEach((kw) => {
        if (name.includes(kw)) endScore += 2;
        if (text.includes(kw)) endScore += 1;
      });

      if (slotScore > endScore && slotScore >= 2) {
        return { category: 'slot_list', confidence: Math.min(0.95, 0.6 + slotScore * 0.1), reason: 'Detected lobby/slot keywords' };
      }
      if (endScore > slotScore && endScore >= 2) {
        return { category: 'end_result', confidence: Math.min(0.95, 0.6 + endScore * 0.1), reason: 'Detected match result keywords' };
      }

      // If only single weak hint
      if (slotScore > 0 && endScore === 0) {
        return { category: 'slot_list', confidence: 0.7, reason: 'Likely slot list' };
      }
      if (endScore > 0 && slotScore === 0) {
        return { category: 'end_result', confidence: 0.7, reason: 'Likely match result' };
      }

      return { category: 'unknown', confidence: 0.4, reason: 'Uncertain category — please select' };
    },

    /**
     * Diagnose current roster and matching state distinguishing the 6 core scenarios:
     * 1. No lobby roster exists
     * 2. Missing players in a roster
     * 3. Unmatched players in end screenshots
     * 4. Ambiguous players (duplicate in multiple slots)
     * 5. Empty slots
     * 6. Unreadable screenshots
     */
    diagnoseRosterState({ slots = [], unmatchedPlayers = [], failedScreenshots = [], warnings = [] } = {}) {
      const issues = [];

      // 1. No lobby roster exists
      const totalPlayers = slots.reduce((sum, s) => sum + (s.players || []).length, 0);
      if (totalPlayers === 0) {
        issues.push({
          type: 'no_lobby_roster',
          severity: 'warning',
          title: 'No Lobby Roster Confirmed',
          message: 'No players are currently assigned to the 12 slots. You can load a saved slot list, enter player names manually below, or upload a lobby screenshot.',
        });
      }

      // 2. Unmatched players found in end screenshots
      if (unmatchedPlayers.length > 0) {
        issues.push({
          type: 'unmatched_players',
          severity: 'warning',
          title: `${unmatchedPlayers.length} Unmatched Player${unmatchedPlayers.length > 1 ? 's' : ''}`,
          message: `${unmatchedPlayers.length} player(s) found in match results were not matched to the lobby roster. Use "Assign to Slot" to place them.`,
          unmatchedCount: unmatchedPlayers.length,
          unmatched: unmatchedPlayers,
        });
      }

      // 3. Ambiguous players (duplicate player name across multiple slots)
      const playerSlotMap = new Map();
      const ambiguous = [];
      slots.forEach((s) => {
        (s.players || []).forEach((p) => {
          const norm = this.normalizePlayerName(p.name);
          if (norm) {
            if (playerSlotMap.has(norm)) {
              ambiguous.push({ name: p.name, slots: [playerSlotMap.get(norm), s.slot] });
            } else {
              playerSlotMap.set(norm, s.slot);
            }
          }
        });
      });
      if (ambiguous.length > 0) {
        issues.push({
          type: 'ambiguous_players',
          severity: 'warning',
          title: 'Duplicate Player in Multiple Slots',
          message: ambiguous.map((a) => `"${a.name}" is listed in Slot ${a.slots.join(' and Slot ')}. Please verify.`).join(' '),
          ambiguous,
        });
      }

      // 4. Missing players in a roster (teams with fewer than 4 players)
      const shortSlots = slots.filter((s) => s.players && s.players.length > 0 && s.players.length < 4);
      if (shortSlots.length > 0) {
        issues.push({
          type: 'missing_players',
          severity: 'info',
          title: 'Variable Team Sizes Detected',
          message: `${shortSlots.length} team(s) have fewer than 4 players (Slots: ${shortSlots.map((s) => s.slot).join(', ')}). Variable team sizes are supported.`,
          shortSlots: shortSlots.map((s) => s.slot),
        });
      }

      // 5. Empty slots
      const emptySlots = slots.filter((s) => !s.players || s.players.length === 0);
      if (emptySlots.length > 0 && totalPlayers > 0) {
        issues.push({
          type: 'empty_slots',
          severity: 'info',
          title: `${emptySlots.length} Empty Slot${emptySlots.length > 1 ? 's' : ''}`,
          message: `Slot(s) ${emptySlots.map((s) => s.slot).join(', ')} have no players assigned. Empty slots are permitted and will not block match calculations.`,
          emptySlots: emptySlots.map((s) => s.slot),
        });
      }

      // 6. Unreadable screenshots
      if (failedScreenshots.length > 0) {
        issues.push({
          type: 'unreadable_screenshot',
          severity: 'error',
          title: 'Unreadable Screenshot',
          message: failedScreenshots.map((f) => `Screenshot "${f.name || f}" could not be read. Valid screenshots and slots were preserved.`).join(' '),
          failedScreenshots,
        });
      }

      return issues;
    },

    /**
     * Organize extracted results into 12 logical slot groups:
     * - Uses confirmed lobby roster as the deterministic source of truth
     * - Normalizes letter case and surrounding whitespace
     * - Deduplicates overlapping screenshots without double-counting kills
     * - Separates unmatched players for manual organizer assignment
     * - Aggregates individual kills into team totals
     */
    organizeResultsInto12Slots({ slots = [], extractedResults = [], manualAssignments = new Map() } = {}) {
      const warnings = [];
      const unmatchedPlayers = [];

      // 1. Build deterministic player-to-slot lookup from confirmed lobby roster
      const playerToSlotMap = new Map();
      slots.forEach((s, sIdx) => {
        (s.players || []).forEach((p, pIdx) => {
          const norm = this.normalizePlayerName(p.name);
          if (norm) {
            if (!playerToSlotMap.has(norm)) {
              playerToSlotMap.set(norm, { slotIdx: sIdx, pIdx, playerObj: p, slotNum: s.slot });
            }
          }
        });
      });

      // 2. Deduplicate overlapping end-game results
      const seenResultNames = new Set();
      const uniqueResults = [];
      extractedResults.forEach((ext) => {
        const norm = this.normalizePlayerName(ext.name);
        if (norm) {
          if (!seenResultNames.has(norm)) {
            seenResultNames.add(norm);
            uniqueResults.push({ ...ext, norm });
          }
        }
      });

      // 3. Initialize 12 slot result records
      const slotResults = slots.map((s) => ({
        slot: s.slot,
        teamName: s.teamName,
        placement: null,
        teamKillsOverride: null,
        totalKills: 0,
        matchedPlayers: [],
        isExcluded: false,
        source: s.source || 'Lobby Roster',
        warnings: [],
        status: (s.players && s.players.length > 0) ? 'verified' : 'empty',
      }));

      // Reset individual player kills before applying matched results
      slots.forEach((s) => {
        (s.players || []).forEach((p) => {
          p.kills = 0;
          p.verificationStatus = 'verified';
        });
      });

      // 4. Distribute results deterministically
      uniqueResults.forEach((res) => {
        const norm = res.norm;
        let matched = false;

        // 4a. Check confirmed manual assignment first
        if (manualAssignments && manualAssignments.has(norm)) {
          const targetSlotNum = manualAssignments.get(norm);
          const targetIdx = slots.findIndex((s) => s.slot === targetSlotNum);
          if (targetIdx !== -1) {
            const slot = slots[targetIdx];
            let p = slot.players.find((pl) => this.matchPlayerName(pl.name, res.name));
            if (!p) {
              p = {
                id: 'p_' + Math.random().toString(36).substr(2, 6),
                name: res.name,
                slot: targetSlotNum,
                teamName: slot.teamName,
                kills: Number(res.kills) || 0,
                confidence: 1.0,
                source: res.source || 'Manual Assignment',
                region: `Slot ${targetSlotNum}`,
                verificationStatus: 'verified',
              };
              slot.players.push(p);
            } else {
              p.kills = Number(res.kills) || 0;
              p.verificationStatus = 'verified';
            }
            if (res.rank && !slotResults[targetIdx].placement) {
              slotResults[targetIdx].placement = res.rank;
            }
            matched = true;
          }
        }

        // 4b. Match against confirmed lobby roster
        if (!matched && playerToSlotMap.has(norm)) {
          const matchInfo = playerToSlotMap.get(norm);
          const targetSlot = slots[matchInfo.slotIdx];
          const player = targetSlot.players[matchInfo.pIdx];
          player.kills = Number(res.kills) || 0;
          player.verificationStatus = 'verified';

          if (res.rank && !slotResults[matchInfo.slotIdx].placement) {
            slotResults[matchInfo.slotIdx].placement = res.rank;
          }
          matched = true;
        }

        // 4c. Secondary match: team name itself
        if (!matched) {
          for (let i = 0; i < slots.length; i++) {
            if (this.matchPlayerName(slots[i].teamName, res.name)) {
              if (slots[i].players.length === 0) {
                slotResults[i].teamKillsOverride = Number(res.kills) || 0;
              } else {
                slots[i].players.push({
                  id: 'p_' + Math.random().toString(36).substr(2, 6),
                  name: `${res.name} (Player)`,
                  slot: slots[i].slot,
                  teamName: slots[i].teamName,
                  kills: Number(res.kills) || 0,
                  confidence: 0.85,
                  source: res.source,
                  region: `Slot ${slots[i].slot}`,
                  verificationStatus: 'verified',
                });
              }
              if (res.rank && !slotResults[i].placement) {
                slotResults[i].placement = res.rank;
              }
              matched = true;
              break;
            }
          }
        }

        // 4d. Unmatched player: isolate in Unmatched section
        if (!matched) {
          unmatchedPlayers.push({
            id: 'un_' + Math.random().toString(36).substr(2, 6),
            name: res.name,
            kills: Number(res.kills) || 0,
            rank: res.rank || null,
            source: res.sourceFile || res.source || 'Result Screenshot',
            status: 'unmatched',
            reason: 'Not found in confirmed lobby roster',
          });
          warnings.push(`Result for "${res.name}" (${res.kills} kills${res.rank ? ', Rank #' + res.rank : ''}) could not be matched to any slot.`);
        }
      });

      // 5. Aggregate team total kills for each slot
      slotResults.forEach((sr, idx) => {
        const slot = slots[idx];
        sr.matchedPlayers = (slot.players || []).map((p) => ({
          name: p.name,
          kills: Number(p.kills) || 0,
          status: p.verificationStatus || 'verified',
        }));

        if (sr.teamKillsOverride !== null) {
          sr.totalKills = Number(sr.teamKillsOverride) || 0;
        } else {
          sr.totalKills = (slot.players || []).reduce((sum, p) => sum + (Number(p.kills) || 0), 0);
        }
      });

      // 6. Check duplicate placements
      const placementCount = new Map();
      slotResults.forEach((sr) => {
        if (sr.placement) {
          placementCount.set(sr.placement, (placementCount.get(sr.placement) || 0) + 1);
        }
      });
      slotResults.forEach((sr) => {
        if (sr.placement && placementCount.get(sr.placement) > 1) {
          sr.warnings.push(`Duplicate placement #${sr.placement}`);
          warnings.push(`Duplicate placement: Multiple teams placed at #${sr.placement}. Please review.`);
        }
      });

      return {
        slotResults,
        unmatchedPlayers,
        warnings,
      };
    },

    /**
     * Complete 12-slot extraction pipeline supporting multi-screenshot upload
     * - Organizes lobby into exactly 12 logical slot records
     * - Processes end screenshots into 12 slot groups
     * - Uses lobby roster as deterministic source of truth
     * - Retains manual assignments across runs
     * - Distinguishes error and review states cleanly
     */
    async extract12SlotsAndResults({ slotListFiles = [], endResultFiles = [], existingSlots = [], confirmedManualAssignments = new Map() }, onProgress) {
      const progress = (pct, msg) => {
        if (typeof onProgress === 'function') onProgress(pct, msg);
      };

      progress(10, 'Analyzing uploaded screenshots...');

      // 1. Initialize exact 12 slots
      const slots = [];
      for (let i = 1; i <= 12; i++) {
        const existing = existingSlots.find((s) => s.slot === i);
        slots.push({
          slot: i,
          teamName: existing?.teamName || `Team ${i}`,
          players: existing?.players ? JSON.parse(JSON.stringify(existing.players)) : [],
          isActive: existing?.isActive !== false,
          isCleared: false,
          source: existing?.source || 'Manual',
          status: 'verified',
        });
      }

      const failedScreenshots = [];

      // 2. Process all slot list files
      for (let sIdx = 0; sIdx < slotListFiles.length; sIdx++) {
        const file = slotListFiles[sIdx];
        if (!file) continue;
        progress(20 + Math.round(((sIdx + 1) / Math.max(1, slotListFiles.length)) * 25), `Extracting slot list ${sIdx + 1} of ${slotListFiles.length}...`);

        let extractedRoster = [];
        try {
          const res = await this.extractSlotList(file);
          if (res.rawText) {
            extractedRoster = this.parseLobbyRosterText(res.rawText, file.name);
          } else if (res.entries && res.entries.length > 0) {
            extractedRoster = res.entries.map((e) => ({
              slot: e.slot,
              teamName: e.teamName,
              players: e.players || [],
            }));
          }
          if (!res.success && (!res.entries || res.entries.length === 0) && !res.rawText) {
            failedScreenshots.push(file);
          }
        } catch (e) {
          console.warn('Slot list extraction error:', e);
          failedScreenshots.push(file);
        }

        // Merge extracted roster into 12 slots by slot number
        extractedRoster.forEach((item) => {
          if (item.slot >= 1 && item.slot <= 12) {
            const slotObj = slots[item.slot - 1];
            if (item.teamName && !slotObj.teamName.startsWith('Team ')) {
              slotObj.teamName = item.teamName;
            } else if (item.teamName) {
              slotObj.teamName = item.teamName;
            }
            slotObj.source = file.name || `Screen ${sIdx + 1}`;
            slotObj.status = 'verified';

            if (Array.isArray(item.players)) {
              item.players.forEach((p) => {
                const pName = typeof p === 'string' ? p.trim() : (p.name || '').trim();
                if (pName && !slotObj.players.some((existingP) => this.matchPlayerName(existingP.name, pName))) {
                  slotObj.players.push({
                    id: 'p_' + Math.random().toString(36).substr(2, 6),
                    name: pName,
                    slot: slotObj.slot,
                    teamName: slotObj.teamName,
                    kills: 0,
                    confidence: p.confidence || 0.9,
                    source: file.name || 'Lobby Screenshot',
                    region: `Slot ${slotObj.slot}`,
                    verificationStatus: 'verified',
                  });
                }
              });
            }
          }
        });
      }

      // 3. Process all end result files
      const extractedResults = [];
      for (let rIdx = 0; rIdx < endResultFiles.length; rIdx++) {
        const file = endResultFiles[rIdx];
        if (!file) continue;
        progress(50 + Math.round(((rIdx + 1) / Math.max(1, endResultFiles.length)) * 30), `Extracting match result ${rIdx + 1} of ${endResultFiles.length}...`);

        let matchResults = [];
        try {
          const res = await this.extractSlotList(file);
          if (res.rawText) {
            matchResults = this.parseMatchResultsText(res.rawText, file.name);
          } else if (res.entries) {
            matchResults = res.entries.map((e) => ({ name: e.teamName, kills: 0, rank: e.slot }));
          }
          if (!res.success && (!res.entries || res.entries.length === 0) && !res.rawText) {
            failedScreenshots.push(file);
          }
        } catch (e) {
          console.warn('Result extraction error:', e);
          failedScreenshots.push(file);
        }

        matchResults.forEach((entry) => {
          extractedResults.push({ ...entry, sourceFile: file.name });
        });
      }

      // 4. Organize results into 12 slot groups using deterministic lobby roster lookup
      const organization = this.organizeResultsInto12Slots({
        slots,
        extractedResults,
        manualAssignments: confirmedManualAssignments,
      });

      const slotResults = organization.slotResults;
      const unassignedPlayers = organization.unmatchedPlayers;
      const warnings = [...organization.warnings];

      // Check duplicate player names across slots and flag warnings
      const seenPlayerSlotMap = new Map();
      slots.forEach((s) => {
        (s.players || []).forEach((p) => {
          const norm = this.normalizePlayerName(p.name);
          if (norm) {
            if (seenPlayerSlotMap.has(norm)) {
              warnings.unshift(`Potential duplicate player "${p.name}" found in Slot ${seenPlayerSlotMap.get(norm)} and Slot ${s.slot}.`);
              s.status = 'review';
            } else {
              seenPlayerSlotMap.set(norm, s.slot);
            }
          }
        });
      });

      // 5. Diagnose roster and match state
      const diagnostics = this.diagnoseRosterState({
        slots,
        unmatchedPlayers: unassignedPlayers,
        failedScreenshots,
        warnings,
      });

      progress(100, 'Analysis complete!');

      return {
        success: true,
        slots,
        endSlots: slotResults,
        unassignedPlayers,
        results: slotResults,
        warnings,
        diagnostics,
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
