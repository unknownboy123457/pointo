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
     * Download rendered point table as PNG
     *
     * @param {Object} template
     * @param {Object} dataContext
     * @param {string} [filename]
     */
    async downloadPNG(template, dataContext, filename) {
      const canvas = await this.generateCanvas(template, dataContext, { scale: 2 });
      const blob = await this.canvasToBlob(canvas, 'image/png', 1.0);

      const safeName = filename || `${(template.name || 'PointTable').replace(/\s+/g, '_')}_${Date.now()}.png`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = safeName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setTimeout(() => URL.revokeObjectURL(url), 2000);
      return safeName;
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
