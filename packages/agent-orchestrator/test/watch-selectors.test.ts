/**
 * `nemia watch` typed whole over a store of its own: `--once` reading from a cursor to the feed's end and printing where it got to, the
 * lines its selectors take, the cursor file it resumes from and writes, and every refusal of what was typed, before a line is read.
 *
 * `WF_ROOT` is set before the import, since the store's modules read it as they load.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from '../place/memory/index.ts';
import { eachTest } from './placed.ts';
import type { RunLine } from '../src/feed/index.ts';
import { heldUnasked } from './unasked.ts';

const ROOT = scratch('wf-watch-selectors-');
process.env.WF_ROOT = ROOT;
const FEED = path.join(ROOT, 'feed.jsonl');
const { main } = await import('../src/cli/main.ts');
const { engineOf } = await import('../src/runtime-client.ts');
const { upgraded } = await import('../src/feed/index.ts');

const stand = eachTest(testPlace);
const engine = eachTest(testEngine);
heldUnasked(engine);

const AT = '2026-10-16T12:00:00.000Z';

/** A step's line of the feed, its labels built field by field, as the tick signs one. */
const step = (run: string, name: string, agent: string, factory: string, word = 'running'): RunLine =>
  upgraded({
    at: AT,
    run,
    step: name,
    word,
    involved: { kind: 'Step', name: `${run}/${name}` },
    labels: { run, factory, workflow: 'build', step: name, agent },
  }) as RunLine;

const LINES: readonly RunLine[] = [
  step('r-1', 'implement', 'ada', 'nemia'),
  step('r-2', 'review', 'agora', 'nemia'),
  step('r-3', 'implement', 'ada', 'pipao'),
];

/** The feed written as `lines`, and its size in bytes. */
function feedOf(lines: readonly RunLine[]): number {
  fs.writeFileSync(FEED, lines.map((l) => `${JSON.stringify(l)}\n`).join(''));
  return fs.statSync(FEED).size;
}

/** What `nemia <argv>` printed on stdout, line by line. */
const printed = async (t: TestContext, argv: string[]): Promise<string[]> => {
  const lines: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => {
    lines.push(args.join(' '));
  });
  try {
    await main(argv, engineOf(engine().layer), undefined, stand().place);
  } finally {
    log.mock.restore();
  }
  return lines.join('\n').split('\n');
};

/** What `nemia <argv>` was refused with, exit 2, before anything was read. */
const refused = async (argv: string[]): Promise<string> => {
  try {
    await main(argv, engineOf(engine().layer), undefined, stand().place);
  } catch (err) {
    assert.equal((err as { exitCode?: number }).exitCode, 2, (err as Error).message);
    return (err as Error).message;
  }
  return assert.fail(`nemia ${argv.join(' ')} was taken`);
};

test('nemia watch --once reads to the feed’s end, prints each line and the cursor, and stops', async (t) => {
  const end = feedOf(LINES);
  const said = await printed(t, ['watch', '--once']);
  assert.equal(said.at(-1), `cursor: ${end}`);
  assert.deepEqual(
    said.slice(0, -1),
    LINES.map((l) => `12:00:00  ${l.run}  ${l.step}  running`),
  );
  const head = Buffer.byteLength(`${JSON.stringify(LINES[0])}\n`);
  assert.deepEqual(await printed(t, ['watch', '--once', String(head)]), [
    '12:00:00  r-2  review  running',
    '12:00:00  r-3  implement  running',
    `cursor: ${end}`,
  ]);
  assert.deepEqual(await printed(t, ['watch', '--once', String(end)]), [`cursor: ${end}`], 'from the end, the cursor alone');
});

test('nemia watch --once -l prints the lines its selectors take, and still ends at the feed’s end', async (t) => {
  const end = feedOf(LINES);
  assert.deepEqual(await printed(t, ['watch', '--once', '-l', 'agent=ada,factory=nemia']), [
    '12:00:00  r-1  implement  running',
    `cursor: ${end}`,
  ]);
  assert.deepEqual(
    await printed(t, ['watch', '--once', '-l', 'agent=agora', '-l', 'factory=pipao']),
    ['12:00:00  r-2  review  running', '12:00:00  r-3  implement  running', `cursor: ${end}`],
    'a line either selector takes',
  );
  assert.deepEqual(
    await printed(t, ['watch', '--once', '-l', 'factory=nowhere']),
    [`cursor: ${end}`],
    'a selector that takes nothing still says where the feed ends, not where its last line did',
  );
});

test('nemia watch --once --json prints the lines and a cursor-only bookmark as its last line', async (t) => {
  const end = feedOf(LINES);
  const said = await printed(t, ['watch', '--once', '--json', '-l', 'kind=Step,agent=ada']);
  assert.deepEqual(JSON.parse(said.at(-1)!), { cursor: end }, 'the bookmark carries the cursor and nothing else');
  assert.deepEqual(
    said.slice(0, -1).map((l) => JSON.parse(l).run),
    ['r-1', 'r-3'],
  );
  assert.equal(
    said.some((l) => !l.startsWith('{')),
    false,
    'stdout holds nothing but JSON',
  );
});

test('nemia watch --once keeps its place in --cursor-file, and a watch given one starts from it', async (t) => {
  const end = feedOf(LINES);
  const file = path.join(ROOT, 'once.cursor');
  fs.rmSync(file, { force: true });
  assert.deepEqual((await printed(t, ['watch', '--once', '--cursor-file', file])).at(-1), `cursor: ${end}`);
  assert.equal(fs.readFileSync(file, 'utf8'), `${end}\n`);
  assert.deepEqual(
    await printed(t, ['watch', '--once', '--cursor-file', file]),
    [`cursor: ${end}`],
    'the second read starts where the file says, and reads nothing twice',
  );
  const more = feedOf([...LINES, step('r-4', 'land', 'otto', 'nemia')]);
  fs.writeFileSync(file, `${end}\n`);
  assert.deepEqual(await printed(t, ['watch', '--once', '--cursor-file', file]), ['12:00:00  r-4  land  running', `cursor: ${more}`]);
  assert.equal(fs.readFileSync(file, 'utf8'), `${more}\n`);
});

test('a cursor file the feed cannot be read from starts the watch over, says why once, and keeps 0', async (t) => {
  const end = feedOf(LINES);
  const file = path.join(ROOT, 'stale.cursor');
  fs.writeFileSync(file, `${end + 900}\n`);
  const said: string[] = [];
  const err: string[] = [];
  const log = t.mock.method(console, 'log', (...a: unknown[]) => said.push(a.join(' ')));
  const wrote = t.mock.method(console, 'error', (...a: unknown[]) => err.push(a.join(' ')));
  try {
    await main(['watch', '--once', '--cursor-file', file], engineOf(engine().layer), undefined, stand().place);
  } finally {
    log.mock.restore();
    wrote.mock.restore();
  }
  assert.equal(said.at(-1), `cursor: ${end}`, 'it read the feed there is now, from its start');
  assert.equal(said.length, LINES.length + 1, 'every line of it');
  assert.equal(err.length, 1, 'said once');
  assert.match(err[0], new RegExp(`^nemia watch: ${file.replaceAll('.', '\\.')} held cursor ${end + 900}, which the feed cannot be read`));
  assert.match(err[0], /a line said before may be said again\.$/);
  assert.equal(fs.readFileSync(file, 'utf8'), `${end}\n`, 'and it kept its place, as any watch does');
});

test('REFUSED: every malformed selector, a cursor beside a cursor file, and a cursor file in no directory — before a line is read', async (t) => {
  const end = feedOf(LINES);
  const log = t.mock.method(console, 'log', () => {});
  try {
    assert.match(await refused(['watch', '--once', '-l', 'message=hi']), /^"message" is no key of a feed line/);
    assert.match(await refused(['watch', '-l', 'factory==nemia']), /^"factory==nemia" compares with ==/);
    assert.match(await refused(['watch', '--once', '-l', 'factory in nemia']), /names a list and spells it with no \(values\) after in/);
    assert.match(await refused(['watch', '--once', '-l', '']), /^"" is no selector: it holds no clause/);
    assert.match(
      await refused(['watch', String(end), '--cursor-file', path.join(ROOT, 'x.cursor')]),
      /^nemia watch takes a cursor or --cursor-file, not both/,
    );
    assert.match(
      await refused(['watch', '--once', '--cursor-file', path.join(ROOT, 'nope', 'x.cursor')]),
      /is no directory, so .* cannot be written: make it/,
    );
    assert.match(await refused(['watch', '--once', '-L']), /^nemia watch does not take -L: nemia watch \[cursor\]/);
    assert.equal(log.mock.callCount(), 0, 'nothing was printed: each was refused before a line was read');
  } finally {
    log.mock.restore();
  }
});

test('REFUSED: a cursor file that holds no whole number, named, and the feed never read from its start instead', async (t) => {
  feedOf(LINES);
  const file = path.join(ROOT, 'junk.cursor');
  fs.writeFileSync(file, 'nineteen\n');
  const log = t.mock.method(console, 'log', () => {});
  try {
    assert.match(await refused(['watch', '--once', '--cursor-file', file]), /is no cursor file: it holds "nineteen"/);
    assert.equal(log.mock.callCount(), 0);
  } finally {
    log.mock.restore();
  }
});
