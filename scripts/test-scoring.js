/* ====================================================================
   LRD PointCalc — Free Fire Scoring Engine Automated Test Suite
   ==================================================================== */

const ScoringEngine = require('./scoring-engine.js');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

console.log('====================================================');
console.log('RUNNING FREE FIRE SCORING ENGINE TESTS');
console.log('====================================================\n');

// --------------------------------------------------------------------
// TEST 1: Placement 1, Kills 0 => Expected = 12
// --------------------------------------------------------------------
console.log('Test 1: Placement 1, Kills 0');
const t1 = ScoringEngine.calculateTeamPoints(1, 0);
assert(t1.placementPoints === 12, 'Placement points must be 12');
assert(t1.killPoints === 0, 'Kill points must be 0');
assert(t1.totalPoints === 12, 'Total points must be 12');

// --------------------------------------------------------------------
// TEST 2: Placement 1, Kills 8 => Expected = 20
// --------------------------------------------------------------------
console.log('\nTest 2: Placement 1, Kills 8');
const t2 = ScoringEngine.calculateTeamPoints(1, 8);
assert(t2.placementPoints === 12, 'Placement points must be 12');
assert(t2.killPoints === 8, 'Kill points must be 8');
assert(t2.totalPoints === 20, 'Total points must be 20');

// --------------------------------------------------------------------
// TEST 3: Placement 2, Kills 3 => Expected = 12
// --------------------------------------------------------------------
console.log('\nTest 3: Placement 2, Kills 3');
const t3 = ScoringEngine.calculateTeamPoints(2, 3);
assert(t3.placementPoints === 9, 'Placement points must be 9');
assert(t3.killPoints === 3, 'Kill points must be 3');
assert(t3.totalPoints === 12, 'Total points must be 12');

// --------------------------------------------------------------------
// TEST 4: Placement 5, Kills 10 => Expected = 16
// --------------------------------------------------------------------
console.log('\nTest 4: Placement 5, Kills 10');
const t4 = ScoringEngine.calculateTeamPoints(5, 10);
assert(t4.placementPoints === 6, 'Placement points must be 6');
assert(t4.killPoints === 10, 'Kill points must be 10');
assert(t4.totalPoints === 16, 'Total points must be 16');

// --------------------------------------------------------------------
// TEST 5: Placement 10, Kills 2 => Expected = 3
// --------------------------------------------------------------------
console.log('\nTest 5: Placement 10, Kills 2');
const t5 = ScoringEngine.calculateTeamPoints(10, 2);
assert(t5.placementPoints === 1, 'Placement points must be 1');
assert(t5.killPoints === 2, 'Kill points must be 2');
assert(t5.totalPoints === 3, 'Total points must be 3');

// --------------------------------------------------------------------
// TEST 6: Invalid negative kills must be rejected
// --------------------------------------------------------------------
console.log('\nTest 6: Invalid negative kills validation');
const vNegative = ScoringEngine.validateMatchResults([
  { teamId: 't1', teamName: 'Alpha', placement: 1, kills: -3 },
  { teamId: 't2', teamName: 'Bravo', placement: 2, kills: 4 },
], 2);
assert(!vNegative.valid, 'Validator must reject negative kills');
assert(vNegative.errors.some((e) => e.includes('negative kills')), 'Error message indicates negative kills');

// --------------------------------------------------------------------
// TEST 7: Duplicate placement must be rejected
// --------------------------------------------------------------------
console.log('\nTest 7: Duplicate placement validation');
const vDup = ScoringEngine.validateMatchResults([
  { teamId: 't1', teamName: 'Alpha', placement: 1, kills: 5 },
  { teamId: 't2', teamName: 'Bravo', placement: 1, kills: 2 },
], 2);
assert(!vDup.valid, 'Validator must reject duplicate placements');
assert(vDup.duplicatePlacements.includes(1), 'Duplicate placement #1 reported');

// --------------------------------------------------------------------
// TEST 8: Multiple matches overall points equal sum of all matches
// --------------------------------------------------------------------
console.log('\nTest 8: Multiple matches overall sum');
const teams = [
  { id: 't1', name: 'Alpha' },
  { id: 't2', name: 'Bravo' },
];
const matches = [
  { id: 'm1', match_number: 1 },
  { id: 'm2', match_number: 2 },
  { id: 'm3', match_number: 3 },
];
// Match 1: Alpha 1st (12) + 8 kills = 20; Bravo 2nd (9) + 4 kills = 13
// Match 2: Alpha 2nd (9) + 6 kills = 15; Bravo 1st (12) + 5 kills = 17
// Match 3: Alpha 1st (12) + 6 kills = 18; Bravo 3rd (8) + 2 kills = 10
const results = [
  { match_id: 'm1', team_id: 't1', placement: 1, kills: 8 },
  { match_id: 'm1', team_id: 't2', placement: 2, kills: 4 },
  { match_id: 'm2', team_id: 't1', placement: 2, kills: 6 },
  { match_id: 'm2', team_id: 't2', placement: 1, kills: 5 },
  { match_id: 'm3', team_id: 't1', placement: 1, kills: 6 },
  { match_id: 'm3', team_id: 't2', placement: 3, kills: 2 },
];
const leaderboard = ScoringEngine.calculateTournamentLeaderboard(teams, matches, results);
const alpha = leaderboard.find((r) => r.teamId === 't1');
const bravo = leaderboard.find((r) => r.teamId === 't2');
// Alpha: 20 + 15 + 18 = 53 total points; kills: 8 + 6 + 6 = 20
// Bravo: 13 + 17 + 10 = 40 total points; kills: 4 + 5 + 2 = 11
assert(alpha.totalPoints === 53, `Alpha total points must be 53 (got ${alpha.totalPoints})`);
assert(alpha.totalKills === 20, `Alpha total kills must be 20 (got ${alpha.totalKills})`);
assert(bravo.totalPoints === 40, `Bravo total points must be 40 (got ${bravo.totalPoints})`);
assert(bravo.totalKills === 11, `Bravo total kills must be 11 (got ${bravo.totalKills})`);
assert(alpha.rank === 1, 'Alpha must be rank 1');
assert(bravo.rank === 2, 'Bravo must be rank 2');

// --------------------------------------------------------------------
// TEST 9: Edit a match -> Overall leaderboard recalculates
// --------------------------------------------------------------------
console.log('\nTest 9: Edit match recalculation');
// Update match 2 for Bravo: from place 1, kills 5 (17 pts) to place 2, kills 1 (9 + 1 = 10 pts)
const editedResults = results.map((r) => {
  if (r.match_id === 'm2' && r.team_id === 't2') {
    return { ...r, placement: 2, kills: 1 };
  }
  return r;
});
const editedLeaderboard = ScoringEngine.calculateTournamentLeaderboard(teams, matches, editedResults);
const editedBravo = editedLeaderboard.find((r) => r.teamId === 't2');
// Bravo new total: 13 + 10 + 10 = 33
assert(editedBravo.totalPoints === 33, `Bravo edited total points must be 33 (got ${editedBravo.totalPoints})`);

// --------------------------------------------------------------------
// TEST 10: Delete a match -> Overall leaderboard recalculates
// --------------------------------------------------------------------
console.log('\nTest 10: Delete match recalculation');
// Delete match 3
const remainingMatches = matches.filter((m) => m.id !== 'm3');
const afterDeleteLeaderboard = ScoringEngine.calculateTournamentLeaderboard(teams, remainingMatches, results);
const afterAlpha = afterDeleteLeaderboard.find((r) => r.teamId === 't1');
// Alpha points for m1 (20) + m2 (15) = 35
assert(afterAlpha.totalPoints === 35, `Alpha total after deleting match 3 must be 35 (got ${afterAlpha.totalPoints})`);
assert(afterAlpha.matchesPlayed === 2, `Alpha matches played must be 2 (got ${afterAlpha.matchesPlayed})`);

// --------------------------------------------------------------------
// TEST 11: Custom scoring -> Uses tournament custom configuration
// --------------------------------------------------------------------
console.log('\nTest 11: Custom scoring system');
const customConfig = {
  type: 'custom',
  placementPoints: {
    1: 15,
    2: 12,
    3: 10,
    4: 8,
    5: 6,
  },
  killPointValue: 2, // 2 points per kill
};
// 1st place with 3 kills: 15 + (3 * 2) = 21
const c1 = ScoringEngine.calculateTeamPoints(1, 3, customConfig);
assert(c1.placementPoints === 15, 'Custom placement points for 1st must be 15');
assert(c1.killPoints === 6, 'Custom kill points for 3 kills (at 2 pts) must be 6');
assert(c1.totalPoints === 21, 'Custom total points must be 21');

// 5th place with 4 kills: 6 + (4 * 2) = 14
const c2 = ScoringEngine.calculateTeamPoints(5, 4, customConfig);
assert(c2.placementPoints === 6, 'Custom placement points for 5th must be 6');
assert(c2.killPoints === 8, 'Custom kill points for 4 kills (at 2 pts) must be 8');
assert(c2.totalPoints === 14, 'Custom total points must be 14');

console.log('\n====================================================');
console.log(`SUMMARY: ${passed} passed, ${failed} failed.`);
console.log('====================================================');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
