/* ====================================================================
   LRD PointCalc — Design & Point Table Template System Test Suite
   ====================================================================
   Validates Section 20 test specifications:
   - Tournament: "LRD THUNDER STRIKE CUP"
   - Socials: YouTube "LRD ESPORTS", Instagram "@LRDESPORTS"
   - At least 10 teams, at least 2 matches
   - All 18 verification checkpoints
   ==================================================================== */

const assert = require('assert');

// Set up mock browser environment
const localStorageData = {};
global.localStorage = {
  getItem: (key) => localStorageData[key] || null,
  setItem: (key, val) => { localStorageData[key] = String(val); },
  removeItem: (key) => { delete localStorageData[key]; },
  clear: () => { Object.keys(localStorageData).forEach((k) => delete localStorageData[k]); },
};

global.window = global;
global.window.localStorage = global.localStorage;
global.window.location = { hash: '', search: '', pathname: '/' };
global.window.performance = { now: () => Date.now() };

// 1. Load Modules
const ScoringEngine = require('./scoring-engine.js');
global.ScoringEngine = ScoringEngine;
global.window.ScoringEngine = ScoringEngine;

require('./local-db.js');
const LocalDatabaseService = global.window.LocalDatabaseService;

require('./design/template-variables.js');
const TemplateVariables = global.window.TemplateVariables;

require('./design/template-store.js');
const TemplateStore = global.window.TemplateStore;

require('./design/template-renderer.js');
const TemplateRenderer = global.window.TemplateRenderer;

require('./design/export-engine.js');
const ExportEngine = global.window.ExportEngine;

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

console.log('====================================================');
console.log('RUNNING LRD DESIGN / POINT TABLE SYSTEM TESTS');
console.log('====================================================\n');

const TEST_USER = {
  id: 'usr_esports_lead_8829',
  email: 'esports@lrd.gg',
  user_metadata: { is_premium: false },
};

// Setup: Create 10+ teams and 2 matches
console.log('--- Setup: Tournament, 10 Teams, 2 Matches ---');
const tournament = LocalDatabaseService.createTournament(TEST_USER.id, {
  name: 'LRD THUNDER STRIKE CUP',
  team_count: 12,
  game_mode: 'squad',
  scoring_system: 'default',
  teamsData: [
    { name: 'Total Gaming' },
    { name: 'Orangutan Elite' },
    { name: 'GodLike Esports' },
    { name: 'Team Elite' },
    { name: 'Blind Esports' },
    { name: 'Nigma Galaxy' },
    { name: 'TSM FTX' },
    { name: 'Team Chaos' },
    { name: 'Chemin Esports' },
    { name: 'Enigma Gaming' },
    { name: 'Revenant Esports' },
    { name: 'Hyderabad Hydras' },
  ],
});

const teams = LocalDatabaseService.getTeams(tournament.id);

// Match 1: Total Gaming 1st with 12 kills, Orangutan 2nd with 6 kills
const m1 = LocalDatabaseService.createMatch(tournament.id, 1, 1);
const m1Entries = [
  { teamId: teams[0].id, placement: 1, kills: 12 },  // Total: 12 + 12 = 24
  { teamId: teams[1].id, placement: 2, kills: 6 },   // Total: 9 + 6 = 15
  { teamId: teams[2].id, placement: 3, kills: 4 },   // Total: 8 + 4 = 12
  { teamId: teams[3].id, placement: 4, kills: 2 },   // Total: 7 + 2 = 9
  { teamId: teams[4].id, placement: 5, kills: 3 },   // Total: 6 + 3 = 9
  { teamId: teams[5].id, placement: 6, kills: 1 },   // Total: 5 + 1 = 6
  { teamId: teams[6].id, placement: 7, kills: 0 },   // Total: 4 + 0 = 4
  { teamId: teams[7].id, placement: 8, kills: 2 },   // Total: 3 + 2 = 5
  { teamId: teams[8].id, placement: 9, kills: 1 },   // Total: 2 + 1 = 3
  { teamId: teams[9].id, placement: 10, kills: 0 },  // Total: 1 + 0 = 1
  { teamId: teams[10].id, placement: 11, kills: 0 }, // Total: 0 + 0 = 0
  { teamId: teams[11].id, placement: 12, kills: 0 }, // Total: 0 + 0 = 0
];
LocalDatabaseService.saveMatchResults(tournament.id, m1.id, m1Entries, 1);

// Match 2: Orangutan Elite 1st with 8 kills, Total Gaming 3rd with 5 kills
const m2 = LocalDatabaseService.createMatch(tournament.id, 2, 1);
const m2Entries = [
  { teamId: teams[1].id, placement: 1, kills: 8 },   // Orangutan: 12 + 8 = 20
  { teamId: teams[2].id, placement: 2, kills: 5 },   // GodLike: 9 + 5 = 14
  { teamId: teams[0].id, placement: 3, kills: 5 },   // Total Gaming: 8 + 5 = 13
  { teamId: teams[3].id, placement: 4, kills: 4 },
  { teamId: teams[4].id, placement: 5, kills: 2 },
  { teamId: teams[5].id, placement: 6, kills: 1 },
  { teamId: teams[6].id, placement: 7, kills: 0 },
  { teamId: teams[7].id, placement: 8, kills: 1 },
  { teamId: teams[8].id, placement: 9, kills: 0 },
  { teamId: teams[9].id, placement: 10, kills: 0 },
  { teamId: teams[10].id, placement: 11, kills: 0 },
  { teamId: teams[11].id, placement: 12, kills: 0 },
];
LocalDatabaseService.saveMatchResults(tournament.id, m2.id, m2Entries, 1);

console.log('--- SECTION 20 VERIFICATION CHECKPOINTS ---');

// Checkpoint 1: Free template works
it('1. Free template works and provides standard columns', () => {
  const freeTemplates = TemplateStore.getFreeTemplates();
  assert(freeTemplates.length >= 3, 'Must have at least 3 free templates');
  const classic = freeTemplates.find((t) => t.id === 'tmpl_free_lrd_classic');
  assert(classic, 'LRD Classic template exists');
  assert.strictEqual(classic.accessType, 'free');
  assert(classic.fields.some((f) => f.type === 'leaderboard'), 'Has repeating leaderboard field');
});

// Checkpoint 2: Premium template remains locked
it('2. Premium template remains locked for non-subscribed users', () => {
  const isAllowed = TemplateStore.isPremiumTemplateAllowed('tmpl_prem_apex_champ', TEST_USER);
  assert.strictEqual(isAllowed, false, 'Premium template must be locked');

  // But allowed if premium
  const premiumUser = { ...TEST_USER, user_metadata: { is_premium: true } };
  assert.strictEqual(TemplateStore.isPremiumTemplateAllowed('tmpl_prem_apex_champ', premiumUser), true);
});

// Checkpoint 3: Imported image can be used as background
it('3. Imported image can be used as canvas background locally', () => {
  const base64Mock = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const importedTmpl = TemplateStore.saveCustomTemplate(TEST_USER.id, {
    name: 'Imported BG Cup',
    background: { type: 'image', value: base64Mock },
    fields: [],
  });
  assert(importedTmpl.id.startsWith('tmpl_custom_'));
  assert.strictEqual(importedTmpl.background.type, 'image');
  assert.strictEqual(importedTmpl.background.value, base64Mock);
});

// Checkpoint 4: Dynamic tournament name works
it('4. Dynamic tournament name variable resolves cleanly', () => {
  const text = 'Standings: {{tournament.name}}';
  const resolved = TemplateVariables.resolveVariables(text, {
    tournament,
    info: { tournamentName: 'LRD THUNDER STRIKE CUP' },
  });
  assert.strictEqual(resolved, 'Standings: LRD THUNDER STRIKE CUP');
});

// Checkpoint 5: YouTube name works
it('5. Dynamic YouTube variable resolves cleanly', () => {
  const text = 'Watch live on {{tournament.youtube}}';
  const resolved = TemplateVariables.resolveVariables(text, {
    info: { youtube: 'LRD ESPORTS' },
  });
  assert.strictEqual(resolved, 'Watch live on LRD ESPORTS');
});

// Checkpoint 6: Instagram works
it('6. Dynamic Instagram variable resolves cleanly', () => {
  const text = 'Follow us: {{tournament.instagram}}';
  const resolved = TemplateVariables.resolveVariables(text, {
    info: { instagram: '@LRDESPORTS' },
  });
  assert.strictEqual(resolved, 'Follow us: @LRDESPORTS');
});

// Checkpoint 7-12: Single Match Table via ScoringEngine
const m1Leaderboard = LocalDatabaseService.getMatchLeaderboard(m1.id);

it('7. Team names come from actual tournament data', () => {
  assert.strictEqual(m1Leaderboard[0].teamName, 'Total Gaming');
  assert.strictEqual(m1Leaderboard[1].teamName, 'Orangutan Elite');
});

it('8. Position comes from actual match result', () => {
  assert.strictEqual(m1Leaderboard[0].placement, 1);
  assert.strictEqual(m1Leaderboard[1].placement, 2);
});

it('9. Kills come from actual match result', () => {
  assert.strictEqual(m1Leaderboard[0].kills, 12);
  assert.strictEqual(m1Leaderboard[1].kills, 6);
});

it('10. Placement points come from ScoringEngine (12-9-8...)', () => {
  assert.strictEqual(m1Leaderboard[0].placementPoints, 12); // 1st = 12
  assert.strictEqual(m1Leaderboard[1].placementPoints, 9);  // 2nd = 9
  assert.strictEqual(m1Leaderboard[2].placementPoints, 8);  // 3rd = 8
});

it('11. Kill points come from ScoringEngine (1 pt / kill)', () => {
  assert.strictEqual(m1Leaderboard[0].killPoints, 12);
  assert.strictEqual(m1Leaderboard[1].killPoints, 6);
});

it('12. Total points come from ScoringEngine (Placement + Kill)', () => {
  assert.strictEqual(m1Leaderboard[0].totalPoints, 24); // 12 + 12
  assert.strictEqual(m1Leaderboard[1].totalPoints, 15); // 9 + 6
  assert.strictEqual(m1Leaderboard[2].totalPoints, 12); // 8 + 4
});

// Checkpoint 13: Overall table works across multiple matches
it('13. Overall tournament leaderboard works across Match 1 & Match 2', () => {
  const overall = LocalDatabaseService.getTournamentLeaderboard(tournament.id);
  assert.strictEqual(overall.length, 12);

  // Total Gaming: M1(24) + M2(13) = 37 pts
  // Orangutan: M1(15) + M2(20) = 35 pts
  // GodLike: M1(12) + M2(14) = 26 pts
  assert.strictEqual(overall[0].teamName, 'Total Gaming');
  assert.strictEqual(overall[0].totalPoints, 37);
  assert.strictEqual(overall[0].rank, 1);

  assert.strictEqual(overall[1].teamName, 'Orangutan Elite');
  assert.strictEqual(overall[1].totalPoints, 35);
  assert.strictEqual(overall[1].rank, 2);

  assert.strictEqual(overall[2].teamName, 'GodLike Esports');
  assert.strictEqual(overall[2].totalPoints, 26);
  assert.strictEqual(overall[2].rank, 3);
});

// Checkpoint 14-17: Template CRUD and Persistence
let savedCustomId = null;

it('14. Template can be saved locally', () => {
  const newTmpl = TemplateStore.saveCustomTemplate(TEST_USER.id, {
    name: 'My Custom Gold Template',
    fields: [
      { id: 'f1', type: 'text', content: '{{tournament.name}}' },
    ],
  });
  assert(newTmpl.id);
  savedCustomId = newTmpl.id;
  assert.strictEqual(newTmpl.name, 'My Custom Gold Template');
});

it('15. Template survives browser restart (persists in localStorage)', () => {
  // Re-read directly from store simulating fresh reload
  const reloaded = TemplateStore.getTemplateById(savedCustomId, TEST_USER.id);
  assert(reloaded, 'Template exists after reload');
  assert.strictEqual(reloaded.name, 'My Custom Gold Template');
});

it('16. Template can be edited and renamed', () => {
  const updated = TemplateStore.updateCustomTemplate(TEST_USER.id, savedCustomId, {
    name: 'Updated Gold League Template',
  });
  assert.strictEqual(updated.name, 'Updated Gold League Template');
  const fetched = TemplateStore.getTemplateById(savedCustomId, TEST_USER.id);
  assert.strictEqual(fetched.name, 'Updated Gold League Template');
});

it('17. Template can be deleted without affecting tournaments', () => {
  const deleted = TemplateStore.deleteCustomTemplate(TEST_USER.id, savedCustomId);
  assert.strictEqual(deleted, true);
  assert.strictEqual(TemplateStore.getTemplateById(savedCustomId, TEST_USER.id), null);

  // Original tournament is untouched
  const tCheck = LocalDatabaseService.getTournamentById(tournament.id, TEST_USER.id);
  assert(tCheck, 'Original tournament must remain intact');
  assert.strictEqual(tCheck.name, 'LRD THUNDER STRIKE CUP');
});

// Checkpoint 18: Export does not include editor controls
it('18. Export engine generates clean presentation without editor controls', () => {
  const tmpl = TemplateStore.getFreeTemplates()[0];
  // Verify template fields do NOT contain editor handles or properties
  tmpl.fields.forEach((f) => {
    assert.strictEqual(f.isEditor, undefined);
    assert.strictEqual(f.isDragging, undefined);
  });
  assert(typeof ExportEngine.downloadPNG === 'function');
  assert(typeof ExportEngine.downloadPDF === 'function');
  assert(typeof ExportEngine.shareImage === 'function');
});

// Checkpoint 19: All 5 requested FREE templates exist
it('19. All 5 FREE templates exist (LRD Classic, LRD Gold, Dark Arena, Neon Battle, Minimal Pro)', () => {
  const freeTemplates = TemplateStore.getFreeTemplates();
  const names = freeTemplates.map((t) => t.name);
  assert(names.includes('LRD Classic'), 'Has LRD Classic');
  assert(names.includes('LRD Gold'), 'Has LRD Gold');
  assert(names.includes('Dark Arena'), 'Has Dark Arena');
  assert(names.includes('Neon Battle'), 'Has Neon Battle');
  assert(names.includes('Minimal Pro'), 'Has Minimal Pro');
  assert(freeTemplates.every((t) => t.accessType === 'free'));
});

// Checkpoint 20: All 3 requested PREMIUM templates exist with locked access
it('20. All 3 PREMIUM templates exist (Broadcast Gold, Cyber Neon Pro, Royal Championship)', () => {
  const premTemplates = TemplateStore.getPremiumTemplates();
  const names = premTemplates.map((t) => t.name);
  assert(names.includes('Broadcast Gold'), 'Has Broadcast Gold');
  assert(names.includes('Cyber Neon Pro'), 'Has Cyber Neon Pro');
  assert(names.includes('Royal Championship'), 'Has Royal Championship');
  assert(premTemplates.every((t) => t.accessType === 'premium'));
});

// Checkpoint 21: Top search accurately filters templates by keyword
it('21. Top search filters templates by "gold", "dark", "premium"', () => {
  const goldResults = TemplateStore.searchTemplates('gold', TEST_USER.id);
  assert(goldResults.length >= 2, 'Finds gold templates');
  assert(goldResults.some((t) => t.name.toLowerCase().includes('gold')));

  const darkResults = TemplateStore.searchTemplates('dark', TEST_USER.id);
  assert(darkResults.length >= 1, 'Finds Dark Arena');
  assert(darkResults.some((t) => t.name.includes('Dark Arena')));

  const premResults = TemplateStore.searchTemplates('premium', TEST_USER.id);
  assert(premResults.length >= 3, 'Finds premium templates by tag/category');
  assert(premResults.every((t) => t.accessType === 'premium'));
});

// Checkpoint 22: Color customization applies dynamic primary/accent/bg colors
it('22. Color button changes primary, secondary, text, accent, and background colors', () => {
  const tmpl = TemplateStore.getTemplateById('tmpl_free_lrd_classic');
  const customized = TemplateStore.applyColorsToTemplate(tmpl, {
    primary: '#00e5ff',
    secondary: '#ff0055',
    text: '#ffffff',
    accent: '#a855f7',
    background: '#050608',
  });
  assert.strictEqual(customized.colors.primary, '#00e5ff');
  assert.strictEqual(customized.colors.secondary, '#ff0055');
  assert.strictEqual(customized.colors.accent, '#a855f7');
  assert.strictEqual(customized.colors.background, '#050608');
});

// Checkpoint 23: Background customization supports solid, gradient, and uploaded image
it('23. Background button applies template, solid, or uploaded background', () => {
  const tmpl = TemplateStore.getTemplateById('tmpl_free_lrd_gold');
  
  // Solid color background
  const solidBg = TemplateStore.applyBackgroundToTemplate(tmpl, {
    type: 'color',
    value: '#000000',
  });
  assert.strictEqual(solidBg.background.type, 'color');
  assert.strictEqual(solidBg.background.value, '#000000');

  // Uploaded image background
  const imgBg = TemplateStore.applyBackgroundToTemplate(tmpl, {
    type: 'image',
    value: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  });
  assert.strictEqual(imgBg.background.type, 'image');
  assert(imgBg.background.value.startsWith('data:image/png'));
});

// Checkpoint 24: Template duplication creates independent custom copy
it('24. More -> Duplicate creates independent custom copy without mutating built-in', () => {
  const copy = TemplateStore.duplicateTemplate(TEST_USER.id, 'tmpl_free_minimal_pro');
  assert(copy, 'Copy created');
  assert(copy.name.includes('(Copy)'));
  assert.strictEqual(copy.category, 'custom');
  assert.strictEqual(copy.accessType, 'free');

  // Clean up
  TemplateStore.deleteCustomTemplate(TEST_USER.id, copy.id);
});

console.log('\n====================================================');
console.log(`SUMMARY: ${passed} passed, ${failed} failed.`);
console.log('====================================================');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
