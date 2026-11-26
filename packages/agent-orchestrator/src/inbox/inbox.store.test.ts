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
import { cardNames, cardText, dropRecord, keysUnder, plantRecord, recordText, runKey, runRecord, runsNow } from '../../testing.ts';
import { CardDoor, type CardDoorShape } from '../cards/cards.store.ts';
import { CardName } from './inbox.model.ts';
import { afterAll, beforeAll, describe, test } from 'vitest';
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
import { inboxDir, parseArgv, START, StartInput, startRun, startFromInbox, StoreRoot } from '../runner.ts';
import type { Started } from '../start/commands.verb.ts';
import * as verbs from '../runner.ts';
import { informerMemo } from '../rest/informer.verb.ts';
import { RunDoor, type RunDoorShape } from '../runs/runs.store.ts';
import { INBOX as INBOX_LIST, INBOX_ADD, type InboxAddInput } from './commands.verb.ts';
import { inboxLines, type InboxListing } from './inbox.ts';
import { factsOf, handled, typed, type StartedAnswer } from '../../test/typed.ts';
import { runWith as runEngine } from '../runtime-client.ts';
import { main as cli } from '../cli/main.ts';
import { engineOf } from '../runtime-client.ts';
import type { Env } from '../config/config.store.ts';
import { addFactoryAt, attachWorkflowAt } from '../../testing.ts';

const ROOT = scratch('wf-inbox-');
const INBOX = path.join(ROOT, 'inbox');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });

const ENV: Env = { ...process.env, WF_ROOT: ROOT, WF_VERIFY_REST: '0', WF_MAX_CONCURRENT: undefined, WF_MAX_RUNS: undefined };
/** An inbox verb run at this test's store root, as `nemia` gives it one: its answer, or its refusal thrown. */
const atRoot = <A, E>(program: Effect.Effect<A, E, StoreRootNeeded>) => Effect.runSync(Effect.provideService(program, StoreRoot, ROOT));
/** A card's file in the inbox, as a person names one at `nemia start`: the path the Card door reads back as its name (`cardNameAt`). */
const cardFile = (name: string) => path.join(INBOX, `${name}.md`);

/** The text of the card a path names (`cardFile`), as the store holds it, or empty where it holds none. */
const cardAt = (file: string) => cardText(ROOT, path.basename(file, '.md')) ?? '';

/** Whether the store holds the card a path names (`cardFile`). */
const held = (file: string) => cardText(ROOT, path.basename(file, '.md')) !== null;

/** `nemia inbox add` through its verb: what it answers, how it names the card (`where`), and the card's file a start names (`cardFile`). */
const addToInbox = (opts: Parameters<typeof verbs.addToInbox>[0]) => {
  const answer = atRoot(verbs.addToInbox(opts));
  return { ...answer, where: answer.file, file: cardFile(answer.card.name) };
};
const readInbox = () => atRoot(verbs.readInbox());
const dropFromInbox = (name: string) => atRoot(verbs.dropFromInbox(name));
const stand = eachTest(testPlace);
const runPlaced = runGiven(() => stand().layer, ENV);
const filed = runsNow(ROOT);
const runWith = runOver(runEngine, () => stand().layer, ENV);
/**
 * `nemia`, as a person types it, its commands given this test's place: `start` run on its entry's handler (`typed`), a card of the
 * inbox named by its file or its name sent as the card it is (`card`), as the client sends a card it names, answering what the handler
 * answered with the facts the client words (`factsOf`); `decide`, the old path's screen.
 */
const main = async (argv: string[], e?: Parameters<typeof cli>[1]) => {
  if (argv[0] !== 'start') return cli(argv, e, undefined, stand().place, ENV);
  const [, given = '', ...rest] = argv;
  const named = !given.includes('/') && cardText(ROOT, given.replace(/\.md$/, '')) !== null;
  const inInbox = named ? given : path.relative(INBOX, path.resolve(given));
  const data =
    !inInbox.startsWith('..') && !path.isAbsolute(inInbox)
      ? await handled(
          START,
          { card: inInbox.replace(/\.md$/, ''), at: process.cwd(), ...startFlags(rest) },
          { ...(e && { e }), place: stand().place, env: ENV },
        )
      : await typed(['start', given, ...rest], e, undefined, stand().place, ENV);
  return factsOf(data as Started);
};

/** The flags of a `start` read by its words, beside a card's name: what the handler takes of them (`--brief` its `instead`, a file's
 * text where it names one here, as the client reads it; `--repo`). */
const startFlags = (rest: readonly string[]) => {
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
const listedLines = async (argv: readonly string[] = [], show: { showLabels?: boolean; columns?: string[] } = {}) => {
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

/** What `nemia start <argv>` typed in `cwd` answered, with the facts the client words. */
const startedIn = async (cwd: string, ...argv: string[]) => {
  const was = process.cwd();
  process.chdir(cwd);
  try {
    return (await main(['start', ...argv], noEngine())) as StartedAnswer;
  } finally {
    process.chdir(was);
  }
};

/** The cards in the inbox, by their name and `.md`. */
const inInbox = () => cardNames(ROOT).map((name) => `${name}.md`);

/** Every card of the store dropped, and every file left in its inbox folder. */
const emptyInbox = () => {
  fs.rmSync(INBOX, { recursive: true, force: true });
  for (const key of keysUnder(ROOT, '/registry/cards/')) dropRecord(ROOT, key);
};

/** A repository with one commit, so a start has a base to record — and a workflow of one step under its workflows/ for each name. */
const aRepoWith = (...workflows: string[]) => {
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(ROOT, 'repo-')));
  stand().world.repository(repo, {});
  for (const name of workflows) {
    fs.mkdirSync(path.join(repo, 'workflows', name), { recursive: true });
    fs.writeFileSync(path.join(repo, 'workflows', name, 'implement.md'), `---\nplace: git\n---\nimplement it, on ${name}\n`);
  }
  return repo;
};

const runsWritten = () => keysUnder(ROOT, '/registry/runs/').length;

/** A run record, as `start()` writes one — only what the listing reads of it matters here. */
const writeRecord = (id: string, from?: Run['from']) =>
  plantRecord(
    ROOT,
    runKey(id),
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

describe('a person parks ideas in the inbox, lists them, starts them and drops them', () => {
  const s = story(test);
  s.test('the inbox is `$WF_ROOT/inbox/`, beside runs/ — and with no folder yet, `nemia inbox` says it is empty', async () => {
    emptyInbox();
    assert.equal(inboxDir(ROOT), path.join(ROOT, 'inbox'));
    assert.deepEqual(readInbox(), []);
    const empty = (await verb('inbox')) as { cards: unknown[]; ended: number };
    assert.deepEqual([empty.cards, empty.ended], [[], 0], 'no card, and none ended');
  });
  s.test(
    '`nemia inbox add` files a card under the slug of its first line and a suffix — two ideas alike are two cards — `--workflow` and `--factory` write its keys, a file is read as a card when its frontmatter is one; `nemia inbox` lists each, with started as for a card a record names',
    async () => {
      emptyInbox();
      const first = await added({ idea: "Cache the engine's views between passes\n\nThe tick reads each task twice." });
      const [name] = inInbox();
      assert.match(name, /^cache-the-engine-s-views-bet-[a-z0-9]{4}\.md$/, 'the slug runId makes of the first line, suffix included');
      const card = path.join(INBOX, name);
      assert.equal(cardAt(card), "Cache the engine's views between passes\n\nThe tick reads each task twice.\n", 'no keys, no frontmatter');
      assert.deepEqual(
        [first.card.name, first.card.body, first.card.workflow, first.file],
        [
          name.slice(0, -3),
          "Cache the engine's views between passes\n\nThe tick reads each task twice.",
          undefined,
          `nemia get card ${name.slice(0, -3)}`,
        ],
        'the card filed, its file, and no workflow, which its start then asks for',
      );

      await added({ idea: "Cache the engine's views between passes", workflow: 'dev', factory: 'shop' });
      const second = inInbox().find((f) => f !== name)!;
      assert.ok(second && second !== name, 'a second card, not the first written over');
      assert.equal(
        cardAt(second),
        `---\nworkflow: dev\nfactory: shop\n---\nCache the engine's views between passes\n`,
        'its keys, written',
      );

      const given = path.join(fs.mkdtempSync(path.join(ROOT, 'given-')), 'idea.md');
      fs.writeFileSync(given, `---\nworkflow: ui\nfactory: shop\n---\nShow the flag on the settings page.\n`);
      await added({ idea: fs.readFileSync(given, 'utf8'), factory: 'shop' });
      const third = inInbox().find((f) => f.startsWith('show-the-flag'))!;
      assert.equal(
        cardAt(third),
        `---\nworkflow: ui\nfactory: shop\n---\nShow the flag on the settings page.\n`,
        "a file's card keys are read, its factory the namespace it is filed in",
      );
      const byName = addToInbox({ text: 'Store the flag', workflow: 'dev' });

      writeRecord('show-the-flag-on-the-settin-zz99', { inbox: third.slice(0, -3) });
      writeRecord('an-unrelated-run-yy88');
      fs.mkdirSync(INBOX, { recursive: true });
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
          [third.slice(0, -3), ['show-the-flag-on-the-settin-zz99'], true],
          [byName.card.name, [], true],
        ].sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
        'started and broken listed, strays not',
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
      dropRecord(ROOT, runKey('show-the-flag-on-the-settin-zz99'));
      dropRecord(ROOT, runKey('an-unrelated-run-yy88'));
    },
  );
  s.test(
    '`nemia inbox add --factory` files a card that names its factory; an idea whose own factory: names another is refused, nothing filed',
    async () => {
      emptyInbox();
      const { card, file } = addToInbox({ text: 'Build the page', factory: 'shop' });
      assert.equal(card.factory, 'shop');
      assert.equal(cardAt(file), '---\nfactory: shop\n---\nBuild the page\n');
      const idea = '---\nfactory: nemia\nworkflow: build\n---\nShip it\n';
      await assert.rejects(added({ idea, factory: 'shop' }), (err: Error & { _tag?: string }) => {
        assert.equal(err._tag, 'Invalid');
        assert.ok(err.message.includes('/api/namespaces/nemia/cards'), err.message);
        return true;
      });
      await assert.rejects(added({ idea }), (err: Error & { _tag?: string }) => err._tag === 'Invalid', 'nor in default');
      assert.deepEqual(inInbox(), [path.basename(file)], 'nothing filed');
    },
  );
  s.test(
    '`nemia inbox rm` drops a card without starting it — a name with no card is normal: it says so, and which cards there are',
    async () => {
      emptyInbox();
      const { card, file, where } = addToInbox({ text: 'Drop me' });
      const kept = addToInbox({ text: 'Keep me' });
      assert.deepEqual(await verb('inbox', 'rm', card.name), { removed: true, file: where });
      assert.equal(held(file), false);
      assert.deepEqual(dropFromInbox(card.name), { removed: false, cards: [kept.card.name] });
      assert.deepEqual(await verb('inbox', 'rm', card.name), { removed: false, cards: [kept.card.name] });
      assert.deepEqual(await verb('inbox', 'rm', `${kept.card.name}.md`), { removed: false, cards: [kept.card.name] });
      assert.ok(held(kept.file), 'the other card is left');
      emptyInbox();
      assert.deepEqual(await verb('inbox', 'rm', 'anything'), { removed: false, cards: [] });
    },
  );
  s.test(
    "`nemia start <inbox>/<name>.md` starts the card — its body the brief, its `workflow:` found in the repository it is typed in, the card naming no factory — writes `from` on the record and keeps the card, listed as started and never started again; its decision names the card on the run's line",
    async () => {
      emptyInbox();
      const repo = aRepoWith('dev', 'ui');
      const { card, file } = addToInbox({
        text: 'Cache the views between passes\n\nThe tick reads each task twice.',
        workflow: 'dev',
      });
      const started = await startedIn(repo, file);
      const { id } = started;
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
      assert.deepEqual(
        [started.facts.steps, started.card, started.facts.from, started.facts.factory, started.facts.workspace, started.facts.repository],
        [[{ name: 'implement' }], card.name, card.name, undefined, repo, true],
        'the start says its one step, the card it came from, kept in the inbox, and where it works',
      );
      assert.ok(held(file), 'the card stays in the inbox');
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
        Object.hasOwn(JSON.parse(recordText(ROOT, runKey(typed.id)) ?? ''), 'from'),
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
  s.test('`nemia start <inbox>/<name>`, the name as `nemia inbox` lists it, starts the card as `<name>.md` does', async () => {
    emptyInbox();
    const repo = aRepoWith('dev');
    const { card, file } = addToInbox({ text: 'Cache the views between passes', workflow: 'dev' });
    const other = addToInbox({ text: 'Show the flag', workflow: 'dev' });

    const started = await startedIn(repo, path.join(INBOX, card.name));
    const run = runRecord(ROOT, started.id);
    assert.deepEqual(
      [run.brief, run.workflowDir, run.from],
      ['Cache the views between passes', path.join(repo, 'workflows', 'dev'), { inbox: card.name }],
    );
    assert.deepEqual(
      [started.card, started.facts.from, started.queueLeft],
      [card.name, card.name, undefined],
      'the start says the card it came from, kept in the inbox',
    );
    assert.ok(held(file), 'the card stays in the inbox');
    assert.ok(held(other.file), 'and the other card is where it was');
  });
  s.test('`nemia start <name>` and `nemia start <name>.md`, the card named with or without its .md, each start the card', async () => {
    emptyInbox();
    const repo = aRepoWith('dev');
    for (const named of [(name: string) => name, (name: string) => `${name}.md`]) {
      const { card } = addToInbox({ text: 'Cache the views between passes', workflow: 'dev' });
      const run = runRecord(ROOT, (await startedIn(repo, named(card.name))).id);
      assert.deepEqual([run.brief, run.from], ['Cache the views between passes', { inbox: card.name }], named(card.name));
    }
  });
  s.test(
    "a start says what the card does not, over what it does: --workflows over `workflow:`, by name, the caller's repository, --brief in place of the body, and --after to wait on",
    async () => {
      emptyInbox();
      const repo = aRepoWith('dev', 'ui');
      const other = aRepoWith('ui');

      const over = addToInbox({ text: 'Show the flag', workflow: 'dev' });
      const run = runRecord(
        ROOT,
        (await startedIn(repo, over.file, '--workflows', 'ui', '--brief', 'Show the flag on the settings page, beside the theme toggle.'))
          .id,
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
      const here = runRecord(ROOT, (await startedIn(other, bare.file)).id);
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
      const child = runRecord(ROOT, (await startedIn(repo, waits.file, '--brief', brief, '--after', byBoard.run.id)).id);
      assert.deepEqual(
        [child.brief, child.after, child.from],
        ['Parse the flag in cli.ts.', [byBoard.run.id], { inbox: waits.card.name }],
        'a brief from a file, and what the card waits on, said at start',
      );
    },
  );
  s.test(
    "a card's `from:` is set and taken off by `nemia inbox from`, and its run is handed it as context before `--from`'s, a run both name once",
    async () => {
      emptyInbox();
      const repo = aRepoWith('dev');
      writeRecord('source-a1');
      writeRecord('source-b2');
      const card = addToInbox({ text: 'Read the sources', workflow: 'dev' });
      const set = (await verb('inbox', 'from', card.card.name, 'source-a1')) as { from: string[]; was: string[] };
      assert.deepEqual([set.from, set.was], [['source-a1'], []]);
      assert.match(cardAt(card.file), /^from: source-a1$/m);
      const off = (await verb('inbox', 'from', card.card.name, '--off')) as { from: string[]; was: string[] };
      assert.deepEqual([off.from, off.was], [[], ['source-a1']], 'taken off, and what it was');
      assert.doesNotMatch(cardAt(card.file), /^from:/m);

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
  s.test(
    "a person's start of a card whose after: names a card not landed starts it all the same, answering the cards it had waited on",
    async () => {
      emptyInbox();
      const repo = aRepoWith('dev');
      const first = addToInbox({ text: 'Land the first slice', workflow: 'dev' });
      const second = addToInbox({ text: 'Land the second slice', workflow: 'dev', after: [first.card.name] });
      assert.match(cardAt(second.file), new RegExp(`^after: ${first.card.name}$`, 'm'), 'filed with its after:');
      const started = await runPlaced(
        startFromInbox({ name: second.card.name, workflow: 'dev', callerRepo: repo, landed: () => Effect.succeed(false) }),
      );
      assert.deepEqual(started.waitedOn, [first.card.name]);
      assert.equal(runRecord(ROOT, started.run.id).from?.inbox, second.card.name, 'started all the same');
    },
  );
});

describe('REFUSED by name at shipped defaults: `nemia inbox add` and `nemia inbox rm` — nothing filed, nothing removed', () => {
  let file: string | undefined;
  beforeAll(() => {
    emptyInbox();
    fs.writeFileSync(empty, '\n');
    fs.writeFileSync(waits, '---\nworkflow: dev\nafter: b-1x2y, b-1x2y\n---\nShow the flag.\n');
    fs.writeFileSync(withRepo, `---\nworkflow: dev\nrepo: ${ROOT}\n---\nShow the flag.\n`);
    fs.writeFileSync(byPath, '---\nworkflow: ../workflows/dev\n---\nShow the flag.\n');
    addFactoryAt(ROOT, { name: 'f', volumes: [aRepoWith('dev')].map((r) => `${r}:rw`) });
    attachWorkflowAt(ROOT, { factory: 'f', workflow: 'dev' });
  });
  const add = (...argv: string[]) => verb('inbox', 'add', ...argv);
  const rm = (...argv: string[]) => verb('inbox', 'rm', ...argv);
  const dir = fs.mkdtempSync(path.join(ROOT, 'given-'));
  const empty = path.join(dir, 'empty.md');
  const waits = path.join(dir, 'd.md');
  const withRepo = path.join(dir, 'with-repo.md');
  const byPath = path.join(dir, 'by-path.md');
  const adds: Record<string, [() => unknown, ...named: string[]]> = {
    'an empty idea': [() => add(''), 'the idea has nothing in it', 'nemia inbox add "<idea>"'],
    'an idea of spaces': [() => add('   '), 'the idea has nothing in it', 'nemia inbox add "<idea>"'],
    "an empty file's text": [() => added({ idea: fs.readFileSync(empty, 'utf8') }), 'the idea has nothing in it'],
    'a file whose card names a card twice in its `after:`': [
      () => added({ idea: fs.readFileSync(waits, 'utf8') }),
      '`after: b-1x2y, b-1x2y`',
      'names b-1x2y twice',
    ],
    'an --after naming a card twice, to addToInbox': [
      () => addToInbox({ text: 'an idea', after: ['b-1x2y', 'b-1x2y'] }),
      'names b-1x2y twice',
    ],
    "an --after that is no card's name, to addToInbox": [() => addToInbox({ text: 'an idea', after: ['../up'] }), '`after: ../up`'],
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
    test(`nemia inbox add: ${name}`, async () => {
      await assert.rejects(async () => await refused(), refusedWith('Invalid', ...named));
      assert.deepEqual(inInbox(), [], 'nothing filed');
    });
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
    test(`nemia inbox rm: ${name}`, async () => {
      if (!file) {
        ({ file } = addToInbox({ text: 'Stay where you are' }));
        writeRecord('r-outside');
      }
      await assert.rejects(async () => await refused(), refusedWith('Invalid', ...named));
      assert.ok(recordText(ROOT, runKey('r-outside')) !== undefined, 'the record outside the inbox is still there');
      assert.ok(held(file), 'and so is the card');
    });
  afterAll(() => {
    dropRecord(ROOT, runKey('r-outside'));
  });
});

describe('REFUSED by name at shipped defaults: `nemia start` of an inbox card, before a run is written and with the card left in the inbox', () => {
  let before!: number;
  let there!: string[];
  let repo!: string;
  let kept!: ReturnType<typeof addToInbox>;
  let other!: ReturnType<typeof addToInbox>;
  let loose!: ReturnType<typeof addToInbox>;
  let nope!: ReturnType<typeof addToInbox>;
  let sourced!: ReturnType<typeof addToInbox>;
  let cards!: string[];
  beforeAll(async () => {
    emptyInbox();
    repo = aRepoWith('dev', 'ui');
    kept = addToInbox({ text: 'Cache the views' });
    other = addToInbox({ text: 'Show the flag', workflow: 'dev' });
    loose = addToInbox({ text: 'Anywhere at all' });
    nope = addToInbox({ text: 'Store the flag', workflow: 'nope' });
    writeRecord('source-a1');
    sourced = addToInbox({ text: 'Read the sources', workflow: 'dev' });
    cards = [...[kept, other, loose, nope, sourced].map((c) => c.card.name), 'hand-written-a1b2'].sort();
    await verb('inbox', 'from', sourced.card.name, 'source-a1');
    fs.mkdirSync(INBOX, { recursive: true });
    fs.writeFileSync(
      path.join(INBOX, 'hand-written-a1b2.md'),
      `---\nworkflow: dev\nafter: ${kept.card.name}, ${kept.card.name}\n---\nShow the flag\n`,
    );
    fs.writeFileSync(path.join(INBOX, 'notes.txt'), 'Refactor everything.\n');
    fs.mkdirSync(path.join(INBOX, 'drafts'));
    fs.writeFileSync(path.join(INBOX, 'drafts', 'idea.md'), 'Refactor everything.\n');
    before = runsWritten();
    there = inbox();
  });
  const inbox = () => [...inInbox(), ...fs.readdirSync(INBOX)].sort();
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
  const rows: Record<string, () => [() => unknown, 'Missing' | 'Invalid', ...named: string[]]> = {
    'a card not there, naming those there are': () => [
      () => starting(path.join(INBOX, 'cache-the-view.md')),
      'Missing',
      'no card cache-the-view in',
      `Its cards are: ${cards.join(', ')}.`,
      'nemia start <name>',
      'nemia inbox add "<idea>"',
    ],
    'a name with no card, typed without its .md, never started as a run asked to do its own path': () => [
      () => starting(path.join(INBOX, 'cache-the-views')),
      'Missing',
      'no card cache-the-views in',
      `Its cards are: ${cards.join(', ')}.`,
    ],
    'a file in the inbox that is not a card, not read as a brief': () => [
      () => starting(path.join(INBOX, 'notes.txt'), '--workflows', 'dev'),
      'Missing',
      'no card notes.txt in',
    ],
    'a card in a folder inside the inbox': () => [
      () => starting(path.join(INBOX, 'drafts', 'idea.md'), '--workflows', 'dev'),
      'Invalid',
      "`drafts/idea` is not a card's name",
      'no slash',
    ],
    'a name that leaves the inbox': () => [
      () => fromInbox({ name: '../runs/x', callerRepo: repo }),
      'Invalid',
      "`../runs/x` is not a card's name",
      'no slash',
    ],
    'a name with a slash': () => [() => fromInbox({ name: 'a/b', callerRepo: repo }), 'Invalid', "`a/b` is not a card's name"],
    'no name': () => [() => fromInbox({ name: '', callerRepo: repo }), 'Invalid', 'this name is empty', 'nemia inbox lists'],
    'no workflow from the card or the flag, naming those the repository has': () => [
      () => starting(kept.file),
      'Invalid',
      `${kept.card.file}: no workflow`,
      `${path.join(repo, 'workflows')} offers: dev, ui.`,
      `nemia start ${kept.card.name} --workflows dev`,
      '`workflow: dev`',
    ],
    'no workflow, on a repository that has none': () => [
      () => fromInbox({ name: loose.card.name, callerRepo: fs.mkdtempSync(path.join(ROOT, 'bare-')) }),
      'Invalid',
      `${loose.card.file}: no workflow`,
      'offers none',
      `nemia start ${loose.card.name} --workflows <name>`,
    ],
    'a workflow given as a path': () => [
      () => starting(kept.file, '--workflows', path.join(repo, 'workflows', 'dev')),
      'Invalid',
      `--workflows ${path.join(repo, 'workflows', 'dev')}`,
      'Nothing was started.',
    ],
    '--repo, the card naming its factory and workflow, never a repository': () => [
      () => starting(other.file, '--repo', repo),
      'Invalid',
      'does not take --repo',
      'nemia factory attach <factory> <workflow> --repo <name>',
    ],
    "the card's workflow does not load": () => [
      () => starting(nope.file),
      'Invalid',
      `${nope.card.file}: \`workflow: nope\``,
      `no workflow folder at ${path.join(INBOX, 'nope')},`,
      `named nope in ${path.join(repo, 'workflows')}.`,
      'workflows are: dev, ui',
    ],
    "the flag's workflow does not load": () => [
      () => starting(kept.file, '--workflows', 'nope'),
      'Invalid',
      'no workflow folder at ',
      `named nope in ${path.join(repo, 'workflows')}.`,
      'workflows are: dev, ui',
    ],
    'a card that does not read: `after:` naming a card twice': () => [
      () => starting(path.join(INBOX, 'hand-written-a1b2.md')),
      'Invalid',
      'hand-written-a1b2.md: `after:',
      `names ${kept.card.name} twice`,
    ],
    'a blank brief, to startFromInbox': () => [
      () => fromInbox({ name: kept.card.name, workflow: 'dev', brief: '  \n', callerRepo: repo }),
      'Invalid',
      `${kept.card.file}: the brief`,
      'is empty',
      'Give what the run is asked to do',
      'leave it out',
    ],
    '--brief twice': () => [
      () => starting(kept.file, '--workflows', 'dev', '--brief', 'x', '--brief', 'y'),
      'Invalid',
      'nemia start takes --brief once',
    ],
    'an --after start() refuses': () => [
      () => starting(kept.file, '--workflows', 'dev', '--after', 'no-such-run-zz99'),
      'Invalid',
      '--after no-such-run-zz99',
      'nemia ls',
    ],
    'a `from:` run also waited on': () => [
      () => fromInbox({ name: sourced.card.name, workflow: 'dev', callerRepo: repo, after: ['source-a1'] }),
      'Invalid',
      'from: source-a1',
      '--after source-a1',
    ],
  };
  for (const [name, later] of Object.entries(rows))
    test(name, async () => {
      const [refused, tag, ...named] = later();
      await assert.rejects(async () => await refused(), refusedWith(tag, ...named));
      assert.equal(runsWritten(), before, 'no run written');
      assert.deepEqual(inbox(), there, 'every card still in the inbox');
    });
  afterAll(() => {
    dropRecord(ROOT, runKey('source-a1'));
  });
});
test("a queued card started has its `queued:` line taken off, every other line kept; one whose line cannot be taken off is started all the same, says so, and stays out of the queue while its run's record stands", async () => {
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
  assert.equal(cardAt(taken), `---\nworkflow: dev\n---\nCache the views\n`);
  assert.deepEqual(
    (await judgedInbox()).map((l) => [l.name, l.state, l.queued]),
    [['taken-a1b2', 'running', undefined]],
  );

  queuedCard('left-c3d4');
  const kept = await runPlaced(
    Effect.gen(function* () {
      const door = yield* CardDoor;
      const stuck: CardDoorShape = {
        ...door,
        cards: { ...door.cards, rewrite: () => Effect.die(Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' })) },
      };
      return yield* startFromInbox({ name: 'left-c3d4', callerRepo: repo }).pipe(Effect.provideService(CardDoor, stuck));
    }),
  );
  const id = kept.run.id;
  assert.deepEqual(runRecord(ROOT, id).from, { inbox: 'left-c3d4' }, 'the card it came from');
  assert.ok(kept.queueLeft, "the start says why the card's queued: line is still on it");
  const listed = (await judgedInbox()).find((l) => l.name === 'left-c3d4')!;
  assert.deepEqual([listed.state, listed.queued], ['running', { at: '2026-09-16T10:00:00.000Z', place: null }]);
  assert.match(
    (await listedLines()).find((line) => line.startsWith('left-c3d4'))!,
    new RegExp(`started as ${escaped(id)}, running$`),
  );
});

test('a card gone between its start and the taking off of its `queued:` line is not written back, and the run stands', async () => {
  emptyInbox();
  const repo = aRepoWith('dev');
  const file = path.join(INBOX, 'gone-a1b2.md');
  fs.mkdirSync(INBOX, { recursive: true });
  fs.writeFileSync(file, `---\nworkflow: dev\nrepo: ${repo}\nqueued: 2026-09-16T10:00:00.000Z\n---\nCache the views\n`);
  const started = await runPlaced(
    Effect.gen(function* () {
      const door = yield* RunDoor;
      const cards = yield* CardDoor;
      const racing: RunDoorShape = {
        ...door,
        runs: {
          ...door.runs,
          create: (...made: Parameters<RunDoorShape['runs']['create']>) =>
            Effect.tap(door.runs.create(...made), () => cards.cards.drop(CardName.read('gone-a1b2'))),
        },
      };
      return yield* startFromInbox({ name: 'gone-a1b2', callerRepo: repo }).pipe(Effect.provideService(RunDoor, racing));
    }),
  );
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
  assert.match(cardAt(typed.file), /\nlabels:\n {2}team: core\n {2}tier: one\n---\n/, 'written as labels:');

  const fromRuns = addToInbox({ text: `---\nfrom: ${a.id}, ${b.id}\n---\nShow the flag\n`, workflow: 'dev' });
  assert.deepEqual(fromRuns.card.labels, { area: 'inbox' }, 'what its from: runs agree on');
  assert.deepEqual(
    fromRuns.labelsLeftOut?.map((l) => l.key),
    ['team'],
    'the key they disagree on, left out and said',
  );
  const bare = addToInbox({ text: 'Plain idea', workflow: 'dev' });
  assert.equal(cardAt(bare.file).includes('labels'), false, 'none given, none written');

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

describe('REFUSED: `nemia inbox -l` with a malformed selector, and `nemia inbox add --label` with a reserved key — Invalid, exit 2, nothing filed', () => {
  beforeAll(() => {
    emptyInbox();
  });
  test('a malformed selector', () =>
    assert.throws(
      () => atRoot(verbs.INBOX.handler({ selector: ['team==core=x'] }) as Effect.Effect<unknown, unknown>),
      refusedWith('Invalid', '-l'),
    ));
  test('a reserved key', () => {
    assert.throws(
      () => addToInbox({ text: 'Cache the views', workflow: 'dev', labels: ['reason=x'] }),
      refusedWith('Invalid', '--label', 'reason'),
    );
    assert.equal(inInbox().length, 0, 'nothing filed');
  });
});

test('REFUSED: a card filed with a label its factory does not take, nothing filed; a value it takes, a key it names not, or none, files', async () => {
  emptyInbox();
  const repo = aRepoWith('dev');
  addFactoryAt(ROOT, { name: 'lv', volumes: [`${repo}:rw`] });
  const file = path.join(ROOT, 'factories', 'lv.json');
  fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf8')), labelValues: { work: ['feature', 'fix'] } }));
  const cards = () => (fs.existsSync(INBOX) ? fs.readdirSync(INBOX).length : 0);

  assert.throws(
    () => addToInbox({ text: 'Store it', factory: 'lv', labels: ['work=store'] }),
    refusedWith('Invalid', 'work=store', 'feature'),
  );
  assert.equal(cards(), 0, 'nothing filed');
  assert.throws(
    () => addToInbox({ text: '---\nlabels:\n  work: store\n---\nStore it\n', factory: 'lv' }),
    refusedWith('Invalid', 'work=store'),
    "the text's own labels: are given too",
  );
  assert.equal(cards(), 0, 'nothing filed');

  assert.deepEqual(addToInbox({ text: 'Fix it', factory: 'lv', labels: ['work=fix'] }).card.labels, { work: 'fix' });
  assert.equal(addToInbox({ text: 'No work', factory: 'lv' }).card.labels, undefined);
  assert.deepEqual(addToInbox({ text: 'Any area', factory: 'lv', labels: ['area=anything'] }).card.labels, { area: 'anything' });
  assert.deepEqual(
    addToInbox({ text: 'Default', labels: ['work=store'] }).card.labels,
    { work: 'store' },
    'the default factory judges none',
  );
  const unread = path.join(ROOT, 'factories', 'unread.json');
  fs.writeFileSync(unread, '{ not json');
  try {
    assert.deepEqual(
      addToInbox({ text: 'Unread factory', factory: 'unread', labels: ['work=store'] }).card.labels,
      { work: 'store' },
      'a factory whose file does not read judges none: the start says what is wrong with it',
    );
  } finally {
    fs.rmSync(unread);
  }

  const parent = await runPlaced(startRun({ brief: 'parent', repo, workflowDir: path.join(repo, 'workflows', 'dev') }));
  filed.labels.put(parent.id, { work: 'store' });
  const before = cards();
  assert.throws(
    () => addToInbox({ text: `---\nfrom: ${parent.id}\n---\nFrom a run\n`, factory: 'lv' }),
    refusedWith('Invalid', 'work=store'),
    'a label its from: run hands down is judged, a new card having none that stands',
  );
  assert.equal(cards(), before, 'nothing filed');
  assert.deepEqual(
    addToInbox({ text: `---\nfrom: ${parent.id}\n---\nFrom a run\n`, factory: 'lv', labels: ['work=fix'] }).card.labels,
    { work: 'fix' },
    'an edit over the inherited value files',
  );
});
