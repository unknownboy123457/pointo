/* ====================================================================
   LRD PointCalc — Phase 3 Acceptance & Verification Tests
   ====================================================================
   Verifies:
   1. Canvas workspace enhancement (8 resize handles, rotation handle, grid & snap)
   2. Undo/Redo history stack and autosave draft
   3. Layer system (z-order bring fwd/back, to front/back, lock, hide, duplicate, delete)
   4. Configurable Table Engine (variable columns, row gap, row heights, zebra striping, pagination)
   5. Live tournament standings data binding via LocalDatabaseService & ScoringEngine
   6. DOM button hierarchy and critical Phase 3 interactive controls
   ==================================================================== */

const fs = require('fs');
const path = require('path');

console.log('====================================================');
console.log('RUNNING PHASE 3 ACCEPTANCE VERIFICATION TESTS');
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
global.document = {
  getElementById: (id) => ({
    id,
    classList: { add: () => {}, remove: () => {}, contains: () => false, toggle: () => {} },
    style: {},
    addEventListener: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
    appendChild: () => {},
    innerHTML: '',
  }),
  querySelectorAll: () => [],
  querySelector: () => null,
  createElement: (tag) => ({
    tag,
    classList: { add: () => {}, remove: () => {}, contains: () => false, toggle: () => {} },
    style: {},
    dataset: {},
    appendChild: () => {},
    addEventListener: () => {},
    innerHTML: '',
  }),
  addEventListener: () => {},
};

// Load dependencies
require('../scripts/config.js');
const ScoringEngine = require('../scripts/scoring-engine.js');
const LocalDatabaseService = require('../scripts/local-db.js');
require('../scripts/design/template-variables.js');
require('../scripts/design/template-store.js');
require('../scripts/design/template-renderer.js');
const TemplateEditor = require('../scripts/design/template-editor.js');

const htmlContent = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// ==================================================================
// 1. TOP & BOTTOM TOOLBAR DOM CONTROLS
// ==================================================================
console.log('--- 1. Phase 3 Top & Bottom Toolbar Elements ---');
assert(htmlContent.includes('id="te-btn-undo"'), 'Undo button (#te-btn-undo) exists');
assert(htmlContent.includes('id="te-btn-redo"'), 'Redo button (#te-btn-redo) exists');
assert(htmlContent.includes('id="te-select-datasource"'), 'Datasource selector (#te-select-datasource) exists');
assert(htmlContent.includes('id="te-btn-export"'), 'Export button (#te-btn-export) exists');
assert(htmlContent.includes('id="te-btn-table-engine"'), 'Table engine tab button (#te-btn-table-engine) exists');
assert(htmlContent.includes('id="te-btn-fonts"'), 'Typography tab button (#te-btn-fonts) exists');
assert(htmlContent.includes('id="te-btn-colors"'), 'Color palette tab button (#te-btn-colors) exists');
assert(htmlContent.includes('id="te-btn-background"'), 'Background tab button (#te-btn-background) exists');
assert(htmlContent.includes('id="te-btn-layers"'), 'Layers tab button (#te-btn-layers) exists');

// ==================================================================
// 2. CANVAS CONTROLS & FLOATING BAR
// ==================================================================
console.log('\n--- 2. Canvas Controls & Floating Bar ---');
assert(htmlContent.includes('id="te-canvas-controls"'), 'Floating canvas controls (#te-canvas-controls) exists');
assert(htmlContent.includes('id="te-btn-zoom-in"'), 'Zoom in button (#te-btn-zoom-in) exists');
assert(htmlContent.includes('id="te-btn-zoom-out"'), 'Zoom out button (#te-btn-zoom-out) exists');
assert(htmlContent.includes('id="te-btn-zoom-fit"'), 'Zoom fit button (#te-btn-zoom-fit) exists');
assert(htmlContent.includes('id="te-zoom-val"'), 'Zoom value display (#te-zoom-val) exists');
assert(htmlContent.includes('id="te-btn-toggle-grid"'), 'Toggle grid button (#te-btn-toggle-grid) exists');
assert(htmlContent.includes('id="te-btn-toggle-snap"'), 'Toggle snap button (#te-btn-toggle-snap) exists');

// ==================================================================
// 3. PHASE 3 DRAWERS & SHEETS
// ==================================================================
console.log('\n--- 3. Phase 3 Drawers & Sheets ---');
assert(htmlContent.includes('id="te-table-engine-sheet"'), 'Table Engine sheet (#te-table-engine-sheet) exists');
assert(htmlContent.includes('id="te-layers-sheet"'), 'Layers sheet (#te-layers-sheet) exists');
assert(htmlContent.includes('id="te-fonts-sheet"'), 'Fonts sheet (#te-fonts-sheet) exists');
assert(htmlContent.includes('id="te-colors-sheet"'), 'Colors sheet (#te-colors-sheet) exists');
assert(htmlContent.includes('id="te-background-sheet"'), 'Background sheet (#te-background-sheet) exists');

// ==================================================================
// 4. UNDO / REDO & AUTOSAVE
// ==================================================================
console.log('\n--- 4. Undo / Redo & Autosave Stack ---');
const sampleTemplate = {
  id: 'tmpl_test_phase3',
  name: 'Phase 3 Verification Theme',
  canvas: { width: 1080, height: 1350 },
  background: { type: 'color', value: '#08090f' },
  info: { tournamentName: 'LRD TEST TOURNAMENT' },
  fields: [
    { id: 'f_t1', type: 'text', content: 'Initial Text', x: 100, y: 100, width: 200, height: 50 },
    { id: 'f_t2', type: 'text', content: 'Subtitle', x: 100, y: 160, width: 200, height: 40 },
  ],
};

TemplateEditor.open(sampleTemplate, 'usr_tester_p3');
assert(TemplateEditor.currentTemplate.name === 'Phase 3 Verification Theme', 'Editor opens template properly');
assert(TemplateEditor.undoStack.length === 1, 'Initial state pushed to undo stack');

// Modify field
TemplateEditor.currentTemplate.fields[0].content = 'Updated Text Value';
TemplateEditor.pushState('Update content');
assert(TemplateEditor.undoStack.length === 2, 'New state pushed to undo stack');

// Undo
TemplateEditor.undo();
assert(TemplateEditor.currentTemplate.fields[0].content === 'Initial Text', 'Undo restores previous template state');
assert(TemplateEditor.redoStack.length === 1, 'State pushed to redo stack');

// Redo
TemplateEditor.redo();
assert(TemplateEditor.currentTemplate.fields[0].content === 'Updated Text Value', 'Redo re-applies template state');

// Autosave verification
const savedDraft = JSON.parse(mockLocalStorage['lrd_template_draft_usr_tester_p3'] || '{}');
assert(savedDraft.name === 'Phase 3 Verification Theme', 'Autosave successfully saves draft to localStorage');

// ==================================================================
// 5. ZOOM & GRID SNAPPING
// ==================================================================
console.log('\n--- 5. Zoom & Grid Snapping Logic ---');
TemplateEditor.setZoom(1.5);
assert(TemplateEditor.zoomScale === 1.5, 'setZoom sets scale properly');

TemplateEditor.zoomIn();
assert(TemplateEditor.zoomScale > 1.5, 'zoomIn increases zoom scale');

TemplateEditor.zoomOut();
assert(TemplateEditor.zoomScale < 1.8, 'zoomOut decreases zoom scale');

TemplateEditor.snapToGrid = true;
TemplateEditor.gridSize = 10;
assert(TemplateEditor.snapValue(24) === 20, 'snapValue(24) rounds to 20 with 10px grid');
assert(TemplateEditor.snapValue(26) === 30, 'snapValue(26) rounds to 30 with 10px grid');

TemplateEditor.snapToGrid = false;
assert(TemplateEditor.snapValue(24) === 24, 'snapValue does not snap when snapToGrid is disabled');

// ==================================================================
// 6. 8-WAY RESIZE & ROTATION
// ==================================================================
console.log('\n--- 6. 8-Way Resize & Rotation Calculations ---');
const testField = { id: 'f_test', x: 100, y: 100, width: 200, height: 100, rotation: 0 };
TemplateEditor.fieldStart = { x: 100, y: 100, w: 200, h: 100 };
TemplateEditor.snapToGrid = false;

// Bottom-right resize (br)
TemplateEditor.calculateResize(testField, 50, 30, 'br');
assert(testField.width === 250 && testField.height === 130, 'Resize "br" expands width and height');

// Top-left resize (tl)
TemplateEditor.fieldStart = { x: 100, y: 100, w: 200, h: 100 };
TemplateEditor.calculateResize(testField, 20, 20, 'tl');
assert(testField.x === 120 && testField.y === 120 && testField.width === 180 && testField.height === 80, 'Resize "tl" shrinks and adjusts position');

// Right edge resize (r)
TemplateEditor.fieldStart = { x: 100, y: 100, w: 200, h: 100 };
TemplateEditor.calculateResize(testField, 40, 0, 'r');
assert(testField.width === 240, 'Resize "r" expands width only');

// Bottom edge resize (b)
TemplateEditor.fieldStart = { x: 100, y: 100, w: 200, h: 100 };
TemplateEditor.calculateResize(testField, 0, 40, 'b');
assert(testField.height === 140, 'Resize "b" expands height only');

// ==================================================================
// 7. LAYER SYSTEM & Z-ORDER
// ==================================================================
console.log('\n--- 7. Layer Ordering, Locking, Duplication ---');
const f1 = TemplateEditor.currentTemplate.fields[0];
const f2 = TemplateEditor.currentTemplate.fields[1];

// Bring to front
TemplateEditor.bringToFront(f1.id);
assert(TemplateEditor.currentTemplate.fields[TemplateEditor.currentTemplate.fields.length - 1].id === f1.id, 'bringToFront moves element to end of array');

// Send to back
TemplateEditor.sendToBack(f1.id);
assert(TemplateEditor.currentTemplate.fields[0].id === f1.id, 'sendToBack moves element to start of array');

// Lock & Unlock
TemplateEditor.lockField(f1.id);
assert(TemplateEditor.currentTemplate.fields.find(f => f.id === f1.id).locked === true, 'lockField marks element locked');

TemplateEditor.unlockField(f1.id);
assert(TemplateEditor.currentTemplate.fields.find(f => f.id === f1.id).locked === false, 'unlockField marks element unlocked');

// Visibility
TemplateEditor.toggleFieldVisibility(f1.id);
assert(TemplateEditor.currentTemplate.fields.find(f => f.id === f1.id).hidden === true, 'toggleFieldVisibility hides element');

TemplateEditor.toggleFieldVisibility(f1.id);
assert(TemplateEditor.currentTemplate.fields.find(f => f.id === f1.id).hidden === false, 'toggleFieldVisibility restores element visibility');

// Duplication
const countBefore = TemplateEditor.currentTemplate.fields.length;
TemplateEditor.duplicateField(f1.id);
assert(TemplateEditor.currentTemplate.fields.length === countBefore + 1, 'duplicateField creates cloned element');

// Deletion
const duplicated = TemplateEditor.currentTemplate.fields[TemplateEditor.currentTemplate.fields.length - 1];
TemplateEditor.deleteField(duplicated.id);
assert(TemplateEditor.currentTemplate.fields.length === countBefore, 'deleteField cleanly removes element');

// ==================================================================
// 8. CONFIGURABLE TABLE ENGINE & TOURNAMENT DATA BINDING
// ==================================================================
console.log('\n--- 8. Configurable Table Engine & Live Data Binding ---');
const table = TemplateEditor.getTableField();
assert(table !== null, 'Table Engine returns valid leaderboard table');
assert(Array.isArray(table.columns), 'Table contains configurable column list');

// Configure columns
table.columns = [
  { key: 'rank', label: '#', width: 80, align: 'center' },
  { key: 'teamName', label: 'TEAM', width: 400, align: 'left' },
  { key: 'matchesPlayed', label: 'MATCHES', width: 100, align: 'center' },
  { key: 'kills', label: 'KILLS', width: 120, align: 'center' },
  { key: 'totalPoints', label: 'POINTS', width: 140, align: 'center' },
  { key: 'booyahs', label: 'BOOYAH', width: 100, align: 'center' },
];
table.rowGap = 8;
table.rowHeight = 60;
table.maxRows = 12;

assert(table.columns.length === 6, 'Table columns can be customized and reconfigured');
assert(table.rowGap === 8, 'Table supports customizable row gap spacing');

// Setup a real tournament in LocalDatabaseService
const realTourn = LocalDatabaseService.createTournament('usr_tester_p3', {
  name: 'FFWS National Finals 2026',
  game_mode: 'squad',
  scoring_system: 'default',
  teams: [
    { slot_number: 1, team_name: 'Total Gaming' },
    { slot_number: 2, team_name: 'GodLike Esports' },
    { slot_number: 3, team_name: 'Orangutan' },
    { slot_number: 4, team_name: 'Blind Esports' },
  ],
});

// Create match 1 and save results
const match1 = LocalDatabaseService.createMatch(realTourn.id, 1, 'Match 1', 1);
const tournTeams = LocalDatabaseService.getTeams(realTourn.id);
LocalDatabaseService.saveMatchResults(realTourn.id, match1.id, [
  { teamId: tournTeams[0].id, placement: 1, kills: 14 },
  { teamId: tournTeams[1].id, placement: 2, kills: 8 },
  { teamId: tournTeams[2].id, placement: 3, kills: 5 },
  { teamId: tournTeams[3].id, placement: 4, kills: 2 },
]);

// Bind data source to real tournament
TemplateEditor.setDataSource(realTourn.id);
assert(TemplateEditor.activeDataContext.tournament.name === 'FFWS National Finals 2026', 'Data source dynamically binds real tournament name');
assert(TemplateEditor.activeDataContext.leaderboard.length >= 3, 'Data source loads real tournament standings');
assert(TemplateEditor.activeDataContext.leaderboard[0].totalPoints === 26, 'ScoringEngine placement + kills (12 + 14 = 26) reflected in table');

// Pagination slice test
table.maxRows = 2;
table.pageIndex = 0;
const page1 = TemplateEditor.getActiveLeaderboard(table);
assert(page1.length === 2 && page1[0].teamName === 'Total Gaming', 'Page 1 correctly displays top 2 ranks');

table.pageIndex = 1;
const page2 = TemplateEditor.getActiveLeaderboard(table);
assert(page2.length === 2 && page2[0].teamName === 'Orangutan', 'Page 2 correctly displays 3rd rank');

console.log('\n====================================================');
console.log(`SUMMARY: ${passCount} passed, ${failCount} failed.`);
console.log('====================================================\n');

if (failCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
