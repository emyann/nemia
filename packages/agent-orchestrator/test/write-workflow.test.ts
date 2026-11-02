/**
 * A workflow folder written from its steps (`writeWorkflow`): what the board's builder saves.
 *
 * The write is the only way the board changes a folder, so what it refuses is refused before a byte is written — each refusal here is
 * asserted in its words and with the folder as it was — and what it writes is what `loadWorkflows` reads back.
 *
 * `WF_ROOT` is set before the modules are imported, since they read it as they load. The tests' team's agents and skills are copied
 * beside the store's workflows, as beside its own: dev's steps name them.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseAgent, WorkflowError, type StepDraft, type Workflow } from '../src/workflow.ts';
import { agentDeniesOf } from '../src/workflow/index.ts';
import { loadWorkflows } from '../src/folder/folder.store.ts';
import { scratch } from './scratch.ts';
import { TEAM, TEAM_DEV } from './team.ts';

const ROOT = scratch('wf-write-');
process.env.WF_ROOT = ROOT;
const { addFactory, writeWorkflow } = await import('../src/runner.ts');

const STORE = path.join(ROOT, 'workflows');
fs.cpSync(path.join(TEAM, 'agents'), path.join(STORE, 'agents'), { recursive: true });
fs.cpSync(path.join(TEAM, 'skills'), path.join(STORE, 'skills'), { recursive: true });

/** A copy of the tests' team's `dev` — README, comments and all — as a workflow of the store's, named `name`. */
function devIn(name: string): string {
  const dir = path.join(STORE, name);
  fs.mkdirSync(dir, { recursive: true });
  for (const file of fs.readdirSync(TEAM_DEV)) fs.copyFileSync(path.join(TEAM_DEV, file), path.join(dir, file));
  return dir;
}

/** Every file under `dir`, by its path from `dir`, with what it holds: what a refused write must leave as it was. */
function snapshot(dir: string): Record<string, string> {
  if (!fs.existsSync(dir)) return {};
  return Object.fromEntries(
    fs
      .readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => {
        const at = path.join(e.parentPath, e.name);
        return [path.relative(dir, at), fs.readFileSync(at, 'utf8')];
      })
      .sort(([a], [b]) => (a < b ? -1 : 1)),
  );
}

/** The refusal `write` threw — a `WorkflowError`, exit 2 — with `dir` asserted as it was before it; fails the test if it wrote. */
function refusal(dir: string, write: () => unknown): string {
  const before = snapshot(dir);
  const existed = fs.existsSync(dir);
  try {
    write();
  } catch (e) {
    assert.ok(e instanceof WorkflowError, String(e));
    assert.equal(e.exitCode, 2, 'the author has something to fix');
    assert.deepEqual(snapshot(dir), before, `${dir} is as it was: ${e.message}`);
    assert.equal(fs.existsSync(dir), existed, 'and a folder that was not there is not made');
    return e.message;
  }
  return assert.fail(`${dir} was written, and should have been refused`);
}

const step = (name: string, more: Partial<StepDraft> = {}): StepDraft => ({ name, after: [], place: 'git', body: `${name} it`, ...more });

test("a workflow's steps written back as they were leave every file as it was — comments included — and read back as the steps", () => {
  const dir = devIn('as-it-was');
  const before = snapshot(dir);
  const steps = loadWorkflows(dir);
  const done = writeWorkflow(dir, steps);
  assert.deepEqual(done, { dir, steps, written: [], kept: ['implement.md', 'review.md', 'ship.md'], removed: [] });
  assert.deepEqual(snapshot(dir), before);
  assert.match(fs.readFileSync(path.join(dir, 'review.md'), 'utf8'), /^# /m, 'the comments are still there');
});

test('a step changed is rendered and written, a step unchanged keeps its file, a step gone loses its file — and the schema and the README stay as they are', () => {
  const dir = devIn('changed');
  fs.copyFileSync(path.join(STORE, 'agents', 'review.schema.json'), path.join(dir, 'review.schema.json'));
  const before = snapshot(dir);
  const [implement, review, ship] = loadWorkflows(dir) as [Workflow, Workflow, Workflow];

  const fewer = writeWorkflow(dir, [implement, { ...review, rounds: 2 }, ship]);
  assert.deepEqual([fewer.written, fewer.kept, fewer.removed], [['review.md'], ['implement.md', 'ship.md'], []]);
  assert.equal(fs.readFileSync(path.join(dir, 'implement.md'), 'utf8'), before['implement.md'], 'byte for byte');
  assert.match(fs.readFileSync(path.join(dir, 'review.md'), 'utf8'), /^rounds: 2$/m);
  assert.doesNotMatch(fs.readFileSync(path.join(dir, 'review.md'), 'utf8'), /^# /m, 'a render has no comments');
  assert.deepEqual(loadWorkflows(dir), fewer.steps, 'what it returns is what the folder reads as');
  assert.equal(fewer.steps.find((s) => s.name === 'review')!.rounds, 2);

  const docs = step('docs', { after: ['implement'], model: 'sonnet' });
  const other = writeWorkflow(dir, [docs, implement]);
  assert.deepEqual(
    [other.written, other.kept, other.removed],
    [['docs.md'], ['implement.md'], ['review.md', 'ship.md']],
    'implement and docs, review and ship gone: docs.md written, their files removed',
  );
  assert.deepEqual(Object.keys(snapshot(dir)), ['README.md', 'docs.md', 'implement.md', 'review.schema.json']);
  assert.equal(snapshot(dir)['README.md'], before['README.md'], 'the README untouched');
  assert.equal(
    snapshot(dir)['review.schema.json'],
    before['review.schema.json'],
    "a schema in the folder is the folder's, and no write of the steps touches it",
  );
  assert.equal(fs.readFileSync(path.join(dir, 'docs.md'), 'utf8'), '---\nafter: implement\nplace: git\nmodel: sonnet\n---\ndocs it\n');
  assert.deepEqual(
    loadWorkflows(dir).map((s) => s.name),
    ['implement', 'docs'],
  );

  fs.writeFileSync(path.join(dir, 'notes.txt'), 'mine\n');
  fs.mkdirSync(path.join(dir, 'schemas'));
  fs.writeFileSync(path.join(dir, 'schemas', 'old.md'), 'not a step: not in the folder itself\n');
  assert.deepEqual(
    writeWorkflow(dir, [implement]).removed,
    ['docs.md'],
    "a folder's other files are not steps, and not the write's to remove",
  );
  assert.deepEqual(
    Object.keys(snapshot(dir)),
    ['README.md', 'implement.md', 'notes.txt', 'review.schema.json', path.join('schemas', 'old.md')],
    "a folder's other files stay",
  );
});

test('the README is written only when it is given, to the name the README already has', () => {
  const dir = devIn('readme');
  const steps = loadWorkflows(dir);
  fs.renameSync(path.join(dir, 'README.md'), path.join(dir, 'readme.md'));
  const done = writeWorkflow(dir, steps, '# readme\n\nWhat it is for, now.\n');
  assert.deepEqual([done.written, done.kept], [['readme.md'], ['implement.md', 'review.md', 'ship.md']]);
  assert.deepEqual(
    Object.keys(snapshot(dir)).filter((f) => /readme/i.test(f)),
    ['readme.md'],
    'no second README beside it',
  );
  assert.equal(
    writeWorkflow(dir, steps, '# readme\n\nWhat it is for, now.\n').kept.includes('readme.md'),
    true,
    'the same text is left as it is',
  );
});

test("a draft naming its agent that sends the resolved denies, as the board lists them, is written with the step's own alone", () => {
  const dir = path.join(STORE, 'own-denies');
  const file = fs.readFileSync(path.join(STORE, 'agents', 'implementer.md'), 'utf8');
  const agentDenies = agentDeniesOf(parseAgent('implementer', file));
  assert.ok(agentDenies.length, "the tests' implementer denies something");
  const done = writeWorkflow(dir, [step('implement', { agent: 'implementer', disallowedTools: ['Bash(npm run build)', ...agentDenies] })]);
  const written = fs.readFileSync(path.join(dir, 'implement.md'), 'utf8');
  assert.match(written, /^claude:\n {2}fence:\n {4}disallowedTools: Bash\(npm run build\)$/m);
  assert.doesNotMatch(written, /^disallowedTools:/m, 'in its harness block, and no fence key at the top level');
  assert.deepEqual(done.steps[0].disallowedTools, ['Bash(npm run build)', ...agentDenies], "the session is still refused the agent's");
});

test("written where the board lists workflows from — the store's workflows/ and a known repository's — and anywhere else with `{ anywhere: true }`", () => {
  const repo = scratch('wf-write-repo-');
  addFactory({ name: 'write-known', repos: [repo] });
  assert.equal(fs.existsSync(path.join(repo, '.git')), false, 'a repository a factory names is known with no .git read');
  fs.mkdirSync(path.join(repo, '.claude', 'agents'), { recursive: true });
  fs.writeFileSync(
    path.join(repo, '.claude', 'agents', 'only-here.md'),
    '---\nrole: Engineer\ndescription: Only in the repository.\n---\nYou are.\n',
  );
  assert.deepEqual(
    writeWorkflow(path.join(repo, 'workflows', 'dev'), [step('implement', { agent: 'only-here' })]).written,
    ['implement.md'],
    "a factory's repository's, its agents found in its .claude/",
  );
  const named = scratch('wf-write-named-');
  assert.deepEqual(
    writeWorkflow(path.join(named, 'workflows', 'dev'), [step('implement')], undefined, { places: { repo: named, home: ROOT } }).written,
    ['implement.md'],
    'the repository the caller names in its places',
  );

  const elsewhere = path.join(scratch('wf-write-elsewhere-'), 'dev');
  assert.deepEqual(writeWorkflow(elsewhere, [step('implement')], undefined, { anywhere: true }).written, ['implement.md']);
  assert.deepEqual(
    loadWorkflows(elsewhere).map((s) => s.name),
    ['implement'],
  );
});

/** A row of the refusals: the folder it writes, the write, and the text the refusal opens on with what else it names. */
type Refused = { row: string; dir: () => string; write: (dir: string) => unknown; naming: string[]; asLoaded?: (dir: string) => string };

/** What `loadWorkflows` refuses a copy of dev with `file` written as `text` with: a folder on disk read with the words of a write. */
const loadRefusal = (file: string, text: string): string => {
  const copy = devIn(`copy-${path.basename(file, '.md')}-${Math.random().toString(36).slice(2, 6)}`);
  fs.writeFileSync(path.join(copy, file), text);
  try {
    loadWorkflows(copy);
  } catch (e) {
    return (e as Error).message;
  }
  return assert.fail(`${file} loaded`);
};

/** dev's steps, in a copy of its own. */
const devSteps = (dir: string) => loadWorkflows(dir) as [Workflow, Workflow, Workflow];

/** What each linked file pointed at held when it was linked, by the path it points at. */
const linkedTo = new Map<string, string>();

/** `file` of `dir` moved out of it and linked back in, where it was. */
const linked = (dir: string, file: string): void => {
  const to = path.join(scratch('wf-write-linked-'), file);
  fs.renameSync(path.join(dir, file), to);
  fs.symlinkSync(to, path.join(dir, file));
  linkedTo.set(to, fs.readFileSync(to, 'utf8'));
};

test('REFUSED at shipped defaults, with the folder as it was, before a byte is written: a write a folder could not take', async (t) => {
  const outside = scratch('wf-write-outside-');
  fs.writeFileSync(path.join(outside, 'old.md'), 'a step nobody meant to remove\n');
  const unknown = scratch('wf-write-unknown-');
  fs.mkdirSync(path.join(unknown, '.git'));
  const nowhere = [
    "is not a workflow in the store's workflows/",
    '<repo>/workflows/<name>',
    'nemia factory add <name> --repo <repo>',
    '{ anywhere: true }',
  ];
  const file = path.join(STORE, 'a-file');
  fs.writeFileSync(file, 'not a folder\n');
  const theirs = path.join(devIn('theirs'), 'review.schema.json');
  const tally = 'review: `tally: findings, nope` in review.md';
  const rows: Refused[] = [
    {
      row: 'a folder outside both',
      dir: () => outside,
      write: (dir) => writeWorkflow(dir, [step('implement')]),
      naming: [outside, ...nowhere],
    },
    {
      row: "a workflows/ no factory names is no repository's",
      dir: () => path.join(outside, 'workflows', 'dev'),
      write: (dir) => writeWorkflow(dir, [step('implement')]),
      naming: [path.join(outside, 'workflows', 'dev'), ...nowhere],
    },
    {
      row: 'a .git no factory names is not known by it',
      dir: () => path.join(unknown, 'workflows', 'dev'),
      write: (dir) => writeWorkflow(dir, [step('implement')]),
      naming: [path.join(unknown, 'workflows', 'dev'), ...nowhere],
    },
    {
      row: "the store's workflows/ itself",
      dir: () => STORE,
      write: (dir) => writeWorkflow(dir, [step('implement')]),
      naming: [STORE, ...nowhere],
    },
    {
      row: 'a folder below a workflow',
      dir: () => path.join(devIn('below'), 'ui'),
      write: (dir) => writeWorkflow(dir, [step('implement')]),
      naming: [path.join(STORE, 'below', 'ui'), ...nowhere],
    },
    {
      row: 'a relative path, resolved',
      dir: () => outside,
      write: () => writeWorkflow(path.relative(process.cwd(), outside), [step('implement')]),
      naming: [outside, ...nowhere],
    },
    {
      row: 'a key a step does not have, in the words of a folder on disk',
      dir: () => devIn('refused-key'),
      write: (dir) => writeWorkflow(dir, [devSteps(dir)[0], { ...devSteps(dir)[1], afer: ['implement'] } as StepDraft]),
      naming: ['review: ', '`afer` is not a key a step has', 'after, resume'],
      asLoaded: () => loadRefusal('review.md', '---\nafer: implement\n---\nreview it\n'),
    },
    {
      row: 'a loop to a step it does not wait on',
      dir: () => devIn('refused-unwaited'),
      write: (dir) => {
        const [implement, review] = devSteps(dir);
        return writeWorkflow(dir, [implement, step('docs', { after: ['implement'] }), { ...review, after: ['implement'], loop: 'docs' }]);
      },
      naming: ['review: ', '`loop: docs`', 'does not wait on docs'],
    },
    {
      row: 'a loop to itself',
      dir: () => devIn('refused-self'),
      write: (dir) => writeWorkflow(dir, [devSteps(dir)[0], { ...devSteps(dir)[1], loop: 'review' }]),
      naming: ['review: ', '`loop: review` names this step'],
    },
    {
      row: 'rounds that are no count',
      dir: () => devIn('refused-rounds'),
      write: (dir) => writeWorkflow(dir, [devSteps(dir)[0], { ...devSteps(dir)[1], rounds: 0 }]),
      naming: ['review: ', '`rounds: 0` is not a count'],
    },
    {
      row: 'an output schema not there',
      dir: () => devIn('output-absent'),
      write: (dir) => writeWorkflow(dir, [devSteps(dir)[0], { ...devSteps(dir)[1], output: { file: 'reviews.schema.json' } }]),
      naming: ['review: ', '`output: reviews.schema.json` is not there', 'write it beside review.md'],
    },
    {
      row: 'an output schema beside another workflow, by a path that climbs',
      dir: () => devIn('output-up'),
      write: (dir) => writeWorkflow(dir, [devSteps(dir)[0], { ...devSteps(dir)[1], output: { file: path.relative(dir, theirs) } }]),
      naming: [
        'review: ',
        'names a file outside the workflow folder',
        'write it beside review.md',
        '`output: review.schema.json`',
        'or delete the line',
      ],
    },
    {
      row: 'an output schema by an absolute path',
      dir: () => devIn('output-absolute'),
      write: (dir) => writeWorkflow(dir, [devSteps(dir)[0], { ...devSteps(dir)[1], output: { file: theirs } }]),
      naming: [`review: \`output: ${theirs}\``, 'names a file outside the workflow folder'],
    },
    {
      row: 'a folder that is a file',
      dir: () => STORE,
      write: () => writeWorkflow(file, [step('implement')]),
      naming: [file, 'is a file', 'Name a folder'],
    },
    {
      row: "a step's file that is a link, rendered through it",
      dir: () => {
        const dir = devIn('linked-render');
        linked(dir, 'review.md');
        return dir;
      },
      write: (dir) => {
        const [implement, review, ship] = devSteps(dir);
        return writeWorkflow(dir, [implement, { ...review, rounds: 2 }, ship]);
      },
      naming: [path.join(STORE, 'linked-render', 'review.md'), 'is a link', 'rm <file> && cp <target> <file>'],
    },
    {
      row: "a step's file that is a link, its step gone",
      dir: () => {
        const dir = devIn('linked-gone');
        linked(dir, 'review.md');
        return dir;
      },
      write: (dir) => writeWorkflow(dir, [devSteps(dir)[0]]),
      naming: [path.join(STORE, 'linked-gone', 'review.md'), 'is a link'],
    },
    {
      row: 'a README that is a link, when a README is given',
      dir: () => {
        const dir = devIn('linked-readme');
        linked(dir, 'README.md');
        return dir;
      },
      write: (dir) => writeWorkflow(dir, devSteps(dir), '# theirs\n'),
      naming: [path.join(STORE, 'linked-readme', 'README.md'), 'is a link'],
    },
    {
      row: 'a tally the closeout cannot hold, in the words of a folder on disk',
      dir: () => devIn('tallied'),
      write: (dir) =>
        writeWorkflow(
          dir,
          devSteps(dir).map((s) => (s.name === 'review' ? { ...s, tally: ['findings', 'nope'] } : s)),
        ),
      naming: [tally, '`output: review.schema.json` declares no field `nope`', 'findings, again'],
      asLoaded: (dir) => {
        const review = path.join(dir, 'review.md');
        const original = fs.readFileSync(review, 'utf8');
        fs.writeFileSync(review, original.replace(/^budget: 20$/m, 'budget: 20\ntally: findings, nope'));
        try {
          loadWorkflows(dir);
        } catch (e) {
          return (e as Error).message;
        } finally {
          fs.writeFileSync(review, original);
        }
        return assert.fail('a tally the closeout cannot hold loaded');
      },
    },
  ];
  for (const { row, dir, write, naming, asLoaded } of rows)
    await t.test(row, () => {
      const at = dir();
      const said = refusal(at, () => write(at));
      const [opens, ...named] = naming;
      assert.ok(said.startsWith(opens), `opens on ${opens}: ${said}`);
      for (const name of named) assert.ok(said.includes(name), `names ${name}: ${said}`);
      if (asLoaded) assert.equal(said, asLoaded(at), 'the words a folder on disk is refused with');
    });
  assert.equal(fs.readFileSync(file, 'utf8'), 'not a folder\n', 'the file a folder was asked of is untouched');
  for (const [to, was] of linkedTo) assert.equal(fs.readFileSync(to, 'utf8'), was, `${to}, what a link points at, is untouched`);
});

test("a schema given with a step is not what is written or read: the folder's file is", () => {
  const dir = devIn('output');
  const [implement, review] = devSteps(dir);
  const loose = { type: 'object', properties: { x: { type: 'string' } }, required: [], additionalProperties: false } as const;
  const written = writeWorkflow(dir, [implement, { ...review, output: { file: 'review.schema.json', schema: loose } } as StepDraft]);
  assert.deepEqual(written.steps.find((s) => s.name === 'review')?.output, review.output);
});

test('a link a write does not touch is no refusal: with no README given, a linked README is left as it is', () => {
  const dir = devIn('linked-kept');
  const steps = devSteps(dir);
  linked(dir, 'README.md');
  assert.deepEqual(writeWorkflow(dir, steps).kept, ['implement.md', 'review.md', 'ship.md']);
});

test('a tally the closeout of the step can hold is written, and reads back', () => {
  const dir = devIn('tally-kept');
  writeWorkflow(
    dir,
    devSteps(dir).map((s) => (s.name === 'review' ? { ...s, tally: ['findings'] } : s)),
  );
  assert.match(fs.readFileSync(path.join(dir, 'review.md'), 'utf8'), /^tally: findings$/m);
  assert.deepEqual(loadWorkflows(dir).find((s) => s.name === 'review')?.tally, ['findings']);
});

/**
 * Whether this filesystem tells `plan.md` from `Plan.md` apart. Where it does not, they are one file, and a step renamed by case is that
 * file renamed.
 */
const caseSensitive = (() => {
  const probe = fs.mkdtempSync(path.join(ROOT, 'case-'));
  fs.writeFileSync(path.join(probe, 'a.md'), '---\nplace: git\n---\n');
  const apart = !fs.existsSync(path.join(probe, 'A.md'));
  fs.rmSync(probe, { recursive: true, force: true });
  return apart;
})();

test('the files of the steps the folder no longer has go before a byte of the new ones is written', (t) => {
  const dir = devIn('order');
  const [implement, review] = loadWorkflows(dir) as [Workflow, Workflow];
  const order: string[] = [];
  const { rmSync, writeFileSync } = fs;
  const removals = t.mock.method(fs, 'rmSync', (at: fs.PathLike, opts?: fs.RmOptions) => {
    order.push(`removed ${path.basename(String(at))}`);
    return rmSync(at, opts);
  });
  const writes = t.mock.method(
    fs,
    'writeFileSync',
    (at: fs.PathOrFileDescriptor, data: string | NodeJS.ArrayBufferView, opts?: fs.WriteFileOptions) => {
      order.push(`wrote ${path.basename(String(at))}`);
      return writeFileSync(at, data, opts);
    },
  );
  try {
    writeWorkflow(dir, [implement, { ...review, name: 'REVIEW', rounds: 2 }]);
  } finally {
    removals.mock.restore();
    writes.mock.restore();
  }
  const wrote = order.indexOf('wrote REVIEW.md');
  assert.ok(wrote >= 0, order.join(', '));
  assert.deepEqual(
    order.slice(0, wrote).sort(),
    ['removed review.md', 'removed ship.md'],
    "both removals come before the write, in readdirSync's order, the filesystem's: where case is not told apart review.md and " +
      'REVIEW.md are one file, and a removal after the write would remove what was written',
  );
  assert.deepEqual(order.slice(wrote), ['wrote REVIEW.md'], 'and nothing is removed after it — implement.md is left as it is');
});

test(
  'a step renamed by case keeps its file where the filesystem does not tell case apart',
  { skip: caseSensitive && 'this filesystem tells implement.md from Implement.md apart, where a rename by case is an ordinary rename' },
  () => {
    const dir = devIn('case');
    const [implement] = loadWorkflows(dir) as [Workflow];
    const done = writeWorkflow(dir, [{ ...implement, name: 'Implement' }]);
    assert.deepEqual([done.written, done.removed], [['Implement.md'], ['implement.md', 'review.md', 'ship.md']]);
    assert.deepEqual(
      Object.keys(snapshot(dir)),
      ['Implement.md', 'README.md', 'review.schema.json'],
      'the step it was given is there, under its new name',
    );
    assert.deepEqual(
      loadWorkflows(dir).map((s) => s.name),
      ['Implement'],
      'and the folder reads as that step',
    );
  },
);

test('a line break in a value is written as a literal block, and read back as the one value, never as a key of its own', () => {
  const dir = devIn('names');
  const [implement, review] = loadWorkflows(dir) as [Workflow, Workflow];
  writeWorkflow(dir, [{ ...implement, check: 'npm test\nharness: codex' }, review]);
  assert.match(fs.readFileSync(path.join(dir, 'implement.md'), 'utf8'), /^check: \|-$/m);
  const [read] = loadWorkflows(dir) as [Workflow];
  assert.equal(read.check, 'npm test\nharness: codex');
  assert.equal(read.harness, implement.harness);
});
