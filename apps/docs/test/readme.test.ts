/**
 * The README is a product page: its install block is the line the Getting started page gives, and each relative link and image it holds
 * names a file that is there. It reads files by path from the repository's root and imports no workspace package.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..', '..', '..');
const README = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
const GETTING_STARTED = fs.readFileSync(path.join(ROOT, 'apps', 'docs', 'src', 'content', 'docs', 'getting-started.mdx'), 'utf8');

/** The text between the first bash fence's lines, trimmed, or undefined where there is none. */
function installOf(text: string) {
  return /^```bash\n([\s\S]*?)\n```/m.exec(text)?.[1]?.trim();
}

/** The relative targets of the links and images of a text, with no fragment, for which `exists` says no. */
function unresolved(text: string, exists: (file: string) => boolean) {
  const missing: string[] = [];
  for (const m of text.matchAll(/!?\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const target = m[1]!;
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    const file = target.split('#')[0]!;
    if (!exists(file)) missing.push(file);
  }
  return missing;
}

test('REFUSED: an install line that is not getting-started’s, or that names no releases/latest/download/install.sh', () => {
  const want = installOf(GETTING_STARTED);
  assert.ok(want);
  const npm = '# Nemia\n\n```bash\nnpm install\n```\n';
  const pinned = '```bash\ncurl -fsSL https://github.com/emyann/nemia/releases/download/v1.0.0/install.sh | sh\n```\n';
  assert.notEqual(installOf(npm), want);
  assert.notEqual(installOf(pinned), want);
  assert.ok(!installOf(pinned)!.includes('releases/latest/download/install.sh'));
});

test('the README’s install block is getting-started’s line, and names releases/latest/download/install.sh', () => {
  const line = installOf(README);
  assert.ok(line);
  assert.equal(line, installOf(GETTING_STARTED));
  assert.ok(line.includes('releases/latest/download/install.sh'));
});

test('REFUSED: a relative link or image to a file that is not there', () => {
  const text = [
    '[a](no/such.md)',
    '![b](apps/web/test/approved/none.png)',
    '[c](docs/architecture.md#who-owns-what)',
    '[d](https://example.org)',
    '[e](#install)',
  ].join('\n');
  assert.deepEqual(
    unresolved(text, (f) => f === 'docs/architecture.md'),
    ['no/such.md', 'apps/web/test/approved/none.png'],
  );
});

test('every relative link and image of README.md names a file that is there', () => {
  assert.ok(/!\[[^\]]*\]\(/.test(README));
  assert.deepEqual(
    unresolved(README, (f) => fs.existsSync(path.join(ROOT, f))),
    [],
  );
});
