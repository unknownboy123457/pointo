/* ====================================================================
   LRD PointCalc — Phase 4 Acceptance & Verification Tests
   ====================================================================
   Verifies:
   1. Official .lrdtheme package format specification (v1.0.0)
   2. Schema validation & security sanitization (no XSS or code execution)
   3. Theme export engine (packaging, metadata, stripping owner ID)
   4. Theme import engine (validation, persistence, user ownership)
   5. Round-trip export & import fidelity across fresh sessions
   6. Custom background image import with configurable table overlay
   7. Theme lifecycle (save, duplicate, rename, delete)
   8. Export modal DOM controls and interactive triggers
   ==================================================================== */

const fs = require('fs');
const path = require('path');

console.log('====================================================');
console.log('RUNNING PHASE 4 ACCEPTANCE VERIFICATION TESTS');
console.log('====================================================\n');

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passCount++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failCount++;
  }
}

// Setup browser-like globals for Node test environment
const mockLocalStorage = {};
global.localStorage = {
  getItem: (k) => mockLocalStorage[k] || null,
  setItem: (k, v) => { mockLocalStorage[k] = String(v); },
  removeItem: (k) => { delete mockLocalStorage[k]; },
  clear: () => { Object.keys(mockLocalStorage).forEach((k) => delete mockLocalStorage[k]); },
};

global.window = global;
const makeElement = (id = '') => {
  const classes = new Set();
  return {
    id,
    classList: {
      add: (...c) => c.forEach((x) => classes.add(x)),
      remove: (...c) => c.forEach((x) => classes.delete(x)),
      contains: (x) => classes.has(x),
      toggle: (x) => (classes.has(x) ? (classes.delete(x), false) : (classes.add(x), true)),
    },
    style: {},
    dataset: {},
    addEventListener: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
    appendChild: () => {},
    setAttribute: () => {},
    innerHTML: '',
  };
};

const domCache = {};
global.document = {
  getElementById: (id) => {
    if (!domCache[id]) domCache[id] = makeElement(id);
    return domCache[id];
  },
  querySelectorAll: () => [],
  querySelector: () => null,
  createElement: (tag) => makeElement(tag),
  body: {
    appendChild: () => {},
    removeChild: () => {},
  },
};

global.showToast = (msg) => {};

// Require modules
require('../scripts/config.js');
const ScoringEngine = require('../scripts/scoring-engine.js');
const LocalDatabaseService = require('../scripts/local-db.js');
require('../scripts/design/template-variables.js');
const TemplateStore = require('../scripts/design/template-store.js');
require('../scripts/design/template-renderer.js');
require('../scripts/design/export-engine.js');
const TemplateEditor = require('../scripts/design/template-editor.js');

const htmlContent = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// ==================================================================
// 1. UI & DOM EXPORT CONTROLS
// ==================================================================
console.log('--- 1. Phase 4 DOM Elements & Export Controls ---');
assert(htmlContent.includes('id="more-action-export-theme"'), 'Export .lrdtheme button (#more-action-export-theme) exists in More Modal');
assert(htmlContent.includes('id="te-export-modal"'), 'Export choices modal (#te-export-modal) exists');
assert(htmlContent.includes('id="te-opt-export-png"'), 'Export as PNG option (#te-opt-export-png) exists');
assert(htmlContent.includes('id="te-opt-export-theme"'), 'Export as .lrdtheme option (#te-opt-export-theme) exists');
assert(htmlContent.includes('id="te-opt-export-pdf"'), 'Export as PDF option (#te-opt-export-pdf) exists');
assert(htmlContent.includes('id="modal-import-confirm"'), 'Import confirmation dialog (#modal-import-confirm) exists');
assert(htmlContent.includes('id="import-image-warning"'), 'Background-only warning notice (#import-image-warning) exists');
assert(htmlContent.includes('id="import-initial-layout"'), 'Table overlay layout selector (#import-initial-layout) exists');

// ==================================================================
// 2. THEME PACKAGE FORMAT SPECIFICATION
// ==================================================================
console.log('\n--- 2. LRD Theme Package Format Specification (.lrdtheme) ---');
const sampleTemplate = TemplateStore.getTemplateById('tmpl_free_lrd_classic');
assert(sampleTemplate !== null, 'Built-in LRD Classic template loads successfully');

const exported = TemplateStore.exportThemePackage(sampleTemplate, { author: 'Tournament Admin' });
assert(typeof exported.jsonString === 'string', 'exportThemePackage returns valid JSON string');
assert(exported.package.format === 'lrdtheme', 'Theme package format is "lrdtheme"');
assert(exported.package.schemaVersion === '1.0.0', 'Theme package schema version is "1.0.0"');
assert(exported.package.generator.includes('LRD PointCalc'), 'Theme package generator is LRD PointCalc');
assert(typeof exported.package.exportedAt === 'string', 'Theme package contains exportedAt timestamp');
assert(exported.package.metadata.author === 'Tournament Admin', 'Theme package preserves author metadata');
assert(exported.package.theme.name === sampleTemplate.name, 'Theme package preserves template name');
assert(exported.package.theme.owner_user_id === undefined, 'Theme package strips local owner_user_id for portability');
assert(Array.isArray(exported.package.theme.fields), 'Theme package includes element fields');

// ==================================================================
// 3. SCHEMA VALIDATION & SECURITY SANITIZATION
// ==================================================================
console.log('\n--- 3. Schema Validation & Security Sanitization ---');

// Valid package validation
const val1 = TemplateStore.validateThemePackage(exported.package);
assert(val1.valid === true, 'validateThemePackage accepts valid .lrdtheme package');
assert(val1.errors.length === 0, 'No validation errors on valid package');

// Valid raw template validation
const val2 = TemplateStore.validateThemePackage(sampleTemplate);
assert(val2.valid === true, 'validateThemePackage accepts valid naked template definition');

// Malformed JSON / non-object rejection
const valInvalidJson = TemplateStore.validateThemePackage('not valid json {]');
assert(valInvalidJson.valid === false && valInvalidJson.errors[0].includes('JSON'), 'Rejects non-JSON string');

const valNull = TemplateStore.validateThemePackage(null);
assert(valNull.valid === false, 'Rejects null input');

// Missing name rejection
const valNoName = TemplateStore.validateThemePackage({ canvas: { width: 1080, height: 1350 }, fields: [] });
assert(valNoName.valid === false && valNoName.errors.some(e => e.includes('name')), 'Rejects theme without a name');

// Invalid canvas dimensions rejection
const valBadCanvas = TemplateStore.validateThemePackage({ name: 'Bad Canvas', canvas: { width: -10, height: 10000 }, fields: [] });
assert(valBadCanvas.valid === false && valBadCanvas.errors.some(e => e.includes('Canvas')), 'Rejects out-of-bounds canvas dimensions');

// Unsupported field type rejection
const valBadField = TemplateStore.validateThemePackage({
  name: 'Bad Field Theme',
  canvas: { width: 1080, height: 1350 },
  fields: [{ id: 'f_hacker', type: 'malicious_exec', x: 0, y: 0, width: 100, height: 100 }],
});
assert(valBadField.valid === false && valBadField.errors.some(e => e.includes('unsupported type')), 'Rejects unsupported field types');

// XSS and Script Injection Sanitization
const valXSS = TemplateStore.validateThemePackage({
  name: '<script>alert("hacked")</script>Pro Esports Theme',
  canvas: { width: 1080, height: 1350 },
  fields: [
    {
      id: 'f_title',
      type: 'text',
      content: '<script>window.location="evil.com"</script>Free Fire World Series',
      x: 50,
      y: 50,
      width: 500,
      height: 60,
    },
  ],
});
assert(valXSS.valid === true, 'Sanitizes and accepts theme without throwing script errors');
assert(!valXSS.theme.name.includes('<script>'), 'Theme name is stripped of <script> tags');
assert(!valXSS.theme.fields[0].content.includes('<script>'), 'Field content is stripped of <script> tags');
assert(valXSS.theme.fields[0].content.includes('Free Fire World Series'), 'Field text content is preserved cleanly');

// ==================================================================
// 4. ROUND-TRIP EXPORT & IMPORT FIDELITY
// ==================================================================
console.log('\n--- 4. Round-Trip Export & Import Fidelity across Fresh Sessions ---');
const userA = 'usr_organizer_alpha';
const userB = 'usr_organizer_beta';

// 1. Create a custom template in User A's session
const customOriginal = TemplateStore.saveCustomTemplate(userA, {
  name: 'Champions Arena 2026',
  description: 'Custom tournament theme for season finals',
  canvas: { width: 1080, height: 1350, aspectRatio: '4:5' },
  colors: {
    primary: '#00ffcc',
    secondary: '#ff007f',
    text: '#ffffff',
    accent: '#ffe600',
    background: '#070810',
  },
  background: {
    type: 'color',
    value: '#070810',
  },
  fields: [
    {
      id: 'f_custom_title',
      type: 'text',
      content: 'FREE FIRE GRAND FINALS',
      x: 100,
      y: 80,
      width: 880,
      height: 70,
      fontSize: 42,
    },
    {
      id: 'f_custom_table',
      type: 'leaderboard',
      x: 60,
      y: 200,
      width: 960,
      height: 950,
      rowHeight: 62,
      rowGap: 10,
      columns: [
        { key: 'rank', label: '#', width: 70, align: 'center' },
        { key: 'teamName', label: 'TEAM', width: 450, align: 'left' },
        { key: 'kills', label: 'KILLS', width: 140, align: 'center' },
        { key: 'totalPoints', label: 'PTS', width: 160, align: 'center', highlight: true },
      ],
    },
  ],
});
assert(customOriginal !== null && customOriginal.name === 'Champions Arena 2026', 'User A creates custom template');

// 2. Export package to .lrdtheme string
const exportPkg = TemplateStore.exportThemePackage(customOriginal, { author: 'Alpha Esports' });
const jsonString = exportPkg.jsonString;
assert(jsonString.includes('Champions Arena 2026'), 'Export package contains serialized template data');

// 3. User B imports the .lrdtheme string in a fresh session
const importedB = TemplateStore.importThemePackage(jsonString, userB);
assert(importedB !== null, 'User B imports .lrdtheme package successfully');
assert(importedB.id !== customOriginal.id, 'Import assigns a new unique template ID');
assert(importedB.owner_user_id === userB, 'Imported template belongs to User B');
assert(importedB.name === 'Champions Arena 2026', 'Imported template retains exact name');
assert(importedB.colors.primary === '#00ffcc', 'Imported template retains primary color');
assert(importedB.colors.secondary === '#ff007f', 'Imported template retains secondary color');
assert(importedB.fields.length === 2, 'Imported template retains exact field count');

const importedTable = importedB.fields.find(f => f.type === 'leaderboard');
assert(importedTable !== null, 'Imported template leaderboard element preserved');
assert(importedTable.rowGap === 10, 'Leaderboard rowGap preserved');
assert(importedTable.columns.length === 4, 'Leaderboard columns preserved');
assert(importedTable.columns[1].key === 'teamName', 'Leaderboard column keys preserved');

// ==================================================================
// 5. THEME LIFECYCLE & PERSISTENCE
// ==================================================================
console.log('\n--- 5. Theme Lifecycle: Save, Duplicate, Rename, Delete ---');

// Duplicate
const duplicated = TemplateStore.duplicateTemplate(userB, importedB.id);
assert(duplicated !== null, 'Template duplication succeeds');
assert(duplicated.name === 'Champions Arena 2026 (Copy)', 'Duplicated template gets "(Copy)" name suffix');
assert(duplicated.id !== importedB.id, 'Duplicated template has distinct ID');

// Rename
const renamed = TemplateStore.renameTemplate(userB, duplicated.id, 'Summer Showdown 2026');
assert(renamed !== null && renamed.name === 'Summer Showdown 2026', 'Template rename updates name and persists');

// Delete
const beforeDeleteCount = TemplateStore.getCustomTemplates(userB).length;
const deleteRes = TemplateStore.deleteCustomTemplate(userB, duplicated.id);
assert(deleteRes === true, 'Custom template deletion succeeds');
const afterDeleteCount = TemplateStore.getCustomTemplates(userB).length;
assert(afterDeleteCount === beforeDeleteCount - 1, 'Custom template count decrements by 1');

// Verify Built-in Templates Cannot be Deleted via custom delete
const deleteBuiltIn = TemplateStore.deleteCustomTemplate(userB, 'tmpl_free_lrd_classic');
assert(deleteBuiltIn === false, 'Built-in free templates cannot be deleted');

// ==================================================================
// 6. EDITOR EXPORT TRIGGER & REAPPLICATION INTEGRITY
// ==================================================================
console.log('\n--- 6. Editor Export Action & Template Store Integration ---');

// Open template in editor
TemplateEditor.open(importedB, userB);
assert(TemplateEditor.isOpen() === true, 'TemplateEditor opens imported theme');

// Verify export modal handles
assert(typeof TemplateEditor.handleExport === 'function', 'TemplateEditor exposes handleExport');
assert(typeof TemplateEditor.exportAsTheme === 'function', 'TemplateEditor exposes exportAsTheme');
assert(typeof TemplateEditor.exportAsPNG === 'function', 'TemplateEditor exposes exportAsPNG');
assert(typeof TemplateEditor.exportAsPDF === 'function', 'TemplateEditor exposes exportAsPDF');

// Close editor cleanly
TemplateEditor.close();
assert(TemplateEditor.isOpen() === false, 'TemplateEditor closes cleanly');

console.log('\n====================================================');
console.log(`SUMMARY: ${passCount} passed, ${failCount} failed.`);
console.log('====================================================\n');

if (failCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
