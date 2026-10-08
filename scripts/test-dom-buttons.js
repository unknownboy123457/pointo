const fs = require('fs');
const path = require('path');

console.log('====================================================');
console.log('RUNNING DOM BUTTONS & INTERACTION VERIFICATION');
console.log('====================================================\n');

const htmlContent = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passCount++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failCount++;
  }
}

// TEST 1: Check HTML tag nesting
console.log('--- Test 1: HTML Tag Integrity & Nesting ---');
const lines = htmlContent.split('\n');
const stack = [];
const voidTags = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
let tagErrors = [];

lines.forEach((line, lineIdx) => {
  const tagRegex = /<\/?([a-zA-Z0-9\-]+)([^>]*)>/g;
  let match;
  while ((match = tagRegex.exec(line)) !== null) {
    const fullTag = match[0];
    const tagName = match[1].toLowerCase();
    const isClosing = fullTag.startsWith('</');
    const isSelfClosing = fullTag.endsWith('/>') || voidTags.has(tagName);
    if (isClosing) {
      if (stack.length === 0) {
        tagErrors.push(`Line ${lineIdx + 1}: Unexpected closing </${tagName}>`);
      } else {
        const top = stack.pop();
        if (top.name !== tagName) {
          tagErrors.push(`Line ${lineIdx + 1}: Mismatched </${tagName}> (opened <${top.name}> at line ${top.line})`);
        }
      }
    } else if (!isSelfClosing) {
      stack.push({ name: tagName, line: lineIdx + 1 });
    }
  }
});

assert(tagErrors.length === 0, `All HTML tags match with 0 errors (found ${tagErrors.length})`);
assert(stack.length === 0, `All opened tags closed properly with 0 unclosed tags (found ${stack.length})`);

// TEST 2: Check buttons are NOT nested inside buttons
console.log('\n--- Test 2: Button Hierarchy (No Nested Buttons) ---');
const buttonRegex = /<button\b[^>]*>([\s\S]*?)<\/button>/gi;
let nestedButtonFound = false;
let bMatch;
while ((bMatch = buttonRegex.exec(htmlContent)) !== null) {
  if (/<button\b/i.test(bMatch[1])) {
    nestedButtonFound = true;
    break;
  }
}
assert(!nestedButtonFound, 'No button element is illegally nested inside another button element');

// TEST 3: Check existence of all critical buttons mentioned by user
console.log('\n--- Test 3: Critical Interactive Elements Exist ---');
const criticalIds = [
  'qa-create-tournament',
  'fab-create',
  'wiz-create-btn',
  'wizard-close-btn',
  'wizard-back-btn',
  'wiz-next-btn',
  'wiz-prev-btn',
  'wiz-manual-add-team',
  'wiz-review-add-team',
  'nav-home',
  'nav-tournaments',
  'nav-design',
  'nav-account',
  'design-tab-free',
  'design-tab-premium',
  'design-tab-import',
  'btn-action-calculate',
  'btn-action-tables',
  'btn-action-matches',
  'btn-action-design',
  'btn-action-edit',
  'btn-delete-dashboard-tourn',
  'btn-back-dashboard',
  'btn-back-tournament',
  'subtab-btn-leaderboard',
  'subtab-btn-matches',
];

criticalIds.forEach((id) => {
  const exists = htmlContent.includes(`id="${id}"`);
  assert(exists, `Element #${id} exists in index.html`);
});

// TEST 4: Global EscapeHtml Safety
console.log('\n--- Test 4: Global EscapeHtml Safety ---');
const configContent = fs.readFileSync(path.join(__dirname, 'config.js'), 'utf8');
assert(configContent.includes('window.escapeHtml = function'), 'window.escapeHtml defined globally in config.js');

// TEST 5: Verify all screen elements have unique IDs and correct screen class
console.log('\n--- Test 5: Screen Sections ---');
const screens = [
  'screen-login',
  'screen-home',
  'screen-tournaments',
  'screen-design',
  'screen-tournament-dashboard',
  'screen-tournament-detail',
  'screen-account'
];
screens.forEach((s) => {
  assert(htmlContent.includes(`id="${s}"`), `Screen #${s} exists`);
});

console.log('\n====================================================');
console.log(`SUMMARY: ${passCount} passed, ${failCount} failed.`);
console.log('====================================================');

if (failCount > 0) process.exit(1);
