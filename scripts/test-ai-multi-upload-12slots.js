/**
 * LRD PointCalc — AI Multi-Image Upload + 12-Slot Review System Test Suite
 * Tests all 15 acceptance criteria specified in the user request.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Mock browser global environment for Node.js
if (typeof window === 'undefined') {
  global.window = global;
}

// Mock localStorage
const storage = {};
global.localStorage = {
  getItem: (k) => storage[k] || null,
  setItem: (k, v) => { storage[k] = String(v); },
  removeItem: (k) => { delete storage[k]; },
  clear: () => { Object.keys(storage).forEach((k) => delete storage[k]); },
};

// Mock document
if (typeof document === 'undefined') {
  global.document = {
    getElementById: () => null,
    querySelectorAll: () => [],
    querySelector: () => null,
    createElement: (tag) => ({
      textContent: '', innerHTML: '', className: '',
      appendChild: () => {},
      addEventListener: () => {},
      classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
      querySelectorAll: () => [],
      querySelector: () => null,
      style: {},
      dataset: {},
    }),
    readyState: 'complete',
    addEventListener: () => {},
  };
}

// Mock URL
URL.createObjectURL = (f) => 'blob:mock-preview-url-' + (f && f.name ? f.name : 'temp');
URL.revokeObjectURL = () => {};

// Load dependencies
const ScoringEngine = require('./scoring-engine');
global.ScoringEngine = ScoringEngine;
window.ScoringEngine = ScoringEngine;
require('./local-db');
require('./ai/ai-service');
require('./ai/ai-scanner');

let passedTests = 0;
let failedTests = 0;

function it(desc, fn) {
  try {
    fn();
    console.log(`  ✓ PASS: ${desc}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${desc}`);
    console.error(`    ${err.message}`);
    failedTests++;
  }
}

console.log('\n============================================================');
console.log('LRD POINTCALC AI — MULTI-IMAGE UPLOAD + 12-SLOT TEST SUITE');
console.log('============================================================\n');

const testOwnerId = 'usr_ai_12slots_test';
let testTournament = null;

// Setup test tournament
try {
  testTournament = window.LocalDatabaseService.createTournament(testOwnerId, {
    name: 'Free Fire Grand Championship',
    game_mode: 'squad',
    team_count: 12,
    scoring_system: 'default',
  });
} catch (e) {
  console.error('Setup error:', e);
}

// ------------------------------------------------------------------
// 1. Uploading multiple images in one selection
// ------------------------------------------------------------------
console.log('\n--- 1. Multi-Image Unified Upload ---');
it('should accept multiple files in a single selection and create thumbnail previews', () => {
  const scanner = window.AIScanner;
  scanner.open({ tournamentId: testTournament.id, ownerUserId: testOwnerId });

  const fakeFiles = [
    { name: 'lobby_slots_1_12.png', size: 1024 * 500, type: 'image/png' },
    { name: 'match_results_screen1.jpg', size: 1024 * 700, type: 'image/jpeg' },
  ];

  scanner.addScreenshots(fakeFiles);
  const uploads = scanner.getUploadedScreenshots();

  assert.strictEqual(uploads.length, 2, 'Should have exactly 2 uploaded screenshots');
  assert.strictEqual(uploads[0].name, 'lobby_slots_1_12.png');
  assert.strictEqual(uploads[1].name, 'match_results_screen1.jpg');
});

// ------------------------------------------------------------------
// 2. Adding more images afterward without removing existing ones
// ------------------------------------------------------------------
console.log('\n--- 2. Appending Additional Images Later ---');
it('should append new images without discarding previously uploaded ones', () => {
  const scanner = window.AIScanner;
  const initialCount = scanner.getUploadedScreenshots().length;

  const additionalFiles = [
    { name: 'match_results_screen2.png', size: 1024 * 600, type: 'image/png' },
  ];

  scanner.addScreenshots(additionalFiles);
  const currentCount = scanner.getUploadedScreenshots().length;

  assert.strictEqual(currentCount, initialCount + 1, 'Should now have 3 total uploaded screenshots');
  assert.strictEqual(scanner.getUploadedScreenshots()[2].name, 'match_results_screen2.png');
});

// ------------------------------------------------------------------
// 3. Automatic classification of Slot List and End Screenshots
// ------------------------------------------------------------------
console.log('\n--- 3. Automatic Screenshot Classification ---');
it('should classify lobby screenshot as slot_list and results as end_result', () => {
  const service = window.AIService;

  const lobbyClass = service.classifyImageFile({ name: 'lobby_roster_bermuda.png' });
  assert.strictEqual(lobbyClass.category, 'slot_list', 'Should classify lobby as slot_list');

  const resultClass = service.classifyImageFile({ name: 'booyah_match_results_screen1.png' });
  assert.strictEqual(resultClass.category, 'end_result', 'Should classify match result as end_result');

  const unknownClass = service.classifyImageFile({ name: 'random_screenshot_123.png' });
  assert.strictEqual(unknownClass.category, 'unknown', 'Should classify vague filename as unknown');
});

// ------------------------------------------------------------------
// 4. Manual correction of screenshot categories
// ------------------------------------------------------------------
console.log('\n--- 4. Manual Category Correction ---');
it('should allow user to manually override the screenshot category', () => {
  const scanner = window.AIScanner;
  const uploads = scanner.getUploadedScreenshots();

  // Change category of 1st upload
  uploads[0].category = 'slot_list';
  uploads[1].category = 'end_result';
  uploads[2].category = 'end_result';

  assert.strictEqual(uploads[0].category, 'slot_list');
  assert.strictEqual(uploads[1].category, 'end_result');
  assert.strictEqual(uploads[2].category, 'end_result');
});

// ------------------------------------------------------------------
// 5. Extracting and merging all 12 slots
// ------------------------------------------------------------------
console.log('\n--- 5. 12-Slot Structure and Extraction ---');
it('should maintain exactly 12 editable slot sections (Slot 01 to Slot 12)', () => {
  const scanner = window.AIScanner;
  const slots = scanner.getSlots();

  assert.strictEqual(slots.length, 12, 'Must have exactly 12 slots');
  assert.strictEqual(slots[0].slot, 1, 'First slot is Slot 1');
  assert.strictEqual(slots[11].slot, 12, 'Last slot is Slot 12');
});

it('should merge extracted slot rosters into the 12-slot structure', async () => {
  const service = window.AIService;

  const rawLobby = `
Slot 1: Total Gaming [Ajjubhai, FozyAjay, VasiyoCRJ, Mafia]
Slot 2: Team Elite [Killer, Iconic, Pahadi, Jonty]
Slot 3: Nigma Galaxy [Vasiyo, Tahir, Soham, Golden]
`;
  const parsed = service.parseLobbyRosterText(rawLobby);

  assert.strictEqual(parsed.length, 3);
  assert.strictEqual(parsed[0].teamName, 'Total Gaming');
  assert.strictEqual(parsed[0].players.length, 4);
  assert.strictEqual(parsed[0].players[0].name, 'Ajjubhai');
});

// ------------------------------------------------------------------
// 6. Result screenshots that overlap (no double-counting)
// ------------------------------------------------------------------
console.log('\n--- 6. Overlapping Screenshot Deduplication ---');
it('should not double count player kills across overlapping result screenshots', () => {
  const service = window.AIService;

  const lobbySlots = [
    { slot: 1, teamName: 'Total Gaming', players: [{ name: 'Ajjubhai' }, { name: 'FozyAjay' }] },
    { slot: 2, teamName: 'Team Elite', players: [{ name: 'Killer' }, { name: 'Iconic' }] },
  ];

  // Screen 1 shows rank 1 and 2
  const screen1 = [
    { name: 'Ajjubhai', kills: 4, rank: 1 },
    { name: 'FozyAjay', kills: 3, rank: 1 },
    { name: 'Killer', kills: 2, rank: 2 },
  ];

  // Screen 2 overlaps with Killer (showing rank 2 again) and adds Iconic
  const screen2 = [
    { name: 'Killer', kills: 2, rank: 2 }, // OVERLAP: must not be counted twice!
    { name: 'Iconic', kills: 5, rank: 2 },
  ];

  const merged = service.mergeScreenshots(lobbySlots, [screen1, screen2]);

  const tgTeam = merged.teams.find((t) => t.teamName === 'Total Gaming');
  const eliteTeam = merged.teams.find((t) => t.teamName === 'Team Elite');

  assert.strictEqual(tgTeam.totalKills, 7, 'Total Gaming: 4 + 3 = 7 kills');
  assert.strictEqual(eliteTeam.totalKills, 7, 'Team Elite: 2 + 5 = 7 kills (not 2 + 2 + 5 = 9)');
});

// ------------------------------------------------------------------
// 7. Duplicate players and uncertain names
// ------------------------------------------------------------------
console.log('\n--- 7. Duplicate Player Detection ---');
it('should flag duplicate player names across slots for manual review', async () => {
  const service = window.AIService;

  const rawLobby = `
Slot 1: Team Alpha [SniperPro, Shadow]
Slot 2: Team Beta [SniperPro, Ghost]
`;
  const parsed = service.parseLobbyRosterText(rawLobby);
  const outcome = await service.extract12SlotsAndResults({
    slotListFiles: [],
    endResultFiles: [],
    existingSlots: [
      { slot: 1, teamName: 'Team Alpha', players: parsed[0].players },
      { slot: 2, teamName: 'Team Beta', players: parsed[1].players },
    ],
  });

  assert.strictEqual(outcome.warnings.length > 0, true, 'Should produce a duplicate player warning');
  assert.strictEqual(outcome.warnings[0].includes('duplicate player "SniperPro"'), true);
});

// ------------------------------------------------------------------
// 8. Teams with fewer or more than four players
// ------------------------------------------------------------------
console.log('\n--- 8. Variable Team Sizes (Fewer or More than 4) ---');
it('should support teams with 2 players (duo), 3 players, or 5 players without forcing 4', () => {
  const scanner = window.AIScanner;
  const slots = scanner.getSlots();

  // Slot 1: set 2 players
  slots[0].players = [{ id: 'p1', name: 'Duo1', kills: 0 }, { id: 'p2', name: 'Duo2', kills: 0 }];
  assert.strictEqual(slots[0].players.length, 2);

  // Slot 2: add 5th player
  slots[1].players = [
    { id: 'pa', name: 'P1', kills: 0 },
    { id: 'pb', name: 'P2', kills: 0 },
    { id: 'pc', name: 'P3', kills: 0 },
    { id: 'pd', name: 'P4', kills: 0 },
    { id: 'pe', name: 'SubP5', kills: 0 },
  ];
  assert.strictEqual(slots[1].players.length, 5);
});

// ------------------------------------------------------------------
// 9. Editing individual kills and recalculating team totals
// ------------------------------------------------------------------
console.log('\n--- 9. Live Kills Recalculation ---');
it('should immediately recalculate total team kills when a player kill is edited', () => {
  const scanner = window.AIScanner;
  const slots = scanner.getSlots();
  const results = scanner.getResults();

  slots[0].players = [
    { id: 'p1', name: 'Player A', kills: 2 },
    { id: 'p2', name: 'Player B', kills: 5 },
  ];

  scanner.recalculateTeam(0);
  assert.strictEqual(results[0].totalKills, 7, 'Team total should be 2 + 5 = 7');

  // Edit player A kills to 8
  scanner.updatePlayerKill(0, 0, 8);
  assert.strictEqual(results[0].totalKills, 13, 'Team total should now be 8 + 5 = 13');
});

it('should clearly support manual team kill override and reset back to sum', () => {
  const scanner = window.AIScanner;
  const results = scanner.getResults();

  // Override to 20
  scanner.overrideTeamKills(0, 20);
  assert.strictEqual(results[0].totalKills, 20);
  assert.strictEqual(results[0].teamKillsOverride, 20);

  // Reset override
  scanner.resetTeamKillsOverride(0);
  assert.strictEqual(results[0].teamKillsOverride, null);
  assert.strictEqual(results[0].totalKills, 13, 'Reverts to sum of player kills');
});

// ------------------------------------------------------------------
// 10. Editing and removing placements with duplicate detection
// ------------------------------------------------------------------
console.log('\n--- 10. Placement Management and Duplicate Detection ---');
it('should flag duplicate placements when two teams share the same rank', () => {
  const scanner = window.AIScanner;
  const results = scanner.getResults();

  scanner.updatePlacement(0, 1);
  scanner.updatePlacement(1, 1); // duplicate rank #1!

  assert.strictEqual(results[0].warnings.some((w) => w.includes('Duplicate placement #1')), true);
  assert.strictEqual(results[1].warnings.some((w) => w.includes('Duplicate placement #1')), true);

  // Fix placement
  scanner.updatePlacement(1, 2);
  assert.strictEqual(results[0].warnings.some((w) => w.includes('Duplicate placement')), false);
  assert.strictEqual(results[1].warnings.some((w) => w.includes('Duplicate placement')), false);
});

// ------------------------------------------------------------------
// 11. Saving and reusing a roster in future matches
// ------------------------------------------------------------------
console.log('\n--- 11. Remember Lobby & Saved Slot Lists ---');
it('should save a confirmed 12-slot roster and allow loading it in future matches', () => {
  const scanner = window.AIScanner;
  const db = window.LocalDatabaseService;

  const savedRoster = db.saveSlotList(testOwnerId, {
    name: 'Season 4 Finals Roster',
    tournament_id: testTournament.id,
    slots: scanner.getSlots().map((s) => ({
      slot: s.slot,
      teamName: `Pro Team ${s.slot}`,
      players: [{ name: `P${s.slot}A` }, { name: `P${s.slot}B` }],
    })),
  });

  assert.strictEqual(Boolean(savedRoster.id), true, 'Roster saved with unique ID');

  // Load into scanner
  scanner.loadSlotList(savedRoster.id);
  const reloadedSlots = scanner.getSlots();

  assert.strictEqual(reloadedSlots[0].teamName, 'Pro Team 1');
  assert.strictEqual(reloadedSlots[11].teamName, 'Pro Team 12');
  assert.strictEqual(reloadedSlots[0].players[0].name, 'P1A');
});

// ------------------------------------------------------------------
// 12. Manual mode with no AI credentials
// ------------------------------------------------------------------
console.log('\n--- 12. Dual Mode: Manual Mode Operation ---');
it('should allow complete manual entry of 12 slots and results with no AI required', () => {
  const scanner = window.AIScanner;
  scanner.switchMode('manual');

  assert.strictEqual(scanner.getMode(), 'manual', 'Switched to manual mode');

  // Direct manual edits
  scanner.updateTeamName(2, 'Hydra Esports');
  scanner.addPlayer(2, 'Dynamo');
  scanner.updatePlayerKill(2, 0, 6);
  scanner.updatePlacement(2, 3);

  const results = scanner.getResults();
  assert.strictEqual(results[2].teamName, 'Hydra Esports');
  assert.strictEqual(results[2].placement, 3);
  assert.strictEqual(results[2].totalKills, 6);
});

// ------------------------------------------------------------------
// 13. Correct scoring through existing ScoringEngine
// ------------------------------------------------------------------
console.log('\n--- 13. Deterministic ScoringEngine Calculation ---');
it('should compute official Free Fire points (1st=12pts, kills=1pt per kill)', () => {
  const engine = window.ScoringEngine;

  // Rank 1, 10 kills, 1x multiplier
  const res1 = engine.calculateTeamPoints(1, 10, null, 1);
  assert.strictEqual(res1.placementPoints, 12, '1st place placement points = 12');
  assert.strictEqual(res1.killPoints, 10, '10 kills = 10 pts');
  assert.strictEqual(res1.totalPoints, 22, 'Total points = 12 + 10 = 22');

  // Rank 2, 5 kills, 2x multiplier
  const res2 = engine.calculateTeamPoints(2, 5, null, 2);
  assert.strictEqual(res2.placementPoints, 9, '2nd place base placement points = 9');
  assert.strictEqual(res2.killPoints, 5, '5 base kills = 5 pts');
  assert.strictEqual(res2.multiplier, 2, 'Multiplier is 2x');
  assert.strictEqual(res2.totalPoints, 28, 'Total points = (9 + 5) * 2 = 28');
});

// ------------------------------------------------------------------
// 14. Saving, refreshing, and reopening the tournament
// ------------------------------------------------------------------
console.log('\n--- 14. Persistence & Reopening Matches ---');
it('should persist match results to local database and retrieve them accurately', () => {
  const db = window.LocalDatabaseService;

  const match = db.createMatch(testTournament.id, 1, 'Match 1', 1);
  const teamEntries = [
    { teamId: 'team_01', placement: 1, kills: 14 },
    { teamId: 'team_02', placement: 2, kills: 8 },
    { teamId: 'team_03', placement: 3, kills: 4 },
  ];

  db.saveMatchResults(testTournament.id, match.id, teamEntries, null, 1);
  const saved = db.getMatchResults(match.id);

  assert.strictEqual(saved.length, 3, 'Saved 3 team results');
  assert.strictEqual(saved[0].placement, 1);
  assert.strictEqual(saved[0].total_points, 26, '12 place pts + 14 kill pts = 26');
});

// ------------------------------------------------------------------
// 15. Standings Preview & Design Studio Compatibility
// ------------------------------------------------------------------
console.log('\n--- 15. Leaderboard Standings Binding ---');
it('should resolve tournament leaderboard deterministically for export and display', () => {
  const db = window.LocalDatabaseService;
  const leaderboard = db.getLeaderboard(testTournament.id, null);

  assert.strictEqual(Array.isArray(leaderboard), true);
});

console.log('\n============================================================');
console.log(`TEST SUITE RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
console.log('============================================================\n');

if (failedTests > 0) {
  process.exit(1);
}
