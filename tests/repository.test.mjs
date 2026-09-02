import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const docs = ['README.md', 'NOTICE.md',
  ...readdirSync(path.join(root, 'docs')).filter(file => file.endsWith('.md')).map(file => `docs/${file}`)];

test('repository metadata and lockfile use the same project identity', () => {
  const pkg = JSON.parse(read('package.json'));
  const lock = JSON.parse(read('package-lock.json'));
  assert.equal(pkg.name, 'qart-leona');
  assert.equal(lock.name, pkg.name);
  assert.equal(lock.packages[''].name, pkg.name);
  assert.equal(lock.packages[''].version, pkg.version);
  assert.equal(pkg.private, true);
  assert.equal(pkg.license, 'UNLICENSED');
  assert.equal(pkg.repository.url, 'git+https://github.com/Reimangod/Qart-Leona.git');
});

test('all local documentation links resolve inside this repository', () => {
  let checked = 0;
  for (const file of docs) {
    const content = read(file);
    for (const match of content.matchAll(/\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
      const link = match[1];
      if (/^(?:https?:|mailto:|#)/.test(link)) continue;
      const destination = decodeURIComponent(link.split('#')[0]);
      const resolved = path.resolve(root, path.dirname(file), destination);
      assert.ok(resolved.startsWith(root), `${file}: link leaves the repository: ${link}`);
      assert.ok(existsSync(resolved), `${file}: broken link: ${link}`);
      checked++;
    }
  }
  assert.ok(checked >= docs.length, 'expected linked documentation and gallery assets');
});

test('documentation contains no personal filesystem paths or internal citation markers', () => {
  for (const file of docs) {
    assert.doesNotMatch(read(file), /\/Users\/|\/var\/folders\/|codex-file-citation|turn\d+(?:view|search)/, file);
  }
});

test('gallery images have valid JPEG headers and nonempty content', () => {
  for (const file of ['docs/images/artwork.jpg', 'docs/images/opening.jpg']) {
    const image = readFileSync(path.join(root, file));
    assert.equal(image.subarray(0, 3).toString('hex'), 'ffd8ff', file);
    assert.equal(image.subarray(-2).toString('hex'), 'ffd9', file);
    assert.ok(image.length > 10_000, `${file} is unexpectedly small`);
  }
});
