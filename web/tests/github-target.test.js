const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const html = fs.readFileSync(path.join(root, 'web', 'index.html'), 'utf8');
const workflows = fs.readdirSync(path.join(root, '.github', 'workflows'))
  .filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'))
  .map((file) => fs.readFileSync(path.join(root, '.github', 'workflows', file), 'utf8'))
  .join('\n');

function extract(name) {
  const match = html.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n    \\}`));
  assert.ok(match, `${name} should exist`);
  return match[0];
}

assert.match(html, /owner:\s*"qq1446039171"/, 'GitHub owner should be qq1446039171');
assert.match(html, /repo:\s*"edit-nsdk"/, 'GitHub repo should be edit-nsdk');
assert.match(workflows, /qq1446039171\/edit-nsdk/, 'workflows should identify the edit-nsdk repo');
assert.match(workflows, /CONFIG_PATH:\s*Config\/settings\.json/, 'workflows should use Config/settings.json as the config path');
assert.doesNotMatch(workflows, /enablement:\s*true/, 'workflows should not try to create or enable the Pages site');
assert.doesNotMatch(html, /New-NASDAQ/, 'web UI should not reference the old New-NASDAQ repo');
assert.doesNotMatch(workflows, /New-NASDAQ/, 'workflows should not reference the old New-NASDAQ repo');
assert.match(html, /GITHUB_TOKEN_STORAGE_KEY/, 'GitHub token should use dedicated browser-only storage');
assert.match(html, /loadRememberedGithubToken/, 'remembered GitHub token should be loaded from the browser');
assert.match(html, /saveRememberedGithubToken/, 'GitHub token should only be remembered after a successful save');
assert.match(html, /data-github-remember/, 'GitHub modal should explain and control local token remembering');
assert.match(html, /openGithubSave/, 'remembered token should support direct GitHub saving');
assert.doesNotMatch(html, /ghp_[A-Za-z0-9]+/, 'a GitHub personal access token must never be embedded in the page source');

const GITHUB_TOKEN_STORAGE_KEY = 'tz-nsdk-configurator:github-token';
const storage = new Map();
const localStorage = {
  getItem: (key) => storage.has(key) ? storage.get(key) : null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
};
const state = { githubTokenRemembered: false };
const loadRememberedGithubToken = eval(`(${extract('loadRememberedGithubToken')})`);
const saveRememberedGithubToken = eval(`(${extract('saveRememberedGithubToken')})`);
const clearRememberedGithubToken = eval(`(${extract('clearRememberedGithubToken')})`);

assert.strictEqual(loadRememberedGithubToken(), '');
assert.strictEqual(saveRememberedGithubToken(' browser-only-token '), true);
assert.strictEqual(loadRememberedGithubToken(), 'browser-only-token');
assert.strictEqual(state.githubTokenRemembered, true);
clearRememberedGithubToken();
assert.strictEqual(loadRememberedGithubToken(), '');
assert.strictEqual(state.githubTokenRemembered, false);

console.log('github-target.test.js passed');
