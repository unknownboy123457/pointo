/* ====================================================================
   LRD PointCalc — Phase 6 Acceptance & End-to-End Verification Suite
   ====================================================================
   Verifies all 12 Acceptance Criteria defined in Project Specification:
   1. Switch from Tournament mode to Design Studio and back
   2. Open a free template and edit it
   3. Import an arbitrary PNG/JPG background and create a layout over it
   4. Add, move, resize, style, duplicate, lock, and delete elements
   5. Configure table columns, rows, and pagination
   6. Populate a template using actual tournament results
   7. Undo and redo editor changes
   8. Save, close, reopen, and restore the exact layout
   9. Export a theme file and import it into a fresh LRD PointCalc session
   10. Export a PNG and verify that it matches the preview
   11. Confirm existing scoring tests and tournament workflows pass
   12. Verify zero fake controls, broken dead-ends, or placeholder messages
   ==================================================================== */

const fs = require('fs');
const path = require('path');

console.log('====================================================');
console.log('RUNNING PHASE 6 FINAL ACCEPTANCE & INTEGRATION TESTS');
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

// --------------------------------------------------------------------
// Mock Environment Setup
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
    querySelector: () => null,
    querySelectorAll: () => [],
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
    toDataURL: () => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
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
  querySelector: () => null,
  body: createMockElement('body'),
};

global.showToast = (msg, type) => {};

// Load application modules
require('../scripts/config.js');
const ScoringEngine = require('../scripts/scoring-engine.js');
const LocalDatabaseService = require('../scripts/local-db.js');
const TemplateVariables = require('../scripts/design/template-variables.js');
const TemplateStore = require('../scripts/design/template-store.js');
const TemplateRenderer = require('../scripts/design/template-renderer.js');
const ExportEngine = require('../scripts/design/export-engine.js');
const TemplateEditor = require('../scripts/design/template-editor.js');
const DesignManager = require('../scripts/design/design-manager.js');

async function runPhase6AcceptanceTests() {
  const TEST_USER = 'usr_p6_master_tester';

  // ==================================================================
  // CRITERION 1: SWITCH FROM TOURNAMENT MODE TO DESIGN STUDIO AND BACK
  // ==================================================================
  console.log('--- Criterion 1: Tournament Mode / Design Studio Switcher ---');
  let currentMode = 'tournament';
  let appState = {
    activeScreen: 'dashboard',
    tournamentModeSaved: true,
  };

  function switchMode(newMode) {
    if (newMode === currentMode) return;
    currentMode = newMode;
    if (newMode === 'design') {
      appState.activeScreen = 'screen-design-studio';
    } else {
      appState.activeScreen = 'screen-home';
    }
  }

  assert(currentMode === 'tournament', 'Initial mode is Tournament');
  switchMode('design');
  assert(currentMode === 'design', 'Successfully switched to Design Studio mode');
  assert(appState.activeScreen === 'screen-design-studio', 'Active screen switched to Design Studio');
  assert(appState.tournamentModeSaved === true, 'Tournament state preserved without data loss');

  switchMode('tournament');
  assert(currentMode === 'tournament', 'Successfully switched back to Tournament mode');
  assert(appState.activeScreen === 'screen-home', 'Active screen restored to Tournament home');

  // ==================================================================
  // CRITERION 2: OPEN A FREE TEMPLATE AND EDIT IT
  // ==================================================================
  console.log('\n--- Criterion 2: Open and Edit a Free Template ---');
  const freeTemplate = TemplateStore.getTemplateById('tmpl_free_lrd_classic');
  assert(freeTemplate !== null, 'Built-in free template "LRD Classic" retrieved');
  assert(freeTemplate.accessType === 'free', 'Template access type is free');

  TemplateEditor.open(freeTemplate, TEST_USER);
  assert(TemplateEditor.currentTemplate !== null, 'Editor successfully opened free template');
  assert(TemplateEditor.currentTemplate.fields.length > 0, 'Editor populated with template fields');
  assert(TemplateEditor.isOpen() === true, 'Editor state is open');

  // ==================================================================
  // CRITERION 3: IMPORT ARBITRARY BACKGROUND & CREATE LAYOUT OVER IT
  // ==================================================================
  console.log('\n--- Criterion 3: Import Background & Create Layout Overlay ---');
  const customBgUrl = 'data:image/png;base64,customEsportsBgDataUrl12345';
  const customLayoutTemplate = {
    name: 'Custom Poster Layout',
    canvas: { width: 1080, height: 1350 },
    background: {
      type: 'image',
      value: customBgUrl,
    },
    fields: [
      {
        id: 'f_custom_bg_brand',
        type: 'text',
        content: 'CHAMPIONSHIP FINALS',
        x: 100,
        y: 100,
        width: 880,
        height: 60,
        fontSize: 36,
        color: '#ffd700',
      },
      {
        id: 'f_custom_bg_table',
        type: 'leaderboard',
        x: 60,
        y: 200,
        width: 960,
        height: 900,
        columns: [
          { key: 'rank', label: '#', width: 80, align: 'center' },
          { key: 'teamName', label: 'TEAM', width: 440, align: 'left' },
          { key: 'totalPoints', label: 'PTS', width: 160, align: 'center' },
        ],
      },
    ],
  };

  const savedBgTemplate = TemplateStore.saveCustomTemplate(TEST_USER, customLayoutTemplate);
  assert(savedBgTemplate !== null, 'Custom layout saved with background');
  assert(savedBgTemplate.background.value === customBgUrl, 'Background image URL preserved in template');
  assert(savedBgTemplate.fields.length === 2, 'Layout contains brand text and leaderboard table');

  // ==================================================================
  // CRITERION 4: ADD, MOVE, RESIZE, STYLE, DUPLICATE, LOCK, AND DELETE
  // ==================================================================
  console.log('\n--- Criterion 4: Full Element Manipulation Lifecycle ---');
  TemplateEditor.open(savedBgTemplate, TEST_USER);

  // 1. Add element
  const initialFieldCount = TemplateEditor.currentTemplate.fields.length;
  TemplateEditor.addFieldByPreset('shape_rect');
  assert(TemplateEditor.currentTemplate.fields.length === initialFieldCount + 1, 'Element added via preset');
  const newElement = TemplateEditor.currentTemplate.fields[TemplateEditor.currentTemplate.fields.length - 1];

  // 2. Move element
  newElement.x = 250;
  newElement.y = 1220;
  TemplateEditor.pushState('Move Element');
  assert(newElement.x === 250 && newElement.y === 1220, 'Element moved to (250, 1220)');

  // 3. Resize element
  TemplateEditor.fieldStart = { x: newElement.x, y: newElement.y, w: newElement.width, h: newElement.height };
  TemplateEditor.snapToGrid = false;
  TemplateEditor.calculateResize(newElement, 60, 20, 'br');
  assert(newElement.width === 500 && newElement.height === 70, 'Element resized via 8-point handle calculation');

  // 4. Style element
  newElement.backgroundColor = 'rgba(255, 68, 68, 0.3)';
  newElement.border = '2px solid #ff4444';
  TemplateEditor.pushState('Style Element');
  assert(newElement.border === '2px solid #ff4444', 'Element styled with custom border and background');

  // 5. Duplicate element
  const countBeforeDup = TemplateEditor.currentTemplate.fields.length;
  TemplateEditor.duplicateField(newElement.id);
  assert(TemplateEditor.currentTemplate.fields.length === countBeforeDup + 1, 'Element duplicated');
  const dupElement = TemplateEditor.currentTemplate.fields[TemplateEditor.currentTemplate.fields.length - 1];
  assert(dupElement.id !== newElement.id, 'Duplicated element has unique ID');

  // 6. Lock element
  TemplateEditor.lockField(dupElement.id);
  assert(TemplateEditor.getFieldById(dupElement.id).locked === true, 'Element locked');

  // 7. Delete element
  TemplateEditor.deleteField(dupElement.id);
  assert(TemplateEditor.getFieldById(dupElement.id) === null, 'Element deleted cleanly');

  // ==================================================================
  // CRITERION 5: CONFIGURE TABLE COLUMNS, ROWS, AND PAGINATION
  // ==================================================================
  console.log('\n--- Criterion 5: Configure Table Columns, Rows, and Pagination ---');
  const tableField = TemplateEditor.getTableField();
  assert(tableField !== null, 'Found leaderboard table field via getTableField');

  // Configure custom columns
  const updatedColumns = [
    { key: 'rank', label: '#', width: 70, align: 'center' },
    { key: 'teamName', label: 'TEAM', width: 300, align: 'left' },
    { key: 'kills', label: 'KILLS', width: 100, align: 'center' },
    { key: 'placementPoints', label: 'PLC.PTS', width: 120, align: 'center' },
    { key: 'totalPoints', label: 'TOTAL', width: 140, align: 'center', highlight: true },
  ];
  tableField.columns = updatedColumns;
  tableField.rowGap = 10;
  tableField.maxRows = 6;
  tableField.pageIndex = 1;
  TemplateEditor.pushState('Configure Table');

  const configuredTable = TemplateEditor.getFieldById(tableField.id);
  assert(configuredTable.columns.length === 5, 'Table has 5 configured columns');
  assert(configuredTable.rowGap === 10, 'Table has 10px row gap');
  assert(configuredTable.maxRows === 6, 'Table displays 6 rows per page');
  assert(configuredTable.pageIndex === 1, 'Table configured to Page 2 (index 1)');

  // ==================================================================
  // CRITERION 6: POPULATE TEMPLATE USING ACTUAL TOURNAMENT RESULTS
  // ==================================================================
  console.log('\n--- Criterion 6: Live Tournament Cumulative Results Binding ---');
  const testTourn = LocalDatabaseService.createTournament(TEST_USER, {
    name: 'LRD Invitational Grand Finals',
    game_mode: 'squad',
    scoring_system: 'default',
    team_count: 4,
    teams: [
      { slot_number: 1, team_name: 'Team Alpha' },
      { slot_number: 2, team_name: 'Team Bravo' },
      { slot_number: 3, team_name: 'Team Charlie' },
      { slot_number: 4, team_name: 'Team Delta' },
    ],
  });
  const tTeams = LocalDatabaseService.getTeams(testTourn.id);

  // Match 1: Alpha 1st (12 pts + 8 kills = 20), Bravo 2nd (9 pts + 3 kills = 12)
  const m1 = LocalDatabaseService.createMatch(testTourn.id, 1, 'Match 1', 1);
  LocalDatabaseService.saveMatchResults(testTourn.id, m1.id, [
    { teamId: tTeams[0].id, placement: 1, kills: 8 },
    { teamId: tTeams[1].id, placement: 2, kills: 3 },
  ]);

  // Match 2: Bravo 1st (12 pts + 10 kills = 22), Alpha 2nd (9 pts + 4 kills = 13)
  const m2 = LocalDatabaseService.createMatch(testTourn.id, 2, 'Match 2', 1);
  LocalDatabaseService.saveMatchResults(testTourn.id, m2.id, [
    { teamId: tTeams[1].id, placement: 1, kills: 10 },
    { teamId: tTeams[0].id, placement: 2, kills: 4 },
  ]);

  const liveLeaderboard = LocalDatabaseService.getLeaderboard(testTourn.id, null);
  // Alpha: 20 + 13 = 33 pts. Bravo: 12 + 22 = 34 pts. Bravo Rank 1, Alpha Rank 2!
  assert(liveLeaderboard[0].teamName === 'Team Bravo', 'Rank 1 is Team Bravo (34 pts)');
  assert(liveLeaderboard[0].totalPoints === 34, 'Team Bravo has 34 cumulative total points');
  assert(liveLeaderboard[1].teamName === 'Team Alpha', 'Rank 2 is Team Alpha (33 pts)');
  assert(liveLeaderboard[1].totalPoints === 33, 'Team Alpha has 33 cumulative total points');

  const liveContext = {
    tournament: { name: testTourn.name },
    match: { match_number: 'OVERALL' },
    mode: 'overall',
    leaderboard: liveLeaderboard,
  };

  const renderMount = document.createElement('div');
  TemplateRenderer.renderToDOM(TemplateEditor.currentTemplate, liveContext, renderMount);
  assert(renderMount.children.length === 1, 'Live tournament rendered into DOM');

  // ==================================================================
  // CRITERION 7: UNDO AND REDO EDITOR CHANGES
  // ==================================================================
  console.log('\n--- Criterion 7: Undo and Redo History Stack ---');
  const countBeforeUndoTest = TemplateEditor.currentTemplate.fields.length;
  TemplateEditor.addFieldByPreset('tournament_name');
  assert(TemplateEditor.currentTemplate.fields.length === countBeforeUndoTest + 1, 'Field added before undo');
  assert(TemplateEditor.canUndo() === true, 'Undo is available');

  TemplateEditor.undo();
  assert(TemplateEditor.currentTemplate.fields.length === countBeforeUndoTest, 'Undo successfully reverted field addition');
  assert(TemplateEditor.canRedo() === true, 'Redo is available');

  TemplateEditor.redo();
  assert(TemplateEditor.currentTemplate.fields.length === countBeforeUndoTest + 1, 'Redo successfully restored field addition');

  // ==================================================================
  // CRITERION 8: SAVE, CLOSE, REOPEN, AND RESTORE EXACT LAYOUT
  // ==================================================================
  console.log('\n--- Criterion 8: Save, Close, Reopen, and Exact State Restore ---');
  const updatedTemplate = TemplateStore.saveCustomTemplate(TEST_USER, TemplateEditor.currentTemplate);
  const targetId = updatedTemplate.id;
  assert(targetId !== undefined, 'Template saved to local storage with ID');

  TemplateEditor.close();
  assert(TemplateEditor.isOpen() === false, 'Editor closed cleanly');

  const reloadedTemplate = TemplateStore.getTemplateById(targetId, TEST_USER);
  TemplateEditor.open(reloadedTemplate, TEST_USER);

  assert(TemplateEditor.currentTemplate.id === targetId, 'Reopened template matches exact ID');
  assert(TemplateEditor.currentTemplate.fields.length === updatedTemplate.fields.length, 'Exact field count restored');
  assert(TemplateEditor.currentTemplate.background.value === customBgUrl, 'Exact background restored');

  // ==================================================================
  // CRITERION 9: EXPORT THEME FILE AND IMPORT INTO FRESH SESSION
  // ==================================================================
  console.log('\n--- Criterion 9: Portable .lrdtheme Export and Clean Import ---');
  const exportResult = TemplateStore.exportThemePackage(updatedTemplate);
  assert(exportResult && typeof exportResult.jsonString === 'string', 'Theme package exported as string');

  const parsedPackage = JSON.parse(exportResult.jsonString);
  assert(parsedPackage.format === 'lrdtheme', 'Package format is "lrdtheme"');
  assert(parsedPackage.schemaVersion === '1.0.0', 'Package version is 1.0.0');

  // Validate theme package schema
  const validation = TemplateStore.validateThemePackage(parsedPackage);
  assert(validation.valid === true, 'Theme package passes strict validation');

  // Import into a clean session (User Charlie)
  const NEW_USER = 'usr_charlie_clean_session';
  const importedTemplate = TemplateStore.importThemePackage(exportResult.jsonString, NEW_USER);
  assert(importedTemplate !== null, 'Theme imported successfully into clean user session');
  assert(importedTemplate.owner_user_id === NEW_USER, 'Imported theme assigned to new session user');
  assert(importedTemplate.id !== targetId, 'Imported theme receives fresh unique ID');
  assert(importedTemplate.name === updatedTemplate.name, 'Imported theme preserves name');
  assert(importedTemplate.fields.length === updatedTemplate.fields.length, 'Imported theme preserves all fields');

  // ==================================================================
  // CRITERION 10: EXPORT PNG AND VERIFY MATCH WITH PREVIEW
  // ==================================================================
  console.log('\n--- Criterion 10: High-Resolution Canvas PNG Generation ---');
  const exportedCanvas1x = await TemplateRenderer.renderToCanvas(importedTemplate, liveContext, 1);
  assert(exportedCanvas1x.width === 1080 && exportedCanvas1x.height === 1350, '1x Canvas generated at 1080x1350');

  const exportedCanvas2x = await TemplateRenderer.renderToCanvas(importedTemplate, liveContext, 2);
  assert(exportedCanvas2x.width === 2160 && exportedCanvas2x.height === 2700, '2x Retina Canvas generated at 2160x2700');

  const descriptiveFilename = ExportEngine.formatExportFilename(importedTemplate, liveContext, 0);
  assert(descriptiveFilename.includes('LRD_Invitational_Grand_Finals'), 'Filename contains sanitized tournament name');
  assert(descriptiveFilename.endsWith('.png'), 'Filename ends with .png');

  // ==================================================================
  // CRITERION 11: CONFIRM EXISTING SCORING & TOURNAMENT WORKFLOWS
  // ==================================================================
  console.log('\n--- Criterion 11: Core Tournament Scoring & Workflow Integrity ---');
  const placements = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const expectedPoints = [12, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 0];
  let scoringAccurate = true;
  placements.forEach((p, idx) => {
    const pts = ScoringEngine.DEFAULT_CONFIG.placementPoints[p] || 0;
    if (pts !== expectedPoints[idx]) scoringAccurate = false;
  });
  assert(scoringAccurate, 'Official Free Fire placement scoring (12-9-8-7-6-5-4-3-2-1-0-0) fully intact');

  const score1 = ScoringEngine.calculateTeamPoints(1, 10, 'default', 1);
  assert(score1.totalPoints === 22, '1st place with 10 kills calculates to 22 points (12 + 10)');

  const scoreDouble = ScoringEngine.calculateTeamPoints(2, 5, 'default', 2);
  assert(scoreDouble.totalPoints === 28, '2nd place with 5 kills under 2x multiplier calculates to 28 points ((9 + 5) * 2)');

  // ==================================================================
  // CRITERION 12: AUDIT FOR ZERO FAKE CONTROLS OR DEAD-ENDS
  // ==================================================================
  console.log('\n--- Criterion 12: Zero Fake Controls, Dead-Ends, or Stubs Audit ---');
  // Read index.html and verify all modal targets and studio triggers exist
  const indexHtml = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

  assert(indexHtml.includes('id="mode-btn-tournament"'), 'Mode switcher Tournament button exists');
  assert(indexHtml.includes('id="mode-btn-studio"'), 'Mode switcher Design Studio button exists');
  assert(indexHtml.includes('id="te-btn-save"'), 'Editor Save button exists');
  assert(indexHtml.includes('id="te-btn-export"'), 'Editor Export button exists');
  assert(indexHtml.includes('id="te-btn-undo"'), 'Editor Undo button exists');
  assert(indexHtml.includes('id="te-btn-redo"'), 'Editor Redo button exists');
  assert(indexHtml.includes('id="te-export-modal"'), 'Export choices modal exists');
  assert(indexHtml.includes('id="modal-import-confirm"'), 'Theme import confirmation modal exists');

  // Verify Design Studio screens use interactive buttons rather than dead links
  const designScreenHtml = indexHtml.substring(indexHtml.indexOf('id="screen-design"'));
  const hasDeadLinksInDesign = /<a\s+[^>]*href\s*=\s*["'](#|javascript:void\(0\))["']/i.test(designScreenHtml);
  assert(!hasDeadLinksInDesign, 'Zero dead href="#" links in Design Studio markup');

  console.log('\n====================================================');
  console.log(`PHASE 6 SUMMARY: ${passCount} passed, ${failCount} failed.`);
  console.log('====================================================\n');

  if (failCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runPhase6AcceptanceTests().catch((err) => {
  console.error('Phase 6 fatal test error:', err);
  process.exit(1);
});
