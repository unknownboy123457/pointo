/* ====================================================================
   LRD PointCalc — Automated Verification for PART 4 Workflow
   Tests the exact scenario required by Section 18:
   - User identity & local scoping
   - 12 teams creation with partial player assignments
   - Empty player teams valid
   - Exactly 12 team records in local DB
   - Calculate Match 1 with live points calculation
   - Save Match 1 and verify overall leaderboard
   - Create Match 2 and verify cumulative leaderboard
   - Edit match and verify recalculated leaderboard
   - Delete match and verify recalculated leaderboard
   - Refresh simulation (persisted data remains intact)
   ==================================================================== */

// Set up mock window and localStorage for Node.js
const mockStorage = {};
global.localStorage = {
  getItem: (k) => (k in mockStorage ? mockStorage[k] : null),
  setItem: (k, v) => { mockStorage[k] = String(v); },
  removeItem: (k) => { delete mockStorage[k]; },
  clear: () => { Object.keys(mockStorage).forEach((k) => delete mockStorage[k]); },
};

global.window = global;

// Load scoring engine & local database
const ScoringEngine = require('./scoring-engine.js');
global.ScoringEngine = ScoringEngine;
require('./local-db.js');
const db = global.LocalDatabaseService;

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
console.log('RUNNING PART 4 WORKFLOW & PERSISTENCE VERIFICATION');
console.log('====================================================\n');

// 1. Mock Authenticated Google User
const testUser = {
  id: 'usr_google_real_998127',
  email: 'esports.admin@gmail.com',
  name: 'LRD Admin',
};

// 2. Tournament Setup: "LRD Test Cup", 12 teams
console.log('Step 2-7: Creating tournament "LRD Test Cup" with 12 teams & partial players');
const teamNames = [
  'Team Alpha',
  'Team Bravo',
  'Team Charlie',
  'Team Delta',
  'Team Echo',
  'Team Foxtrot',
  'Team Golf',
  'Team Hotel',
  'Team India',
  'Team Juliet',
  'Team Kilo',
  'Team Lima',
];

const teamsData = teamNames.map((name, idx) => {
  if (idx === 0) {
    // Team Alpha has 4 players
    return { name, players: ['Ravi', 'Aman', 'Rahul', 'Vivek'] };
  } else if (idx === 1) {
    // Team Bravo has 2 players
    return { name, players: ['Kabir', 'Rohan'] };
  } else if (idx === 2) {
    // Team Charlie has 1 player
    return { name, players: ['Phoenix'] };
  } else {
    // Teams 4-12 have no players
    return { name, players: [] };
  }
});

const tournament = db.createTournament(testUser.id, {
  name: 'LRD Test Cup',
  team_count: 12,
  game_mode: 'squad',
  scoring_system: 'default',
  teamsData,
});

assert(tournament !== null, 'Tournament created successfully');
assert(tournament.name === 'LRD Test Cup', 'Tournament name matches "LRD Test Cup"');
assert(tournament.team_count === 12, 'Tournament team_count is 12');
assert(tournament.owner_user_id === testUser.id, 'Tournament owner_user_id is correctly set');

// 8. Verify exactly 12 teams were created in local database
console.log('\nStep 8: Verifying team records');
const createdTeams = db.getTeams(tournament.id);
assert(createdTeams.length === 12, `Exactly 12 teams created in local DB (got ${createdTeams.length})`);
assert(createdTeams.every((t) => t.tournament_id === tournament.id), 'All teams belong to tournament');
assert(createdTeams.every((t) => t.owner_user_id === testUser.id), 'All teams partitioned by user');

// Verify player records
const createdPlayers = db.getPlayersByTournament(tournament.id);
// Alpha: 4, Bravo: 2, Charlie: 1 = 7 players total
assert(createdPlayers.length === 7, `Exactly 7 players registered across tournament (got ${createdPlayers.length})`);
const alphaTeam = createdTeams.find((t) => t.name === 'Team Alpha');
const alphaPlayers = db.getPlayers(alphaTeam.id);
assert(alphaPlayers.length === 4, `Team Alpha has 4 players (got ${alphaPlayers.length})`);
const deltaTeam = createdTeams.find((t) => t.name === 'Team Delta');
const deltaPlayers = db.getPlayers(deltaTeam.id);
assert(deltaPlayers.length === 0, `Team Delta has 0 players registered (empty player team works)`);

// 11-15. Create Match 1 and calculate points
console.log('\nStep 11-15: Create Match 1 and verify live points calculation');
const match1 = db.createMatch(tournament.id, 1, 'Match 1', 1);
assert(match1 !== null && match1.match_number === 1, 'Match 1 created');

// Simulate Match 1 results entry:
// Alpha: 1st (12 pts) + 8 kills = 20 pts
// Bravo: 2nd (9 pts) + 4 kills = 13 pts
// Charlie: 3rd (8 pts) + 2 kills = 10 pts
// Delta: 4th (7 pts) + 3 kills = 10 pts
// Others: 5th..12th with 0 kills
const match1Entries = createdTeams.map((t, idx) => {
  if (t.name === 'Team Alpha') return { teamId: t.id, placement: 1, kills: 8 };
  if (t.name === 'Team Bravo') return { teamId: t.id, placement: 2, kills: 4 };
  if (t.name === 'Team Charlie') return { teamId: t.id, placement: 3, kills: 2 };
  if (t.name === 'Team Delta') return { teamId: t.id, placement: 4, kills: 3 };
  return { teamId: t.id, placement: idx + 1, kills: 0 };
});

// Verify live calculation for Team Alpha via ScoringEngine
const alphaPts = ScoringEngine.calculateTeamPoints(1, 8);
assert(alphaPts.placementPoints === 12, 'Alpha placement points = 12');
assert(alphaPts.killPoints === 8, 'Alpha kill points = 8');
assert(alphaPts.totalPoints === 20, 'Alpha live total points = 20');

// Save Match 1
const savedM1 = db.saveMatchResults(tournament.id, match1.id, match1Entries, tournament.scoring_config, 1);
assert(savedM1.length === 12, 'Match 1 results saved for all 12 teams');

// 16-17. Click Tables -> Verify Match 1 in overall standings
console.log('\nStep 16-17: Leaderboard after Match 1');
const lb1 = db.getTournamentLeaderboard(tournament.id, tournament.scoring_config);
assert(lb1.length === 12, 'Leaderboard contains all 12 teams');
assert(lb1[0].teamName === 'Team Alpha', `Rank 1 is Team Alpha (got ${lb1[0].teamName})`);
assert(lb1[0].totalPoints === 20, `Rank 1 total points is 20 (got ${lb1[0].totalPoints})`);
assert(lb1[0].booyahs === 1, `Rank 1 has 1 Booyah`);
assert(lb1[1].teamName === 'Team Bravo', `Rank 2 is Team Bravo (got ${lb1[1].teamName})`);
assert(lb1[1].totalPoints === 13, `Rank 2 total points is 13 (got ${lb1[1].totalPoints})`);

// 18-21. Create Match 2 and verify cumulative leaderboard
console.log('\nStep 18-21: Create Match 2 and verify cumulative leaderboard');
const match2 = db.createMatch(tournament.id, 2, 'Match 2', 1);
// Match 2: Bravo 1st (12) + 7 kills = 19 pts; Alpha 2nd (9) + 4 kills = 13 pts
const match2Entries = createdTeams.map((t) => {
  if (t.name === 'Team Bravo') return { teamId: t.id, placement: 1, kills: 7 };
  if (t.name === 'Team Alpha') return { teamId: t.id, placement: 2, kills: 4 };
  if (t.name === 'Team Charlie') return { teamId: t.id, placement: 3, kills: 1 };
  const remaining = createdTeams.filter((tm) => tm.name !== 'Team Bravo' && tm.name !== 'Team Alpha' && tm.name !== 'Team Charlie');
  const remIdx = remaining.findIndex((r) => r.id === t.id);
  return { teamId: t.id, placement: remIdx + 4, kills: 0 };
});

db.saveMatchResults(tournament.id, match2.id, match2Entries, tournament.scoring_config, 1);

const lb2 = db.getTournamentLeaderboard(tournament.id, tournament.scoring_config);
const alphaCumulative = lb2.find((r) => r.teamName === 'Team Alpha');
const bravoCumulative = lb2.find((r) => r.teamName === 'Team Bravo');

// Alpha: 20 (M1) + 13 (M2) = 33 pts
assert(alphaCumulative.totalPoints === 33, `Alpha cumulative points is 33 (got ${alphaCumulative.totalPoints})`);
assert(alphaCumulative.matchesPlayed === 2, `Alpha matches played is 2`);

// Bravo: 13 (M1) + 19 (M2) = 32 pts
assert(bravoCumulative.totalPoints === 32, `Bravo cumulative points is 32 (got ${bravoCumulative.totalPoints})`);
assert(bravoCumulative.matchesPlayed === 2, `Bravo matches played is 2`);
assert(bravoCumulative.booyahs === 1, `Bravo has 1 Booyah`);

// 22-23. Edit a match and verify leaderboard updates
console.log('\nStep 22-23: Edit Match 2 and verify recalculation');
// Give Bravo 10 kills instead of 7 (now 12 + 10 = 22 pts; Bravo total = 13 + 22 = 35 pts)
const editedMatch2Entries = match2Entries.map((e) => {
  if (e.teamId === bravoCumulative.teamId) {
    return { ...e, kills: 10 };
  }
  return e;
});
db.saveMatchResults(tournament.id, match2.id, editedMatch2Entries, tournament.scoring_config, 1);

const lbEdited = db.getTournamentLeaderboard(tournament.id, tournament.scoring_config);
const bravoAfterEdit = lbEdited.find((r) => r.teamName === 'Team Bravo');
assert(bravoAfterEdit.totalPoints === 35, `Bravo total after edit is 35 (got ${bravoAfterEdit.totalPoints})`);
assert(lbEdited[0].teamName === 'Team Bravo', `Bravo took Rank 1 after edit (got ${lbEdited[0].teamName})`);

// 24-25. Delete a match and verify leaderboard updates
console.log('\nStep 24-25: Delete Match 2 and verify recalculation');
db.deleteMatch(match2.id, tournament.id);

const lbAfterDelete = db.getTournamentLeaderboard(tournament.id, tournament.scoring_config);
const bravoAfterDelete = lbAfterDelete.find((r) => r.teamName === 'Team Bravo');
const alphaAfterDelete = lbAfterDelete.find((r) => r.teamName === 'Team Alpha');

assert(bravoAfterDelete.totalPoints === 13, `Bravo total after deleting M2 reverts to 13 (got ${bravoAfterDelete.totalPoints})`);
assert(bravoAfterDelete.matchesPlayed === 1, `Bravo matches played reverts to 1`);
assert(alphaAfterDelete.totalPoints === 20, `Alpha total reverts to 20`);
assert(lbAfterDelete[0].teamName === 'Team Alpha', `Alpha is Rank 1 again after deleting M2`);

// 26-27. Simulation of page refresh: Read raw from localStorage
console.log('\nStep 26-27: Simulating page refresh & persistent data check');
const reloadedTournaments = db.getTournaments(testUser.id);
assert(reloadedTournaments.length === 1, 'Tournament persists across reloads');
assert(reloadedTournaments[0].name === 'LRD Test Cup', 'Persisted tournament name matches');

const reloadedTeams = db.getTeams(tournament.id);
assert(reloadedTeams.length === 12, `All 12 teams persist across reloads (got ${reloadedTeams.length})`);

const reloadedPlayers = db.getPlayersByTournament(tournament.id);
assert(reloadedPlayers.length === 7, `All 7 players persist across reloads (got ${reloadedPlayers.length})`);

const reloadedMatches = db.getMatches(tournament.id);
assert(reloadedMatches.length === 1, `Remaining match persists across reloads (got ${reloadedMatches.length})`);

console.log('\n====================================================');
console.log(`SUMMARY: ${passed} passed, ${failed} failed.`);
console.log('====================================================');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
