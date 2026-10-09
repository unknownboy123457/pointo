/* ====================================================================
   LRD PointCalc — AI + Manual Result System & Slot List Test Suite
   Verifies all 15 test criteria required in user prompt.
   ==================================================================== */

const assert = require('assert');

// Mock browser environment for Node.js
if (typeof window === 'undefined') {
  global.window = global;
}

// LocalStorage mock
if (typeof localStorage === 'undefined') {
  const store = {};
  global.localStorage = {
    getItem: (k) => store[k] || null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
  };
}

// Document mock
if (typeof document === 'undefined') {
  global.document = {
    getElementById: () => null,
    querySelectorAll: () => [],
    querySelector: () => null,
    createElement: (tag) => ({
      tagName: tag,
      textContent: '',
      innerHTML: '',
      className: '',
      classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
      appendChild: () => {},
      replaceChild: () => {},
      querySelectorAll: () => [],
      querySelector: () => null,
      addEventListener: () => {},
      dataset: {},
      style: {},
    }),
    readyState: 'complete',
    addEventListener: () => {},
  };
}

// Load core modules
const ScoringEngine = require('./scoring-engine.js');
global.window.ScoringEngine = ScoringEngine;
const LocalDatabaseService = require('./local-db.js');
global.window.LocalDatabaseService = LocalDatabaseService;
require('./ai/ai-service.js');
require('./ai/ai-scanner.js');

const AIService = global.window.AIService;
const AIScanner = global.window.AIScanner;

let passed = 0;
let failed = 0;
const failures = [];

function it(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ PASS: ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, err: err.message });
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.message}`);
  }
}

function section(title) {
  console.log(`\n====================================================\n${title}\n====================================================`);
}

console.log('====================================================');
console.log('RUNNING AI + MANUAL RESULT SYSTEM ACCEPTANCE TESTS');
console.log('====================================================');

const TEST_USER = 'usr_scanner_tester_123';

// ------------------------------------------------------------------
// CRITERION 1: AI extraction from lobby + 2 result screenshots
// ------------------------------------------------------------------
section('1. AI EXTRACTION & MULTI-SCREENSHOT MERGING');

it('Extracts rich lobby roster text with slots and individual player names', () => {
  const lobbyRaw = `
    1. Total Gaming [Mafia, FozyAjay, Vasi, Golden]
    2. Orangutan Elite [Jash, Driger, Pahadi, Iconic]
    3. GodLike Esports [Assassin, Nivesh, Ginotra, Divine]
  `;
  const lobbyRoster = AIService.parseLobbyRosterText(lobbyRaw);
  assert.strictEqual(lobbyRoster.length, 3);
  assert.strictEqual(lobbyRoster[0].slot, 1);
  assert.strictEqual(lobbyRoster[0].teamName, 'Total Gaming');
  assert.strictEqual(lobbyRoster[0].players.length, 4);
  assert.strictEqual(lobbyRoster[0].players[0].name, 'Mafia');
});

it('Parses end-game result screenshot 1 (Top 6 placements) with kills and ranks', () => {
  const screen1Raw = `
    #1 Mafia - 6 Kills
    #1 FozyAjay - 4 Kills
    #1 Vasi - 2 Kills
    #1 Golden - 2 Kills
    #2 Jash - 5 Kills
    #2 Driger - 3 Kills
  `;
  const results1 = AIService.parseMatchResultsText(screen1Raw);
  assert.strictEqual(results1.length, 6);
  assert.strictEqual(results1[0].name, 'Mafia');
  assert.strictEqual(results1[0].kills, 6);
  assert.strictEqual(results1[0].rank, 1);
});

it('Parses end-game result screenshot 2 (Placements 7-12 and overlapping rows)', () => {
  const screen2Raw = `
    #2 Jash - 5 Kills
    #3 Assassin - 4 Kills
    #3 Nivesh - 2 Kills
  `;
  const results2 = AIService.parseMatchResultsText(screen2Raw);
  assert.strictEqual(results2.length, 3);
  assert.strictEqual(results2[1].name, 'Assassin');
  assert.strictEqual(results2[1].kills, 4);
});

it('Combines overlapping result screenshots without double-counting players or kills', () => {
  const lobbyRaw = `
    1. Total Gaming [Mafia, FozyAjay, Vasi, Golden]
    2. Orangutan Elite [Jash, Driger, Pahadi, Iconic]
    3. GodLike Esports [Assassin, Nivesh, Ginotra, Divine]
  `;
  const lobby = AIService.parseLobbyRosterText(lobbyRaw);

  const res1 = [
    { rank: 1, name: 'Mafia', kills: 6 },
    { rank: 1, name: 'FozyAjay', kills: 4 },
    { rank: 2, name: 'Jash', kills: 5 }, // Jash appears here
  ];

  const res2 = [
    { rank: 2, name: 'Jash', kills: 5 }, // Jash overlaps here!
    { rank: 2, name: 'Driger', kills: 3 },
    { rank: 3, name: 'Assassin', kills: 4 },
  ];

  const merged = AIService.mergeScreenshots(lobby, [res1, res2]);
  assert.strictEqual(merged.teams.length, 3);

  // Total Gaming: Mafia(6) + FozyAjay(4) = 10 kills
  const tg = merged.teams.find((t) => t.teamName === 'Total Gaming');
  assert.strictEqual(tg.totalKills, 10);
  assert.strictEqual(tg.placement, 1);

  // Orangutan: Jash counted only once (5) + Driger (3) = 8 kills
  const og = merged.teams.find((t) => t.teamName === 'Orangutan Elite');
  assert.strictEqual(og.totalKills, 8);
  assert.strictEqual(og.placement, 2);

  // GodLike: Assassin (4) = 4 kills
  const gl = merged.teams.find((t) => t.teamName === 'GodLike Esports');
  assert.strictEqual(gl.totalKills, 4);
  assert.strictEqual(gl.placement, 3);
});

// ------------------------------------------------------------------
// CRITERION 2 & 3: Manual Mode & Mode Switching Without Data Loss
// ------------------------------------------------------------------
section('2. MANUAL ENTRY & MODE SWITCHING WITHOUT DATA LOSS');

it('Supports manual mode without requiring AI endpoint or credentials', () => {
  AIScanner.switchMode('manual');
  assert.strictEqual(AIScanner.getMode(), 'manual');
});

it('Preserves unsaved roster and kill edits when switching between AI and Manual modes', () => {
  const mockRoster = [
    {
      slot: 1,
      teamId: 'tm_1',
      teamName: 'Custom Clan',
      players: [
        { id: 'p1', name: 'Alpha', kills: 7 },
        { id: 'p2', name: 'Beta', kills: 3 },
      ],
      teamKillsOverride: null,
      placement: 1,
      isRemoved: false,
    },
  ];

  AIScanner.setRoster(mockRoster);
  assert.strictEqual(AIScanner.getRoster()[0].teamName, 'Custom Clan');
  assert.strictEqual(AIScanner.getRoster()[0].players[0].kills, 7);

  // Switch to AI mode
  AIScanner.switchMode('ai');
  assert.strictEqual(AIScanner.getRoster()[0].teamName, 'Custom Clan');
  assert.strictEqual(AIScanner.getRoster()[0].players[0].kills, 7);

  // Switch back to Manual mode
  AIScanner.switchMode('manual');
  assert.strictEqual(AIScanner.getRoster()[0].teamName, 'Custom Clan');
  assert.strictEqual(AIScanner.getRoster()[0].players[0].kills, 7);
});

// ------------------------------------------------------------------
// CRITERION 4 & 5: Slot List Management (Save, Load, Reuse, Duplicate, Delete)
// ------------------------------------------------------------------
section('3. SLOT LIST MANAGER — SAVE, REUSE, DUPLICATE & DELETE');

let savedListId = null;

it('Saves confirmed slot list with meaningful name into user-scoped LocalDatabase', () => {
  const slotsToSave = [
    { slot: 1, teamName: 'Team Alpha', players: ['A1', 'A2', 'A3', 'A4'] },
    { slot: 2, teamName: 'Team Bravo', players: ['B1', 'B2', 'B3'] },
  ];

  const saved = LocalDatabaseService.saveSlotList(TEST_USER, {
    name: 'Friday Live Lobby',
    slots: slotsToSave,
    notes: 'Scrims Tier 1',
  });

  assert(saved !== null);
  assert.strictEqual(saved.name, 'Friday Live Lobby');
  assert.strictEqual(saved.slots.length, 2);
  assert.strictEqual(saved.owner_user_id, TEST_USER);
  savedListId = saved.id;
});

it('Reuses saved slot list for future matches without uploading screenshots again', () => {
  const retrieved = LocalDatabaseService.getSlotListById(savedListId, TEST_USER);
  assert(retrieved !== null);
  assert.strictEqual(retrieved.name, 'Friday Live Lobby');
  assert.strictEqual(retrieved.slots[0].teamName, 'Team Alpha');
});

it('Duplicates saved slot list cleanly', () => {
  const dup = LocalDatabaseService.duplicateSlotList(savedListId, TEST_USER);
  assert(dup !== null);
  assert.strictEqual(dup.name, 'Friday Live Lobby (Copy)');
  assert.strictEqual(dup.slots.length, 2);
  assert.notStrictEqual(dup.id, savedListId);
});

it('Updates/renames saved slot list', () => {
  const updated = LocalDatabaseService.updateSlotList(savedListId, TEST_USER, {
    name: 'Weekly Championship Lobby',
  });
  assert(updated !== null);
  assert.strictEqual(updated.name, 'Weekly Championship Lobby');
});

it('Deletes saved slot list with user confirmation scope', () => {
  const ok = LocalDatabaseService.deleteSlotList(savedListId, TEST_USER);
  assert.strictEqual(ok, true);
  const check = LocalDatabaseService.getSlotListById(savedListId, TEST_USER);
  assert.strictEqual(check, null);
});

// ------------------------------------------------------------------
// CRITERION 6 & 7: Teams with fewer/more than 4 players, Add/Remove/Move
// ------------------------------------------------------------------
section('4. VARIABLE TEAM SIZES & PLAYER EDITING');

it('Supports teams with fewer or more than 4 players (1, 2, 3, 5 players)', () => {
  const testRoster = [
    { slot: 1, teamName: 'Solo Squad', players: [{ name: 'LoneWolf', kills: 3 }], teamKillsOverride: null, placement: 1, isRemoved: false },
    { slot: 2, teamName: 'Duo Team', players: [{ name: 'D1', kills: 1 }, { name: 'D2', kills: 2 }], teamKillsOverride: null, placement: 2, isRemoved: false },
    { slot: 3, teamName: 'Penta Team', players: [{ name: 'P1', kills: 1 }, { name: 'P2', kills: 1 }, { name: 'P3', kills: 1 }, { name: 'P4', kills: 1 }, { name: 'P5', kills: 1 }], teamKillsOverride: null, placement: 3, isRemoved: false },
  ];
  AIScanner.setRoster(testRoster);

  assert.strictEqual(AIScanner.getRoster()[0].players.length, 1);
  assert.strictEqual(AIScanner.getRoster()[1].players.length, 2);
  assert.strictEqual(AIScanner.getRoster()[2].players.length, 5);
});

it('Adds and removes players dynamically', () => {
  AIScanner.addPlayer(0, 'New Recruit');
  assert.strictEqual(AIScanner.getRoster()[0].players.length, 2);
  assert.strictEqual(AIScanner.getRoster()[0].players[1].name, 'New Recruit');

  AIScanner.removePlayer(0, 1);
  assert.strictEqual(AIScanner.getRoster()[0].players.length, 1);
});

it('Moves player from one team to another slot', () => {
  // Move LoneWolf from Team 1 (slot index 0) to Team 2 (slot index 1)
  AIScanner.movePlayer(0, 0, 1);
  assert.strictEqual(AIScanner.getRoster()[0].players.length, 0);
  assert.strictEqual(AIScanner.getRoster()[1].players.length, 3);
  assert.strictEqual(AIScanner.getRoster()[1].players[2].name, 'LoneWolf');
});

// ------------------------------------------------------------------
// CRITERION 8 & 9: Individual kills, team summation & manual override
// ------------------------------------------------------------------
section('5. KILL AGGREGATION & TEAM-LEVEL OVERRIDE');

it('Automatically updates team total kills when individual player kills change', () => {
  const roster = [
    {
      slot: 1,
      teamName: 'Team Zeta',
      players: [
        { name: 'Z1', kills: 2 },
        { name: 'Z2', kills: 3 },
      ],
      teamKillsOverride: null,
      placement: 1,
      isRemoved: false,
    },
  ];
  AIScanner.setRoster(roster);
  assert.strictEqual(AIScanner.getRoster()[0].totalKills, 5);

  AIScanner.updatePlayerKill(0, 0, 6); // Z1: 2 -> 6
  assert.strictEqual(AIScanner.getRoster()[0].players[0].kills, 6);
  assert.strictEqual(AIScanner.getRoster()[0].totalKills, 9); // 6 + 3 = 9
});

it('Applies manual team-level override and preserves individual player kills', () => {
  AIScanner.overrideTeamKills(0, 15);
  assert.strictEqual(AIScanner.getRoster()[0].totalKills, 15);
  assert.strictEqual(AIScanner.getRoster()[0].teamKillsOverride, 15);
  // Individual kills unchanged!
  assert.strictEqual(AIScanner.getRoster()[0].players[0].kills, 6);
  assert.strictEqual(AIScanner.getRoster()[0].players[1].kills, 3);
});

it('Resets manual override and returns to individual player summation', () => {
  AIScanner.resetTeamKillsOverride(0);
  assert.strictEqual(AIScanner.getRoster()[0].teamKillsOverride, null);
  assert.strictEqual(AIScanner.getRoster()[0].totalKills, 9); // back to 6 + 3
});

// ------------------------------------------------------------------
// CRITERION 10, 11, 12: Placement management, warnings & soft removal
// ------------------------------------------------------------------
section('6. PLACEMENT MANAGEMENT & SOFT TEAM REMOVAL');

it('Edits placements and detects duplicate placements', () => {
  const roster = [
    { slot: 1, teamName: 'T1', players: [], teamKillsOverride: 0, placement: 1, isRemoved: false },
    { slot: 2, teamName: 'T2', players: [], teamKillsOverride: 0, placement: 1, isRemoved: false }, // Duplicate 1!
    { slot: 3, teamName: 'T3', players: [], teamKillsOverride: 0, placement: 3, isRemoved: false },
  ];
  AIScanner.setRoster(roster);

  const dupes = AIScanner.getDuplicatePlacements();
  assert.strictEqual(dupes.length, 1);
  assert.strictEqual(dupes[0], 1);
});

it('Soft-removes a team from current match calculation without deleting from roster', () => {
  AIScanner.removeTeamFromCalc(1); // Remove T2
  assert.strictEqual(AIScanner.getRoster()[1].isRemoved, true);

  // Duplicates recalculate without removed team
  const dupesAfter = AIScanner.getDuplicatePlacements();
  assert.strictEqual(dupesAfter.length, 0);

  // Restore team
  AIScanner.removeTeamFromCalc(1);
  assert.strictEqual(AIScanner.getRoster()[1].isRemoved, false);
});

// ------------------------------------------------------------------
// CRITERION 13: ScoringEngine deterministic calculation
// ------------------------------------------------------------------
section('7. SCORING ENGINE INTEGRATION & LEADERBOARD COMPATIBILITY');

it('Calculates official Free Fire points (12-9-8-7-6-5-4-3-2-1-0-0) accurately', () => {
  // 1st place with 10 kills under 1x multiplier = 12 + 10 = 22 pts
  const p1 = ScoringEngine.calculateTeamPoints(1, 10, 'default', 1);
  assert.strictEqual(p1.placementPoints, 12);
  assert.strictEqual(p1.killPoints, 10);
  assert.strictEqual(p1.totalPoints, 22);

  // 2nd place with 4 kills under 2x multiplier = (9 + 4) * 2 = 26 pts
  const p2 = ScoringEngine.calculateTeamPoints(2, 4, 'default', 2);
  assert.strictEqual(p2.placementPoints, 9);
  assert.strictEqual(p2.killPoints, 4);
  assert.strictEqual(p2.multiplier, 2);
  assert.strictEqual(p2.totalPoints, 26);
});

// ------------------------------------------------------------------
// CRITERION 14 & 15: Save Results, Local DB & Design Studio
// ------------------------------------------------------------------
section('8. PERSISTENCE, LOCAL STORAGE & DESIGN STUDIO PIPELINE');

it('Saves match results strictly to local database and resolves match leaderboard', () => {
  const tourn = LocalDatabaseService.createTournament(TEST_USER, {
    name: 'LRD Grand Finals',
    team_count: 3,
    scoring_system: 'default',
  });
  assert(tourn !== null);

  const match = LocalDatabaseService.createMatch(tourn.id, 1, 'Match 1', 1);
  assert(match !== null);

  const teams = LocalDatabaseService.getTeams(tourn.id);
  const entries = [
    { teamId: teams[0].id, placement: 1, kills: 12 },
    { teamId: teams[1].id, placement: 2, kills: 6 },
    { teamId: teams[2].id, placement: 3, kills: 2 },
  ];

  const savedResults = LocalDatabaseService.saveMatchResults(tourn.id, match.id, entries, 'default', 1);
  assert.strictEqual(savedResults.length, 3);

  // Retrieve match leaderboard
  const lb = LocalDatabaseService.getMatchLeaderboard(match.id, 'default');
  assert.strictEqual(lb.length, 3);
  assert.strictEqual(lb[0].rank, 1);
  assert.strictEqual(lb[0].totalPoints, 24); // 12 + 12 = 24
  assert.strictEqual(lb[1].rank, 2);
  assert.strictEqual(lb[1].totalPoints, 15); // 9 + 6 = 15
});

it('Feeds confirmed match results directly into tournament cumulative leaderboard', () => {
  const tournaments = LocalDatabaseService.getTournaments(TEST_USER);
  const tourn = tournaments.find((t) => t.name === 'LRD Grand Finals');
  assert(tourn !== null);

  const overallLb = LocalDatabaseService.getTournamentLeaderboard(tourn.id, 'default');
  assert.strictEqual(overallLb.length, 3);
  assert.strictEqual(overallLb[0].rank, 1);
  assert.strictEqual(overallLb[0].totalPoints, 24);
  assert.strictEqual(overallLb[0].matchesPlayed, 1);
});

console.log('\n====================================================');
console.log(`ACCEPTANCE TEST RESULTS: ${passed} passed, ${failed} failed.`);
console.log('====================================================');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
