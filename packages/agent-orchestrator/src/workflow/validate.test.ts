/**
 * The ways steps do not form a workflow, as `validate` reads them together — and as `parseFolder` reads a folder's text into them, for
 * the rules that need a step's file (a schema beside it, a key read on its own). One table of structure rules, a row each, then the
 * focused cases of `orderSteps`, `terminalSteps`, `fansOut` and `loopSpan`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fansOut, isFolderTeam, loopSpan, orderSteps, terminalSteps, validate } from './validate.ts';
import { parseWorkflow } from './step-file.ts';
import { parseFolder } from '../folder/folder.ts';
import { sessionContext } from '../keys/index.ts';
import { DEFAULT_ROUNDS, stepPlace, WorkflowError, type Workflow } from '../step/step.ts';

const step = (name: string, after: string[] = []): Workflow => ({ name, after, body: 'do a thing' });

/** A strict output schema: `findings`, each a file, a line and what would go wrong. */
const FINDINGS = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: { file: { type: 'string' }, line: { type: ['integer', 'null'] }, what: { type: 'string' } },
        required: ['file', 'line', 'what'],
        additionalProperties: false,
      },
    },
  },
  required: ['findings'],
  additionalProperties: false,
};

/** `FINDINGS`, and `again`: what a step with `loop:` declares. */
const LOOPING = { ...FINDINGS, properties: { ...FINDINGS.properties, again: { type: 'boolean' } }, required: ['findings', 'again'] };

/** A step `loop:`-ing back to `target`, declaring `again`, as a folder would load it. */
const looping = (name: string, after: string[], target: string): Workflow => ({
  ...step(name, after),
  loop: target,
  rounds: DEFAULT_ROUNDS,
  output: { file: `${name}.json`, schema: LOOPING as never },
});

/**
 * A folder read from its text: `implement`, then `review` declaring `output: review.schema.json` with `reviewKeys` beside it, then
 * whatever `files` add or replace — a step by its name and text, a schema by its file and object; `null` leaves a file out.
 */
const folderOf = (reviewKeys: string | null, files: Record<string, string | object | null> = {}): Workflow[] => {
  const all: Record<string, string | object | null> = {
    implement: '---\nplace: git\n---\nimplement it\n',
    ...(reviewKeys === null
      ? {}
      : { review: `---\nafter: implement\nplace: git\noutput: review.schema.json\n${reviewKeys}\n---\nreview it\n` }),
    'review.schema.json': LOOPING,
    ...files,
  };
  const steps = Object.entries(all).filter(([name, text]) => !name.endsWith('.json') && typeof text === 'string') as Array<
    [string, string]
  >;
  const read = (file: string) => {
    const content = all[file];
    return content === undefined || content === null ? undefined : typeof content === 'string' ? content : JSON.stringify(content);
  };
  return parseFolder(steps, read);
};

/** The text of a step file: its frontmatter `lines`, and a body. */
const fileOf = (lines: string) => `---\n${lines}\n---\nDo the work.\n`;

/** A team of steps in a line, each with the place `words` gives it: `base` is the ending's workspace, none is a step frozen before. */
const team = (...words: Array<'folder' | 'git' | 'base' | undefined>): Workflow[] =>
  words.map((word, i) => ({
    name: `s${i}`,
    after: i ? [`s${i - 1}`] : [],
    body: 'x',
    permissionMode: 'dontAsk',
    ...(word === 'base' ? { workspace: word } : word ? { place: word } : {}),
  }));

const ship = { name: 'ship', after: ['review'], body: 'x', workspace: 'base' } as Workflow;
const chain: Workflow[] = [step('implement'), step('review', ['implement']), ship];
/** implement → review (looping back when `loop`) → ship, in the base workspace with a check, gated when `gate`. */
const ending = (loop: boolean, gate: boolean): Workflow[] => [
  step('implement'),
  { ...step('review', ['implement']), ...(loop ? { loop: 'implement' } : {}) },
  { ...ship, check: 'npm test', ...(gate ? { gate: true } : {}) },
];
const watcher = { name: 'supervise', after: [], body: 'x', slot: 'none' } as Workflow;
const replies = { type: 'object', properties: { replies: { type: 'string' } }, required: ['replies'], additionalProperties: false };
const docs = { docs: '---\nafter: implement\nplace: git\n---\ndocument it\n' };
/** implement and `respond` continuing its session, `extra` beside them. */
const resumed = (implement: string, respond: string, extra: Array<[string, string]> = []) =>
  parseFolder([
    ['implement', `---\nplace: git\n${implement}\n---\nimplement it\n`],
    ['respond', `---\nresume: implement\nplace: git\n${respond}\n---\nanswer it\n`],
    ...extra,
  ]);
const respond = (keys: string) => ({ respond: `---\nplace: git\n${keys}\n---\nanswer it\n` });

/** A row: what it reads, and the step its refusal opens on with what it names — or nothing, for a structure that loads. */
type Row = { row: string; run: () => unknown; naming?: [at: string, ...named: string[]] };

const ROWS: Row[] = [
  {
    row: 'after: a diamond is a DAG, not a line',
    run: () => validate([step('a'), step('b', ['a']), step('c', ['a']), step('d', ['b', 'c'])]),
  },
  { row: 'after: REFUSED, a step not here', run: () => validate([step('a'), step('b', ['nope'])]), naming: ['b', 'waits on "nope"'] },
  { row: 'cycle: REFUSED, two steps', run: () => validate([step('a', ['b']), step('b', ['a'])]), naming: ['these steps', 'a, b'] },
  { row: 'cycle: REFUSED, a step on itself', run: () => validate([step('a', ['a'])]), naming: ['a', 'waits on itself'] },
  {
    row: 'resume: implies after',
    run: () => assert.deepEqual(parseWorkflow('respond', fileOf('resume: implement\nplace: git')).after, ['implement']),
  },
  {
    row: 'resume: REFUSED, a step not here',
    run: () => validate([{ name: 'a', after: [], body: 'x', resume: 'ghost' }]),
    naming: ['a', 'resumes "ghost"'],
  },
  {
    row: 'resume: REFUSED, on a different harness',
    run: () =>
      validate([
        { name: 'implement', after: [], body: 'x', harness: 'claude' },
        { name: 'respond', after: ['implement'], body: 'y', harness: 'codex', resume: 'implement' },
      ]),
    naming: ['respond', 'different harness'],
  },
  {
    row: "resume: REFUSED, a context window other than the session's",
    run: () => resumed('context: 200k', 'context: 150k'),
    naming: ['respond: ', '`context: 150k`', "implement's session", '`context: 200k`', 'delete the line'],
  },
  {
    row: "resume: REFUSED, a window where the session runs on the model's whole",
    run: () => resumed('harness: claude', 'context: 150000'),
    naming: ['respond: ', '`context: 150k`', "the model's whole window"],
  },
  {
    row: 'resume: REFUSED, a window other than the one a chain continues',
    run: () => resumed('context: 200k', 'harness: claude', [['more', '---\nresume: respond\nplace: git\ncontext: 300k\n---\nmore\n']]),
    naming: ['more: ', '`context: 300k`', "respond's session", '`context: 200k`'],
  },
  {
    row: 'resume: the same window written another way, and none, inherit it',
    run: () => {
      const same = resumed('context: 200k', 'context: 200000');
      assert.deepEqual(
        same.map((s) => sessionContext(s, same)),
        [200_000, 200_000],
      );
      const inherits = resumed('context: 200k', 'harness: claude');
      assert.deepEqual(
        inherits.map((s) => [s.context, sessionContext(s, inherits)]),
        [
          [200_000, 200_000],
          [undefined, 200_000],
        ],
      );
    },
  },
  { row: 'loop: a target it waits on', run: () => assert.equal(folderOf('loop: implement')[1].loop, 'implement') },
  {
    row: 'loop: REFUSED, a step beside it',
    run: () => folderOf('loop: docs', docs),
    naming: ['review: ', '`loop: docs`', 'does not wait on docs', 'Add docs to `after:`'],
  },
  {
    row: 'loop: REFUSED, a step after it',
    run: () => folderOf('loop: ship', { ship: '---\nafter: review\nplace: git\n---\nship it\n' }),
    naming: ['review: ', '`loop: ship`', 'does not wait on ship'],
  },
  { row: 'loop: REFUSED, itself', run: () => folderOf('loop: review'), naming: ['review: ', '`loop: review`', 'names this step'] },
  { row: 'loop: REFUSED, a step not here', run: () => folderOf('loop: implemnt'), naming: ['review: ', '`loop: implemnt`', 'not here'] },
  {
    row: 'loop: REFUSED, two steps',
    run: () => folderOf('loop: implement, docs', docs),
    naming: ['review: ', '`loop: implement, docs`', 'more than one step'],
  },
  {
    row: 'loop: REFUSED, an output without `again`',
    run: () => folderOf('loop: implement', { 'review.schema.json': FINDINGS }),
    naming: ['review: ', '`loop: implement`', 'does not declare `again`', '`"again": { "type": "boolean" }`', '`required`'],
  },
  {
    row: 'loop: REFUSED, no output',
    run: () => folderOf(null, { review: '---\nafter: implement\nplace: git\nloop: implement\n---\nreview it\n' }),
    naming: ['review: ', '`loop: implement`', 'declares no `output:`', '`again`'],
  },
  ...(['string', ['boolean', 'null']] as const).map((type): Row => ({
    row: `loop: REFUSED, \`again\` as ${JSON.stringify(type)}`,
    run: () =>
      folderOf('loop: implement', { 'review.schema.json': { ...LOOPING, properties: { ...LOOPING.properties, again: { type } } } }),
    naming: ['review: ', 'declares `again` as', '`"type": "boolean"`'],
  })),
  {
    row: 'rounds: REFUSED, on a step with no loop',
    run: () => folderOf('rounds: 2', { 'review.schema.json': FINDINGS }),
    naming: ['review: ', '`rounds: 2`', 'no `loop:`', 'Add `loop: <step>`', '`retries:`'],
  },
  ...['0', 'three', '-1', '2.5'].map((bad): Row => ({
    row: `rounds: REFUSED, ${bad}`,
    run: () => folderOf(`loop: implement\nrounds: ${bad}`),
    naming: ['review: ', `\`rounds: ${bad}\` is not a count`, 'above zero'],
  })),
  {
    row: 'loop: REFUSED, a step in it that forks',
    run: () => folderOf('loop: implement', docs),
    naming: ['review: ', '`loop: implement`', 'docs waits on implement too', 'review forks a worktree', 'after review'],
  },
  {
    row: 'loop: REFUSED, a step in it that merges',
    run: () => validate([step('implement'), looping('review', ['implement', 'test'], 'implement'), step('test', ['implement'])]),
    naming: ['review: ', 'it waits on implement and test', 'merges their branches', 'after review'],
  },
  {
    row: 'loop: REFUSED, a step in it that resumes',
    run: () =>
      validate([step('implement'), { ...step('test', ['implement']), resume: 'implement' }, looping('review', ['test'], 'implement')]),
    naming: ['test: ', '`resume: implement`', "review's loop (`loop: implement`)", 'Delete the line'],
  },
  {
    row: 'loop: REFUSED, the looping step resuming',
    run: () => validate([step('implement'), { ...looping('review', [], 'implement'), resume: 'implement', after: ['implement'] }]),
    naming: ['review: ', '`resume: implement`', "review's loop"],
  },
  {
    row: 'loop: REFUSED, a step in two loops',
    run: () => validate([step('a'), looping('b', ['a'], 'a'), looping('c', ['b'], 'b')]),
    naming: ['b ', 'two loops', "b's (`loop: a`)", "c's (`loop: b`)"],
  },
  {
    row: 'loop: REFUSED, a target that declares `replies`',
    run: () =>
      folderOf('loop: implement', {
        implement: '---\nplace: git\noutput: implement.schema.json\n---\nimplement it\n',
        'implement.schema.json': replies,
      }),
    naming: ['implement: ', '`output: implement.schema.json` declares `replies`', '(`loop: implement`)', 'Rename the field'],
  },
  { row: 'base: the last step may work in the checkout', run: () => validate(chain) },
  { row: 'base: so may a workflow of one step', run: () => validate([{ ...ship, after: [] }]) },
  {
    row: 'base: REFUSED, a step waiting on it',
    run: () => validate([...chain, step('tell', ['ship'])]),
    naming: ['ship: ', '`workspace: base`', 'tell waits on it', 'Move tell before ship'],
  },
  {
    row: 'base: REFUSED, two steps waiting on it',
    run: () => validate([...chain, step('tell', ['ship']), step('say', ['ship'])]),
    naming: ['ship: ', 'tell, say wait on it'],
  },
  {
    row: 'base: REFUSED, a step ending the workflow beside it',
    run: () => validate([...chain, step('publish', ['review'])]),
    naming: ['ship: ', 'publish ends the workflow beside it', 'make ship wait on publish'],
  },
  {
    row: 'base: REFUSED, two of them',
    run: () =>
      validate([
        { ...step('a'), workspace: 'base' },
        { ...step('b'), workspace: 'base' },
      ]),
    naming: ['a: ', 'b ends the workflow beside it'],
  },
  {
    row: 'base: REFUSED, a resume, whichever line comes first',
    run: () => {
      assert.throws(() => parseWorkflow('ship', fileOf('place: git\nresume: review\nworkspace: base')), WorkflowError);
      parseWorkflow('ship', fileOf('place: git\nworkspace: base\nresume: review'));
    },
    naming: ['ship: ', '`workspace: base`', "`resume: review` continues review's session", 'Delete one of the two lines'],
  },
  {
    row: "base: a check, a gate and retries' absence read as on any step",
    run: () => {
      const gated = parseWorkflow('ship', fileOf('place: git\ncheck: npm test\ngate: true\nworkspace: base'));
      assert.deepEqual([gated.workspace, gated.gate, gated.check], ['base', true, 'npm test']);
      assert.equal(parseWorkflow('ship', fileOf('place: git\nworkspace: base\ncheck: npm test')).gate, undefined);
      assert.throws(() => parseWorkflow('ship', fileOf('place: git\nworkspace: base\ngate: true\ncheck: none')), /check/);
    },
  },
  {
    row: 'base: REFUSED, a check with neither a gate nor a loop before it',
    run: () => validate(ending(false, false)),
    naming: ['ship: ', '`workspace: base`', '`check: npm test`', '(it waits on review)', 'Add `gate: true`', 'give review a `loop:`'],
  },
  {
    row: 'base: REFUSED, a check on an ending that waits on nothing',
    run: () => validate([{ ...ship, after: [], check: 'npm test' }]),
    naming: ['ship: ', 'waits on nothing', 'give the step before it a `loop:`'],
  },
  {
    row: 'base: REFUSED, a check behind a step between it and the loop',
    run: () =>
      validate([...ending(true, false).slice(0, 2), step('measure', ['review']), { ...ship, check: 'npm test', after: ['measure'] }]),
    naming: ['ship: ', '(it waits on measure)', 'give measure a `loop:`'],
  },
  { row: "base: a check after a loop (quick's shape)", run: () => validate(ending(true, false)) },
  { row: "base: a gated check (build's shape)", run: () => validate(ending(false, true)) },
  { row: 'base: a check gated after a loop', run: () => validate(ending(true, true)) },
  {
    row: 'base: no check, nothing to file',
    run: () => validate(ending(false, false).map((s) => (s.name === 'ship' ? { ...s, check: undefined } : s))),
  },
  ...['workspace: base\ngate: true\ncheck: npm test\nharness: codex', 'harness: codex\ncheck: npm test\ngate: true\nworkspace: base'].map(
    (lines): Row => ({
      row: `base: REFUSED, a gated check on codex — ${lines.split('\n')[0]} first`,
      run: () => parseWorkflow('ship', fileOf(`place: git\n${lines}`)),
      naming: ['ship: ', '`workspace: base`', '`check: npm test`', '`denyWhileLanding`', 'delete `harness: codex`'],
    }),
  ),
  {
    row: 'base: on codex with no check of its own, and on claude with one',
    run: () => {
      assert.equal(parseWorkflow('ship', fileOf('place: git\nworkspace: base\ngate: true\nharness: codex')).harness, 'codex');
      assert.equal(
        parseWorkflow('ship', fileOf('place: git\nworkspace: base\ngate: true\ncheck: npm test\nharness: claude')).check,
        'npm test',
      );
    },
  },
  ...['workspace: base\ngate: true\ncheck: npm test\nretries: 1', 'retries: 1\nworkspace: base', 'workspace: base\nretries: 0'].map(
    (lines): Row => ({
      row: `base: REFUSED, retries — ${lines.replace(/\n/g, ', ')}`,
      run: () => parseWorkflow('ship', fileOf(`place: git\n${lines}`)),
      naming: [
        'ship: ',
        '`workspace: base`',
        `\`retries: ${/retries: (\d)/.exec(lines)?.[1]}\``,
        'nemia retry <run> ship',
        'Delete the `retries:` line',
      ],
    }),
  ),
  { row: 'slot: a workflow of one step takes none', run: () => validate([watcher]) },
  {
    row: 'slot: REFUSED, a root beside it',
    run: () => validate([watcher, step('implement')]),
    naming: ['supervise: ', '`slot: none`', 'WF_MAX_RUNS', 'implement beside it', 'a folder of its own'],
  },
  {
    row: 'slot: REFUSED, a step before it',
    run: () => validate([step('implement'), { ...watcher, after: ['implement'] }]),
    naming: ['supervise: ', 'implement beside it'],
  },
  {
    row: 'slot: REFUSED, a step after it',
    run: () => validate([watcher, step('review', ['supervise'])]),
    naming: ['supervise: ', 'review beside it'],
  },
  {
    row: 'slot: REFUSED, two beside it',
    run: () => validate([watcher, step('implement'), step('review', ['implement'])]),
    naming: ['supervise: ', 'implement, review beside it'],
  },
  { row: 'place: every step says folder', run: () => validate(team('folder', 'folder')) },
  { row: 'place: none says folder, one frozen before the key', run: () => validate(team(undefined, 'git', 'base')) },
  {
    row: 'place: REFUSED, folder then a step frozen on git',
    run: () => validate(team('folder', undefined)),
    naming: ['s0 says `place: folder`', 's1 works on a repository', 'Write `place: folder` on s1, or `place: git` on s0'],
  },
  {
    row: 'place: REFUSED, two folders after a git step',
    run: () => validate(team(undefined, 'folder', 'folder')),
    naming: ['s1, s2 say `place: folder`', 's0 works on a repository'],
  },
  {
    row: 'place: REFUSED, folder then git',
    run: () => validate(team('folder', 'git')),
    naming: ['s0 says `place: folder`', 's1 works on a repository'],
  },
  {
    row: 'place: REFUSED, folder then base',
    run: () => validate(team('folder', 'base')),
    naming: ['s0 says `place: folder`', 's1 works on a repository'],
  },
  {
    row: 'place: REFUSED, from a folder of files',
    run: () =>
      parseFolder([
        ['write', '---\nplace: git\npermissionMode: dontAsk\n---\nWrite.\n'],
        ['review', '---\nafter: write\nplace: folder\n---\nReview.\n'],
      ]),
    naming: ['review says `place: folder`', 'write works on a repository'],
  },
  {
    row: 'input: a step it waits on',
    run: () => assert.deepEqual(folderOf('', respond('after: review\ninput: review')).find((s) => s.name === 'respond')?.input, ['review']),
  },
  {
    row: 'input: a step it resumes',
    run: () =>
      assert.deepEqual(folderOf('', respond('resume: review\ninput: review')).find((s) => s.name === 'respond')?.input, ['review']),
  },
  {
    row: 'input: a step two back, through the steps between',
    run: () =>
      folderOf('', {
        implement: '---\nplace: git\noutput: review.schema.json\n---\nimplement it\n',
        ...respond('after: review\ninput: implement'),
      }),
  },
  {
    row: 'input: a resume handed without the after the parser adds',
    run: () =>
      validate([
        step('implement'),
        { ...step('review', ['implement']), output: { file: 'r.json', schema: FINDINGS as never } },
        { name: 'respond', after: [], resume: 'review', input: ['review'], body: 'x' },
      ]),
  },
  ...['after: implement\ninput: review', 'input: review'].map((keys): Row => ({
    row: `input: REFUSED, a step it does not wait on — ${keys.replace(/\n/g, ', ')}`,
    run: () => folderOf('', respond(keys)),
    naming: ['respond: ', '`input: review`', 'does not wait on review', 'Add review to `after:`', 'delete the line'],
  })),
  {
    row: 'input: REFUSED, a step not here',
    run: () => folderOf('', respond('after: review\ninput: reveiw')),
    naming: ['respond: ', '`input: reveiw`', 'names a step that is not here', 'delete the line'],
  },
  {
    row: 'input: REFUSED, a step that declares no output',
    run: () => folderOf('', respond('after: implement\ninput: implement')),
    naming: ['respond: ', '`input: implement`', 'implement declares no `output:`', 'implement.md'],
  },
];

test('the structure of a workflow: what loads, and what is refused naming the step and its fix', async (t) => {
  for (const { row, run, naming } of ROWS)
    await t.test(row, () => {
      if (!naming) return void run();
      const [at, ...named] = naming;
      assert.throws(run, (e: unknown) => {
        assert.ok(e instanceof WorkflowError, String(e));
        assert.equal(e.exitCode, 2, e.message);
        assert.ok(e.message.startsWith(at), e.message);
        for (const name of named) assert.ok(e.message.includes(name), `names ${name}: ${e.message}`);
        return true;
      });
    });
});

test("`orderSteps`: every step after each step its `after` names, and otherwise as given — so an order that already runs forward is kept, and a loop's edge back orders nothing", () => {
  const names = (steps: readonly Workflow[]) => orderSteps(steps).map((s) => s.name);
  const byName = (steps: readonly Workflow[]) => [...steps].sort((a, b) => (a.name < b.name ? -1 : 1));
  assert.deepEqual(
    names([step('implement', ['plan']), step('plan'), { ...step('review', ['implement']), loop: 'implement' }]),
    ['plan', 'implement', 'review'],
    "plan → implement ⇄ review, given in the folder's order: alphabetical",
  );
  assert.deepEqual(
    folderOf('loop: implement', {
      implement: '---\nafter: plan\nplace: git\n---\nImplement it.\n',
      plan: '---\nplace: git\n---\nPlan it.\n',
    }).map((s) => s.name),
    ['plan', 'implement', 'review'],
    "and so a folder of them loads, not in its files' order",
  );
  const fan = [step('m', ['b', 'z']), step('z', ['a']), step('b', ['a']), step('a')];
  assert.deepEqual(names(byName(fan)), ['a', 'b', 'z', 'm'], 'a fan-out as a folder lists it: the siblings by name, the join after both');
  assert.deepEqual(names(byName([step('x'), step('b', ['x']), step('c')])), ['c', 'x', 'b'], 'the follower once its root is placed');
  const frozen = ['build', 'test', 'e2e', 'lint', 'docs', 'notes', 'plan'].map((n) => step(n)).concat(step('ship', ['test']));
  assert.deepEqual(
    names(frozen),
    frozen.map((s) => s.name),
    'an order that already runs forward is kept as given, not sorted',
  );
  assert.deepEqual(names([step('a'), step('z', ['a']), step('b', ['a']), step('m', ['b', 'z'])]), ['a', 'z', 'b', 'm']);
  assert.deepEqual(names(fan), ['a', 'z', 'b', 'm'], 'given out of order, only what comes before what it waits on moves');
  assert.deepEqual(
    names([parseWorkflow('respond', fileOf('resume: implement\nplace: git')), step('implement')]),
    ['implement', 'respond'],
    '`resume:` is in `after` already',
  );
  assert.deepEqual(names([step('b', ['ghost']), step('a', ['b'])]), ['b', 'a'], 'an after naming no step here orders nothing');
  assert.deepEqual(names([step('y', ['x']), step('x', ['y']), step('a')]), ['a', 'y', 'x'], 'steps waiting on each other go last');
  const given = [step('b', ['a']), step('a')];
  orderSteps(given);
  assert.deepEqual(
    given.map((s) => s.name),
    ['b', 'a'],
    'pure: what it was given is left as it was',
  );
});

test('`terminalSteps` are where the work ends up, and `fansOut` says whether a workflow has more than one line', () => {
  const line = [step('a'), step('b', ['a']), step('c', ['b'])];
  assert.deepEqual(
    terminalSteps(line).map((s) => s.name),
    ['c'],
  );
  assert.equal(fansOut(line), false, 'a chain does not fan out');
  assert.equal(fansOut([...line, step('d', ['a'])]), true, 'two follow a');
  assert.equal(fansOut([step('a'), step('b')]), true, 'two roots');
  const fan = [step('split'), step('a', ['split']), step('b', ['split']), step('integrate', ['a', 'b'])];
  assert.deepEqual(
    terminalSteps(fan).map((s) => s.name),
    ['integrate'],
  );
  assert.deepEqual(
    terminalSteps([step('a'), step('b')]).map((s) => s.name),
    ['a', 'b'],
    'a workflow may end wide',
  );
});

test('`loop:` counts `rounds:`, 3 unless it says — and a loop is its target, what is between, and itself', () => {
  const steps = folderOf('loop: implement');
  assert.deepEqual([steps[1].loop, steps[1].rounds, DEFAULT_ROUNDS], ['implement', 3, 3]);
  assert.equal(folderOf('loop: implement\nrounds: 1')[1].rounds, 1);
  assert.deepEqual([steps[0].loop, steps[0].rounds], [undefined, undefined], 'a step with no loop counts no rounds');
  const loops = [
    step('implement'),
    step('test', ['implement']),
    looping('review', ['test'], 'implement'),
    step('docs', ['review']),
    looping('proof', ['docs'], 'docs'),
  ];
  validate(loops);
  assert.deepEqual(loopSpan(loops, loops[2]), ['implement', 'test', 'review'], 'a step between is in the loop');
  assert.deepEqual(loopSpan(loops, loops[4]), ['docs', 'proof'], 'a second loop starts where the first ends');
  assert.deepEqual(loopSpan(loops, loops[1]), [], 'a step with no loop spans nothing');
});

test('`isFolderTeam` and `stepPlace`: a team works in folders when every step says so, and a step frozen before the key on a repository', () => {
  assert.equal(isFolderTeam(team('folder', 'folder')), true);
  assert.equal(isFolderTeam(team('folder', 'git')), false);
  assert.equal(isFolderTeam(team(undefined)), false, 'a step frozen on a record before the key is a git step');
  assert.equal(stepPlace({ place: undefined }), 'git');
  assert.equal(stepPlace({ place: 'folder' }), 'folder');
});
