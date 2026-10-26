const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, '..', 'extension');
const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));

test('manifest is MV3 and every referenced file exists', () => {
  assert.strictEqual(m.manifest_version, 3);
  const files = [
    m.background.service_worker,
    m.action.default_popup,
    ...Object.values(m.icons),
    ...Object.values(m.action.default_icon),
    ...m.content_scripts.flatMap((c) => [...c.js, ...c.css]),
  ];
  for (const f of files) assert.ok(fs.existsSync(path.join(dir, f)), `missing ${f}`);
});

test('permissions are minimal', () => {
  assert.deepStrictEqual(m.permissions, ['storage']);
  assert.deepStrictEqual(m.host_permissions, [
    'https://ce.us-east-1.amazonaws.com/*',
    'https://api.pricing.us-east-1.amazonaws.com/*',
  ]);
});

test('popup.html only loads local scripts (no inline JS, no remote code)', () => {
  const html = fs.readFileSync(path.join(dir, 'popup.html'), 'utf8');
  assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/.test(html), 'inline script found');
  assert.ok(!/src=["']https?:/.test(html), 'remote script found');
});
