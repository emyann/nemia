/**
 * The inbox on disk: `$WF_ROOT/inbox/`, filed, listed, started and dropped through the verbs, as a person types them — one story on
 * `story(t)`, and a table of what each verb refuses (`nemia inbox add` and `rm`, and `nemia start` of a card). Kept focused: a queued card
 * whose `queued:` line cannot be taken off at its start, or that is gone before it is, and a warm read of the inbox. A queued card the tick
 * starts is the story of `test/queue-store.test.ts`.
 *
 * What a card is and what the listing says are pure, and live in inbox.test.ts. This is the part that is not: the folder, the name a card
 * is filed under, and the run records a listing reads. Its store is at `ROOT`, given as `ENV` with
 * `WF_VERIFY_REST=0`: nothing here ticks, and a warm read counted under `1` reads every record afresh to verify it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Schema } from 'effect';
import type { Run } from '../record/record.ts';
import { scratch } from 'test-kit/scratch';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from '../../place/memory/index.ts';
import { eachTest, runGiven, runOver } from '../../test/placed.ts';
import { heldUnasked } from '../../test/unasked.ts';
import { story } from '../../test/story.ts';
import { decisionOf } from '../../test/screens.ts';
import { runLines } from '../object/lines.verb.ts';
import type { StoreRoot as StoreRootNeeded } from '../config/root.store.ts';
import { inboxDir, parseArgv, START, startedLines, StartInput, startRun, startFromInbox, StoreRoot } from '../runner.ts';
import type { Started } from '../start/commands.verb.ts';
import * as verbs from '../runner.ts';
import { runRecord } from '../record/record.store.ts';
import { informerMemo } from '../rest/informer.verb.ts';
import { INBOX as INBOX_LIST, INBOX_ADD, type InboxAddInput } from './commands.verb.ts';
import { inboxLines, type InboxListing } from './inbox.ts';
import { handled, typed } from '../../test/typed.ts';
import { runWith as runEngine } from '../runtime-client.ts';
import { main as cli } from '../cli/main.ts';
import { engineOf } from '../runtime-client.ts';
import type { Env } from '../config/config.store.ts';
import { filesStoreAt } from '../record/files.store.ts';
import { addFactoryAt, attachWorkflowAt } from '../factory/factory.store.ts';

const ROOT = scratch('wf-inbox-');
const INBOX = path.join(ROOT, 'inbox');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });

const ENV: Env = { ...process.env, WF_ROOT: ROOT, WF_VERIFY_REST: '0', WF_MAX_CONCURRENT: undefined, WF_MAX_RUNS: undefined };
/** An inbox verb run at this test's store root, as `nemia` gives it one: its answer, or its refusal thrown. */
const atRoot = <A, E>(program: Effect.Effect<A, E, StoreRootNeeded>): A => Effect.runSync(Effect.provideService(program, StoreRoot, ROOT));
const addToInbox = (opts: Parameters<typeof verbs.addToInbox>[0]) => atRoot(verbs.addToInbox(opts));
const readInbox = () => atRoot(verbs.readInbox());
const dropFromInbox = (name: string) => atRoot(verbs.dropFromInbox(name));
const stand = eachTest(testPlace);
const runPlaced = runGiven(() => stand().layer, ENV);
const filed = filesStoreAt(ROOT);
const runWith = runOver(runEngine, () => stand().layer, ENV);
/**
 * `nemia`, as a person types it, its commands given this test's place: `start` run on its entry's handler (`typed`), a card of the
 * inbox named by its file or its name sent as the card it is (`card`), as the client sends a card it names, and its lines said as the
 * client says them (`startedLines`); `decide`, the old path's screen.
 */
const main = async (argv: string[], e?: Parameters<typeof cli>[1]): Promise<void> => {
  if (argv[0] !== 'start') return cli(argv, e, undefined, stand().place, ENV);
  const [, given = '', ...rest] = argv;
  const named = !given.includes('/') && fs.existsSync(path.join(INBOX, given.endsWith('.md') ? given : `${given}.md`));
  const inInbox = named ? given : path.relative(INBOX, path.resolve(given));
  const data =
    !inInbox.startsWith('..') && !path.isAbsolute(inInbox)
      ? await handled(
          START,
          { card: inInbox.replace(/\.md$/, ''), at: process.cwd(), ...startFlags(rest) },
          { ...(e && { e }), place: stand().place, env: ENV },
        )
      : await typed(['start', given, ...rest], e, undefined, stand().place, ENV);
  for (const line of startedLines(data as Started)) console.log(line);
};

/** The flags of a `start` read by its words, beside a card's name: what the handler takes of them (`--brief` its `instead`, a file's
 * text where it names one here, as the client reads it; `--repo`). */
const startFlags = (rest: readonly string[]): StartInput => {
  const args = parseArgv(START.spec, ['card', ...rest]) ?? {};
  const { brief: _card, instead, ...flags } = Schema.decodeUnknownSync(StartInput)(args);
  if (instead === undefined) return flags;
  return { ...flags, instead: fs.existsSync(instead) && fs.statSync(instead).isFile() ? fs.readFileSync(instead, 'utf8') : instead };
};

const engine = eachTest(testEngine);
heldUnasked(engine);

/** The engine of this test: the stand-in, which no command here files on, stops, says to or forgets from (`heldUnasked`). */
const noEngine = () => engineOf(engine().layer);

/** A store verb typed, run on its entry's handler as the api calls it (`typed`): its data, or its refusal thrown. */
const verb = (...argv: string[]) => typed(argv, noEngine(), undefined, stand().place, ENV);

/**
 * `nemia inbox add` as the api calls its handler: the idea's text and the card's keys, as the client sends them — a file read where it is
 * typed and its text sent, `--repo` resolved from where it is typed.
 */
const added = (input: InboxAddInput) => handled(INBOX_ADD, input, { e: noEngine(), place: stand().place, env: ENV });

/** The lines `nemia inbox` makes of its cards (`inboxLines`), read through its entry (`typed`), `-l`, `--show-labels` and `-L` as given. */
const listedLines = async (argv: readonly string[] = [], show: { showLabels?: boolean; columns?: string[] } = {}): Promise<string[]> => {
  const { cards, defaultStarts } = (await verb('inbox', ...argv)) as { cards: InboxListing[]; defaultStarts: boolean };
  return inboxLines(cards, defaultStarts, show);
};

/** Every card as `nemia inbox --all` lists it, with its state, read through `memo` where one is given, as the api keeps one. */
const judgedInbox = async (memo = informerMemo()) => (await runWith(noEngine(), INBOX_LIST.handler({ all: true }, { runs: memo }))).cards;

/**
 * Refused by kind and exit 2, its message naming each of `named` — the command, flag or field its fix names, and the card or path it is
 * about — never its sentence, which is nobody's to check. Read off the message, never `String(err)`, which starts with `Error: `.
 */
const refusedWith =
  (tag: 'Missing' | 'Conflict' | 'Invalid', ...named: string[]) =>
  (err: Error & { exitCode?: number; _tag?: string }) => {
    assert.equal(err._tag, tag, err.message);
    assert.equal(err.exitCode, 2, err.message);
    for (const n of named) assert.ok(err.message.includes(n), `${n} is not named in: ${err.message}`);
    return true;
  };
const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/** What `main` printed, line by line, for one verb. */
const printedBy = async (
  t: { mock: { method: (o: object, m: string, f: (...a: unknown[]) => void) => { mock: { restore: () => void } } } },
  ...argv: string[]
): Promise<string[]> => {
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => {
    printed.push(args.join(' '));
  });
  try {
    await main(argv, noEngine());
  } finally {
    log.mock.restore();
  }
  return printed.join('\n').split('\n');
};

/**
 * What `main` printed for one verb typed in `cwd`: a card of the default factory is started on the folder `nemia start` is typed in, its
 * `repo:` retired and never read.
 */
const printedIn = async (t: Parameters<typeof printedBy>[0], cwd: string, ...argv: string[]): Promise<string[]> => {
  const was = process.cwd();
  process.chdir(cwd);
  try {
    return await printedBy(t, ...argv);
  } finally {
    process.chdir(was);
  }
};

/** The cards in the inbox, by file. */
const inInbox = () => (fs.existsSync(INBOX) ? fs.readdirSync(INBOX).sort() : []);
const emptyInbox = () => fs.rmSync(INBOX, { recursive: true, force: true });

/** A repository with one commit, so a start has a base to record — and a workflow of one step under its workflows/ for each name. */
const aRepoWith = (...workflows: string[]): string => {
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(ROOT, 'repo-')));
  stand().world.repository(repo, {});
  for (const name of workflows) {
    fs.mkdirSync(path.join(repo, 'workflows', name), { recursive: true });
    fs.writeFileSync(path.join(repo, 'workflows', name, 'implement.md'), `---\nplace: git\n---\nimplement it, on ${name}\n`);
  }
  return repo;
};

const runsWritten = () => fs.readdirSync(path.join(ROOT, 'runs')).filter((f) => f.endsWith('.json')).length;

/** A run record, as `start()` writes one — only what the listing reads of it matters here. */
const writeRecord = (id: string, from?: Run['from']) =>
  fs.writeFileSync(
    path.join(ROOT, 'runs', `${id}.json`),
    JSON.stringify({
      id,
      repo: '/repo',
      workspace: '/repo',
      baseRef: 'abc123',
      branch: 'main',
      isolate: false,
      brief: 'x',
      workflowDir: '/wf',
      steps: {},
      createdAt: '2026-09-16T00:00:00Z',
      ...(from ? { from } : {}),
    }),
  );

test('a person parks ideas in the inbox, lists them, starts them and drops them', async (top) => {
  const s = story(top);
  await s.test('the inbox is `$WF_ROOT/inbox/`, beside runs/ — and with no folder yet, `nemia inbox` says it is empty', async () => {
    emptyInbox();
    assert.equal(inboxDir(ROOT), path.join(ROOT, 'inbox'));
    assert.deepEqual(readInbox(), []);
    const empty = (await verb('inbox')) as { cards: unknown[]; ended: number };
    assert.deepEqual([empty.cards, empty.ended], [[], 0], 'no card, and none ended');
  });
  await s.test(
    '`nemia inbox add` files a card under the slug of its first line and a suffix — two ideas alike are two cards — `--workflow` and `--factory` write its keys, a file is read as a card when its frontmatter is one; `nemia inbox` lists each, with started as for a card a record names',
    async () => {
      emptyInbox();
      const first = await added({ idea: "Cache the engine's views between passes\n\nThe tick reads each task twice." });
      const [name] = inInbox();
      assert.match(name, /^cache-the-engine-s-views-bet-[a-z0-9]{4}\.md$/, 'the slug runId makes of the first line, suffix included');
      const card = path.join(INBOX, name);
      assert.equal(
        fs.readFileSync(card, 'utf8'),
        "Cache the engine's views between passes\n\nThe tick reads each task twice.\n",
        'no keys, no frontmatter',
      );
      assert.deepEqual(
        [first.card.name, first.card.body, first.card.workflow, first.file],
        [name.slice(0, -3), "Cache the engine's views between passes\n\nThe tick reads each task twice.", undefined, card],
        'the card filed, its file, and no workflow, which its start then asks for',
      );

      await added({ idea: "Cache the engine's views between passes", workflow: 'dev', factory: 'shop' });
      const second = inInbox().find((f) => f !== name)!;
      assert.ok(second && second !== name, 'a second card, not the first written over');
      assert.equal(
        fs.readFileSync(path.join(INBOX, second), 'utf8'),
        `---\nworkflow: dev\nfactory: shop\n---\nCache the engine's views between passes\n`,
        'its keys, written',
      );

      const given = path.join(fs.mkdtempSync(path.join(ROOT, 'given-')), 'idea.md');
      fs.writeFileSync(given, `---\nworkflow: ui\nfactory: nemia\n---\nShow the flag on the settings page.\n`);
      await added({ idea: fs.readFileSync(given, 'utf8'), factory: 'shop' });
      const third = inInbox().find((f) => f.startsWith('show-the-flag'))!;
      assert.equal(
        fs.readFileSync(path.join(INBOX, third), 'utf8'),
        `---\nworkflow: ui\nfactory: shop\n---\nShow the flag on the settings page.\n`,
        "a file's card keys are read, and --factory written over its own",
      );
      assert.equal(fs.readFileSync(given, 'utf8').includes('factory: nemia'), true, 'the file given is left as it was');
      const byName = addToInbox({ text: 'Store the flag', workflow: 'dev' });

      writeRecord('show-the-flag-on-the-settin-zz99', { inbox: third.slice(0, -3) });
      writeRecord('an-unrelated-run-yy88');
      fs.writeFileSync(path.join(INBOX, 'broken-a1b2.md'), '---\nharness: codex\n---\nx\n');
      fs.writeFileSync(path.join(INBOX, 'notes.txt'), 'x');
      fs.writeFileSync(path.join(INBOX, '.idea.md.swp'), 'x');
      fs.writeFileSync(path.join(INBOX, 'README.md'), '# ideas\n');
      const listed = readInbox();
      assert.deepEqual(
        listed.map((l) => [l.name, l.startedAs, l.error === null]),
        [
          ['broken-a1b2', [], false],
          [name.slice(0, -3), [], true],
          [second.slice(0, -3), [], true],
          ['notes.txt', [], false],
          [third.slice(0, -3), ['show-the-flag-on-the-settin-zz99'], true],
          [byName.card.name, [], true],
        ].sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
        'started, broken and non-card listed; hidden and README not',
      );
      const lines = await listedLines();
      assert.ok(
        lines.some((l) =>
          new RegExp(`^${escaped(second.slice(0, -3))} +Cache the engine's views between passes  workflow: dev  factory: shop$`).test(l),
        ),
        lines.join('\n'),
      );
      assert.ok(
        lines.some((l) =>
          new RegExp(
            `^${escaped(third.slice(0, -3))} +Show the flag on the settings page\\.  workflow: ui  factory: shop  started as show-the-flag-on-the-settin-zz99, running$`,
          ).test(l),
        ),
        lines.join('\n'),
      );
      assert.ok(
        lines.some((l) => /^broken-a1b2 +broken-a1b2\.md: `harness` is not a key an inbox card has\./.test(l)),
        lines.join('\n'),
      );
      fs.rmSync(path.join(ROOT, 'runs', 'show-the-flag-on-the-settin-zz99.json'));
      fs.rmSync(path.join(ROOT, 'runs', 'an-unrelated-run-yy88.json'));
    },
  );
  await s.test("`nemia inbox add --factory` files a card that names its factory, over the text's own, and says it", async () => {
    emptyInbox();
    const { card, file } = addToInbox({ text: 'Build the page', factory: 'shop' });
    assert.equal(card.factory, 'shop');
    assert.equal(fs.readFileSync(file, 'utf8'), '---\nfactory: shop\n---\nBuild the page\n');
    const idea = path.join(fs.mkdtempSync(path.join(ROOT, 'given-')), 'idea.md');
    fs.writeFileSync(idea, '---\nfactory: nemia\nworkflow: build\n---\nShip it\n');
    const filedThere = await added({ idea: fs.readFileSync(idea, 'utf8'), factory: 'shop' });
    const { name } = filedThere.card;
    assert.deepEqual([filedThere.card.body, filedThere.card.workflow, filedThere.card.factory], ['Ship it', 'build', 'shop']);
    assert.equal(fs.readFileSync(path.join(INBOX, `${name}.md`), 'utf8'), '---\nworkflow: build\nfactory: shop\n---\nShip it\n');
    assert.equal(readInbox().find((l) => l.name === name)?.factory, 'shop');
  });
  await s.test(
    '`nemia inbox rm` drops a card without starting it — a name with no card is normal: it says so, and which cards there are',
    async () => {
      emptyInbox();
      const { card, file } = addToInbox({ text: 'Drop me' });
      const kept = addToInbox({ text: 'Keep me' });
      assert.deepEqual(await verb('inbox', 'rm', card.name), { removed: true, file });
      assert.equal(fs.existsSync(file), false);
      assert.deepEqual(dropFromInbox(card.name), { removed: false, cards: [kept.card.name] });
      assert.deepEqual(await verb('inbox', 'rm', card.name), { removed: false, cards: [kept.card.name] });
      assert.deepEqual(await verb('inbox', 'rm', `${kept.card.name}.md`), { removed: false, cards: [kept.card.name] });
      assert.ok(fs.existsSync(kept.file), 'the other card is left');
      emptyInbox();
      assert.deepEqual(await verb('inbox', 'rm', 'anything'), { removed: false, cards: [] });
    },
  );
  await s.test(
    "`nemia start <inbox>/<name>.md` starts the card — its body the brief, its `workflow:` found in the repository it is typed in, the card naming no factory — writes `from` on the record and keeps the card, listed as started and never started again; its decision names the card on the run's line",
    async (t) => {
      emptyInbox();
      const repo = aRepoWith('dev', 'ui');
      const { card, file } = addToInbox({
        text: 'Cache the views between passes\n\nThe tick reads each task twice.',
        workflow: 'dev',
      });
      const printed = await printedIn(t, repo, 'start', file);
      const id = printed[0].split(' ')[0];
      assert.match(id, /^cache-the-views-between-pass-[a-z0-9]{4}$/, 'the run id from the body');
      const run = runRecord(ROOT, id);
      assert.deepEqual(
        [run.brief, run.repo, run.workflowDir, run.from],
        [
          'Cache the views between passes\n\nThe tick reads each task twice.',
          repo,
          path.join(repo, 'workflows', 'dev'),
          { inbox: card.name },
        ],
      );
      assert.deepEqual(printed.slice(0, 3), [
        `${id}  1 step(s): implement`,
        `from inbox card ${card.name} — kept in the inbox, listed as started`,
        `workspace: ${repo}`,
      ]);
      assert.ok(fs.existsSync(file), 'the card stays in the inbox');
      assert.deepEqual(
        (await judgedInbox()).map((l) => [l.name, l.state, l.startedAs]),
        [[card.name, 'running', [id]]],
        "its state is its run's phase, read now",
      );
      const before = runsWritten();
      await assert.rejects(main(['start', file], noEngine()), refusedWith('Conflict', card.file, id, 'nemia inbox add'));
      await assert.rejects(
        async () => await runPlaced(startFromInbox({ name: card.name, callerRepo: repo })),
        refusedWith('Conflict', card.file, id),
      );
      await assert.rejects(verb('inbox', 'queue', card.name), refusedWith('Conflict', card.file, id));
      assert.equal(runsWritten(), before, 'a card is started once');
      const { run: decided } = await decisionOf(noEngine(), id, { place: stand().place, env: ENV });
      assert.deepEqual(
        [decided.brief.split('\n')[0], runLines(decided).fromNote],
        ['Cache the views between passes', `from inbox card ${card.name}`],
      );
      const typed = await runPlaced(startRun({ brief: 'typed', repo, workflowDir: path.join(repo, 'workflows', 'dev') }));
      assert.equal(
        Object.hasOwn(JSON.parse(fs.readFileSync(path.join(ROOT, 'runs', `${typed.id}.json`), 'utf8')), 'from'),
        false,
        'a run typed at nemia start carries no from',
      );
      assert.equal(
        runLines((await decisionOf(noEngine(), typed.id, { place: stand().place, env: ENV })).run).fromNote,
        null,
        'and its decision names no card',
      );
    },
  );
  await s.test('`nemia start <inbox>/<name>`, the name as `nemia inbox` lists it, starts the card as `<name>.md` does', async (t) => {
    emptyInbox();
    const repo = aRepoWith('dev');
    const { card, file } = addToInbox({ text: 'Cache the views between passes', workflow: 'dev' });
    const other = addToInbox({ text: 'Show the flag', workflow: 'dev' });

    const printed = await printedIn(t, repo, 'start', path.join(INBOX, card.name));
    const run = runRecord(ROOT, printed[0].split(' ')[0]);
    assert.deepEqual(
      [run.brief, run.workflowDir, run.from],
      ['Cache the views between passes', path.join(repo, 'workflows', 'dev'), { inbox: card.name }],
    );
    assert.equal(printed[1], `from inbox card ${card.name} — kept in the inbox, listed as started`);
    assert.ok(fs.existsSync(file), 'the card stays in the inbox');
    assert.ok(fs.existsSync(other.file), 'and the other card is where it was');
  });
  await s.test(
    '`nemia start <name>` and `nemia start <name>.md`, the card named with or without its .md, each start the card',
    async (t) => {
      emptyInbox();
      const repo = aRepoWith('dev');
      for (const named of [(name: string) => name, (name: string) => `${name}.md`]) {
        const { card } = addToInbox({ text: 'Cache the views between passes', workflow: 'dev' });
        const run = runRecord(ROOT, (await printedIn(t, repo, 'start', named(card.name)))[0].split(' ')[0]);
        assert.deepEqual([run.brief, run.from], ['Cache the views between passes', { inbox: card.name }], named(card.name));
      }
    },
  );
  await s.test(
    "a start says what the card does not, over what it does: --workflows over `workflow:`, by name, the caller's repository, --brief in place of the body, and --after to wait on",
    async (t) => {
      emptyInbox();
      const repo = aRepoWith('dev', 'ui');
      const other = aRepoWith('ui');

      const over = addToInbox({ text: 'Show the flag', workflow: 'dev' });
      const run = runRecord(
        ROOT,
        (
          await printedIn(
            t,
            repo,
            'start',
            over.file,
            '--workflows',
            'ui',
            '--brief',
            'Show the flag on the settings page, beside the theme toggle.',
          )
        )[0].split(' ')[0],
      );
      assert.deepEqual(
        [run.workflowDir, run.repo, run.brief, run.from],
        [
          path.join(repo, 'workflows', 'ui'),
          repo,
          'Show the flag on the settings page, beside the theme toggle.',
          { inbox: over.card.name },
        ],
      );
      assert.match(run.id, /^show-the-flag-on-the-setting-[a-z0-9]{4}$/, 'the id from the brief it was started with');

      const bare = addToInbox({ text: 'Store the flag', workflow: 'ui' });
      const here = runRecord(ROOT, (await printedIn(t, other, 'start', bare.file))[0].split(' ')[0]);
      assert.deepEqual(
        [here.repo, here.workflowDir],
        [other, path.join(other, 'workflows', 'ui')],
        "a card naming no factory: the caller's repository, nemia start's `.`, and its workflow: found there, by name",
      );
      const given = addToInbox({ text: 'Document the flag' });
      const byBoard = await runPlaced(startFromInbox({ name: given.card.name, workflow: 'dev', callerRepo: repo }));
      assert.deepEqual([byBoard.run.repo, byBoard.run.workflowDir], [repo, path.join(repo, 'workflows', 'dev')]);

      const brief = path.join(fs.mkdtempSync(path.join(ROOT, 'mine-')), 'work.md');
      fs.writeFileSync(brief, 'Parse the flag in cli.ts.\n');
      const waits = addToInbox({ text: 'Parse the flag', workflow: 'dev' });
      const child = runRecord(
        ROOT,
        (await printedIn(t, repo, 'start', waits.file, '--brief', brief, '--after', byBoard.run.id))[0].split(' ')[0],
      );
      assert.deepEqual(
        [child.brief, child.after, child.from],
        ['Parse the flag in cli.ts.', [byBoard.run.id], { inbox: waits.card.name }],
        'a brief from a file, and what the card waits on, said at start',
      );
    },
  );
  await s.test(
    "a card's `from:` is set and taken off by `nemia inbox from`, and its run is handed it as context before `--from`'s, a run both name once",
    async () => {
      emptyInbox();
      const repo = aRepoWith('dev');
      writeRecord('source-a1');
      writeRecord('source-b2');
      const card = addToInbox({ text: 'Read the sources', workflow: 'dev' });
      const set = (await verb('inbox', 'from', card.card.name, 'source-a1')) as { from: string[]; was: string[] };
      assert.deepEqual([set.from, set.was], [['source-a1'], []]);
      assert.match(fs.readFileSync(card.file, 'utf8'), /^from: source-a1$/m);
      const off = (await verb('inbox', 'from', card.card.name, '--off')) as { from: string[]; was: string[] };
      assert.deepEqual([off.from, off.was], [[], ['source-a1']], 'taken off, and what it was');
      assert.doesNotMatch(fs.readFileSync(card.file, 'utf8'), /^from:/m);

      await verb('inbox', 'from', card.card.name, 'source-a1');

      const started = await runPlaced(
        startFromInbox({
          name: card.card.name,
          workflow: 'dev',
          callerRepo: repo,
          context: ['source-b2', 'source-a1'],
        }),
      );
      assert.deepEqual(runRecord(ROOT, started.run.id).context, ['source-a1', 'source-b2']);
      assert.equal(runRecord(ROOT, started.run.id).after, undefined, 'it waits on none');
    },
  );
});

test('REFUSED by name at shipped defaults: `nemia inbox add` and `nemia inbox rm` — nothing filed, nothing removed', async (t) => {
  emptyInbox();
  const add = (...argv: string[]) => verb('inbox', 'add', ...argv);
  const rm = (...argv: string[]) => verb('inbox', 'rm', ...argv);
  const dir = fs.mkdtempSync(path.join(ROOT, 'given-'));
  const empty = path.join(dir, 'empty.md');
  fs.writeFileSync(empty, '\n');
  const waits = path.join(dir, 'd.md');
  fs.writeFileSync(waits, '---\nworkflow: dev\nafter: b, c\n---\nShow the flag.\n');
  const withRepo = path.join(dir, 'with-repo.md');
  fs.writeFileSync(withRepo, `---\nworkflow: dev\nrepo: ${ROOT}\n---\nShow the flag.\n`);
  const byPath = path.join(dir, 'by-path.md');
  fs.writeFileSync(byPath, '---\nworkflow: ../workflows/dev\n---\nShow the flag.\n');
  addFactoryAt(ROOT, { name: 'f', repos: [aRepoWith('dev')] });
  attachWorkflowAt(ROOT, { factory: 'f', workflow: 'dev' });
  const adds: Record<string, [() => unknown, ...named: string[]]> = {
    'an empty idea': [() => add(''), 'the idea has nothing in it', 'nemia inbox add "<idea>"'],
    'an idea of spaces': [() => add('   '), 'the idea has nothing in it', 'nemia inbox add "<idea>"'],
    "an empty file's text": [() => added({ idea: fs.readFileSync(empty, 'utf8') }), 'the idea has nothing in it'],
    'a file whose card has `after:`': [
      () => added({ idea: fs.readFileSync(waits, 'utf8') }),
      '`after`',
      'nemia start <inbox>/<name>.md --after <runId>',
    ],
    'a repo given, to addToInbox': [
      () => addToInbox({ text: 'an idea', repo: ROOT }),
      ROOT,
      'nemia factory attach <factory> <workflow> --repo <name>',
    ],
    'a file whose frontmatter says repo:': [
      () => added({ idea: fs.readFileSync(withRepo, 'utf8') }),
      `\`repo: ${ROOT}\``,
      'nemia factory attach <factory> <workflow> --repo <name>',
    ],
    '--workflow given as a path': [() => add('an idea', '--workflow', './flows/dev'), './flows/dev', 'Nothing was filed.'],
    'a file whose workflow: is a path': [() => added({ idea: fs.readFileSync(byPath, 'utf8') }), '../workflows/dev', 'Nothing was filed.'],
    'a workflow its factory does not attach, naming the attach': [
      () => add('an idea', '--factory', 'f', '--workflow', 'ui'),
      'nemia factory attach f ui',
      'Nothing was filed.',
    ],
    "a factory that is not a factory's name, to addToInbox": [
      () => addToInbox({ text: 'an idea', factory: 'Pipao' }),
      '`factory: Pipao`',
      'pipao, say',
      'nemia factory ls',
    ],
  };
  for (const [name, [refused, ...named]] of Object.entries(adds))
    await t.test(`nemia inbox add: ${name}`, async () => {
      await assert.rejects(async () => await refused(), refusedWith('Invalid', ...named));
      assert.deepEqual(inInbox(), [], 'nothing filed');
    });

  const { file } = addToInbox({ text: 'Stay where you are' });
  writeRecord('r-outside');
  const rms: Record<string, [() => unknown, ...named: string[]]> = {
    '.hidden': [() => rm('.hidden'), "`.hidden` is not a card's name", 'hidden file'],
    'a path under runs/, to dropFromInbox': [() => dropFromInbox('../runs/r-outside'), "`../runs/r-outside` is not a card's name"],
    'nemia inbox list, a form it does not have': [
      () => verb('inbox', 'list'),
      'does not take list',
      'nemia inbox add "<idea>"',
      'nemia inbox queue <name>',
      'nemia inbox rm <name>',
      'nemia inbox --help',
    ],
  };
  for (const name of ['../runs/r-outside.json', '../runs/r-outside', 'sub/card', '..'])
    rms[name] = [() => rm(name), `\`${name}\` is not a card's name`, 'no slash', 'the name nemia inbox lists'];
  for (const [name, [refused, ...named]] of Object.entries(rms))
    await t.test(`nemia inbox rm: ${name}`, async () => {
      await assert.rejects(async () => await refused(), refusedWith('Invalid', ...named));
      assert.ok(fs.existsSync(path.join(ROOT, 'runs', 'r-outside.json')), 'the record outside the inbox is still there');
      assert.ok(fs.existsSync(file), 'and so is the card');
    });
  fs.rmSync(path.join(ROOT, 'runs', 'r-outside.json'));
});

test('REFUSED by name at shipped defaults: `nemia start` of an inbox card, before a run is written and with the card left in the inbox', async (t) => {
  emptyInbox();
  const repo = aRepoWith('dev', 'ui');
  const kept = addToInbox({ text: 'Cache the views' });
  const other = addToInbox({ text: 'Show the flag', workflow: 'dev' });
  const loose = addToInbox({ text: 'Anywhere at all' });
  const nope = addToInbox({ text: 'Store the flag', workflow: 'nope' });
  writeRecord('source-a1');
  const sourced = addToInbox({ text: 'Read the sources', workflow: 'dev' });
  await verb('inbox', 'from', sourced.card.name, 'source-a1');
  fs.writeFileSync(path.join(INBOX, 'hand-written-a1b2.md'), `---\nworkflow: dev\nafter: ${kept.card.name}\n---\nShow the flag\n`);
  fs.writeFileSync(path.join(INBOX, 'notes.txt'), 'Refactor everything.\n');
  fs.mkdirSync(path.join(INBOX, 'drafts'));
  fs.writeFileSync(path.join(INBOX, 'drafts', 'idea.md'), 'Refactor everything.\n');
  const cards = [...[kept, other, loose, nope, sourced].map((c) => c.card.name), 'hand-written-a1b2'].sort();
  const before = runsWritten();
  const inbox = () => fs.readdirSync(INBOX).sort();
  const there = inbox();
  const starting = async (...argv: string[]) => {
    const was = process.cwd();
    process.chdir(repo);
    try {
      return await main(['start', ...argv], noEngine());
    } finally {
      process.chdir(was);
    }
  };
  const fromInbox = (opts: Parameters<typeof startFromInbox>[0]) => runPlaced(startFromInbox(opts));
  const rows: Record<string, [() => unknown, 'Missing' | 'Invalid', ...named: string[]]> = {
    'a card not there, naming those there are': [
      () => starting(path.join(INBOX, 'cache-the-view.md')),
      'Missing',
      'no card cache-the-view in',
      `Its cards are: ${cards.join(', ')}.`,
      'nemia start <name>',
      'nemia inbox add "<idea>"',
    ],
    'a name with no card, typed without its .md, never started as a run asked to do its own path': [
      () => starting(path.join(INBOX, 'cache-the-views')),
      'Missing',
      'no card cache-the-views in',
      `Its cards are: ${cards.join(', ')}.`,
    ],
    'a file in the inbox that is not a card, not read as a brief': [
      () => starting(path.join(INBOX, 'notes.txt'), '--workflows', 'dev'),
      'Missing',
      'no card notes.txt in',
    ],
    'a card in a folder inside the inbox': [
      () => starting(path.join(INBOX, 'drafts', 'idea.md'), '--workflows', 'dev'),
      'Invalid',
      "`drafts/idea` is not a card's name",
      'no slash',
    ],
    'a name that leaves the inbox': [
      () => fromInbox({ name: '../runs/x', callerRepo: repo }),
      'Invalid',
      "`../runs/x` is not a card's name",
      'no slash',
    ],
    'a name with a slash': [() => fromInbox({ name: 'a/b', callerRepo: repo }), 'Invalid', "`a/b` is not a card's name"],
    'no name': [() => fromInbox({ name: '', callerRepo: repo }), 'Invalid', 'this name is empty', 'nemia inbox lists'],
    'no workflow from the card or the flag, naming those the repository has': [
      () => starting(kept.file),
      'Invalid',
      `${kept.card.file}: no workflow`,
      `${path.join(repo, 'workflows')} offers: dev, ui.`,
      `nemia start ${kept.card.name} --workflows dev`,
      '`workflow: dev`',
    ],
    'no workflow, on a repository that has none': [
      () => fromInbox({ name: loose.card.name, callerRepo: fs.mkdtempSync(path.join(ROOT, 'bare-')) }),
      'Invalid',
      `${loose.card.file}: no workflow`,
      'offers none',
      `nemia start ${loose.card.name} --workflows <name>`,
    ],
    'a workflow given as a path': [
      () => starting(kept.file, '--workflows', path.join(repo, 'workflows', 'dev')),
      'Invalid',
      `--workflows ${path.join(repo, 'workflows', 'dev')}`,
      'Nothing was started.',
    ],
    '--repo, the card naming its factory and workflow, never a repository': [
      () => starting(other.file, '--repo', repo),
      'Invalid',
      'does not take --repo',
      'nemia factory attach <factory> <workflow> --repo <name>',
    ],
    "the card's workflow does not load": [
      () => starting(nope.file),
      'Invalid',
      `${nope.card.file}: \`workflow: nope\``,
      `no workflow folder at ${path.join(INBOX, 'nope')},`,
      `named nope in ${path.join(repo, 'workflows')}.`,
      'workflows are: dev, ui',
    ],
    "the flag's workflow does not load": [
      () => starting(kept.file, '--workflows', 'nope'),
      'Invalid',
      'no workflow folder at ',
      `named nope in ${path.join(repo, 'workflows')}.`,
      'workflows are: dev, ui',
    ],
    'a card that does not read: `after:`': [
      () => starting(path.join(INBOX, 'hand-written-a1b2.md')),
      'Invalid',
      'hand-written-a1b2.md: `after`',
      'nemia start <inbox>/hand-written-a1b2.md --after <runId>',
    ],
    'a blank brief, to startFromInbox': [
      () => fromInbox({ name: kept.card.name, workflow: 'dev', brief: '  \n', callerRepo: repo }),
      'Invalid',
      `${kept.card.file}: the brief`,
      'is empty',
      'Give what the run is asked to do',
      'leave it out',
    ],
    '--brief twice': [
      () => starting(kept.file, '--workflows', 'dev', '--brief', 'x', '--brief', 'y'),
      'Invalid',
      'nemia start takes --brief once',
    ],
    'an --after start() refuses': [
      () => starting(kept.file, '--workflows', 'dev', '--after', 'no-such-run-zz99'),
      'Invalid',
      '--after no-such-run-zz99',
      'nemia ls',
    ],
    'a `from:` run also waited on': [
      () => fromInbox({ name: sourced.card.name, workflow: 'dev', callerRepo: repo, after: ['source-a1'] }),
      'Invalid',
      'from: source-a1',
      '--after source-a1',
    ],
  };
  for (const [name, [refused, tag, ...named]] of Object.entries(rows))
    await t.test(name, async () => {
      await assert.rejects(async () => await refused(), refusedWith(tag, ...named));
      assert.equal(runsWritten(), before, 'no run written');
      assert.deepEqual(inbox(), there, 'every card still in the inbox');
    });
  fs.rmSync(path.join(ROOT, 'runs', 'source-a1.json'));
});
test(
  "a queued card started has its `queued:` line taken off, every other line kept; one whose line cannot be taken off is started all the same, says so, and stays out of the queue while its run's record stands",
  { skip: process.getuid?.() === 0 && 'root writes a folder it may not write' },
  async (t) => {
    emptyInbox();
    const repo = aRepoWith('dev');
    const queuedCard = (name: string) => {
      const file = path.join(INBOX, `${name}.md`);
      fs.mkdirSync(INBOX, { recursive: true });
      fs.writeFileSync(file, `---\nworkflow: dev\nqueued: 2026-09-16T10:00:00.000Z\n---\nCache the views\n`);
      return file;
    };
    const taken = queuedCard('taken-a1b2');
    const started = await runPlaced(startFromInbox({ name: 'taken-a1b2', callerRepo: repo }));
    assert.equal(started.queueLeft, undefined);
    assert.equal(fs.readFileSync(taken, 'utf8'), `---\nworkflow: dev\n---\nCache the views\n`);
    assert.deepEqual(
      (await judgedInbox()).map((l) => [l.name, l.state, l.queued]),
      [['taken-a1b2', 'running', undefined]],
    );

    const left = queuedCard('left-c3d4');
    fs.chmodSync(INBOX, 0o555);
    let printed: string[];
    try {
      printed = await printedIn(t, repo, 'start', left);
    } finally {
      fs.chmodSync(INBOX, 0o755);
    }
    const id = printed[0].split(' ')[0];
    assert.deepEqual(runRecord(ROOT, id).from, { inbox: 'left-c3d4' });
    assert.ok(printed[2].includes('nemia inbox queue left-c3d4 --off'), printed[2]);
    const listed = (await judgedInbox()).find((l) => l.name === 'left-c3d4')!;
    assert.deepEqual([listed.state, listed.queued], ['running', { at: '2026-09-16T10:00:00.000Z', place: null }]);
    assert.match(
      (await listedLines()).find((line) => line.startsWith('left-c3d4'))!,
      new RegExp(`started as ${escaped(id)}, running$`),
    );
  },
);

test('a card gone between its start and the taking off of its `queued:` line is not written back, and the run stands', async (t) => {
  emptyInbox();
  const repo = aRepoWith('dev');
  const file = path.join(INBOX, 'gone-a1b2.md');
  fs.mkdirSync(INBOX, { recursive: true });
  fs.writeFileSync(file, `---\nworkflow: dev\nrepo: ${repo}\nqueued: 2026-09-16T10:00:00.000Z\n---\nCache the views\n`);
  const write = fs.writeFileSync;
  t.mock.method(fs, 'writeFileSync', function (this: unknown, ...args: Parameters<typeof fs.writeFileSync>) {
    write.apply(this, args);
    const created = typeof args[0] === 'string' && path.dirname(args[0]) === path.join(ROOT, 'runs') && args[0].endsWith('.json');
    if (created && fs.existsSync(file)) fs.rmSync(file);
  });
  const started = await runPlaced(startFromInbox({ name: 'gone-a1b2', callerRepo: repo }));
  assert.equal(started.queueLeft, undefined, 'a card already gone is not a line left');
  assert.deepEqual(runRecord(ROOT, started.run.id).from, { inbox: 'gone-a1b2' });
  assert.deepEqual(readInbox(), []);
});

test("a warm read of the inbox, through the informer the api keeps, answers a cold read's own; a card whose run was removed reads filed", async () => {
  emptyInbox();
  for (const file of fs.readdirSync(path.join(ROOT, 'runs'))) fs.rmSync(path.join(ROOT, 'runs', file), { recursive: true });
  const { card } = addToInbox({ text: 'Cache the inbox' });
  writeRecord('r-started', { inbox: card.name });
  for (let n = 0; n < 20; n++) writeRecord(`fin-${String(n).padStart(3, '0')}`);
  const memo = informerMemo();
  await judgedInbox(memo);
  assert.deepEqual(await judgedInbox(memo), await judgedInbox(), "the warm answer is a cold read's own: nothing the board shows changes");
  assert.deepEqual(
    (await judgedInbox(memo)).map((l) => [l.name, l.state, l.startedAs]),
    [[card.name, 'running', ['r-started']]],
    'it says what started the card, in the phase the list gives a run it cannot judge',
  );

  filed.runs.forget('r-started');
  assert.deepEqual(
    (await judgedInbox(memo)).map((l) => [l.name, l.state, l.startedAs]),
    [[card.name, 'filed', []]],
    'its run removed, the card is free again: filed, started as nothing',
  );
});

test("a card's labels: filed with --label, inherited from its from: runs, selected with -l, shown with --show-labels and -L, and copied to the run it starts", async () => {
  emptyInbox();
  const repo = aRepoWith('dev');
  const a = await runPlaced(startRun({ brief: 'parent a', repo, workflowDir: path.join(repo, 'workflows', 'dev') }));
  const b = await runPlaced(startRun({ brief: 'parent b', repo, workflowDir: path.join(repo, 'workflows', 'dev') }));
  filed.labels.put(a.id, { team: 'core', area: 'inbox' });
  filed.labels.put(b.id, { team: 'infra', area: 'inbox' });

  const typed = addToInbox({ text: 'Cache the views', workflow: 'dev', labels: ['team=core', 'tier=one'] });
  assert.deepEqual(typed.card.labels, { team: 'core', tier: 'one' });
  assert.match(fs.readFileSync(typed.file, 'utf8'), /\nlabels:\n {2}team: core\n {2}tier: one\n---\n/, 'written as labels:');

  const fromRuns = addToInbox({ text: `---\nfrom: ${a.id}, ${b.id}\n---\nShow the flag\n`, workflow: 'dev' });
  assert.deepEqual(fromRuns.card.labels, { area: 'inbox' }, 'what its from: runs agree on');
  assert.deepEqual(
    fromRuns.labelsLeftOut?.map((l) => l.key),
    ['team'],
    'the key they disagree on, left out and said',
  );
  const bare = addToInbox({ text: 'Plain idea', workflow: 'dev' });
  assert.equal(fs.readFileSync(bare.file, 'utf8').includes('labels'), false, 'none given, none written');

  const selected = await listedLines(['-l', 'team=core', '--show-labels', '-L', 'tier'], { showLabels: true, columns: ['tier'] });
  const cards = selected.filter(
    (line) => line.includes('Cache the views') || line.includes('Show the flag') || line.includes('Plain idea'),
  );
  assert.equal(cards.length, 1, selected.join('\n'));
  assert.ok(cards[0]?.startsWith(typed.card.name), cards[0]);
  assert.ok(cards[0]?.endsWith('  labels: factory=default,team=core,tier=one,workflow=dev  tier: one'), cards[0]);
  const plain = await listedLines();
  assert.equal(
    plain.some((line) => line.includes('labels:')),
    false,
    'with neither flag, the lines as before',
  );
  const listed = readInbox();
  assert.deepEqual(listed.find((l) => l.name === bare.card.name)?.labels, {}, 'an entry with none carries {}');

  const run = await runPlaced(startFromInbox({ name: typed.card.name, callerRepo: repo, labels: ['tier-', 'size=s'] }));
  assert.deepEqual(run.run.labels, { team: 'core', size: 's' }, "the card's labels, the start's edits over them");
  assert.deepEqual(filed.runs.read(run.run.id).labels, { team: 'core', size: 's' });
});

test('REFUSED: `nemia inbox -l` with a malformed selector, and `nemia inbox add --label` with a reserved key — Invalid, exit 2, nothing filed', async (t) => {
  emptyInbox();
  await t.test('a malformed selector', () =>
    assert.throws(
      () => atRoot(verbs.INBOX.handler({ selector: ['team==core=x'] }) as Effect.Effect<unknown, unknown>),
      refusedWith('Invalid', '-l'),
    ),
  );
  await t.test('a reserved key', () => {
    assert.throws(
      () => addToInbox({ text: 'Cache the views', workflow: 'dev', labels: ['reason=x'] }),
      refusedWith('Invalid', '--label', 'reason'),
    );
    assert.equal(fs.existsSync(INBOX) ? fs.readdirSync(INBOX).length : 0, 0, 'nothing filed');
  });
});
