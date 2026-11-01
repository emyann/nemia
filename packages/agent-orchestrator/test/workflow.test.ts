/**
 * The format, and the two ways a folder of markdown is not a workflow.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fansOut, orderSteps, terminalSteps, parseWorkflow, validate, WorkflowError, type Workflow } from '../src/workflow.ts';
import { isFolderTeam, splitFrontmatter, stepPlace } from '../src/workflow.ts';
import { loadWorkflows, workflowDescription, workflowFolder, workflowReadme } from '../src/folder/folder.store.ts';
import { CLOSEOUT_FIELDS, DEFAULT_ROUNDS, loopSpan, outputFields, STEP_KEY_MEANINGS, STEP_KEYS, type StepKey } from '../src/workflow.ts';
import { agentsDir, parseFolder, renderStep, sessionContext, stepNameRefusal, type StepDraft } from '../src/workflow.ts';
import { skillsFor } from '../src/skills/read.store.ts';
import { loadAgents } from '../src/agents/read.store.ts';
import { allowRuleOf, disallowedBy, DENIALS } from '../src/workflow.ts';
import { CLAUDE_PERMISSION_MODES, CODEX_SANDBOXES } from 'agent-runtime';
import {
  asNamed,
  autoDropped,
  cardRetired,
  codexModeLine,
  codexModeWritten,
  FORMER_KEYS,
  formerKeyLine,
  formerKeysIn,
  harnessPromptLine,
  parseAgent,
  renderAgent,
} from '../src/workflow.ts';
import { formerKeyLines } from '../src/folder/folder.store.ts';
import { Schema } from 'effect';
import { WorkflowDir } from '../src/folder/folder.model.ts';
import { baseLine, formerFenceLine, formerFormLine, placeLine } from '../src/former/former.ts';
import { endsOnBase } from '../src/step/step.ts';
import { readsMounts } from '../src/filed/filed.ts';
import { FILED_AS } from '../src/keys/filed-as.ts';
import { scratch } from './scratch.ts';
import { placesOf, shippedFolders, TEAM_DEV, teamCopy } from './team.ts';

const step = (name: string, after: string[] = []): Workflow => ({ name, after, body: 'do a thing' });

/**
 * That `message` opens on `at` — the step or file it is about — and names each of `named`: the line as written, and the key, line or
 * command its fix names. The sentence around them is the code's to word ("Errors say what to do next", CLAUDE.md).
 */
const names = (message: string, at: string, ...named: string[]): true => {
  assert.ok(message.startsWith(at), `opens on ${at}: ${message}`);
  for (const name of named) assert.ok(message.includes(name), `names ${name}: ${message}`);
  return true;
};

/** Refused as a `WorkflowError` with exit 2, the author's to fix, its message as `names` reads it. */
const refusedNaming =
  (at: string, ...named: string[]) =>
  (e: unknown): true => {
    assert.ok(e instanceof WorkflowError, String(e));
    assert.equal(e.exitCode, 2, e.message);
    return names(e.message, at, ...named);
  };

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
const LOOPING = {
  ...FINDINGS,
  properties: { ...FINDINGS.properties, again: { type: 'boolean' } },
  required: ['findings', 'again'],
};

test('a step is frontmatter and prose, and the prose is the point', () => {
  const w = parseWorkflow('review', '---\nplace: git\nharness: codex\nafter: implement\n---\nRead the diff.\n');
  assert.equal(w.name, 'review');
  assert.equal(w.harness, 'codex');
  assert.deepEqual(w.after, ['implement']);
  assert.equal(w.body, 'Read the diff.');
});

test('check and retries are read — the command verbatim, colons and all', () => {
  const w = parseWorkflow('implement', '---\nplace: git\ncheck: npm test && node -e "console.log(1 ? 2 : 3)"\nretries: 2\n---\nbuild it');
  assert.equal(w.check, 'npm test && node -e "console.log(1 ? 2 : 3)"');
  assert.equal(w.retries, 2);
  const bare = parseWorkflow('implement', '---\nplace: git\nharness: claude\n---\nbuild it');
  assert.equal(bare.check, undefined, 'absent means nothing runs');
  assert.equal(bare.retries, undefined);
});

test('a step with no key but its place is valid: no after, its body whole', () => {
  assert.deepEqual(parseWorkflow('only', '---\nplace: git\n---\nJust do it.').after, []);
  assert.equal(parseWorkflow('only', '---\nplace: git\n---\nJust do it.').body, 'Just do it.');
});

test('after takes a list', () => {
  assert.deepEqual(parseWorkflow('x', '---\nafter: a, b ,c\nplace: git\n---\nbody').after, ['a', 'b', 'c']);
});

test('a step with nothing to say is refused', () => {
  assert.throws(() => parseWorkflow('empty', '---\nplace: git\nharness: claude\n---\n'), WorkflowError);
});

test('waiting on a step that does not exist is refused before anything is spent', () => {
  assert.throws(() => validate([step('a'), step('b', ['nope'])]), /waits on "nope"/);
});

test('a cycle is refused, and named', () => {
  assert.throws(() => validate([step('a', ['b']), step('b', ['a'])]), /wait on each other: a, b/);
  assert.throws(() => validate([step('a', ['a'])]), /waits on itself/);
});

test('a diamond is fine — this is a DAG, not a line', () => {
  validate([step('a'), step('b', ['a']), step('c', ['a']), step('d', ['b', 'c'])]);
});

test('an empty or missing folder says so', () => {
  const dir = scratch('wf-');
  assert.throws(() => loadWorkflows(dir), /no \.md steps/);
  assert.throws(() => loadWorkflows(path.join(dir, 'nope')), /no workflow folder/);
});

/** A folder holding `files`, by name. */
const folder = (files: Record<string, string>): string => {
  const dir = scratch('wf-readme-');
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), text);
  }
  return dir;
};

/** What `loadWorkflows` refused `dir` with; fails the test if it loaded. */
const folderRefusal = (dir: string): WorkflowError => {
  try {
    loadWorkflows(dir);
  } catch (e) {
    assert.ok(e instanceof WorkflowError, String(e));
    return e;
  }
  return assert.fail(`${dir} loaded, and should have been refused`);
};

test("a README in a workflow folder is not a step, and its first paragraph is the workflow's description", () => {
  const dir = folder({
    'README.md': '# dev\n\nImplement what was asked,\nthen review it.\n\nA second paragraph.\n',
    'implement.md': '---\nplace: git\nharness: claude\n---\nImplement it.\n',
    'review.md': '---\nafter: implement\nplace: git\n---\nReview it.\n',
  });
  assert.deepEqual(
    loadWorkflows(dir).map((s) => s.name),
    ['implement', 'review'],
  );
  assert.equal(
    workflowDescription(dir),
    'Implement what was asked, then review it.',
    'the paragraph after the title, and not the one after it',
  );

  const lower = folder({
    'readme.md': '---\ntitle: ui\n---\nA change a person will see.\n',
    'implement.md': '---\nplace: git\n---\nImplement it.\n',
  });
  assert.deepEqual(
    loadWorkflows(lower).map((s) => s.name),
    ['implement'],
    'a readme in any case, with frontmatter a step would be refused for, is skipped, not parsed',
  );
  assert.equal(workflowDescription(lower), 'A change a person will see.', 'and its frontmatter is not the description');

  assert.equal(workflowDescription(folder({ 'implement.md': '---\nplace: git\n---\nImplement it.\n' })), null, 'no README: no description');
  assert.equal(
    workflowDescription(folder({ 'README.md': '# dev\n', 'implement.md': '---\nplace: git\n---\nImplement it.\n' })),
    null,
    'a README with only a title: no description',
  );
  assert.equal(workflowDescription(path.join(scratch('wf-none-'), 'no-such-folder')), null);
});

test('a workflow README is read whole, in any case, and none is null', () => {
  const whole = '# dev\n\nImplement what was asked, then review it.\n\nMore about it.\n';
  assert.equal(
    workflowReadme(folder({ 'README.md': whole, 'implement.md': '---\nplace: git\n---\nImplement it.\n' })),
    whole,
    'every paragraph, the title too',
  );
  const bom = String.fromCharCode(0xfeff);
  assert.equal(
    workflowReadme(folder({ 'readme.md': `${bom}A change a person will see.\n`, 'implement.md': '---\nplace: git\n---\nImplement it.\n' })),
    'A change a person will see.\n',
    'a lowercase readme, without its byte order mark',
  );
  assert.equal(workflowReadme(folder({ 'implement.md': '---\nplace: git\n---\nImplement it.\n' })), null, 'no README: null');
  assert.equal(workflowReadme(path.join(scratch('wf-none-'), 'no-such-folder')), null, 'no folder: null');
});

test('REFUSED: a folder with a README and no step, as a folder with no step is — saying the README is not one', () => {
  for (const readme of ['README.md', 'Readme.md']) {
    const e = folderRefusal(folder({ [readme]: '# dev\n\nImplement, then review.\n' }));
    assert.equal(e.exitCode, 2);
    assert.match(e.message, /has no \.md steps in it/);
    assert.ok(e.message.includes(`${readme} describes the workflow, and is not a step`), e.message);
  }
});

test('REFUSED: a folder of workflows is not a workflow, and the refusal names the ones in it', () => {
  const dir = folder({
    'dev/README.md': '# dev\n',
    'dev/implement.md': '---\nplace: git\n---\nImplement it.\n',
    'ui/implement.md': '---\nplace: git\n---\nImplement it.\n',
    'notes/README.md': '# notes\n',
  });
  const e = folderRefusal(dir);
  assert.equal(e.exitCode, 2);
  assert.ok(
    e.message.includes(`it holds workflows, each a folder of steps: dev, ui. Name one of them: ${path.join(dir, 'dev')}.`),
    `a folder with only a README holds no workflow to name: ${e.message}`,
  );
});

test('resume implies after — you cannot continue a session that has not run', () => {
  const w = parseWorkflow('respond', '---\nresume: implement\nplace: git\n---\nreply to the review');
  assert.equal(w.resume, 'implement');
  assert.deepEqual(w.after, ['implement'], 'the ordering comes for free');
});

test('resuming a step on a different harness is refused', () => {
  const steps = [
    { name: 'implement', after: [], body: 'x', harness: 'claude' },
    { name: 'respond', after: ['implement'], body: 'y', harness: 'codex', resume: 'implement' },
  ];
  assert.throws(() => validate(steps), /different harness/);
});

test("`orderSteps`: every step after each step its `after` names, and otherwise as given — by name, as a folder lists them — so an order that already runs forward is kept, and a loop's edge back orders nothing", () => {
  const names = (steps: readonly Workflow[]) => orderSteps(steps).map((s) => s.name);
  const byName = (steps: readonly Workflow[]) => [...steps].sort((a, b) => (a.name < b.name ? -1 : 1));
  assert.deepEqual(
    names([step('implement', ['plan']), step('plan'), { ...step('review', ['implement']), loop: 'implement' }]),
    ['plan', 'implement', 'review'],
    "plan → implement ⇄ review, given in the folder's order: alphabetical",
  );
  const fan = [step('m', ['b', 'z']), step('z', ['a']), step('b', ['a']), step('a')];
  assert.deepEqual(
    names(byName(fan)),
    ['a', 'b', 'z', 'm'],
    'a fan-out as a folder lists it: the siblings by name, and the join after both',
  );
  assert.deepEqual(
    names(byName([step('x'), step('b', ['x']), step('c')])),
    ['c', 'x', 'b'],
    'two roots and a follower as a folder lists them: the follower once its root is placed, though its name sorts first',
  );
  const frozen = [
    step('build'),
    step('test'),
    step('e2e'),
    step('lint'),
    step('docs'),
    step('notes'),
    step('plan'),
    step('ship', ['test']),
  ];
  assert.deepEqual(
    names(frozen),
    frozen.map((s) => s.name),
    'an order that already runs forward, a workflow frozen so, which the board lists as its record has it, is kept as given, not sorted',
  );
  assert.deepEqual(names([step('a'), step('z', ['a']), step('b', ['a']), step('m', ['b', 'z'])]), ['a', 'z', 'b', 'm']);
  assert.deepEqual(
    names(fan),
    ['a', 'z', 'b', 'm'],
    'given out of order, only what comes before what it waits on moves: the root first, the siblings as given, the join after both',
  );
  assert.deepEqual(
    names([parseWorkflow('respond', '---\nresume: implement\nplace: git\n---\nanswer it\n'), step('implement')]),
    ['implement', 'respond'],
    '`resume:` is in `after` already',
  );
  assert.deepEqual(
    names([step('b', ['ghost']), step('a', ['b'])]),
    ['b', 'a'],
    'on what validate refuses, for a record read back: an after naming no step here orders nothing',
  );
  assert.deepEqual(
    names([step('y', ['x']), step('x', ['y']), step('a')]),
    ['a', 'y', 'x'],
    'and steps waiting on each other go last, as given',
  );
  const given = [step('b', ['a']), step('a')];
  orderSteps(given);
  assert.deepEqual(
    given.map((s) => s.name),
    ['b', 'a'],
    'pure: what it was given is left as it was',
  );
});

test("REFUSED before, now in order: a folder `plan → implement ⇄ review` loads as plan, implement, review — not in its files' order, implement, plan, review", () => {
  const dir = folder({
    'implement.md': '---\nafter: plan\nplace: git\n---\nImplement it.\n',
    'plan.md': '---\nplace: git\n---\nPlan it.\n',
    'review.md': '---\nafter: implement\nplace: git\nloop: implement\noutput: review.schema.json\n---\nReview it.\n',
    'review.schema.json': JSON.stringify({
      type: 'object',
      properties: { again: { type: 'boolean' } },
      required: ['again'],
      additionalProperties: false,
    }),
  });
  assert.deepEqual(
    fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.md'))
      .sort(),
    ['implement.md', 'plan.md', 'review.md'],
    'the folder alone reads backwards',
  );
  assert.deepEqual(
    loadWorkflows(dir).map((s) => s.name),
    ['plan', 'implement', 'review'],
  );
});

test('resuming a step that does not exist is refused', () => {
  assert.throws(() => validate([{ name: 'a', after: [], body: 'x', resume: 'ghost' }]), /resumes "ghost"/);
});

test("REFUSED at shipped defaults: the team's review with its loop pointed at a step it does not wait on, with `again` gone from its schema, or beside another step", () => {
  const copy = () => {
    const dir = path.join(teamCopy('wf-loop-'), 'dev');
    fs.rmSync(path.join(dir, 'ship.md'));
    return dir;
  };
  const refused = (dir: string): string => {
    try {
      loadWorkflows(dir);
    } catch (e) {
      assert.ok(e instanceof WorkflowError, String(e));
      assert.equal(e.exitCode, 2);
      return e.message;
    }
    return assert.fail('loaded, and should have been refused');
  };
  assert.deepEqual(
    loadWorkflows(copy()).map((s) => s.name),
    ['implement', 'review'],
    'the copy, its ending taken off and nothing else, loads',
  );
  const docs = '---\nafter: implement\nplace: git\n---\ndocument it\n';

  const elsewhere = copy();
  fs.writeFileSync(path.join(elsewhere, 'docs.md'), docs);
  fs.writeFileSync(
    path.join(elsewhere, 'review.md'),
    fs.readFileSync(path.join(elsewhere, 'review.md'), 'utf8').replace(/^loop: implement$/m, 'loop: docs'),
  );
  assert.match(fs.readFileSync(path.join(elsewhere, 'review.md'), 'utf8'), /^loop: docs$/m, 'the change is really in the file');
  names(refused(elsewhere), 'review: ', '`loop: docs`', '`after:`');

  const lacks = copy();
  const schemaFile = path.join(lacks, '..', 'agents', 'review.schema.json');
  const schema = JSON.parse(fs.readFileSync(schemaFile, 'utf8'));
  delete schema.properties.again;
  schema.required = schema.required.filter((f: string) => f !== 'again');
  fs.writeFileSync(schemaFile, JSON.stringify(schema));
  names(refused(lacks), 'review: ', '`loop: implement`', '`output: review.schema.json`', '`again`');

  const beside = copy();
  fs.writeFileSync(path.join(beside, 'docs.md'), docs);
  const forks = refused(beside);
  names(forks, 'review: ', '`loop: implement`', 'docs waits on implement', 'after review');
});

test('a chain does not fan out; a diamond does', () => {
  const chain = [
    { name: 'a', after: [], body: 'x' },
    { name: 'b', after: ['a'], body: 'x' },
    { name: 'c', after: ['b'], body: 'x' },
  ];
  assert.equal(fansOut(chain), false);
  assert.equal(fansOut([...chain, { name: 'd', after: ['a'], body: 'x' }]), true, 'two follow a');
  assert.equal(
    fansOut([
      { name: 'a', after: [], body: 'x' },
      { name: 'b', after: [], body: 'x' },
    ]),
    true,
    'two roots',
  );
});

test('the terminal steps are where the work ends up', () => {
  const chain = [
    { name: 'implement', after: [], body: 'x' },
    { name: 'review', after: ['implement'], body: 'x' },
  ];
  assert.deepEqual(
    terminalSteps(chain).map((s) => s.name),
    ['review'],
  );

  const fan = [
    { name: 'split', after: [], body: 'x' },
    { name: 'a', after: ['split'], body: 'x' },
    { name: 'b', after: ['split'], body: 'x' },
    { name: 'integrate', after: ['a', 'b'], body: 'x' },
  ];
  assert.deepEqual(
    terminalSteps(fan).map((s) => s.name),
    ['integrate'],
  );

  assert.deepEqual(
    terminalSteps([
      { name: 'a', after: [], body: 'x' },
      { name: 'b', after: [], body: 'x' },
    ]).map((s) => s.name),
    ['a', 'b'],
    'a workflow may end wide, and then there is more than one place to look',
  );
});

test("a step that works in the repository's checkout is the workflow's last: REFUSED when anything waits on it, and when another step ends the workflow beside it", () => {
  const ship = { name: 'ship', after: ['review'], body: 'x', workspace: 'base' } as Workflow;
  const chain: Workflow[] = [{ name: 'implement', after: [], body: 'x' }, { name: 'review', after: ['implement'], body: 'x' }, ship];
  assert.doesNotThrow(() => validate(chain), 'the last step may work in the checkout');
  assert.doesNotThrow(() => validate([{ name: 'ship', after: [], body: 'x', workspace: 'base' }]), 'and so may a workflow of one step');

  const refused = (steps: Workflow[], pattern: RegExp) =>
    assert.throws(
      () => validate(steps),
      (e: WorkflowError) => e.exitCode === 2 && pattern.test(e.message),
      pattern.source,
    );
  refused(
    [...chain, { name: 'tell', after: ['ship'], body: 'x' }],
    /^ship: `workspace: base` runs the step in the repository's own checkout, and tell waits on it — each would start from a checkout this step has changed, and none of them is where the run's work is\. It is a workflow's last step: nothing may wait on it\. Move tell before ship, or delete the line\.$/,
  );
  refused(
    [...chain, { name: 'tell', after: ['ship'], body: 'x' }, { name: 'say', after: ['ship'], body: 'x' }],
    /and tell, say wait on it/,
  );
  refused(
    [...chain, { name: 'publish', after: ['review'], body: 'x' }],
    /^ship: `workspace: base` runs the step in the repository's own checkout, and publish ends the workflow beside it, so both could be working in that one directory at once\. A run has one ending: make ship wait on publish, or delete the line\.$/,
  );
  refused(
    [
      { name: 'a', after: [], body: 'x', workspace: 'base' },
      { name: 'b', after: [], body: 'x', workspace: 'base' },
    ],
    /^a: .* and b ends the workflow beside it/,
  );
});

test('the shipped examples are valid workflows too', () => {
  const examples = path.join(import.meta.dirname, '..', 'wf-examples');
  for (const d of fs.readdirSync(examples, { withFileTypes: true }).filter((e) => e.isDirectory())) {
    assert.ok(loadWorkflows(path.join(examples, d.name)).length, `${d.name} has steps`);
  }

  assert.equal(fansOut(loadWorkflows(path.join(examples, 'fanout'))), true, 'two roots meeting at integrate');

  const split = loadWorkflows(path.join(examples, 'split'));
  assert.deepEqual(
    split.map((s) => s.name),
    ['split'],
    'the splitter proposes parts and files none: one step on its own; the runs a person starts after reading PLAN.md are concurrent',
  );
  assert.deepEqual(split[0].after, [], 'nothing precedes it — splitting is the first thing');
  assert.equal(fansOut(split), false);
});

/** `lines` with `place: git` before them, unless they say a place already, as every step file must. */
const placed = (lines: string): string => (/^(place:|workspace: folder)/m.test(lines) ? lines : `place: git\n${lines}`);

/** A step with this frontmatter and a body, with `place: git` unless it says a place (`placed`), as a folder hands it to the parser. */
const fm = (name: string, lines: string) => parseWorkflow(name, `---\n${placed(lines)}\n---\nDo the work.\n`);

test('every key a step has is read — none is accepted and then dropped', () => {
  const values: Record<Exclude<StepKey, 'workspace' | 'slot' | 'agent' | 'skills' | 'mcp' | 'sandbox'>, string> = {
    after: 'implement',
    resume: 'implement',
    input: 'implement',
    place: 'folder',
    writable: 'web, docs',
    reads: 'inbox',
    harness: 'claude',
    model: 'opus',
    effort: 'xhigh',
    context: '150000',
    permissionMode: 'dontAsk',
    tools: 'Read, Grep, Glob, Bash',
    disallowedTools: 'Bash(npm run build), SendMessage',
    allowedTools: 'Edit(**), Bash(npm test)',
    denials: 'fail',
    remote: 'true',
    deadlineSeconds: '900',
    budget: '2.50',
    check: 'npm test && npm run typecheck',
    retries: '1',
    gate: 'true',
    output: 'review.schema.json',
    tally: 'findings',
    loop: 'implement',
    rounds: '2',
  };
  const text = `---\n${Object.entries(values)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')}\n---\nDo the work.\n`;
  const w = parseWorkflow('review', text, (file) => (file === 'review.schema.json' ? JSON.stringify(LOOPING) : undefined));
  const ending = fm('ship', 'after: review\nworkspace: base');
  assert.equal(ending.workspace, 'base', 'workspace: is read on a step of its own: no step may set it beside a check:');
  const watching = fm('supervise', 'slot: none');
  assert.equal(watching.slot, 'none', "slot: is read on a step of its own: it is a workflow of one step's");
  const attached = parseWorkflow(
    'build',
    '---\nplace: git\nagent: implementer\nskills: look\nmcp: docs\n---\nBuild it.\n',
    undefined,
    new Map([['implementer', { name: 'implementer', keys: {}, body: '', read: () => undefined }]]),
  );
  assert.equal(
    attached.agent?.name,
    'implementer',
    'agent: names an agent the step is resolved with, and test/agents.test.ts reads it too',
  );
  assert.deepEqual(attached.skills, ['look'], 'skills: is read on a step with an agent, and test/step-skills.test.ts reads it too');
  assert.deepEqual(attached.mcp, ['docs'], 'mcp: is read on a step with an agent, and test/agent-mcp.test.ts reads it too');
  const fenced = fm('review', 'harness: codex\nsandbox: read-only');
  assert.equal(fenced.sandbox, 'read-only', "sandbox: is read on a step of its own: it is Codex's, and the step above runs on Claude Code");
  const all = {
    ...w,
    workspace: ending.workspace,
    slot: watching.slot,
    agent: attached.agent,
    skills: attached.skills,
    mcp: attached.mcp,
    sandbox: fenced.sandbox,
  };
  for (const key of STEP_KEYS) assert.notEqual(all[key], undefined, `${key} is on the list and never read`);
  assert.equal(w.deadlineSeconds, 900);
  assert.equal(w.retries, 1);
  assert.deepEqual(w.input, ['implement']);
  assert.deepEqual(w.output, { file: 'review.schema.json', schema: LOOPING });
  assert.deepEqual(w.tally, ['findings']);
  assert.deepEqual([w.loop, w.rounds], ['implement', 2]);
  assert.equal(w.gate, true);
  assert.equal(w.remote, true);
  assert.deepEqual(
    [w.effort, w.tools, w.disallowedTools, w.allowedTools],
    ['xhigh', ['Read', 'Grep', 'Glob', 'Bash'], ['Bash(npm run build)', 'SendMessage'], ['Edit(**)', 'Bash(npm test)']],
  );
  assert.equal(w.context, 150000);
  assert.equal(w.denials, 'fail');
});

/** A table of one line of meaning per key, as the board lays a file's keys out: why `meanings` is not one, or null. */
function meaningsRefusal(keys: readonly string[], meanings: Readonly<Record<string, string>>): string | null {
  if (JSON.stringify(Object.keys(meanings)) !== JSON.stringify(keys))
    return `keys ${Object.keys(meanings).join(', ')} are not ${keys.join(', ')}, in that order`;
  const bad = Object.entries(meanings).find(([, line]) => typeof line !== 'string' || !line.trim() || /[\r\n]/.test(line));
  return bad ? `${bad[0]}'s meaning is not one line: ${JSON.stringify(bad[1])}` : null;
}

test("every key a step has has one line of meaning, in the keys' order — a count's in its refusal's words", () => {
  assert.equal(meaningsRefusal(STEP_KEYS, STEP_KEY_MEANINGS), null);
  assert.equal(
    STEP_KEY_MEANINGS.deadlineSeconds,
    'the seconds the engine lets the step run before stopping it',
    "the counts' lines are the words countOf refuses a value with",
  );
  assert.equal(STEP_KEY_MEANINGS.retries, 'how many times the run re-files the step after its check refuses it');
  assert.equal(STEP_KEY_MEANINGS.rounds, 'how many rounds `loop:` may run, the first included');
  assert.throws(
    () => fm('review', 'retries: -1'),
    (e: Error) => e.message.includes(`\`retries\` is ${STEP_KEY_MEANINGS.retries}:`),
  );
});

test('REFUSED: a table of meanings with a key missing, one out of order, an extra one, an empty line or one on two lines', () => {
  const { after, resume, ...rest } = STEP_KEY_MEANINGS;
  assert.match(String(meaningsRefusal(STEP_KEYS, { resume, ...rest })), /are not after, resume/, 'after missing');
  assert.match(String(meaningsRefusal(STEP_KEYS, { resume, after, ...rest })), /in that order/, 'out of order');
  assert.match(String(meaningsRefusal(STEP_KEYS, { ...STEP_KEY_MEANINGS, colour: 'red' })), /are not/, 'a key the step does not have');
  assert.match(String(meaningsRefusal(STEP_KEYS, { ...STEP_KEY_MEANINGS, model: ' ' })), /^model's meaning is not one line/);
  assert.match(
    String(meaningsRefusal(STEP_KEYS, { ...STEP_KEY_MEANINGS, model: 'the model\nand more' })),
    /^model's meaning is not one line/,
  );
});

test('a key a step does not have is refused by name, with the keys it does have', () => {
  const list =
    "A step's keys are: after, resume, input, place, workspace, writable, reads, slot, agent, skills, mcp, harness, model, effort, context, permissionMode, sandbox, tools, disallowedTools, allowedTools, denials, remote, deadlineSeconds, budget, check, retries, gate, output, tally, loop, rounds.";
  assert.throws(
    () => fm('review', 'colour: red'),
    (e: unknown) => {
      assert.ok(e instanceof WorkflowError);
      assert.equal(e.exitCode, 2, 'the author has something to fix');
      assert.ok(e.message.startsWith(`review: \`colour\` is not a key a step has. ${list}`), e.message);
      return true;
    },
  );
  assert.throws(() => fm('review', 'Harness: codex'), /`Harness` is not a key a step has/, 'keys are exact');
  assert.throws(() => fm('review', 'constructor: x'), /`constructor` is not a key a step has/, 'not an Object.prototype lookup');
  assert.throws(() => fm('review', 'role: Reviewer'), /`role` is not a key a step has/, "the job an agent holds is the agent's own line");
});

test('`afer: implement` is refused — accepted, it made the reviewer a root that starts beside the implementer', () => {
  const dir = path.join(teamCopy('wf-afer-'), 'dev');
  const review = path.join(dir, 'review.md');
  fs.writeFileSync(review, fs.readFileSync(review, 'utf8').replace(/^after:/m, 'afer:'));
  assert.match(fs.readFileSync(review, 'utf8'), /^afer: implement$/m, 'the typo is really in the file');

  assert.throws(() => loadWorkflows(dir), refusedNaming('review: ', '`afer`', 'after, resume'));
});

test('guide is refused by name, never silently dropped', () => {
  assert.throws(() => fm('implement', 'guide: CLAUDE.md'), refusedNaming('implement: ', '`guide`', 'CLAUDE.md'));
});

test("REFUSED: a key retired with no new name — `maxAttempts` with the runtime's own, `background` once every Claude Code session ran on the Agent SDK — at any value, naming the line to delete", () => {
  for (const [key, values, words] of [
    ['maxAttempts', ['1', '2'], ['`retries: N`', '`nemia retry <run> <step>`']],
    ['background', ['true', 'false'], ['Agent SDK']],
  ] as const) {
    for (const value of values) {
      assert.throws(
        () => fm('implement', `${key}: ${value}`),
        (e: unknown) => {
          assert.ok(e instanceof WorkflowError);
          assert.equal(e.exitCode, 2);
          names(e.message, 'implement: ', `\`${key}\``, ...words, 'Delete the line');
          return true;
        },
        `${key}: ${value}`,
      );
    }
    assert.equal((STEP_KEYS as readonly string[]).includes(key), false, `${key} is no longer a step's key`);
  }
});

/** Refused with exit 2 and a message that matches `pattern` — the message itself, not `String(err)`. */
const refusedWith = (pattern: RegExp) => (e: unknown) => e instanceof WorkflowError && e.exitCode === 2 && pattern.test(e.message);

test('tools: is the list of names the harness is given, one name per entry, trimmed; effort: one word — and absent, neither is set', () => {
  const w = fm('review', 'tools: Read,Grep , Glob,  Bash,\neffort: high');
  assert.deepEqual(w.tools, ['Read', 'Grep', 'Glob', 'Bash'], 'a trailing comma adds no name');
  assert.equal(w.effort, 'high');
  assert.deepEqual(fm('look', 'tools: mcp__playwright__browser_take_screenshot').tools, ['mcp__playwright__browser_take_screenshot']);
  const bare = fm('implement', 'harness: claude');
  assert.deepEqual([bare.tools, bare.effort], [undefined, undefined], "absent: the harness's own set, at its own effort");
});

test('context: is read once into tokens — thousands with `k`, millions with `m`, or digits — on both Claude harnesses, and absent is unset', () => {
  for (const [written, tokens] of [
    ['200k', 200_000],
    ['150000', 150_000],
    ['100K', 100_000],
    ['1M', 1_000_000],
    ['1000k', 1_000_000],
    ['123456', 123_456],
  ] as const) {
    assert.equal(fm('implement', `context: ${written}`).context, tokens, written);
  }
  assert.equal(fm('x', 'harness: claude\ncontext: 300k').context, 300_000);
  assert.equal(fm('implement', 'harness: claude').context, undefined, "absent: the model's whole window");
});

test('`renderStep` writes a context window in one canonical form, whatever the file said: thousands with `k`, or digits', () => {
  for (const [written, rendered] of [
    ['150000', '150k'],
    ['200K', '200k'],
    ['1M', '1000k'],
    ['123456', '123456'],
  ] as const) {
    const step = fm('implement', `context: ${written}`);
    const text = renderStep(step);
    assert.match(text, new RegExp(`^context: ${rendered}$`, 'm'), written);
    assert.deepEqual(parseWorkflow('implement', text), step, 'and it reads back as the same step');
  }
});

test('REFUSED: a context: that is not a number of tokens, by name, saying what to write; a number of tokens loads, and the runtime judges the window at `nemia start` (`start-config.test.ts`)', () => {
  for (const bad of ['lots', '200 k', '1.5M', '200,000', '0', '-1', '200kb', '0k']) {
    assert.throws(
      () => fm('implement', `context: ${bad}`),
      refusedWith(
        new RegExp(
          `^implement: \`context: ${bad.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\` is not a number of tokens\\. \`context\` is the session's context window, in tokens: digits, or thousands with \`k\` — for example \`context: 200k\`, or \`context: 150000\`\\.$`,
        ),
      ),
      bad,
    );
  }
  assert.throws(() => parseWorkflow('implement', '---\nplace: git\ncontext:\n---\nDo it.\n'), refusedWith(/`context` has no value/));
  for (const [line, tokens] of [
    ['context: 50k', 50_000],
    ['harness: claude\ncontext: 2M', 2_000_000],
    ['context: 200', 200],
    ['harness: codex\ncontext: 200k', 200_000],
  ] as const)
    assert.equal(fm('implement', line).context, tokens, line);
});

test("REFUSED: a step that continues another's session with a context window of its own other than that session's — by name, saying what to do", () => {
  const folder = (implement: string, respond: string, extra: Array<[string, string]> = []) =>
    parseFolder([
      ['implement', `---\nplace: git\n${implement}\n---\nimplement it\n`],
      ['respond', `---\nresume: implement\nplace: git\n${respond}\n---\nanswer it\n`],
      ...extra,
    ]);
  assert.throws(
    () => folder('context: 200k', 'context: 150k'),
    refusedNaming('respond: ', '`context: 150k`', "implement's session", '`context: 200k`', 'delete the line'),
  );
  assert.throws(
    () => folder('harness: claude', 'context: 150000'),
    refusedNaming('respond: ', '`context: 150k`', "implement's session", "the model's whole window", 'delete the line'),
  );
  assert.throws(
    () => folder('context: 200k', 'harness: claude', [['more', '---\nresume: respond\nplace: git\ncontext: 300k\n---\nmore\n']]),
    refusedNaming('more: ', '`context: 300k`', "respond's session", '`context: 200k`'),
    "through a chain: a step that continues respond continues implement's session",
  );
  const same = folder('context: 200k', 'context: 200000');
  assert.deepEqual(
    same.map((s) => sessionContext(s, same)),
    [200_000, 200_000],
    'the same window, written another way, is the same window; none inherits it',
  );
  const inherits = folder('context: 200k', 'harness: claude');
  assert.deepEqual(
    inherits.map((s) => [s.context, sessionContext(s, inherits)]),
    [
      [200_000, 200_000],
      [undefined, 200_000],
    ],
  );
});

test('REFUSED: an empty tools: — blank, or only commas — is not "every tool", nor "none"', () => {
  assert.throws(() => fm('review', 'tools:'), refusedNaming('review: ', '`tools` has no value', '`tools: Read, Grep, Glob, Bash`'));
  assert.throws(() => fm('review', 'tools: ,'), refusedNaming('review: ', '`tools: ,`', 'names no tool', 'Without the line'));
  assert.throws(() => fm('review', 'tools:  , ,'), refusedWith(/names no tool/));
});

test('REFUSED: a tools: entry with a space or a comma inside — a list without its commas, a rule, or an item of a YAML list holding a comma', () => {
  assert.throws(
    () => fm('review', 'tools: Read Grep Glob'),
    refusedNaming('review: ', '`tools: Read Grep Glob`', '`Read Grep Glob`', 'comma-separated'),
  );
  assert.throws(
    () => fm('review', 'tools: Read, Bash(git diff, git log)'),
    refusedNaming('review: ', '`tools: Read, Bash(git diff, git log)`', 'a comma inside an entry', '`Bash(git diff`', '`git log)`'),
  );
  assert.throws(() => fm('review', 'tools: [Read, "Bash(a, b)"]'), refusedWith(/^review:3: /), 'an item of a list holds no comma');
  assert.throws(
    () => fm('review', 'tools: Read, Bash(npm test)'),
    refusedNaming('review: ', '`Bash(npm test)`', 'not a tool name', '`Bash`, whole'),
  );
  assert.throws(
    () => fm('review', 'tools: Read, Bash(git:*)'),
    refusedNaming('review: ', '`Bash(git:*)`', 'not a tool name'),
    'a rule with no space in it too',
  );
});

test('tools: is YAML: a flow list, a block list and a quoted value read as the comma list the line form writes', () => {
  for (const lines of ['tools: [Read, Grep]', 'tools:\n  - Read\n  - Grep', 'tools: "Read, Grep"'])
    assert.deepEqual(fm('review', lines).tools, ['Read', 'Grep'], lines);
  assert.deepEqual(fm('review', 'tools: "Read"').tools, ['Read'], "quotes are YAML's, never part of the name");
  assert.deepEqual(fm('review', 'disallow:\n  - SendMessage\n  - CronCreate').disallowedTools, ['SendMessage', 'CronCreate']);
});

test('REFUSED: tools: on a codex step, naming the sandbox sandbox: sets instead', () => {
  assert.throws(
    () => fm('review', 'harness: codex\ntools: Read, Grep, Glob'),
    refusedNaming('review: ', '`tools: Read, Grep, Glob`', 'codex has none', '`sandbox: read-only`'),
  );
  assert.throws(
    () => fm('review', 'tools: Read\nharness: codex\nsandbox: read-only'),
    refusedWith(/codex has none/),
    'wherever the harness line is, and beside the sandbox too',
  );
  assert.deepEqual(fm('review', 'harness: claude\ntools: Read').tools, ['Read']);
});

test('disallowedTools: is the rules the harness is given to deny, one rule per entry, trimmed — and absent, nothing is denied', () => {
  const w = fm('review', 'tools: Read, Bash\ndisallowedTools: Bash(npm run build) ,  Bash(npm run e2e), SendMessage,');
  assert.deepEqual(
    w.disallowedTools,
    ['Bash(npm run build)', 'Bash(npm run e2e)', 'SendMessage'],
    'a space inside a rule stays in it; a trailing comma adds none',
  );
  assert.deepEqual(fm('review', 'disallowedTools: mcp__playwright__browser_run_code_unsafe, Read(//home/**)').disallowedTools, [
    'mcp__playwright__browser_run_code_unsafe',
    'Read(//home/**)',
  ]);
  for (const q of [`'`, `"`]) {
    const rule = `Bash(git commit -m ${q}wip${q})`;
    assert.deepEqual(
      fm('review', `disallowedTools: ${rule}, SendMessage`).disallowedTools,
      [rule, 'SendMessage'],
      `${q}: a quote is legal inside a rule, whichever entry comes after it: a quoted rule, then another`,
    );
    assert.deepEqual(
      fm('review', `disallowedTools: SendMessage, ${rule}`).disallowedTools,
      ['SendMessage', rule],
      `${q}: another, then a quoted rule`,
    );
  }
  assert.equal(fm('review', 'harness: claude').disallowedTools, undefined, 'absent: nothing denied beyond the settings');
  assert.deepEqual(fm('review', 'harness: claude\ndisallowedTools: SendMessage').disallowedTools, ['SendMessage']);
});

test('REFUSED: an empty disallowedTools: — blank, or only commas — which denies nothing and reads as a fence', () => {
  assert.throws(
    () => fm('review', 'disallowedTools:'),
    refusedNaming('review: ', '`disallowedTools` has no value', '`disallowedTools: Bash(npm run build), SendMessage`', 'delete the line'),
  );
  assert.throws(
    () => fm('review', 'disallowedTools: ,'),
    refusedNaming('review: ', '`disallowedTools: ,`', 'names no rule', 'Without the line'),
  );
  assert.throws(() => fm('review', 'disallowedTools:  , ,'), refusedWith(/names no rule/));
});

test('REFUSED: a disallowedTools: entry that is not one rule — a comma inside its parentheses, a space outside them', () => {
  assert.throws(
    () => fm('review', 'disallowedTools: Bash(git push, git reset)'),
    refusedNaming(
      'review: ',
      '`disallowedTools: Bash(git push, git reset)`',
      'a comma inside an entry',
      '`Bash(git push`',
      '`git reset)`',
      '`Bash(git push), Bash(git reset)`',
    ),
  );
  assert.throws(
    () => fm('review', "disallowedTools: Bash(git commit -m 'a, b'), SendMessage"),
    refusedWith(/has a comma inside an entry/),
    'a comma in quotes inside the parentheses is still inside them',
  );
  assert.deepEqual(
    fm('review', 'disallowedTools: [SendMessage, CronCreate]').disallowedTools,
    ['SendMessage', 'CronCreate'],
    'a YAML list',
  );
  assert.throws(
    () => fm('review', 'disallowedTools: SendMessage CronCreate'),
    refusedNaming('review: ', '`disallowedTools: SendMessage CronCreate`', '`SendMessage CronCreate`', 'not one rule', 'a space outside'),
  );
  assert.deepEqual(fm('review', 'disallowedTools: "SendMessage"').disallowedTools, ['SendMessage'], 'quoted, as YAML reads it');
  assert.throws(
    () => fm('review', 'disallowedTools: Bash(npm run build'),
    refusedNaming('review: ', '`Bash(npm run build`', 'not one rule', 'parentheses'),
  );
  assert.throws(
    () => fm('review', 'disallowedTools: Bash (npm run build)'),
    refusedNaming('review: ', '`Bash (npm run build)`', 'not one rule', 'parentheses'),
  );
});

test("a codex step's `disallowedTools:` loads as written: whether codex takes a deny list is the runtime's to judge, at `nemia start` (`start-config.test.ts`)", () => {
  assert.deepEqual(fm('review', 'harness: codex\ndisallowedTools: Bash(npm run build)').disallowedTools, ['Bash(npm run build)']);
  assert.deepEqual(fm('review', 'disallowedTools: SendMessage\nharness: codex\nsandbox: read-only').disallowedTools, ['SendMessage']);
});

test('allowedTools: is the rules the harness is given to allow without asking, one rule per entry, trimmed — and absent, the step may do only what its permissionMode allows', () => {
  const w = fm('write', 'permissionMode: dontAsk\nallowedTools: Edit(**) ,  Bash(npm test), Read,');
  assert.deepEqual(w.allowedTools, ['Edit(**)', 'Bash(npm test)', 'Read'], 'a space inside a rule stays in it; a trailing comma adds none');
  assert.equal(fm('review', 'harness: claude').allowedTools, undefined, 'absent: only what the permission mode allows by itself');
  assert.deepEqual(fm('write', 'harness: claude\nallowedTools: Edit(**)').allowedTools, ['Edit(**)']);
  assert.deepEqual(
    fm('write', 'allowedTools: Edit(**)\ndisallowedTools: SendMessage').allowedTools,
    ['Edit(**)'],
    "the deny list beside it, on the same step: neither is the other's opposite, and a deny still beats an allow",
  );
});

test("REFUSED: an allowedTools: that names no rule, or an entry that is not one rule — the deny list's refusals in the allow list's words", () => {
  assert.throws(
    () => fm('write', 'allowedTools:'),
    refusedNaming('write: ', '`allowedTools` has no value', '`allowedTools: Edit(**), Bash(npm test)`', 'delete the line'),
  );
  assert.throws(
    () => fm('write', 'allowedTools: ,'),
    refusedNaming('write: ', '`allowedTools: ,`', 'names no rule', 'Without the line', '`permissionMode`'),
  );
  assert.throws(
    () => fm('write', 'allowedTools: Bash(npm test, npm run build)'),
    refusedNaming(
      'write: ',
      '`allowedTools: Bash(npm test, npm run build)`',
      'a comma inside an entry',
      '`Bash(npm test`',
      '`npm run build)`',
      '`Edit(**), Bash(npm test)`',
    ),
  );
  assert.deepEqual(fm('write', 'allowedTools: [Write, Edit]').allowedTools, ['Write', 'Edit'], 'a YAML list reads as the comma list');
  assert.throws(() => fm('write', 'allowedTools: Write Edit'), refusedNaming('write: ', '`Write Edit`', 'not one rule', 'a space outside'));
  assert.throws(() => fm('write', 'allowedTools: Write(**'), refusedNaming('write: ', '`Write(**`', 'not one rule', 'parentheses'));
});

test('REFUSED: a rule on a file-editing tool that is not Edit, in either list, which Claude Code takes and never matches', () => {
  assert.throws(
    () => fm('write', 'allowedTools: Write(**)'),
    refusedNaming('write: ', '`allowedTools: Write(**)`', '`Write(**)`', 'denies the write', 'Write `Edit(**)` instead'),
    'with allowedTools: Write(**), a note writer is denied its own note.md while Claude Code says on stderr that the rule "is not ' +
      'matched by file permission checks"; with Edit(**) it writes inside its folder and is denied outside it',
  );
  assert.throws(
    () => fm('write', 'allowedTools: Edit(**), NotebookEdit(notes/**)'),
    refusedNaming('write: ', '`NotebookEdit(notes/**)`', 'Write `Edit(notes/**)` instead'),
    'wherever in the list it sits, and whatever the path',
  );
  assert.throws(
    () => fm('write', 'harness: claude\nallowedTools: Write(src/**)'),
    refusedWith(/Claude Code matches a file write against `Edit` rules alone/),
  );
  assert.throws(
    () => fm('write', 'disallowedTools: Write(**)'),
    refusedNaming('write: ', '`disallowedTools: Write(**)`', '`Write(**)`', 'allows the write', 'Write `Edit(**)` instead'),
    'the deny list is read in the same check: taken, a rule it can never match leaves the step reading as fenced when it is not',
  );
  assert.throws(
    () => fm('write', 'disallowedTools: SendMessage, NotebookEdit(notes/**)'),
    refusedNaming('write: ', '`NotebookEdit(notes/**)`', 'Write `Edit(notes/**)` instead'),
    'wherever in the deny list it sits',
  );
  assert.deepEqual(fm('write', 'allowedTools: Edit(**)').allowedTools, ['Edit(**)'], 'allowed: the rule that works');
  assert.deepEqual(fm('write', 'disallowedTools: Edit(../**)').disallowedTools, ['Edit(../**)'], 'in either list');
  assert.deepEqual(fm('write', 'allowedTools: Write').allowedTools, ['Write'], 'no path, so no file permission check to miss');
  assert.deepEqual(fm('write', 'disallowedTools: Write').disallowedTools, ['Write'], 'the bare name denies the tool itself');
});

test("a codex step's `allowedTools:` loads as written: whether codex takes an allow list is the runtime's to judge, at `nemia start` (`start-config.test.ts`)", () => {
  assert.deepEqual(fm('write', 'harness: codex\nallowedTools: Edit(**)').allowedTools, ['Edit(**)']);
  assert.deepEqual(fm('write', 'allowedTools: Edit(**)\nharness: codex\nsandbox: workspace-write').allowedTools, ['Edit(**)']);
});

test('`disallow:` and `allow:`, the names the lists had until 2026-09-23, are still read, as `disallowedTools:` and `allowedTools:`', () => {
  assert.deepEqual(FORMER_KEYS, { disallow: 'disallowedTools', allow: 'allowedTools' });
  const old = fm('write', 'disallow: Bash(git push *), SendMessage\nallow: Edit(**), Bash(npm test)');
  assert.deepEqual(
    old,
    fm('write', 'disallowedTools: Bash(git push *), SendMessage\nallowedTools: Edit(**), Bash(npm test)'),
    'the same step, field for field',
  );
  assert.equal(Object.hasOwn(old, 'allow') || Object.hasOwn(old, 'disallow'), false, 'and no field under the former name');
  const agent = parseAgent('writer', '---\ndescription: Writes\nallow: Edit(**)\n---\nWrite.\n');
  assert.deepEqual(
    agent.keys,
    parseAgent('writer', '---\ndescription: Writes\nallowedTools: Edit(**)\n---\nWrite.\n').keys,
    "an agent's file reads them the same way",
  );
  assert.deepEqual(agent.keys, { allowedTools: 'Edit(**)' });
  assert.match(
    renderStep(old),
    /^claude:\n {2}fence:\n {4}disallowedTools: Bash\(git push \*\), SendMessage$/m,
    'written back, a step read under the former name is written under the new one, in its harness block: saved from the board, the file is renamed',
  );
  assert.match(renderStep(old), /^ {4}allowedTools: Edit\(\*\*\), Bash\(npm test\)$/m);
  assert.doesNotMatch(renderStep(old), /^ *(dis)?allow:/m);
  assert.doesNotMatch(renderStep(old), /^(dis)?allowedTools:/m, 'and no fence key at the top level');
});

test("a step on the former name beside an agent on the new one sets that one key, its own, over the agent's", () => {
  const agents = new Map([['writer', parseAgent('writer', '---\nallowedTools: Edit(**)\ndisallowedTools: SendMessage\n---\nWrite.\n')]]);
  const [step] = parseFolder([['write', '---\nplace: git\nagent: writer\nallow: Edit(notes/**)\n---\n']], undefined, agents);
  assert.deepEqual(step.allowedTools, ['Edit(notes/**)'], "the step's own, as a step's own key always is");
  assert.deepEqual(step.disallowedTools, ['SendMessage'], "and the agent's other key is the step's");
  assert.deepEqual(step.agent!.keys, ['place', 'allowedTools'], 'owned under the new name');
  assert.equal(step.agent!.given.disallowedTools, 'SendMessage');
  assert.equal(Object.hasOwn(step.agent!.given, 'allowedTools'), false, 'what the step sets is not given to it');
});

test('REFUSED: a former name handed to `renderStep` or `renderAgent`, which write the name a key has now — as a board page open since before sends it', () => {
  assert.throws(
    () => renderStep({ name: 'write', after: [], body: 'Write.', disallow: ['SendMessage'] } as unknown as StepDraft),
    refusedNaming('write: ', '`disallow`', 'former name', 'Send `disallowedTools`', 'reload it'),
  );
  assert.throws(
    () => renderAgent({ name: 'writer', body: 'Write.', keys: { allow: 'Edit(**)' } } as never),
    refusedNaming('agents/writer.md: ', '`allow`', 'former name', 'Send `allowedTools`'),
  );
  assert.doesNotThrow(
    () => renderStep({ name: 'write', after: [], body: 'Write.', allow: null } as unknown as StepDraft),
    'unset, it is nothing to write, as any key is',
  );
});

test('REFUSED: a list set under both its names, naming both lines and which one to keep', () => {
  assert.throws(
    () => fm('write', 'allow: Edit(**)\nallowedTools: Read'),
    refusedNaming('write: ', '`allowedTools` is set twice', '`allow:`', 'Keep the `allowedTools:` line'),
  );
  assert.throws(
    () => fm('write', 'disallowedTools: SendMessage\ndisallow: Bash'),
    refusedNaming('write: ', '`disallowedTools` is set twice', '`disallow:`', 'Keep the `disallowedTools:` line'),
    'whichever comes first',
  );
  assert.throws(
    () => parseAgent('writer', '---\nallow: Edit(**)\nallowedTools: Edit(**)\n---\nWrite.\n'),
    refusedNaming('agents/writer.md: ', '`allowedTools` is set twice', '`allow:`'),
    'in an agent too, even with one value',
  );
  assert.throws(
    () => fm('write', 'allow: Edit(**)\nallow: Read'),
    refusedNaming('write: ', '`allow` is set twice'),
    'the former name twice is refused as any key twice',
  );
});

test('REFUSED: a list under its former name, in the words of the line as written', () => {
  assert.throws(() => fm('write', 'allow:'), refusedNaming('write: ', '`allow` has no value', 'allows nothing'));
  assert.throws(() => fm('write', 'disallow:'), refusedNaming('write: ', '`disallow` has no value', 'denies nothing'));
  assert.throws(
    () => fm('write', 'allow: Write(**)'),
    refusedNaming('write: ', '`allow: Write(**)`', "`allowedTools:`'s former name", 'Write `Edit(**)` instead'),
  );
  assert.throws(
    () => fm('write', 'disallow: NotebookEdit(notes/**)'),
    refusedNaming('write: ', '`disallow: NotebookEdit(notes/**)`', "`disallowedTools:`'s former name"),
  );
  assert.throws(
    () => fm('write', 'allow: Bash(npm test, npm run build)'),
    refusedNaming('write: ', '`allow: Bash(npm test, npm run build)`', "`allowedTools:`'s former name"),
  );
});

test('a frozen step under the former names is read under the new ones (`asNamed`), and a step already on them is the same object', () => {
  const now = fm('write', 'disallowedTools: SendMessage\nallowedTools: Edit(**)');
  assert.equal(asNamed(now), now, 'nothing to rename, nothing copied');
  const frozen = { name: 'write', after: [], body: 'Write.', disallow: ['SendMessage'], allow: ['Edit(**)'] } as unknown as Workflow;
  assert.deepEqual(asNamed(frozen), {
    name: 'write',
    after: [],
    body: 'Write.',
    disallowedTools: ['SendMessage'],
    allowedTools: ['Edit(**)'],
  });
  const resolved = {
    name: 'write',
    after: [],
    body: 'Write.',
    allow: ['Edit(**)'],
    disallow: ['SendMessage'],
    agent: { name: 'writer', keys: ['allow'], body: '', given: { disallow: 'SendMessage' } },
  } as unknown as Workflow;
  assert.deepEqual(
    asNamed(resolved),
    {
      name: 'write',
      after: [],
      body: 'Write.',
      allowedTools: ['Edit(**)'],
      disallowedTools: ['SendMessage'],
      agent: { name: 'writer', keys: ['allowedTools'], body: '', given: { disallowedTools: 'SendMessage' } },
    },
    "resolved against an agent, the record names what was the step's own and what it was given under the former names too",
  );
  const both = { name: 'write', after: [], body: 'Write.', allow: ['Read'], allowedTools: ['Edit(**)'] } as unknown as Workflow;
  assert.deepEqual(
    asNamed(both),
    { name: 'write', after: [], body: 'Write.', allowedTools: ['Edit(**)'] },
    "a record that holds both keeps the new name's value: it is the one a newer writer put there",
  );
});

test('`nemia start` is told which files still write a former name: the steps, then the agents they name, and nothing of a folder on the new names', () => {
  assert.deepEqual(
    formerKeysIn('---\nallow: Edit(**)\n# disallow: Bash\n  disallow : SendMessage\n---\nallow: is in the body\n'),
    ['allow', 'disallow'],
    'read as the parser reads the block: trimmed, comments skipped, the body not read',
  );
  assert.deepEqual(formerKeysIn('no frontmatter\nallow: x\n'), []);
  assert.equal(
    formerKeyLine('w/write.md', 'allow'),
    "w/write.md: `allow:` is read as `allowedTools:`, Claude Code's name for it. The former name is still read; rename the line, or save the file from the board, which writes the new name.",
  );
  const root = folder({
    'team/write.md': '---\nplace: git\nagent: writer\ndisallow: SendMessage\n---\n',
    'team/review.md': '---\nafter: write\nplace: git\n---\nReview.\n',
    'agents/writer.md': '---\nallow: Edit(**)\noverridable: fence\n---\nWrite.\n',
    'agents/unused.md': '---\nallow: Edit(**)\n---\nNobody names me.\n',
  });
  const dir = path.join(root, 'team');
  assert.doesNotThrow(() => loadWorkflows(dir), 'the folder starts: the former names stop nothing');
  assert.deepEqual(formerKeyLines(dir), [
    formerKeyLine(path.join(dir, 'write.md'), 'disallow'),
    formerKeyLine(path.join(root, 'agents', 'writer.md'), 'allow'),
  ]);
  assert.deepEqual(
    formerKeyLines(folder({ 'write.md': '---\nplace: git\nclaude:\n  fence:\n    allowedTools: Edit(**)\n---\nWrite.\n' })),
    [],
  );
  assert.deepEqual(formerKeyLines(path.join(dir, 'nope')), []);
});

test('`nemia start` is told which step and agent files are still in the former line form, which reads as it did, and nothing of a YAML one', () => {
  const root = folder({
    'team/write.md': '---\nplace: git\nagent: writer\ncheck: { npm test; npm run lint: x; }\n---\nWrite.\n',
    'team/review.md': '---\nafter: write\nplace: git\ncheck: "npm test # all of it"\n---\nReview.\n',
    'agents/writer.md': '---\nmodel: opus\noverridable: model\ndisallowedTools: Bash(git push:*), Bash(echo a: b)\n---\nWrite.\n',
  });
  const dir = path.join(root, 'team');
  const [write, review] = loadWorkflows(dir);
  assert.equal(write.check, '{ npm test; npm run lint: x; }', 'a former line reads as the rest of the line, as it did');
  assert.equal(review.check, 'npm test # all of it', 'a quoted value is YAML');
  assert.deepEqual(formerKeyLines(dir), [
    formerFormLine(path.join(dir, 'write.md')),
    formerFormLine(path.join(root, 'agents', 'writer.md')),
    formerFenceLine(path.join(root, 'agents', 'writer.md'), 'disallowedTools'),
  ]);
  assert.match(formerFormLine('w/write.md'), /^w\/write\.md: /);
});

test('`nemia start` is told which agent a step names still says `systemPrompt:`, with the line it is read as, and nothing of one on `harnessPrompt:`', () => {
  assert.equal(
    harnessPromptLine('w/agents/builder.md', 'own'),
    "w/agents/builder.md: `systemPrompt: own` is read as `harnessPrompt: replace`, what becomes of Claude Code's own prompt. The former line is still read; rename it, or save the file from the board, which writes `harnessPrompt:`.",
  );
  const root = folder({
    'team/write.md': '---\nplace: git\nagent: writer\n---\n',
    'team/review.md': '---\nafter: write\nplace: git\nagent: reviewer\n---\n',
    'agents/writer.md': '---\nsystemPrompt: own\noverridable: model\n---\nWrite.\n',
    'agents/reviewer.md': '---\nharnessPrompt: no-coding\noverridable: model\n---\nReview.\n',
    'agents/unused.md': '---\nsystemPrompt: default\n---\nNobody names me.\n',
  });
  const dir = path.join(root, 'team');
  assert.doesNotThrow(() => loadWorkflows(dir), 'the folder starts: the former line stops nothing');
  assert.deepEqual(formerKeyLines(dir), [harnessPromptLine(path.join(root, 'agents', 'writer.md'), 'own')]);
});

test("`nemia start` is told which codex files still name their sandbox as `permissionMode:` — a step's by its own line or its agent's, and the agent's", () => {
  assert.equal(
    codexModeLine('w/review.md', 'bypassPermissions'),
    "w/review.md: `permissionMode: bypassPermissions` is read as `sandbox: danger-full-access`, Codex's own name for its sandbox. The former line is still read; rename it, or save the file from the board, which writes `sandbox:`.",
  );
  const root = folder({
    'team/review.md': '---\nplace: git\nharness: codex\npermissionMode: read-only\n---\nReview.\n',
    'team/check.md': '---\nafter: review\nplace: git\nagent: checker\npermissionMode: read-only\n---\nCheck.\n',
    'team/implement.md': '---\nafter: check\nplace: git\npermissionMode: dontAsk\n---\nImplement.\n',
    'agents/checker.md': '---\nharness: codex\noverridable: fence\npermissionMode: read-only\n---\nYou check.\n',
  });
  const dir = path.join(root, 'team');
  assert.doesNotThrow(() => loadWorkflows(dir), 'the folder starts: the former line stops nothing');
  assert.deepEqual(
    formerKeyLines(dir),
    [
      formerFenceLine(path.join(dir, 'check.md'), 'permissionMode'),
      codexModeLine(path.join(dir, 'check.md'), 'read-only'),
      formerFenceLine(path.join(dir, 'implement.md'), 'permissionMode'),
      formerFenceLine(path.join(dir, 'review.md'), 'permissionMode'),
      codexModeLine(path.join(dir, 'review.md'), 'read-only'),
      formerFenceLine(path.join(root, 'agents', 'checker.md'), 'permissionMode'),
      codexModeLine(path.join(root, 'agents', 'checker.md'), 'read-only'),
    ],
    "a Claude Code step's own mode is named only as a former spelling, never as a codex sandbox",
  );
  assert.deepEqual(
    formerKeyLines(folder({ 'review.md': '---\nplace: git\nharness: codex\ncodex:\n  fence:\n    sandbox: read-only\n---\nReview.\n' })),
    [],
  );
});

test('`nemia start` is told which steps still say `workspace: folder`, with the line it is read as, and nothing of `place:` or `workspace: base`', () => {
  assert.equal(
    placeLine('w/write.md'),
    'w/write.md: `workspace: folder` is read as `place: folder`, where the step works. The former line is still read; rename it, or save the file from the board, which writes `place:`.',
  );
  const dir = folder({
    'write.md': '---\nworkspace: folder\n---\nWrite.\n',
    'review.md': '---\nafter: write\nworkspace: folder\n---\nReview.\n',
  });
  assert.doesNotThrow(() => loadWorkflows(dir), 'the folder starts: the former line stops nothing');
  assert.deepEqual(formerKeyLines(dir), [placeLine(path.join(dir, 'review.md')), placeLine(path.join(dir, 'write.md'))]);
  assert.deepEqual(formerKeyLines(folder({ 'write.md': '---\nplace: folder\n---\nWrite.\n' })), []);
  assert.deepEqual(formerKeyLines(folder({ 'ship.md': '---\nplace: git\nworkspace: base\n---\nShip.\n' })), []);
});

test("an effort loads as written: which efforts a step's harness takes is the runtime's to judge, at `nemia start` (`start-config.test.ts`)", () => {
  assert.equal(fm('implement', 'effort: extreme').effort, 'extreme');
  assert.equal(fm('review', 'harness: codex\neffort: ultra').effort, 'ultra');
  assert.equal(fm('review', 'harness: codex\neffort: minimal').effort, 'minimal');
  assert.equal(fm('x', 'harness: claude\neffort: max').effort, 'max');
});

test('an empty check is refused, and so is one that reads as "no check" but runs as a command', () => {
  assert.throws(() => fm('implement', 'check:'), refusedNaming('implement: ', '`check` has no value', 'exit 0'));
  assert.throws(() => fm('implement', 'check:   '), /`check` has no value/);
  assert.throws(() => fm('implement', 'check: none'), /exits 127/);
  for (const none of ['""', "''"])
    assert.throws(() => fm('implement', `check: ${none}`), refusedWith(/^implement: /), `${none} is YAML's empty text`);
  assert.throws(() => fm('implement', 'check:\n  - npm test'), refusedWith(/^implement:3: /), 'a list on a key of one value');
  assert.equal(fm('implement', 'check: [ -f x ]').check, '[ -f x ]', 'a flow list there is the shell the line form wrote');
  assert.throws(() => fm('implement', 'check: npm test\ncheck: npm run lint'), refusedWith(/^implement: /), 'and a check set twice');
  assert.throws(() => fm('implement', 'model:'), /implement: `model` has no value\. Delete the line/, 'empty is not absent, for any key');
});

test('deadlineSeconds: 5m is refused, with the seconds to write instead', () => {
  assert.throws(
    () => fm('review', 'deadlineSeconds: 5m'),
    refusedNaming('review: ', '`deadlineSeconds: 5m`', 'not a count', '`deadlineSeconds: 300`'),
  );
  assert.throws(() => fm('review', 'deadlineSeconds: 2h'), /`deadlineSeconds: 7200`/);
  for (const bad of ['0', '-5', '1.5', '9e2', 'NaN', 'Infinity', 'ninety', '0x10']) {
    assert.throws(() => fm('review', `deadlineSeconds: ${bad}`), /is not a count\. .*above zero/, bad);
  }
});

test('budget: is dollars — a whole amount or one with cents — frozen as a number; absent, the step has no cap', () => {
  assert.equal(fm('implement', 'budget: 5').budget, 5);
  assert.equal(fm('implement', 'budget: 2.50').budget, 2.5);
  assert.equal(fm('implement', 'budget: 0.25').budget, 0.25);
  assert.equal(fm('implement', 'harness: claude\nbudget: 3').budget, 3);
  assert.equal(fm('implement', 'check: npm test').budget, undefined);
});

test('REFUSED: a budget: that is not an amount above zero — 0, a negative, a word, an empty value — each naming the fix', () => {
  const refusedAs = (value: string, pattern: RegExp) =>
    assert.throws(
      () => fm('implement', `budget:${value ? ` ${value}` : ''}`),
      (e: Error) => e instanceof WorkflowError && e.exitCode === 2 && pattern.test(e.message),
      value,
    );
  for (const zero of ['0', '0.00'])
    refusedAs(
      zero,
      /^implement: `budget: 0(\.00)?` is not an amount\. `budget` is the most the step's tries may cost together, in dollars: a number above zero, in digits — for example `budget: 5`, or `budget: 2\.50`\.$/,
    );
  for (const bad of ['-1', '-2.50', 'five', 'lots', '1e3', '.5', '2.', 'Infinity', 'NaN', '5 5'])
    refusedAs(bad, /is not an amount\. .*a number above zero, in digits — for example `budget: 5`/);
  refusedAs('$5', /^implement: `budget: \$5` is not an amount\. .* in digits with no unit — `budget: 5`\.$/);
  refusedAs('2.50 USD', /with no unit — `budget: 2\.50`\.$/);
  refusedAs(
    '',
    /^implement: `budget` has no value, which reads as no cap to one person and as nothing to spend to another\. Give the most the step's tries may cost together, in dollars — `budget: 5`, or `budget: 2\.50` — or delete the line, and the step has no budget\.$/,
  );
  refusedAs('   ', /`budget` has no value/);
});

test('retries is a whole count, and may be 0, which is what absent means', () => {
  for (const bad of ['-1', '1.5', 'once']) {
    assert.throws(() => fm('x', `retries: ${bad}`), /`retries: .*` is not a count\. .*zero or more/, bad);
  }
  assert.equal(fm('x', 'retries: 0').retries, 0);
});

test("harness: banana is refused with the harnesses there are; harness: check is the run's own", () => {
  assert.throws(
    () => fm('review', 'harness: banana'),
    refusedNaming('review: ', '`harness: banana`', 'claude, codex', '`a2a:<name>`', '`a2a-agents.json`'),
  );
  assert.throws(() => fm('review', 'harness: check'), refusedNaming('review: ', '`harness: check`', '`check:`'));
  assert.throws(() => fm('review', 'harness: Codex'), /not a harness a step can run on/, 'names are exact');
  assert.throws(
    () => fm('review', 'harness: claude-detached'),
    refusedNaming('review: ', '`harness: claude-detached`', 'Delete the line', 'Agent SDK'),
    'the retired harness is refused by its name, with the fix',
  );
  for (const h of ['claude', 'codex']) assert.equal(fm('x', `harness: ${h}`).harness, h);
});

test("a permission mode, and a codex step's sandbox, load as written: which words a step's harness takes is the runtime's to judge, at `nemia start` (`start-config.test.ts`)", () => {
  assert.equal(fm('implement', 'permissionMode: yolo').permissionMode, 'yolo');
  assert.equal(fm('implement', 'permissionMode: read-only').permissionMode, 'read-only');
  assert.equal(fm('review', 'harness: codex\nsandbox: yolo').sandbox, 'yolo');
  assert.equal(fm('review', 'harness: codex\nsandbox: read-only').sandbox, 'read-only');
  assert.equal(fm('x', 'harness: claude\npermissionMode: bypassPermissions').permissionMode, 'bypassPermissions');
  assert.equal(fm('x', 'permissionMode: auto').permissionMode, 'auto');
  assert.equal(fm('x', 'permissionMode: manual').permissionMode, 'manual', "the engine's word, Claude Code's manual, is a mode");
});

test("a codex step's `permissionMode:` loads as its `sandbox:`, whatever the word, wherever the harness line is: the runtime judges the word at `nemia start` (`start-config.test.ts`)", () => {
  for (const mode of ['yolo', ...CLAUDE_PERMISSION_MODES.filter((m) => m !== 'bypassPermissions')]) {
    for (const lines of [`harness: codex\npermissionMode: ${mode}`, `permissionMode: ${mode}\nharness: codex`]) {
      const step = fm('review', lines);
      assert.deepEqual([step.sandbox, step.permissionMode], [mode, undefined], lines);
    }
  }
});

test("REFUSED: `sandbox:` on a Claude Code step, the orchestrator's own rule — the runtime would file it as a mode — with words naming `permissionMode:`, the default harness included", () => {
  for (const [harness, line, where] of [
    ['claude', '', ' (there is no `harness:` line, so the step runs on claude)'],
    ['claude', 'harness: claude\n', ''],
  ] as const) {
    for (const sandbox of CODEX_SANDBOXES) {
      assert.throws(
        () => fm('implement', `${line}sandbox: ${sandbox}`),
        (e: Error) =>
          e.message ===
          `implement: \`sandbox: ${sandbox}\` is a codex step's sandbox, and this step runs on ${harness}${where}, which is fenced by its permission mode, \`permissionMode:\`, with \`tools:\`, \`disallowedTools:\` and \`allowedTools:\`: the line would be filed as a mode. Write \`permissionMode:\` instead, or run the step on codex.`,
        `${harness} ${sandbox}`,
      );
    }
  }
  assert.equal(fm('review', 'harness: codex\nsandbox: read-only').sandbox, 'read-only', 'on codex, its own key');
});

test("`sandbox: bypassPermissions` on codex loads as written: the runtime takes it for Codex's widest sandbox, and judges it at `nemia start`", () => {
  assert.equal(fm('review', 'harness: codex\nsandbox: bypassPermissions').sandbox, 'bypassPermissions');
  assert.equal(fm('review', 'harness: codex\nsandbox: danger-full-access').sandbox, 'danger-full-access');
});

test('a codex step that names its sandbox as `permissionMode:`, as every one did until 2026-09-23, still loads — read as `sandbox:`', () => {
  for (const sandbox of CODEX_SANDBOXES) {
    const step = fm('review', `harness: codex\npermissionMode: ${sandbox}`);
    assert.equal(step.sandbox, sandbox);
    assert.equal(step.permissionMode, undefined, 'read as the one key, never as both');
    assert.equal(fm('review', `permissionMode: ${sandbox}\nharness: codex`).sandbox, sandbox, 'wherever the harness line is');
  }
  assert.equal(
    fm('review', 'harness: codex\npermissionMode: bypassPermissions').sandbox,
    'danger-full-access',
    "the engine takes Claude Code's widest mode as Codex's widest sandbox: read under Codex's name for it",
  );
});

test('REFUSED: a codex step that names its sandbox under both names, keeping the new one', () => {
  for (const [old, now] of [
    ['read-only', 'read-only'],
    ['workspace-write', 'read-only'],
    ['bypassPermissions', 'danger-full-access'],
  ] as const) {
    assert.throws(
      () => fm('review', `harness: codex\npermissionMode: ${old}\nsandbox: ${now}`),
      (e: Error) =>
        e.message ===
        `review: \`permissionMode: ${old}\` and \`sandbox: ${now}\` are both set, and on codex they are one key: \`permissionMode:\` is the former name of a codex step's sandbox, and \`sandbox:\` is Codex's own name for it. Keep the \`sandbox:\` line and delete the other.`,
      old,
    );
  }
});

test('a key set twice is refused rather than last-one-wins', () => {
  assert.throws(() => fm('review', 'harness: claude\nharness: codex'), /review: `harness` is set twice/);
  assert.throws(() => fm('integrate', 'after: docs\nafter: tests'), /`after` is set twice.*`after: a, b`/);
});

test('a frontmatter line that is not `key: value` is refused, naming its line; blank lines and # comments are not keys', () => {
  assert.throws(() => fm('review', 'afer implement'), refusedWith(/^review:3: /));
  assert.throws(() => fm('review', ': codex'), refusedWith(/^review:3: /));
  const w = fm('review', '# a second opinion\nharness: codex\n\nafter: implement');
  assert.equal(w.harness, 'codex');
  assert.deepEqual(w.after, ['implement']);
});

test('frontmatter that never closes is refused; a file saved on Windows keeps its keys', () => {
  assert.throws(
    () => parseWorkflow('review', '---\nplace: git\nharness: codex\nafter: implement\nReview it.'),
    refusedNaming('review: ', 'never closes'),
  );
  const crlf = parseWorkflow('review', '\uFEFF---\r\nplace: git\r\nharness: codex\r\nafter: implement\r\n---\r\nReview it.\r\n');
  assert.equal(crlf.harness, 'codex');
  assert.deepEqual(crlf.after, ['implement']);
  assert.equal(splitFrontmatter('x', '---\n---\nbody').body, 'body', 'an empty frontmatter is still frontmatter');
});

/**
 * A workflow folder: `implement`, then `review` declaring `output: review.schema.json`, then whatever
 * `files` add or replace — by file name, text or a schema object; `null` leaves the file out.
 */
const outputFolder = (files: Record<string, string | object | null> = {}) => {
  const dir = scratch('wf-output-');
  const all: Record<string, string | object | null> = {
    'implement.md': '---\nplace: git\n---\nimplement it\n',
    'review.md': '---\nafter: implement\nplace: git\noutput: review.schema.json\n---\nreview it\n',
    'review.schema.json': FINDINGS,
    ...files,
  };
  for (const [name, content] of Object.entries(all)) {
    if (content === null) continue;
    fs.writeFileSync(path.join(dir, name), typeof content === 'string' ? content : JSON.stringify(content, null, 2));
  }
  return dir;
};

/** Load `outputFolder(files)` and hand back the refusal's message, failing if there was none. */
const refusal = (files: Record<string, string | object | null>): string => {
  try {
    loadWorkflows(outputFolder(files));
  } catch (e) {
    assert.ok(e instanceof WorkflowError, String(e));
    assert.equal(e.exitCode, 2, 'the author has something to fix');
    return e.message;
  }
  return assert.fail('loaded, and should have been refused');
};

test('`output:` is read at load — the file as the step names it, and the schema it held — and is not a step', () => {
  const dir = outputFolder();
  const steps = loadWorkflows(dir);
  assert.deepEqual(
    steps.map((s) => s.name),
    ['implement', 'review'],
    'a .json beside the steps is not one',
  );
  const review = steps.find((s) => s.name === 'review')!;
  assert.deepEqual(review.output, { file: 'review.schema.json', schema: FINDINGS });
  assert.deepEqual(outputFields(review), ['findings']);
  assert.equal(steps.find((s) => s.name === 'implement')!.output, undefined, 'absent means the step declares nothing');

  fs.mkdirSync(path.join(dir, 'schemas'));
  fs.renameSync(path.join(dir, 'review.schema.json'), path.join(dir, 'schemas', 'review.json'));
  fs.writeFileSync(path.join(dir, 'review.md'), '---\nafter: implement\nplace: git\noutput: schemas/review.json\n---\nreview it\n');
  assert.deepEqual(
    loadWorkflows(dir).find((s) => s.name === 'review')!.output?.schema,
    FINDINGS,
    'relative to the workflow folder, not to wherever nemia start was typed',
  );
});

test('an `output:` file that is not there is refused at load, with the fix', () => {
  assert.match(refusal({ 'review.schema.json': null }), /^review: `output: review\.schema\.json` is not there\./);
  names(refusal({ 'review.schema.json': null }), 'review: ', 'JSON Schema', 'beside review.md');
  assert.match(refusal({ 'review.schema.json': null, 'review.schema.json.md': '---\nplace: git\n---\nnot the schema\n' }), /is not there/);
  assert.throws(
    () => parseWorkflow('review', '---\nplace: git\noutput: review.schema.json\n---\nreview it\n'),
    refusedNaming('review: ', '`output: review.schema.json`', 'without its folder'),
    'a step read without its folder has nowhere to read the file from, and does not pretend it has none',
  );
});

test('REFUSED at load: an `output:` naming a file outside the workflow folder — up and out, or absolute — though the file is there and strict', () => {
  const outside = path.join(scratch('wf-outside-'), 'review.schema.json');
  fs.writeFileSync(outside, JSON.stringify(FINDINGS));
  const naming = (file: string) => ({ 'review.md': `---\nafter: implement\nplace: git\noutput: ${file}\n---\nreview it\n` });
  const fix =
    'names a file outside the workflow folder. A schema is part of what the step is judged by, and lives in the folder with it: write it beside review.md and name it from there — `output: review.schema.json` — or delete the line, and the step declares no output.';

  const up = path.relative(outputFolder(), outside);
  assert.match(up, /^\.\.\//, 'a path that climbs out of the folder');
  assert.equal(refusal(naming(up)), `review: \`output: ${up}\` ${fix}`);
  assert.equal(refusal(naming(outside)), `review: \`output: ${outside}\` ${fix}`);
  assert.equal(
    refusal(naming('schemas/../../review.schema.json')),
    `review: \`output: schemas/../../review.schema.json\` ${fix}`,
    'out, however it is spelled',
  );
  assert.throws(
    () => parseWorkflow('review', naming(outside)['review.md']),
    (e: Error) => e.message === `review: \`output: ${outside}\` ${fix}`,
    'read without its folder, it is refused all the same: where the file is, not whether it can be read',
  );

  assert.deepEqual(
    loadWorkflows(outputFolder({ ...naming('schemas/../review.schema.json') })).find((s) => s.name === 'review')!.output?.schema,
    FINDINGS,
    'the same file, by a path that only passes through a folder, inside, loads',
  );
});

test('an output schema that is not strict is refused, and says where', () => {
  const items = FINDINGS.properties.findings.items;
  const withItems = (changed: object) => ({ ...FINDINGS, properties: { findings: { type: 'array', items: { ...items, ...changed } } } });
  const { additionalProperties: _, ...open } = FINDINGS;

  names(
    refusal({ 'review.schema.json': { ...FINDINGS, required: [] } }),
    'review: ',
    '`output: review.schema.json`',
    'not strict at the top',
    '`findings`',
    '`required`',
  );
  names(refusal({ 'review.schema.json': open }), 'review: ', 'not strict at the top', '`additionalProperties`', '`false`');
  assert.match(
    refusal({ 'review.schema.json': { ...FINDINGS, required: ['findings', 'ghost'] } }),
    /not strict at the top: `required` names `ghost`/,
  );
  assert.match(
    refusal({ 'review.schema.json': withItems({ required: ['file', 'what'] }) }),
    /not strict at findings\[\]: `line` is not in `required`/,
  );
  names(refusal({ 'review.schema.json': withItems({ required: ['file', 'what'] }) }), 'review: ', 'nullable');
  assert.match(
    refusal({ 'review.schema.json': withItems({ additionalProperties: true }) }),
    /not strict at findings\[\]: `additionalProperties`/,
  );
  const deep = withItems({
    properties: { ...items.properties, fix: { anyOf: [{ type: 'null' }, { type: 'object', properties: { patch: { type: 'string' } } }] } },
    required: [...items.required, 'fix'],
  });
  names(refusal({ 'review.schema.json': deep }), 'review: ', 'not strict at findings[].fix.anyOf[1]', '`patch`', '`required`');

  assert.throws(
    () => loadWorkflows(outputFolder({ 'review.schema.json': '{ "findings": ' })),
    refusedNaming('review: ', '`output: review.schema.json` is not JSON'),
    'not a schema of fields at all',
  );
  for (const shape of [[], { type: 'array', items: {} }, { type: 'object', properties: {}, required: [], additionalProperties: false }]) {
    names(refusal({ 'review.schema.json': shape }), 'review: ', 'not a schema of fields', '`"type": "object"`');
  }
  assert.throws(
    () => loadWorkflows(outputFolder({ 'review.schema.json': { ...FINDINGS, $defs: { finding: items } } })),
    refusedNaming('review: ', '`$defs`', '`properties`'),
    'only properties is merged into the closeout: a definition beside them would not reach the harness',
  );
});

test('an output schema that names a field every closeout already has is refused', () => {
  for (const field of CLOSEOUT_FIELDS) {
    const schema = {
      type: 'object',
      properties: { ...FINDINGS.properties, [field]: { type: 'string' } },
      required: ['findings', field],
      additionalProperties: false,
    };
    assert.match(
      refusal({ 'review.schema.json': schema }),
      new RegExp(`^review: \`output: review\\.schema\\.json\` declares \`${field}\``),
      field,
    );
    names(refusal({ 'review.schema.json': schema }), 'review: ', 'every closeout already has', '`summary`', '`body`');
  }
});

test('`input:` names steps this one waits on — directly, or through `resume` — and is refused on any other', () => {
  const respond = (keys: string) => ({ 'respond.md': `---\nplace: git\n${keys}\n---\nanswer it\n` });

  assert.deepEqual(loadWorkflows(outputFolder(respond('after: review\ninput: review'))).find((s) => s.name === 'respond')!.input, [
    'review',
  ]);
  assert.deepEqual(
    loadWorkflows(outputFolder(respond('resume: review\ninput: review'))).find((s) => s.name === 'respond')!.input,
    ['review'],
    'resume implies after',
  );
  assert.deepEqual(fm('integrate', 'after: a, b\ninput: a, b').input, ['a', 'b'], 'a list, like `after`');
  assert.equal(fm('x', 'after: a').input, undefined, 'absent means the step reads nothing');
  assert.doesNotThrow(
    () =>
      validate([
        step('implement'),
        { ...step('review', ['implement']), output: { file: 'r.json', schema: FINDINGS as never } },
        { name: 'respond', after: [], resume: 'review', input: ['review'], body: 'x' },
      ]),
    'a step handed a resume without the after the parser adds is still reading finished work',
  );

  for (const keys of ['after: implement\ninput: review', 'input: review'])
    names(refusal(respond(keys)), 'respond: ', '`input: review`', 'does not wait on review', 'Add review to `after:`', 'delete the line');
  const implementDeclares = { 'implement.md': '---\nplace: git\noutput: review.schema.json\n---\nimplement it\n' };
  assert.deepEqual(
    loadWorkflows(outputFolder({ ...implementDeclares, ...respond('after: review\ninput: implement') })).find((s) => s.name === 'respond')!
      .input,
    ['implement'],
    'through the steps between: a step two back has finished too, so a reviewer in a loop reads what was specified before the work',
  );
});

test('`input:` naming no step, or a step that declares no output, is refused — nothing of its closeout would travel', () => {
  const respond = (keys: string) => ({ 'respond.md': `---\nplace: git\n${keys}\n---\nanswer it\n` });
  assert.match(refusal(respond('after: review\ninput: reveiw')), /^respond: `input: reveiw` names a step that is not here\./);
  names(refusal(respond('after: review\ninput: reveiw')), 'respond: ', 'delete the line');
  names(
    refusal(respond('after: implement\ninput: implement')),
    'respond: ',
    '`input: implement`',
    'implement declares no `output:`',
    'implement.md',
    '`output:` schema',
  );
});

test('an output schema is read strict wherever an object can sit — and one that points elsewhere with `$ref` is refused', () => {
  const loose = { type: 'object', properties: { optional: { type: 'string' } } };
  const around = (product: object) => ({
    'review.schema.json': { type: 'object', properties: { product }, required: ['product'], additionalProperties: false },
  });

  assert.throws(
    () => loadWorkflows(outputFolder(around({ $defs: { value: loose }, $ref: '#/properties/product/$defs/value' }))),
    refusedNaming('review: ', '`output: review.schema.json`', '`$ref` at product', 'delete `$ref`'),
    'a definition nested under the field, and a reference to it: a walk that read neither would load a loose object',
  );
  const strict = { ...loose, required: ['optional'], additionalProperties: false };
  for (const ref of ['$ref', '$dynamicRef', '$recursiveRef']) {
    assert.match(
      refusal(around({ $defs: { value: strict }, [ref]: '#/properties/product/$defs/value' })),
      new RegExp(`uses \`\\${ref}\` at product\\.`),
      `${ref}, however strict the target: what is checked must be what the harness is handed, not what a pointer says it is`,
    );
  }

  const under: Array<[object, string]> = [
    [{ type: 'string', $defs: { value: loose } }, 'product.$defs.value'],
    [{ type: 'string', definitions: { value: loose } }, 'product.definitions.value'],
    [{ type: 'string', not: loose }, 'product.not'],
    [{ if: loose, then: { type: 'string' }, else: { type: 'string' } }, 'product.if'],
    [{ if: { type: 'string' }, then: loose, else: { type: 'string' } }, 'product.then'],
    [{ if: { type: 'string' }, then: { type: 'string' }, else: loose }, 'product.else'],
    [{ type: 'array', items: [loose] }, 'product[]'],
    [{ type: 'array', contains: loose }, 'product.contains'],
    [{ type: 'array', additionalItems: loose }, 'product.additionalItems'],
    [{ type: 'array', unevaluatedItems: loose }, 'product.unevaluatedItems'],
    [{ type: 'string', additionalProperties: loose }, 'product.additionalProperties'],
    [
      { type: 'object', properties: {}, required: [], additionalProperties: false, patternProperties: { '^x-': loose } },
      'product.patternProperties.^x-',
    ],
    [
      { type: 'object', properties: {}, required: [], additionalProperties: false, dependentSchemas: { a: loose } },
      'product.dependentSchemas.a',
    ],
    [{ type: 'object', properties: {}, required: [], additionalProperties: false, dependencies: { a: loose } }, 'product.dependencies.a'],
    [
      { type: 'object', properties: {}, required: [], additionalProperties: false, unevaluatedProperties: loose },
      'product.unevaluatedProperties',
    ],
    [{ type: 'object', properties: {}, required: [], additionalProperties: false, propertyNames: loose }, 'product.propertyNames'],
  ];
  for (const [product, at] of under) {
    assert.match(
      refusal(around(product)),
      new RegExp(`is not strict at ${at.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: \`optional\` is not in \`required\``),
      `${at}: every keyword that holds a schema is read`,
    );
  }
});

/**
 * implement → review, declaring `findings` and `again`, with `reviewKeys` beside `after` and `output` — and whatever `files` add or
 * replace.
 */
const loopFiles = (reviewKeys: string, files: Record<string, string | object | null> = {}) => ({
  'review.md': `---\nafter: implement\nplace: git\noutput: review.schema.json\n${reviewKeys}\n---\nreview it\n`,
  'review.schema.json': LOOPING,
  ...files,
});
/** A step `loop:`-ing back to `target`, declaring `again`, as a folder would load it. */
const looping = (name: string, after: string[], target: string): Workflow => ({
  ...step(name, after),
  loop: target,
  rounds: DEFAULT_ROUNDS,
  output: { file: `${name}.json`, schema: LOOPING as never },
});

test('`loop:` names the step to run again and `rounds:` counts, 3 unless it says — and a loop is its target, what is between, and itself', () => {
  const steps = loadWorkflows(outputFolder(loopFiles('loop: implement')));
  const review = steps.find((s) => s.name === 'review')!;
  assert.deepEqual([review.loop, review.rounds, DEFAULT_ROUNDS], ['implement', 3, 3]);
  assert.equal(loadWorkflows(outputFolder(loopFiles('loop: implement\nrounds: 1'))).find((s) => s.name === 'review')!.rounds, 1);
  assert.deepEqual([steps[0].loop, steps[0].rounds], [undefined, undefined], 'a step with no loop counts no rounds');

  const chain = [
    step('implement'),
    step('test', ['implement']),
    looping('review', ['test'], 'implement'),
    step('docs', ['review']),
    looping('proof', ['docs'], 'docs'),
  ];
  validate(chain);
  assert.deepEqual(loopSpan(chain, chain[2]), ['implement', 'test', 'review'], 'a step between is in the loop');
  assert.deepEqual(
    loopSpan(chain, chain[4]),
    ['docs', 'proof'],
    'a step after the loop is not in it, and a second loop starts where the first ends',
  );
  assert.deepEqual(loopSpan(chain, chain[1]), [], 'a step with no loop spans nothing');
});

test('REFUSED at load: `loop:` naming a step that is not an ancestor — one beside it, one after it, itself, one not here, or two', () => {
  const docs = { 'docs.md': '---\nafter: implement\nplace: git\n---\ndocument it\n' };
  names(refusal(loopFiles('loop: docs', docs)), 'review: ', '`loop: docs`', 'does not wait on docs', 'Add docs to `after:`');
  assert.match(
    refusal(loopFiles('loop: ship', { 'ship.md': '---\nafter: review\nplace: git\n---\nship it\n' })),
    /^review: `loop: ship`, but review does not wait on ship/,
  );
  names(refusal(loopFiles('loop: review')), 'review: ', '`loop: review`', 'names this step');
  names(refusal(loopFiles('loop: implemnt')), 'review: ', '`loop: implemnt`', 'not here', 'delete the line');
  assert.match(refusal(loopFiles('loop: implement, docs', docs)), /^review: `loop: implement, docs` names more than one step\./);
});

test('REFUSED at load: a step with `loop:` whose output does not declare `again` as a boolean — or declares nothing', () => {
  names(
    refusal(loopFiles('loop: implement', { 'review.schema.json': FINDINGS })),
    'review: ',
    '`loop: implement`',
    '`output: review.schema.json` does not declare `again`',
    '`"again": { "type": "boolean" }`',
    '`required`',
  );
  names(
    refusal({ 'review.md': '---\nafter: implement\nplace: git\nloop: implement\n---\nreview it\n' }),
    'review: ',
    '`loop: implement`',
    'declares no `output:`',
    '`again`',
  );
  for (const type of ['string', ['boolean', 'null']]) {
    const schema = { ...LOOPING, properties: { ...LOOPING.properties, again: { type } } };
    assert.match(
      refusal(loopFiles('loop: implement', { 'review.schema.json': schema })),
      /^review: .*declares `again` as .*`"type": "boolean"`/,
      JSON.stringify(type),
    );
  }
});

test('`gate: true` gates a step — its closeout waits for a person — and a step without the line has none; REFUSED at load: `gate: false`, a word that is not `true`, no value, and the line twice', () => {
  assert.equal(fm('plan', 'gate: true').gate, true);
  assert.equal(fm('plan', 'check: npm test').gate, undefined, 'no gate unless it says so');
  const refused = (lines: string, pattern: RegExp) =>
    assert.throws(
      () => fm('plan', lines),
      (e: WorkflowError) => e.exitCode === 2 && pattern.test(e.message),
      lines,
    );
  refused(
    'gate: false',
    /^plan: `gate: false` is what a step without the line already is\. Delete the line: a step has no gate unless it says `gate: true`, or a run is started with --gate plan\.$/,
  );
  for (const word of ['yes', 'True', 'plan', '1']) {
    refused(
      `gate: ${word}`,
      new RegExp(
        `^plan: \`gate: ${word}\` is not \`true\`\\. \`gate: true\` holds the step's closeout for a person — nemia approve — .* start it with --gate plan\\.$`,
      ),
    );
  }
  refused('gate:', /^plan: `gate` has no value\. Delete the line rather than leaving it blank/);
  refused('gate: true\ngate: true', /^plan: `gate` is set twice/);
});

test("`workspace: base` runs a step in the repository's own checkout, and a step without the line works where the shape puts it; REFUSED at load: `worktree`, another word, a `check:` beside it, no value, and the line twice", () => {
  assert.equal(fm('ship', 'after: review\nworkspace: base').workspace, 'base');
  assert.equal(fm('implement', 'check: npm test').workspace, undefined, 'a worktree unless it says otherwise');
  const refused = (lines: string, pattern: RegExp) =>
    assert.throws(
      () => fm('ship', lines),
      (e: WorkflowError) => e.exitCode === 2 && pattern.test(e.message),
      lines,
    );
  refused(
    'workspace: worktree',
    /^ship: `workspace: worktree` is what a step without the line already is: the shape of the workflow says which worktree — its own, or the one it continues\. Delete the line, or write `workspace: base` to run the step in the repository's own checkout\.$/,
  );
  for (const word of ['Base', 'Main', 'repo', '/tmp/x', 'true']) {
    refused(`workspace: ${word}`, new RegExp(`^ship: \`workspace: ${word.replace(/\//g, '/')}\` is not \`base\`\\.`));
  }
  refused('workspace:', /^ship: `workspace` has no value\. Delete the line rather than leaving it blank/);
  refused('workspace: base\nworkspace: base', /^ship: `workspace` is set twice/);
});

test('`place: folder` runs a step in a folder the run makes, with a check and a resume as a worktree takes them, and `place: git` on a repository; REFUSED at load: another word, a team only some of whose steps say `place: folder`', () => {
  assert.equal(fm('write', 'place: folder').place, 'folder');
  assert.equal(fm('write', 'place: git').place, 'git');
  assert.equal(fm('review', 'place: folder\ncheck: test -s note.md').place, 'folder', "a check runs in the step's folder");
  assert.equal(
    fm('review', 'place: folder\nresume: write').place,
    'folder',
    'and a resumed session works in the folder of the step it continues',
  );
  assert.equal(
    stepPlace({ place: undefined }),
    'git',
    'a step frozen on a run record before the key says no place, and works on a repository, as every step did then',
  );
  assert.equal(stepPlace(fm('write', 'place: folder')), 'folder');
  const refusedWord = (lines: string, pattern: RegExp) =>
    assert.throws(
      () => fm('write', lines),
      (e: WorkflowError) => e.exitCode === 2 && pattern.test(e.message),
      lines,
    );
  for (const word of ['Folder', 'folders', 'cloud'])
    refusedWord(
      `place: ${word}`,
      new RegExp(
        `^write: \`place: ${word}\` is not a place a step works in\\. \`place: git\` works on branches of a repository; \`place: folder\` works in folders the run makes, with no git repository\\.`,
      ),
    );

  const team = (...words: Array<'folder' | 'git' | 'base' | undefined>): Workflow[] =>
    words.map((word, i) => ({
      name: `s${i}`,
      after: i ? [`s${i - 1}`] : [],
      body: 'x',
      permissionMode: 'dontAsk',
      ...(word === 'base' ? { workspace: word } : word ? { place: word } : {}),
    }));
  assert.doesNotThrow(() => validate(team('folder', 'folder')), 'every step says it');
  assert.doesNotThrow(() => validate(team(undefined, 'git', 'base')), 'or none does, a step frozen before the key among them');
  assert.equal(isFolderTeam(team('folder', 'folder')), true);
  assert.equal(isFolderTeam(team('folder', 'git')), false);
  assert.equal(isFolderTeam(team(undefined)), false, 'a step frozen on a record before the key is a git step');
  const refused = (steps: Workflow[], pattern: RegExp) =>
    assert.throws(
      () => validate(steps),
      (e: WorkflowError) => e.exitCode === 2 && pattern.test(e.message),
      pattern.source,
    );
  refused(
    team('folder', undefined),
    /^s0 says `place: folder`, and s1 works on a repository, as `place: git` — every step of a team says `place: folder`, or none does\. A run works in folders it makes, with no git repository, or on branches of one: it cannot do both\. Write `place: folder` on s1, or `place: git` on s0\.$/,
  );
  refused(
    team(undefined, 'folder', 'folder'),
    /^s1, s2 say `place: folder`, and s0 works on a repository, as `place: git` — every step of a team says `place: folder`, or none does\./,
  );
  refused(team('folder', 'git'), /^s0 says `place: folder`, and s1 works on a repository/);
  refused(team('folder', 'base'), /^s0 says `place: folder`, and s1 works on a repository/);

  assert.throws(
    () =>
      parseFolder([
        ['write', '---\nplace: git\npermissionMode: dontAsk\n---\nWrite.\n'],
        ['review', '---\nafter: write\nplace: folder\n---\nReview.\n'],
      ]),
    refusedNaming('review says `place: folder`', 'write works on a repository'),
    'and at load, from a folder of files, as a person writes them',
  );
});

/** What a step file that says no `place:` is refused with: both fixes named, no word picked for it. */
const NO_PLACE = (step: string) =>
  `${step}: says no \`place:\`, where the step works, and a step does not work on a repository unless it says so. Write \`place: git\` to work on branches of a repository, or \`place: folder\` to work in folders the run makes, with no git repository — every step of a workflow says the same.`;

test('`place:` is required: REFUSED at load, a step that names none, naming both fixes; accepted, each word and the former spelling', () => {
  const refusedFor = (load: () => unknown, step: string, why: string) =>
    assert.throws(load, (e: WorkflowError) => e instanceof WorkflowError && e.exitCode === 2 && e.message === NO_PLACE(step), why);
  refusedFor(() => parseWorkflow('write', '---\ncheck: npm test\n---\nDo it.\n'), 'write', 'a frontmatter without the line');
  refusedFor(() => parseWorkflow('write', 'Do it.\n'), 'write', 'a bare body, with no frontmatter');
  const agents = new Map([['writer', parseAgent('writer', '---\nharness: claude\n---\nYou write.\n')]]);
  refusedFor(() => parseWorkflow('write', '---\nagent: writer\n---\n', undefined, agents), 'write', 'an agent cannot give it');
  refusedFor(
    () => parseWorkflow('write', 'Write.\n', undefined, agents, undefined, { agent: 'writer', factory: 'f', step: 'write' }),
    'write',
    'nor can the agent a factory hires into the step',
  );
  refusedFor(
    () =>
      parseFolder([
        ['write', '---\nplace: folder\n---\nWrite.\n'],
        ['review', '---\nafter: write\n---\nReview.\n'],
      ]),
    'review',
    'a folder whose other step says a place is refused for the missing line, not for two kinds of step',
  );
  assert.deepEqual(
    [
      fm('write', 'place: git').place,
      fm('write', 'place: folder').place,
      parseWorkflow('write', '---\nworkspace: folder\n---\nDo it.\n').place,
    ],
    ['git', 'folder', 'folder'],
  );
});

test('`workspace: folder` is read as its former spelling, `place: folder`, and never written; REFUSED at load: the former line beside a `place:`', () => {
  const former = fm('write', 'workspace: folder');
  assert.equal(former.place, 'folder', 'read as `place: folder`');
  assert.equal(former.workspace, undefined, 'and says no workspace');
  assert.equal(
    fm('ship', 'after: review\nworkspace: main').workspace,
    'base',
    '`workspace: main` is the former spelling of `base`, not of a place',
  );
  const attached = parseWorkflow(
    'write',
    '---\nagent: writer\nworkspace: folder\n---\nWrite.\n',
    undefined,
    new Map([['writer', { name: 'writer', keys: {}, body: 'You write.', read: () => undefined }]]),
  );
  assert.deepEqual(attached.agent?.keys, ['place'], "the step's own keys say `place`, as a save from the board writes it");
  const team = parseFolder([
    ['write', '---\nworkspace: folder\npermissionMode: dontAsk\n---\nWrite.\n'],
    ['review', '---\nafter: write\nworkspace: folder\n---\nReview.\n'],
  ]);
  assert.equal(isFolderTeam(team), true, 'a team spelled the former way is still a folder team');
  assert.equal(renderStep(former), '---\nplace: folder\n---\nDo the work.\n', 'a save writes `place: folder` and no `workspace:` line');
  assert.throws(
    () => renderStep({ ...former, workspace: 'folder' as never }),
    refusedNaming('write: ', '`workspace: folder`', 'former spelling', 'Send `place: folder`', 'reload it'),
  );
  for (const place of ['folder', 'git'])
    assert.throws(
      () => fm('write', `workspace: folder\nplace: ${place}`),
      (e: WorkflowError) =>
        e.exitCode === 2 &&
        e.message ===
          `write: \`workspace: folder\` and \`place: ${place}\` are both set, and they say one thing: \`workspace: folder\` is the former spelling of \`place: folder\`. Delete the \`workspace: folder\` line, and keep \`place:\`.`,
      place,
    );
  assert.throws(
    () => parseAgent('writer', '---\nplace: folder\n---\nYou write.\n'),
    (e: WorkflowError) => e.exitCode === 2 && e.message.includes('`place` is wiring, and belongs on the step'),
    'an agent may not say where its steps work',
  );
});

test('`workspace: main` is read as its former spelling, `workspace: base`, and never written: `nemia start` names the line, and a frozen step reads as `base`', () => {
  const former = fm('ship', 'after: review\nworkspace: main');
  assert.equal(former.workspace, 'base', 'read as `workspace: base`');
  assert.equal(fm('ship', 'after: review\nworkspace: base').workspace, 'base', 'as the new spelling is');
  assert.equal(endsOnBase(former), true, 'and it ends on the base');
  assert.match(renderStep(former), /^workspace: base$/m, 'a save writes `workspace: base`');
  assert.doesNotMatch(renderStep(former), /workspace: main/);
  assert.throws(
    () => renderStep({ ...former, workspace: 'main' as never }),
    refusedNaming('ship: ', '`workspace: main`', 'former spelling', 'Send `workspace: base`', 'reload it'),
  );
  const dir = folder({ 'ship.md': '---\nplace: git\nworkspace: main\n---\nShip.\n' });
  assert.doesNotThrow(() => loadWorkflows(dir), 'the folder starts: the former line stops nothing');
  const lines = formerKeyLines(dir);
  assert.deepEqual(lines, [baseLine(path.join(dir, 'ship.md'))], '`nemia start` names the file');
  assert.ok(lines[0].includes('`workspace: base`'), lines[0]);
  assert.deepEqual(formerKeyLines(folder({ 'ship.md': '---\nplace: git\nworkspace: base\n---\nShip.\n' })), []);
  const frozen = { name: 'ship', after: ['review'], body: 'Ship.', workspace: 'main' } as unknown as Workflow;
  assert.deepEqual(
    asNamed(frozen),
    { name: 'ship', after: ['review'], body: 'Ship.', workspace: 'base' },
    'a frozen `main` reads as `base`',
  );
  assert.equal(endsOnBase(asNamed(frozen)), true);
});

test('`denials: fail` is read on a job of `claude`, and a step without the line has none; REFUSED at load: another word, no value, the line twice, and on codex — where no denial is ever read', () => {
  assert.equal(fm('review', 'denials: fail').denials, 'fail', 'at shipped defaults: harness claude, a job');
  assert.equal(fm('review', '').denials, undefined);
  assert.deepEqual(DENIALS, ['fail']);
  for (const word of ['true', 'stop', 'Fail', 'record']) {
    assert.throws(
      () => fm('review', `denials: ${word}`),
      refusedWith(
        new RegExp(
          `^review: \`denials: ${word}\` is not \`fail\`\\. \`denials: fail\` stops the step when the harness denied its try a call — it reads \`denied\` and waits on a person — rather than passing it on; without the line, what was denied is said beside the step and decides nothing\\. Write \`denials: fail\`, or delete the line\\.$`,
        ),
      ),
      word,
    );
  }
  assert.throws(() => fm('review', 'denials:'), refusedNaming('review: ', '`denials` has no value', 'Delete the line'));
  assert.throws(() => fm('review', 'denials: fail\ndenials: fail'), refusedWith(/^review: `denials` is set twice/));
  assert.throws(
    () => fm('review', 'harness: codex\ndenials: fail'),
    refusedNaming('review: ', '`denials: fail`', '`codex exec` records none', 'delete `harness: codex`', 'delete `denials: fail`'),
  );
  const step = fm('review', 'denials: fail\nallowedTools: Edit(**)');
  assert.equal(
    renderStep(step),
    ['---', 'place: git', 'claude:', '  fence:', '    allowedTools: Edit(**)', 'denials: fail', '---', 'Do the work.', ''].join('\n'),
    'written back after the harness block that holds allowedTools, before remote',
  );
  assert.deepEqual(parseWorkflow('review', renderStep(step)), step, 'and read back as the step');
});

test("`allowRuleOf`: the rule a folder's `allowedTools:` takes for a call the harness denied — a file edit by any tool as `Edit(…)`, an absolute path from the root, a command by its first word and whatever follows it; any other call as it was denied", () => {
  assert.equal(allowRuleOf('Write(/tmp/w/notes.md)'), 'Edit(//tmp/w/notes.md)');
  assert.equal(allowRuleOf('MultiEdit(/tmp/w/a.ts)'), 'Edit(//tmp/w/a.ts)');
  assert.equal(allowRuleOf('NotebookEdit(/tmp/w/n.ipynb)'), 'Edit(//tmp/w/n.ipynb)');
  assert.equal(allowRuleOf('Edit(src/a.ts)'), 'Edit(src/a.ts)', "a relative path is the session's own directory's, as written");
  assert.equal(allowRuleOf('Write(//tmp/x)'), 'Edit(//tmp/x)', 'a path already from the root keeps its two slashes');
  assert.equal(allowRuleOf('Read(/home/me/.ssh/config)'), 'Read(//home/me/.ssh/config)');
  assert.equal(allowRuleOf('Bash(pytest)'), 'Bash(pytest:*)');
  assert.equal(allowRuleOf('Skill(look)'), 'Skill(look)');
  assert.equal(allowRuleOf('SendMessage'), 'SendMessage');
  assert.equal(allowRuleOf('mcp__playwright__browser_click'), 'mcp__playwright__browser_click');
  assert.equal(allowRuleOf('Write(/tmp/a (copy).md)'), 'Edit(//tmp/a (copy).md)', 'a path with brackets in it is the path');
  for (const denied of ['Write(/tmp/w/notes.md)', 'MultiEdit(src/a.ts)', 'NotebookEdit(n.ipynb)', 'Bash(pytest)']) {
    assert.doesNotThrow(
      () => fm('review', `allowedTools: ${allowRuleOf(denied)}`),
      `${denied}: every rule it words for a file edit is one allowedTools: takes, which refuses a path rule on another file-editing tool`,
    );
  }
});

test("`allowRuleOf` of a path this run made: from the step's own directory inside it, and the run's id as `*` outside it — the next run works in directories named by its own id", () => {
  const at = { cwd: '/home/me/.agent-workflows/worktrees/r-7/implement', runId: 'r-7' };
  assert.equal(allowRuleOf('Write(/home/me/.agent-workflows/worktrees/r-7/implement/notes.md)', at), 'Edit(notes.md)');
  assert.equal(allowRuleOf('Write(/home/me/.agent-workflows/worktrees/r-7/implement/docs/a.md)', at), 'Edit(docs/a.md)');
  assert.equal(
    allowRuleOf('Write(/home/me/.agent-workflows/runs/r-7/artifacts/implement/shot.png)', at),
    'Edit(//home/me/.agent-workflows/runs/*/artifacts/implement/shot.png)',
  );
  assert.equal(
    allowRuleOf('Read(/home/me/.agent-workflows/worktrees/r-7/plan/PLAN.md)', at),
    'Read(//home/me/.agent-workflows/worktrees/*/plan/PLAN.md)',
    "a sibling's worktree",
  );
  assert.equal(
    allowRuleOf('Write(/home/me/.agent-workflows/worktrees/r-7/implement-2/x)', at),
    'Edit(//home/me/.agent-workflows/worktrees/*/implement-2/x)',
    "a directory whose name starts as the cwd's is not in it",
  );
  assert.equal(allowRuleOf('Write(/tmp/r-70/x)', at), 'Edit(//tmp/r-70/x)', "a part is the run's id whole, or it is kept");
  assert.equal(allowRuleOf('Bash(pytest)', at), 'Bash(pytest:*)');
  for (const denied of [
    'Write(/home/me/.agent-workflows/worktrees/r-7/implement/notes.md)',
    'Write(/home/me/.agent-workflows/runs/r-7/artifacts/implement/shot.png)',
  ]) {
    assert.doesNotThrow(() => fm('review', `allowedTools: ${allowRuleOf(denied, at)}`), denied);
  }
});

test("`disallowedBy`: the step's own deny rule that may have denied a call, which no allow rule overrides — and none for a call no rule of it names", () => {
  const at = { cwd: '/w/r-7/implement', runId: 'r-7' };
  assert.equal(disallowedBy('SendMessage', ['Bash(npm run build)', 'SendMessage']), 'SendMessage', 'a bare tool');
  assert.equal(disallowedBy('Bash(npm)', ['Bash(npm run build)']), 'Bash(npm run build)', "the command's first word is all the call keeps");
  assert.equal(disallowedBy('Bash(git)', ['Bash(git push:*)']), 'Bash(git push:*)');
  assert.equal(disallowedBy('Bash(rm)', ['Bash']), 'Bash');
  assert.equal(disallowedBy('Write(/etc/hosts)', ['Edit(//etc/**)']), 'Edit(//etc/**)', 'an `Edit` rule covers every file-editing tool');
  assert.equal(
    disallowedBy('Write(/w/r-7/implement/secrets/k.pem)', ['Edit(secrets/**)'], at),
    'Edit(secrets/**)',
    "a relative rule is the session's directory's",
  );
  assert.equal(disallowedBy('Read(/w/r-7/implement/deep/.env)', ['Read(.env)'], at), 'Read(.env)', 'a name with no slash, at any depth');
  assert.equal(
    disallowedBy('Read(/w/r-7/implement/a/b.ts)', ['Read(//w/r-7/implement/a)'], at),
    'Read(//w/r-7/implement/a)',
    'a directory names what is under it',
  );
  assert.equal(disallowedBy('Skill(look)', ['Skill(look)']), 'Skill(look)');
  const live = 'mcp__playwright__browser_navigate(url:*:8787*)';
  assert.equal(
    disallowedBy('mcp__playwright__browser_navigate', ['Bash(cd:*)', live]),
    live,
    "an MCP call keeps its name alone, so its tool's parameter rule may be it",
  );
  assert.equal(disallowedBy('mcp__playwright__browser_click', [live]), undefined, 'not by a rule on another MCP tool');
  assert.equal(
    disallowedBy('SendMessage', ['SendMessage(to:*)']),
    undefined,
    'nor a bare call of a tool that is no MCP tool by a rule that names more',
  );
  assert.equal(disallowedBy('Bash(pytest)', ['Bash(npm run build)', 'SendMessage']), undefined, 'not by a rule on another command');
  assert.equal(disallowedBy('Bash(npm)', ['Read']), undefined, 'nor on another tool');
  assert.equal(disallowedBy('Write(/tmp/x)', ['Edit(//etc/**)']), undefined, 'nor on another path');
  assert.equal(disallowedBy('Write(/etc/hostsx)', ['Edit(//etc/hosts)']), undefined, 'a path is matched whole');
  assert.equal(disallowedBy('Read(/w/r-7/implement/a.ts)', ['Edit(**)'], at), undefined, 'an `Edit` rule is no `Read` rule');
  assert.equal(disallowedBy('Write(/w/r-7/implement/src/a.ts)', ['Edit(secrets/**)'], at), undefined, 'nor on another relative path');
  assert.equal(
    disallowedBy('Write(/w/r-7/implement/secrets/k.pem)', ['Edit(secrets/**)']),
    undefined,
    'no directory: a relative rule is not read',
  );
  assert.equal(disallowedBy('Write(/home/me/x)', ['Edit(~/x)'], at), undefined, "`~` is nobody's here");
  assert.equal(disallowedBy('Skill(look)', ['Skill(shadcn)']), undefined, 'nor on another skill');
  assert.equal(disallowedBy('SendMessage', []), undefined);
});

test('`slot: none` takes a run out of the cap on runs in flight, and a run without the line waits for a slot like any other; REFUSED at load: another word, no value, and the line twice', () => {
  assert.equal(fm('supervise', 'slot: none').slot, 'none');
  assert.equal(fm('implement', 'check: npm test').slot, undefined, 'counted unless it says otherwise');
  const refused = (lines: string, pattern: RegExp) =>
    assert.throws(
      () => fm('supervise', lines),
      (e: WorkflowError) => e.exitCode === 2 && pattern.test(e.message),
      lines,
    );
  for (const word of ['None', 'false', '0', 'off', 'one', 'true']) {
    refused(
      `slot: ${word}`,
      new RegExp(
        `^supervise: \`slot: ${word}\` is not \`none\`\\. \`slot: none\` keeps this step's run out of the cap on runs in flight \\(WF_MAX_RUNS\\), for a workflow of one step that watches the other runs rather than doing a run's work\\. Without the line, the run waits for a slot and holds one, like every other run\\.$`,
      ),
    );
  }
  refused('slot:', /^supervise: `slot` has no value\. Delete the line rather than leaving it blank/);
  refused('slot: none\nslot: none', /^supervise: `slot` is set twice/);
});

test("REFUSED at load: `slot: none` on a step of a workflow that has another — a slot is a run's, not a step's, so the work beside it would run outside the cap too", () => {
  const watcher = { name: 'supervise', after: [], body: 'x', slot: 'none' } as Workflow;
  assert.doesNotThrow(() => validate([watcher]), 'a workflow of one step is what takes no slot');
  const refused = (steps: Workflow[], pattern: RegExp) =>
    assert.throws(
      () => validate(steps),
      (e: WorkflowError) => e.exitCode === 2 && pattern.test(e.message),
      pattern.source,
    );
  refused(
    [watcher, { name: 'implement', after: [], body: 'x' }],
    /^supervise: `slot: none` takes this step's whole RUN out of the cap on runs in flight \(WF_MAX_RUNS\), and this workflow has implement beside it — a slot is a run's, not a step's, so implement would run outside the cap too\. A run that takes no slot is one step: a session that watches the other runs\. Delete the line, or give supervise a folder of its own\.$/,
  );
  refused(
    [
      { name: 'implement', after: [], body: 'x' },
      { ...watcher, after: ['implement'] },
    ],
    /and this workflow has implement beside it/,
  );
  refused(
    [
      { ...watcher, slot: 'none' },
      { name: 'review', after: ['supervise'], body: 'x' },
    ],
    /and this workflow has review beside it/,
  );
  refused(
    [watcher, { name: 'implement', after: [], body: 'x' }, { name: 'review', after: ['implement'], body: 'x' }],
    /this workflow has implement, review beside it/,
  );
});

test("REFUSED at load: a `resume:` on a step that runs in the repository's checkout — its session ran in another directory, and an ending starts cold", () => {
  assert.throws(
    () => fm('ship', 'workspace: base\nresume: review'),
    refusedNaming('ship: ', '`workspace: base`', "`resume: review` continues review's session", 'Delete one of the two lines'),
  );
  assert.throws(
    () => fm('ship', 'resume: review\nworkspace: base'),
    refusedNaming('ship: ', '`workspace: base`', '`resume: review`', 'Delete one of the two lines'),
    'whichever order the two lines are written in',
  );
  assert.deepEqual(
    [fm('ship', 'resume: review').resume, fm('ship', 'resume: review').after],
    ['review', ['review']],
    'each key on its own is read as it was: resume: implies after:',
  );
  assert.equal(fm('ship', 'after: review\nworkspace: base').workspace, 'base', 'and an ending step waits on what it acts on');
});

test("an ending's `check:` is filed by a person's approval or by a step that can send the work back: REFUSED at load with neither", () => {
  const ending = { name: 'ship', after: ['review'], body: 'x', workspace: 'base', check: 'npm test' } as Workflow;
  const folder = (loop: boolean, gate: boolean): Workflow[] => [
    { name: 'implement', after: [], body: 'x' },
    { name: 'review', after: ['implement'], body: 'x', ...(loop ? { loop: 'implement' } : {}) },
    { ...ending, ...(gate ? { gate: true } : {}) },
  ];

  assert.throws(
    () => validate(folder(false, false)),
    refusedNaming(
      'ship: ',
      '`workspace: base`',
      '`check: npm test`',
      '(it waits on review)',
      'Add `gate: true`',
      'give review a `loop:`',
      'delete the `check:` line',
    ),
    "the fixture that makes it refuse: the accepted folder with its review's `loop:` line deleted",
  );
  assert.throws(
    () => validate([{ ...ending, after: [] }]),
    refusedNaming('ship: ', 'waits on nothing', 'Add `gate: true`', 'give the step before it a `loop:`'),
    'an ending that waits on nothing has no step to route it either',
  );
  assert.throws(
    () =>
      validate([...folder(true, false).slice(0, 2), { name: 'measure', after: ['review'], body: 'x' }, { ...ending, after: ['measure'] }]),
    refusedNaming('ship: ', '(it waits on measure)', 'Add `gate: true`', 'give measure a `loop:`'),
    'a looping step in the folder that the ending does not wait on routes nothing: measure sits between the loop and the merge, and nothing it hands on can be sent back',
  );

  assert.doesNotThrow(() => validate(folder(true, false)), "a looping step before it files it: quick's shape");
  assert.doesNotThrow(() => validate(folder(false, true)), "a person's approval files it: build's shape");
  assert.doesNotThrow(() => validate(folder(true, true)), 'and both together');
  assert.doesNotThrow(
    () => validate(folder(false, false).map((s) => (s.name === 'ship' ? { ...s, check: undefined } : s))),
    "an ending with no check runs its own, and is nobody's to file in advance",
  );
});

test("a step that runs in the repository's checkout reads its `check:`, its `gate:` and its `retries:` as any step does", () => {
  const ship = fm('ship', 'workspace: base\ngate: true\ncheck: npm test');
  assert.deepEqual(
    [ship.workspace, ship.gate, ship.check],
    ['base', true, 'npm test'],
    'gated, it loads: the run executes the check on the merge the step staged, and lands or aborts it',
  );
  assert.deepEqual([fm('ship', 'check: npm test\ngate: true\nworkspace: base').check], ['npm test'], 'whichever order');
  const ungated = fm('ship', 'workspace: base\ncheck: npm test');
  assert.deepEqual(
    [ungated.gate, ungated.check],
    [undefined, 'npm test'],
    "ungated, the step file itself loads: who files it is the folder's, and `validate` reads the steps together",
  );
  assert.throws(
    () => fm('ship', 'workspace: base\ngate: true\ncheck: none'),
    /check/,
    "the check's own refusals still hold beside the gate",
  );
  assert.throws(() => fm('ship', 'workspace: base\ncheck: none'), /check/, 'and without it');
});

test("REFUSED at load: a `check:` on a gated step in the repository's checkout that runs on codex — the run keeps the session from committing the merge by a deny list, which codex takes none of", () => {
  for (const lines of [
    'workspace: base\ngate: true\ncheck: npm test\nharness: codex',
    'harness: codex\ncheck: npm test\ngate: true\nworkspace: base',
  ]) {
    assert.throws(
      () => fm('ship', lines),
      refusedNaming(
        'ship: ',
        '`workspace: base`',
        '`check: npm test`',
        '`denyWhileLanding`',
        'delete `harness: codex`',
        'delete the `check:` line',
      ),
      lines,
    );
  }
  assert.equal(
    fm('ship', 'workspace: base\ngate: true\nharness: codex').harness,
    'codex',
    'an ending on codex that runs its own check still loads',
  );
  assert.equal(
    fm('ship', 'workspace: base\ngate: true\ncheck: npm test\nharness: claude').check,
    'npm test',
    'a claude job takes the deny list',
  );
});

test("REFUSED at load: `retries:` on a step that runs in the repository's checkout — a try of an ending is a person's to ask for", () => {
  for (const lines of [
    'workspace: base\ngate: true\ncheck: npm test\nretries: 1',
    'retries: 1\nworkspace: base',
    'workspace: base\nretries: 0',
  ]) {
    assert.throws(
      () => fm('ship', lines),
      refusedNaming(
        'ship: ',
        '`workspace: base`',
        `\`retries: ${/retries: (\d)/.exec(lines)![1]}\``,
        'nemia retry <run> ship',
        'Delete the `retries:` line',
      ),
      lines,
    );
  }
  assert.equal(fm('implement', 'check: npm test\nretries: 1').retries, 1, 'any other step keeps its retries');
});

test("`remote: true` bridges a step's sessions to claude.ai, `remote: false` does not, and a step without the line has neither; REFUSED at load: a word that is not `true` or `false`, no value, and the line twice", () => {
  assert.equal(fm('implement', 'remote: true').remote, true);
  assert.equal(fm('implement', 'remote: false').remote, false, 'the author said no, and it is kept');
  assert.equal(fm('implement', 'check: npm test').remote, undefined, 'never a default');
  assert.equal(
    fm('review', 'harness: codex\nremote: true').remote,
    true,
    "which harness bridges a session is the engine's to say, at nemia start: the parser reads the word on any",
  );
  const refused = (lines: string, pattern: RegExp) =>
    assert.throws(
      () => fm('implement', lines),
      (e: WorkflowError) => e.exitCode === 2 && pattern.test(e.message),
      lines,
    );
  for (const word of ['yes', 'no', 'on', 'True', '1', 'claude']) {
    refused(
      `remote: ${word}`,
      new RegExp(
        `^implement: \`remote: ${word}\` is not \`true\` or \`false\`\\. \`remote: true\` bridges every session of the step to claude\\.ai, where anyone signed in to the account can drive it from a browser or a phone; \`remote: false\`, or no line, does not\\. Write one of the two, or delete the line\\.$`,
      ),
    );
  }
  refused('remote:', /^implement: `remote` has no value\. Delete the line rather than leaving it blank/);
  refused('remote: true\nremote: false', /^implement: `remote` is set twice/);
});

test('REFUSED at load: `rounds:` on a step with no `loop:`, and rounds that are not a count above zero', () => {
  names(
    refusal({ 'review.md': '---\nafter: implement\nplace: git\nrounds: 2\n---\nreview it\n' }),
    'review: ',
    '`rounds: 2`',
    'no `loop:`',
    'Add `loop: <step>`',
    '`retries:`',
  );
  for (const bad of ['0', 'three', '-1', '2.5']) {
    names(refusal(loopFiles(`loop: implement\nrounds: ${bad}`)), 'review: ', `\`rounds: ${bad}\` is not a count`, 'above zero');
  }
});

test('REFUSED at load: a loop a round could not file again as it was — a step in it that forks, merges or resumes, a step in two loops, a target that declares `replies`', () => {
  assert.throws(
    () => loadWorkflows(outputFolder(loopFiles('loop: implement', { 'docs.md': '---\nafter: implement\nplace: git\n---\ndocument it\n' }))),
    refusedNaming('review: ', '`loop: implement`', 'docs waits on implement too', 'review forks a worktree', 'after review'),
    'implement → review (loop: implement), and docs beside review: review forks a worktree cut once, off the first round',
  );
  assert.throws(
    () => validate([step('implement'), looping('review', ['implement', 'test'], 'implement'), step('test', ['implement'])]),
    refusedNaming('review: ', 'it waits on implement and test', 'merges their branches', 'after review'),
    "read in the workflow's order, so review's merge is found before test's fork beside it",
  );
  assert.throws(
    () => validate([step('implement'), { ...step('test', ['implement']), resume: 'implement' }, looping('review', ['test'], 'implement')]),
    refusedNaming('test: ', '`resume: implement`', "review's loop (`loop: implement`)", 'Delete the line'),
  );
  assert.throws(
    () => validate([step('implement'), { ...looping('review', [], 'implement'), resume: 'implement', after: ['implement'] }]),
    /review: `resume: implement`, and review is in review's loop/,
    'the looping step is a new session each round, too',
  );
  assert.throws(
    () => validate([step('a'), looping('b', ['a'], 'a'), looping('c', ['b'], 'b')]),
    refusedNaming('b ', 'two loops', "b's (`loop: a`)", "c's (`loop: b`)"),
  );
  const replies = { type: 'object', properties: { replies: { type: 'string' } }, required: ['replies'], additionalProperties: false };
  names(
    refusal(
      loopFiles('loop: implement', {
        'implement.md': '---\nplace: git\noutput: implement.schema.json\n---\nimplement it\n',
        'implement.schema.json': replies,
      }),
    ),
    'implement: ',
    '`output: implement.schema.json` declares `replies`',
    '(`loop: implement`)',
    'Rename the field',
  );
});

/** A repository whose workflows/ holds `dev` and `ui`, each a folder of one step, and `notes`, a folder of none. */
const withWorkflows = (): { repo: string; workflows: string } => {
  const repo = scratch('wf-named-');
  const workflows = path.join(repo, 'workflows');
  for (const name of ['dev', 'ui']) {
    fs.mkdirSync(path.join(workflows, name), { recursive: true });
    fs.writeFileSync(path.join(workflows, name, 'implement.md'), 'implement it\n');
  }
  fs.mkdirSync(path.join(workflows, 'notes'));
  return { repo, workflows };
};

test("`workflowFolder` finds a workflow by a path from where it is written, or by its name under the repository's workflows/ — the path first, so a folder a person points at is never shadowed", () => {
  const { repo, workflows } = withWorkflows();
  const plans = path.join(repo, 'plans');
  fs.mkdirSync(path.join(plans, 'dev'), { recursive: true });
  assert.equal(workflowFolder('dev', repo, repo), path.join(workflows, 'dev'), 'a name');
  assert.equal(workflowFolder('ui', plans, repo), path.join(workflows, 'ui'), 'a name, from anywhere');
  assert.equal(workflowFolder('workflows/ui', repo, repo), path.join(workflows, 'ui'), 'a path from where it is written');
  assert.equal(workflowFolder('../workflows/ui', plans, repo), path.join(workflows, 'ui'));
  assert.equal(workflowFolder(path.join(workflows, 'dev'), plans, repo), path.join(workflows, 'dev'), 'an absolute path');
  assert.equal(
    workflowFolder('dev', plans, repo),
    path.join(plans, 'dev'),
    "the folder where it is written, before the repository's of that name",
  );
  const relative = path.relative(process.cwd(), repo);
  assert.equal(workflowFolder('ui', plans, relative), path.join(workflows, 'ui'), 'a relative repository, resolved');
  for (const dir of [workflowFolder('dev', repo, repo), workflowFolder('ui', plans, relative)])
    assert.equal(Schema.is(WorkflowDir.OnCreate)(dir), true, `${dir} is minted as the Workflow door's id`);
  fs.mkdirSync(path.join(plans, 'agents'));
  assert.throws(() => workflowFolder('./agents', plans, repo), WorkflowError, 'REFUSED: a path to an agents folder is no workflow');
});

test('REFUSED at shipped defaults: `workflowFolder` on a name the repository does not have, a path that is not there, a path that is not read as a name, and a file — naming where it looked, and the workflows there are', () => {
  const { repo, workflows } = withWorkflows();
  const plans = path.join(repo, 'plans');
  fs.mkdirSync(plans);
  const refused = (message: string) => (err: Error & { exitCode?: number }) => err.exitCode === 2 && err.message === message;
  const theirs = "The repository's workflows are: dev, ui — name one, or give the path to a workflow folder.";
  assert.throws(
    () => workflowFolder('deb', repo, repo),
    refused(`no workflow folder at ${path.join(repo, 'deb')}, nor a workflow named deb in ${workflows}. ${theirs}`),
  );
  assert.throws(
    () => workflowFolder('./workflows/deb', repo, repo),
    refused(`no workflow folder at ${path.join(workflows, 'deb')}. ${theirs}`),
  );
  assert.throws(
    () => workflowFolder('workflows/dev', plans, repo),
    refused(`no workflow folder at ${path.join(plans, 'workflows', 'dev')}. ${theirs}`),
    "from the plan folder, workflows/dev is a path that is not there, and never the repository's dev",
  );
  fs.writeFileSync(path.join(repo, 'brief.md'), 'a brief\n');
  assert.throws(
    () => workflowFolder('brief.md', repo, repo),
    refused(`no workflow folder at ${path.join(repo, 'brief.md')}, nor a workflow named brief.md in ${workflows}. ${theirs}`),
  );
  const bare = scratch('wf-bare-');
  assert.throws(
    () => workflowFolder('dev', bare, bare),
    refused(
      `no workflow folder at ${path.join(bare, 'dev')}, nor a workflow named dev in ${path.join(bare, 'workflows')}. Give the path to a workflow folder, or the name of a folder of steps under ${path.join(bare, 'workflows')}.`,
    ),
  );
});

/** A folder's own files, for `parseWorkflow`'s `read`, as `loadWorkflows` reads them. */
const readIn =
  (dir: string) =>
  (file: string): string | undefined => {
    try {
      return fs.readFileSync(path.resolve(dir, file), 'utf8');
    } catch {
      return undefined;
    }
  };

/** Every workflow folder there is to read: whatever is shipped (`team.ts`), the tests' team's `dev`, and the examples. */
const everyFolder = (): string[] => {
  const examples = path.join(import.meta.dirname, '..', 'wf-examples');
  return [
    ...shippedFolders(),
    TEAM_DEV,
    ...fs
      .readdirSync(examples)
      .map((name) => path.join(examples, name))
      .filter((dir) => fs.statSync(dir).isDirectory()),
  ];
};

test('`renderStep` is the parser run backwards: every step of every folder there is, loaded, rendered and parsed again, is the step it was — and the folder rendered is the folder', () => {
  const folders = everyFolder();
  const root = path.dirname(TEAM_DEV);
  assert.ok(folders.length > 1, `the team and the examples are read: ${folders.join(', ')}`);
  for (const dir of folders) {
    const steps = loadWorkflows(dir, placesOf(dir));
    const read = readIn(dir);
    const agents = loadAgents(agentsDir(dir));
    for (const step of steps) {
      const text = renderStep(step);
      assert.deepEqual(
        parseWorkflow(step.name, text, read, agents),
        step,
        `${path.relative(root, dir)}/${step.name}.md, rendered:\n${text}`,
      );
      assert.equal(renderStep(parseWorkflow(step.name, text, read, agents)), text, 'and renders to the same text again');
    }
    assert.deepEqual(
      parseFolder(
        steps.map((step) => [step.name, renderStep(step)]),
        read,
        agents,
        skillsFor(dir, placesOf(dir)),
      ),
      steps,
      dir,
    );
  }
  const review = loadWorkflows(TEAM_DEV).find((s) => s.name === 'review')!;
  assert.equal(
    renderStep(review),
    ['---', 'after: implement', 'place: git', 'agent: reviewer', 'budget: 20', 'loop: implement', 'rounds: 3', '---', '', ''].join('\n'),
    "a step of the team rendered: the keys it sets in the keys' order, no comments, then its own note, none; the keys its agent gives it " +
      "are the agent's file's, and are not written into the step's",
  );
  assert.equal(review.model, 'opus', "and the step runs with the agent's keys all the same");
  assert.doesNotMatch(
    renderStep(review).split('\n---\n')[0],
    /^#/m,
    'the file has comments in its frontmatter, and the step does not carry them',
  );
  assert.match(fs.readFileSync(path.join(root, 'dev', 'review.md'), 'utf8'), /^# /m);
});

test('`renderStep` of a step that sets every key: one line a key, in `STEP_KEYS` order, each as the parser reads it — and it reads back as the step', () => {
  const read = (file: string) => (file === 'review.schema.json' ? JSON.stringify(LOOPING) : undefined);
  const values: Record<Exclude<StepKey, 'workspace' | 'slot' | 'agent' | 'skills' | 'mcp' | 'sandbox'>, string> = {
    after: 'implement',
    resume: 'implement',
    input: 'implement',
    place: 'folder',
    writable: 'web, docs',
    reads: 'inbox',
    harness: 'claude',
    model: 'opus',
    effort: 'xhigh',
    context: '200000',
    permissionMode: 'dontAsk',
    tools: 'Read, Grep,Glob , Bash',
    disallowedTools: 'Bash(npm run build), SendMessage',
    allowedTools: 'Edit(**),Bash(npm test)',
    denials: 'fail',
    remote: 'true',
    deadlineSeconds: '900',
    budget: '2.50',
    check: 'npm test && node -e "console.log(1 ? 2 : 3)"',
    retries: '0',
    gate: 'true',
    output: 'review.schema.json',
    tally: 'findings',
    loop: 'implement',
    rounds: '2',
  };
  const step = parseWorkflow(
    'review',
    `---\n${Object.entries(values)
      .reverse()
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n')}\n---\n\nDo the work.\n\nAll of it.\n\n`,
    read,
  );
  for (const key of STEP_KEYS)
    if (!['workspace', 'slot', 'agent', 'skills', 'mcp', 'sandbox'].includes(key))
      assert.notEqual(
        step[key],
        undefined,
        `${key}: every key is set but workspace, slot and sandbox, each rendered below, agent, in test/agents.test.ts, skills, which needs an agent, in test/step-skills.test.ts, and mcp, which needs one too, in test/agent-mcp.test.ts`,
      );
  const text = renderStep(step);
  assert.equal(
    text,
    [
      '---',
      'after: implement',
      'resume: implement',
      'input: implement',
      'place: folder',
      'writable: web, docs',
      'reads: inbox',
      'harness: claude',
      'model: opus',
      'effort: xhigh',
      'context: 200k',
      'claude:',
      '  fence:',
      '    permissionMode: dontAsk',
      '    tools: Read, Grep, Glob, Bash',
      '    disallowedTools: Bash(npm run build), SendMessage',
      '    allowedTools: Edit(**), Bash(npm test)',
      'denials: fail',
      'remote: true',
      'deadlineSeconds: 900',
      'budget: 2.5',
      `check: 'npm test && node -e "console.log(1 ? 2 : 3)"'`,
      'retries: 0',
      'gate: true',
      'output: review.schema.json',
      'tally: findings',
      'loop: implement',
      'rounds: 2',
      '---',
      'Do the work.',
      '',
      'All of it.',
      '',
    ].join('\n'),
  );
  assert.deepEqual(parseWorkflow('review', text, read), step);
  assert.match(
    renderStep({ ...step, remote: false }),
    /^remote: false$/m,
    'remote: false is a setting the parser reads, and is written; retries: 0 too',
  );

  const ending = parseWorkflow('ship', '---\nafter: review\nplace: git\ngate: true\nworkspace: base\nharness: claude\n---\nShip it.\n');
  const rendered = renderStep(ending);
  assert.equal(
    rendered,
    ['---', 'after: review', 'place: git', 'workspace: base', 'harness: claude', 'gate: true', '---', 'Ship it.', ''].join('\n'),
    'workspace: base, which no step sets beside a check:, is written after place, before harness',
  );
  assert.deepEqual(parseWorkflow('ship', rendered), ending, 'and read back as the step');

  const watching = parseWorkflow('supervise', '---\nplace: git\nharness: claude\nslot: none\nworkspace: base\n---\nWatch the runs.\n');
  const watched = renderStep(watching);
  assert.equal(
    watched,
    ['---', 'place: git', 'workspace: base', 'slot: none', 'harness: claude', '---', 'Watch the runs.', ''].join('\n'),
    'slot: none, which only a workflow of one step sets, is written after workspace, before harness',
  );
  assert.deepEqual(parseWorkflow('supervise', watched), watching);

  const fenced = parseWorkflow('review', '---\nplace: git\nsandbox: read-only\neffort: high\nharness: codex\n---\nReview it.\n');
  const fence = renderStep(fenced);
  assert.equal(
    fence,
    ['---', 'place: git', 'harness: codex', 'effort: high', 'codex:', '  fence:', '    sandbox: read-only', '---', 'Review it.', ''].join(
      '\n',
    ),
    "sandbox:, a codex step's, is written in codex's block after context, where permissionMode's block is on Claude Code",
  );
  assert.deepEqual(parseWorkflow('review', fence), fenced, 'and read back as the step');
  assert.equal(
    renderStep(parseWorkflow('review', '---\nplace: git\nharness: codex\npermissionMode: bypassPermissions\n---\nReview it.\n')),
    ['---', 'place: git', 'harness: codex', 'codex:', '  fence:', '    sandbox: danger-full-access', '---', 'Review it.', ''].join('\n'),
    "a sandbox read from the former line is written under Codex's name",
  );
});

test('REFUSED: `renderStep` and `renderAgent` of a codex draft that sends its sandbox as `permissionMode`, as a page open since before 2026-09-23 does', () => {
  const said = (file: string, word: string) => (e: Error) =>
    e.message ===
    `${file}: \`permissionMode: ${word}\` on a step that runs on codex is the former name of \`sandbox:\` there, which a file may still say but nothing writes. Send the sandbox as \`sandbox:\` instead: a page that sends the former name is stale — reload it, and save again; and a step moved onto codex from Claude Code keeps its permission mode — clear it, and set the sandbox.`;
  assert.throws(
    () => renderStep({ name: 'review', body: 'Review it.', harness: 'codex', permissionMode: 'read-only' } as StepDraft),
    said('review', 'read-only'),
  );
  assert.throws(
    () => renderStep({ name: 'review', body: 'Review it.', harness: 'codex', permissionMode: 'bypassPermissions' } as StepDraft),
    said('review', 'bypassPermissions'),
  );
  assert.throws(
    () => renderAgent({ name: 'reviewer', keys: { harness: 'codex', permissionMode: 'read-only' }, body: 'You review.' }),
    said('agents/reviewer.md', 'read-only'),
  );
  assert.match(
    renderStep({ name: 'review', body: 'Review it.', harness: 'codex', sandbox: 'read-only' } as StepDraft),
    /^codex:\n {2}fence:\n {4}sandbox: read-only$/m,
    'written under its own name, in its harness block, each is taken',
  );
  assert.match(
    renderAgent({ name: 'reviewer', keys: { harness: 'codex', sandbox: 'read-only' }, body: 'You review.' }),
    /^codex:\n {2}fence:\n {4}sandbox: read-only$/m,
  );
  assert.match(
    renderStep({ name: 'implement', body: 'Do it.', permissionMode: 'dontAsk' } as StepDraft),
    /^claude:\n {2}fence:\n {4}permissionMode: dontAsk$/m,
    "and a claude draft's permissionMode is its own",
  );
  for (const text of [
    renderStep({ name: 'review', body: 'Review it.', harness: 'codex', sandbox: 'read-only' } as StepDraft),
    renderAgent({ name: 'reviewer', keys: { harness: 'codex', sandbox: 'read-only' }, body: 'You review.' }),
    renderStep({ name: 'implement', body: 'Do it.', permissionMode: 'dontAsk' } as StepDraft),
  ])
    assert.doesNotMatch(text, /^(sandbox|permissionMode):/m, 'and no fence key at the top level');
  assert.throws(
    () => renderStep({ name: 'review', body: 'Review it.', harness: 'codex', permissionMode: 'dontAsk' } as StepDraft),
    said('review', 'dontAsk'),
    'a Claude Code mode kept by a step moved onto codex is refused too: a file would read it as the sandbox, which the runtime judges at `nemia start`',
  );
  assert.throws(
    () => renderAgent({ name: 'reviewer', keys: { harness: 'codex', permissionMode: 'dontAsk' }, body: 'You review.' }),
    said('agents/reviewer.md', 'dontAsk'),
  );
});

test('`renderStep` writes only what a step sets: `undefined`, `null` and an empty list of `after`, `input`, `disallowedTools` or `allowedTools` are no line — and a step that sets nothing is its body', () => {
  const bare: StepDraft = { name: 'implement', after: [], body: 'Implement it.' };
  assert.equal(renderStep(bare), 'Implement it.\n');
  assert.equal(
    renderStep({ ...bare, harness: undefined, input: [], disallowedTools: [], allowedTools: [], model: null } as unknown as StepDraft),
    'Implement it.\n',
    'as the board lists a step: null and [] for what it does not set',
  );
  assert.deepEqual(
    parseWorkflow('implement', renderStep({ ...bare, place: 'git' })),
    { ...parseWorkflow('implement', '---\nplace: git\n---\nImplement it.') },
    'and, with the place every step file says, reads back as the step',
  );

  const draft: StepDraft = {
    name: 'review',
    after: ['implement'],
    body: 'Review it.',
    place: 'git',
    output: { file: 'review.schema.json' },
    loop: 'implement',
  };
  const text = renderStep(draft);
  assert.equal(text, '---\nafter: implement\nplace: git\noutput: review.schema.json\nloop: implement\n---\nReview it.\n');
  const read = (file: string) => (file === 'review.schema.json' ? JSON.stringify(LOOPING) : undefined);
  assert.deepEqual(
    [parseWorkflow('review', text, read).output?.schema, parseWorkflow('review', text, read).rounds],
    [LOOPING, DEFAULT_ROUNDS],
    "a draft names its output: by file, and the schema is read from the folder; a loop's rounds are the default when it sets none",
  );

  const rule: StepDraft = { name: 'implement', after: [], body: '---\nThe brief, below a rule.' };
  assert.equal(
    renderStep(rule),
    '---\n\n---\n---\nThe brief, below a rule.\n',
    'a body that opens on --- keeps an empty frontmatter before it, or it would be read as one',
  );
  assert.throws(
    () => parseWorkflow('implement', '---\n---\n---\nThe brief, below a rule.\n'),
    (e: unknown) => e instanceof WorkflowError && e.message.startsWith('implement:2:'),
    'an empty block would not do',
  );
  assert.equal(
    parseWorkflow('implement', renderStep({ ...rule, place: 'git' })).body,
    '---\nThe brief, below a rule.',
    'nor is one needed after keys',
  );
  assert.equal(splitFrontmatter('implement', renderStep(rule)).body, '---\nThe brief, below a rule.');
});

test('`renderStep` writes its frontmatter as YAML: a long shell `check:`, holding braces, `: ` and ` #`, as a literal block the parser reads back as the same check', () => {
  const check =
    '{ if [ -n "${WF_BASE_REF:-}" ]; then git diff --quiet "$WF_BASE_REF" -- docs/ || echo "docs: changed"; fi; } && npm test # the suite of what changed';
  const step = parseWorkflow('implement', renderStep({ name: 'implement', after: [], place: 'git', check, body: 'Do it.' }));
  const text = renderStep(step);
  assert.ok(text.startsWith(`---\nplace: git\ncheck: |-\n  ${check}\n---\n`), text);
  assert.equal(parseWorkflow('implement', text).check, check, 'and the parser reads it back, byte for byte');
  assert.equal(renderStep(parseWorkflow('implement', text)), text, 'and renders to the same text again');
});

test("`renderStep` of a step over an agent writes its own denies alone, which add to its agent's: one that only repeated them writes no line", () => {
  const agents = new Map([['ada', parseAgent('ada', '---\ndisallowedTools: Bash(git push), Bash(git push:*)\n---\nWork.\n')]]);
  const parsed = (text: string) => parseWorkflow('implement', text, undefined, agents);
  const own = parsed('---\nagent: ada\nplace: git\ndisallowedTools: Bash(npm run build), Bash(git push)\n---\nDo it.\n');
  const text = renderStep(own);
  assert.match(
    text,
    /^claude:\n {2}fence:\n {4}disallowedTools: Bash\(npm run build\)$/m,
    "the agent's are not pinned into the step's file",
  );
  assert.doesNotMatch(text, /^disallowedTools:/m, 'and no fence key at the top level');
  assert.deepEqual(parsed(text).disallowedTools, own.disallowedTools, 'and it reads back to what the session is refused');
  const repeated = parsed('---\nagent: ada\nplace: git\ndisallowedTools: Bash(git push:*), Bash(git push)\n---\nDo it.\n');
  assert.doesNotMatch(renderStep(repeated), /disallowedTools/, 'a line that only repeats its agent is no line');
  assert.deepEqual(parsed(renderStep(repeated)).disallowedTools, ['Bash(git push)', 'Bash(git push:*)'], "which reads as the agent's");
});

test("REFUSED by `renderStep`, in the parser's words where the parser has them: a key no step has, `guide`; and what a file cannot hold — a comma in a step's name in a list, while a line break in a value is written as a block", () => {
  const step: StepDraft = { name: 'review', after: ['implement'], place: 'git', body: 'Review it.' };
  const parsersWords = (lines: string): string => {
    try {
      fm('review', lines);
    } catch (e) {
      return (e as Error).message;
    }
    return assert.fail(`${lines} parsed`);
  };
  const refused = (draft: object) => (e: unknown) => e instanceof WorkflowError && e.exitCode === 2 && e.message === message(draft);
  const message = (draft: object): string => {
    try {
      renderStep(draft as StepDraft);
    } catch (e) {
      return (e as Error).message;
    }
    return assert.fail(`${JSON.stringify(draft)} rendered`);
  };

  assert.equal(message({ ...step, afer: ['implement'] }), parsersWords('afer: implement'), "a key no step has: the parser's sentence");
  names(message({ ...step, afer: ['implement'] }), 'review: ', '`afer`', 'after, resume');
  assert.equal(message({ ...step, guide: 'CLAUDE.md' }), parsersWords('guide: CLAUDE.md'));
  assert.equal(
    message({ ...step, maxAttempts: 2 }),
    parsersWords('maxAttempts: 2'),
    'a draft from a page open since before it was retired',
  );
  assert.throws(() => renderStep({ ...step, colour: 'red' } as StepDraft), refused({ ...step, colour: 'red' }));
  assert.doesNotThrow(
    () => renderStep({ ...step, colour: undefined, shade: null } as unknown as StepDraft),
    'a key set to nothing is not set',
  );

  const injected = { ...step, check: 'npm test\nharness: codex' };
  const written = renderStep(injected);
  assert.match(written, /^check: \|-\n {2}npm test\n {2}harness: codex\n/m, 'a value with a line break is written as a literal block');
  assert.deepEqual(
    [parseWorkflow('review', written).check, parseWorkflow('review', written).harness],
    ['npm test\nharness: codex', undefined],
    'and reads back as the one value it was, never a key of its own: a harness nobody chose',
  );
  assert.throws(
    () => renderStep({ ...step, model: { name: 'opus' } } as unknown as StepDraft),
    refusedNaming('review: ', '`model` is {"name":"opus"}', '`[object Object]`'),
    'a key the draft sends as an object would be written as a value nobody chose: refused by name instead',
  );

  assert.throws(
    () => renderStep({ ...step, after: ['implement, docs'] }),
    refusedNaming('review: ', '`after` lists `implement, docs`', '`implement`, `docs`', 'an entry of its own'),
  );
  assert.match(message({ ...step, input: ['a,b'] }), /^review: `input` lists `a,b`/);

  for (const [draft, lines, rule] of [
    [{ ...step, tools: [] }, 'claude:\n  fence:\n    tools:', /^review: `tools` has no value, which reads as every tool/],
    [{ ...step, model: '' }, 'model:', /^review: `model` has no value\. Delete the line/],
    [{ ...step, deadlineSeconds: '5m' }, 'deadlineSeconds: 5m', /^review: `deadlineSeconds: 5m` is not a count\./],
    [{ ...step, gate: false }, 'gate: false', /^review: `gate: false` is what a step without the line already is\./],
    [{ ...step, harness: 'banana' }, 'harness: banana', /^review: `harness: banana` is not a harness a step can run on\./],
    [
      { ...step, disallowedTools: ['Bash(git push, git reset)'] },
      'claude:\n  fence:\n    disallowedTools: Bash(git push, git reset)',
      /^review: `disallowedTools: Bash\(git push, git reset\)` has a comma inside an entry/,
    ],
    [{ ...step, output: {} }, 'output:', /^review: `output` has no value\. Delete the line/],
  ] as const) {
    const text = renderStep(draft as unknown as StepDraft);
    assert.ok(text.includes(`\n${lines}\n`), `what the parser judges, renderStep writes as given, for the parser to refuse:\n${text}`);
    assert.throws(
      () => parseWorkflow('review', text),
      (e: unknown) => e instanceof WorkflowError && rule.test(e.message),
      `${lines}: refused on its own rule`,
    );
  }
});

test("`stepNameRefusal`: a step's name is its file's in the folder — REFUSED: none, a slash, a control character, a dot first, spaces around, a comma, its .md, the README's, too long", () => {
  for (const name of ['implement', 'review-2', 'plan review', 'a.b', 'étape']) assert.equal(stepNameRefusal(name), undefined, name);
  const fix = 'Name it as its file is named, without .md — implement, say.';
  const cases: Array<[unknown, string]> = [
    ['', `A step has no name, and a step is named by its file in the workflow's folder. ${fix}`],
    ['  ', `A step has no name, and a step is named by its file in the workflow's folder. ${fix}`],
    [undefined, `A step has no name, and a step is named by its file in the workflow's folder. ${fix}`],
    [
      '../review',
      `\`../review\` is not a step's name: a step is a file in its workflow's folder, and a slash names a file in another. ${fix}`,
    ],
    [
      'ui\\review',
      `\`ui\\review\` is not a step's name: a step is a file in its workflow's folder, and a slash names a file in another. ${fix}`,
    ],
    [
      'review\nharness: codex',
      `\`review\nharness: codex\` is not a step's name: it holds a control character — "review\\nharness: codex" — which a line of frontmatter cannot. ${fix}`,
    ],
    [
      '..',
      `\`..\` is not a step's name: a name that starts with a dot is a hidden file, which a person listing the folder does not see. ${fix}`,
    ],
    [
      '.review',
      `\`.review\` is not a step's name: a name that starts with a dot is a hidden file, which a person listing the folder does not see. ${fix}`,
    ],
    [
      ' review',
      "` review` is not a step's name: `after:` trims every name it lists, so no step could wait on it. Write it without the spaces around it.",
    ],
    [
      'plan,review',
      `\`plan,review\` is not a step's name: \`after:\` and \`input:\` split on every comma, so no step could wait on it. ${fix}`,
    ],
    ['review.md', "`review.md` is not a step's name: it is a file's name, and a step is named without its .md: `review`."],
    [
      'README',
      `\`README\` is not a step's name: README.md is the folder's README, which says what the workflow is for and is never read as a step. ${fix}`,
    ],
    [
      'readme',
      `\`readme\` is not a step's name: readme.md is the folder's README, which says what the workflow is for and is never read as a step. ${fix}`,
    ],
    [
      'r'.repeat(253),
      `\`${'r'.repeat(253)}\` is not a step's name: ${'r'.repeat(253)}.md is longer than a file's name may be, 255 bytes. ${fix}`,
    ],
  ];
  for (const [name, why] of cases) assert.equal(stepNameRefusal(name), why, JSON.stringify(name));
  assert.equal(stepNameRefusal('r'.repeat(252)), undefined, '252 and .md is 255');
});

test('`parseFolder` reads steps from their text as `loadWorkflows` reads a folder: in the order of their files, validated, in the order they run — refused in the same words', () => {
  const files: Array<[string, string]> = [
    ['a', '---\nplace: git\n---\nfirst\n'],
    ['a-b', '---\nplace: git\n---\nsecond\n'],
    ['c', '---\nafter: a\nplace: git\n---\nthird\n'],
  ];
  const dir = folder(Object.fromEntries(files.map(([name, text]) => [`${name}.md`, text])));
  assert.deepEqual(
    loadWorkflows(dir).map((s) => s.name),
    ['a-b', 'a', 'c'],
    "a-b.md sorts before a.md, though a sorts before a-b: the files' order breaks the tie, as a folder lists them",
  );
  assert.deepEqual(parseFolder(files), loadWorkflows(dir));
  assert.deepEqual(parseFolder([...files].reverse()), loadWorkflows(dir), 'whatever order they are given in');

  const cycle: Array<[string, string]> = [
    ['a', '---\nafter: b\nplace: git\n---\nx\n'],
    ['b', '---\nafter: a\nplace: git\n---\ny\n'],
  ];
  const words = folderRefusal(folder(Object.fromEntries(cycle.map(([name, text]) => [`${name}.md`, text])))).message;
  assert.equal(words, 'these steps wait on each other: a, b');
  assert.throws(
    () => parseFolder(cycle),
    (e: Error) => e instanceof WorkflowError && e.message === words,
  );
});

test('REFUSED: a date, a card, a finding or a measured version in the words a person reads of a former key, a retired card file or a refusal', () => {
  const said = (fn: () => unknown): string => {
    try {
      fn();
    } catch (e) {
      return (e as Error).message;
    }
    return assert.fail('refused');
  };
  const builder = new Map([['builder', parseAgent('builder', '---\nharnessPrompt: no-coding\n---\nYou build.\n')]]);
  const words = [
    formerKeyLine('w/write.md', 'allow'),
    harnessPromptLine('w/agents/builder.md', 'own'),
    codexModeLine('w/review.md', 'read-only'),
    codexModeWritten('w/review.md', 'read-only'),
    cardRetired('agents/builder.md', 'card'),
    autoDropped('claude', 'haiku', undefined)!,
    said(() => renderStep({ name: 'write', after: [], body: 'Write.', disallow: ['SendMessage'] } as unknown as StepDraft)),
    said(() => fm('review', 'harness: codex\npermissionMode: read-only\nsandbox: read-only')),
    said(() => fm('write', 'background: true')),
    said(() => parseAgent('builder', '---\nskills: write-a-note\ntools: Read, Write\n---\nx\n')),
    said(() =>
      parseFolder(
        [
          ['plan', '---\nplace: git\n---\nPlan.\n'],
          ['build', '---\nplace: git\nagent: builder\nafter: plan\nresume: plan\n---\n'],
        ],
        undefined,
        builder,
      ),
    ),
  ];
  for (const w of words) {
    assert.doesNotMatch(w, /\d{4}-\d{2}-\d{2}|\bcard \d|\(F\d+|\bmeasured\b|\d+\.\d+\.\d+|minutes/, w);
  }
});

test('REFUSED at load: a skill whose `rules.json` does not read — not JSON, a rule with no `breaks`, two rules under one id — naming the skill, the file and the field', () => {
  const refusedWith = (rules: string): string => {
    const root = teamCopy('wf-rules-');
    fs.writeFileSync(path.join(root, 'skills', 'implement-a-change', 'rules.json'), rules);
    try {
      loadWorkflows(path.join(root, 'dev'));
    } catch (e) {
      assert.ok(e instanceof WorkflowError, String(e));
      assert.equal(e.exitCode, 2);
      return e.message;
    }
    return assert.fail('loaded, and should have been refused');
  };
  const rule = (id: string, breaks: string[]) => ({ id, says: 'Read a file with Read', breaks });

  const notJson = refusedWith('{');
  assert.match(notJson, /^implement: `agent: implementer` gives the skill `implement-a-change`, which cannot be used — /);
  assert.match(notJson, /skills\/implement-a-change\/rules\.json is not JSON/);
  const empty = refusedWith(JSON.stringify({ rules: [rule('a', [])] }));
  assert.match(empty, /skills\/implement-a-change\/rules\.json does not read as a skill's rules: its `rules\.0\.breaks` /);
  const twice = refusedWith(JSON.stringify({ rules: [rule('a', ['Bash(cat:*)']), rule('a', ['Bash(head:*)'])] }));
  assert.match(twice, /skills\/implement-a-change\/rules\.json names the rule `a` twice, at `rules\.0` and `rules\.1`/);
  for (const message of [notJson, empty, twice]) assert.match(message, /Write it as \{ "rules": \[\{ "id", "says", "breaks" \}\] \}/);

  const root = teamCopy('wf-rules-');
  fs.writeFileSync(path.join(root, 'skills', 'implement-a-change', 'rules.json'), JSON.stringify({ rules: [rule('a', ['Bash(cat:*)'])] }));
  assert.equal(loadWorkflows(path.join(root, 'dev')).length, 3, 'a rules.json that reads is no refusal');
});

/** What reading a step `review` with `lines` refuses, or `read` when it is taken. */
const readsSaid = (lines: string): string => {
  try {
    fm('review', lines);
    return 'read';
  } catch (err) {
    return (err as Error).message;
  }
};

test('`reads:` is read as what of the store it names, written back as written, and a step without the line has none', () => {
  const step = fm('review', 'reads: inbox');
  assert.deepEqual(step.reads, ['inbox']);
  assert.match(renderStep(step), /^reads: inbox$/m);
  assert.deepEqual(parseWorkflow('review', renderStep(step)).reads, ['inbox']);
  assert.equal(fm('review', 'permissionMode: dontAsk').reads, undefined);
  assert.deepEqual(fm('review', 'reads: costs').reads, ['costs']);
  assert.deepEqual(fm('review', 'reads: inbox, costs').reads, ['inbox', 'costs']);
  assert.deepEqual(
    readsMounts({ harness: 'claude', reads: ['costs'] }, '/s/inbox'),
    [],
    '`costs` is said in the brief, and mounts nothing',
  );
});

test("a filing's `mounts` quotes of `reads:` only the names that mount a folder, and none of a step whose names mount none", () => {
  const mounts = (more: string) => FILED_AS.mounts(fm('review', more));
  assert.equal(mounts('reads: inbox, costs'), 'reads: inbox');
  assert.equal(mounts('reads: costs'), undefined, '`costs` gives no mount');
  assert.equal(mounts('writable: web\nreads: costs'), 'writable: web');
});

test('REFUSED at load: a `reads:` name off the store list, one given twice, none, and the key on a remote A2A agent', () => {
  const shape = 'Each is what of the store a step may read, by its name, never a path, comma-separated: inbox, costs.';
  assert.equal(
    readsSaid('reads: runs'),
    `review: \`reads: runs\` has \`runs\`, which names nothing of the store a step may read. ${shape}`,
  );
  assert.equal(
    readsSaid('reads: /home/me/.agent-workflows/inbox'),
    `review: \`reads: /home/me/.agent-workflows/inbox\` has \`/home/me/.agent-workflows/inbox\`, which names nothing of the store a step may read. ${shape}`,
  );
  assert.equal(readsSaid('reads: inbox, inbox'), 'review: `reads: inbox, inbox` names `inbox` twice. Name it once.');
  assert.equal(readsSaid('reads: , ,'), `review: \`reads: , ,\` names nothing. ${shape}`);
  assert.equal(
    readsSaid('reads: cost'),
    `review: \`reads: cost\` has \`cost\`, which names nothing of the store a step may read. ${shape}`,
  );
  assert.equal(readsSaid('reads: costs, costs'), 'review: `reads: costs, costs` names `costs` twice. Name it once.');
  assert.match(
    readsSaid('harness: a2a:peer\nreads: inbox'),
    /^review: `reads: inbox` gives a session on this machine a folder of the store to read, and a remote agent works on another party's machine/,
  );
  assert.equal(readsSaid('harness: claude\nreads: inbox'), 'read');
});
