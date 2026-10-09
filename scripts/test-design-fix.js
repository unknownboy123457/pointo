/**
 * Verification test suite for Design Studio differences fixes
 */
const assert = require('assert');

// Setup DOM mock
global.window = global;
global.document = {
  createElement: (tag) => {
    const el = {
      tagName: tag.toUpperCase(),
      style: {},
      dataset: {},
      classList: {
        classes: new Set(),
        add: (c) => el.classList.classes.add(c),
        remove: (c) => el.classList.classes.delete(c),
        contains: (c) => el.classList.classes.has(c),
        toggle: (c, force) => {
          if (force !== undefined) {
            force ? el.classList.classes.add(c) : el.classList.classes.delete(c);
          } else {
            el.classList.classes.has(c) ? el.classList.classes.delete(c) : el.classList.classes.add(c);
          }
        },
      },
      children: [],
      appendChild: (child) => {
        el.children.push(child);
        return child;
      },
      removeChild: (child) => {
        el.children = el.children.filter((c) => c !== child);
        return child;
      },
      querySelectorAll: () => [],
      querySelector: () => null,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    return el;
  },
  getElementById: () => null,
  querySelectorAll: () => [],
  fonts: { ready: Promise.resolve() },
};
global.localStorage = {
  _data: {},
  getItem: (k) => global.localStorage._data[k] || null,
  setItem: (k, v) => { global.localStorage._data[k] = String(v); },
  removeItem: (k) => { delete global.localStorage._data[k]; },
  clear: () => { global.localStorage._data = {}; },
};

// Load modules
const ScoringEngine = require('./scoring-engine');
const LocalDatabaseService = require('./local-db');
const TemplateVariables = require('./design/template-variables');
const TemplateStore = require('./design/template-store');
const TemplateRenderer = require('./design/template-renderer');
const ExportEngine = require('./design/export-engine');
const TemplateEditor = require('./design/template-editor');

console.log('====================================================');
console.log('RUNNING DESIGN STUDIO DIFFERENCES FIX VERIFICATION');
console.log('====================================================');

let passed = 0;
function test(desc, fn) {
  try {
    fn();
    console.log(`  ✓ PASS: ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${desc}`);
    console.error(err);
    process.exit(1);
  }
}

// 1. Built-in Templates Quality Audit
test('Built-in templates include rich esports graphics layers', () => {
  const freeTemplates = TemplateStore.getFreeTemplates();
  assert(freeTemplates.length >= 4, 'Should have at least 4 free templates');

  const classic = freeTemplates.find((t) => t.id === 'tmpl_free_lrd_classic');
  assert(classic, 'LRD Classic must exist');

  const headerCard = classic.fields.find((f) => f.id === 'f_classic_header_card');
  assert(headerCard && headerCard.type === 'shape', 'Must include header banner card');

  const tableCard = classic.fields.find((f) => f.id === 'f_classic_table_card');
  assert(tableCard && tableCard.type === 'shape', 'Must include table framing card');

  const footerCard = classic.fields.find((f) => f.id === 'f_classic_footer_card');
  assert(footerCard && footerCard.type === 'shape', 'Must include footer broadcast card');

  const table = classic.fields.find((f) => f.type === 'leaderboard');
  assert(table.rowGap === 8, 'Table must have rowGap for card separation');
  assert(table.rowStyle.top3Gold === true, 'Table must have top3 podium styling enabled');
});

// 2. Editor Leaderboard Rendering Check (No double-offset)
test('TemplateRenderer.renderLeaderboardFieldDOM direct rendering', () => {
  assert(typeof TemplateRenderer.renderLeaderboardFieldDOM === 'function', 'Must export renderLeaderboardFieldDOM');
  const dummyEl = document.createElement('div');
  const classic = TemplateStore.getTemplateById('tmpl_free_lrd_classic');
  const tableField = classic.fields.find((f) => f.type === 'leaderboard');
  const dummyLeaderboard = [
    { rank: 1, teamName: 'Alpha Pro', totalPoints: 35, placement: 1, kills: 12 },
    { rank: 2, teamName: 'Beta Elite', totalPoints: 28, placement: 2, kills: 8 },
  ];

  TemplateRenderer.renderLeaderboardFieldDOM(tableField, dummyEl, dummyLeaderboard, {});
  assert(dummyEl.children.length === 2, 'Should create header row and rows container');
  assert(dummyEl.style.display === 'flex', 'Should configure flex display');
});

// 3. Real Tournament Local Database Data Binding
test('Real tournament standings binding in TemplateEditor', () => {
  const userId = 'usr_real_tourn_test';
  const tourn = LocalDatabaseService.createTournament(userId, {
    name: 'Real Championship Finals',
    team_count: 3,
    teams: [{ name: 'Total Esports' }, { name: 'Godlike Warriors' }, { name: 'Blind Hunters' }],
  });

  const teams = LocalDatabaseService.getTeams(tourn.id);
  const match = LocalDatabaseService.createMatch(tourn.id, 1, 'Bermuda', 1);
  LocalDatabaseService.saveMatchResults(tourn.id, match.id, [
    { teamId: teams[0].id, placement: 1, kills: 15 },
    { teamId: teams[1].id, placement: 2, kills: 8 },
    { teamId: teams[2].id, placement: 3, kills: 4 },
  ]);

  const lb = LocalDatabaseService.getLeaderboard(tourn.id, null);
  assert(lb.length === 3, 'Must have 3 ranked teams');
  assert(lb[0].teamName === 'Total Esports', 'Rank 1 must be Total Esports');
  assert(lb[0].totalPoints === 27, 'Rank 1 points must be 12 + 15 = 27');

  // Verify editor default context resolves user tournament
  const editor = TemplateEditor;
  editor.userId = userId;
  const defaultCtx = editor.buildDefaultDataContext();
  assert(defaultCtx.tournament.name === 'Real Championship Finals', 'Editor default context must pick user tournament');
  assert(defaultCtx.leaderboard[0].teamName === 'Total Esports', 'Editor default leaderboard must have real team name');
  assert(defaultCtx.leaderboard[0].totalPoints === 27, 'Editor default leaderboard must have real points');
});

// 4. .lrdtheme Portability and Assets Preservation
test('.lrdtheme theme package preserves complete layout, background, and cards', () => {
  const classic = TemplateStore.getTemplateById('tmpl_free_lrd_classic');
  const res = TemplateStore.exportThemePackage(classic, { author: 'LRD Tester' });
  const pkgStr = res.jsonString;
  const validation = TemplateStore.validateThemePackage(pkgStr);
  assert(validation.valid === true, 'Exported package must be valid .lrdtheme JSON');
  assert(validation.theme.fields.length >= 10, 'Must preserve all rich framing and text fields');
  assert(validation.theme.background.type === 'gradient', 'Must preserve gradient background');

  const imported = TemplateStore.importThemePackage(pkgStr, 'usr_importer');
  assert(imported && imported.id, 'Import must succeed and assign ID');
  assert(imported.fields.length === classic.fields.length, 'Must preserve exact field count');
});

console.log('====================================================');
console.log(`ALL ${passed} VERIFICATION TESTS PASSED!`);
console.log('====================================================');
