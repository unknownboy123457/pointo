/* ====================================================================
   LRD PointCalc — 10 Required Slot-Wise Extraction & Matching Tests
   Tests required by user prompt:
   1. Correctly assigning players to all 12 slots.
   2. End-screen players appearing in a different order from the lobby.
   3. Correct matching despite harmless capitalization differences.
   4. Names containing punctuation and underscores.
   5. Missing and unmatched players.
   6. One unreadable slot without losing other valid slots.
   7. Overlapping end screenshots without double-counting kills.
   8. Multiple players' kills being aggregated into the correct team.
   9. Manual slot corrections persisting through recalculation.
   10. Correct scoring through the existing ScoringEngine.
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

async function itAsync(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ PASS: ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, err: err.message });
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.message}`);
  }
}

console.log('============================================================');
console.log('LRD POINTCALC AI — SLOT-WISE EXTRACTION & MATCHING TEST SUITE');
console.log('============================================================\n');

(async () => {
  // ------------------------------------------------------------------
  // 1. Correctly assigning players to all 12 slots
  // ------------------------------------------------------------------
  console.log('--- 1. Correctly assigning players to all 12 slots ---');
  it('assigns detected lobby players into exactly 12 independent slot groups', () => {
    let fullLobbyText = '';
    for (let i = 1; i <= 12; i++) {
      fullLobbyText += `Slot ${i}: Team ${i} [P_${i}_1, P_${i}_2, P_${i}_3, P_${i}_4]\n`;
    }

    const parsed = AIService.parseLobbyRosterText(fullLobbyText);
    assert.strictEqual(parsed.length, 12, 'Must extract all 12 slots');
    for (let i = 0; i < 12; i++) {
      const slotNum = i + 1;
      assert.strictEqual(parsed[i].slot, slotNum, `Slot ${slotNum} matches index`);
      assert.strictEqual(parsed[i].players.length, 4, `Slot ${slotNum} has 4 players`);
      assert.strictEqual(parsed[i].players[0].name, `P_${slotNum}_1`);
    }
  });

  // ------------------------------------------------------------------
  // 2. End-screen players appearing in a different order from the lobby
  // ------------------------------------------------------------------
  console.log('\n--- 2. End-screen players in different order from lobby ---');
  it('correctly routes kills to the proper slot even when end screen is scrambled', () => {
    const lobby = [
      { slot: 1, teamName: 'Team One', players: [{ name: 'Alpha1' }, { name: 'Alpha2' }] },
      { slot: 2, teamName: 'Team Two', players: [{ name: 'Bravo1' }, { name: 'Bravo2' }] },
      { slot: 3, teamName: 'Team Three', players: [{ name: 'Charlie1' }, { name: 'Charlie2' }] },
    ];

    // Scrambled order in end screenshot: Slot 3 player, then Slot 1 player, then Slot 2 player
    const scrambledResults = [
      { name: 'Charlie1', kills: 5, rank: 3 },
      { name: 'Alpha1', kills: 4, rank: 1 },
      { name: 'Bravo2', kills: 6, rank: 2 },
      { name: 'Alpha2', kills: 3, rank: 1 },
      { name: 'Bravo1', kills: 2, rank: 2 },
    ];

    const merged = AIService.organizeResultsInto12Slots({
      slots: lobby,
      extractedResults: scrambledResults,
    });

    const res = merged.slotResults;
    assert.strictEqual(res[0].slot, 1);
    assert.strictEqual(res[0].totalKills, 7, 'Slot 1: Alpha1(4) + Alpha2(3) = 7');
    assert.strictEqual(res[0].placement, 1);

    assert.strictEqual(res[1].slot, 2);
    assert.strictEqual(res[1].totalKills, 8, 'Slot 2: Bravo2(6) + Bravo1(2) = 8');
    assert.strictEqual(res[1].placement, 2);

    assert.strictEqual(res[2].slot, 3);
    assert.strictEqual(res[2].totalKills, 5, 'Slot 3: Charlie1(5) = 5');
    assert.strictEqual(res[2].placement, 3);
  });

  // ------------------------------------------------------------------
  // 3. Correct matching despite harmless capitalization differences
  // ------------------------------------------------------------------
  console.log('\n--- 3. Matching with harmless case differences ---');
  it('matches player names regardless of uppercase/lowercase differences', () => {
    const lobby = [
      { slot: 1, teamName: 'Alpha Clan', players: [{ name: 'TotalGamer' }, { name: 'SHADOW_NINJA' }] },
    ];

    const results = [
      { name: 'totalgamer', kills: 8, rank: 1 },
      { name: 'shadow_ninja', kills: 4, rank: 1 },
    ];

    const merged = AIService.organizeResultsInto12Slots({
      slots: lobby,
      extractedResults: results,
    });

    assert.strictEqual(merged.slotResults[0].totalKills, 12, '8 + 4 = 12 kills matched');
    assert.strictEqual(merged.unmatchedPlayers.length, 0, 'No unmatched players');
  });

  // ------------------------------------------------------------------
  // 4. Names containing punctuation and underscores
  // ------------------------------------------------------------------
  console.log('\n--- 4. Names with punctuation, dots, exclamation, and underscores ---');
  it('preserves exact special characters (., !, _, -) without corrupting name or matching', () => {
    const rawRoster = `
Slot 07: 7. TEAM FLUG
AYUSHMAN_
YOUSUFX17!
11X MAF!YA
SG1 ATHEX
`;
    const parsedLobby = AIService.parseLobbyRosterText(rawRoster);
    assert.strictEqual(parsedLobby.length, 1);
    const pNames = parsedLobby[0].players.map((p) => p.name);
    assert.strictEqual(pNames.includes('AYUSHMAN_'), true, 'Preserved AYUSHMAN_');
    assert.strictEqual(pNames.includes('YOUSUFX17!'), true, 'Preserved YOUSUFX17!');
    assert.strictEqual(pNames.includes('11X MAF!YA'), true, 'Preserved 11X MAF!YA');
    assert.strictEqual(pNames.includes('SG1 ATHEX'), true, 'Preserved SG1 ATHEX');

    // End scoreboard with Free Fire elimination syntax
    const endRaw = `
#7 7. TEAM FLUG
AYUSHMAN_ 7 Eliminations
YOUSUFX17! 3 Eliminations
11X MAF!YA 1 Eliminations
SG1 ATHEX 8 Eliminations
`;
    const parsedEnd = AIService.parseMatchResultsText(endRaw);
    assert.strictEqual(parsedEnd.length, 4, 'Parsed all 4 elimination lines');

    const merged = AIService.organizeResultsInto12Slots({
      slots: parsedLobby,
      extractedResults: parsedEnd,
    });

    assert.strictEqual(merged.slotResults[0].totalKills, 19, '7 + 3 + 1 + 8 = 19 kills');
    assert.strictEqual(merged.slotResults[0].placement, 7);
  });

  // ------------------------------------------------------------------
  // 5. Missing and unmatched players
  // ------------------------------------------------------------------
  console.log('\n--- 5. Missing and unmatched players ---');
  it('isolates unmatched end-screen players without blocking valid slots', () => {
    const lobby = [
      { slot: 1, teamName: 'Known Team', players: [{ name: 'KnownPlayer1' }, { name: 'KnownPlayer2' }] },
    ];

    const results = [
      { name: 'KnownPlayer1', kills: 4, rank: 1 },
      { name: 'UnknownGuest_99', kills: 6, rank: 2 }, // Not in lobby!
    ];

    const merged = AIService.organizeResultsInto12Slots({
      slots: lobby,
      extractedResults: results,
    });

    assert.strictEqual(merged.slotResults[0].totalKills, 4, 'Known player kills assigned');
    assert.strictEqual(merged.unmatchedPlayers.length, 1, 'Unknown player placed in unmatched list');
    assert.strictEqual(merged.unmatchedPlayers[0].name, 'UnknownGuest_99');
    assert.strictEqual(merged.unmatchedPlayers[0].kills, 6);

    // Diagnostics check
    const diag = AIService.diagnoseRosterState({
      slots: lobby,
      unmatchedPlayers: merged.unmatchedPlayers,
    });
    assert.strictEqual(diag.some((d) => d.type === 'unmatched_players'), true, 'Flags unmatched diagnostic cleanly');
  });

  // ------------------------------------------------------------------
  // 6. One unreadable slot without losing other valid slots
  // ------------------------------------------------------------------
  console.log('\n--- 6. One unreadable slot without losing other valid slots ---');
  it('preserves all valid slots if one slot is corrupted or unreadable', async () => {
    const existing = [
      { slot: 1, teamName: 'Valid Alpha', players: [{ name: 'P1', kills: 0 }] },
      { slot: 2, teamName: 'Unreadable Slot', players: [] }, // Slot 2 empty/unreadable
      { slot: 3, teamName: 'Valid Gamma', players: [{ name: 'P3', kills: 0 }] },
    ];

    const outcome = await AIService.extract12SlotsAndResults({
      slotListFiles: [],
      endResultFiles: [],
      existingSlots: existing,
    });

    assert.strictEqual(outcome.slots.length, 12, 'Maintains 12 slots');
    assert.strictEqual(outcome.slots[0].teamName, 'Valid Alpha');
    assert.strictEqual(outcome.slots[2].teamName, 'Valid Gamma');
    assert.strictEqual(outcome.slots[1].players.length, 0, 'Unreadable slot has 0 players without crashing');
  });

  // ------------------------------------------------------------------
  // 7. Overlapping end screenshots without double-counting kills
  // ------------------------------------------------------------------
  console.log('\n--- 7. Overlapping end screenshots without double-counting kills ---');
  it('deduplicates overlapping screenshot player kills deterministically', () => {
    const lobby = [
      { slot: 1, teamName: 'Squad One', players: [{ name: 'Sniper' }, { name: 'Rusher' }] },
    ];

    // Screen A shows Sniper 5 kills and Rusher 3 kills
    // Screen B overlaps and shows Sniper 5 kills again
    const screenA = [
      { name: 'Sniper', kills: 5, rank: 1 },
      { name: 'Rusher', kills: 3, rank: 1 },
    ];
    const screenB = [
      { name: 'Sniper', kills: 5, rank: 1 }, // Overlap!
    ];

    const merged = AIService.organizeResultsInto12Slots({
      slots: lobby,
      extractedResults: [...screenA, ...screenB],
    });

    assert.strictEqual(merged.slotResults[0].totalKills, 8, '5 + 3 = 8 (Sniper counted once, not twice)');
  });

  // ------------------------------------------------------------------
  // 8. Multiple players\' kills being aggregated into the correct team
  // ------------------------------------------------------------------
  console.log('\n--- 8. Multiple players\' kills aggregated into correct team ---');
  it('sums kills from all 4 players into team total kills accurately', () => {
    const lobby = [
      { slot: 4, teamName: 'Team Elite', players: [{ name: 'P1' }, { name: 'P2' }, { name: 'P3' }, { name: 'P4' }] },
    ];

    const killsData = [
      { name: 'P1', kills: 3 },
      { name: 'P2', kills: 5 },
      { name: 'P3', kills: 2 },
      { name: 'P4', kills: 6 },
    ];

    const merged = AIService.organizeResultsInto12Slots({
      slots: lobby,
      extractedResults: killsData,
    });

    assert.strictEqual(merged.slotResults[0].totalKills, 16, '3 + 5 + 2 + 6 = 16 total kills');
  });

  // ------------------------------------------------------------------
  // 9. Manual slot corrections persisting through recalculation
  // ------------------------------------------------------------------
  console.log('\n--- 9. Manual slot corrections persisting through recalculation ---');
  it('preserves user manual slot assignment when re-running extraction matching', () => {
    const lobby = [
      { slot: 1, teamName: 'Team 1', players: [{ name: 'Regular1' }] },
      { slot: 5, teamName: 'Team 5', players: [{ name: 'Regular5' }] },
    ];

    const results = [
      { name: 'Regular1', kills: 2 },
      { name: 'RoguePlayer', kills: 7 }, // Player not initially in roster
    ];

    // User manual assignment: RoguePlayer confirmed belongs to Slot 5
    const manualMap = new Map();
    manualMap.set(AIService.normalizePlayerName('RoguePlayer'), 5);

    const merged = AIService.organizeResultsInto12Slots({
      slots: lobby,
      extractedResults: results,
      manualAssignments: manualMap,
    });

    const slot5Res = merged.slotResults.find((s) => s.slot === 5);
    assert.strictEqual(slot5Res.totalKills, 7, 'RoguePlayer (7 kills) assigned to Slot 5');
    assert.strictEqual(merged.unmatchedPlayers.length, 0, 'RoguePlayer resolved via confirmed manual assignment');
  });

  // ------------------------------------------------------------------
  // 10. Correct scoring through the existing ScoringEngine
  // ------------------------------------------------------------------
  console.log('\n--- 10. Correct scoring through existing ScoringEngine ---');
  it('computes official Free Fire points deterministically (12-9-8-7-6-5-4-3-2-1-0-0 + 1pt/kill)', () => {
    // 1st place with 10 kills -> 12 place pts + 10 kill pts = 22 pts
    const rank1Breakdown = ScoringEngine.calculateTeamPoints(1, 10, null, 1);
    assert.strictEqual(rank1Breakdown.placementPoints, 12);
    assert.strictEqual(rank1Breakdown.killPoints, 10);
    assert.strictEqual(rank1Breakdown.totalPoints, 22);

    // 2nd place with 5 kills -> 9 place pts + 5 kill pts = 14 pts
    const rank2Breakdown = ScoringEngine.calculateTeamPoints(2, 5, null, 1);
    assert.strictEqual(rank2Breakdown.placementPoints, 9);
    assert.strictEqual(rank2Breakdown.killPoints, 5);
    assert.strictEqual(rank2Breakdown.totalPoints, 14);

    // 7th place with 19 kills (matching reference screenshot TEAM FLUG)
    // 7th place = 4 placement points, 19 kills = 19 kill points -> 23 total points!
    const rank7Breakdown = ScoringEngine.calculateTeamPoints(7, 19, null, 1);
    assert.strictEqual(rank7Breakdown.placementPoints, 4);
    assert.strictEqual(rank7Breakdown.killPoints, 19);
    assert.strictEqual(rank7Breakdown.totalPoints, 23);
  });

  console.log('\n============================================================');
  console.log(`TEST SUITE RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('============================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
})();
