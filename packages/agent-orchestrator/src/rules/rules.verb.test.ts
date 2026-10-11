/**
 * `nemia factory rules` (`FACTORY_RULES`): a factory's rules read, written and cleared through the command's handler, and its refusals,
 * each writing nothing — the default factory, a name no factory has, a frontmatter block, blank words, `--file` with `--clear`.
 * `WF_ROOT` is set before the import, since the store reads it as it loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { Args } from '../command/command.ts';
import { scratch } from '../../test/scratch.ts';
import { runOver } from '../../test/placed.ts';

const ROOT = scratch('wf-rules-verb-');
process.env.WF_ROOT = ROOT;
const { FACTORY_RULES, factoryRules } = await import('./rules.verb.ts');
const { addFactory } = await import('../factory/factory.store.ts');
const { runWith: runEngine, gitPlaceLayer, engine } = await import('../runner.ts');
const runWith = runOver(runEngine, gitPlaceLayer);

/** Refused by kind, exit 2, and the message — never `String(err)`, which starts with `Error: `. */
const refusedWith = (tag: 'Conflict' | 'Invalid' | 'Missing', pattern: RegExp) => (err: Error & { exitCode?: number; _tag?: string }) =>
  err._tag === tag && err.exitCode === 2 && pattern.test(err.message);

const FILE = path.join(ROOT, 'factories', 'pipao', 'RULES.md');
addFactory({ name: 'pipao', repos: [fs.mkdtempSync(path.join(ROOT, 'repo-'))] });

/** The command run with `args`, as the CLI and the api run it. */
const run = (args: Args) => runWith(engine(), FACTORY_RULES.handler(args));

test('a factory with no rules reads none; written, they are read back and printed; cleared, they are gone', async () => {
  assert.deepEqual(await run({ factory: 'pipao' }), { name: 'pipao', file: FILE, words: null, error: null });
  assert.match(
    FACTORY_RULES.print(await run({ factory: 'pipao' }), { factory: 'pipao' })[0],
    /^pipao has no rules\. Write them with nemia/,
  );
  const written = await run({ factory: 'pipao', words: 'Never push on a Friday.\n' });
  assert.deepEqual(written, { name: 'pipao', file: FILE, words: 'Never push on a Friday.', error: null });
  assert.match(
    FACTORY_RULES.print(written, { factory: 'pipao', words: 'x' })[0],
    /^pipao: rules written to .*RULES\.md, told to every agent hired into it in every run started from now — a run already started keeps/,
  );
  assert.deepEqual(factoryRules('pipao'), written);
  assert.deepEqual(FACTORY_RULES.print(written, { factory: 'pipao' }), [`pipao: rules kept in ${FILE}`, '', 'Never push on a Friday.']);
  const cleared = await run({ factory: 'pipao', clear: true });
  assert.equal(cleared.removed, true);
  assert.equal(cleared.words, null);
  assert.equal(fs.existsSync(FILE), false);
  assert.equal((await run({ factory: 'pipao', clear: true })).removed, false);
});

test('REFUSED, nothing written: the rules of the default factory, by name, naming the verb', async () => {
  const asked: Args[] = [{ factory: 'default' }, { factory: 'default', words: 'Be kind.' }, { factory: 'default', clear: true }];
  for (const args of asked)
    await assert.rejects(
      run(args),
      refusedWith('Conflict', /^`default` is the default factory: .* so nemia factory rules does not take it\. It keeps no rules/),
    );
  assert.equal(fs.existsSync(path.join(ROOT, 'factories', 'default')), false);
});

test('REFUSED, nothing written: a name no factory has, rules that open with a frontmatter block, and blank rules', async () => {
  await assert.rejects(run({ factory: 'nobody', words: 'Be kind.' }), refusedWith('Missing', /nobody/));
  assert.equal(fs.existsSync(path.join(ROOT, 'factories', 'nobody')), false);
  await assert.rejects(
    run({ factory: 'pipao', words: '---\nmodel: opus\n---\nBe kind.\n' }),
    refusedWith('Invalid', /RULES\.md opens with a frontmatter block, a first line of `---`\. A factory's rules only add words/),
  );
  await assert.rejects(run({ factory: 'pipao', words: '   ' }), refusedWith('Invalid', /^the rules of pipao are blank\./));
  assert.equal(fs.existsSync(FILE), false);
});

test('REFUSED before anything is read: --file with --clear', () => {
  assert.equal(
    FACTORY_RULES.check?.({ factory: 'pipao', file: 'rules.md', clear: true }),
    'nemia factory rules takes --file or --clear, not both: --file writes the rules, --clear removes them.',
  );
  assert.equal(FACTORY_RULES.check?.({ factory: 'pipao', file: 'rules.md' }), null);
  assert.equal(FACTORY_RULES.check?.({ factory: 'pipao' }), null);
});

test('rules that cannot be told are read with why, and printed so', async () => {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, '---\nmodel: opus\n---\n');
  const read = await run({ factory: 'pipao' });
  assert.match(read.error ?? '', /opens with a frontmatter block/);
  assert.match(FACTORY_RULES.print(read, { factory: 'pipao' })[1], /^they cannot be told: /);
  fs.rmSync(FILE);
});
