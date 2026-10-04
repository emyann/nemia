/**
 * An agent's try folder written in the store (`writeTryFolder`): its step file written when it says otherwise, left alone when it says the
 * same, and every link on its way refused before anything is written. `WF_ROOT` is set before the import, since the stores read it as
 * they load.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from '../../test/scratch.ts';

process.env.WF_ROOT = scratch('wf-try-root-');
const { TRY_STEP, triesDir, tryDir, writeTryFolder } = await import('./try.store.ts');

/** What `fn` was refused with, by its message; empty when it was not. */
function refusal(fn: () => unknown): string {
  try {
    fn();
  } catch (err) {
    return (err as Error).message;
  }
  return '';
}

test("a try's folder is tries/<agent> in the store, its one step file try.md, written and answered", () => {
  const home = scratch('wf-try-');
  assert.equal(writeTryFolder('scribe', 'Try it.\n', home), path.join(home, 'tries', 'scribe'));
  assert.equal(tryDir('scribe', home), path.join(triesDir(home), 'scribe'));
  assert.equal(fs.readFileSync(path.join(home, 'tries', 'scribe', `${TRY_STEP}.md`), 'utf8'), 'Try it.\n');
});

test('a step file that says the same is left as it is; one that says otherwise is written again', (t) => {
  const home = scratch('wf-try-');
  const file = path.join(writeTryFolder('scribe', 'Try it.\n', home), 'try.md');
  fs.chmodSync(file, 0o444);
  t.after(() => fs.chmodSync(file, 0o644));
  assert.equal(writeTryFolder('scribe', 'Try it.\n', home), path.dirname(file), 'the same text is not written: a read-only file stands');
  fs.chmodSync(file, 0o644);
  writeTryFolder('scribe', 'Try it again.\n', home);
  assert.equal(fs.readFileSync(file, 'utf8'), 'Try it again.\n');
});

test("REFUSED, nothing written through: a tries/, a try's folder or a step file that is a link", () => {
  const away = scratch('wf-try-away-');
  const linkedTries = scratch('wf-try-');
  fs.symlinkSync(away, path.join(linkedTries, 'tries'));
  const linkedDir = scratch('wf-try-');
  fs.mkdirSync(path.join(linkedDir, 'tries'));
  fs.symlinkSync(away, path.join(linkedDir, 'tries', 'scribe'));
  const linkedFile = scratch('wf-try-');
  fs.mkdirSync(path.join(linkedFile, 'tries', 'scribe'), { recursive: true });
  fs.writeFileSync(path.join(away, 'elsewhere.md'), 'Not a try.\n');
  fs.symlinkSync(path.join(away, 'elsewhere.md'), path.join(linkedFile, 'tries', 'scribe', 'try.md'));
  const said = (at: string): string =>
    `${at} is a link, and a try's folder is written by the api: make it a folder of its own, or remove it.`;
  assert.equal(
    refusal(() => writeTryFolder('scribe', 'Try it.\n', linkedTries)),
    said(path.join(linkedTries, 'tries')),
  );
  assert.equal(
    refusal(() => writeTryFolder('scribe', 'Try it.\n', linkedDir)),
    said(path.join(linkedDir, 'tries', 'scribe')),
  );
  const file = path.join(linkedFile, 'tries', 'scribe', 'try.md');
  assert.equal(
    refusal(() => writeTryFolder('scribe', 'Try it.\n', linkedFile)),
    said(file),
  );
  assert.deepEqual(fs.readdirSync(away), ['elsewhere.md'], 'nothing is written where a link points');
  assert.equal(fs.readFileSync(path.join(away, 'elsewhere.md'), 'utf8'), 'Not a try.\n');
});
