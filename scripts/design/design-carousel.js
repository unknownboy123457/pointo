/* ====================================================================
   LRD PointCalc — Design Carousel Component
   ====================================================================
   PURPOSE:
   Horizontal swipeable carousel for esports point-table designs.
   Supports touch gestures, peek previews, selection glow, and
   dynamic preview rendering via TemplateRenderer.
   ==================================================================== */

(function (window) {
  'use strict';

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    if (window.escapeHtml) return window.escapeHtml(str);
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  class DesignCarousel {
    constructor(containerEl, options = {}) {
      this.container = containerEl;
      this.templates = [];
      this.selectedIndex = 0;
      this.dataContext = options.dataContext || {};
      this.currentUser = options.currentUser || null;
      this.onSelect = options.onSelect || null;
      this.onUse = options.onUse || null;
      this.onCustomize = options.onCustomize || null;
      this.onUnlock = options.onUnlock || null;

      // Touch & Drag Tracking
      this.startX = 0;
      this.currentX = 0;
      this.isDragging = false;
      this.dragOffset = 0;

      // DOM sub-elements
      this.trackEl = null;
      this.prevBtn = null;
      this.nextBtn = null;
      this.dotsWrap = null;
    }

    /**
     * Update dataContext for live previews (e.g. when tournament or match changes)
     */
    setDataContext(dataContext) {
      this.dataContext = dataContext || {};
      this.refreshPreviews();
    }

    /**
     * Set templates list and optionally select an index
     */
    setTemplates(templates, selectedId = null) {
      this.templates = Array.isArray(templates) ? templates : [];
      if (selectedId) {
        const foundIdx = this.templates.findIndex((t) => t.id === selectedId);
        this.selectedIndex = foundIdx !== -1 ? foundIdx : 0;
      } else {
        this.selectedIndex = Math.min(this.selectedIndex, Math.max(0, this.templates.length - 1));
      }

      this.render();
      if (this.templates.length > 0 && this.onSelect) {
        this.onSelect(this.templates[this.selectedIndex], this.selectedIndex);
      }
    }

    /**
     * Get currently selected template
     */
    getSelectedTemplate() {
      return this.templates[this.selectedIndex] || null;
    }

    /**
     * Render the carousel DOM structure
     */
    render() {
      if (!this.container) return;
      this.container.innerHTML = '';

      if (this.templates.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'carousel-empty';
        empty.innerHTML = `
          <div class="carousel-empty__icon">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
            </svg>
          </div>
          <p class="carousel-empty__title">No templates found</p>
          <p class="carousel-empty__sub">Try a different search term or import your own design.</p>
        `;
        this.container.appendChild(empty);
        return;
      }

      // Outer wrapper
      const wrapper = document.createElement('div');
      wrapper.className = 'lrd-carousel-wrapper';

      // Navigation arrows
      const prevBtn = document.createElement('button');
      prevBtn.type = 'button';
      prevBtn.className = 'carousel-arrow carousel-arrow--prev';
      prevBtn.setAttribute('aria-label', 'Previous design');
      prevBtn.innerHTML = `
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg>
      `;

      const nextBtn = document.createElement('button');
      nextBtn.type = 'button';
      nextBtn.className = 'carousel-arrow carousel-arrow--next';
      nextBtn.setAttribute('aria-label', 'Next design');
      nextBtn.innerHTML = `
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg>
      `;

      // Carousel Track viewport
      const track = document.createElement('div');
      track.className = 'lrd-carousel-track';

      this.templates.forEach((tmpl, idx) => {
        const isSelected = idx === this.selectedIndex;
        const isAllowed = window.TemplateStore?.isPremiumTemplateAllowed(tmpl.id, this.currentUser);
        const isLocked = !isAllowed;

        const card = document.createElement('div');
        card.className = `carousel-card ${isSelected ? 'carousel-card--selected' : ''} ${isLocked ? 'carousel-card--locked' : ''}`;
        card.dataset.index = idx;
        card.dataset.templateId = tmpl.id;

        // Badge markup
        let badgeHtml = '';
        if (tmpl.category === 'premium') {
          badgeHtml = '<div class="card-badge badge-prem">PREMIUM 🔒</div>';
        } else if (tmpl.category === 'custom') {
          badgeHtml = '<div class="card-badge badge-cust">CUSTOM</div>';
        } else {
          badgeHtml = '<div class="card-badge badge-free">FREE</div>';
        }

        const selectedIndicator = `
          <div class="card-selected-badge ${isSelected ? 'visible' : ''}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
            <span>Selected</span>
          </div>
        `;

        card.innerHTML = `
          <div class="carousel-card__preview-frame">
            <div class="carousel-card__canvas-slot" id="carousel-thumb-${tmpl.id}"></div>
            ${badgeHtml}
            ${selectedIndicator}
            ${isLocked ? `
              <div class="carousel-card__lock-mask">
                <div class="card-lock-icon">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                </div>
                <span class="card-lock-label">Premium Design</span>
              </div>
            ` : ''}
          </div>
          <div class="carousel-card__meta">
            <h3 class="carousel-card__title">${escapeHtml(tmpl.name)}</h3>
            <p class="carousel-card__desc">${escapeHtml(tmpl.description || 'Esports point table design')}</p>
            <div class="carousel-card__action-row">
              ${isLocked ? `
                <button type="button" class="btn-card-use btn-card-use--unlock" data-action="unlock" data-id="${tmpl.id}">
                  <span>Unlock Premium</span>
                </button>
              ` : `
                <button type="button" class="btn-card-customize" data-action="customize" data-id="${tmpl.id}">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                  <span>Customize</span>
                </button>
                <button type="button" class="btn-card-use" data-action="use" data-id="${tmpl.id}">
                  <span>Use Design</span>
                </button>
              `}
            </div>
          </div>
        `;

        // Card click / selection
        card.addEventListener('click', (e) => {
          const actionBtn = e.target.closest('[data-action]');
          if (actionBtn) {
            const action = actionBtn.dataset.action;
            if (action === 'unlock') {
              if (this.onUnlock) this.onUnlock(tmpl);
            } else if (action === 'customize') {
              if (this.onCustomize) this.onCustomize(tmpl);
            } else if (action === 'use') {
              if (this.onUse) this.onUse(tmpl);
            }
            return;
          }

          // Otherwise select this card in carousel
          this.selectIndex(idx);
        });

        track.appendChild(card);
      });

      wrapper.appendChild(prevBtn);
      wrapper.appendChild(track);
      wrapper.appendChild(nextBtn);

      // Indicators (dots)
      const dotsWrap = document.createElement('div');
      dotsWrap.className = 'carousel-dots';
      this.templates.forEach((_, i) => {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = `carousel-dot ${i === this.selectedIndex ? 'active' : ''}`;
        dot.setAttribute('aria-label', `Go to design ${i + 1}`);
        dot.addEventListener('click', () => this.selectIndex(i));
        dotsWrap.appendChild(dot);
      });

      this.container.appendChild(wrapper);
      this.container.appendChild(dotsWrap);

      // Save references
      this.trackEl = track;
      this.prevBtn = prevBtn;
      this.nextBtn = nextBtn;
      this.dotsWrap = dotsWrap;

      // Event listeners for navigation
      prevBtn.addEventListener('click', () => this.prev());
      nextBtn.addEventListener('click', () => this.next());

      // Bind touch and drag swipe gestures
      this.bindGestures();

      // Render thumbnails into DOM slots
      this.refreshPreviews();

      // Scroll to active card
      this.scrollToSelected(false);
    }

    /**
     * Render live template previews inside thumbnail slots
     */
    refreshPreviews() {
      if (!this.trackEl || !window.TemplateRenderer) return;

      this.templates.forEach((tmpl) => {
        const slotEl = this.trackEl.querySelector(`#carousel-thumb-${tmpl.id}`);
        if (!slotEl) return;

        // If template has fields, render real DOM preview
        if (tmpl.fields && tmpl.fields.length > 0) {
          window.TemplateRenderer.renderToDOM(
            tmpl,
            this.dataContext,
            slotEl,
            { isEditor: false }
          );
        } else {
          // Fallback background block
          slotEl.innerHTML = '';
          const bgDiv = document.createElement('div');
          bgDiv.style.width = '100%';
          bgDiv.style.height = '100%';
          bgDiv.style.background = tmpl.background?.value || '#0e111a';
          slotEl.appendChild(bgDiv);
        }
      });
    }

    /**
     * Select a card by index
     */
    selectIndex(idx) {
      if (idx < 0 || idx >= this.templates.length) return;
      this.selectedIndex = idx;

      // Update card visual classes
      const cards = this.trackEl?.querySelectorAll('.carousel-card') || [];
      cards.forEach((c, i) => {
        const isSel = i === idx;
        c.classList.toggle('carousel-card--selected', isSel);
        const badge = c.querySelector('.card-selected-badge');
        if (badge) badge.classList.toggle('visible', isSel);
      });

      // Update dots
      const dots = this.dotsWrap?.querySelectorAll('.carousel-dot') || [];
      dots.forEach((d, i) => {
        d.classList.toggle('active', i === idx);
      });

      this.scrollToSelected(true);

      if (this.onSelect) {
        this.onSelect(this.templates[idx], idx);
      }
    }

    /**
     * Go to next design
     */
    next() {
      if (this.selectedIndex < this.templates.length - 1) {
        this.selectIndex(this.selectedIndex + 1);
      } else {
        // Loop around
        this.selectIndex(0);
      }
    }

    /**
     * Go to previous design
     */
    prev() {
      if (this.selectedIndex > 0) {
        this.selectIndex(this.selectedIndex - 1);
      } else {
        // Loop around
        this.selectIndex(this.templates.length - 1);
      }
    }

    /**
     * Smoothly scroll carousel track to center the selected card
     */
    scrollToSelected(smooth = true) {
      if (!this.trackEl) return;
      const cards = this.trackEl.querySelectorAll('.carousel-card');
      const targetCard = cards[this.selectedIndex];
      if (!targetCard) return;

      const trackRect = this.trackEl.getBoundingClientRect();
      const cardRect = targetCard.getBoundingClientRect();

      const scrollLeft = targetCard.offsetLeft - (this.trackEl.clientWidth - targetCard.clientWidth) / 2;

      this.trackEl.scrollTo({
        left: Math.max(0, scrollLeft),
        behavior: smooth ? 'smooth' : 'auto',
      });
    }

    /**
     * Attach mobile touch and mouse drag gestures
     */
    bindGestures() {
      if (!this.trackEl) return;

      let startScrollLeft = 0;
      let startX = 0;
      let isTouching = false;

      // Touch events
      this.trackEl.addEventListener('touchstart', (e) => {
        isTouching = true;
        startX = e.touches[0].pageX;
        startScrollLeft = this.trackEl.scrollLeft;
      }, { passive: true });

      this.trackEl.addEventListener('touchmove', (e) => {
        if (!isTouching) return;
        const currentX = e.touches[0].pageX;
        const diffX = startX - currentX;
        this.trackEl.scrollLeft = startScrollLeft + diffX;
      }, { passive: true });

      this.trackEl.addEventListener('touchend', (e) => {
        if (!isTouching) return;
        isTouching = false;
        this.snapToClosestCard();
      });

      // Mouse drag support for desktop/testing
      let isMouseDown = false;
      let mouseStartX = 0;
      let mouseStartScroll = 0;

      this.trackEl.addEventListener('mousedown', (e) => {
        isMouseDown = true;
        mouseStartX = e.pageX;
        mouseStartScroll = this.trackEl.scrollLeft;
        this.trackEl.classList.add('is-dragging');
      });

      window.addEventListener('mousemove', (e) => {
        if (!isMouseDown) return;
        const mouseX = e.pageX;
        const diff = mouseStartX - mouseX;
        this.trackEl.scrollLeft = mouseStartScroll + diff;
      });

      window.addEventListener('mouseup', () => {
        if (isMouseDown) {
          isMouseDown = false;
          this.trackEl?.classList.remove('is-dragging');
          this.snapToClosestCard();
        }
      });
    }

    /**
     * Find the closest card to the viewport center and select it
     */
    snapToClosestCard() {
      if (!this.trackEl) return;
      const cards = Array.from(this.trackEl.querySelectorAll('.carousel-card'));
      if (cards.length === 0) return;

      const trackCenter = this.trackEl.scrollLeft + this.trackEl.clientWidth / 2;
      let closestIdx = 0;
      let minDistance = Infinity;

      cards.forEach((card, idx) => {
        const cardCenter = card.offsetLeft + card.clientWidth / 2;
        const dist = Math.abs(trackCenter - cardCenter);
        if (dist < minDistance) {
          minDistance = dist;
          closestIdx = idx;
        }
      });

      this.selectIndex(closestIdx);
    }
  }

  window.DesignCarousel = DesignCarousel;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = DesignCarousel;
  }
})(typeof window !== 'undefined' ? window : global);
