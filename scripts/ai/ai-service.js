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
