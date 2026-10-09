/* ====================================================================
   LRD PointCalc — Exactly 12 Lobby Slots + 12 Result Slots Test Suite
   Verifies all requirements from prompt:
   1. Exactly 12 Lobby Slots (Slot 1 to Slot 12) with editable, addable, removable players.
   2. Exactly 12 Result Slots (Slot 1 to Slot 12) with individual kills and direct editing.
   3. Kill aggregation: Slot 5 with 5, 2, 1, 0 kills = 8 kills total.
   4. The only matching rule: Lobby roster determines slot, end screenshot determines kills.
   5. Unmatched player dropdown assignment routes kills and updates slot total.
   6. No "No Lobby Roster Confirmed" banner when usable roster exists.
   7. Manual corrections preserved upon recalculation.
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

// Minimal DOM mock to track created elements and renders
const domStore = new Map();
function createMockElement(tag) {
  const listeners = {};
  const children = [];
  const el = {
    tagName: tag,
    id: '',
    className: '',
    style: {},
    dataset: {},
    value: '',
    textContent: '',
    children,
    addEventListener: (evt, fn) => {
      if (!listeners[evt]) listeners[evt] = [];
      listeners[evt].push(fn);
    },
    dispatchEvent: (evt) => {
      (listeners[evt] || []).forEach((fn) => fn({ target: el }));
    },
    appendChild: (child) => { children.push(child); },
    removeChild: (child) => {
      const idx = children.indexOf(child);
      if (idx !== -1) children.splice(idx, 1);
    },
    querySelector: (sel) => {
      for (const c of children) {
        if (sel.startsWith('.') && c.className.includes(sel.slice(1))) return c;
        if (sel.startsWith('#') && c.id === sel.slice(1)) return c;
        const found = c.querySelector?.(sel);
        if (found) return found;
      }
      return null;
    },
    querySelectorAll: (sel) => {
      const matches = [];
      function walk(node) {
        for (const c of node.children || []) {
          if (sel.startsWith('.') && c.className.includes(sel.slice(1))) matches.push(c);
          else if (sel.startsWith('#') && c.id === sel.slice(1)) matches.push(c);
          walk(c);
        }
      }
      walk(el);
      return matches;
    },
  };

  Object.defineProperty(el, 'innerHTML', {
    get: () => el._html || '',
    set: (val) => {
      el._html = val;
      el.children.length = 0;
    },
  });

  return el;
}

global.document = {
  getElementById: (id) => {
    if (!domStore.has(id)) {
      const el = createMockElement('div');
      el.id = id;
      domStore.set(id, el);
    }
    return domStore.get(id);
  },
  createElement: createMockElement,
  querySelectorAll: () => [],
  querySelector: () => null,
  addEventListener: () => {},
  readyState: 'complete',
};

// Core modules
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

function it(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ PASS: ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.message}`);
  }
}

console.log('============================================================');
console.log('LRD POINTCALC AI — EXACTLY 12 LOBBY + 12 RESULT SLOTS SUITE');
console.log('============================================================\n');

// ------------------------------------------------------------------
// 1. EXACTLY 12 LOBBY SLOTS
// ------------------------------------------------------------------
console.log('--- 1. Lobby Slot List: Exactly 12 Slots ---');

it('initializes and maintains exactly 12 lobby slots (Slot 1 to Slot 12)', () => {
  AIScanner.init12SlotsForMatch();
  const slots = AIScanner.getSlots();
  assert.strictEqual(slots.length, 12, 'Must have exactly 12 slots');
  for (let i = 1; i <= 12; i++) {
    assert.strictEqual(slots[i - 1].slot, i, `Slot index ${i - 1} must be Slot ${i}`);
  }
});

it('allows editing player names, adding players, and removing players manually in lobby slots', () => {
  AIScanner.init12SlotsForMatch();
  // Edit player in slot 0 (Slot 1)
  AIScanner.updatePlayerName(0, 0, 'ShadowRider');
  assert.strictEqual(AIScanner.getSlots()[0].players[0].name, 'ShadowRider');

  // Add player to slot 0
  const countBefore = AIScanner.getSlots()[0].players.length;
  AIScanner.addPlayer(0, 'SniperGhost');
  assert.strictEqual(AIScanner.getSlots()[0].players.length, countBefore + 1);
  assert.strictEqual(AIScanner.getSlots()[0].players[countBefore].name, 'SniperGhost');

  // Remove player from slot 0
  AIScanner.removePlayer(0, countBefore);
  assert.strictEqual(AIScanner.getSlots()[0].players.length, countBefore);
});

it('puts each player inside the correct slot according to visible slot number without mixing', () => {
  const lobbyOcr = `
    1. Team Alpha [Alpha1, Alpha2, Alpha3, Alpha4]
    5. Team Phantom [Phantom1, Phantom2, Phantom3, Phantom4]
    12. Team Omega [Omega1, Omega2, Omega3, Omega4]
  `;
  const parsed = AIService.parseLobbyRosterText(lobbyOcr);

  assert.strictEqual(parsed.length, 3);
  assert.strictEqual(parsed[0].slot, 1);
  assert.strictEqual(parsed[1].slot, 5);
  assert.strictEqual(parsed[2].slot, 12);

  // Check players are not mixed
  assert.strictEqual(parsed[0].players[0].name, 'Alpha1');
  assert.strictEqual(parsed[1].players[0].name, 'Phantom1');
  assert.strictEqual(parsed[2].players[0].name, 'Omega1');
});

// ------------------------------------------------------------------
// 2. EXACTLY 12 END RESULT SLOTS & KILL AGGREGATION
// ------------------------------------------------------------------
console.log('\n--- 2. End Results: Exactly 12 Slots & Kill Aggregation ---');

it('maintains exactly 12 result slots (Slot 1 to Slot 12)', () => {
  AIScanner.init12SlotsForMatch();
  const res = AIScanner.getResults();
  assert.strictEqual(res.length, 12, 'Must have exactly 12 result records');
  for (let i = 1; i <= 12; i++) {
    assert.strictEqual(res[i - 1].slot, i);
  }
});

it('sums individual kills into slot total: Slot 5 with 5, 2, 1, 0 kills = 8 kills', () => {
  AIScanner.init12SlotsForMatch();

  // Set Slot 5 players: 4 players
  const slot5Roster = [
    { name: 'P5_A', kills: 5 },
    { name: 'P5_B', kills: 2 },
    { name: 'P5_C', kills: 1 },
    { name: 'P5_D', kills: 0 },
  ];

  AIScanner.getSlots()[4].players = slot5Roster;
  AIScanner.recalculateTeam(4);

  assert.strictEqual(AIScanner.getResults()[4].totalKills, 8, '5 + 2 + 1 + 0 must equal 8 kills');
});

it('allows editing individual kills directly in result slot with instant total update', () => {
  AIScanner.init12SlotsForMatch();
  AIScanner.getSlots()[4].players = [
    { name: 'P1', kills: 5 },
    { name: 'P2', kills: 2 },
    { name: 'P3', kills: 1 },
    { name: 'P4', kills: 0 },
  ];
  AIScanner.recalculateTeam(4);
  assert.strictEqual(AIScanner.getResults()[4].totalKills, 8);

  // User edits P4 kills: 0 -> 3
  AIScanner.updatePlayerKill(4, 3, 3);
  assert.strictEqual(AIScanner.getSlots()[4].players[3].kills, 3);
  assert.strictEqual(AIScanner.getResults()[4].totalKills, 11, '5 + 2 + 1 + 3 must equal 11 kills');
});

it('allows editing placement directly inside each result slot', () => {
  AIScanner.init12SlotsForMatch();
  AIScanner.updatePlacement(4, 3);
  assert.strictEqual(AIScanner.getResults()[4].placement, 3);

  // Recalculates ScoringEngine points
  const breakdown = AIScanner.getScoringBreakdown(AIScanner.getResults()[4]);
  // 3rd place in Free Fire = 8 place pts
  assert.strictEqual(breakdown.placementPoints, 8);
});

// ------------------------------------------------------------------
// 3. THE ONLY MATCHING RULE THAT MATTERS
// ------------------------------------------------------------------
console.log('\n--- 3. Matching Rule: Lobby determines slot, End screens determine kills ---');

it('routes kills based on lobby roster membership, not OCR order', () => {
  const lobby = [
    { slot: 1, teamName: 'Team 1', players: [{ name: 'Player_One' }] },
    { slot: 5, teamName: 'Team 5', players: [{ name: 'Player_Five' }] },
    { slot: 12, teamName: 'Team 12', players: [{ name: 'Player_Twelve' }] },
  ];

  // End screen OCR appears in scrambled/random order:
  // First line: Player_Twelve 9 kills (rank 1)
  // Second line: Player_One 4 kills (rank 2)
  // Third line: Player_Five 7 kills (rank 3)
  const endScreens = [
    { name: 'Player_Twelve', kills: 9, rank: 1 },
    { name: 'Player_One', kills: 4, rank: 2 },
    { name: 'Player_Five', kills: 7, rank: 3 },
  ];

  const organized = AIService.organizeResultsInto12Slots({
    slots: lobby,
    extractedResults: endScreens,
  });

  const slot1 = organized.slotResults.find((s) => s.slot === 1);
  const slot5 = organized.slotResults.find((s) => s.slot === 5);
  const slot12 = organized.slotResults.find((s) => s.slot === 12);

  assert.strictEqual(slot1.totalKills, 4, 'Player_One (4 kills) belongs to Slot 1');
  assert.strictEqual(slot1.placement, 2);

  assert.strictEqual(slot5.totalKills, 7, 'Player_Five (7 kills) belongs to Slot 5');
  assert.strictEqual(slot5.placement, 3);

  assert.strictEqual(slot12.totalKills, 9, 'Player_Twelve (9 kills) belongs to Slot 12');
  assert.strictEqual(slot12.placement, 1);
});

it('isolates unmatched players and allows assigning via Slot 1-12 dropdown with live kill summation', () => {
  AIScanner.init12SlotsForMatch();

  // Slot 2 has 2 players with 3 kills each
  AIScanner.getSlots()[1].players = [
    { id: 'p2a', name: 'RosterPlayer2A', kills: 3 },
    { id: 'p2b', name: 'RosterPlayer2B', kills: 3 },
  ];
  AIScanner.recalculateTeam(1);
  assert.strictEqual(AIScanner.getResults()[1].totalKills, 6);

  // Unmatched player detected from end screenshot
  AIScanner.getUnassigned().push({
    id: 'un_mystery',
    name: 'MysterySniper',
    kills: 4,
    source: 'End Screen 2',
  });

  assert.strictEqual(AIScanner.getUnassigned().length, 1);

  // User selects Slot 2 (index 1) from the dropdown
  AIScanner.assignUnassignedPlayer('un_mystery', 1);

  // Unassigned list cleared
  assert.strictEqual(AIScanner.getUnassigned().length, 0);

  // Slot 2 now has MysterySniper
  const pList = AIScanner.getSlots()[1].players;
  assert.strictEqual(pList.some((p) => p.name === 'MysterySniper'), true);

  // Slot 2 kills updated: 3 + 3 + 4 = 10 kills
  assert.strictEqual(AIScanner.getResults()[1].totalKills, 10);

  // Persists confirmed manual assignment
  assert.strictEqual(AIScanner.getManualAssignments().get('mysterysniper'), 2);
});

it('does not emit or show "No Lobby Roster Confirmed" when a usable roster is loaded or extracted', () => {
  const usableSlots = [
    { slot: 1, teamName: 'Alpha', players: [{ name: 'A1' }] },
    { slot: 2, teamName: 'Beta', players: [{ name: 'B1' }] },
  ];

  const diagnostics = AIService.diagnoseRosterState({
    slots: usableSlots,
    unmatchedPlayers: [],
  });

  const hasNoLobbyWarning = diagnostics.some((d) => d.type === 'no_lobby_roster');
  assert.strictEqual(hasNoLobbyWarning, false, 'Must NOT show "No Lobby Roster Confirmed" when usable roster exists');
});

// ------------------------------------------------------------------
// 4. PRESERVES MANUAL CORRECTIONS UPON RECALCULATION
// ------------------------------------------------------------------
console.log('\n--- 4. Preserves manual corrections across recalculation ---');

it('preserves manual player kills, overrides, and placements across recalculations', () => {
  AIScanner.init12SlotsForMatch();

  // Set Slot 3 placement = 1, Slot 3 total kills = 14
  AIScanner.updatePlacement(2, 1);
  AIScanner.updatePlayerKill(2, 0, 8);
  AIScanner.updatePlayerKill(2, 1, 6);

  assert.strictEqual(AIScanner.getResults()[2].placement, 1);
  assert.strictEqual(AIScanner.getResults()[2].totalKills, 14);

  // Trigger recalculateAll
  AIScanner.recalculateAll();

  assert.strictEqual(AIScanner.getResults()[2].placement, 1, 'Placement preserved');
  assert.strictEqual(AIScanner.getResults()[2].totalKills, 14, 'Total kills preserved');
  assert.strictEqual(AIScanner.getSlots()[2].players[0].kills, 8, 'Player 0 kills preserved');
  assert.strictEqual(AIScanner.getSlots()[2].players[1].kills, 6, 'Player 1 kills preserved');
});

console.log('\n============================================================');
console.log(`TEST SUITE RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('============================================================');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
