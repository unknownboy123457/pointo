/* ====================================================================
   LRD PointCalc — Template Renderer Engine
   ====================================================================
   PURPOSE:
   Renders point-table templates into DOM elements (for UI/Editor)
   and HTML5 Canvas (for high-resolution PNG export).
   CRITICAL: Presentation ONLY. Scoring calculations come exclusively
   from ScoringEngine via dataContext.
   ==================================================================== */

(function (window) {
  'use strict';

  /**
   * Safe HTML string escaper
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

  // ==================================================================
  // DOM RENDERING (For Live Preview & Canvas Editor)
  // ==================================================================

  /**
   * Render a template to an HTML DOM container
   *
   * @param {Object} template - Template definition
   * @param {Object} dataContext - { tournament, match, leaderboard, mode, info }
   * @param {HTMLElement} container - DOM element to render into
   * @param {Object} [options] - { isEditor: boolean, selectedFieldId: string }
   */
  function renderToDOM(template, dataContext, container, options = {}) {
    if (!template || !container) return;

    const canvasWidth = template.canvas?.width || 1080;
    const canvasHeight = template.canvas?.height || 1350;

    // Build lookup context for variable interpolation
    const context = {
      tournament: dataContext.tournament || {},
      match: dataContext.match || {},
      info: { ...(template.info || {}), ...(dataContext.info || {}) },
      mode: dataContext.mode || 'overall',
    };

    container.innerHTML = '';
    const canvasEl = document.createElement('div');
    canvasEl.className = 'lrd-template-canvas';
    canvasEl.style.width = `${canvasWidth}px`;
    canvasEl.style.height = `${canvasHeight}px`;
    canvasEl.style.position = 'relative';
    canvasEl.style.overflow = 'hidden';
    canvasEl.style.boxSizing = 'border-box';

    // 1. Render Background
    applyBackgroundToElement(template.background, canvasEl);

    // 2. Render Fields
    const fields = template.fields || [];
    fields.forEach((field) => {
      const fieldEl = createFieldElement(field, context, dataContext.leaderboard || [], options);
      if (fieldEl) {
        canvasEl.appendChild(fieldEl);
      }
    });

    container.appendChild(canvasEl);
  }

  /**
   * Apply background configuration to a DOM element
   */
  function applyBackgroundToElement(bg, el) {
    if (!bg) {
      el.style.backgroundColor = '#0a0b10';
      return;
    }

    if (bg.type === 'image' && bg.value) {
      el.style.backgroundImage = `url("${bg.value}")`;
      el.style.backgroundSize = 'cover';
      el.style.backgroundPosition = 'center';
      el.style.backgroundRepeat = 'no-repeat';
    } else if (bg.type === 'gradient' && bg.value) {
      el.style.background = bg.overlay ? `${bg.overlay}, ${bg.value}` : bg.value;
    } else if (bg.type === 'color' && bg.value) {
      el.style.backgroundColor = bg.value;
    } else {
      el.style.backgroundColor = '#0d0f18';
    }
  }

  /**
   * Create DOM element for a template field
   */
  function createFieldElement(field, context, leaderboard, options = {}) {
    const el = document.createElement('div');
    el.className = `lrd-template-field field-type-${field.type}`;
    el.dataset.fieldId = field.id;

    if (options.isEditor) {
      el.classList.add('editor-field');
      if (options.selectedFieldId === field.id) {
        el.classList.add('is-selected');
      }
    }

    // Geometry styles
    el.style.position = 'absolute';
    el.style.left = `${field.x}px`;
    el.style.top = `${field.y}px`;
    el.style.width = `${field.width}px`;
    el.style.height = `${field.height}px`;
    el.style.boxSizing = 'border-box';
    if (field.opacity !== undefined) el.style.opacity = field.opacity;
    if (field.borderRadius) el.style.borderRadius = `${field.borderRadius}px`;
    if (field.backgroundColor) el.style.backgroundColor = field.backgroundColor;
    if (field.border) el.style.border = field.border;

    // Field types
    if (field.type === 'text') {
      renderTextFieldDOM(field, el, context);
    } else if (field.type === 'leaderboard') {
      renderLeaderboardFieldDOM(field, el, leaderboard, context);
    } else if (field.type === 'image' || field.type === 'logo') {
      renderImageFieldDOM(field, el);
    }

    return el;
  }

  /**
   * Render text field into DOM element
   */
  function renderTextFieldDOM(field, el, context) {
    const rawContent = field.content || '';
    const resolvedText = window.TemplateVariables
      ? window.TemplateVariables.resolveVariables(rawContent, context)
      : rawContent;

    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.justifyContent =
      field.alignment === 'center' ? 'center' : field.alignment === 'right' ? 'flex-end' : 'flex-start';
    el.style.fontSize = `${field.fontSize || 20}px`;
    el.style.fontFamily = field.fontFamily || 'Inter, sans-serif';
    el.style.fontWeight = field.fontWeight || '600';
    el.style.color = field.color || '#ffffff';
    el.style.letterSpacing = field.letterSpacing || 'normal';
    el.style.whiteSpace = 'nowrap';
    el.style.overflow = 'hidden';
    el.style.textOverflow = 'ellipsis';
    el.style.padding = field.padding || '0 8px';

    el.textContent = resolvedText;
  }

  /**
   * Render repeating leaderboard table into DOM element
   */
  function renderLeaderboardFieldDOM(field, el, leaderboard = [], context = {}) {
    el.style.display = 'flex';
    el.style.flexDirection = 'column';
    el.style.overflow = 'hidden';

    const columns = field.columns || [
      { key: 'rank', label: '#', width: 80, align: 'center' },
      { key: 'teamName', label: 'TEAM', width: 440, align: 'left' },
      { key: 'position', label: 'PLC', width: 140, align: 'center' },
      { key: 'kills', label: 'KILLS', width: 140, align: 'center' },
      { key: 'totalPoints', label: 'PTS', width: 160, align: 'center', highlight: true },
    ];

    const rowHeight = field.rowHeight || 60;
    const headerHeight = field.headerHeight || 44;
    const maxRows = field.maxRows || 12;

    // Table Header
    const headerEl = document.createElement('div');
    headerEl.className = 'leaderboard-header-row';
    headerEl.style.display = 'flex';
    headerEl.style.height = `${headerHeight}px`;
    headerEl.style.minHeight = `${headerHeight}px`;
    headerEl.style.alignItems = 'center';
    if (field.headerStyle?.backgroundColor) headerEl.style.background = field.headerStyle.backgroundColor;
    if (field.headerStyle?.borderBottom) headerEl.style.borderBottom = field.headerStyle.borderBottom;

    columns.forEach((col) => {
      const colEl = document.createElement('div');
      colEl.className = `lb-col lb-col-${col.key}`;
      colEl.style.flex = `0 0 ${col.width}px`;
      colEl.style.maxWidth = `${col.width}px`;
      colEl.style.textAlign = col.align || 'center';
      colEl.style.color = field.headerStyle?.color || '#d4af37';
      colEl.style.fontSize = `${field.headerStyle?.fontSize || 16}px`;
      colEl.style.fontWeight = field.headerStyle?.fontWeight || '800';
      colEl.style.letterSpacing = field.headerStyle?.letterSpacing || '1px';
      colEl.style.padding = '0 8px';
      colEl.style.boxSizing = 'border-box';
      colEl.textContent = col.label;
      headerEl.appendChild(colEl);
    });

    el.appendChild(headerEl);

    // Rows Container
    const rowsContainer = document.createElement('div');
    rowsContainer.className = 'leaderboard-rows-container';
    rowsContainer.style.display = 'flex';
    rowsContainer.style.flexDirection = 'column';
    rowsContainer.style.flex = '1';

    // Take top maxRows from leaderboard
    const displayRows = leaderboard.slice(0, maxRows);

    displayRows.forEach((rowData, idx) => {
      const rank = rowData.rank || idx + 1;
      const rowEl = document.createElement('div');
      rowEl.className = `leaderboard-data-row rank-${rank}`;
      rowEl.style.display = 'flex';
      rowEl.style.height = `${rowHeight}px`;
      rowEl.style.minHeight = `${rowHeight}px`;
      rowEl.style.alignItems = 'center';
      rowEl.style.boxSizing = 'border-box';

      // Background striping
      const isAlt = idx % 2 === 1;
      const baseBg = isAlt
        ? field.rowStyle?.alternateColor || 'rgba(255,255,255,0.04)'
        : field.rowStyle?.backgroundColor || 'rgba(255,255,255,0.01)';

      rowEl.style.backgroundColor = baseBg;
      if (field.rowStyle?.borderBottom) rowEl.style.borderBottom = field.rowStyle.borderBottom;

      // Special top 3 styling if enabled
      let rowColor = field.rowStyle?.color || '#ffffff';
      let rankBadgeBg = 'transparent';
      let rankBadgeColor = '#8e92a4';

      if (field.rowStyle?.top3Gold) {
        if (rank === 1) {
          rowEl.style.backgroundColor = 'rgba(212, 175, 55, 0.16)';
          rankBadgeBg = '#d4af37';
          rankBadgeColor = '#09090d';
        } else if (rank === 2) {
          rowEl.style.backgroundColor = 'rgba(192, 192, 192, 0.12)';
          rankBadgeBg = '#c0c0c0';
          rankBadgeColor = '#09090d';
        } else if (rank === 3) {
          rowEl.style.backgroundColor = 'rgba(205, 127, 50, 0.12)';
          rankBadgeBg = '#cd7f32';
          rankBadgeColor = '#09090d';
        }
      }

      columns.forEach((col) => {
        const colEl = document.createElement('div');
        colEl.className = `lb-col lb-col-${col.key}`;
        colEl.style.flex = `0 0 ${col.width}px`;
        colEl.style.maxWidth = `${col.width}px`;
        colEl.style.textAlign = col.align || 'center';
        colEl.style.color = rowColor;
        colEl.style.fontSize = `${field.rowStyle?.fontSize || 20}px`;
        colEl.style.fontWeight = field.rowStyle?.fontWeight || '600';
        colEl.style.padding = '0 8px';
        colEl.style.boxSizing = 'border-box';
        colEl.style.whiteSpace = 'nowrap';
        colEl.style.overflow = 'hidden';
        colEl.style.textOverflow = 'ellipsis';

        // Extract value
        let val = '';
        if (col.key === 'rank') {
          colEl.innerHTML = `<span style="display:inline-block; width:34px; height:34px; line-height:34px; border-radius:17px; background:${rankBadgeBg}; color:${rankBadgeColor}; font-weight:800; font-size:18px;">${rank}</span>`;
        } else if (col.key === 'teamName') {
          colEl.style.fontWeight = '700';
          val = rowData.teamName || rowData.name || `Team ${rank}`;
          colEl.textContent = val;
        } else if (col.key === 'position') {
          val = rowData.placement !== undefined ? rowData.placement : (rowData.position !== undefined ? rowData.position : '-');
          colEl.textContent = val;
        } else if (col.key === 'kills') {
          val = rowData.kills !== undefined ? rowData.kills : 0;
          colEl.textContent = val;
        } else if (col.key === 'totalPoints' || col.key === 'points') {
          val = rowData.totalPoints !== undefined ? rowData.totalPoints : (rowData.total_points !== undefined ? rowData.total_points : 0);
          colEl.innerHTML = `<span style="color:#d4af37; font-weight:800; font-size:22px;">${val}</span>`;
        } else if (col.key === 'placementPoints') {
          val = rowData.placementPoints !== undefined ? rowData.placementPoints : 0;
          colEl.textContent = val;
        } else if (col.key === 'killPoints') {
          val = rowData.killPoints !== undefined ? rowData.killPoints : 0;
          colEl.textContent = val;
        } else if (col.key === 'matchesPlayed') {
          val = rowData.matchesPlayed !== undefined ? rowData.matchesPlayed : 1;
          colEl.textContent = val;
        } else if (col.key === 'booyahs') {
          val = rowData.booyahs !== undefined ? rowData.booyahs : (rowData.placement === 1 ? 1 : 0);
          colEl.textContent = val;
        } else {
          val = rowData[col.key] || '-';
          colEl.textContent = val;
        }

        rowEl.appendChild(colEl);
      });

      rowsContainer.appendChild(rowEl);
    });

    el.appendChild(rowsContainer);
  }

  /**
   * Render image or logo field into DOM element
   */
  function renderImageFieldDOM(field, el) {
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';

    if (field.src) {
      const img = document.createElement('img');
      img.src = field.src;
      img.alt = field.alt || 'Template Image';
      img.style.maxWidth = '100%';
      img.style.maxHeight = '100%';
      img.style.objectFit = field.fit || 'contain';
      el.appendChild(img);
    } else {
      // Placeholder box in editor
      el.style.border = '1px dashed #d4af37';
      el.style.color = '#d4af37';
      el.style.fontSize = '14px';
      el.textContent = field.type === 'logo' ? 'LOGO' : 'IMAGE';
    }
  }

  // ==================================================================
  // HTML5 CANVAS RENDERING (For Crisp PNG Export)
  // ==================================================================

  /**
   * Render a template to an off-screen HTML5 Canvas
   *
   * @param {Object} template - Template definition
   * @param {Object} dataContext - { tournament, match, leaderboard, mode, info }
   * @param {number} [scaleFactor=1] - Pixel scale (2 for 2x crisp retina export)
   * @returns {Promise<HTMLCanvasElement>} Rendered canvas
   */
  async function renderToCanvas(template, dataContext, scaleFactor = 1) {
    const baseW = template.canvas?.width || 1080;
    const baseH = template.canvas?.height || 1350;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(baseW * scaleFactor);
    canvas.height = Math.round(baseH * scaleFactor);

    const ctx = canvas.getContext('2d');
    ctx.scale(scaleFactor, scaleFactor);

    // 1. Draw Background
    await drawBackgroundOnCanvas(ctx, template.background, baseW, baseH);

    // Build context
    const context = {
      tournament: dataContext.tournament || {},
      match: dataContext.match || {},
      info: { ...(template.info || {}), ...(dataContext.info || {}) },
      mode: dataContext.mode || 'overall',
    };

    // 2. Draw Fields
    const fields = template.fields || [];
    for (const field of fields) {
      if (field.type === 'text') {
        drawTextFieldOnCanvas(ctx, field, context);
      } else if (field.type === 'leaderboard') {
        drawLeaderboardOnCanvas(ctx, field, dataContext.leaderboard || []);
      } else if (field.type === 'image' || field.type === 'logo') {
        await drawImageOnCanvas(ctx, field);
      }
    }

    return canvas;
  }

  /**
   * Draw background on 2D context
   */
  async function drawBackgroundOnCanvas(ctx, bg, w, h) {
    if (!bg) {
      ctx.fillStyle = '#0a0b10';
      ctx.fillRect(0, 0, w, h);
      return;
    }

    if (bg.type === 'image' && bg.value) {
      try {
        const img = await loadImage(bg.value);
        ctx.drawImage(img, 0, 0, w, h);
      } catch (e) {
        ctx.fillStyle = '#0d0f18';
        ctx.fillRect(0, 0, w, h);
      }
    } else {
      // Solid or fallback gradient
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#0d0f18');
      grad.addColorStop(1, '#06070b');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Gold subtle header glow
      const radial = ctx.createRadialGradient(w / 2, 0, 10, w / 2, 0, w * 0.6);
      radial.addColorStop(0, 'rgba(212, 175, 55, 0.18)');
      radial.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = radial;
      ctx.fillRect(0, 0, w, h);
    }
  }

  /**
   * Draw text field on 2D context
   */
  function drawTextFieldOnCanvas(ctx, field, context) {
    const rawContent = field.content || '';
    const resolvedText = window.TemplateVariables
      ? window.TemplateVariables.resolveVariables(rawContent, context)
      : rawContent;

    ctx.save();

    if (field.opacity !== undefined) ctx.globalAlpha = field.opacity;

    // Background box if any
    if (field.backgroundColor) {
      ctx.fillStyle = field.backgroundColor;
      if (field.borderRadius) {
        drawRoundedRect(ctx, field.x, field.y, field.width, field.height, field.borderRadius);
        ctx.fill();
      } else {
        ctx.fillRect(field.x, field.y, field.width, field.height);
      }
    }

    // Font setup
    const fontWeight = field.fontWeight || '600';
    const fontSize = field.fontSize || 20;
    const fontFamily = field.fontFamily || 'Inter, sans-serif';
    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    ctx.fillStyle = field.color || '#ffffff';
    ctx.textBaseline = 'middle';

    let drawX = field.x;
    if (field.alignment === 'center') {
      ctx.textAlign = 'center';
      drawX = field.x + field.width / 2;
    } else if (field.alignment === 'right') {
      ctx.textAlign = 'right';
      drawX = field.x + field.width - 12;
    } else {
      ctx.textAlign = 'left';
      drawX = field.x + 12;
    }

    const drawY = field.y + field.height / 2;
    ctx.fillText(resolvedText, drawX, drawY);

    ctx.restore();
  }

  /**
   * Draw repeating leaderboard table on 2D context
   */
  function drawLeaderboardOnCanvas(ctx, field, leaderboard = []) {
    ctx.save();

    const columns = field.columns || [
      { key: 'rank', label: '#', width: 80, align: 'center' },
      { key: 'teamName', label: 'TEAM', width: 440, align: 'left' },
      { key: 'position', label: 'PLC', width: 140, align: 'center' },
      { key: 'kills', label: 'KILLS', width: 140, align: 'center' },
      { key: 'totalPoints', label: 'PTS', width: 160, align: 'center', highlight: true },
    ];

    const rowHeight = field.rowHeight || 64;
    const headerHeight = field.headerHeight || 46;
    const maxRows = field.maxRows || 12;

    // Draw Header
    ctx.fillStyle = field.headerStyle?.backgroundColor || 'rgba(212, 175, 55, 0.15)';
    ctx.fillRect(field.x, field.y, field.width, headerHeight);

    // Header border bottom
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(field.x, field.y + headerHeight);
    ctx.lineTo(field.x + field.width, field.y + headerHeight);
    ctx.stroke();

    // Header columns text
    ctx.font = `800 ${field.headerStyle?.fontSize || 16}px Inter, sans-serif`;
    ctx.fillStyle = field.headerStyle?.color || '#d4af37';
    ctx.textBaseline = 'middle';

    let currentX = field.x;
    columns.forEach((col) => {
      let colX = currentX + col.width / 2;
      ctx.textAlign = col.align || 'center';
      if (col.align === 'left') colX = currentX + 16;
      if (col.align === 'right') colX = currentX + col.width - 16;
      ctx.fillText(col.label, colX, field.y + headerHeight / 2);
      currentX += col.width;
    });

    // Draw Rows
    const displayRows = leaderboard.slice(0, maxRows);
    let rowY = field.y + headerHeight;

    displayRows.forEach((row, idx) => {
      const rank = row.rank || idx + 1;
      const isAlt = idx % 2 === 1;

      // Row background
      let rowBg = isAlt ? 'rgba(255, 255, 255, 0.04)' : 'rgba(255, 255, 255, 0.015)';
      let badgeBg = 'transparent';
      let badgeColor = '#8e92a4';

      if (field.rowStyle?.top3Gold) {
        if (rank === 1) {
          rowBg = 'rgba(212, 175, 55, 0.18)';
          badgeBg = '#d4af37';
          badgeColor = '#09090d';
        } else if (rank === 2) {
          rowBg = 'rgba(192, 192, 192, 0.12)';
          badgeBg = '#c0c0c0';
          badgeColor = '#09090d';
        } else if (rank === 3) {
          rowBg = 'rgba(205, 127, 50, 0.12)';
          badgeBg = '#cd7f32';
          badgeColor = '#09090d';
        }
      }

      ctx.fillStyle = rowBg;
      ctx.fillRect(field.x, rowY, field.width, rowHeight);

      // Row divider
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(field.x, rowY + rowHeight);
      ctx.lineTo(field.x + field.width, rowY + rowHeight);
      ctx.stroke();

      // Row columns text
      ctx.font = `600 ${field.rowStyle?.fontSize || 20}px Inter, sans-serif`;
      ctx.fillStyle = '#ffffff';
      ctx.textBaseline = 'middle';

      let rowX = field.x;
      columns.forEach((col) => {
        let drawColX = rowX + col.width / 2;
        ctx.textAlign = col.align || 'center';
        if (col.align === 'left') drawColX = rowX + 16;
        if (col.align === 'right') drawColX = rowX + col.width - 16;

        let textVal = '';
        if (col.key === 'rank') {
          if (badgeBg !== 'transparent') {
            ctx.fillStyle = badgeBg;
            ctx.beginPath();
            ctx.arc(drawColX, rowY + rowHeight / 2, 16, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = badgeColor;
            ctx.font = '800 17px Inter, sans-serif';
            ctx.fillText(String(rank), drawColX, rowY + rowHeight / 2);
            ctx.font = `600 ${field.rowStyle?.fontSize || 20}px Inter, sans-serif`;
            ctx.fillStyle = '#ffffff';
          } else {
            ctx.fillStyle = '#8e92a4';
            ctx.fillText(String(rank), drawColX, rowY + rowHeight / 2);
            ctx.fillStyle = '#ffffff';
          }
        } else if (col.key === 'teamName') {
          textVal = row.teamName || row.name || `Team ${rank}`;
          ctx.font = '700 22px Inter, sans-serif';
          ctx.fillText(textVal, drawColX, rowY + rowHeight / 2);
          ctx.font = `600 ${field.rowStyle?.fontSize || 20}px Inter, sans-serif`;
        } else if (col.key === 'totalPoints' || col.key === 'points') {
          textVal = String(row.totalPoints !== undefined ? row.totalPoints : (row.total_points || 0));
          ctx.fillStyle = '#d4af37';
          ctx.font = '800 24px Inter, sans-serif';
          ctx.fillText(textVal, drawColX, rowY + rowHeight / 2);
          ctx.font = `600 ${field.rowStyle?.fontSize || 20}px Inter, sans-serif`;
          ctx.fillStyle = '#ffffff';
        } else if (col.key === 'position') {
          textVal = String(row.placement !== undefined ? row.placement : (row.position || '-'));
          ctx.fillText(textVal, drawColX, rowY + rowHeight / 2);
        } else if (col.key === 'kills') {
          textVal = String(row.kills !== undefined ? row.kills : 0);
          ctx.fillText(textVal, drawColX, rowY + rowHeight / 2);
        } else {
          textVal = String(row[col.key] || '-');
          ctx.fillText(textVal, drawColX, rowY + rowHeight / 2);
        }

        rowX += col.width;
      });

      rowY += rowHeight;
    });

    ctx.restore();
  }

  /**
   * Draw image field on 2D context
   */
  async function drawImageOnCanvas(ctx, field) {
    if (!field.src) return;
    try {
      const img = await loadImage(field.src);
      ctx.save();
      if (field.opacity !== undefined) ctx.globalAlpha = field.opacity;
      ctx.drawImage(img, field.x, field.y, field.width, field.height);
      ctx.restore();
    } catch (e) {
      console.warn('TemplateRenderer: Failed to draw image field:', e);
    }
  }

  /**
   * Helper: Load image asynchronously
   */
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  /**
   * Helper: Draw rounded rectangle path
   */
  function drawRoundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  // Export module
  const TemplateRenderer = {
    renderToDOM,
    renderToCanvas,
    applyBackgroundToElement,
  };

  window.TemplateRenderer = TemplateRenderer;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = TemplateRenderer;
  }
})(typeof window !== 'undefined' ? window : global);
