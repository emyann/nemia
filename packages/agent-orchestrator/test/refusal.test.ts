/**
 * The orchestrator's refusals (`src/refusal/refusal.ts`): `Missing`, `Conflict` and `Invalid`, each an `Error` with its words and
 * `exitCode` 2, tagged so an Effect picks it out by kind, and `isRefusal`, which tells one from any other error. What loads them is held
 * too: `agent-orchestrator/run` and `agent-orchestrator/workflow`, which the api loads, take `effect/Data`
 * and never the `effect` barrel, pinned by the modules a fresh `node` loads for each; and no file under `src` sets `exitCode: 2` on an
 * object of its own, so a refusal is thrown as one of the classes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Effect } from 'effect';
import { scratch } from './scratch.ts';

process.env.WF_ROOT = scratch('wf-refusal-store-');
const { Conflict, Invalid, Missing, isRefusal, maxRuns, unhold } = await import('../src/runner.ts');
const { WorkflowError } = await import('../src/workflow.ts');

const PKG = path.join(import.meta.dirname, '..');

/** Each refusal, by its row: what it is thrown as, and the exit code it carries — 2 for every kind. */
const KINDS = [
  ['Missing', () => new Missing({ message: 'the Missing words' }), 'Missing'],
  ['Conflict', () => new Conflict({ message: 'the Conflict words' }), 'Conflict'],
  ['Invalid', () => new Invalid({ message: 'the Invalid words' }), 'Invalid'],
  ["a workflow's refusal is Invalid", () => new WorkflowError('a step is wrong'), 'Invalid'],
  ['a Conflict with the steps that hold what is asked of', () => new Conflict({ message: 'held', users: ['dev/review'] }), 'Conflict'],
] as const;

test('each refusal is an Error of its kind with its words and exit code 2, an Effect catches it by its tag, and isRefusal takes it', async (t) => {
  for (const [row, made, tag] of KINDS)
    await t.test(row, async () => {
      const err = made();
      assert.ok(err instanceof Error);
      assert.ok(err.message.length > 0);
      assert.equal(err._tag, tag);
      assert.equal(err.exitCode, 2);
      assert.equal(isRefusal(err), true);
      if (tag === 'Invalid') assert.ok(err instanceof Invalid, 'a subclass of a kind is that kind');
      assert.equal(await Effect.runPromise(Effect.flip(Effect.fail(err))), err, 'an Effect fails with the refusal itself');
      const caught = await Effect.runPromise(
        Effect.fail(err).pipe(
          Effect.catchTag(tag, (e) => Effect.succeed(`${e._tag} ${e.exitCode}`)),
          Effect.catch(() => Effect.succeed('caught by no tag')),
        ),
      );
      assert.equal(caught, `${tag} 2`);
    });
  await t.test('a Conflict carries the steps that hold what is asked of, when that is why, and none otherwise', () => {
    assert.deepEqual(new Conflict({ message: 'held', users: ['dev/review'] }).users, ['dev/review']);
    const bare = new Conflict({ message: 'the step is still running.' });
    assert.equal(bare.users, undefined);
    assert.equal(Object.hasOwn(bare, 'users'), false, 'no key for none, so its answer is `{ error }` alone');
  });
  await t.test('REFUSED by isRefusal: a plain Error carrying exitCode 2, an object shaped like one, and what is no Error', () => {
    assert.equal(isRefusal(Object.assign(new Error('by hand'), { exitCode: 2 })), false, 'an exit code alone is no kind');
    assert.equal(isRefusal({ _tag: 'Missing', message: 'a look-alike', exitCode: 2 }), false);
    assert.equal(isRefusal(undefined), false);
  });
  const thrown = async (made: () => unknown): Promise<unknown> => {
    try {
      return await made();
    } catch (err) {
      return err;
    }
  };
  for (const [row, made, Kind, fixes] of [
    ['unhold of no run id', () => Effect.runPromise(unhold('Not An Id')), Invalid, ['"Not An Id"', "a run's id"]],
    ['unhold of a run the store has not', () => Effect.runPromise(unhold('r-nope')), Missing, ['r-nope', 'nemia hold <runId> --off']],
    ['WF_MAX_RUNS that is no count', () => maxRuns({ WF_MAX_RUNS: 'two' }), Invalid, ['WF_MAX_RUNS=two', 'not a count']],
  ] as const)
    await t.test(`REFUSED: a verb throws the kind of what it refuses — ${row}`, async () => {
      const err = await thrown(made);
      assert.ok(err instanceof Kind, String(err));
      assert.equal(err.exitCode, 2);
      for (const fix of fixes) assert.ok(err.message.includes(fix), `${err.message} names ${fix}`);
    });
});

/**
 * The modules a fresh `node`, in the package, loads for `entry` and then for each of `more`, by URL: counted by a `registerHooks` load
 * hook, so a module is counted once however many import it.
 */
function modulesLoaded(entry: string, more: readonly string[] = []): string[] {
  const program = [
    "import { registerHooks } from 'node:module';",
    'const seen = [];',
    'registerHooks({ load(url, context, nextLoad) { seen.push(url); return nextLoad(url, context); } });',
    ...[entry, ...more].map((m) => `await import(${JSON.stringify(m)});`),
    'process.stdout.write(JSON.stringify(seen));',
  ].join('\n');
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', program], {
    cwd: PKG,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 60_000,
  });
  return JSON.parse(out) as string[];
}

/**
 * The modules each entry the api loads is pinned to: its own files, the runtime's vocabulary door's and `effect/Data`'s, measured on the
 * pinned `effect`.
 *
 * `agent-orchestrator/workflow` is 54 rather than 52 since `stepSetRefusal` reads `LINE_NAME`, the name a run's own line of work is cut
 * under, from `workspace/workspace.ts`: two pure modules more, that file and `record/record.ts`, and no file that touches a disk.
 *
 * Each is 77 more since the frontmatter is YAML: `frontmatter/frontmatter.ts`, the one reader every step, agent and card goes through,
 * and the 76 modules of the `yaml` package it parses with, none of which touches a disk.
 *
 * `agent-orchestrator/run` is one more for `former-reason/former-reason.ts`, the pure reading of the feed's former reason codes, kept in
 * a folder of its own so the card that drops them deletes it whole.
 */
const PINNED_MODULES: Record<string, { all: number; effect: number }> = {
  'agent-orchestrator/run': { all: 178, effect: 15 },
  'agent-orchestrator/workflow': { all: 132, effect: 15 },
};

const isEffectModule = (url: string): boolean => url.includes('/node_modules/effect/');

/** Why what `entry` loaded is not what it is pinned to, or nothing. */
function loadBreaks(entry: string, loaded: readonly string[]): string[] {
  const pinned = PINNED_MODULES[entry];
  const out: string[] = [];
  const barrel = loaded.filter((url) => url.endsWith('/node_modules/effect/dist/index.js'));
  if (barrel.length)
    out.push(
      `${entry} loads the effect barrel: a pure file imports from 'effect/Data' alone (src/refusal/refusal.ts), never from 'effect'`,
    );
  const effect = loaded.filter(isEffectModule).length;
  if (effect !== pinned.effect)
    out.push(
      `${entry} loads ${effect} modules of effect, and is pinned to ${pinned.effect}, effect/Data's: a pure file imports from 'effect/Data' alone; an upgrade of effect is re-measured here`,
    );
  if (loaded.length !== pinned.all)
    out.push(
      `${entry} loads ${loaded.length} modules, and is pinned to ${pinned.all}: a pure import added on purpose is re-pinned in PINNED_MODULES in test/refusal.test.ts, after reading what it loads`,
    );
  return out;
}

test('agent-orchestrator/run and agent-orchestrator/workflow load effect/Data, and no more of effect, as pinned', () => {
  for (const entry of Object.keys(PINNED_MODULES)) {
    const loaded = modulesLoaded(entry);
    assert.deepEqual(loadBreaks(entry, loaded), [], loaded.join('\n'));
    assert.ok(
      loaded.some((url) => url.endsWith('/node_modules/effect/dist/Data.js')),
      `${entry} loads effect/Data`,
    );
  }
});

test('REFUSED: an entry that loads the effect barrel besides', () => {
  const breaks = loadBreaks('agent-orchestrator/run', modulesLoaded('agent-orchestrator/run', ['effect']));
  assert.equal(breaks.length, 3, breaks.join('\n'));
  assert.match(breaks[0], /loads the effect barrel/);
});

/** Each place in `texts`, by file and line, that sets `exitCode: 2` on an object: a refusal thrown as other than one of the classes. */
function untaggedRefusals(texts: Record<string, string>): string[] {
  return Object.entries(texts).flatMap(([file, text]) =>
    [...text.matchAll(/\bexitCode\s*:\s*2\b/g)].map(
      (m) =>
        `${file}:${text.slice(0, m.index).split('\n').length} sets exitCode: 2 by hand: throw new Missing, Conflict or Invalid ({ message }) from src/refusal/refusal.ts`,
    ),
  );
}

test('REFUSED: a refusal that sets exitCode: 2 by hand, on one line or across several; an exit code read or chosen is let through', () => {
  const planted = {
    'src/one.ts': 'throw Object.assign(new Error(words), { exitCode: 2 });',
    'src/two.ts': ['const a = 1;', 'throw Object.assign(', '  new Error(words),', '  {', '    exitCode:', '      2,', '  },', ');'].join(
      '\n',
    ),
    'src/read.ts': [
      'if ((err as { exitCode?: number }).exitCode === 2) return;',
      'throw Object.assign(new Error(words), { exitCode: failed ? 1 : 2 });',
      'throw Object.assign(new Error(words), { exitCode: 1 });',
      'throw Object.assign(new Error(words), { exitCode: 20 });',
    ].join('\n'),
  };
  assert.deepEqual(
    untaggedRefusals(planted).map((line) => line.split(' ')[0]),
    ['src/one.ts:1', 'src/two.ts:5'],
  );
});

test('no file under src sets exitCode: 2 by hand: each refusal is thrown as Missing, Conflict or Invalid', () => {
  const files = fs
    .readdirSync(path.join(PKG, 'src'), { recursive: true, encoding: 'utf8' })
    .map((f) => `src/${f.split(path.sep).join('/')}`)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
  assert.ok(files.includes('src/cancel/cancel.verb.ts') && files.includes('src/refusal/refusal.ts'), 'the walk reads src');
  assert.deepEqual(untaggedRefusals(Object.fromEntries(files.map((f) => [f, fs.readFileSync(path.join(PKG, f), 'utf8')]))), []);
});
