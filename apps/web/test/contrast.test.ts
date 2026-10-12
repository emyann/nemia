import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { BAR, GRAIN_TAIL, failing, grainedOf, hex, lookOf, ratio, ratioOf, tableOf, under, type Pair, type Sheet } from './e2e/contrast.ts';
import { scratch } from './scratch.ts';

const WHITE = [255, 255, 255] as const;
const pair = (ink: Pair['ink'], rest: Partial<Pair> = {}): Pair => ({
  state: 'measured',
  ink,
  ground: WHITE,
  faded: false,
  grained: false,
  text: 'a line of text',
  classes: 'text-neutral-500',
  count: 1,
  ...rest,
});
const sheet = (picture: string, scheme: Sheet['scheme'], pairs: Pair[]): Sheet => ({ picture, scheme, pairs });

test('the ratio is WCAG’s: black on white is 21, and the bar falls between #767676 and #777777 on white', () => {
  assert.equal(ratio([0, 0, 0], WHITE), 21);
  assert.equal(ratio(WHITE, [0, 0, 0]), 21, 'whichever is the lighter');
  assert.equal(ratio(WHITE, WHITE), 1);
  assert.equal(BAR, 4.5);
  assert.equal(under(pair([0x76, 0x76, 0x76])), false, '#767676 on white is 4.54');
  assert.equal(under(pair([0x77, 0x77, 0x77])), true, '#777777 on white is 4.47');
  assert.equal(ratioOf(pair([0x77, 0x77, 0x77])), 4.47);
  assert.equal(hex([0x77, 0x07, 0xff]), '#7707ff');
});

test('only a measured pair fails the bar: an unmeasured one and a disabled control’s are counted, never failed nor passed', () => {
  const faint = [0xcc, 0xcc, 0xcc] as const;
  assert.equal(under(pair(faint)), true);
  assert.equal(under(pair(faint, { state: 'exempt' })), false);
  assert.equal(under(pair(faint, { state: 'unmeasured', why: 'its ground is a background-image' })), false);
  const table = tableOf([
    sheet('runs-light.png', 'light', [pair(faint, { state: 'unmeasured', why: 'its ground is a background-image' })]),
  ]);
  assert.match(table, /0 under the bar \(0 distinct\), 1 unmeasured, 0 exempt/);
  assert.match(table, /- runs-light\.png: “a line of text” — its ground is a background-image/);
});

test('the table names each failing pair once a scheme, worst first, with its colours, its classes and its pictures', () => {
  const sheets = [
    sheet('runs-light.png', 'light', [pair([0x77, 0x77, 0x77]), pair([0, 0, 0], { classes: 'text-foreground' })]),
    sheet('gate-light.png', 'light', [pair([0x77, 0x77, 0x77]), pair([0xaa, 0xaa, 0xaa], { classes: 'text-neutral-400' })]),
    sheet('runs-dark.png', 'dark', [pair([0xee, 0xee, 0xee], { ground: [0, 0, 0] })]),
  ];
  const found = failing(sheets);
  assert.deepEqual(
    found.map((row) => [hex(row.pair.ink), row.scheme, row.pictures]),
    [
      ['#aaaaaa', 'light', ['gate-light.png']],
      ['#777777', 'light', ['runs-light.png', 'gate-light.png']],
    ],
  );
  const table = tableOf(sheets);
  assert.match(table, /3 pictures measured: 5 pairs, 3 under the bar \(2 distinct\)/);
  assert.match(
    table,
    /\| 4\.47 \| light \| #777777 \| #ffffff \| a line of text \| `text-neutral-500` \| gate-light\.png, runs-light\.png \|/,
  );
  assert.match(table, /\| runs \| dark \| runs-dark\.png \| 1 \| 18\.\d\d \| 0 \| 0 \| 0 \|/);
  assert.match(tableOf(sheets.slice(2)), /## Under the bar\n\nNone\./);
});

test('REFUSED: a pair under the bar at a grain’s far end: it fails as any measured pair, and the table says it is a grain’s', () => {
  assert.equal(GRAIN_TAIL, 0.02);
  const far = pair([0x6a, 0x6a, 0x6a], { ground: [0xc9, 0xc9, 0xc9], grained: true });
  assert.equal(under(far), true);
  assert.equal(under(pair([0x6a, 0x6a, 0x6a])), false, 'the same ink on the plain ground holds');
  const sheets = [
    sheet('runs-light.png', 'light', [
      pair([0x6a, 0x6a, 0x6a]),
      far,
      pair([0, 0, 0], { ground: [0xc9, 0xc9, 0xc9], grained: true, count: 3 }),
    ]),
    sheet('gate-light.png', 'light', [far, pair([0, 0, 0], { ground: [0xc9, 0xc9, 0xc9], grained: true, state: 'exempt' })]),
  ];
  assert.deepEqual(
    grainedOf(sheets).map((row) => [hex(row.pair.ink), hex(row.pair.ground), row.scheme, row.texts]),
    [
      ['#6a6a6a', '#c9c9c9', 'light', 2],
      ['#000000', '#c9c9c9', 'light', 3],
    ],
    'each measured pair once, least first, with its texts',
  );
  const table = tableOf(sheets);
  assert.match(table, /4 pairs, 2 under the bar \(1 distinct\)/);
  assert.match(table, /4 at a grain's far end \(2 distinct\)\./);
  assert.match(table, /\| 3\.\d\d \| light \| #6a6a6a \| #c9c9c9 \(grain\) \| a line of text \|/);
  assert.match(table, /## On a grain\n\n\| ratio \|[^\n]*\n\|[- |]*\n\| 3\.\d\d \| light \| #6a6a6a \| #c9c9c9 \| 2 \| a line of text \|/);
  assert.match(tableOf([sheet('runs-light.png', 'light', [pair([0, 0, 0])])]), /## On a grain\n\nNone\./);
});

test('the look sets each page’s light picture beside its dark one', () => {
  const html = lookOf(['runs-light.png', 'runs-dark.png', 'gate-open-dark.png']);
  assert.match(html, /<h2>runs<\/h2><div><a href="runs-light\.png">.*<a href="runs-dark\.png">/);
  assert.match(html, /<h2>gate-open<\/h2><div><a href="gate-open-dark\.png">/);
});

const report = (dir: string) =>
  spawnSync(process.execPath, [path.join(import.meta.dirname, 'e2e', 'contrast-report.ts'), dir], { encoding: 'utf8' });

test('the report exits 1 on a folder with a pair under the bar, naming it, 0 on one with none, and 2 on one with no measure', () => {
  const failed = scratch('web-contrast-');
  fs.writeFileSync(
    path.join(failed, 'runs-light.png.contrast.json'),
    JSON.stringify({ scheme: 'light', pairs: [pair([0x77, 0x77, 0x77]), pair([0, 0, 0])] }),
  );
  fs.writeFileSync(path.join(failed, 'runs-light.png'), '');
  const refused = report(failed);
  assert.equal(refused.status, 1, refused.stderr);
  assert.match(refused.stdout, /1 under the bar/);
  assert.match(refused.stdout, /light runs-light\.png: “a line of text” \[text-neutral-500\]/);
  assert.match(fs.readFileSync(path.join(failed, 'contrast.md'), 'utf8'), /\| 4\.47 \| light \| #777777 \| #ffffff \|/);
  assert.match(fs.readFileSync(path.join(failed, 'look.html'), 'utf8'), /<h2>runs<\/h2>/);

  const passed = scratch('web-contrast-');
  fs.writeFileSync(path.join(passed, 'runs-dark.png.contrast.json'), JSON.stringify({ scheme: 'dark', pairs: [pair([0, 0, 0])] }));
  assert.equal(report(passed).status, 0);
  assert.match(fs.readFileSync(path.join(passed, 'contrast.md'), 'utf8'), /0 under the bar/);

  const empty = report(scratch('web-contrast-'));
  assert.equal(empty.status, 2);
  assert.match(empty.stderr, /holds no measure: run npm run e2e -- --photos --contrast/);
});
