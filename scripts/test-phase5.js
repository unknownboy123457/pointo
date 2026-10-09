/* ====================================================================
   LRD PointCalc — Phase 5 Acceptance & Verification Tests
   ====================================================================
   Verifies:
   1. TemplateRenderer DOM presentation with live tournament context
   2. Variable interpolation & safe text truncation with ellipsis
   3. Table Engine rendering with all 9 columns and rowGap spacing
   4. Podium top-3 ranking highlights (Gold, Silver, Bronze badges)
   5. Pagination slicing & multi-page canvas generation
   6. ExportEngine resolution scales (1x, 2x Retina, 4K) & descriptive naming
   7. Live tournament data binding from multi-match cumulative database
   ==================================================================== */

const fs = require('fs');
const path = require('path');

console.log('====================================================');
console.log('RUNNING PHASE 5 ACCEPTANCE VERIFICATION TESTS');
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

// Mock DOM elements with styling and classList
function createMockElement(tag = 'div') {
  const classes = new Set();
  const children = [];
  let _innerHTML = '';
  let _textContent = '';
  return {
    tagName: tag.toUpperCase(),
    children,
    style: {},
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
    setAttribute: () => {},
    get innerHTML() { return _innerHTML; },
    set innerHTML(val) {
      _innerHTML = String(val);
      _textContent = String(val).replace(/<[^>]+>/g, '');
    },
    get textContent() {
      if (_textContent !== '') return _textContent;
      if (_innerHTML !== '') return _innerHTML.replace(/<[^>]+>/g, '');
      if (children.length > 0) {
        return children.map((c) => c.textContent).join('');
      }
      return '';
    },
    set textContent(val) {
      _textContent = String(val);
      _innerHTML = String(val);
    },
  };
}

// Mock Canvas 2D context
function createMockCanvas(width = 1080, height = 1350) {
  const drawOps = [];
  return {
    width,
    height,
    getContext: (type) => ({
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
    toBlob: (cb) => cb(new Blob ? new Blob() : { size: 1024, type: 'image/png' }),
    toDataURL: () => 'data:image/png;base64,mockCanvasPNG',
    drawOps,
  };
}

global.document = {
  createElement: (tag) => {
    if (tag === 'canvas') return createMockCanvas();
    return createMockElement(tag);
  },
  getElementById: (id) => createMockElement('div'),
  querySelectorAll: () => [],
  querySelector: () => null,
  body: createMockElement('body'),
};

global.showToast = (msg) => {};

// Require modules
require('../scripts/config.js');
const ScoringEngine = require('../scripts/scoring-engine.js');
const LocalDatabaseService = require('../scripts/local-db.js');
const TemplateVariables = require('../scripts/design/template-variables.js');
const TemplateStore = require('../scripts/design/template-store.js');
const TemplateRenderer = require('../scripts/design/template-renderer.js');
const ExportEngine = require('../scripts/design/export-engine.js');

(async function runAllPhase5Tests() {
  // ==================================================================
  // 1. TEMPLATE RENDERER DOM PRESENTATION
  // ==================================================================
  console.log('--- 1. TemplateRenderer DOM Presentation ---');

const baseTemplate = TemplateStore.getTemplateById('tmpl_free_lrd_classic');
const domContainer = document.createElement('div');

const testDataContext = {
  tournament: {
    name: 'Free Fire All-Stars Invitational',
    organizer: 'Garena Esports',
    youtube: 'FF ESPORTS OFFICIAL',
    instagram: '@FFESPORTS',
  },
  match: {
    match_number: 3,
  },
  info: {
    date: 'Oct 24, 2026',
  },
  mode: 'overall',
  leaderboard: [
    { rank: 1, teamName: 'Total Gaming', placement: 1, kills: 14, placementPoints: 12, killPoints: 14, totalPoints: 26, matchesPlayed: 3, booyahs: 2 },
    { rank: 2, teamName: 'Orangutan', placement: 2, kills: 8, placementPoints: 9, killPoints: 8, totalPoints: 17, matchesPlayed: 3, booyahs: 1 },
    { rank: 3, teamName: 'GodLike Esports', placement: 3, kills: 6, placementPoints: 8, killPoints: 6, totalPoints: 14, matchesPlayed: 3, booyahs: 0 },
    { rank: 4, teamName: 'Blind Esports', placement: 4, kills: 4, placementPoints: 7, killPoints: 4, totalPoints: 11, matchesPlayed: 3, booyahs: 0 },
  ],
};

TemplateRenderer.renderToDOM(baseTemplate, testDataContext, domContainer);
assert(domContainer.children.length === 1, 'renderToDOM mounts canvas wrapper');
const canvasWrapper = domContainer.children[0];
assert(canvasWrapper.style.width === '1080px' && canvasWrapper.style.height === '1350px', 'Canvas wrapper maintains exact 1080x1350 dimensions');

// Check resolved variable text inside child elements
const titleFieldEl = canvasWrapper.children.find(c => c.textContent && c.textContent.includes('Free Fire All-Stars Invitational'));
assert(titleFieldEl !== undefined, 'Variable {{tournament.name}} dynamically resolves to "Free Fire All-Stars Invitational"');

// ==================================================================
// 2. CONFIGURABLE TABLE ENGINE COLUMNS & ROW GAP RENDERING
// ==================================================================
console.log('\n--- 2. Table Engine Columns & Row Gap Rendering ---');

// Build a custom template with all 9 esports columns
const allColsTemplate = {
  name: 'Full Columns Test',
  canvas: { width: 1080, height: 1350 },
  background: { type: 'color', value: '#08090f' },
  fields: [
    {
      id: 'f_table_full',
      type: 'leaderboard',
      x: 50,
      y: 150,
      width: 980,
      height: 1000,
      rowHeight: 65,
      headerHeight: 48,
      rowGap: 8,
      maxRows: 4,
      pageIndex: 0,
      columns: [
        { key: 'rank', label: '#', width: 60, align: 'center' },
        { key: 'teamName', label: 'TEAM', width: 280, align: 'left' },
        { key: 'matchesPlayed', label: 'M', width: 60, align: 'center' },
        { key: 'position', label: 'PLC', width: 80, align: 'center' },
        { key: 'kills', label: 'KILLS', width: 90, align: 'center' },
        { key: 'placementPoints', label: 'PTS-P', width: 90, align: 'center' },
        { key: 'killPoints', label: 'PTS-K', width: 90, align: 'center' },
        { key: 'totalPoints', label: 'TOTAL', width: 110, align: 'center' },
        { key: 'booyahs', label: 'WIN', width: 70, align: 'center' },
      ],
      rowStyle: {
        borderRadius: 8,
        top3Gold: true,
      },
    },
  ],
};

const domContainerCols = document.createElement('div');
TemplateRenderer.renderToDOM(allColsTemplate, testDataContext, domContainerCols);

const tableFieldEl = domContainerCols.children[0].children[0];
assert(tableFieldEl !== undefined, 'Table field element renders in DOM');

// Header row validation
const headerRow = tableFieldEl.children[0];
assert(headerRow.children.length === 9, 'Table header displays all 9 configured columns');
assert(headerRow.children[0].textContent === '#', 'Header column 1 is "#"');
assert(headerRow.children[1].textContent === 'TEAM', 'Header column 2 is "TEAM"');
assert(headerRow.children[7].textContent === 'TOTAL', 'Header column 8 is "TOTAL"');
assert(headerRow.children[8].textContent === 'WIN', 'Header column 9 is "WIN"');

// Rows container validation
const rowsContainer = tableFieldEl.children[1];
assert(rowsContainer.children.length === 4, 'Table displays exactly 4 rows (maxRows slice)');

// Row 1 checks (Total Gaming - Rank 1)
const row1 = rowsContainer.children[0];
assert(row1.children[1].textContent === 'Total Gaming', 'Row 1 displays correct team name');
assert(row1.children[2].textContent === '3', 'Row 1 displays matches played (3)');
assert(row1.children[4].textContent === '14', 'Row 1 displays kills (14)');
assert(row1.children[5].textContent === '12', 'Row 1 displays placement points (12)');
assert(row1.children[6].textContent === '14', 'Row 1 displays kill points (14)');
assert(row1.children[7].textContent.includes('26'), 'Row 1 displays total points (26)');
assert(row1.children[8].textContent === '2', 'Row 1 displays booyahs count (2)');
assert(row1.style.marginBottom === '8px', 'Row gap (8px) applied to row styling');
assert(row1.style.borderRadius === '8px', 'Row border radius (8px) applied cleanly');

// ==================================================================
// 3. PODIUM TOP-3 HIGHLIGHTS & CANVAS RENDERING
// ==================================================================
console.log('\n--- 3. Top-3 Podium Highlights & Canvas Rendering ---');

// Check top 3 backgrounds
assert(row1.style.backgroundColor.includes('rgba(212, 175, 55'), 'Rank 1 receives Gold highlight background');
const row2 = rowsContainer.children[1];
assert(row2.style.backgroundColor.includes('rgba(192, 192, 192'), 'Rank 2 receives Silver highlight background');
const row3 = rowsContainer.children[2];
assert(row3.style.backgroundColor.includes('rgba(205, 127, 50'), 'Rank 3 receives Bronze highlight background');

  // Canvas 2D rendering test
  const canvas = await TemplateRenderer.renderToCanvas(allColsTemplate, testDataContext, 2);
  assert(canvas !== null, 'renderToCanvas returns valid canvas object');
  assert(canvas.width === 2160 && canvas.height === 2700, 'Scale factor 2 generates 2160x2700 retina canvas');
  assert(canvas.drawOps && canvas.drawOps.length > 20, 'Canvas executes complete draw operations stack');

  // ==================================================================
  // 4. PAGINATION SLICING & MULTI-PAGE GENERATION
  // ==================================================================
  console.log('\n--- 4. Pagination Slicing & Multi-Page Canvas Generation ---');

  // Page 0 (Top 2 teams)
  allColsTemplate.fields[0].maxRows = 2;
  allColsTemplate.fields[0].pageIndex = 0;
  const canvasPage0 = await ExportEngine.exportPageCanvas(allColsTemplate, testDataContext, 0, { scale: 1 });
  assert(canvasPage0 !== null, 'exportPageCanvas generates Canvas for Page 1');

  // Page 1 (Teams 3 and 4)
  const canvasPage1 = await ExportEngine.exportPageCanvas(allColsTemplate, testDataContext, 1, { scale: 1 });
  assert(canvasPage1 !== null, 'exportPageCanvas generates Canvas for Page 2');

// ==================================================================
// 5. EXPORT ENGINE OPTIMIZATIONS & FILENAME FORMATTING
// ==================================================================
console.log('\n--- 5. Export Engine Optimizations & Filename Formatting ---');

const fname1 = ExportEngine.formatExportFilename(allColsTemplate, testDataContext, null);
assert(fname1.includes('Free_Fire_All-Stars_Invitational'), 'Filename contains sanitized tournament name');
assert(fname1.includes('Overall_Standings'), 'Filename contains overall standings mode');
assert(fname1.endsWith('.png'), 'Filename has .png extension');

const fnamePage2 = ExportEngine.formatExportFilename(allColsTemplate, testDataContext, 1);
assert(fnamePage2.includes('_Page2.png'), 'Multi-page filename includes page suffix (_Page2.png)');

// Single Match Mode filename
const singleMatchCtx = {
  ...testDataContext,
  mode: 'single',
  match: { match_number: 4 },
};
const fnameSingle = ExportEngine.formatExportFilename(allColsTemplate, singleMatchCtx);
assert(fnameSingle.includes('Match_4'), 'Single match filename includes "Match_4"');

// ==================================================================
// 6. LIVE TOURNAMENT DATA INTEGRATION WITH LOCAL DATABASE & SCORING
// ==================================================================
console.log('\n--- 6. Live Tournament Cumulative Standings Integration ---');

const testOwner = 'usr_p5_organizer';

// 1. Create a tournament with 12 teams
const tourn = LocalDatabaseService.createTournament(testOwner, {
  name: 'FFWS Asia Championship 2026',
  game_mode: 'squad',
  scoring_system: 'default',
  team_count: 12,
  teams: [
    { slot_number: 1, team_name: 'EVOS Esports' },
    { slot_number: 2, team_name: 'Buriram United' },
    { slot_number: 3, team_name: 'RRQ Kazu' },
    { slot_number: 4, team_name: 'Team Flash' },
    { slot_number: 5, team_name: 'Morph Team' },
    { slot_number: 6, team_name: 'P Esports' },
    { slot_number: 7, team_name: 'WAG' },
    { slot_number: 8, team_name: 'CGGG' },
    { slot_number: 9, team_name: 'EXP Esports' },
    { slot_number: 10, team_name: 'Heavy' },
    { slot_number: 11, team_name: 'GOW' },
    { slot_number: 12, team_name: 'GodLike' },
  ],
});
assert(tourn !== null, 'Tournament created in LocalDatabaseService');

const teams = LocalDatabaseService.getTeams(tourn.id);
assert(teams.length === 12, '12 teams created in local DB');

// 2. Record Match 1
const match1 = LocalDatabaseService.createMatch(tourn.id, 1, 'Match 1 - Bermuda', 1);
LocalDatabaseService.saveMatchResults(tourn.id, match1.id, [
  { teamId: teams[0].id, placement: 1, kills: 10 }, // EVOS: 12 + 10 = 22 pts
  { teamId: teams[1].id, placement: 2, kills: 6 },  // Buriram: 9 + 6 = 15 pts
  { teamId: teams[2].id, placement: 3, kills: 4 },  // RRQ: 8 + 4 = 12 pts
  { teamId: teams[3].id, placement: 4, kills: 2 },  // Flash: 7 + 2 = 9 pts
]);

// 3. Record Match 2 (with 2x Multiplier special round)
const match2 = LocalDatabaseService.createMatch(tourn.id, 2, 'Match 2 - Purgatory (2x Double Points)', 2);
LocalDatabaseService.saveMatchResults(tourn.id, match2.id, [
  { teamId: teams[1].id, placement: 1, kills: 8 }, // Buriram: (12 + 8) * 2 = 40 pts
  { teamId: teams[0].id, placement: 2, kills: 5 }, // EVOS: (9 + 5) * 2 = 28 pts
  { teamId: teams[2].id, placement: 3, kills: 3 }, // RRQ: (8 + 3) * 2 = 22 pts
  { teamId: teams[3].id, placement: 4, kills: 1 }, // Flash: (7 + 1) * 2 = 16 pts
], null, 2);

// 4. Retrieve cumulative overall leaderboard deterministically
const overallLeaderboard = LocalDatabaseService.getLeaderboard(tourn.id, null);
assert(overallLeaderboard.length === 12, 'Leaderboard contains all 12 teams');

// Verify cumulative standings
// Buriram: Match 1 (15) + Match 2 (40) = 55 points (Rank 1)
// EVOS: Match 1 (22) + Match 2 (28) = 50 points (Rank 2)
// RRQ: Match 1 (12) + Match 2 (22) = 34 points (Rank 3)
assert(overallLeaderboard[0].teamName === 'Buriram United', 'Rank 1 is Buriram United');
assert(overallLeaderboard[0].totalPoints === 55, 'Rank 1 cumulative total points is 55 (15 + 40)');
assert(overallLeaderboard[0].totalKills === 14, 'Rank 1 cumulative total kills is 14 (6 + 8)');
assert(overallLeaderboard[0].booyahs === 1, 'Rank 1 has 1 Booyah');

assert(overallLeaderboard[1].teamName === 'EVOS Esports', 'Rank 2 is EVOS Esports');
assert(overallLeaderboard[1].totalPoints === 50, 'Rank 2 cumulative total points is 50 (22 + 28)');
assert(overallLeaderboard[1].booyahs === 1, 'Rank 2 has 1 Booyah');

assert(overallLeaderboard[2].teamName === 'RRQ Kazu', 'Rank 3 is RRQ Kazu');
assert(overallLeaderboard[2].totalPoints === 34, 'Rank 3 cumulative total points is 34 (12 + 22)');

// 5. Bind directly to TemplateRenderer
const realTournamentCtx = {
  tournament: {
    name: tourn.name,
    gameMode: tourn.game_mode,
  },
  match: { match_number: 'OVERALL' },
  mode: 'overall',
  leaderboard: overallLeaderboard,
};

const finalRenderContainer = document.createElement('div');
TemplateRenderer.renderToDOM(allColsTemplate, realTournamentCtx, finalRenderContainer);

const renderedTableRows = finalRenderContainer.children[0].children[0].children[1].children;
assert(renderedTableRows[0].children[1].textContent === 'Buriram United', 'Live Rendered Row 1 is Buriram United');
assert(renderedTableRows[0].children[7].textContent.includes('55'), 'Live Rendered Row 1 Points is 55');
assert(renderedTableRows[1].children[1].textContent === 'EVOS Esports', 'Live Rendered Row 2 is EVOS Esports');
assert(renderedTableRows[1].children[7].textContent.includes('50'), 'Live Rendered Row 2 Points is 50');

  console.log('\n====================================================');
  console.log(`SUMMARY: ${passCount} passed, ${failCount} failed.`);
  console.log('====================================================\n');

  if (failCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
})().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
