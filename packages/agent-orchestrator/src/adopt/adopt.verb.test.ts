/**
 * A hand-made factory taken over in place by a template, told as one person's story on the stage (`test/story.ts`) over a scratch
 * store: a factory made by hand with a repository, a schedule, an instruction, a key a later nemia wrote, a card filed for its workflow
 * and a run in flight. `nemia factory diff --template` previews the takeover and writes nothing; `nemia factory adopt --plan` writes it;
 * the card then starts on the tree; the run in flight keeps its record; the controller's next pass finds the factory applied; and a
 * takeover stopped between its writes is finished by the next. Then what `nemia factory adopt` refuses, each with nothing written.
 * `WF_ROOT` is set before `src` is imported, which reads it as it loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from '../../test/scratch.ts';
import { staged, story } from '../../test/story.ts';
import { teamCopy } from '../../test/team.ts';

const ROOT = scratch('wf-adopt-');
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
const FACTORIES = path.join(ROOT, 'factories');
const INBOX = path.join(ROOT, 'inbox');
const { templated: programsAt } = await import('../../test/templated.ts');
const { exportTemplate, reconciled } = programsAt(ROOT);
const { readFactory } = await import('../runner.ts');
const { appliedDir, treeDir } = await import('../applied/applied.store.ts');
const { readRun } = await import('../record/record.store.ts');
const { advanceRun, startRun } = await import('../runner.ts');
const { main } = await import('../cli/main.ts');
const { engineOf, runWith } = await import('../runtime-client.ts');
const stage = staged({ runWith, main, engineOf });

/** Every file under `dir`, by its path in it, with its bytes, so a verb is seen to have written nothing there. */
const bytesUnder = (dir: string): Record<string, string> =>
  fs.existsSync(dir)
    ? Object.fromEntries(
        (fs.readdirSync(dir, { recursive: true }) as string[])
          .filter((f) => fs.statSync(path.join(dir, f)).isFile())
          .sort()
          .map((f) => [f, fs.readFileSync(path.join(dir, f), 'base64')]),
      )
    : {};

/** What `argv` printed, as `nemia` prints it, line by line. */
async function printedBy(t: { mock: { method: Function } }, ...argv: string[]): Promise<string[]> {
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...words: unknown[]) => printed.push(words.join(' ')));
  try {
    await stage.main(argv);
  } finally {
    log.mock.restore();
  }
  return printed.flatMap((p) => p.split('\n'));
}

/** Refused by kind and exit 2, its message matching each of `patterns`. */
const refusedWith =
  (tag: 'Missing' | 'Conflict' | 'Invalid', ...patterns: RegExp[]) =>
  (err: Error & { exitCode?: number; _tag?: string }) =>
    err._tag === tag && err.exitCode === 2 && patterns.every((pattern) => pattern.test(err.message));

/** The digest the plan `printed` carries. */
const digestIn = (printed: readonly string[]): string => {
  const line = printed.find((l) => l.startsWith('plan: '));
  assert.ok(line, printed.join('\n'));
  return line.slice('plan: '.length);
};

/** The file of the factory `name`, as JSON. */
const fileOf = (name: string): Record<string, unknown> =>
  JSON.parse(fs.readFileSync(path.join(FACTORIES, `${name}.json`), 'utf8')) as Record<string, unknown>;

/** A repository holding the tests' team as its `workflows/`, in one commit, and the team exported from it as a template. */
function repoAndTemplate(): { repo: string; dir: string } {
  const repo = scratch('wf-adopt-repo-');
  fs.renameSync(teamCopy(), path.join(repo, 'workflows'));
  stage.place().world.repository(repo, {});
  stage.place().world.commit(repo, 'base');
  const dir = path.join(scratch('wf-adopt-template-'), 'team');
  exportTemplate({ dir, from: repo });
  return { repo, dir };
}

/** A hand-made factory `name` on `repo`, offering the team's `dev`. */
async function madeByHand(t: { mock: { method: Function } }, name: string, repo: string): Promise<void> {
  await printedBy(t, 'factory', 'add', name, '--repo', repo, '--no-trust');
  await printedBy(t, 'factory', 'attach', name, 'dev');
}

/**
 * A run of `factory` that finished, as an intake's does: its one step signed off, no commit landed. Started on a folder of its own,
 * its record then naming `factory`, as a run started there names it.
 */
async function aFinished(repo: string, factory: string): Promise<string> {
  const steps = scratch('wf-adopt-once-');
  fs.writeFileSync(path.join(steps, 'work.md'), '---\nplace: git\n---\nname it\n');
  const board = stage.board();
  const { id } = await stage.runPlaced(startRun({ brief: 'Name it', repo, workflowDir: steps, isolate: false }));
  const file = path.join(ROOT, 'runs', `${id}.json`);
  fs.writeFileSync(file, `${JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf8')), factory }, null, 2)}\n`);
  await stage.runWith(board.e, advanceRun(readRun(id)));
  board.settle(`${id}-work`, 'succeeded', { outcome: 'done', summary: 'named it', artifacts: [], needs: null });
  await stage.runWith(board.e, advanceRun(readRun(id)));
  return id;
}

/** A card filed for the factory `factory` and the workflow `workflow`, by its file in the inbox. */
function card(name: string, factory: string, workflow: string): string {
  fs.mkdirSync(INBOX, { recursive: true });
  const file = path.join(INBOX, `${name}.md`);
  fs.writeFileSync(file, `---\nworkflow: ${workflow}\nfactory: ${factory}\n---\n\nCache the views.\n`);
  return file;
}

test('a hand-made factory taken over by a template: previewed, written, its card started, its run kept, then applied', async (t) => {
  const s = story(t);
  let repo = '';
  let dir = '';
  let run = '';
  let finished = '';
  let digest = '';
  let cardFile = '';
  let runBefore = '';

  await s.test(
    'a factory made by hand: a repository, a schedule, an instruction, a later key, a filed card, a run in flight and one finished',
    async (t) => {
      ({ repo, dir } = repoAndTemplate());
      await madeByHand(t, 'crew', repo);
      await printedBy(t, 'factory', 'schedule', 'crew', 'dev', '--cron', '0 9 * * *', '--brief', 'Look at the views');
      await printedBy(t, 'factory', 'instruction', 'crew', '--store');
      fs.writeFileSync(path.join(FACTORIES, 'crew.json'), `${JSON.stringify({ ...fileOf('crew'), later: { kept: true } }, null, 2)}\n`);
      run = (await printedBy(t, 'start', 'Cache the views', '--factory', 'crew', '--workflows', 'dev'))[0].split(' ')[0];
      runBefore = JSON.stringify(readRun(run));
      finished = await aFinished(repo, 'crew');
      cardFile = card('views', 'crew', 'dev');
    },
  );

  await s.test('nemia factory diff --template previews the takeover, prints its digest, and writes nothing', async (t) => {
    const before = bytesUnder(ROOT);
    const printed = await printedBy(t, 'factory', 'diff', 'crew', '--template', dir);
    assert.deepEqual(bytesUnder(ROOT), before, 'the preview writes nothing');
    assert.equal(fs.existsSync(appliedDir('crew')), false);
    assert.equal(fs.existsSync(treeDir('crew')), false);
    const runs = printed.find((l) => l.startsWith('runs waiting or in flight: '));
    assert.ok(runs, printed.join('\n'));
    assert.ok(runs.includes(run), `it names the run in flight: ${runs}`);
    assert.equal(runs.includes(finished), false, 'it leaves off the run that finished');
    digest = digestIn(printed);
    assert.ok(
      printed.some((l) => l.includes(`nemia factory adopt crew --template ${dir} --plan ${digest}`)),
      printed.join('\n'),
    );
  });

  await s.test('nemia factory adopt --plan stages the render and gives the file the template, every other key kept', async (t) => {
    await printedBy(t, 'factory', 'adopt', 'crew', '--template', dir, '--plan', digest);
    const file = fileOf('crew');
    const template = file.template as { source: string; version: string; params: Record<string, unknown> };
    assert.equal(template.source, dir);
    assert.deepEqual(template.params, {});
    assert.deepEqual(file.repos, [repo]);
    assert.deepEqual(Object.keys(file.schedules as object), ['dev']);
    assert.deepEqual(file.instruction, { store: true });
    assert.deepEqual(file.later, { kept: true });
    assert.deepEqual(file.workflows, ['dev'], 'the hand-made wiring is kept in the file, unread');
    assert.deepEqual(bytesUnder(appliedDir('crew')), bytesUnder(treeDir('crew')), 'the base and the tree are the render');
    const read = readFactory('crew');
    assert.equal(read.tree, treeDir('crew'));
    assert.ok(read.workflows.includes('dev'), "it reads the tree's wiring");
  });

  await s.test('the card filed before the takeover starts, on the workflow in the tree', async (t) => {
    const started = (await printedBy(t, 'start', cardFile))[0].split(' ')[0];
    assert.ok(readRun(started).workflowDir.startsWith(treeDir('crew')), readRun(started).workflowDir);
  });

  await s.test('the run in flight keeps its record as it was: its workflow folder and its frozen steps', () => {
    assert.equal(JSON.stringify(readRun(run)), runBefore);
  });

  await s.test("the controller's next pass finds it applied, with no upgrade under way", () => {
    const status = reconciled(readFactory('crew') as Parameters<typeof reconciled>[0]);
    assert.deepEqual(
      status.conditions.map((c) => [c.type, c.status, c.reason]),
      [
        ['Applied', 'True', 'Rendered'],
        ['ConflictsPending', 'False', 'NoUpgrade'],
      ],
    );
  });

  await s.test('a takeover stopped after staging, before the file, is finished by the next', async (t) => {
    const { template: _gone, ...rest } = fileOf('crew');
    fs.writeFileSync(path.join(FACTORIES, 'crew.json'), `${JSON.stringify(rest, null, 2)}\n`);
    const again = digestIn(await printedBy(t, 'factory', 'diff', 'crew', '--template', dir));
    await printedBy(t, 'factory', 'adopt', 'crew', '--template', dir, '--plan', again);
    assert.equal((fileOf('crew').template as { source: string }).source, dir);
  });
});

test('what nemia factory adopt refuses, each with nothing written', async (t) => {
  const { repo, dir } = repoAndTemplate();
  const nothingWritten = async (argv: string[], refused: (err: Error) => boolean) => {
    const before = bytesUnder(ROOT);
    await assert.rejects(stage.main(argv), refused);
    assert.deepEqual(bytesUnder(ROOT), before, `${argv.join(' ')} wrote nothing`);
  };
  const planOf = async (t: { mock: { method: Function } }, name: string) =>
    digestIn(await printedBy(t, 'factory', 'diff', name, '--template', dir));

  await t.test('no --plan: Invalid, naming the preview', async (t) => {
    await madeByHand(t, 'noplan', repo);
    await nothingWritten(['factory', 'adopt', 'noplan', '--template', dir], refusedWith('Invalid', /nemia factory diff noplan/));
  });

  await t.test("a plan gone stale since the factory's file changed: Conflict, naming the preview again", async (t) => {
    await madeByHand(t, 'stale', repo);
    const plan = await planOf(t, 'stale');
    await printedBy(t, 'factory', 'revisions', 'stale', 'follow');
    await nothingWritten(
      ['factory', 'adopt', 'stale', '--template', dir, '--plan', plan],
      refusedWith('Conflict', /nemia factory diff stale/),
    );
  });

  await t.test('a factory made from a template already: Conflict, naming the upgrade', async (t) => {
    await printedBy(t, 'factory', 'apply', 'made', '--template', dir, '--repo', repo, '--no-trust');
    await nothingWritten(
      ['factory', 'adopt', 'made', '--template', dir, '--plan', 'sha256:0'],
      refusedWith('Conflict', /nemia factory upgrade made/),
    );
  });

  await t.test('the default factory: Conflict', async () => {
    await nothingWritten(['factory', 'adopt', 'default', '--template', dir, '--plan', 'sha256:0'], refusedWith('Conflict', /default/));
  });

  await t.test('no such factory: Missing, naming those there are', async () => {
    await nothingWritten(['factory', 'adopt', 'nowhere', '--template', dir, '--plan', 'sha256:0'], refusedWith('Missing', /noplan/));
  });

  await t.test('a card filed and not started for a workflow the template does not offer: Conflict, naming it', async (t) => {
    await madeByHand(t, 'carded', repo);
    await printedBy(t, 'factory', 'attach', 'carded', 'gone');
    card('lost', 'carded', 'gone');
    const plan = await planOf(t, 'carded');
    await nothingWritten(['factory', 'adopt', 'carded', '--template', dir, '--plan', plan], refusedWith('Conflict', /lost/, /gone/));
    fs.rmSync(path.join(INBOX, 'lost.md'));
  });

  await t.test('a schedule of a workflow the template does not offer: Conflict, naming the unschedule', async (t) => {
    await madeByHand(t, 'timed', repo);
    await printedBy(t, 'factory', 'attach', 'timed', 'gone');
    await printedBy(t, 'factory', 'schedule', 'timed', 'gone', '--cron', '0 9 * * *', '--brief', 'b');
    const plan = await planOf(t, 'timed');
    await nothingWritten(
      ['factory', 'adopt', 'timed', '--template', dir, '--plan', plan],
      refusedWith('Conflict', /nemia factory unschedule timed gone/),
    );
  });

  await t.test('a tree already there with other bytes: Conflict, naming the folder', async (t) => {
    await madeByHand(t, 'leftover', repo);
    fs.mkdirSync(path.join(FACTORIES, 'leftover', 'tree'), { recursive: true });
    fs.writeFileSync(path.join(FACTORIES, 'leftover', 'tree', 'mine.md'), 'mine\n');
    const plan = await planOf(t, 'leftover');
    await nothingWritten(
      ['factory', 'adopt', 'leftover', '--template', dir, '--plan', plan],
      refusedWith('Conflict', /factories\/leftover\/tree/),
    );
  });

  await t.test('a template that does not pass its check: Invalid', async (t) => {
    await madeByHand(t, 'broken', repo);
    const bad = path.join(scratch('wf-adopt-bad-'), 'bad');
    fs.mkdirSync(bad);
    await nothingWritten(['factory', 'adopt', 'broken', '--template', bad, '--plan', 'sha256:0'], refusedWith('Invalid'));
  });

  await t.test('a --set of a parameter the template does not declare: Invalid, naming it', async (t) => {
    await madeByHand(t, 'unset', repo);
    await nothingWritten(
      ['factory', 'adopt', 'unset', '--template', dir, '--set', 'nothing=1', '--plan', 'sha256:0'],
      refusedWith('Invalid', /nothing/),
    );
  });
});

const { FACTORY_PLAN } = await import('../upgrade/upgrade.verb.ts');
const { FACTORY_ADOPT } = await import('./adopt.verb.ts');
const { withBuiltins } = await import('../../test/templated.ts');

test('--template names a builtin template by its name: the takeover records the name, and a name no builtin has is refused', async (t) => {
  const { repo, dir } = repoAndTemplate();
  const builtins = scratch('wf-adopt-builtins-');
  fs.cpSync(dir, path.join(builtins, 'team'), { recursive: true });
  await madeByHand(t, 'named', repo);
  const handled = <D extends object>(command: { handler: (...a: never[]) => unknown }, args: Record<string, unknown>) =>
    stage.runWith(stage.board().e, withBuiltins((command.handler as Function)(args, undefined, ROOT), builtins)) as Promise<D>;

  await t.test('REFUSED Missing, nothing written: a preview and a takeover by a name no builtin template has', async () => {
    const before = bytesUnder(ROOT);
    await assert.rejects(handled(FACTORY_PLAN, { factory: 'named', template: 'nope' }), refusedWith('Missing', /\bteam\b/, /\.\/nope/));
    await assert.rejects(
      handled(FACTORY_ADOPT, { factory: 'named', template: 'nope', plan: 'sha256:0' }),
      refusedWith('Missing', /\bteam\b/, /\.\/nope/),
    );
    assert.deepEqual(bytesUnder(ROOT), before);
  });

  await t.test("a factory taken over by --template <name> records the name, and the controller's pass finds it applied", async () => {
    const preview = await handled<{ digest: string; line: string }>(FACTORY_PLAN, { factory: 'named', template: 'team' });
    assert.ok(preview.line.includes('--template team '), preview.line);
    await handled(FACTORY_ADOPT, { factory: 'named', template: 'team', plan: preview.digest });
    assert.equal((fileOf('named').template as { source: string }).source, 'team');
    const status = programsAt(ROOT, builtins).reconciled(readFactory('named') as Parameters<typeof reconciled>[0]);
    assert.equal(status.conditions[0]?.reason, 'Rendered');
  });
});
