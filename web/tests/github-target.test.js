const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const html = fs.readFileSync(path.join(root, 'web', 'index.html'), 'utf8');
const workflows = fs.readdirSync(path.join(root, '.github', 'workflows'))
  .filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'))
  .map((file) => fs.readFileSync(path.join(root, '.github', 'workflows', file), 'utf8'))
  .join('\n');

assert.match(html, /owner:\s*"qq1446039171"/, 'GitHub owner should be qq1446039171');
assert.match(html, /repo:\s*"edit-nsdk"/, 'GitHub repo should be edit-nsdk');
assert.match(workflows, /qq1446039171\/edit-nsdk/, 'workflows should identify the edit-nsdk repo');
assert.match(workflows, /CONFIG_PATH:\s*Config\/settings\.json/, 'workflows should use Config/settings.json as the config path');
assert.doesNotMatch(workflows, /enablement:\s*true/, 'workflows should not try to create or enable the Pages site');
assert.doesNotMatch(html, /New-NASDAQ/, 'web UI should not reference the old New-NASDAQ repo');
assert.doesNotMatch(workflows, /New-NASDAQ/, 'workflows should not reference the old New-NASDAQ repo');

console.log('github-target.test.js passed');
