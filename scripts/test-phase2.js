const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Mock localStorage for Node test environment
const mockStorage = {};
global.localStorage = {
  getItem: (k) => mockStorage[k] || null,
  setItem: (k, v) => { mockStorage[k] = String(v); },
  removeItem: (k) => { delete mockStorage[k]; },
  clear: () => { Object.keys(mockStorage).forEach((k) => delete mockStorage[k]); },
};

global.window = global;
global.window.localStorage = global.localStorage;
global.window.escapeHtml = (s) => String(s || '');

// Load dependencies
const ScoringEngine = require('./scoring-engine.js');
global.ScoringEngine = ScoringEngine;
global.window.ScoringEngine = ScoringEngine;

require('./local-db.js');
const LocalDatabaseService = global.window.LocalDatabaseService;

require('./design/template-variables.js');
const TemplateVariables = global.window.TemplateVariables;

require('./design/template-store.js');
const TemplateStore = global.window.TemplateStore;

const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

console.log('====================================================');
console.log('RUNNING PHASE 1 & 2 ACCEPTANCE VERIFICATION TESTS');
console.log('====================================================\n');

let passed = 0;
let failed = 0;

function it(desc, fn) {
  try {
    fn();
    console.log(`  ✓ PASS: ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${desc}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

// SECTION 1: TOP-LEVEL MODE SWITCHER DOM CHECKS
console.log('--- 1. Top-Level Mode Switcher Verification ---');

it('Mode Switcher header element (#app-mode-header) exists in index.html', () => {
  assert(indexHtml.includes('id="app-mode-header"'), '#app-mode-header must exist');
});

it('Mode Switcher buttons (#mode-btn-tournament & #mode-btn-studio) exist', () => {
  assert(indexHtml.includes('id="mode-btn-tournament"'), '#mode-btn-tournament must exist');
  assert(indexHtml.includes('id="mode-btn-studio"'), '#mode-btn-studio must exist');
});

it('Mode Switcher contains brand name and logo icon', () => {
  assert(indexHtml.includes('class="mode-header-brand"'), 'Brand container must exist');
  assert(indexHtml.includes('class="mode-header-logo-icon"'), 'Logo icon must exist');
  assert(indexHtml.includes('LRD <span>POINTCALC</span>') || indexHtml.includes('LRD <span>PointCalc</span>'), 'Brand title must exist');
});

it('Mode Switcher contains entitlement badge and avatar controls', () => {
  assert(indexHtml.includes('id="mode-header-entitlement"'), 'Entitlement badge must exist');
  assert(indexHtml.includes('id="mode-entitlement-label"'), 'Entitlement label must exist');
  assert(indexHtml.includes('id="btn-avatar-mode"'), 'Avatar button must exist');
});

// SECTION 2: STUDIO LANDING SECTIONS DOM CHECKS
console.log('\n--- 2. Studio Landing Sections Verification ---');

it('Studio sections container (#studio-sections-container) exists in screen-design', () => {
  assert(indexHtml.includes('id="studio-sections-container"'), '#studio-sections-container must exist');
});

it('Free templates section (#studio-section-free & #studio-grid-free) exists', () => {
  assert(indexHtml.includes('id="studio-section-free"'), '#studio-section-free must exist');
  assert(indexHtml.includes('id="studio-grid-free"'), '#studio-grid-free must exist');
});

it('Premium templates section (#studio-section-premium & #studio-grid-premium) exists', () => {
  assert(indexHtml.includes('id="studio-section-premium"'), '#studio-section-premium must exist');
  assert(indexHtml.includes('id="studio-grid-premium"'), '#studio-grid-premium must exist');
  assert(indexHtml.includes('id="studio-btn-prem-info"'), '#studio-btn-prem-info link must exist');
});

it('Import section (#studio-section-import, #studio-import-dropzone, #studio-grid-custom) exists', () => {
  assert(indexHtml.includes('id="studio-section-import"'), '#studio-section-import must exist');
  assert(indexHtml.includes('id="studio-import-dropzone"'), '#studio-import-dropzone must exist');
  assert(indexHtml.includes('id="btn-studio-browse-file"'), '#btn-studio-browse-file must exist');
  assert(indexHtml.includes('id="studio-grid-custom"'), '#studio-grid-custom must exist');
  assert(indexHtml.includes('id="studio-custom-count-badge"'), '#studio-custom-count-badge must exist');
});

// SECTION 3: IMPORT CONFIRMATION MODAL & IMAGE VS THEME DIFFERENTIATION
console.log('\n--- 3. Import Confirmation Modal & Validation ---');

it('Import confirmation modal (#modal-import-confirm) exists in index.html', () => {
  assert(indexHtml.includes('id="modal-import-confirm"'), '#modal-import-confirm must exist');
  assert(indexHtml.includes('id="import-confirm-title"'), '#import-confirm-title must exist');
  assert(indexHtml.includes('id="import-type-badge"'), '#import-type-badge must exist');
  assert(indexHtml.includes('id="import-preview-thumbnail"'), '#import-preview-thumbnail must exist');
  assert(indexHtml.includes('id="import-btn-confirm"'), '#import-btn-confirm must exist');
  assert(indexHtml.includes('id="import-btn-cancel"'), '#import-btn-cancel must exist');
});

it('Background-only warning notice (#import-image-warning) exists in confirmation modal', () => {
  assert(indexHtml.includes('id="import-image-warning"'), 'Warning notice for standalone background image must exist');
  assert(indexHtml.includes('Standalone Background Graphic') || indexHtml.includes('Standalone Background Image'), 'Must describe that image is not a complete theme');
});

it('Layout selector (#import-initial-layout) exists for configuring table over background', () => {
  assert(indexHtml.includes('id="import-layout-select-group"'), 'Layout selection group must exist');
  assert(indexHtml.includes('id="import-initial-layout"'), 'Initial layout selector must exist');
  assert(indexHtml.includes('value="standard"'), 'Standard layout option exists');
  assert(indexHtml.includes('value="minimal"'), 'Minimal layout option exists');
  assert(indexHtml.includes('value="blank"'), 'Blank canvas option exists');
});

// SECTION 4: TEMPLATE METADATA & BUNDLED TEMPLATES
console.log('\n--- 4. Template Metadata & Local Bundling ---');

it('All Free templates have aspect ratios and supported layouts metadata', () => {
  const free = TemplateStore.getFreeTemplates();
  assert(free.length >= 5, `Expected at least 5 free templates, got ${free.length}`);
  free.forEach((t) => {
    assert(t.aspectRatio, `Template ${t.name} must have aspectRatio`);
    assert(Array.isArray(t.supportedLayouts) && t.supportedLayouts.length > 0, `Template ${t.name} must have supportedLayouts`);
    assert.strictEqual(t.accessType, 'free', `Template ${t.name} must be free`);
  });
});

it('All Premium templates have aspect ratios and supported layouts metadata', () => {
  const premium = TemplateStore.getPremiumTemplates();
  assert(premium.length >= 3, `Expected at least 3 premium templates, got ${premium.length}`);
  premium.forEach((t) => {
    assert(t.aspectRatio, `Template ${t.name} must have aspectRatio`);
    assert(Array.isArray(t.supportedLayouts) && t.supportedLayouts.length > 0, `Template ${t.name} must have supportedLayouts`);
    assert.strictEqual(t.accessType, 'premium', `Template ${t.name} must be premium`);
  });
});

// SECTION 5: CONFIGURABLE ENTITLEMENT SYSTEM (NO FAKE PAYMENTS)
console.log('\n--- 5. Configurable Entitlement System Verification ---');

it('Entitlement status is configurable and defaults to Free Tier without payment fakes', () => {
  const testUser = { id: 'usr_test_std', email: 'organizer@esports.gg' };
  const status = TemplateStore.getEntitlementStatus(testUser);
  assert.strictEqual(status.active, false);
  assert.strictEqual(status.tier, 'free');
});

it('Configurable entitlement override allows admin/organizer activation cleanly', () => {
  const testUser = { id: 'usr_test_std', email: 'organizer@esports.gg' };
  TemplateStore.setEntitlementOverride(true);
  const activeStatus = TemplateStore.getEntitlementStatus(testUser);
  assert.strictEqual(activeStatus.active, true);
  assert.strictEqual(activeStatus.tier, 'pro');

  // Verify premium templates are unlocked when active
  const isAllowed = TemplateStore.isPremiumTemplateAllowed('tmpl_prem_broadcast_gold', testUser);
  assert.strictEqual(isAllowed, true, 'Premium template must unlock with active entitlement override');

  // Revert override
  TemplateStore.setEntitlementOverride(false);
  const revertedStatus = TemplateStore.getEntitlementStatus(testUser);
  assert.strictEqual(revertedStatus.active, false);
  const isLockedAgain = TemplateStore.isPremiumTemplateAllowed('tmpl_prem_broadcast_gold', testUser);
  assert.strictEqual(isLockedAgain, false, 'Premium template must lock again');
});

it('Premium information modal contains clear entitlement explanation without fake checkout', () => {
  assert(indexHtml.includes('id="modal-premium-unlock"'), 'Premium unlock modal must exist');
  assert(indexHtml.includes('Configurable Entitlement System'), 'System notice must explain entitlement system');
  assert(indexHtml.includes('id="btn-toggle-entitlement"'), 'Entitlement toggle control exists for organizer mode');
  assert(!indexHtml.includes('Enter Credit Card'), 'Must NOT have fake credit card inputs');
  assert(!indexHtml.includes('Payment Successful!'), 'Must NOT have fake payment success messages');
});

// SECTION 6: APP MODE STATE TRANSITIONS & RETENTION
console.log('\n--- 6. Mode Switcher State Synchronization ---');

const appJsContent = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

it('app.js defines currentMode and lastTournamentScreen state tracking', () => {
  assert(appJsContent.includes("let currentMode = 'tournament'"), 'currentMode variable must be declared');
  assert(appJsContent.includes("let lastTournamentScreen = 'home'"), 'lastTournamentScreen variable must be declared');
});

it('app.js provides window.switchMode and window.getCurrentMode APIs', () => {
  assert(appJsContent.includes('window.switchMode = switchMode'), 'window.switchMode must be exported');
  assert(appJsContent.includes('window.getCurrentMode = () => currentMode'), 'window.getCurrentMode must be exported');
});

it('Switching mode synchronizes top bar styling (.mode-studio and active pills)', () => {
  assert(appJsContent.includes("currentMode = 'studio'"), 'studio mode handling exists');
  assert(appJsContent.includes("appShellEl.classList.add('mode-studio')"), 'mode-studio class applied to app shell');
  assert(appJsContent.includes("modeBtnStudio.classList.add('active')"), 'studio button made active');
  assert(appJsContent.includes("modeBtnTournament.classList.remove('active')"), 'tournament button deactivated');
});

it('DesignManager provides renderCurrentTab and renderStudioSections', () => {
  const dmContent = fs.readFileSync(path.join(__dirname, 'design', 'design-manager.js'), 'utf8');
  assert(dmContent.includes('renderCurrentTab()'), 'renderCurrentTab must be defined on DesignManager');
  assert(dmContent.includes('renderStudioSections()'), 'renderStudioSections must be defined on DesignManager');
  assert(dmContent.includes('createStudioCardElement'), 'createStudioCardElement helper must be defined');
  assert(dmContent.includes('handleSelectedFile'), 'handleSelectedFile must be defined');
  assert(dmContent.includes('confirmImport'), 'confirmImport must be defined');
});

console.log('\n====================================================');
console.log(`SUMMARY: ${passed} passed, ${failed} failed.`);
console.log('====================================================');

if (failed > 0) process.exit(1);
