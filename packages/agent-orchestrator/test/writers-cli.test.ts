/**
 * The library's writers at the command line — `nemia agents write`, `agents rm`, `agents run`, `skills write`, `workflows write` and
 * `workflows rm` — told as a person's story: each typed as a person types it, on a file or a draft folder they wrote, into yours under
 * a scratch `WF_ROOT`, and read back from disk. And a table: each refusal at shipped defaults — the place, a version left out, taken or
 * moved on from, a name, a path that is not there, a key the api alone takes — by its kind and exit 2, naming the fix, yours left as it
 * was. And the rule both sides keep: the command line hands each entry's handler only the keys the api's body could, read off its spec.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { testEngine } from 'agent-runtime/testing';
import { eachTest } from './placed.ts';
import { scratch } from './scratch.ts';
import { TEAM } from './team.ts';
import { names } from './assessed.ts';
import { story } from './story.ts';

const ROOT = scratch('wf-writers-cli-');
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
process.env.NEMIA_DAEMON_START = 'off';
const { main } = await import('../src/cli/main.ts');
const { TABLE } = await import('../src/runner.ts');
type Args = import('../src/command/command.ts').Args;
type Command = import('../src/command/entry.verb.ts').Command;

const { engineOf } = await import('../src/runtime-client.ts');

/** The engine's stand-in, new for each test and with no task: every run it is asked of has filed nothing yet. */
const engine = eachTest(testEngine);

const YOURS = path.join(ROOT, 'workflows');
const DRAFTS = scratch('wf-writers-cli-drafts-');

/** What `nemia <argv>` printed on stdout, or the words it was refused with, its kind (`_tag`) and its exit code. */
async function typed(t: TestContext, ...argv: string[]): Promise<{ out: string; refused?: string; tag?: string; exitCode?: number }> {
  const out: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => void out.push(args.join(' ')));
  const err = t.mock.method(console, 'error', () => undefined);
  try {
    await main(argv, engineOf(engine().layer));
    return { out: out.join('\n') };
  } catch (e) {
    const { message, _tag, exitCode } = e as Error & { _tag?: string; exitCode?: number };
    return { out: out.join('\n'), refused: message, tag: _tag, exitCode };
  } finally {
    log.mock.restore();
    err.mock.restore();
  }
}

/** What `nemia <argv>` printed, which it must not have been refused. */
async function done(t: TestContext, ...argv: string[]): Promise<string> {
  const { out, refused } = await typed(t, ...argv);
  assert.equal(refused, undefined, refused);
  return out;
}

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

/**
 * `nemia <argv>` refused as `tag` with exit 2, yours left as it was, its words naming each of `facts` — the command, the flag, the
 * folder — never asserted as a sentence.
 */
async function refusedAs(t: TestContext, tag: 'Invalid' | 'Conflict' | 'Missing', argv: string[], ...facts: string[]): Promise<void> {
  const before = snapshot(YOURS);
  const { refused: words, tag: kind, exitCode } = await typed(t, ...argv);
  assert.ok(words, `nemia ${argv.join(' ')} was refused`);
  assert.deepEqual([kind, exitCode], [tag, 2], words);
  names(words, ...facts);
  assert.deepEqual(snapshot(YOURS), before, `a refused nemia ${argv.join(' ')} leaves yours as it was`);
}

/** The version a line says a thing is at. */
const versionIn = (words: string): string => /version ([0-9a-f]{16})/.exec(words)?.[1] ?? assert.fail(`no version in: ${words}`);

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

/** The tests' team's `dev` copied as a draft folder `name`, its agents and skills put in yours, where a start finds them. */
function draftWorkflow(name: string): string {
  for (const part of ['agents', 'skills']) fs.cpSync(path.join(TEAM, part), path.join(YOURS, part), { recursive: true, force: false });
  const folder = path.join(DRAFTS, 'workflows', name);
  fs.cpSync(path.join(TEAM, 'dev'), folder, { recursive: true });
  return folder;
}

test('a person writes their library at the command line: an agent, a skill and a workflow, each changed at its version, renamed or removed, and an agent tried', async (t) => {
  const s = story(t);
  const agents = path.join(YOURS, 'agents');
  const file = drafted('agents/scribe.md', SCRIBE);
  let at = '';

  await s.test('nemia agents write writes an agent of yours from its file, with the schema beside it', async (sub) => {
    drafted('agents/scribe.schema.json', SCHEMA);
    const made = await done(sub, 'agents', 'write', 'yours', '--file', file);
    assert.match(made, new RegExp(`^scribe written in ${agents}, at version [0-9a-f]{16}: scribe\\.schema\\.json, scribe\\.md$`));
    assert.equal(fs.readFileSync(path.join(agents, 'scribe.md'), 'utf8'), SCRIBE);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(agents, 'scribe.schema.json'), 'utf8')), JSON.parse(SCHEMA));
    at = versionIn(made);
  });

  await s.test('changed at its version, then renamed from the name it is at', async (sub) => {
    fs.writeFileSync(file, SCRIBE.replace('model: sonnet', 'model: opus'));
    const changed = await done(sub, 'agents', 'write', 'yours', 'scribe', '--file', file, '--version', at);
    assert.match(fs.readFileSync(path.join(agents, 'scribe.md'), 'utf8'), /^model: opus$/m);
    const notary = drafted('agents/notary.md', SCRIBE.replace('output: scribe.schema.json\n', ''));
    const renamed = await done(sub, 'agents', 'write', 'yours', 'scribe', '--file', notary, '--version', versionIn(changed));
    assert.match(renamed, /^notary written in .*\nremoved: scribe\.md/);
    assert.equal(fs.existsSync(path.join(agents, 'notary.md')), true);
    assert.equal(fs.existsSync(path.join(agents, 'scribe.md')), false);
    at = versionIn(renamed);
  });

  await s.test('nemia agents rm removes it at the version it was read at', async (sub) => {
    assert.equal(await done(sub, 'agents', 'remove', 'yours', 'notary', '--version', at), `removed from ${agents}: notary.md`);
    assert.equal(fs.existsSync(path.join(agents, 'notary.md')), false);
  });

  await s.test('nemia skills write writes a skill of yours from its SKILL.md, and changes it at its version', async (sub) => {
    const skill = drafted('skills/tidy/SKILL.md', TIDY);
    const made = await done(sub, 'skills', 'write', 'yours', '--file', skill);
    assert.match(made, new RegExp(`^tidy written in ${path.join(YOURS, 'skills', 'tidy')}, at version [0-9a-f]{16}: SKILL\\.md$`));
    assert.match(
      fs.readFileSync(path.join(YOURS, 'skills', 'tidy', 'SKILL.md'), 'utf8'),
      /^name: tidy\ndescription: "?Tidy a folder\."?\n---\nTidy it\.\n$/m,
    );
    fs.writeFileSync(skill, TIDY.replace('Tidy a folder.', 'Tidy a folder well.'));
    await done(sub, 'skills', 'write', 'yours', 'tidy', '--file', skill, '--version', versionIn(made));
    assert.match(fs.readFileSync(path.join(YOURS, 'skills', 'tidy', 'SKILL.md'), 'utf8'), /Tidy a folder well\./);
  });

  await s.test(
    'nemia workflows write writes a draft folder into yours and changes it at its version; nemia workflows rm removes it at its version',
    async (sub) => {
      const folder = draftWorkflow('notes');
      const made = await done(sub, 'workflows', 'write', 'yours', 'notes', '--folder', folder);
      assert.equal(
        made,
        `notes written in ${path.join(YOURS, 'notes')}, at version ${versionIn(made)}: README.md, implement.md, review.md, ship.md`,
      );
      assert.deepEqual(Object.keys(snapshot(path.join(YOURS, 'notes'))), Object.keys(snapshot(folder)));
      fs.appendFileSync(path.join(folder, 'README.md'), '\nChanged.\n');
      const changed = await done(sub, 'workflows', 'write', 'yours', 'notes', '--folder', folder, '--version', versionIn(made));
      assert.match(fs.readFileSync(path.join(YOURS, 'notes', 'README.md'), 'utf8'), /Changed\.$/m);
      const gone = await done(sub, 'workflows', 'remove', 'yours', 'notes', '--version', versionIn(changed));
      assert.equal(gone, `removed ${path.join(YOURS, 'notes')}: README.md, implement.md, review.md, ship.md`);
      assert.equal(fs.existsSync(path.join(YOURS, 'notes')), false);
    },
  );

  await s.test(
    'nemia agents run starts a try of an agent of yours with no repository; REFUSED while it moves, with no brief, for none there, in the repository',
    async (sub) => {
      const taster = drafted('agents/taster.md', '---\ndescription: Use this to taste it.\nmodel: sonnet\n---\nTaste it.\n');
      await done(sub, 'agents', 'write', 'yours', '--file', taster);
      const started = await done(sub, 'agents', 'try', 'yours', 'taster', '--brief', '  Taste the soup.  ');
      const id = /^(\S+) {2}a try of taster started: nemia ls shows how it goes/.exec(started)?.[1] ?? assert.fail(started);
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

test('REFUSED at shipped defaults: a writer typed at the command line, by its kind and exit 2, naming the fix, and yours as it was', async (t) => {
  const archivist = drafted('agents/archivist.md', '---\ndescription: Use this to file things away.\n---\nFile it.\n');
  const agentAt = versionIn(await done(t, 'agents', 'write', 'yours', '--file', archivist));
  const sweep = drafted('skills/sweep/SKILL.md', TIDY.replace('name: tidy', 'name: sweep'));
  const skillAt = versionIn(await done(t, 'skills', 'write', 'yours', '--file', sweep));
  const triage = draftWorkflow('triage');
  const workflowAt = versionIn(await done(t, 'workflows', 'write', 'yours', 'triage', '--folder', triage));
  const nowhere = path.join(DRAFTS, 'agents', 'nobody.md');
  const unread = drafted('agents/broken.md', '---\nname: other\ndescription: Use this broken.\n---\nBroken.\n');
  const plain = drafted('agents/plain.md', '---\ndescription: Use this plainly.\n---\nDo it.\n');
  const readme = path.join(triage, 'README.md');
  const repo = (what: string) => [`refuses`, `the repository's ${what}`];

  const table: ReadonlyArray<[string, 'Invalid' | 'Conflict' | 'Missing', string[], ...string[]]> = [
    [
      'an agent written where one is, naming its version',
      'Conflict',
      ['agents', 'write', 'yours', '--file', archivist],
      'agents/archivist.md is there already',
      `version ${agentAt}`,
    ],
    [
      'an agent written at a version it moved on from',
      'Conflict',
      ['agents', 'write', 'yours', 'archivist', '--file', archivist, '--version', '0000000000000000'],
      `version 0000000000000000, now ${agentAt}`,
    ],
    [
      'an agent written into the repository',
      'Invalid',
      ['agents', 'write', 'repo', '--file', archivist],
      'nemia agents write',
      ...repo('agents'),
      'only yours is written',
      'copy the file into',
    ],
    [
      'an agent written with no file',
      'Invalid',
      ['agents', 'write', 'yours'],
      'nemia agents write takes --file',
      'nemia agents write (yours | factory) [<name>]',
      '--file <name>.md',
      '[--factory <name>] [--version <v>]',
    ],
    [
      'an agent file not there',
      'Invalid',
      ['agents', 'write', 'yours', '--file', nowhere],
      `nemia agents write cannot read ${nowhere}`,
      'Name a file that is there',
    ],
    ['an agent file that does not read', 'Invalid', ['agents', 'write', 'yours', '--file', unread], `${unread} does not read`],
    [
      'a key the api alone takes: agents write --draft',
      'Invalid',
      ['agents', 'write', 'yours', '--file', plain, '--draft', '{}'],
      'nemia agents write takes no --draft',
      'nemia agents write (yours | factory) [<name>]',
      '--file <name>.md',
    ],
    [
      'a key the api alone takes: agents rm --repo',
      'Invalid',
      ['agents', 'remove', 'yours', 'plain', '--repo', DRAFTS],
      'nemia agents rm takes no --repo',
      'nemia agents rm yours <name> --version <v>',
    ],
    [
      'a key the api alone takes: skills write --copy',
      'Invalid',
      ['skills', 'write', 'yours', '--copy', 'tidy'],
      'nemia skills write takes no --copy',
      'nemia skills write (yours | factory) [<name>]',
      '--file <SKILL.md>',
    ],
    [
      'a key the api alone takes: workflows write --draft',
      'Invalid',
      ['workflows', 'write', 'yours', 'dev', '--draft', '[]'],
      'nemia workflows write takes no --draft',
      'nemia workflows write (yours | factory) <name>',
      '--folder <draft>',
    ],
    [
      'an agent removed with no version, naming the one it is at',
      'Invalid',
      ['agents', 'remove', 'yours', 'archivist'],
      `agents/archivist.md is at version ${agentAt}`,
      'Give that version to remove it',
    ],
    [
      'an agent removed at a version it moved on from',
      'Conflict',
      ['agents', 'remove', 'yours', 'archivist', '--version', '0000000000000000'],
      'changed since it was read',
    ],
    ['an agent removed that is not there', 'Missing', ['agents', 'remove', 'yours', 'nobody', '--version', agentAt], 'nobody'],
    [
      'an agent removed from the repository',
      'Invalid',
      ['agents', 'remove', 'repo', 'archivist', '--version', agentAt],
      'nemia agents rm',
      ...repo('agents'),
      'only yours is written',
      'copy the file into',
    ],
    [
      'a skill written where one is, naming its version',
      'Conflict',
      ['skills', 'write', 'yours', '--file', sweep],
      'skills/sweep is there already',
      `version ${skillAt}`,
    ],
    [
      'a skill written at a version it moved on from',
      'Conflict',
      ['skills', 'write', 'yours', 'sweep', '--file', sweep, '--version', '0000000000000000'],
      '0000000000000000',
    ],
    [
      'a skill written under another name',
      'Invalid',
      ['skills', 'write', 'yours', 'other', '--file', sweep],
      'nemia skills write was asked to change other',
      `${sweep} is the skill sweep`,
      'name the skill it is',
    ],
    [
      'a skill written into the repository',
      'Invalid',
      ['skills', 'write', 'repo', '--file', sweep],
      'nemia skills write',
      ...repo('skills'),
      'only your library is written',
      'copy its folder into the repository',
    ],
    ['a skill written with no file', 'Invalid', ['skills', 'write', 'yours'], 'nemia skills write takes --file'],
    [
      'a workflow written by a bad name',
      'Invalid',
      ['workflows', 'write', 'yours', '../review', '--folder', triage],
      'nemia workflows write',
      "`../review` is not a workflow's name",
    ],
    [
      'a workflow written into the repository',
      'Invalid',
      ['workflows', 'write', 'repo', 'review', '--folder', triage],
      'nemia workflows write',
      ...repo('workflows'),
      'only yours is written',
      'copy the folder into',
    ],
    [
      'a workflow written from no folder',
      'Invalid',
      ['workflows', 'write', 'yours', 'review'],
      'nemia workflows write takes --folder',
      'nemia workflows write (yours | factory) <name>',
      '--folder <draft>',
    ],
    [
      'a workflow written from a file, not a folder',
      'Invalid',
      ['workflows', 'write', 'yours', 'review', '--folder', readme],
      `nemia workflows write reads the folder ${readme}`,
      'Name the draft folder',
    ],
    [
      'a workflow removed from the agents’ folder',
      'Invalid',
      ['workflows', 'remove', 'yours', 'agents', '--version', workflowAt],
      'nemia workflows rm: agents/ holds',
      "Name the workflow's folder",
    ],
    [
      'a workflow removed in the repository',
      'Invalid',
      ['workflows', 'remove', 'repo', 'triage', '--version', workflowAt],
      'nemia workflows rm',
      ...repo('workflows'),
      'only yours is written',
      'copy the folder into',
    ],
  ];
  for (const [name, tag, argv, ...facts] of table) await t.test(name, (sub) => refusedAs(sub, tag, argv, ...facts));
});

/** The keys an entry's handler may be handed by either side: its positionals, and its flags but those the command line alone takes. */
const handlerKeys = (command: Command): Set<string> =>
  new Set([
    ...command.spec.positionals.map((p) => p.key),
    ...command.spec.flags.flatMap((f) => (f.only?.side !== 'cli' && f.key !== undefined ? [f.key] : [])),
  ]);

/** The keys `handed` that `command`'s handler is never handed by the api: none, where the two sides read one spec. */
const strayKeys = (command: Command, handed: Args): string[] => Object.keys(handed).filter((key) => !handlerKeys(command).has(key));

const entry = (name: string): Command => TABLE.find((c) => c.name === name) as Command;

test('the command line hands each writer’s handler only what the api’s body could, read off the one spec both sides parse', async (t) => {
  await t.test('REFUSED: a key handed to a handler that its spec gives the command line alone, or gives no side', () => {
    assert.deepEqual(strayKeys(entry('agents write'), { from: 'yours', file: 'scribe.md', draft: '{}' }), ['file']);
    assert.deepEqual(strayKeys(entry('workflows write'), { from: 'yours', name: 'dev', folder: 'dev', steps: '[]' }), ['folder', 'steps']);
    assert.deepEqual(strayKeys(entry('skills write'), { from: 'yours', change: '{}', copy: 'tidy' }), []);
  });
  const agent = drafted('agents/spec.md', SCRIBE);
  drafted('agents/scribe.schema.json', SCHEMA);
  const skill = drafted('skills/spec/SKILL.md', TIDY.replace('name: tidy', 'name: spec'));
  const typedArgs: Record<string, string[]> = {
    'agents write': ['agents', 'write', 'yours', 'spec', '--file', agent, '--version', 'v'],
    'agents rm': ['agents', 'rm', 'yours', 'spec', '--version', 'v'],
    'agents run': ['agents', 'run', 'yours', 'spec', '--brief', 'Do it.'],
    'skills write': ['skills', 'write', 'yours', 'spec', '--file', skill, '--version', 'v'],
    'workflows write': ['workflows', 'write', 'yours', 'spec', '--folder', draftWorkflow('spec'), '--version', 'v'],
    'workflows rm': ['workflows', 'rm', 'yours', 'spec', '--version', 'v'],
  };
  const writers = (TABLE as readonly Command[]).filter(
    (c) => c.writes && c.only === undefined && /^(agents|skills|workflows) (write|rm|run)$/.test(c.name),
  );
  assert.deepEqual(writers.map((c) => c.name).sort(), Object.keys(typedArgs).sort(), 'the six writers, each typed here');
  for (const command of writers)
    await t.test(`nemia ${command.name}`, async (sub) => {
      const handed: Args[] = [];
      const handler = sub.mock.method(command as unknown as { handler: (args: Args) => never }, 'handler', (args: Args) => {
        handed.push(args);
        throw new Error('handed');
      });
      await typed(sub, ...typedArgs[command.name]);
      handler.mock.restore();
      assert.equal(handed.length, 1, `nemia ${command.name} reached its handler`);
      assert.deepEqual(strayKeys(command, handed[0]), [], `nemia ${command.name} hands its handler only what the api's body could`);
      const flagged = command.spec.flags.flatMap((f) => (f.only?.side === 'cli' && f.key !== undefined ? [f.key] : []));
      for (const key of flagged) assert.equal(handed[0][key], undefined, `nemia ${command.name} reads --${key}, and hands what it read`);
    });
});
