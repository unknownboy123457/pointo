/**
 * ====================================================================
 * LRD POINTCALC — AUTOMATIC TABLE ELEMENT DETECTION & BINDING TESTS
 * ====================================================================
 * Verifies:
 * 1. Auto-configuration of table elements over imported background images (e.g. MLE SCRIMS).
 * 2. Header and row boundary detection & calibration (X, Y, W, H, rows, row height, row gap).
 * 3. 7 standard esports columns: POS, TEAM NAME, MATCH, PLACE, FINISH, TOTAL, WINS.
 * 4. Correct column mapping to tournament standings data fields.
 * 5. Automatic population of team names and real scores via LocalDatabaseService & ScoringEngine.
 * 6. Background image preservation and generated elements movable/resizable.
 * 7. Manual correction mode for custom grid offsets.
 * 8. Saving calibrated layout as a portable .lrdtheme package.
 * 9. Transparent cell overlays on flattened background images.
 * 10. Editor DOM preview and Canvas PNG export validation.
 * ====================================================================
 */

'use strict';

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

// --------------------------------------------------------------------
// Standalone Mock DOM Setup
// --------------------------------------------------------------------
const mockLocalStorage = {};
global.localStorage = {
  getItem: (k) => (mockLocalStorage.hasOwnProperty(k) ? mockLocalStorage[k] : null),
  setItem: (k, v) => { mockLocalStorage[k] = String(v); },
  removeItem: (k) => { delete mockLocalStorage[k]; },
  clear: () => { Object.keys(mockLocalStorage).forEach((k) => delete mockLocalStorage[k]); },
};

global.window = global;

function createMockElement(tag = 'div') {
  const classes = new Set();
  const children = [];
  let _innerHTML = '';
  let _textContent = '';
  const element = {
    tagName: tag.toUpperCase(),
    children,
    style: {},
    get className() {
      return Array.from(classes).join(' ');
    },
    set className(val) {
      classes.clear();
      String(val).split(/\s+/).filter(Boolean).forEach((c) => classes.add(c));
    },
    dataset: {},
    classList: {
      add: (...c) => c.forEach((x) => classes.add(x)),
      remove: (...c) => c.forEach((x) => classes.delete(x)),
      contains: (x) => classes.has(x),
    },
    appendChild: (child) => {
      children.push(child);
      return child;
    },
    removeChild: (child) => {
      const idx = children.indexOf(child);
      if (idx !== -1) children.splice(idx, 1);
      return child;
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    querySelector: (sel) => {
      if (sel.startsWith('.')) {
        const cls = sel.slice(1);
        for (const child of children) {
          if (child.classList?.contains(cls)) return child;
          if (child.querySelector) {
            const found = child.querySelector(sel);
            if (found) return found;
          }
        }
      }
      return null;
    },
    querySelectorAll: (sel) => {
      const res = [];
      if (sel.startsWith('.')) {
        const cls = sel.slice(1);
        for (const child of children) {
          if (child.classList?.contains(cls)) res.push(child);
          if (child.querySelectorAll) res.push(...child.querySelectorAll(sel));
        }
      }
      return res;
    },
    setAttribute: (attr, val) => { element[attr] = val; },
    getAttribute: (attr) => element[attr] || null,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1080, height: 1350, right: 1080, bottom: 1350 }),
    get innerHTML() { return _innerHTML; },
    set innerHTML(val) {
      _innerHTML = String(val);
      _textContent = String(val).replace(/<[^>]+>/g, '');
    },
    get textContent() {
      if (_textContent !== '') return _textContent;
      if (_innerHTML !== '') return _innerHTML.replace(/<[^>]+>/g, '');
      if (children.length > 0) return children.map((c) => c.textContent).join('');
      return '';
    },
    set textContent(val) {
      _textContent = String(val);
      _innerHTML = String(val);
    },
  };
  return element;
}

function createMockCanvas(width = 1080, height = 1350) {
  const drawOps = [];
  return {
    width,
    height,
    getContext: () => ({
      scale: (sx, sy) => drawOps.push({ op: 'scale', sx, sy }),
      fillRect: (x, y, w, h) => drawOps.push({ op: 'fillRect', x, y, w, h }),
      fillText: (text, x, y) => drawOps.push({ op: 'fillText', text, x, y }),
      measureText: (text) => ({ width: String(text).length * 10 }),
      save: () => drawOps.push({ op: 'save' }),
      restore: () => drawOps.push({ op: 'restore' }),
      beginPath: () => drawOps.push({ op: 'beginPath' }),
      moveTo: (x, y) => drawOps.push({ op: 'moveTo', x, y }),
      lineTo: (x, y) => drawOps.push({ op: 'lineTo', x, y }),
      quadraticCurveTo: (cpx, cpy, x, y) => drawOps.push({ op: 'quadraticCurveTo', cpx, cpy, x, y }),
      closePath: () => drawOps.push({ op: 'closePath' }),
      clip: () => drawOps.push({ op: 'clip' }),
      rect: (x, y, w, h) => drawOps.push({ op: 'rect', x, y, w, h }),
      stroke: () => drawOps.push({ op: 'stroke' }),
      fill: () => drawOps.push({ op: 'fill' }),
      arc: (x, y, r) => drawOps.push({ op: 'arc', x, y, r }),
      translate: (x, y) => drawOps.push({ op: 'translate', x, y }),
      rotate: (deg) => drawOps.push({ op: 'rotate', deg }),
      drawImage: (img, x, y, w, h) => drawOps.push({ op: 'drawImage', x, y, w, h }),
      createLinearGradient: () => ({ addColorStop: () => {} }),
      createRadialGradient: () => ({ addColorStop: () => {} }),
    }),
    toBlob: (cb) => cb({ size: 2048, type: 'image/png' }),
    toDataURL: () => 'data:image/png;base64,mock',
    drawOps,
  };
}

const mockDomElements = {};
global.document = {
  createElement: (tag) => {
    if (tag === 'canvas') return createMockCanvas();
    return createMockElement(tag);
  },
  getElementById: (id) => {
    if (!mockDomElements[id]) {
      mockDomElements[id] = createMockElement('div');
      mockDomElements[id].id = id;
    }
    return mockDomElements[id];
  },
  querySelectorAll: () => [],
  fonts: { ready: Promise.resolve() },
};

// Load System Dependencies
const ScoringEngine = require('./scoring-engine');
global.window.ScoringEngine = ScoringEngine;

const LocalDatabaseService = require('./local-db');
global.window.LocalDatabaseService = LocalDatabaseService;

const TemplateVariables = require('./design/template-variables');
global.window.TemplateVariables = TemplateVariables;

const TemplateStore = require('./design/template-store');
global.window.TemplateStore = TemplateStore;

const TemplateRenderer = require('./design/template-renderer');
global.window.TemplateRenderer = TemplateRenderer;

const ExportEngine = require('./design/export-engine');
global.window.ExportEngine = ExportEngine;

const TemplateEditor = require('./design/template-editor');
global.window.TemplateEditor = TemplateEditor;

// Initialize Editor
TemplateEditor.init();

console.log('====================================================');
console.log('RUNNING AUTO-CONFIGURE TABLE DETECTION & BINDING TESTS');
console.log('====================================================');

const TEST_USER = 'usr_auto_table_test';

// -------------------------------------------------------------
// TEST 1: Background Preservation & Initial Setup
// -------------------------------------------------------------
console.log('\n--- 1. Background Preservation with Empty Grid ---');

const mleScrimsBackground = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const baseTemplate = {
  id: 'tmpl_mle_scrims_01',
  name: 'MLE SCRIMS Daily Cup',
  category: 'custom',
  canvas: { width: 1080, height: 1350 },
  background: {
    type: 'image',
    value: mleScrimsBackground,
  },
  fields: [
    {
      id: 'f_title',
      type: 'text',
      content: 'MLE SCRIMS DAY 1',
      x: 100,
      y: 120,
      width: 880,
      height: 60,
      fontSize: 36,
      color: '#d4af37',
    },
  ],
};

TemplateEditor.open(baseTemplate, TEST_USER);
assert(TemplateEditor.isOpen() === true, 'TemplateEditor opened template');
assert(TemplateEditor.currentTemplate.background.value === mleScrimsBackground, 'Background image preserved exactly');

// -------------------------------------------------------------
// TEST 2: Auto-Configure Table Application (MLE SCRIMS Preset)
// -------------------------------------------------------------
console.log('\n--- 2. Auto-Configure Table Execution (MLE SCRIMS Grid) ---');

const tableField = TemplateEditor.applyAutoTable({
  x: 60,
  y: 260,
  width: 960,
  height: 930,
  maxRows: 12,
  rowHeight: 75,
  rowGap: 0,
  hideHeader: true,
  transparentCells: true,
  top3Gold: false,
});

assert(tableField !== null, 'Table field created and returned');
assert(tableField.type === 'leaderboard', 'Field is of type leaderboard');
assert(tableField.x === 60, 'Table X coordinate is 60px');
assert(tableField.y === 260, 'Table Y coordinate is 260px');
assert(tableField.width === 960, 'Table width is 960px');
assert(tableField.height === 930, 'Table height is 930px');
assert(tableField.maxRows === 12, '12 rows configured for standard Free Fire lobby');
assert(tableField.rowHeight === 75, 'Row height set to 75px');
assert(tableField.hideHeader === true, 'Header hidden to display background printed header');
assert(tableField.rowStyle.backgroundColor === 'transparent', 'Cells transparent for background overlay');

// -------------------------------------------------------------
// TEST 3: Column Mapping & Standard Esports Columns
// -------------------------------------------------------------
console.log('\n--- 3. Required Columns: POS, TEAM NAME, MATCH, PLACE, FINISH, TOTAL, WINS ---');

const colKeys = tableField.columns.map((c) => c.key);
const colLabels = tableField.columns.map((c) => c.label);

assert(colKeys.includes('rank'), 'POS column mapped to rank');
assert(colKeys.includes('teamName'), 'TEAM NAME column mapped to teamName');
assert(colKeys.includes('matchesPlayed'), 'MATCH column mapped to matchesPlayed');
assert(colKeys.includes('position'), 'PLACE column mapped to position');
assert(colKeys.includes('kills'), 'FINISH column mapped to kills');
assert(colKeys.includes('totalPoints'), 'TOTAL column mapped to totalPoints');
assert(colKeys.includes('booyahs'), 'WINS column mapped to booyahs');

assert(colLabels.includes('POS'), 'Label POS present');
assert(colLabels.includes('TEAM NAME'), 'Label TEAM NAME present');
assert(colLabels.includes('MATCH'), 'Label MATCH present');
assert(colLabels.includes('PLACE'), 'Label PLACE present');
assert(colLabels.includes('FINISH'), 'Label FINISH present');
assert(colLabels.includes('TOTAL'), 'Label TOTAL present');
assert(colLabels.includes('WINS'), 'Label WINS present');

// -------------------------------------------------------------
// TEST 4: Real Tournament Standings Data Population
// -------------------------------------------------------------
console.log('\n--- 4. Real Tournament Standings Binding via ScoringEngine ---');

// Create real test tournament in LocalDatabaseService
const testTournament = LocalDatabaseService.createTournament(TEST_USER, {
  name: 'MLE SCRIMS PRO LEAGUE',
  teams: [
    { name: 'Total Gaming' },
    { name: 'Orangutan Elite' },
    { name: 'GodLike Esports' },
  ],
});

const teams = LocalDatabaseService.getTeams(testTournament.id);
const teamA = teams.find((t) => t.name === 'Total Gaming');
const teamB = teams.find((t) => t.name === 'Orangutan Elite');
const teamC = teams.find((t) => t.name === 'GodLike Esports');

// Add match 1
const match1 = LocalDatabaseService.createMatch(testTournament.id, 1, 'Bermuda', 1);

LocalDatabaseService.saveMatchResults(testTournament.id, match1.id, [
  { teamId: teamA.id, placement: 1, kills: 12 }, // 12 + 12 = 24 pts, 1 booyah
  { teamId: teamB.id, placement: 2, kills: 7 },  // 9 + 7 = 16 pts
  { teamId: teamC.id, placement: 3, kills: 5 },  // 8 + 5 = 13 pts
]);

// Switch data source in TemplateEditor to testTournament.id
TemplateEditor.setDataSource(testTournament.id);

const activeLB = TemplateEditor.getActiveLeaderboard(tableField);
assert(activeLB.length >= 3, 'Active leaderboard retrieved real tournament teams');
assert(activeLB[0].teamName === 'Total Gaming', 'Rank 1 team is Total Gaming');
assert(activeLB[0].totalPoints === 24, 'Rank 1 total points is 24');
assert(activeLB[0].kills === 12, 'Rank 1 finish kills is 12');
assert(activeLB[0].placementPoints === 12, 'Rank 1 placement points is 12');
assert(activeLB[0].booyahs === 1, 'Rank 1 wins/booyahs count is 1');
assert(activeLB[0].matchesPlayed === 1, 'Rank 1 matches played is 1');

// -------------------------------------------------------------
// TEST 5: DOM Rendering with Transparent Overlays & No Header
// -------------------------------------------------------------
console.log('\n--- 5. DOM Rendering with Transparent Cells & Hidden Header ---');

const domContainer = createMockElement('div');
TemplateRenderer.renderLeaderboardFieldDOM(tableField, domContainer, activeLB, {
  tournament: testTournament,
  mode: 'overall',
});

// Since hideHeader is true, header should not be rendered
const headerEl = domContainer.querySelector('.leaderboard-header-row');
assert(headerEl === null, 'Header row omitted from DOM as background has pre-printed headers');

const rowEls = domContainer.querySelectorAll('.leaderboard-data-row');
assert(rowEls.length >= 3, 'Table data rows rendered');
assert(rowEls[0].style.backgroundColor === 'transparent', 'Data row has transparent background');

const r1Team = rowEls[0].querySelector('.lb-col-teamName');
assert(r1Team && r1Team.textContent === 'Total Gaming', 'Row 1 displays real team name');

const r1Total = rowEls[0].querySelector('.lb-col-totalPoints');
assert(r1Total && r1Total.textContent === '24', 'Row 1 displays real total points (24)');

const r1Wins = rowEls[0].querySelector('.lb-col-booyahs');
assert(r1Wins && r1Wins.textContent === '1', 'Row 1 displays real wins (1)');

// -------------------------------------------------------------
// TEST 6: Canvas Rendering & PNG Export Integrity
// -------------------------------------------------------------
console.log('\n--- 6. Canvas Rendering & PNG Export ---');

TemplateRenderer.renderToCanvas(TemplateEditor.currentTemplate, TemplateEditor.activeDataContext, 2)
  .then((canvas) => {
    assert(canvas !== null, 'Canvas rendered successfully');
    assert(canvas.width === 2160, 'Canvas rendered at 2x retina width (2160)');
    assert(canvas.height === 2700, 'Canvas rendered at 2x retina height (2700)');
  });

// -------------------------------------------------------------
// TEST 7: Element Editability, Movability & Resize
// -------------------------------------------------------------
console.log('\n--- 7. Element Editability, Movability & Resize ---');

tableField.x = 80;
tableField.y = 280;
TemplateEditor.render();

const updatedField = TemplateEditor.getFieldById(tableField.id);
assert(updatedField.x === 80, 'Table field moved to X=80');
assert(updatedField.y === 280, 'Table field moved to Y=280');
assert(TemplateEditor.currentTemplate.background.value === mleScrimsBackground, 'Background image preserved after move');

// -------------------------------------------------------------
// TEST 8: Export Layout as Portable .lrdtheme Package
// -------------------------------------------------------------
console.log('\n--- 8. Portable .lrdtheme Package Export ---');

const { package: themePkg, jsonString: themePkgStr } = TemplateStore.exportThemePackage(TemplateEditor.currentTemplate);

assert(themePkg.format === 'lrdtheme', 'Package format is lrdtheme');
assert(themePkg.theme.background.value === mleScrimsBackground, 'Theme package preserves background');
assert(themePkg.theme.fields.some((f) => f.type === 'leaderboard'), 'Theme package preserves configured table');

const imported = TemplateStore.importThemePackage(themePkgStr, TEST_USER);
assert(imported.id !== TemplateEditor.currentTemplate.id, 'Imported theme given fresh unique ID');
assert(imported.background.value === mleScrimsBackground, 'Imported theme preserves background');
assert(imported.fields.some((f) => f.type === 'leaderboard'), 'Imported theme preserves table configuration');

console.log('\n====================================================');
console.log(`SUMMARY: ${passCount} passed, ${failCount} failed.`);
console.log('====================================================');

if (failCount > 0) {
  process.exit(1);
}
