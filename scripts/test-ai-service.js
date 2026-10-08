/* ====================================================================
   LRD PointCalc — AI Service & Slot List Parser Test Suite
   ==================================================================== */

const assert = require('assert');

// Mock window and navigator for Node environment
global.window = {
  ENV: {
    AI_ENDPOINT: null,
  },
};

// Load the AI service module
require('./ai/ai-service.js');
const AIService = global.window.AIService;

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
console.log('RUNNING AI SERVICE & PARSER TESTS');
console.log('====================================================\n');

// 1. Image Validation Tests
console.log('--- Image File Validation ---');
it('Rejects null or missing file', () => {
  const result = AIService.validateImageFile(null);
  assert.strictEqual(result.valid, false);
});

it('Rejects unsupported mime types', () => {
  const file = { type: 'application/pdf', size: 1024 };
  const result = AIService.validateImageFile(file);
  assert.strictEqual(result.valid, false);
  assert.match(result.error, /Unsupported file type/);
});

it('Accepts valid PNG file under 10MB', () => {
  const file = { type: 'image/png', size: 2 * 1024 * 1024 };
  const result = AIService.validateImageFile(file);
  assert.strictEqual(result.valid, true);
});

it('Accepts valid JPEG and WebP files', () => {
  assert.strictEqual(AIService.validateImageFile({ type: 'image/jpeg', size: 500000 }).valid, true);
  assert.strictEqual(AIService.validateImageFile({ type: 'image/webp', size: 500000 }).valid, true);
});

it('Rejects files exceeding 10MB', () => {
  const file = { type: 'image/png', size: 11 * 1024 * 1024 };
  const result = AIService.validateImageFile(file);
  assert.strictEqual(result.valid, false);
  assert.match(result.error, /File too large/);
});

// 2. Parser Pattern Tests
console.log('\n--- Slot List Text Parsing ---');
it('Parses dot-format (1. Team Alpha)', () => {
  const text = `
    1. Team Alpha
    2. Team Bravo
    3. Team Charlie
  `;
  const entries = AIService.parseSlotListText(text);
  assert.strictEqual(entries.length, 3);
  assert.strictEqual(entries[0].slot, 1);
  assert.strictEqual(entries[0].teamName, 'Team Alpha');
  assert.strictEqual(entries[1].slot, 2);
  assert.strictEqual(entries[1].teamName, 'Team Bravo');
  assert.strictEqual(entries[2].slot, 3);
  assert.strictEqual(entries[2].teamName, 'Team Charlie');
});

it('Parses parenthesis-format (1) Team Alpha)', () => {
  const text = `
    1) Total Gaming
    2) Orangutan Elite
    3) GodLike Esports
  `;
  const entries = AIService.parseSlotListText(text);
  assert.strictEqual(entries.length, 3);
  assert.strictEqual(entries[0].teamName, 'Total Gaming');
  assert.strictEqual(entries[1].teamName, 'Orangutan Elite');
});

it('Parses dash-format (1 - Team Alpha) and colon-format (2 : Team Bravo)', () => {
  const text = `
    1 - Team Elite
    2 : Nigma Galaxy
    3 - Blind Esports
  `;
  const entries = AIService.parseSlotListText(text);
  assert.strictEqual(entries.length, 3);
  assert.strictEqual(entries[0].slot, 1);
  assert.strictEqual(entries[0].teamName, 'Team Elite');
  assert.strictEqual(entries[1].slot, 2);
  assert.strictEqual(entries[1].teamName, 'Nigma Galaxy');
});

it('Parses hashtag-format (#1 Team Alpha)', () => {
  const text = `
    #1 Team Hydra
    #2 Team Soul
    #3 TSM
  `;
  const entries = AIService.parseSlotListText(text);
  assert.strictEqual(entries.length, 3);
  assert.strictEqual(entries[0].slot, 1);
  assert.strictEqual(entries[0].teamName, 'Team Hydra');
});

it('Parses keyword-format (Slot 1 Team Alpha)', () => {
  const text = `
    Slot 1 Team Flash
    slot 2 Evos Phoenix
    SLOT 3 Attack All Around
  `;
  const entries = AIService.parseSlotListText(text);
  assert.strictEqual(entries.length, 3);
  assert.strictEqual(entries[0].slot, 1);
  assert.strictEqual(entries[0].teamName, 'Team Flash');
  assert.strictEqual(entries[1].slot, 2);
  assert.strictEqual(entries[1].teamName, 'Evos Phoenix');
  assert.strictEqual(entries[2].slot, 3);
  assert.strictEqual(entries[2].teamName, 'Attack All Around');
});

it('Sorts slots in ascending order even if scrambled in input', () => {
  const text = `
    5. Team Epsilon
    2. Team Beta
    1. Team Alpha
    4. Team Delta
    3. Team Gamma
  `;
  const entries = AIService.parseSlotListText(text);
  assert.strictEqual(entries.length, 5);
  assert.strictEqual(entries[0].slot, 1);
  assert.strictEqual(entries[0].teamName, 'Team Alpha');
  assert.strictEqual(entries[1].slot, 2);
  assert.strictEqual(entries[4].slot, 5);
  assert.strictEqual(entries[4].teamName, 'Team Epsilon');
});

it('Prevents duplicate slot numbers (takes first occurrence)', () => {
  const text = `
    1. First Alpha
    1. Duplicate Alpha
    2. Real Beta
  `;
  const entries = AIService.parseSlotListText(text);
  assert.strictEqual(entries.length, 2);
  assert.strictEqual(entries[0].teamName, 'First Alpha');
  assert.strictEqual(entries[1].teamName, 'Real Beta');
});

it('Parses Free Fire 12-slot tournament list cleanly', () => {
  const text = `
    FREE FIRE TOURNAMENT SLOTS
    1. Total Gaming Esports
    2. Orangutan Elite
    3. GodLike Esports
    4. Team Elite
    5. Blind Esports
    6. Nigma Galaxy
    7. TSM FTX
    8. Team Chaos
    9. Chemin Esports
    10. Enigma Gaming
    11. Revenant Esports
    12. Hyderabad Hydras
  `;
  const entries = AIService.parseSlotListText(text);
  assert.strictEqual(entries.length, 12);
  assert.strictEqual(entries[0].slot, 1);
  assert.strictEqual(entries[0].teamName, 'Total Gaming Esports');
  assert.strictEqual(entries[11].slot, 12);
  assert.strictEqual(entries[11].teamName, 'Hyderabad Hydras');
});

// 3. Manual Fallback Result Test
console.log('\n--- Manual Result Generation ---');
it('Creates structured result from manual entries', () => {
  const input = [
    { slot: 1, teamName: 'Alpha' },
    { slot: 2, teamName: 'Beta' },
  ];
  const result = AIService.createManualResult(input);
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.method, 'manual');
  assert.strictEqual(result.entries.length, 2);
  assert.strictEqual(result.entries[0].confidence, 1.0);
  assert.strictEqual(result.entries[1].teamName, 'Beta');
});

console.log('\n====================================================');
console.log(`SUMMARY: ${passed} passed, ${failed} failed.`);
console.log('====================================================');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
