/**
 * Every picture the e2e takes is taken by `photograph` (`test/e2e/board.ts`), which stills every animation for the shot: an agent's face
 * moves at all times, and a picture taken mid-blink or mid-bob would differ from run to run.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const E2E = path.resolve(import.meta.dirname, 'e2e');

/** The files of `files`, by their path, that call `.screenshot(` themselves: every one but the helper that stills the animations. */
export function bareScreenshots(files: Readonly<Record<string, string>>): string[] {
  return Object.entries(files)
    .filter(([file, text]) => {
      const calls = text.match(/\.screenshot\(/g)?.length ?? 0;
      return file === 'board.ts' ? calls !== 1 || !/export async function photograph[\s\S]*\.screenshot\(/.test(text) : calls > 0;
    })
    .map(([file]) => file);
}

/** Each `.ts` file under `test/e2e/`, by its path from there, with its text. */
const e2eFiles = (): Record<string, string> =>
  Object.fromEntries(
    fs
      .readdirSync(E2E, { withFileTypes: true, recursive: true })
      .filter((e) => e.isFile() && e.name.endsWith('.ts'))
      .map((e) => {
        const file = path.join(e.parentPath, e.name);
        return [path.relative(E2E, file), fs.readFileSync(file, 'utf8')];
      }),
  );

test('REFUSED: a picture taken with a bare .screenshot( is named, and a second one in board.ts outside photograph', () => {
  assert.deepEqual(bareScreenshots({ 'x.ts': "await page.screenshot({ path: 'a.png' })", 'y.ts': "await photograph(page, 'a.png')" }), [
    'x.ts',
  ]);
  const helper =
    "export async function photograph(target, file) {\n  await target.screenshot({ path: file, animations: 'disabled' });\n}\n";
  assert.equal(bareScreenshots({ 'board.ts': helper }).length, 0);
  assert.deepEqual(bareScreenshots({ 'board.ts': `${helper}await page.screenshot({ path: 'b.png' });\n` }), ['board.ts']);
  assert.deepEqual(bareScreenshots({ 'board.ts': "await page.screenshot({ path: 'b.png' });\n" }), ['board.ts']);
});

test('every e2e picture is taken by photograph, which stills every animation for the shot', () => {
  const files = e2eFiles();
  assert.ok(files['board.ts'] && files['visit.ts'] && files[path.join('pages', '235-faces.ts')], 'the e2e files are read');
  assert.deepEqual(bareScreenshots(files), [], 'take the picture with photograph (board.ts)');
  const body = /export async function photograph\([\s\S]*?\n\}/.exec(files['board.ts'] ?? '')?.[0] ?? '';
  assert.match(body, /\.screenshot\(\{[\s\S]*animations:\s*'disabled'/, 'photograph stills every animation');
});
