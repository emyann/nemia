/**
 * The library's writers — `agents write`, `skills write` and `workflows write`, and `agents rm`, `agents run` and `workflows rm` — on
 * their entries' handlers, which the api calls once the client (`apps/cli`) has read the person's files and words: the last three read
 * by their words (`test/typed.ts`), as the client parses them. Told as a person's story into yours under a scratch `WF_ROOT`, and read
 * back from disk. And a table: each refusal at shipped defaults — the place, a version left out, taken or moved on from, a name — by its
 * kind and exit 2, naming the fix, yours left as it was. And the rule both sides keep: a command the client holds (`objects`'
 * `COMMAND_WORDS`) is no name of this CLI's, which prints its help for it; no writer is left to it.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { COMMAND_WORDS } from 'objects';
import { testEngine } from 'agent-runtime/testing';
import { eachTest, runOver } from './placed.ts';
import { scratch } from 'test-kit/scratch';
import { testPlace } from '../place/memory/index.ts';
import { TEAM } from './team.ts';
import { names } from './assessed.ts';
import { story } from './story.ts';
import { main } from '../src/cli/main.ts';
import { typed as asked } from './typed.ts';
import { HELP } from '../src/cli/flags.ts';
import {
  AGENTS_WRITE,
  draftSteps,
  factoryDraftOf,
  runWith as runEngine,
  SKILLS_WRITE,
  StoreRoot,
  TABLE,
  WORKFLOWS_WRITE,
  workflowDraftOfFiles,
} from '../src/runner.ts';
import { agentDraftOf, skillDraftOf } from '../src/workflow.ts';
import { engineOf } from '../src/runtime-client.ts';
import type { Env } from '../src/config/config.store.ts';

const ROOT = scratch('wf-writers-cli-');
process.env.NEMIA_DAEMON_START = 'off';
const ENV: Env = { ...process.env, WF_ROOT: ROOT, WF_VERIFY_REST: '1' };
type Args = import('../src/command/command.ts').Args;
type Command = import('../src/command/entry.verb.ts').Command;

/** The engine's stand-in, new for each test and with no task: every run it is asked of has filed nothing yet. */
const engine = eachTest(testEngine);
const stand = eachTest(testPlace);
const runWith = runOver(runEngine, () => stand().layer, ENV);

const YOURS = path.join(ROOT, 'workflows');
const DRAFTS = scratch('wf-writers-cli-drafts-');

/** What this CLI's `main` printed on stdout for `nemia <argv>`, or the words it was refused with, its kind (`_tag`) and its exit code. */
async function said(t: TestContext, ...argv: string[]): Promise<{ out: string; refused?: string; tag?: string; exitCode?: number }> {
  const out: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => void out.push(args.join(' ')));
  const err = t.mock.method(console, 'error', () => undefined);
  try {
    await main(argv, engineOf(engine().layer), undefined, undefined, ENV);
    return { out: out.join('\n') };
  } catch (e) {
    const { message, _tag, exitCode } = e as Error & { _tag?: string; exitCode?: number };
    return { out: out.join('\n'), refused: message, tag: _tag, exitCode };
  } finally {
    log.mock.restore();
    err.mock.restore();
  }
}

/** What the handler of the entry `nemia <argv>` names answers, read by its words (`asked`, `test/typed.ts`), over the test's engine. */
const answered = <D>(...argv: string[]): Promise<D> => asked(argv, engineOf(engine().layer), undefined, undefined, ENV) as Promise<D>;

/** What the handler of `nemia <argv>` was refused with, its kind (`_tag`) and its exit code; none where it answered. */
async function typed(_t: TestContext, ...argv: string[]): Promise<{ refused?: string; tag?: string; exitCode?: number }> {
  try {
    await answered(...argv);
    return {};
  } catch (e) {
    const { message, _tag, exitCode } = e as Error & { _tag?: string; exitCode?: number };
    return { refused: message, tag: _tag, exitCode };
  }
}

/** What `program` — an entry's handler, as the api calls it — answers at the test's store. */
const handled = <A, E>(program: Parameters<typeof runWith<A, E>>[1]): Promise<A> => runWith(engineOf(engine().layer), program);

/** Each file under `dir`, by its path there, with what it holds: yours as it stands. */
const snapshot = (dir: string): Record<string, string> =>
  fs.existsSync(dir)
    ? Object.fromEntries(
        (fs.readdirSync(dir, { recursive: true }) as string[])
          .sort()
          .filter((f) => fs.statSync(path.join(dir, f)).isFile())
          .map((f) => [f, fs.readFileSync(path.join(dir, f), 'utf8')]),
      )
    : {};

/** A refusal as a test reads it: its words, its kind (`_tag`) and its exit code. */
type Refused = { refused?: string; tag?: string; exitCode?: number };

/**
 * What `act` was refused with, as `tag` with exit 2, yours left as it was, its words naming each of `facts` — the command, the flag, the
 * folder — never asserted as a sentence.
 */
async function refusedBy(
  act: () => Promise<Refused>,
  what: string,
  tag: 'Invalid' | 'Conflict' | 'Missing',
  ...facts: string[]
): Promise<void> {
  const before = snapshot(YOURS);
  const { refused: words, tag: kind, exitCode } = await act();
  assert.ok(words, `${what} was refused`);
  assert.deepEqual([kind, exitCode], [tag, 2], words);
  names(words, ...facts);
  assert.deepEqual(snapshot(YOURS), before, `a refused ${what} leaves yours as it was`);
}

/** `nemia <argv>` refused as `refusedBy` says. */
const refusedAs = (t: TestContext, tag: 'Invalid' | 'Conflict' | 'Missing', argv: string[], ...facts: string[]): Promise<void> =>
  refusedBy(() => typed(t, ...argv), `nemia ${argv.join(' ')}`, tag, ...facts);

/** What the handler's `program` was refused with: none where it answered. */
const refusalOf = async <A, E>(program: Parameters<typeof runWith<A, E>>[1]): Promise<Refused> => {
  try {
    await handled(program);
    return {};
  } catch (e) {
    const { message, _tag, exitCode } = e as Error & { _tag?: string; exitCode?: number };
    return { refused: message, tag: _tag, exitCode };
  }
};

/** A draft file `name` under the drafts, holding `text`: its path. */
function drafted(name: string, text: string): string {
  const file = path.join(DRAFTS, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
}

const SCRIBE =
  '---\ndescription: Use this when a change needs its notes written.\nmodel: sonnet\noutput: scribe.schema.json\n---\nWrite the notes.\n';
const SCHEMA = JSON.stringify({
  type: 'object',
  additionalProperties: false,
  required: ['notes'],
  properties: { notes: { type: 'string' } },
});
const TIDY = '---\nname: tidy\ndescription: Tidy a folder.\n---\nTidy it.\n';

/** The draft of the agent `name` whose file says `text`, as the api reads it off the files sent (`agents.read`). */
const agentDraft = (name: string, text: string) => agentDraftOf(name, text, (file) => (file === 'scribe.schema.json' ? SCHEMA : undefined));

/** The change of the skill `name` whose SKILL.md says `text`, as the api reads it off the file sent (`skills.read`). */
const skillChange = (name: string, text: string) => skillDraftOf(`${name}/SKILL.md`, name, text);

/** The tests' team's `dev` copied as a draft folder `name`, its agents and skills put in yours, where a start finds them. */
function draftWorkflow(name: string): string {
  for (const part of ['agents', 'skills']) fs.cpSync(path.join(TEAM, part), path.join(YOURS, part), { recursive: true, force: false });
  const folder = path.join(DRAFTS, 'workflows', name);
  fs.cpSync(path.join(TEAM, 'dev'), folder, { recursive: true });
  return folder;
}

/** The files directly in the draft folder `folder`, each by its name with its text, as the client sends them. */
const filesOf = (folder: string) =>
  fs
    .readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort()
    .map((name) => ({ path: name, text: fs.readFileSync(path.join(folder, name), 'utf8') }));

/**
 * What `workflows write`'s handler is handed for the draft folder `folder` written as `name`: its steps, README and other files as the
 * api reads them off the files sent (`workflowDraftOfFiles`), with its agents and skills looked for in yours.
 */
const workflowInput = async (name: string, folder: string) => {
  const read = await handled(Effect.provideService(workflowDraftOfFiles(name, filesOf(folder), { home: ROOT }), StoreRoot, ROOT));
  return {
    draft: read.steps,
    ...(read.readme !== null && { readme: read.readme }),
    ...(read.files.length > 0 && { files: [...read.files] }),
  };
};

test('a person writes their library: an agent, a skill and a workflow, each changed at its version, renamed or removed, and an agent tried', async (t) => {
  const s = story(t);
  const agents = path.join(YOURS, 'agents');
  let at = '';

  await s.test("agents write's handler writes an agent of yours from its draft, with the schema it names", async () => {
    const made = await handled(
      AGENTS_WRITE.handler({ from: 'yours', draft: agentDraft('scribe', SCRIBE), schema: { file: 'scribe.schema.json', text: SCHEMA } }),
    );
    assert.deepEqual([made.dir, made.agent.name, [...made.written].sort()], [agents, 'scribe', ['scribe.md', 'scribe.schema.json']]);
    assert.equal(fs.readFileSync(path.join(agents, 'scribe.md'), 'utf8'), SCRIBE);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(agents, 'scribe.schema.json'), 'utf8')), JSON.parse(SCHEMA));
    at = made.version;
  });

  await s.test('changed at its version, then renamed from the name it is at', async () => {
    const opus = SCRIBE.replace('model: sonnet', 'model: opus');
    const schema = { file: 'scribe.schema.json', text: SCHEMA };
    const changed = await handled(
      AGENTS_WRITE.handler({ from: 'yours', name: 'scribe', draft: agentDraft('scribe', opus), schema, version: at }),
    );
    assert.match(fs.readFileSync(path.join(agents, 'scribe.md'), 'utf8'), /^model: opus$/m);
    const notary = agentDraft('notary', SCRIBE.replace('output: scribe.schema.json\n', ''));
    const renamed = await handled(
      AGENTS_WRITE.handler({ from: 'yours', name: 'scribe', draft: notary, schema: null, version: changed.version }),
    );
    assert.equal(renamed.agent.name, 'notary');
    assert.ok(renamed.removed.includes('scribe.md'), renamed.removed.join(', '));
    assert.equal(fs.existsSync(path.join(agents, 'notary.md')), true);
    assert.equal(fs.existsSync(path.join(agents, 'scribe.md')), false);
    at = renamed.version;
  });

  await s.test('nemia agents rm removes it at the version it was read at', async () => {
    assert.deepEqual(await answered('agents', 'remove', 'yours', 'notary', '--version', at), { dir: agents, removed: ['notary.md'] });
    assert.equal(fs.existsSync(path.join(agents, 'notary.md')), false);
  });

  await s.test("skills write's handler writes a skill of yours from its SKILL.md's draft, and changes it at its version", async () => {
    const made = await handled(SKILLS_WRITE.handler({ from: 'yours', change: skillChange('tidy', TIDY) }));
    assert.deepEqual([made.dir, made.written], [path.join(YOURS, 'skills', 'tidy'), ['SKILL.md']]);
    assert.match(
      fs.readFileSync(path.join(YOURS, 'skills', 'tidy', 'SKILL.md'), 'utf8'),
      /^name: tidy\ndescription: "?Tidy a folder\."?\n---\nTidy it\.\n$/m,
    );
    const version = 'version' in made ? made.version : assert.fail('a written skill says its version');
    const well = skillChange('tidy', TIDY.replace('Tidy a folder.', 'Tidy a folder well.'));
    await handled(SKILLS_WRITE.handler({ from: 'yours', name: 'tidy', change: well, version }));
    assert.match(fs.readFileSync(path.join(YOURS, 'skills', 'tidy', 'SKILL.md'), 'utf8'), /Tidy a folder well\./);
  });

  await s.test(
    "workflows write's handler writes a draft folder into yours and changes it at its version; nemia workflows rm removes it at its version",
    async () => {
      const folder = draftWorkflow('notes');
      const made = await handled(WORKFLOWS_WRITE.handler({ from: 'yours', name: 'notes', ...(await workflowInput('notes', folder)) }));
      assert.deepEqual(
        [made.dir, [...made.written, ...made.kept].sort()],
        [path.join(YOURS, 'notes'), ['README.md', 'implement.md', 'review.md', 'ship.md']],
      );
      assert.deepEqual(Object.keys(snapshot(path.join(YOURS, 'notes'))), Object.keys(snapshot(folder)));
      fs.appendFileSync(path.join(folder, 'README.md'), '\nChanged.\n');
      const changed = await handled(
        WORKFLOWS_WRITE.handler({ from: 'yours', name: 'notes', version: made.version, ...(await workflowInput('notes', folder)) }),
      );
      assert.match(fs.readFileSync(path.join(YOURS, 'notes', 'README.md'), 'utf8'), /Changed\.$/m);
      const gone = await answered('workflows', 'remove', 'yours', 'notes', '--version', changed.version);
      assert.deepEqual(gone, { dir: path.join(YOURS, 'notes'), removed: ['README.md', 'implement.md', 'review.md', 'ship.md'] });
      assert.equal(fs.existsSync(path.join(YOURS, 'notes')), false);
    },
  );

  await s.test(
    "workflows write's handler writes the scripts and the schemas a draft folder carries, its step judged against the schema carried, and leaves a file it does not carry",
    async () => {
      const folder = path.join(DRAFTS, 'workflows', 'carry');
      fs.mkdirSync(folder, { recursive: true });
      fs.writeFileSync(path.join(folder, 'only.md'), '---\nplace: git\noutput: only.schema.json\n---\nDo it.\n');
      const schema = (field: string) =>
        `${JSON.stringify({ type: 'object', additionalProperties: false, required: [field], properties: { [field]: { type: 'string' } } })}\n`;
      fs.writeFileSync(path.join(folder, 'only.schema.json'), schema('size'));
      fs.writeFileSync(path.join(folder, 'pictures.ts'), 'process.exit(0);\n');
      fs.writeFileSync(path.join(folder, 'landing.ts'), 'process.exit(1);\n');
      const made = await handled(WORKFLOWS_WRITE.handler({ from: 'yours', name: 'carry', ...(await workflowInput('carry', folder)) }));
      const there = path.join(YOURS, 'carry');
      assert.deepEqual(Object.keys(snapshot(there)), Object.keys(snapshot(folder)));
      fs.rmSync(path.join(folder, 'landing.ts'));
      fs.writeFileSync(path.join(folder, 'only.schema.json'), schema('pages'));
      await handled(
        WORKFLOWS_WRITE.handler({ from: 'yours', name: 'carry', version: made.version, ...(await workflowInput('carry', folder)) }),
      );
      assert.equal(fs.readFileSync(path.join(there, 'only.schema.json'), 'utf8'), schema('pages'));
      assert.equal(fs.readFileSync(path.join(there, 'pictures.ts'), 'utf8'), 'process.exit(0);\n');
      assert.equal(fs.readFileSync(path.join(there, 'landing.ts'), 'utf8'), 'process.exit(1);\n');
    },
  );

  await s.test(
    "workflows write's handler into a templated factory's tree judges its draft as a run of the factory reads it: with its hires, and the skills of its repository",
    async () => {
      const repo = scratch('wf-writers-cli-shop-repo-');
      fs.mkdirSync(path.join(repo, '.claude', 'skills', 'tidy'), { recursive: true });
      fs.writeFileSync(path.join(repo, '.claude', 'skills', 'tidy', 'SKILL.md'), TIDY);
      const factories = path.join(ROOT, 'factories');
      const tree = path.join(factories, 'shop', 'tree');
      fs.mkdirSync(path.join(tree, 'workflows', 'agents'), { recursive: true });
      fs.writeFileSync(path.join(tree, 'workflows', 'agents', 'scribe.md'), SCRIBE.replace('output: scribe.schema.json\n', ''));
      fs.writeFileSync(path.join(tree, 'factory.json'), JSON.stringify({ workflows: ['hired'], hires: { 'hired/only': 'scribe' } }));
      const template = { source: path.join(DRAFTS, 'shop.tgz'), version: '1.0.0', params: {} };
      fs.writeFileSync(path.join(factories, 'shop.json'), JSON.stringify({ repos: [repo], template }));
      const folder = path.join(DRAFTS, 'workflows', 'hired');
      fs.mkdirSync(folder, { recursive: true });
      fs.writeFileSync(path.join(folder, 'only.md'), '---\nplace: git\nskills: [tidy]\n---\n');
      const { places, fills } = factoryDraftOf(ROOT, 'shop', 'hired');
      const draft = await handled(Effect.provideService(draftSteps(folder, places, fills), StoreRoot, ROOT));
      await handled(WORKFLOWS_WRITE.handler({ from: 'factory', name: 'hired', factory: 'shop', draft }));
      const written = fs.readFileSync(path.join(tree, 'workflows', 'hired', 'only.md'), 'utf8');
      assert.match(written, /skills:/);
      assert.doesNotMatch(written, /^agent:/m, "the hire is the factory's, never written into the step");
    },
  );

  await s.test(
    'nemia agents run starts a try of an agent of yours with no repository; REFUSED while it moves, with no brief, for none there, in the repository',
    async (sub) => {
      const taster = agentDraft('taster', '---\ndescription: Use this to taste it.\nmodel: sonnet\n---\nTaste it.\n');
      await handled(AGENTS_WRITE.handler({ from: 'yours', draft: taster, schema: null }));
      const { id } = await answered<{ id: string }>('agents', 'try', 'yours', 'taster', '--brief', '  Taste the soup.  ');
      const run = JSON.parse(fs.readFileSync(path.join(ROOT, 'runs', `${id}.json`), 'utf8'));
      assert.equal(run.repo, undefined, 'with no repository');
      assert.equal(run.brief, 'Taste the soup.');
      assert.equal(run.workflowDir, path.join(ROOT, 'tries', 'taster'));
      assert.equal(run.workflow[0].agent.name, 'taster');
      const runs = () => fs.readdirSync(path.join(ROOT, 'runs')).sort();
      const before = runs();
      await refusedAs(sub, 'Conflict', ['agents', 'try', 'yours', 'taster', '--brief', 'Once more.'], `still running (${id})`);
      await refusedAs(
        sub,
        'Invalid',
        ['agents', 'try', 'yours', 'taster', '--brief', '  '],
        'The brief is empty',
        'Write what it should do',
      );
      await refusedAs(sub, 'Missing', ['agents', 'try', 'yours', 'nobody', '--brief', 'Do it.'], "Yours has no agent named 'nobody'");
      await refusedAs(
        sub,
        'Invalid',
        ['agents', 'try', 'repo', 'taster', '--brief', 'Do it.'],
        'nemia agents run refuses',
        "the repository's agents",
        'only yours is written',
        'copy the file into',
      );
      assert.deepEqual(runs(), before, 'and no run is started by a refused try');
    },
  );
});

test('REFUSED at shipped defaults: a writer, by its kind and exit 2, naming the fix, and yours as it was', async (t) => {
  const archivist = agentDraft('archivist', '---\ndescription: Use this to file things away.\n---\nFile it.\n');
  const agentAt = (await handled(AGENTS_WRITE.handler({ from: 'yours', draft: archivist, schema: null }))).version;
  const sweep = skillChange('sweep', TIDY.replace('name: tidy', 'name: sweep'));
  const sweepMade = await handled(SKILLS_WRITE.handler({ from: 'yours', change: sweep }));
  const skillAt = 'version' in sweepMade ? sweepMade.version : assert.fail('a written skill says its version');
  const triage = await workflowInput('triage', draftWorkflow('triage'));
  const workflowAt = (await handled(WORKFLOWS_WRITE.handler({ from: 'yours', name: 'triage', ...triage }))).version;
  const repo = (what: string) => [`refuses`, `the repository's ${what}`];
  type Act = (sub: TestContext) => () => Promise<Refused>;
  const handler =
    (program: Parameters<typeof runWith<unknown, unknown>>[1]): Act =>
    () =>
    () =>
      refusalOf(program);
  const typedAt =
    (argv: string[]): Act =>
    (sub) =>
    () =>
      typed(sub, ...argv);

  const table: ReadonlyArray<[string, 'Invalid' | 'Conflict' | 'Missing', Act, ...string[]]> = [
    [
      'an agent written where one is, naming its version',
      'Conflict',
      handler(AGENTS_WRITE.handler({ from: 'yours', draft: archivist, schema: null })),
      'agents/archivist.md is there already',
      `version ${agentAt}`,
    ],
    [
      'an agent written at a version it moved on from',
      'Conflict',
      handler(AGENTS_WRITE.handler({ from: 'yours', name: 'archivist', draft: archivist, schema: null, version: '0000000000000000' })),
      `version 0000000000000000, now ${agentAt}`,
    ],
    [
      'an agent written into the repository',
      'Invalid',
      handler(AGENTS_WRITE.handler({ from: 'repo', draft: archivist, schema: null })),
      'nemia agents write',
      ...repo('agents'),
      'only yours is written',
      'copy the file into',
    ],
    [
      'an agent removed with no version, naming the one it is at',
      'Invalid',
      typedAt(['agents', 'remove', 'yours', 'archivist']),
      `agents/archivist.md is at version ${agentAt}`,
      'Give that version to remove it',
    ],
    [
      'an agent removed at a version it moved on from',
      'Conflict',
      typedAt(['agents', 'remove', 'yours', 'archivist', '--version', '0000000000000000']),
      'changed since it was read',
    ],
    ['an agent removed that is not there', 'Missing', typedAt(['agents', 'remove', 'yours', 'nobody', '--version', agentAt]), 'nobody'],
    [
      'an agent removed from the repository',
      'Invalid',
      typedAt(['agents', 'remove', 'repo', 'archivist', '--version', agentAt]),
      'nemia agents rm',
      ...repo('agents'),
      'only yours is written',
      'copy the file into',
    ],
    [
      'a skill written where one is, naming its version',
      'Conflict',
      handler(SKILLS_WRITE.handler({ from: 'yours', change: sweep })),
      'skills/sweep is there already',
      `version ${skillAt}`,
    ],
    [
      'a skill written at a version it moved on from',
      'Conflict',
      handler(SKILLS_WRITE.handler({ from: 'yours', name: 'sweep', change: sweep, version: '0000000000000000' })),
      '0000000000000000',
    ],
    [
      'a skill written into the repository',
      'Invalid',
      handler(SKILLS_WRITE.handler({ from: 'repo', change: sweep })),
      'nemia skills write',
      ...repo('skills'),
      'only your library is written',
      'copy its folder into the repository',
    ],
    [
      'a workflow written by a bad name',
      'Invalid',
      handler(WORKFLOWS_WRITE.handler({ from: 'yours', name: '../review', ...triage })),
      'nemia workflows write',
      "`../review` is not a workflow's name",
    ],
    [
      'a workflow written into the repository',
      'Invalid',
      handler(WORKFLOWS_WRITE.handler({ from: 'repo', name: 'review', ...triage })),
      'nemia workflows write',
      ...repo('workflows'),
      'only yours is written',
      'copy the folder into',
    ],
    [
      'a workflow removed from the agents’ folder',
      'Invalid',
      typedAt(['workflows', 'remove', 'yours', 'agents', '--version', workflowAt]),
      'nemia workflows rm: agents/ holds',
      "Name the workflow's folder",
    ],
    [
      'a workflow removed in the repository',
      'Invalid',
      typedAt(['workflows', 'remove', 'repo', 'triage', '--version', workflowAt]),
      'nemia workflows rm',
      ...repo('workflows'),
      'only yours is written',
      'copy the folder into',
    ],
  ];
  for (const [name, tag, act, ...facts] of table) await t.test(name, (sub) => refusedBy(act(sub), name, tag, ...facts));
});

/**
 * The keys the objects' handlers hand a writer's handler beside its spec (`apps/api/src/definitions/`): the Workflow's, Agent's and
 * Skill's verbs of `objects`' Api, which read a body of their own, so these keys left the spec with the entries' routes.
 */
const OBJECTS_HAND: Readonly<Record<string, readonly string[]>> = {
  'agents write': ['draft', 'schema', 'repo'],
  'agents rm': ['repo'],
  'agents run': ['repo'],
  'skills write': ['change', 'copy', 'builtin'],
  'workflows write': ['draft', 'readme', 'files', 'repo'],
  'workflows rm': ['repo'],
};

/**
 * The keys an entry's handler may be handed by either side: its positionals, its flags but those the command line alone takes, and those
 * the objects' handlers hand it.
 */
const handlerKeys = (command: Command): Set<string> =>
  new Set([
    ...command.spec.positionals.map((p) => p.key),
    ...command.spec.flags.flatMap((f) => (f.only?.side !== 'cli' && f.key !== undefined ? [f.key] : [])),
    ...(OBJECTS_HAND[command.name] ?? []),
  ]);

/** The keys `handed` that `command`'s handler is never handed by the api: none, where the two sides read one spec. */
const strayKeys = (command: Command, handed: Args): string[] => Object.keys(handed).filter((key) => !handlerKeys(command).has(key));

const entry = (name: string): Command => TABLE.find((c) => c.name === name) as Command;

/** The names of the commands the client holds, which this CLI no longer runs. */
const MOVED = COMMAND_WORDS.map((w) => w.name);

test('the command line hands each writer it still runs only what the api’s body could, read off the one spec both sides parse', async (t) => {
  await t.test('REFUSED: a key handed to a handler that its spec gives the command line alone, or gives no side', () => {
    assert.deepEqual(strayKeys(entry('agents write'), { from: 'yours', file: 'scribe.md', draft: '{}' }), ['file']);
    assert.deepEqual(strayKeys(entry('workflows write'), { from: 'yours', name: 'dev', folder: 'dev', steps: '[]' }), ['folder', 'steps']);
    assert.deepEqual(strayKeys(entry('skills write'), { from: 'yours', change: '{}', copy: 'tidy' }), []);
  });
  const writers = (TABLE as readonly Command[]).filter(
    (c) => c.writes && c.only?.side !== 'api' && !MOVED.includes(c.name) && /^(agents|skills|workflows) (write|rm|run)$/.test(c.name),
  );
  assert.deepEqual(
    writers.map((c) => c.name),
    [],
    "every writer is the client's: this CLI runs none",
  );
});

test("a command the client holds is no name of this CLI's: typed here, it prints the help, reaches no handler and writes nothing", async (t) => {
  const folder = draftWorkflow('held');
  const file = drafted('agents/held.md', SCRIBE);
  const skill = drafted('skills/held/SKILL.md', TIDY.replace('name: tidy', 'name: held'));
  const typedArgs: Record<string, string[]> = {
    'workflows write': ['workflows', 'write', 'yours', 'held', '--folder', folder],
    'agents write': ['agents', 'write', 'yours', '--file', file],
    'skills write': ['skills', 'write', 'yours', '--file', skill],
  };
  assert.deepEqual(
    Object.keys(typedArgs).filter((name) => !MOVED.includes(name)),
    [],
    'each typed here is one the client holds',
  );
  for (const name of MOVED)
    await t.test(`nemia ${name}`, async (sub) => {
      const handed: unknown[] = [];
      const handler = sub.mock.method(entry(name) as unknown as { handler: (args: Args) => never }, 'handler', (args: Args) => {
        handed.push(args);
        throw new Error('handed');
      });
      const before = snapshot(YOURS);
      const { out, refused } = await said(sub, ...(typedArgs[name] ?? [...name.split(' '), 'x']));
      handler.mock.restore();
      assert.equal(refused, undefined, refused);
      assert.equal(out, HELP, `nemia ${name} prints the help`);
      assert.deepEqual(handed, [], `nemia ${name} reaches no handler here`);
      assert.deepEqual(snapshot(YOURS), before, `nemia ${name} writes nothing here`);
    });
});
