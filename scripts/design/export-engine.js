/* ====================================================================
   LRD PointCalc — Export Engine
   ====================================================================
   PURPOSE:
   Generates clean, full-resolution export assets (PNG, PDF, Web Share)
   without editor controls or interactive UI artifacts.
   ==================================================================== */

(function (window) {
  'use strict';

  const ExportEngine = {
    /**
     * Generate rendered canvas at specified resolution
     *
     * @param {Object} template - Template definition
     * @param {Object} dataContext - Context with scoring engine points & tournament data
     * @param {Object} [options] - { scale: number }
     * @returns {Promise<HTMLCanvasElement>}
     */
    async generateCanvas(template, dataContext, options = {}) {
      if (!window.TemplateRenderer) {
        throw new Error('TemplateRenderer is required for export.');
      }
      if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
        try {
          await document.fonts.ready;
        } catch (e) {
          // Continue if fonts API not supported
        }
      }
      const scale = options.scale || 2; // 2x retina standard
      return await window.TemplateRenderer.renderToCanvas(template, dataContext, scale);
    },

    /**
     * Convert canvas to Blob
     */
    canvasToBlob(canvas, type = 'image/png', quality = 0.95) {
      return new Promise((resolve) => {
        canvas.toBlob(resolve, type, quality);
      });
    },

    /**
     * Format a descriptive, tournament-aware filename for exports
     */
    formatExportFilename(template, dataContext = {}, pageIndex = null) {
      const tournRaw = dataContext.tournament?.name || template?.info?.tournamentName || 'Tournament';
      const cleanTourn = tournRaw.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_');

      const matchRaw = dataContext.mode === 'single' && dataContext.match?.match_number
        ? `Match_${dataContext.match.match_number}`
        : 'Overall_Standings';

      const tmplRaw = (template?.name || 'Theme').replace(/[^a-zA-Z0-9_-]/g, '_');
      const pageSuffix = (pageIndex !== null && pageIndex > 0) ? `_Page${pageIndex + 1}` : '';

      return `${cleanTourn}_${matchRaw}_${tmplRaw}${pageSuffix}.png`;
    },

    /**
     * Render canvas for a specific page slice
     */
    async exportPageCanvas(template, dataContext, pageIndex = 0, options = {}) {
      if (!template) throw new Error('Template is required.');
      const clone = JSON.parse(JSON.stringify(template));
      const table = clone.fields?.find((f) => f.type === 'leaderboard');
      if (table) {
        table.pageIndex = pageIndex;
      }
      return await this.generateCanvas(clone, dataContext, options);
    },

    /**
     * Download rendered point table as PNG
     *
     * @param {Object} template
     * @param {Object} dataContext
     * @param {string} [filename]
     * @param {Object} [options] - { scale: number, pageIndex: number }
     */
    async downloadPNG(template, dataContext, filename, options = {}) {
      const scale = options.scale || 2;
      const pageIndex = options.pageIndex !== undefined ? options.pageIndex : (template?.fields?.find(f => f.type === 'leaderboard')?.pageIndex || null);

      const canvas = pageIndex !== null
        ? await this.exportPageCanvas(template, dataContext, pageIndex, { scale })
        : await this.generateCanvas(template, dataContext, { scale });

      const blob = await this.canvasToBlob(canvas, 'image/png', 1.0);
      const safeName = filename || this.formatExportFilename(template, dataContext, pageIndex);

      if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = safeName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      }

      return { filename: safeName, blob, canvas };
    },

    /**
     * Download all pages of a multi-page tournament point table
     */
    async downloadAllPages(template, dataContext, options = {}) {
      const table = template?.fields?.find((f) => f.type === 'leaderboard');
      const maxRows = table?.maxRows || 12;
      const totalTeams = dataContext?.leaderboard?.length || 12;
      const totalPages = Math.max(1, Math.ceil(totalTeams / maxRows));

      const results = [];
      for (let p = 0; p < totalPages; p++) {
        const res = await this.downloadPNG(template, dataContext, null, { ...options, pageIndex: p });
        results.push(res);
        // Small delay between downloads for browser stability
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
      return results;
    },

    /**
     * Download or trigger PDF print for point table
     *
     * @param {Object} template
     * @param {Object} dataContext
     * @param {string} [filename]
     */
    async downloadPDF(template, dataContext, filename) {
      const canvas = await this.generateCanvas(template, dataContext, { scale: 2 });
      const dataUrl = canvas.toDataURL('image/png');

      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        throw new Error('Popup blocked. Please allow popups to generate PDF.');
      }

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>${template.name || 'Point Table'} - LRD PointCalc</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 0;
            }
            body {
              margin: 0;
              padding: 0;
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
              background: #000;
            }
            img {
              max-width: 100%;
              max-height: 100vh;
              object-fit: contain;
              display: block;
              margin: auto;
            }
          </style>
        </head>
        <body>
          <img src="${dataUrl}" onload="window.print();window.close();" />
        </body>
        </html>
      `);
      printWindow.document.close();
      return true;
    },

    /**
     * Share rendered point table using Web Share API
     *
     * @param {Object} template
     * @param {Object} dataContext
     * @param {string} [title]
     */
    async shareImage(template, dataContext, title) {
      const canvas = await this.generateCanvas(template, dataContext, { scale: 2 });
      const blob = await this.canvasToBlob(canvas, 'image/png', 0.95);
      const safeName = `${(template.name || 'PointTable').replace(/\s+/g, '_')}.png`;

      const file = new File([blob], safeName, { type: 'image/png' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: title || template.name || 'Free Fire Point Table',
          text: `Check out the standings from ${dataContext.tournament?.name || 'the tournament'} generated on LRD PointCalc!`,
          files: [file],
        });
        return { method: 'share' };
      } else {
        // Fallback to PNG download
        await this.downloadPNG(template, dataContext, safeName);
        return { method: 'download' };
      }
    },
  };

  window.ExportEngine = ExportEngine;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ExportEngine;
  }
})(typeof window !== 'undefined' ? window : global);
