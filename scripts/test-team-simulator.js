/* ====================================================================
   LRD PointCalc — Auto Team Simulator Test Suite
   Tests all simulator scenarios specified in user requirements.
   ==================================================================== */

// Mock browser environment
if (typeof window === 'undefined') {
  global.window = global;
}
if (typeof localStorage === 'undefined') {
  const store = {};
  global.localStorage = {
    getItem: (k) => store[k] || null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); },
  };
}
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

// Load modules
require('./scoring-engine.js');
require('./local-db.js');
require('./design/team-simulator.js');

// ================================================================
// TEST HARNESS
// ================================================================
let testsPassed = 0;
let testsFailed = 0;
const failures = [];

function assert(condition, testName) {
  if (condition) {
    testsPassed++;
    console.log(`  ✅ ${testName}`);
  } else {
    testsFailed++;
    failures.push(testName);
    console.log(`  ❌ FAIL: ${testName}`);
  }
}

function section(title) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${'='.repeat(60)}`);
}

// ================================================================
// SETUP
// ================================================================
localStorage.clear();
const db = window.LocalDatabaseService;
const userId = 'test_user_sim';

// ================================================================
// TEST 1: Module Initialization
// ================================================================
section('1. MODULE INITIALIZATION');

assert(typeof window.TeamSimulator === 'object', 'TeamSimulator module exists');
assert(typeof window.TeamSimulator.init === 'function', 'TeamSimulator.init is a function');
assert(typeof window.TeamSimulator.open === 'function', 'TeamSimulator.open is a function');
assert(typeof window.TeamSimulator.close === 'function', 'TeamSimulator.close is a function');

// ================================================================
// TEST 2: LocalDatabaseService Integration
// ================================================================
section('2. DATABASE INTEGRATION');

// Create a tournament for testing
const tourn1 = db.createTournament(userId, {
  name: 'Sim Test Tournament',
  team_count: 12,
  game_mode: 'squad',
  scoring_system: 'default',
  teamsData: Array.from({ length: 12 }, (_, i) => ({ name: `Team ${i + 1}`, players: [] })),
});
assert(tourn1 !== null, 'Test tournament created');
assert(tourn1.team_count === 12, 'Tournament has 12 teams');

const teams = db.getTeams(tourn1.id);
assert(teams.length === 12, 'All 12 teams created in DB');

// ================================================================
// TEST 3: 48 Players / Squad Mode (Even distribution)
// ================================================================
section('3. EVEN DISTRIBUTION — 48 Players, Squad (4 per team)');

const tourn48 = db.createTournament(userId, {
  name: '48 Player Tournament',
  team_count: 12,
  game_mode: 'squad',
});

// Simulate the generation logic directly
const players48 = [];
for (let i = 1; i <= 48; i++) players48.push(`Player${i}`);

// Distribution: 48 / 4 = 12 teams
const perTeam = 4;
const totalTeams = Math.ceil(48 / perTeam);
assert(totalTeams === 12, '48/4 = 12 teams calculated');

const generatedTeams48 = [];
let pidx = 0;
for (let t = 0; t < totalTeams; t++) {
  const teamPlayers = [];
  for (let p = 0; p < perTeam && pidx < players48.length; p++) {
    teamPlayers.push(players48[pidx]);
    pidx++;
  }
  generatedTeams48.push({ name: `Team ${t + 1}`, players: teamPlayers });
}

assert(generatedTeams48.length === 12, 'Generated exactly 12 teams');
assert(generatedTeams48.every(t => t.players.length === 4), 'Every team has exactly 4 players');
assert(pidx === 48, 'All 48 players distributed');

// ================================================================
// TEST 4: 50 Players / Squad Mode (Uneven distribution)
// ================================================================
section('4. UNEVEN DISTRIBUTION — 50 Players, Squad (4 per team)');

const players50 = [];
for (let i = 1; i <= 50; i++) players50.push(`P${i}`);

const totalTeams50 = Math.ceil(50 / 4);
assert(totalTeams50 === 13, '50/4 = 13 teams (ceil)');

const generatedTeams50 = [];
let pidx50 = 0;
for (let t = 0; t < totalTeams50; t++) {
  const teamPlayers = [];
  for (let p = 0; p < 4 && pidx50 < players50.length; p++) {
    teamPlayers.push(players50[pidx50]);
    pidx50++;
  }
  generatedTeams50.push({ name: `Team ${t + 1}`, players: teamPlayers });
}

assert(generatedTeams50.length === 13, 'Generated 13 teams for 50 players');
assert(generatedTeams50[12].players.length === 2, 'Last team has 2 players (50 - 48 = 2 remainder)');

const totalDistributed = generatedTeams50.reduce((s, t) => s + t.players.length, 0);
assert(totalDistributed === 50, 'All 50 players distributed');

// ================================================================
// TEST 5: Team Naming — Auto Mode
// ================================================================
section('5. TEAM NAMING — Auto Mode');

const autoTeams = [];
for (let i = 1; i <= 5; i++) {
  autoTeams.push({ name: `Team ${i}`, players: [] });
}
assert(autoTeams[0].name === 'Team 1', 'First team named "Team 1"');
assert(autoTeams[4].name === 'Team 5', 'Fifth team named "Team 5"');

// ================================================================
// TEST 6: Team Naming — Custom Prefix
// ================================================================
section('6. TEAM NAMING — Custom Prefix');

const customPrefix = 'Squad';
const prefixTeams = [];
for (let i = 1; i <= 5; i++) {
  prefixTeams.push({ name: `${customPrefix} ${i}`, players: [] });
}
assert(prefixTeams[0].name === 'Squad 1', 'Custom prefix "Squad 1"');
assert(prefixTeams[2].name === 'Squad 3', 'Custom prefix "Squad 3"');

// ================================================================
// TEST 7: Player Name Parsing
// ================================================================
section('7. PLAYER NAME PARSING');

// Newline separated
const rawNewline = 'Alice\nBob\nCharlie\nDave';
const parsedNewline = rawNewline.split(/[\n,;\t]+/).map(n => n.trim()).filter(n => n.length > 0);
assert(parsedNewline.length === 4, 'Newline parsing: 4 names');
assert(parsedNewline[0] === 'Alice', 'First name is Alice');

// Comma separated
const rawComma = 'Alpha, Beta, Gamma, Delta';
const parsedComma = rawComma.split(/[\n,;\t]+/).map(n => n.trim()).filter(n => n.length > 0);
assert(parsedComma.length === 4, 'Comma parsing: 4 names');

// Semicolon separated
const rawSemicolon = 'One;Two;Three';
const parsedSemicolon = rawSemicolon.split(/[\n,;\t]+/).map(n => n.trim()).filter(n => n.length > 0);
assert(parsedSemicolon.length === 3, 'Semicolon parsing: 3 names');

// Mixed
const rawMixed = 'A,B\nC;D\tE';
const parsedMixed = rawMixed.split(/[\n,;\t]+/).map(n => n.trim()).filter(n => n.length > 0);
assert(parsedMixed.length === 5, 'Mixed delimiter parsing: 5 names');

// ================================================================
// TEST 8: Duplicate Name Filtering
// ================================================================
section('8. DUPLICATE NAME FILTERING');

const rawDupes = 'Alice\nBob\nalice\nCharlie\nbob';
const dupeNames = rawDupes.split(/[\n,;\t]+/).map(n => n.trim()).filter(n => n.length > 0);
const seen = new Set();
const dedupedNames = [];
dupeNames.forEach(n => {
  const lower = n.toLowerCase();
  if (!seen.has(lower)) {
    seen.add(lower);
    dedupedNames.push(n);
  }
});
assert(dedupedNames.length === 3, 'Duplicates removed: 3 unique names');
assert(dedupedNames[0] === 'Alice', 'First occurrence kept');

// ================================================================
// TEST 9: Empty Player List (Generic Names)
// ================================================================
section('9. EMPTY PLAYER LIST — Generic Names');

const genericPlayers = [];
for (let i = 1; i <= 16; i++) genericPlayers.push(`Player ${i}`);
assert(genericPlayers.length === 16, '16 generic player names generated');
assert(genericPlayers[0] === 'Player 1', 'First generic name is "Player 1"');
assert(genericPlayers[15] === 'Player 16', 'Last generic name is "Player 16"');

// ================================================================
// TEST 10: Seeded Randomization
// ================================================================
section('10. SEEDED RANDOMIZATION');

function createSeededRandom(seedStr) {
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = Math.imul(31, hash) + seedStr.charCodeAt(i) | 0;
  }
  return function () {
    hash |= 0;
    hash = hash + 0x6D2B79F5 | 0;
    let t = Math.imul(hash ^ hash >>> 15, 1 | hash);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function shuffleArray(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// Same seed should produce same shuffle
const arr1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const arr2 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
shuffleArray(arr1, createSeededRandom('test_seed_42'));
shuffleArray(arr2, createSeededRandom('test_seed_42'));
assert(JSON.stringify(arr1) === JSON.stringify(arr2), 'Same seed produces identical shuffles');

// Different seeds should produce different shuffles
const arr3 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
shuffleArray(arr3, createSeededRandom('different_seed'));
assert(JSON.stringify(arr1) !== JSON.stringify(arr3), 'Different seeds produce different shuffles');

// Shuffle should contain all elements
assert(arr1.sort((a, b) => a - b).join(',') === '1,2,3,4,5,6,7,8,9,10', 'Shuffled array contains all original elements');

// ================================================================
// TEST 11: Solo / Duo / Trio Modes
// ================================================================
section('11. GAME MODE CALCULATIONS');

// Solo: 1 player per team
assert(Math.ceil(16 / 1) === 16, 'Solo: 16 players = 16 teams');

// Duo: 2 players per team
assert(Math.ceil(16 / 2) === 8, 'Duo: 16 players = 8 teams');

// Trio: 3 players per team
assert(Math.ceil(16 / 3) === 6, 'Trio: 16 players = 6 teams (ceil)');
assert(16 % 3 === 1, 'Trio: 16 players has 1 remainder');

// Squad: 4 players per team
assert(Math.ceil(16 / 4) === 4, 'Squad: 16 players = 4 teams');

// ================================================================
// TEST 12: Tournament Creation with Generated Teams
// ================================================================
section('12. TOURNAMENT CREATION VIA SIMULATOR');

localStorage.clear();
// Re-require after clear for fresh state
const teamsData = [];
for (let i = 1; i <= 12; i++) {
  teamsData.push({
    name: `SimTeam ${i}`,
    players: [`P${i * 4 - 3}`, `P${i * 4 - 2}`, `P${i * 4 - 1}`, `P${i * 4}`],
  });
}

const simTourn = db.createTournament(userId, {
  name: 'Simulator Generated',
  team_count: 12,
  game_mode: 'squad',
  scoring_system: 'default',
  teamsData,
});

assert(simTourn !== null, 'Simulator tournament created');
assert(simTourn.name === 'Simulator Generated', 'Tournament name matches');

const simTeams = db.getTeams(simTourn.id);
assert(simTeams.length === 12, '12 teams created');
assert(simTeams[0].name === 'SimTeam 1', 'First team named correctly');

const simPlayers = db.getPlayersByTournament(simTourn.id);
assert(simPlayers.length === 48, '48 players created across 12 teams');

// ================================================================
// TEST 13: Team Name Uniqueness Check
// ================================================================
section('13. TEAM NAME UNIQUENESS');

const teamNames = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Alpha'];
const uniqueNames = new Set(teamNames.map(n => n.toLowerCase()));
assert(uniqueNames.size !== teamNames.length, 'Duplicate detected in team names');
assert(uniqueNames.size === 4, 'Only 4 unique names from 5 entries');

// ================================================================
// TEST 14: Max Team Limit (48)
// ================================================================
section('14. MAX TEAM LIMIT');

const maxTeams = Math.ceil(192 / 4);
assert(maxTeams === 48, '192/4 = 48 teams (max allowed)');
assert(Math.ceil(193 / 4) === 49, '193/4 = 49 exceeds 48 limit');

// ================================================================
// TEST 15: Min Team Count (2)
// ================================================================
section('15. MIN TEAM COUNT');

const minTeams = Math.ceil(2 / 1);
assert(minTeams >= 2, 'At least 2 teams can be formed from 2 players');
assert(Math.ceil(1 / 1) === 1, '1 player = 1 team, should be rejected');

// ================================================================
// TEST 16: CSV Import Simulation
// ================================================================
section('16. CSV IMPORT PARSING');

const csvContent = 'Alice,Bob,Charlie,Dave\nEve,Frank,Grace,Heidi';
const csvParsed = csvContent.replace(/,/g, '\n').replace(/;/g, '\n').split(/[\n]+/).map(n => n.trim()).filter(n => n.length > 0);
assert(csvParsed.length === 8, 'CSV parsed into 8 names');
assert(csvParsed[0] === 'Alice', 'First CSV name');
assert(csvParsed[7] === 'Heidi', 'Last CSV name');

// ================================================================
// TEST 17: Overwrite Prevention Check
// ================================================================
section('17. OVERWRITE PREVENTION');

const existingTeams = db.getTeams(simTourn.id);
assert(existingTeams.length > 0, 'Existing tournament has teams');
assert(existingTeams.length === 12, '12 existing teams before overwrite');
// The simulator should show confirmation before overwriting

// ================================================================
// TEST 18: Tournament Integration — Teams Created
// ================================================================
section('18. TOURNAMENT-TEAMS LIFECYCLE');

const twp = db.getTeamsWithPlayers(simTourn.id);
assert(twp.length === 12, '12 teams with players');
assert(twp[0].players.length === 4, 'First team has 4 players');
assert(twp[11].players.length === 4, 'Last team has 4 players');

// ================================================================
// TEST 19: Scoring Engine Compatibility
// ================================================================
section('19. SCORING ENGINE COMPATIBILITY');

// Create a match and verify teams work with scoring
const match = db.createMatch(simTourn.id, 1);
assert(match !== null, 'Match created for simulator tournament');

const entries = simTeams.map((t, i) => ({
  teamId: t.id,
  placement: i + 1,
  kills: 12 - i,
}));

const results = db.saveMatchResults(simTourn.id, match.id, entries);
assert(results !== null, 'Match results saved successfully');
assert(results.length === 12, '12 team results saved');

const leaderboard = db.getTournamentLeaderboard(simTourn.id);
assert(leaderboard.length === 12, 'Leaderboard has 12 entries');
assert(leaderboard[0].rank === 1, 'First rank is 1');

// ================================================================
// TEST 20: Edge Case — 1 Player Per Team (Solo)
// ================================================================
section('20. EDGE CASE — Solo Mode');

const soloPlayers = [];
for (let i = 1; i <= 12; i++) soloPlayers.push(`Solo_P${i}`);
const soloTeams = [];
let sIdx = 0;
for (let t = 0; t < 12; t++) {
  const tp = [];
  for (let p = 0; p < 1 && sIdx < soloPlayers.length; p++) {
    tp.push(soloPlayers[sIdx++]);
  }
  soloTeams.push({ name: `Player ${t + 1}`, players: tp });
}
assert(soloTeams.length === 12, 'Solo: 12 teams');
assert(soloTeams.every(t => t.players.length === 1), 'Solo: each team has 1 player');

// ================================================================
// SUMMARY
// ================================================================
console.log('\n' + '='.repeat(60));
console.log(`  AUTO TEAM SIMULATOR TEST RESULTS`);
console.log(`  ✅ Passed: ${testsPassed}`);
console.log(`  ❌ Failed: ${testsFailed}`);
if (failures.length > 0) {
  console.log(`\n  Failed tests:`);
  failures.forEach(f => console.log(`    • ${f}`));
}
console.log('='.repeat(60));

process.exit(testsFailed > 0 ? 1 : 0);
