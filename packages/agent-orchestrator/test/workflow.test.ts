/**
 * The format, and the two ways a folder of markdown is not a workflow.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fansOut, orderSteps, terminalSteps, parseWorkflow, validate, WorkflowError, type Workflow } from '../src/workflow.ts';
import { loadWorkflows, workflowDescription, workflowFolder } from '../src/workflow-store.ts';
import { CLOSEOUT_FIELDS, DEFAULT_ROUNDS, loopSpan, outputFields, STEP_KEY_MEANINGS, STEP_KEYS, type StepKey } from '../src/workflow.ts';
import { agentsDir, parseFolder, renderStep, sessionContext, stepNameRefusal, type StepDraft } from '../src/workflow.ts';
import { loadAgents } from '../src/workflow-store.ts';
import { allowRuleOf, disallowedBy, DENIALS, HARNESSES, PERMISSION_MODES } from '../src/workflow.ts';
import { asNamed, FORMER_KEYS, formerKeyLine, formerKeysIn, parseAgent, renderAgent } from '../src/workflow.ts';
import { formerKeyLines } from '../src/workflow-store.ts';
import { scratch } from './scratch.ts';

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
const LOOPING = {
  ...FINDINGS,
  properties: { ...FINDINGS.properties, again: { type: 'boolean' } },
  required: ['findings', 'again'],
};

test('a step is frontmatter and prose, and the prose is the point', () => {
  const w = parseWorkflow('review', '---\nharness: codex\nafter: implement\n---\nRead the diff.\n');
  assert.equal(w.name, 'review');
  assert.equal(w.harness, 'codex');
  assert.deepEqual(w.after, ['implement']);
  assert.equal(w.body, 'Read the diff.');
});

test('check and retries are read — the command verbatim, colons and all', () => {
  const w = parseWorkflow('implement', '---\ncheck: npm test && node -e "console.log(1 ? 2 : 3)"\nretries: 2\n---\nbuild it');
  assert.equal(w.check, 'npm test && node -e "console.log(1 ? 2 : 3)"');
  assert.equal(w.retries, 2);
  const bare = parseWorkflow('implement', '---\nharness: claude\n---\nbuild it');
  assert.equal(bare.check, undefined, 'absent means nothing runs');
  assert.equal(bare.retries, undefined);
});

test('no frontmatter at all is a valid step', () => {
  assert.deepEqual(parseWorkflow('only', 'Just do it.').after, []);
  assert.equal(parseWorkflow('only', 'Just do it.').body, 'Just do it.');
});

test('after takes a list', () => {
  assert.deepEqual(parseWorkflow('x', '---\nafter: a, b ,c\n---\nbody').after, ['a', 'b', 'c']);
});

test('a step with nothing to say is refused', () => {
  assert.throws(() => parseWorkflow('empty', '---\nharness: claude\n---\n'), WorkflowError);
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

test('the review step runs on the other harness, after the implementation', () => {
  const steps = loadWorkflows(path.join(import.meta.dirname, '..', 'workflows'));
  const review = steps.find((s) => s.name === 'review')!;
  assert.deepEqual(review.after, ['implement']);
  assert.equal(review.harness, 'codex', 'a second opinion means a second model');
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
  try { loadWorkflows(dir); } catch (e) {
    assert.ok(e instanceof WorkflowError, String(e));
    return e;
  }
  return assert.fail(`${dir} loaded, and should have been refused`);
};

test("a README in a workflow folder is not a step, and its first paragraph is the workflow's description", () => {
  const dir = folder({
    // A title, then the paragraph, then more.
    'README.md': '# dev\n\nImplement what was asked,\nthen review it.\n\nA second paragraph.\n',
    'implement.md': '---\nharness: claude\n---\nImplement it.\n',
    'review.md': '---\nafter: implement\n---\nReview it.\n',
  });
  assert.deepEqual(loadWorkflows(dir).map((s) => s.name), ['implement', 'review']);
  assert.equal(workflowDescription(dir), 'Implement what was asked, then review it.');

  // Any case, and with frontmatter a step would be refused for (`title` is not a key a step has): skipped, not parsed,
  // and the frontmatter is not the description.
  const lower = folder({ 'readme.md': '---\ntitle: ui\n---\nA change a person will see.\n', 'implement.md': 'Implement it.\n' });
  assert.deepEqual(loadWorkflows(lower).map((s) => s.name), ['implement']);
  assert.equal(workflowDescription(lower), 'A change a person will see.');

  // No README, or one with only a title: no description.
  assert.equal(workflowDescription(folder({ 'implement.md': 'Implement it.\n' })), null);
  assert.equal(workflowDescription(folder({ 'README.md': '# dev\n', 'implement.md': 'Implement it.\n' })), null);
  assert.equal(workflowDescription(path.join(scratch('wf-none-'), 'no-such-folder')), null);
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
    'dev/implement.md': 'Implement it.\n',
    'ui/implement.md': 'Implement it.\n',
    // A folder with only a README holds no workflow to name.
    'notes/README.md': '# notes\n',
  });
  const e = folderRefusal(dir);
  assert.equal(e.exitCode, 2);
  assert.ok(e.message.includes(`it holds workflows, each a folder of steps: dev, ui. Name one of them: ${path.join(dir, 'dev')}.`), e.message);
});

test('resume implies after — you cannot continue a session that has not run', () => {
  const w = parseWorkflow('respond', '---\nresume: implement\n---\nreply to the review');
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
  // plan → implement ⇄ review, given in the folder's order: alphabetical.
  assert.deepEqual(names([step('implement', ['plan']), step('plan'), { ...step('review', ['implement']), loop: 'implement' }]), ['plan', 'implement', 'review']);
  // A fan-out as a folder lists it: the siblings by name, and the join after both.
  const fan = [step('m', ['b', 'z']), step('z', ['a']), step('b', ['a']), step('a')];
  assert.deepEqual(names(byName(fan)), ['a', 'b', 'z', 'm']);
  // Two roots and a follower as a folder lists them: the follower once its root is placed, though its name sorts first.
  assert.deepEqual(names(byName([step('x'), step('b', ['x']), step('c')])), ['c', 'x', 'b']);
  // An order that already runs forward — a workflow frozen so, which the board lists as its record has it — is kept as given, not sorted.
  const frozen = [step('build'), step('test'), step('e2e'), step('lint'), step('docs'), step('notes'), step('plan'), step('ship', ['test'])];
  assert.deepEqual(names(frozen), frozen.map((s) => s.name));
  assert.deepEqual(names([step('a'), step('z', ['a']), step('b', ['a']), step('m', ['b', 'z'])]), ['a', 'z', 'b', 'm']);
  // Given out of order, only what comes before what it waits on moves: the root first, the siblings as given, the join after both.
  assert.deepEqual(names(fan), ['a', 'z', 'b', 'm']);
  // `resume:` is in `after` already.
  assert.deepEqual(names([parseWorkflow('respond', '---\nresume: implement\n---\nanswer it\n'), step('implement')]), ['implement', 'respond']);
  // It ends on what `validate` refuses, for a record read back: an `after` naming no step here orders nothing, and steps waiting on each other go last, as given.
  assert.deepEqual(names([step('b', ['ghost']), step('a', ['b'])]), ['b', 'a']);
  assert.deepEqual(names([step('y', ['x']), step('x', ['y']), step('a')]), ['a', 'y', 'x']);
  // Pure: what it was given is left as it was.
  const given = [step('b', ['a']), step('a')];
  orderSteps(given);
  assert.deepEqual(given.map((s) => s.name), ['b', 'a']);
});

test("REFUSED before, now in order: a folder `plan → implement ⇄ review` loads as plan, implement, review — not in its files' order, implement, plan, review", () => {
  const dir = folder({
    'implement.md': '---\nafter: plan\n---\nImplement it.\n',
    'plan.md': 'Plan it.\n',
    'review.md': '---\nafter: implement\nloop: implement\noutput: review.schema.json\n---\nReview it.\n',
    'review.schema.json': JSON.stringify({ type: 'object', properties: { again: { type: 'boolean' } }, required: ['again'], additionalProperties: false }),
  });
  assert.deepEqual(fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort(), ['implement.md', 'plan.md', 'review.md'], 'the folder alone reads backwards');
  assert.deepEqual(loadWorkflows(dir).map((s) => s.name), ['plan', 'implement', 'review']);
});

test('resuming a step that does not exist is refused', () => {
  assert.throws(() => validate([{ name: 'a', after: [], body: 'x', resume: 'ghost' }]), /resumes "ghost"/);
});

test('the shipped workflow is implement ⇄ review: two steps, and the review loops back to implement, at most three rounds', () => {
  const steps = loadWorkflows(path.join(import.meta.dirname, '..', 'workflows'));
  assert.deepEqual(steps.map((s) => s.name), ['implement', 'review'], 'respond is gone: implement answers the review in its own session, through the loop');
  const review = steps.find((s) => s.name === 'review')!;
  assert.deepEqual([review.loop, review.rounds], ['implement', 3]);
  assert.equal((review.output?.schema.properties.again as { type: string }).type, 'boolean');
  assert.deepEqual(review.output?.schema.required, ['findings', 'again']);
  assert.deepEqual(loopSpan(steps, review), ['implement', 'review']);
});

test('REFUSED at shipped defaults: the shipped review with its loop pointed at a step it does not wait on, with `again` gone from its schema, or beside another step', () => {
  const shipped = path.join(import.meta.dirname, '..', 'workflows');
  const copy = () => {
    const dir = scratch('wf-shipped-');
    for (const f of fs.readdirSync(shipped).filter((f) => /\.(md|json)$/.test(f))) fs.copyFileSync(path.join(shipped, f), path.join(dir, f));
    return dir;
  };
  const refused = (dir: string): string => {
    try { loadWorkflows(dir); } catch (e) {
      assert.ok(e instanceof WorkflowError, String(e));
      assert.equal(e.exitCode, 2);
      return e.message;
    }
    return assert.fail('loaded, and should have been refused');
  };
  assert.deepEqual(loadWorkflows(copy()).map((s) => s.name), ['implement', 'review'], 'the copy, untouched, loads');
  const docs = '---\nafter: implement\n---\ndocument it\n';

  const elsewhere = copy();
  fs.writeFileSync(path.join(elsewhere, 'docs.md'), docs);
  fs.writeFileSync(path.join(elsewhere, 'review.md'), fs.readFileSync(path.join(elsewhere, 'review.md'), 'utf8').replace(/^loop: implement$/m, 'loop: docs'));
  assert.match(fs.readFileSync(path.join(elsewhere, 'review.md'), 'utf8'), /^loop: docs$/m, 'the change is really in the file');
  assert.match(refused(elsewhere), /^review: `loop: docs`, but review does not wait on docs, directly or through the steps between/);

  const lacks = copy();
  const schema = JSON.parse(fs.readFileSync(path.join(lacks, 'review.schema.json'), 'utf8'));
  delete schema.properties.again;
  schema.required = schema.required.filter((f: string) => f !== 'again');
  fs.writeFileSync(path.join(lacks, 'review.schema.json'), JSON.stringify(schema));
  assert.match(refused(lacks), /^review: `loop: implement` runs implement again when this step's closeout says `again: true`, and `output: review\.schema\.json` does not declare `again`/);

  const beside = copy();
  fs.writeFileSync(path.join(beside, 'docs.md'), docs);
  assert.match(refused(beside), /^review: `loop: implement` files review again after implement each round, .*docs waits on implement too, so review forks a worktree of its own/);
});

test('a chain does not fan out; a diamond does', () => {
  const chain = [
    { name: 'a', after: [], body: 'x' },
    { name: 'b', after: ['a'], body: 'x' },
    { name: 'c', after: ['b'], body: 'x' },
  ];
  assert.equal(fansOut(chain), false);
  assert.equal(fansOut([...chain, { name: 'd', after: ['a'], body: 'x' }]), true, 'two follow a');
  assert.equal(fansOut([{ name: 'a', after: [], body: 'x' }, { name: 'b', after: [], body: 'x' }]), true, 'two roots');
});

test('the terminal steps are where the work ends up', () => {
  const chain = [
    { name: 'implement', after: [], body: 'x' },
    { name: 'review', after: ['implement'], body: 'x' },
  ];
  assert.deepEqual(terminalSteps(chain).map((s) => s.name), ['review']);

  const fan = [
    { name: 'split', after: [], body: 'x' },
    { name: 'a', after: ['split'], body: 'x' },
    { name: 'b', after: ['split'], body: 'x' },
    { name: 'integrate', after: ['a', 'b'], body: 'x' },
  ];
  assert.deepEqual(terminalSteps(fan).map((s) => s.name), ['integrate']);

  // A workflow may deliberately end wide; then there is more than one place to look.
  assert.deepEqual(terminalSteps([{ name: 'a', after: [], body: 'x' }, { name: 'b', after: [], body: 'x' }]).map((s) => s.name), ['a', 'b']);
});

test("a step that works in the repository's checkout is the workflow's last: REFUSED when anything waits on it, and when another step ends the workflow beside it", () => {
  const ship = { name: 'ship', after: ['review'], body: 'x', workspace: 'main' } as Workflow;
  const chain: Workflow[] = [
    { name: 'implement', after: [], body: 'x' },
    { name: 'review', after: ['implement'], body: 'x' },
    ship,
  ];
  assert.doesNotThrow(() => validate(chain), 'the last step may work in the checkout');
  assert.doesNotThrow(() => validate([{ name: 'ship', after: [], body: 'x', workspace: 'main' } as Workflow]), 'and so may a workflow of one step');

  const refused = (steps: Workflow[], pattern: RegExp) => assert.throws(() => validate(steps), (e: WorkflowError) => e.exitCode === 2 && pattern.test(e.message), pattern.source);
  refused([...chain, { name: 'tell', after: ['ship'], body: 'x' }],
    /^ship: `workspace: main` runs the step in the repository's own checkout, and tell waits on it — each would start from a checkout this step has changed, and none of them is where the run's work is\. It is a workflow's last step: nothing may wait on it\. Move tell before ship, or delete the line\.$/);
  refused([...chain, { name: 'tell', after: ['ship'], body: 'x' }, { name: 'say', after: ['ship'], body: 'x' }], /and tell, say wait on it/);
  refused([...chain, { name: 'publish', after: ['review'], body: 'x' }],
    /^ship: `workspace: main` runs the step in the repository's own checkout, and publish ends the workflow beside it, so both could be working in that one directory at once\. A run has one ending: make ship wait on publish, or delete the line\.$/);
  // Two of them side by side: each is refused for the other.
  refused([{ name: 'a', after: [], body: 'x', workspace: 'main' } as Workflow, { name: 'b', after: [], body: 'x', workspace: 'main' } as Workflow], /^a: .* and b ends the workflow beside it/);
});

test('the shipped examples are valid workflows too', () => {
  const examples = path.join(import.meta.dirname, '..', 'wf-examples');
  for (const d of fs.readdirSync(examples, { withFileTypes: true }).filter((e) => e.isDirectory())) {
    assert.ok(loadWorkflows(path.join(examples, d.name)).length, `${d.name} has steps`);
  }

  assert.equal(fansOut(loadWorkflows(path.join(examples, 'fanout'))), true, 'two roots meeting at integrate');

  // The splitter proposes parts; it does not file them. So it is one step that runs on its own,
  // and the concurrency it argues about happens in the runs a person starts after reading PLAN.md.
  const split = loadWorkflows(path.join(examples, 'split'));
  assert.deepEqual(split.map((s) => s.name), ['split']);
  assert.deepEqual(split[0]!.after, [], 'nothing precedes it — splitting is the first thing');
  assert.equal(fansOut(split), false);
});

/** A step with this frontmatter and a body, as a folder hands it to the parser. */
const fm = (name: string, lines: string) => parseWorkflow(name, `---\n${lines}\n---\nDo the work.\n`);

test('every key a step has is read — none is accepted and then dropped', () => {
  // Every key but `workspace:`, which no step may set beside a `check:`, and `slot:`, which is a workflow of one step's: both are read below.
  // And `agent:`, which names an agent the step is resolved with: read below, and in test/agents.test.ts. And `background:`, which is
  // Claude Code's alone and keeps no `budget:`: read below too.
  const values: Record<Exclude<StepKey, 'workspace' | 'slot' | 'agent' | 'background'>, string> = {
    after: 'implement', resume: 'implement', input: 'implement', harness: 'claude-detached', model: 'opus', effort: 'xhigh', context: '150000', permissionMode: 'dontAsk',
    tools: 'Read, Grep, Glob, Bash', disallowedTools: 'Bash(npm run build), SendMessage', allowedTools: 'Edit(**), Bash(npm test)', denials: 'fail', remote: 'true', deadlineSeconds: '900', maxAttempts: '2', budget: '2.50', check: 'npm test && npm run typecheck', retries: '1', gate: 'true', output: 'review.schema.json',
    loop: 'implement', rounds: '2',
  };
  const text = `---\n${Object.entries(values).map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\nDo the work.\n`;
  const w = parseWorkflow('review', text, (file) => (file === 'review.schema.json' ? JSON.stringify(LOOPING) : undefined));
  const ending = fm('ship', 'after: review\nworkspace: main');
  assert.equal(ending.workspace, 'main');
  const watching = fm('supervise', 'slot: none');
  assert.equal(watching.slot, 'none');
  const attached = parseWorkflow('build', '---\nagent: implementer\n---\nBuild it.\n', undefined, new Map([['implementer', { name: 'implementer', keys: {}, body: '', read: () => undefined }]]));
  assert.equal(attached.agent?.name, 'implementer');
  const session = fm('supervise', 'background: true');
  assert.equal(session.background, true);
  const all = { ...w, workspace: ending.workspace, slot: watching.slot, agent: attached.agent, background: session.background };
  for (const key of STEP_KEYS) assert.notEqual(all[key], undefined, `${key} is on the list and never read`);
  assert.equal(w.deadlineSeconds, 900);
  assert.equal(w.retries, 1);
  assert.deepEqual(w.input, ['implement']);
  assert.deepEqual(w.output, { file: 'review.schema.json', schema: LOOPING });
  assert.deepEqual([w.loop, w.rounds], ['implement', 2]);
  assert.equal(w.gate, true);
  assert.equal(w.remote, true);
  assert.deepEqual([w.effort, w.tools, w.disallowedTools, w.allowedTools], ['xhigh', ['Read', 'Grep', 'Glob', 'Bash'], ['Bash(npm run build)', 'SendMessage'], ['Edit(**)', 'Bash(npm test)']]);
  assert.equal(w.context, 150000);
  assert.equal(w.denials, 'fail');
});

/** A table of one line of meaning per key, as the board lays a file's keys out: why `meanings` is not one, or null. */
function meaningsRefusal(keys: readonly string[], meanings: Readonly<Record<string, string>>): string | null {
  if (JSON.stringify(Object.keys(meanings)) !== JSON.stringify(keys)) return `keys ${Object.keys(meanings).join(', ')} are not ${keys.join(', ')}, in that order`;
  const bad = Object.entries(meanings).find(([, line]) => typeof line !== 'string' || !line.trim() || /[\r\n]/.test(line));
  return bad ? `${bad[0]}'s meaning is not one line: ${JSON.stringify(bad[1])}` : null;
}

test("every key a step has has one line of meaning, in the keys' order — a count's in its refusal's words", () => {
  assert.equal(meaningsRefusal(STEP_KEYS, STEP_KEY_MEANINGS), null);
  // The counts' lines are the words `countOf` refuses a value with.
  assert.equal(STEP_KEY_MEANINGS.deadlineSeconds, 'the seconds the engine lets the step run before stopping it');
  assert.equal(STEP_KEY_MEANINGS.maxAttempts, 'how many attempts the engine may make at the step');
  assert.equal(STEP_KEY_MEANINGS.retries, 'how many times the run re-files the step after its check refuses it');
  assert.equal(STEP_KEY_MEANINGS.rounds, 'how many rounds `loop:` may run, the first included');
  assert.throws(() => fm('review', 'retries: -1'), (e: Error) => e.message.includes(`\`retries\` is ${STEP_KEY_MEANINGS.retries}:`));
});

test('REFUSED: a table of meanings with a key missing, one out of order, an extra one, an empty line or one on two lines', () => {
  const { after, resume, ...rest } = STEP_KEY_MEANINGS;
  assert.match(String(meaningsRefusal(STEP_KEYS, { resume, ...rest })), /are not after, resume/, 'after missing');
  assert.match(String(meaningsRefusal(STEP_KEYS, { resume, after, ...rest })), /in that order/, 'out of order');
  assert.match(String(meaningsRefusal(STEP_KEYS, { ...STEP_KEY_MEANINGS, colour: 'red' })), /are not/, 'a key the step does not have');
  assert.match(String(meaningsRefusal(STEP_KEYS, { ...STEP_KEY_MEANINGS, model: ' ' })), /^model's meaning is not one line/);
  assert.match(String(meaningsRefusal(STEP_KEYS, { ...STEP_KEY_MEANINGS, model: 'the model\nand more' })), /^model's meaning is not one line/);
});

test('a key a step does not have is refused by name, with the keys it does have', () => {
  const list = "A step's keys are: after, resume, input, workspace, slot, agent, harness, model, effort, context, permissionMode, tools, disallowedTools, allowedTools, denials, background, remote, deadlineSeconds, maxAttempts, budget, check, retries, gate, output, loop, rounds.";
  assert.throws(() => fm('review', 'colour: red'), (e: unknown) => {
    assert.ok(e instanceof WorkflowError);
    assert.equal(e.exitCode, 2, 'the author has something to fix');
    assert.ok(e.message.startsWith(`review: \`colour\` is not a key a step has. ${list}`), e.message);
    return true;
  });
  assert.throws(() => fm('review', 'Harness: codex'), /`Harness` is not a key a step has/, 'keys are exact');
  assert.throws(() => fm('review', 'constructor: x'), /`constructor` is not a key a step has/, 'not an Object.prototype lookup');
});

test('`afer: implement` is refused — accepted, it made the reviewer a root that starts beside the implementer', () => {
  const shipped = path.join(import.meta.dirname, '..', 'workflows');
  const dir = scratch('wf-');
  for (const f of fs.readdirSync(shipped).filter((f) => f.endsWith('.md'))) fs.copyFileSync(path.join(shipped, f), path.join(dir, f));
  const review = path.join(dir, 'review.md');
  fs.writeFileSync(review, fs.readFileSync(review, 'utf8').replace(/^after:/m, 'afer:'));
  assert.match(fs.readFileSync(review, 'utf8'), /^afer: implement$/m, 'the typo is really in the file');

  assert.throws(() => loadWorkflows(dir), /review: `afer` is not a key a step has\. A step's keys are: after, /);
});

test('guide is refused by name, never silently dropped', () => {
  assert.throws(() => fm('implement', 'guide: CLAUDE.md'), /implement: a step may not set `guide` — the harness reads CLAUDE\.md/);
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
  for (const [written, tokens] of [['200k', 200_000], ['150000', 150_000], ['100K', 100_000], ['1M', 1_000_000], ['1000k', 1_000_000], ['123456', 123_456]] as const) {
    assert.equal(fm('implement', `context: ${written}`).context, tokens, written);
  }
  assert.equal(fm('x', 'harness: claude-detached\ncontext: 300k').context, 300_000);
  assert.equal(fm('implement', 'harness: claude').context, undefined, "absent: the model's whole window");
});

test('`renderStep` writes a context window in one canonical form, whatever the file said: thousands with `k`, or digits', () => {
  for (const [written, rendered] of [['150000', '150k'], ['200K', '200k'], ['1M', '1000k'], ['123456', '123456']] as const) {
    const step = fm('implement', `context: ${written}`);
    const text = renderStep(step);
    assert.match(text, new RegExp(`^context: ${rendered}$`, 'm'), written);
    assert.deepEqual(parseWorkflow('implement', text), step, 'and it reads back as the same step');
  }
});

test('REFUSED: a context: that is not a number of tokens, one outside what the harness takes, and any on codex — by name, saying what to write', () => {
  for (const bad of ['lots', '200 k', '1.5M', '200,000', '0', '-1', '200kb', '0k']) {
    assert.throws(() => fm('implement', `context: ${bad}`),
      refusedWith(new RegExp(`^implement: \`context: ${bad.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\` is not a number of tokens\. \`context\` is the session's context window, in tokens: digits, or thousands with \`k\` — for example \`context: 200k\`, or \`context: 150000\`\.$`)), bad);
  }
  assert.throws(() => fm('implement', 'context: 50k'),
    refusedWith(/^implement: `context: 50k` is 50000 tokens, and claude takes a window from 100k to 1000k tokens \(there is no `harness:` line, so the step runs on claude\)\. Give one in that range — `context: 200k`, or `context: 150000` — or delete the line for the model's whole window\.$/));
  assert.throws(() => fm('implement', 'harness: claude-detached\ncontext: 2M'), refusedWith(/`context: 2M` is 2000000 tokens, and claude-detached takes a window from 100k to 1000k tokens\. Give one/));
  assert.throws(() => fm('implement', 'context: 99999'), refusedWith(/is 99999 tokens, and claude takes/));
  assert.throws(() => fm('implement', 'context: 1000001'), refusedWith(/is 1000001 tokens, and claude takes/));
  // Claude Code's own flag reads a bare 200 as thousands. The step does not guess: it says what to write.
  assert.throws(() => fm('implement', 'context: 200'), refusedWith(/`context: 200` is 200 tokens, and claude takes a window from 100k to 1000k tokens .*For 200 thousand, write `context: 200k`\.$/));
  assert.throws(() => fm('review', 'harness: codex\ncontext: 200k'),
    refusedWith(/^review: `context: 200k` sets the session's context window, and codex has no such knob: `codex exec` runs on its model's own window, whatever the step says\. Delete the line, or run the step on claude or claude-detached\.$/));
  assert.throws(() => parseWorkflow('implement', '---\ncontext:\n---\nDo it.\n'), refusedWith(/`context` has no value/));
});

test("REFUSED: a step that continues another's session with a context window of its own other than that session's — by name, saying what to do", () => {
  const folder = (implement: string, respond: string, extra: Array<[string, string]> = []) =>
    parseFolder([['implement', `---\n${implement}\n---\nimplement it\n`], ['respond', `---\nresume: implement\n${respond}\n---\nanswer it\n`], ...extra]);
  assert.throws(() => folder('context: 200k', 'context: 150k'),
    refusedWith(/^respond: `context: 150k`, and it continues implement's session, which runs on `context: 200k`\. A session keeps one window: delete the line, and respond continues on implement's, or give implement the window you meant for both\.$/));
  assert.throws(() => folder('harness: claude', 'context: 150000'),
    refusedWith(/^respond: `context: 150k`, and it continues implement's session, which runs on the model's whole window\. A session keeps one window: delete the line, and respond continues on implement's\.$/));
  // Through a chain: a step that continues respond continues implement's session.
  assert.throws(() => folder('context: 200k', 'harness: claude', [['more', '---\nresume: respond\ncontext: 300k\n---\nmore\n']]), refusedWith(/^more: `context: 300k`, and it continues respond's session, which runs on `context: 200k`/));
  // The same window, written another way, is the same window; none inherits it.
  const same = folder('context: 200k', 'context: 200000');
  assert.deepEqual(same.map((s) => sessionContext(s, same)), [200_000, 200_000]);
  const inherits = folder('context: 200k', 'harness: claude');
  assert.deepEqual(inherits.map((s) => [s.context, sessionContext(s, inherits)]), [[200_000, 200_000], [undefined, 200_000]]);
});

test('REFUSED: an empty tools: — blank, or only commas — is not "every tool", nor "none"', () => {
  assert.throws(() => fm('review', 'tools:'), refusedWith(/^review: `tools` has no value, which reads as every tool to one person and as none to another\. Name the tools .*`tools: Read, Grep, Glob, Bash`/));
  assert.throws(() => fm('review', 'tools: ,'), refusedWith(/^review: `tools: ,` names no tool\. .*Without the line, the step has the harness's own set\./));
  assert.throws(() => fm('review', 'tools:  , ,'), refusedWith(/names no tool/));
});

test('REFUSED: a tools: entry with a space or a comma inside — a list without its commas, a rule, or a list in brackets or quotes', () => {
  assert.throws(() => fm('review', 'tools: Read Grep Glob'), refusedWith(/^review: `tools: Read Grep Glob` has a space inside `Read Grep Glob`, which is not one name\. A step's tools are .*bare and comma-separated/));
  assert.throws(() => fm('review', 'tools: Read, Bash(git diff, git log)'),
    refusedWith(/^review: `tools: Read, Bash\(git diff, git log\)` has a comma inside an entry, and the list is split on every comma, so the harness would be given `Read`, `Bash\(git diff`, `git log\)` as names\./));
  assert.throws(() => fm('review', 'tools: [Read, Grep]'), refusedWith(/has a comma inside an entry/));
  assert.throws(() => fm('review', 'tools: "Read, Grep"'), refusedWith(/has a comma inside an entry/));
  assert.throws(() => fm('review', 'tools: Read, Bash(npm test)'), refusedWith(/has `Bash\(npm test\)`, which is not a tool name: it is a rule for what a tool may run, .*`Bash`, whole/));
  assert.throws(() => fm('review', 'tools: Read, Bash(git:*)'), refusedWith(/has `Bash\(git:\*\)`, which is not a tool name: it is a rule/), 'a rule with no space in it too');
  assert.throws(() => fm('review', 'tools: "Read"'), refusedWith(/has `"Read"`, which is not a tool name: a name is written bare/));
});

test('REFUSED: tools: on a codex step, naming the sandbox permissionMode sets instead', () => {
  assert.throws(() => fm('review', 'harness: codex\ntools: Read, Grep, Glob'),
    refusedWith(/^review: `tools: Read, Grep, Glob` is a tool list, and codex has none: one shell, fenced by its sandbox\. The sandbox is `permissionMode` — `read-only` reads and runs commands and writes nothing.*`permissionMode: read-only` for a step that must not write\./));
  assert.throws(() => fm('review', 'tools: Read\nharness: codex\npermissionMode: read-only'), refusedWith(/codex has none/), 'wherever the harness line is, and beside the sandbox too');
  for (const h of ['claude', 'claude-detached']) assert.deepEqual(fm('review', `harness: ${h}\ntools: Read`).tools, ['Read'], h);
});

test('disallowedTools: is the rules the harness is given to deny, one rule per entry, trimmed — and absent, nothing is denied', () => {
  const w = fm('review', 'tools: Read, Bash\ndisallowedTools: Bash(npm run build) ,  Bash(npm run e2e), SendMessage,');
  assert.deepEqual(w.disallowedTools, ['Bash(npm run build)', 'Bash(npm run e2e)', 'SendMessage'], 'a space inside a rule stays in it; a trailing comma adds none');
  assert.deepEqual(fm('review', 'disallowedTools: mcp__playwright__browser_run_code_unsafe, Read(//home/**)').disallowedTools, ['mcp__playwright__browser_run_code_unsafe', 'Read(//home/**)']);
  // A quote is legal inside a rule, whichever entry comes after it: `tools:`'s quote check refused the first order and took the second.
  for (const q of [`'`, `"`]) {
    const rule = `Bash(git commit -m ${q}wip${q})`;
    assert.deepEqual(fm('review', `disallowedTools: ${rule}, SendMessage`).disallowedTools, [rule, 'SendMessage'], `${q}: a quoted rule, then another`);
    assert.deepEqual(fm('review', `disallowedTools: SendMessage, ${rule}`).disallowedTools, ['SendMessage', rule], `${q}: another, then a quoted rule`);
  }
  assert.equal(fm('review', 'harness: claude').disallowedTools, undefined, 'absent: nothing denied beyond the settings');
  for (const h of ['claude', 'claude-detached']) assert.deepEqual(fm('review', `harness: ${h}\ndisallowedTools: SendMessage`).disallowedTools, ['SendMessage'], h);
});

test('REFUSED: an empty disallowedTools: — blank, or only commas — which denies nothing and reads as a fence', () => {
  assert.throws(() => fm('review', 'disallowedTools:'), refusedWith(/^review: `disallowedTools` has no value, which denies nothing and reads as a fence\. Name what the session may not have — `disallowedTools: Bash\(npm run build\), SendMessage` — or delete the line/));
  assert.throws(() => fm('review', 'disallowedTools: ,'), refusedWith(/^review: `disallowedTools: ,` names no rule\. .*Without the line, the step is denied nothing beyond the checkout's settings\./));
  assert.throws(() => fm('review', 'disallowedTools:  , ,'), refusedWith(/names no rule/));
});

test('REFUSED: a disallowedTools: entry that is not one rule — a comma inside its parentheses, a space outside them, a list in brackets or quotes', () => {
  assert.throws(() => fm('review', 'disallowedTools: Bash(git push, git reset)'),
    refusedWith(/^review: `disallowedTools: Bash\(git push, git reset\)` has a comma inside an entry, and the list is split on every comma, so the harness would be given `Bash\(git push`, `git reset\)` as rules\. .*Two commands are two rules: `Bash\(git push\), Bash\(git reset\)`\./));
  assert.throws(() => fm('review', "disallowedTools: Bash(git commit -m 'a, b'), SendMessage"), refusedWith(/has a comma inside an entry/), 'a comma in quotes inside the parentheses is still inside them');
  assert.throws(() => fm('review', 'disallowedTools: [SendMessage, CronCreate]'), refusedWith(/has `\[SendMessage`, which is not one rule: a rule is a bare name, without quotes or brackets/));
  assert.throws(() => fm('review', 'disallowedTools: "SendMessage, CronCreate"'), refusedWith(/has `"SendMessage`, which is not one rule: a rule is a bare name, without quotes or brackets/));
  assert.throws(() => fm('review', 'disallowedTools: SendMessage CronCreate'),
    refusedWith(/^review: `disallowedTools: SendMessage CronCreate` has `SendMessage CronCreate`, which is not one rule: a space outside the parentheses separates two rules, to the harness\. Each entry is one rule/));
  assert.throws(() => fm('review', 'disallowedTools: "SendMessage"'), refusedWith(/has `"SendMessage"`, which is not one rule: a rule is a bare name, without quotes or brackets/));
  assert.throws(() => fm('review', 'disallowedTools: Bash(npm run build'), refusedWith(/has `Bash\(npm run build`, which is not one rule: a rule has one pair of parentheses, right after the name, closed/));
  assert.throws(() => fm('review', 'disallowedTools: Bash (npm run build)'), refusedWith(/which is not one rule: a rule has one pair of parentheses, right after the name/));
});

test('REFUSED: disallowedTools: on a codex step, naming the sandbox permissionMode sets instead', () => {
  assert.throws(() => fm('review', 'harness: codex\ndisallowedTools: Bash(npm run build)'),
    refusedWith(/^review: `disallowedTools: Bash\(npm run build\)` is a deny list, and codex has no tool list to deny from: one shell, fenced by its sandbox\. The sandbox is `permissionMode` — .*`permissionMode: read-only` for a step that must not write\./));
  assert.throws(() => fm('review', 'disallowedTools: SendMessage\nharness: codex\npermissionMode: read-only'), refusedWith(/codex has no tool list to deny from/), 'wherever the harness line is, and beside the sandbox too');
});

test('allowedTools: is the rules the harness is given to allow without asking, one rule per entry, trimmed — and absent, the step may do only what its permissionMode allows', () => {
  const w = fm('write', 'permissionMode: dontAsk\nallowedTools: Edit(**) ,  Bash(npm test), Read,');
  assert.deepEqual(w.allowedTools, ['Edit(**)', 'Bash(npm test)', 'Read'], 'a space inside a rule stays in it; a trailing comma adds none');
  assert.equal(fm('review', 'harness: claude').allowedTools, undefined, 'absent: only what the permission mode allows by itself');
  for (const h of ['claude', 'claude-detached']) assert.deepEqual(fm('write', `harness: ${h}\nallowedTools: Edit(**)`).allowedTools, ['Edit(**)'], h);
  // The deny list beside it, on the same step: neither is the other's opposite, and a deny still beats an allow.
  assert.deepEqual(fm('write', 'allowedTools: Edit(**)\ndisallowedTools: SendMessage').allowedTools, ['Edit(**)']);
});

test('REFUSED: an allowedTools: that names no rule, or an entry that is not one rule — the deny list\'s refusals in the allow list\'s words', () => {
  assert.throws(() => fm('write', 'allowedTools:'), refusedWith(/^write: `allowedTools` has no value, which allows nothing and reads as a permission\. Name what the session may do without being asked — `allowedTools: Edit\(\*\*\), Bash\(npm test\)` — or delete the line/));
  assert.throws(() => fm('write', 'allowedTools: ,'), refusedWith(/^write: `allowedTools: ,` names no rule\. .*Without the line, the step may do only what its `permissionMode` allows by itself\./));
  assert.throws(() => fm('write', 'allowedTools: Bash(npm test, npm run build)'),
    refusedWith(/^write: `allowedTools: Bash\(npm test, npm run build\)` has a comma inside an entry, and the list is split on every comma, so the harness would be given `Bash\(npm test`, `npm run build\)` as rules\. .*Two tools are two rules: `Edit\(\*\*\), Bash\(npm test\)`\./));
  assert.throws(() => fm('write', 'allowedTools: [Write, Edit]'), refusedWith(/has `\[Write`, which is not one rule: a rule is a bare name, without quotes or brackets/));
  assert.throws(() => fm('write', 'allowedTools: Write Edit'), refusedWith(/has `Write Edit`, which is not one rule: a space outside the parentheses separates two rules, to the harness/));
  assert.throws(() => fm('write', 'allowedTools: Write(**'), refusedWith(/has `Write\(\*\*`, which is not one rule: a rule has one pair of parentheses, right after the name, closed/));
});

test('REFUSED: a rule on a file-editing tool that is not Edit, in either list, which Claude Code takes and never matches', () => {
  // Measured on Claude Code 2.1.278: with `allowedTools: Write(**)` the shipped note writer could not write its own `note.md`
  // — "Permission to use Write has been denied" — while the harness said, on a stderr nobody reads, that the rule "is not
  // matched by file permission checks". With `Edit(**)` it wrote inside its folder and was denied outside it.
  assert.throws(() => fm('write', 'allowedTools: Write(**)'),
    refusedWith(/^write: `allowedTools: Write\(\*\*\)` has `Write\(\*\*\)`, and Claude Code matches a file write against `Edit` rules alone: it takes this rule, warns that it is not matched, and denies the write anyway — so the step would be fenced out of its own work with nothing said where the run can read it\. Write `Edit\(\*\*\)` instead: an `Edit` rule covers every file-editing tool, Write, NotebookEdit with it\./));
  assert.throws(() => fm('write', 'allowedTools: Edit(**), NotebookEdit(notes/**)'),
    refusedWith(/has `NotebookEdit\(notes\/\*\*\)`.*Write `Edit\(notes\/\*\*\)` instead/), 'wherever in the list it sits, and whatever the path');
  for (const h of ['claude', 'claude-detached']) {
    assert.throws(() => fm('write', `harness: ${h}\nallowedTools: Write(src/**)`), refusedWith(/Claude Code matches a file write against `Edit` rules alone/), h);
  }
  // The deny list is read in the same check, so a rule it can never match is refused there too: taken, the step reads as fenced and is not.
  assert.throws(() => fm('write', 'disallowedTools: Write(**)'),
    refusedWith(/^write: `disallowedTools: Write\(\*\*\)` has `Write\(\*\*\)`, and Claude Code matches a file write against `Edit` rules alone: it takes this rule, warns that it is not matched, and allows the write anyway — so the step would be fenced by nothing while its file reads as fenced\. Write `Edit\(\*\*\)` instead: an `Edit` rule covers every file-editing tool, Write, NotebookEdit with it\./));
  assert.throws(() => fm('write', 'disallowedTools: SendMessage, NotebookEdit(notes/**)'), refusedWith(/has `NotebookEdit\(notes\/\*\*\)`.*Write `Edit\(notes\/\*\*\)` instead/), 'wherever in the deny list it sits');
  // Allowed: the rule that works, in either list, and the bare name, which has no path to miss.
  assert.deepEqual(fm('write', 'allowedTools: Edit(**)').allowedTools, ['Edit(**)']);
  assert.deepEqual(fm('write', 'disallowedTools: Edit(../**)').disallowedTools, ['Edit(../**)']);
  assert.deepEqual(fm('write', 'allowedTools: Write').allowedTools, ['Write'], 'no path, so no file permission check to miss');
  assert.deepEqual(fm('write', 'disallowedTools: Write').disallowedTools, ['Write'], 'the bare name denies the tool itself');
});

test('REFUSED: allowedTools: on a codex step, naming the sandbox permissionMode sets instead', () => {
  assert.throws(() => fm('write', 'harness: codex\nallowedTools: Edit(**)'),
    refusedWith(/^write: `allowedTools: Edit\(\*\*\)` is an allow list, and codex has no tool list to allow from: one shell, fenced by its sandbox\. The sandbox is `permissionMode` — .*`permissionMode: workspace-write` for a step that writes in its workspace and asks nobody\./));
  assert.throws(() => fm('write', 'allowedTools: Edit(**)\nharness: codex\npermissionMode: workspace-write'), refusedWith(/codex has no tool list to allow from/), 'wherever the harness line is, and beside the sandbox too');
});

test('`disallow:` and `allow:`, the names the lists had until 2026-09-23, are still read, as `disallowedTools:` and `allowedTools:`', () => {
  assert.deepEqual(FORMER_KEYS, { disallow: 'disallowedTools', allow: 'allowedTools' });
  const old = fm('write', 'disallow: Bash(git push *), SendMessage\nallow: Edit(**), Bash(npm test)');
  assert.deepEqual(old, fm('write', 'disallowedTools: Bash(git push *), SendMessage\nallowedTools: Edit(**), Bash(npm test)'), 'the same step, field for field');
  assert.equal(Object.hasOwn(old, 'allow') || Object.hasOwn(old, 'disallow'), false, 'and no field under the former name');
  // An agent's file reads them the same way.
  const agent = parseAgent('writer', '---\ndescription: Writes\nallow: Edit(**)\n---\nWrite.\n');
  assert.deepEqual(agent.keys, parseAgent('writer', '---\ndescription: Writes\nallowedTools: Edit(**)\n---\nWrite.\n').keys);
  assert.deepEqual(agent.keys, { allowedTools: 'Edit(**)' });
  // Written back, a step read under the former name is written under the new one: saved from the board, the file is renamed.
  assert.match(renderStep(old), /^disallowedTools: Bash\(git push \*\), SendMessage$/m);
  assert.match(renderStep(old), /^allowedTools: Edit\(\*\*\), Bash\(npm test\)$/m);
  assert.doesNotMatch(renderStep(old), /^(dis)?allow:/m);
});

test('a step on the former name beside an agent on the new one sets that one key, its own, over the agent\'s', () => {
  const agents = new Map([['writer', parseAgent('writer', '---\nallowedTools: Edit(**)\ndisallowedTools: SendMessage\n---\nWrite.\n')]]);
  const [step] = parseFolder([['write', '---\nagent: writer\nallow: Edit(notes/**)\n---\n']], undefined, agents);
  assert.deepEqual(step!.allowedTools, ['Edit(notes/**)'], "the step's own, as a step's own key always is");
  assert.deepEqual(step!.disallowedTools, ['SendMessage'], "and the agent's other key is the step's");
  assert.deepEqual(step!.agent!.keys, ['allowedTools'], 'owned under the new name');
  assert.equal(step!.agent!.given.disallowedTools, 'SendMessage');
  assert.equal(Object.hasOwn(step!.agent!.given, 'allowedTools'), false, 'what the step sets is not given to it');
});

test('REFUSED: a former name handed to `renderStep` or `renderAgent`, which write the name a key has now — as a board page open since before sends it', () => {
  assert.throws(() => renderStep({ name: 'write', after: [], body: 'Write.', disallow: ['SendMessage'] } as unknown as StepDraft),
    refusedWith(/^write: `disallow` is `disallowedTools`'s former name, which a file written before 2026-09-23 may still say but nothing writes\. Send `disallowedTools` — a page open since before then sends the former name: reload it, and save again\.$/));
  assert.throws(() => renderAgent({ name: 'writer', body: 'Write.', keys: { allow: 'Edit(**)' } } as never),
    refusedWith(/^agents\/writer\.md: `allow` is `allowedTools`'s former name, .* Send `allowedTools`/));
  // Unset, it is nothing to write, as any key is.
  assert.doesNotThrow(() => renderStep({ name: 'write', after: [], body: 'Write.', allow: null } as unknown as StepDraft));
});

test('REFUSED: a list set under both its names, naming both lines and which one to keep', () => {
  assert.throws(() => fm('write', 'allow: Edit(**)\nallowedTools: Read'),
    refusedWith(/^write: `allowedTools` is set twice, as `allow:` and as `allowedTools:` — `allow:` is its former name, and reads as `allowedTools:`\. Keep the `allowedTools:` line and delete the other\.$/));
  assert.throws(() => fm('write', 'disallowedTools: SendMessage\ndisallow: Bash'),
    refusedWith(/^write: `disallowedTools` is set twice, as `disallowedTools:` and as `disallow:` — `disallow:` is its former name/), 'whichever comes first');
  assert.throws(() => parseAgent('writer', '---\nallow: Edit(**)\nallowedTools: Edit(**)\n---\nWrite.\n'), refusedWith(/`allowedTools` is set twice, as `allow:` and as `allowedTools:`/), 'in an agent too, even with one value');
  assert.throws(() => fm('write', 'allow: Edit(**)\nallow: Read'), refusedWith(/^write: `allow` is set twice, and a step that says two things says nothing\./), 'the former name twice is refused as any key twice');
});

test('REFUSED: a list under its former name, in the words of the line as written', () => {
  assert.throws(() => fm('write', 'allow:'), refusedWith(/^write: `allow` has no value, which allows nothing and reads as a permission\./));
  assert.throws(() => fm('write', 'disallow:'), refusedWith(/^write: `disallow` has no value, which denies nothing and reads as a fence\./));
  assert.throws(() => fm('write', 'allow: Write(**)'),
    refusedWith(/^write: `allow: Write\(\*\*\)` \(`allow:` is `allowedTools:`'s former name\) has `Write\(\*\*\)`, and Claude Code matches a file write against `Edit` rules alone/));
  assert.throws(() => fm('write', 'disallow: NotebookEdit(notes/**)'), refusedWith(/^write: `disallow: NotebookEdit\(notes\/\*\*\)` \(`disallow:` is `disallowedTools:`'s former name\) has/));
  assert.throws(() => fm('write', 'harness: codex\nallow: Edit(**)'), refusedWith(/^write: `allow: Edit\(\*\*\)` \(`allow:` is `allowedTools:`'s former name\) is an allow list, and codex has no tool list/));
  assert.throws(() => fm('write', 'allow: Bash(npm test, npm run build)'), refusedWith(/^write: `allow: Bash\(npm test, npm run build\)` \(`allow:` is/));
});

test('a frozen step under the former names is read under the new ones (`asNamed`), and a step already on them is the same object', () => {
  const now = fm('write', 'disallowedTools: SendMessage\nallowedTools: Edit(**)');
  assert.equal(asNamed(now), now, 'nothing to rename, nothing copied');
  const frozen = { name: 'write', after: [], body: 'Write.', disallow: ['SendMessage'], allow: ['Edit(**)'] } as unknown as Workflow;
  assert.deepEqual(asNamed(frozen), { name: 'write', after: [], body: 'Write.', disallowedTools: ['SendMessage'], allowedTools: ['Edit(**)'] });
  // Resolved against an agent, the record names what was the step's own and what it was given under the former names too.
  const resolved = {
    name: 'write', after: [], body: 'Write.', allow: ['Edit(**)'], disallow: ['SendMessage'],
    agent: { name: 'writer', keys: ['allow'], body: '', given: { disallow: 'SendMessage' } },
  } as unknown as Workflow;
  assert.deepEqual(asNamed(resolved), {
    name: 'write', after: [], body: 'Write.', allowedTools: ['Edit(**)'], disallowedTools: ['SendMessage'],
    agent: { name: 'writer', keys: ['allowedTools'], body: '', given: { disallowedTools: 'SendMessage' } },
  });
  // A record that somehow holds both keeps the new name's value: it is the one a newer writer put there.
  const both = { name: 'write', after: [], body: 'Write.', allow: ['Read'], allowedTools: ['Edit(**)'] } as unknown as Workflow;
  assert.deepEqual(asNamed(both), { name: 'write', after: [], body: 'Write.', allowedTools: ['Edit(**)'] });
});

test('`wf start` is told which files still write a former name: the steps, then the agents they name, and nothing of a folder on the new names', () => {
  assert.deepEqual(formerKeysIn('---\nallow: Edit(**)\n# disallow: Bash\n  disallow : SendMessage\n---\nallow: is in the body\n'), ['allow', 'disallow'],
    'read as the parser reads the block: trimmed, comments skipped, the body not read');
  assert.deepEqual(formerKeysIn('no frontmatter\nallow: x\n'), []);
  assert.equal(formerKeyLine('w/write.md', 'allow'),
    "w/write.md: `allow:` is read as `allowedTools:`, Claude Code's name for it, which the key took on 2026-09-23. The former name is still read; rename the line, or save the file from the board, which writes the new name.");
  // The agents are beside the workflow folder (`agentsDir`), as the shipped ones are in `workflows/agents/`.
  const root = folder({
    'team/write.md': '---\nagent: writer\ndisallow: SendMessage\n---\n',
    'team/review.md': '---\nafter: write\n---\nReview.\n',
    'agents/writer.md': '---\nallow: Edit(**)\n---\nWrite.\n',
    'agents/unused.md': '---\nallow: Edit(**)\n---\nNobody names me.\n',
  });
  const dir = path.join(root, 'team');
  assert.doesNotThrow(() => loadWorkflows(dir), 'the folder starts: the former names stop nothing');
  assert.deepEqual(formerKeyLines(dir), [formerKeyLine(path.join(dir, 'write.md'), 'disallow'), formerKeyLine(path.join(root, 'agents', 'writer.md'), 'allow')]);
  assert.deepEqual(formerKeyLines(folder({ 'write.md': '---\nallowedTools: Edit(**)\n---\nWrite.\n' })), []);
  assert.deepEqual(formerKeyLines(path.join(dir, 'nope')), []);
});

test("REFUSED: an effort the step's harness does not take, by name, with the efforts it does", () => {
  assert.throws(() => fm('implement', 'effort: extreme'),
    refusedWith(/^implement: `effort: extreme` is not an effort claude has \(there is no `harness:` line, so the step runs on claude\)\. On claude it is one of: low, medium, high, xhigh, max\. Without the line, the harness uses its own default\.$/));
  assert.throws(() => fm('review', 'harness: codex\neffort: ultra'), refusedWith(/On codex it is one of: none, minimal, low, medium, high, xhigh, max\./));
  assert.throws(() => fm('implement', 'effort: minimal'), refusedWith(/not an effort claude has .*`minimal` is codex's word, and this step does not run on codex/));
  assert.throws(() => fm('implement', 'effort: High'), refusedWith(/not an effort claude has/), 'words are exact');
  assert.equal(fm('review', 'harness: codex\neffort: minimal').effort, 'minimal');
  assert.equal(fm('x', 'harness: claude-detached\neffort: max').effort, 'max');
});

test('an empty check is refused, and so is one that reads as "no check" but runs as a command', () => {
  assert.throws(() => fm('implement', 'check:'), /implement: `check` has no value\. Give the command that must exit 0/);
  assert.throws(() => fm('implement', 'check:   '), /`check` has no value/);
  for (const none of ['none', '""', "''"]) assert.throws(() => fm('implement', `check: ${none}`), /exits 127/, none);
  assert.throws(() => fm('implement', 'model:'), /implement: `model` has no value\. Delete the line/, 'empty is not absent, for any key');
});

test('deadlineSeconds: 5m is refused, with the seconds to write instead', () => {
  assert.throws(() => fm('review', 'deadlineSeconds: 5m'), /review: `deadlineSeconds: 5m` is not a count\. .* with no unit — `deadlineSeconds: 300`\./);
  assert.throws(() => fm('review', 'deadlineSeconds: 2h'), /`deadlineSeconds: 7200`/);
  for (const bad of ['0', '-5', '1.5', '9e2', 'NaN', 'Infinity', 'ninety', '0x10']) {
    assert.throws(() => fm('review', `deadlineSeconds: ${bad}`), /is not a count\. .*above zero/, bad);
  }
});

test('budget: is dollars — a whole amount or one with cents — frozen as a number; absent, the step has no cap', () => {
  assert.equal(fm('implement', 'budget: 5').budget, 5);
  assert.equal(fm('implement', 'budget: 2.50').budget, 2.5);
  assert.equal(fm('implement', 'budget: 0.25').budget, 0.25);
  assert.equal(fm('implement', 'harness: claude-detached\nbudget: 3').budget, 3);
  assert.equal(fm('implement', 'check: npm test').budget, undefined);
});

test('REFUSED: a budget: that is not an amount above zero — 0, a negative, a word, an empty value — each naming the fix', () => {
  const refusedAs = (value: string, pattern: RegExp) =>
    assert.throws(() => fm('implement', `budget:${value ? ` ${value}` : ''}`), (e: Error) => e instanceof WorkflowError && e.exitCode === 2 && pattern.test(e.message), value);
  for (const zero of ['0', '0.00']) refusedAs(zero, /^implement: `budget: 0(\.00)?` is not an amount\. `budget` is the most the step's tries may cost together, in dollars: a number above zero, in digits — for example `budget: 5`, or `budget: 2\.50`\.$/);
  for (const bad of ['-1', '-2.50', 'five', 'lots', '1e3', '.5', '2.', 'Infinity', 'NaN', '5 5']) refusedAs(bad, /is not an amount\. .*a number above zero, in digits — for example `budget: 5`/);
  // The unit is what the author meant, so the refusal writes the amount without it.
  refusedAs('$5', /^implement: `budget: \$5` is not an amount\. .* in digits with no unit — `budget: 5`\.$/);
  refusedAs('2.50 USD', /with no unit — `budget: 2\.50`\.$/);
  refusedAs('', /^implement: `budget` has no value, which reads as no cap to one person and as nothing to spend to another\. Give the most the step's tries may cost together, in dollars — `budget: 5`, or `budget: 2\.50` — or delete the line, and the step has no budget\.$/);
  refusedAs('   ', /`budget` has no value/);
});

test('maxAttempts and retries are whole counts; retries may be 0, which is what absent means', () => {
  for (const bad of ['0', 'two', '1.5', '-1']) {
    assert.throws(() => fm('x', `maxAttempts: ${bad}`), /`maxAttempts: .*` is not a count\. .*above zero/, bad);
  }
  for (const bad of ['-1', '1.5', 'once']) {
    assert.throws(() => fm('x', `retries: ${bad}`), /`retries: .*` is not a count\. .*zero or more/, bad);
  }
  assert.equal(fm('x', 'retries: 0').retries, 0);
  assert.equal(fm('x', 'maxAttempts: 3').maxAttempts, 3);
});

test("harness: banana is refused with the harnesses there are; harness: check is the run's own", () => {
  assert.throws(() => fm('review', 'harness: banana'), /review: `harness: banana` is not a harness a step can run on\. The harnesses are: claude, codex, claude-detached\./);
  assert.throws(() => fm('review', 'harness: check'), /`harness: check` is the run's own harness .*Put the command in `check:`/);
  assert.throws(() => fm('review', 'harness: Codex'), /not a harness a step can run on/, 'names are exact');
  for (const h of ['claude', 'codex', 'claude-detached']) assert.equal(fm('x', `harness: ${h}`).harness, h);
});

test("permissionMode: yolo is refused with the modes of the step's own harness", () => {
  assert.throws(
    () => fm('implement', 'permissionMode: yolo'),
    /implement: `permissionMode: yolo` is not a mode claude has \(there is no `harness:` line, so the step runs on claude\)\. On claude it is one of: acceptEdits, auto, bypassPermissions, default, dontAsk, manual, plan\./,
  );
  assert.throws(() => fm('review', 'harness: codex\npermissionMode: yolo'), /On codex it is one of: read-only, workspace-write, danger-full-access, bypassPermissions\./);
  // Checked against the harness the step runs on, wherever the harness line is — not against every mode anyone has.
  assert.throws(() => fm('review', 'permissionMode: manual\nharness: codex'), /`manual` is claude's word, and this step does not run on claude/);
  assert.throws(() => fm('implement', 'permissionMode: read-only'), /not a mode claude has .*`read-only` is codex's word/);

  assert.equal(fm('review', 'harness: codex\npermissionMode: read-only').permissionMode, 'read-only');
  assert.equal(fm('x', 'harness: claude-detached\npermissionMode: bypassPermissions').permissionMode, 'bypassPermissions');
  assert.equal(fm('x', 'permissionMode: auto').permissionMode, 'auto');
  // The engine's words, which the first copies refused: Claude Code's `manual`, and codex's `bypassPermissions`, its widest sandbox.
  assert.equal(fm('x', 'permissionMode: manual').permissionMode, 'manual');
  assert.equal(fm('review', 'harness: codex\npermissionMode: bypassPermissions').permissionMode, 'bypassPermissions');
});

test('a key set twice is refused rather than last-one-wins', () => {
  assert.throws(() => fm('review', 'harness: claude\nharness: codex'), /review: `harness` is set twice/);
  assert.throws(() => fm('integrate', 'after: docs\nafter: tests'), /`after` is set twice.*`after: a, b`/);
});

test('a frontmatter line that is not `key: value` is refused; blank lines and # comments are not keys', () => {
  assert.throws(() => fm('review', 'afer implement'), /review: `afer implement` is not `key: value`/);
  assert.throws(() => fm('review', ': codex'), /is not `key: value`/);
  const w = fm('review', '# a second opinion\nharness: codex\n\nafter: implement');
  assert.equal(w.harness, 'codex');
  assert.deepEqual(w.after, ['implement']);
});

test('frontmatter that never closes is refused; a file saved on Windows keeps its keys', () => {
  assert.throws(() => parseWorkflow('review', '---\nharness: codex\nafter: implement\nReview it.'), /review: the frontmatter opened on the first line never closes/);
  const crlf = parseWorkflow('review', '\uFEFF---\r\nharness: codex\r\nafter: implement\r\n---\r\nReview it.\r\n');
  assert.equal(crlf.harness, 'codex');
  assert.deepEqual(crlf.after, ['implement']);
  assert.equal(parseWorkflow('x', '---\n---\nbody').body, 'body', 'an empty frontmatter is still frontmatter');
});

// ─── what a step declares, and what it reads ────────────────────────────────

/**
 * A workflow folder: `implement`, then `review` declaring `output: review.schema.json`, then whatever
 * `files` add or replace — by file name, text or a schema object; `null` leaves the file out.
 */
const outputFolder = (files: Record<string, string | object | null> = {}) => {
  const dir = scratch('wf-output-');
  const all: Record<string, string | object | null> = {
    'implement.md': 'implement it\n',
    'review.md': '---\nafter: implement\noutput: review.schema.json\n---\nreview it\n',
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
  assert.deepEqual(steps.map((s) => s.name), ['implement', 'review'], 'a .json beside the steps is not one');
  const review = steps.find((s) => s.name === 'review')!;
  assert.deepEqual(review.output, { file: 'review.schema.json', schema: FINDINGS });
  assert.deepEqual(outputFields(review), ['findings']);
  assert.equal(steps.find((s) => s.name === 'implement')!.output, undefined, 'absent means the step declares nothing');

  // Relative to the workflow folder, not to wherever `wf start` was typed.
  fs.mkdirSync(path.join(dir, 'schemas'));
  fs.renameSync(path.join(dir, 'review.schema.json'), path.join(dir, 'schemas', 'review.json'));
  fs.writeFileSync(path.join(dir, 'review.md'), '---\nafter: implement\noutput: schemas/review.json\n---\nreview it\n');
  assert.deepEqual(loadWorkflows(dir).find((s) => s.name === 'review')!.output?.schema, FINDINGS);
});

test('an `output:` file that is not there is refused at load, with the fix', () => {
  assert.match(refusal({ 'review.schema.json': null }),
    /^review: `output: review\.schema\.json` is not there\. It is a JSON Schema file, relative to the workflow folder — write it beside review\.md/);
  assert.match(refusal({ 'review.schema.json': null, 'review.schema.json.md': 'not the schema\n' }), /is not there/);
  // A step read without its folder has nowhere to read the file from, and does not pretend it has none.
  assert.throws(() => parseWorkflow('review', '---\noutput: review.schema.json\n---\nreview it\n'), /review: `output: review\.schema\.json` names a file beside the step, and this step was read without its folder/);
});

test('REFUSED at load: an `output:` naming a file outside the workflow folder — up and out, or absolute — though the file is there and strict', () => {
  const outside = path.join(scratch('wf-outside-'), 'review.schema.json');
  fs.writeFileSync(outside, JSON.stringify(FINDINGS));
  const naming = (file: string) => ({ 'review.md': `---\nafter: implement\noutput: ${file}\n---\nreview it\n` });
  const fix = 'names a file outside the workflow folder. A schema is part of what the step is judged by, and lives in the folder with it: write it beside review.md and name it from there — `output: review.schema.json` — or delete the line, and the step declares no output.';

  const up = path.relative(outputFolder(), outside);
  assert.match(up, /^\.\.\//, 'a path that climbs out of the folder');
  assert.equal(refusal(naming(up)), `review: \`output: ${up}\` ${fix}`);
  assert.equal(refusal(naming(outside)), `review: \`output: ${outside}\` ${fix}`);
  assert.equal(refusal(naming('schemas/../../review.schema.json')), `review: \`output: schemas/../../review.schema.json\` ${fix}`, 'out, however it is spelled');
  // Read without its folder, it is refused all the same: where the file is, not whether it can be read.
  assert.throws(() => parseWorkflow('review', naming(outside)['review.md']), (e: Error) => e.message === `review: \`output: ${outside}\` ${fix}`);

  // The same file, and a path that only passes through a folder, inside, loads.
  assert.deepEqual(loadWorkflows(outputFolder({ ...naming('schemas/../review.schema.json') })).find((s) => s.name === 'review')!.output?.schema, FINDINGS);
});

test('an output schema that is not strict is refused, and says where', () => {
  const items = FINDINGS.properties.findings.items;
  const withItems = (changed: object) => ({ ...FINDINGS, properties: { findings: { type: 'array', items: { ...items, ...changed } } } });
  const { additionalProperties: _, ...open } = FINDINGS;

  assert.match(refusal({ 'review.schema.json': { ...FINDINGS, required: [] } }),
    /review: `output: review\.schema\.json` is not strict at the top: `findings` is not in `required`\. Codex refuses/);
  assert.match(refusal({ 'review.schema.json': open }), /not strict at the top: `additionalProperties` is not `false`/);
  assert.match(refusal({ 'review.schema.json': { ...FINDINGS, required: ['findings', 'ghost'] } }), /not strict at the top: `required` names `ghost`, which is not a property/);
  assert.match(refusal({ 'review.schema.json': withItems({ required: ['file', 'what'] }) }),
    /not strict at findings\[\]: `line` is not in `required`\. .*required and nullable instead/);
  assert.match(refusal({ 'review.schema.json': withItems({ additionalProperties: true }) }), /not strict at findings\[\]: `additionalProperties` is not `false`/);
  const deep = withItems({ properties: { ...items.properties, fix: { anyOf: [{ type: 'null' }, { type: 'object', properties: { patch: { type: 'string' } } }] } }, required: [...items.required, 'fix'] });
  assert.match(refusal({ 'review.schema.json': deep }), /not strict at findings\[\]\.fix\.anyOf\[1\]: `patch` is not in `required`/);

  // Not a schema of fields at all.
  assert.match(refusal({ 'review.schema.json': '{ "findings": ' }), /`output: review\.schema\.json` is not JSON \(/);
  for (const shape of [[], { type: 'array', items: {} }, { type: 'object', properties: {}, required: [], additionalProperties: false }]) {
    assert.match(refusal({ 'review.schema.json': shape }), /is not a schema of fields\. Give it `"type": "object"` and at least one field/, JSON.stringify(shape));
  }
  // Only `properties` is merged into the closeout: a definition beside them would not reach the harness.
  assert.match(refusal({ 'review.schema.json': { ...FINDINGS, $defs: { finding: items } } }), /sets `\$defs` beside its fields, and only its `properties` are merged/);
});

test('an output schema that names a field every closeout already has is refused', () => {
  for (const field of CLOSEOUT_FIELDS) {
    const schema = { type: 'object', properties: { ...FINDINGS.properties, [field]: { type: 'string' } }, required: ['findings', field], additionalProperties: false };
    assert.match(refusal({ 'review.schema.json': schema }),
      new RegExp(`review: \`output: review\\.schema\\.json\` declares \`${field}\`, which every closeout already has\\. .*\`summary\` goes to the person who decides, never to a step`), field);
  }
});

test('`input:` names steps this one waits on — directly, or through `resume` — and is refused on any other', () => {
  const respond = (keys: string) => ({ 'respond.md': `---\n${keys}\n---\nanswer it\n` });

  assert.deepEqual(loadWorkflows(outputFolder(respond('after: review\ninput: review'))).find((s) => s.name === 'respond')!.input, ['review']);
  assert.deepEqual(loadWorkflows(outputFolder(respond('resume: review\ninput: review'))).find((s) => s.name === 'respond')!.input, ['review'], 'resume implies after');
  assert.deepEqual(fm('integrate', 'after: a, b\ninput: a, b').input, ['a', 'b'], 'a list, like `after`');
  assert.equal(fm('x', 'after: a').input, undefined, 'absent means the step reads nothing');
  // A step handed a resume without the `after` the parser adds is still reading finished work.
  validate([step('implement'), { ...step('review', ['implement']), output: { file: 'r.json', schema: FINDINGS as never } }, { name: 'respond', after: [], resume: 'review', input: ['review'], body: 'x' }]);

  const notAfter = /respond: `input: review`, but respond does not wait on review — a step cannot read the product of work that has not finished\. Add review to `after:`, or delete the line\./;
  assert.match(refusal(respond('after: implement\ninput: review')), notAfter);
  assert.match(refusal(respond('input: review')), notAfter, 'a root reads nothing');
  // Directly: a step two back has finished too, but the key names what this step waits on.
  const implementDeclares = { 'implement.md': '---\noutput: review.schema.json\n---\nimplement it\n' };
  assert.match(refusal({ ...implementDeclares, ...respond('after: review\ninput: implement') }), /respond: `input: implement`, but respond does not wait on implement/);
});

test('`input:` naming no step, or a step that declares no output, is refused — nothing of its closeout would travel', () => {
  const respond = (keys: string) => ({ 'respond.md': `---\n${keys}\n---\nanswer it\n` });
  assert.match(refusal(respond('after: review\ninput: reveiw')), /respond: `input: reveiw` names a step that is not here\. Correct the name, or delete the line\./);
  assert.match(refusal(respond('after: implement\ninput: implement')),
    /respond: `input: implement`, but implement declares no `output:`, so nothing of its closeout travels — its summary goes to the person who decides, never to a step\. Give implement\.md an `output:` schema/);
});

test('an output schema is read strict wherever an object can sit — and one that points elsewhere with `$ref` is refused', () => {
  const loose = { type: 'object', properties: { optional: { type: 'string' } } };
  const around = (product: object) => ({ 'review.schema.json': { type: 'object', properties: { product }, required: ['product'], additionalProperties: false } });

  // The review's case: a definition nested under the field, and a reference to it. The walk read neither,
  // and the schema loaded with a loose object in it.
  assert.match(refusal(around({ $defs: { value: loose }, $ref: '#/properties/product/$defs/value' })),
    /^review: `output: review\.schema\.json` uses `\$ref` at product\. The run checks a schema is strict by reading it, and does not follow references .* Inline what it points at, and delete `\$ref`\./);
  // However strict the target: what is checked must be what the harness is handed, not what a pointer says it is.
  const strict = { ...loose, required: ['optional'], additionalProperties: false };
  for (const ref of ['$ref', '$dynamicRef', '$recursiveRef']) {
    assert.match(refusal(around({ $defs: { value: strict }, [ref]: '#/properties/product/$defs/value' })), new RegExp(`uses \`\\${ref}\` at product\\.`), ref);
  }

  // Every keyword that holds a schema is read.
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
    [{ type: 'object', properties: {}, required: [], additionalProperties: false, patternProperties: { '^x-': loose } }, 'product.patternProperties.^x-'],
    [{ type: 'object', properties: {}, required: [], additionalProperties: false, dependentSchemas: { a: loose } }, 'product.dependentSchemas.a'],
    [{ type: 'object', properties: {}, required: [], additionalProperties: false, dependencies: { a: loose } }, 'product.dependencies.a'],
    [{ type: 'object', properties: {}, required: [], additionalProperties: false, unevaluatedProperties: loose }, 'product.unevaluatedProperties'],
    [{ type: 'object', properties: {}, required: [], additionalProperties: false, propertyNames: loose }, 'product.propertyNames'],
  ];
  for (const [product, at] of under) {
    assert.match(refusal(around(product)), new RegExp(`is not strict at ${at.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: \`optional\` is not in \`required\``), at);
  }
});

// ─── the edge back: `loop:` and `rounds:` ───────────────────────────────────

/** implement → review, declaring `findings` and `again`, with `reviewKeys` beside `after` and `output` — and whatever `files` add or replace. */
const loopFiles = (reviewKeys: string, files: Record<string, string | object | null> = {}) => ({
  'review.md': `---\nafter: implement\noutput: review.schema.json\n${reviewKeys}\n---\nreview it\n`,
  'review.schema.json': LOOPING,
  ...files,
});
/** A step `loop:`-ing back to `target`, declaring `again`, as a folder would load it. */
const looping = (name: string, after: string[], target: string): Workflow => ({ ...step(name, after), loop: target, rounds: DEFAULT_ROUNDS, output: { file: `${name}.json`, schema: LOOPING as never } });

test('`loop:` names the step to run again and `rounds:` counts, 3 unless it says — and a loop is its target, what is between, and itself', () => {
  const steps = loadWorkflows(outputFolder(loopFiles('loop: implement')));
  const review = steps.find((s) => s.name === 'review')!;
  assert.deepEqual([review.loop, review.rounds, DEFAULT_ROUNDS], ['implement', 3, 3]);
  assert.equal(loadWorkflows(outputFolder(loopFiles('loop: implement\nrounds: 1'))).find((s) => s.name === 'review')!.rounds, 1);
  assert.deepEqual([steps[0]!.loop, steps[0]!.rounds], [undefined, undefined], 'a step with no loop counts no rounds');

  // A step between, a step after the loop — not in it — and a second loop that starts where the first ends.
  const chain = [step('implement'), step('test', ['implement']), looping('review', ['test'], 'implement'), step('docs', ['review']), looping('proof', ['docs'], 'docs')];
  validate(chain);
  assert.deepEqual(loopSpan(chain, chain[2]!), ['implement', 'test', 'review']);
  assert.deepEqual(loopSpan(chain, chain[4]!), ['docs', 'proof']);
  assert.deepEqual(loopSpan(chain, chain[1]!), [], 'a step with no loop spans nothing');
});

test('REFUSED at load: `loop:` naming a step that is not an ancestor — one beside it, one after it, itself, one not here, or two', () => {
  const docs = { 'docs.md': '---\nafter: implement\n---\ndocument it\n' };
  assert.match(refusal(loopFiles('loop: docs', docs)),
    /^review: `loop: docs`, but review does not wait on docs, directly or through the steps between — a loop runs again work that finished before this step\. Add docs to `after:`, or name a step review waits on\.$/);
  assert.match(refusal(loopFiles('loop: ship', { 'ship.md': '---\nafter: review\n---\nship it\n' })), /^review: `loop: ship`, but review does not wait on ship/);
  assert.match(refusal(loopFiles('loop: review')), /^review: `loop: review` names this step\. A loop runs an earlier step again/);
  assert.match(refusal(loopFiles('loop: implemnt')), /^review: `loop: implemnt` names a step that is not here\. Correct the name, or delete the line\./);
  assert.match(refusal(loopFiles('loop: implement, docs', docs)), /^review: `loop: implement, docs` names more than one step\./);
});

test('REFUSED at load: a step with `loop:` whose output does not declare `again` as a boolean — or declares nothing', () => {
  const lacks = /^review: `loop: implement` runs implement again when this step's closeout says `again: true`, and `output: review\.schema\.json` does not declare `again`\. Declare it — `"again": \{ "type": "boolean" \}`, listed in `required`/;
  assert.match(refusal(loopFiles('loop: implement', { 'review.schema.json': FINDINGS })), lacks);
  assert.match(refusal({ 'review.md': '---\nafter: implement\nloop: implement\n---\nreview it\n' }),
    /^review: `loop: implement` runs implement again when this step's closeout says `again: true`, and this step declares no `output:`, so its closeout has no `again`\./);
  for (const type of ['string', ['boolean', 'null']]) {
    const schema = { ...LOOPING, properties: { ...LOOPING.properties, again: { type } } };
    assert.match(refusal(loopFiles('loop: implement', { 'review.schema.json': schema })), /declares `again` as .*It is `"type": "boolean"`: true or false, and nothing the run would have to interpret\./, JSON.stringify(type));
  }
});

test("`gate: true` gates a step — its closeout waits for a person — and a step without the line has none; REFUSED at load: `gate: false`, a word that is not `true`, no value, and the line twice", () => {
  assert.equal(fm('plan', 'gate: true').gate, true);
  assert.equal(fm('plan', 'check: npm test').gate, undefined, 'no gate unless it says so');
  const refused = (lines: string, pattern: RegExp) => assert.throws(() => fm('plan', lines), (e: WorkflowError) => e.exitCode === 2 && pattern.test(e.message), lines);
  refused('gate: false', /^plan: `gate: false` is what a step without the line already is\. Delete the line: a step has no gate unless it says `gate: true`, or a run is started with --gate plan\.$/);
  for (const word of ['yes', 'True', 'plan', '1']) {
    refused(`gate: ${word}`, new RegExp(`^plan: \`gate: ${word}\` is not \`true\`\\. \`gate: true\` holds the step's closeout for a person — wf approve — .* start it with --gate plan\\.$`));
  }
  refused('gate:', /^plan: `gate` has no value\. Delete the line rather than leaving it blank/);
  refused('gate: true\ngate: true', /^plan: `gate` is set twice/);
});

test("`workspace: main` runs a step in the repository's own checkout, and a step without the line works where the shape puts it; REFUSED at load: `worktree`, another word, a `check:` beside it, no value, and the line twice", () => {
  assert.equal(fm('ship', 'after: review\nworkspace: main').workspace, 'main');
  assert.equal(fm('implement', 'check: npm test').workspace, undefined, 'a worktree unless it says otherwise');
  const refused = (lines: string, pattern: RegExp) => assert.throws(() => fm('ship', lines), (e: WorkflowError) => e.exitCode === 2 && pattern.test(e.message), lines);
  refused('workspace: worktree', /^ship: `workspace: worktree` is what a step without the line already is: the shape of the workflow says which worktree — its own, or the one it continues\. Delete the line, or write `workspace: main` to run the step in the repository's own checkout\.$/);
  for (const word of ['Main', 'repo', '\/tmp\/x', 'true']) {
    refused(`workspace: ${word}`, new RegExp(`^ship: \`workspace: ${word.replace(/\//g, '/')}\` is not \`main\` or \`folder\`\.`));
  }
  refused('workspace:', /^ship: `workspace` has no value\. Delete the line rather than leaving it blank/);
  refused('workspace: main\nworkspace: main', /^ship: `workspace` is set twice/);
});

test("`workspace: folder` runs a step in a folder the run makes, with a check and a resume as a worktree takes them; REFUSED at load: `Folder`, `folders`, a team only some of whose steps say it", () => {
  assert.equal(fm('write', 'workspace: folder').workspace, 'folder');
  assert.equal(fm('review', 'workspace: folder\ncheck: test -s note.md').workspace, 'folder', 'a check runs in the step\'s folder');
  assert.equal(fm('review', 'workspace: folder\nresume: write').workspace, 'folder', 'and a resumed session works in the folder of the step it continues');
  const refusedWord = (lines: string, pattern: RegExp) => assert.throws(() => fm('write', lines), (e: WorkflowError) => e.exitCode === 2 && pattern.test(e.message), lines);
  for (const word of ['Folder', 'folders', 'dir']) refusedWord(`workspace: ${word}`, new RegExp(`^write: \`workspace: ${word}\` is not \`main\` or \`folder\`\. `));

  const team = (...words: Array<'folder' | 'main' | undefined>): Workflow[] => words.map((workspace, i) =>
    ({ name: `s${i}`, after: i ? [`s${i - 1}`] : [], body: 'x', permissionMode: 'dontAsk', ...(workspace ? { workspace } : {}) }) as Workflow);
  assert.doesNotThrow(() => validate(team('folder', 'folder')), 'every step says it');
  assert.doesNotThrow(() => validate(team(undefined, undefined, 'main')), 'or none does');
  const refused = (steps: Workflow[], pattern: RegExp) => assert.throws(() => validate(steps), (e: WorkflowError) => e.exitCode === 2 && pattern.test(e.message), pattern.source);
  refused(team('folder', undefined),
    /^s0 says `workspace: folder`, and s1 does not — every step of a team says workspace: folder, or none does\. A run works in folders it makes, with no git repository, or on branches of one: it cannot do both\. Add the line to s1, or delete it from s0\.$/);
  refused(team(undefined, 'folder', 'folder'), /^s1, s2 say `workspace: folder`, and s0 does not — every step of a team says workspace: folder, or none does\./);
  refused(team('folder', 'main'), /^s0 says `workspace: folder`, and s1 does not/);

  // And at load, from a folder of files, as a person writes them.
  assert.throws(() => parseFolder([['write', '---\nworkspace: folder\npermissionMode: dontAsk\n---\nWrite.\n'], ['review', '---\nafter: write\n---\nReview.\n']]),
    (e: WorkflowError) => e.exitCode === 2 && /^write says `workspace: folder`, and review does not/.test(e.message));
});

test('REFUSED at load: a background step of a folder team in a permission mode that can stop and ask — including no mode at all, which is the engine\'s `auto`; a job, on claude or claude-detached, and a codex step pass in every mode their harness takes', () => {
  const team = (...modes: Array<string | undefined>): Workflow[] => modes.map((permissionMode, i) =>
    ({ name: `s${i}`, after: i ? [`s${i - 1}`] : [], body: 'x', workspace: 'folder', background: true, ...(permissionMode ? { permissionMode } : {}) }) as Workflow);
  const refused = (steps: Workflow[], pattern: RegExp) => assert.throws(() => validate(steps), (e: WorkflowError) => e.exitCode === 2 && pattern.test(e.message), pattern.source);

  // A background session (`claude --bg`) asks, and nobody is there: measured on Claude Code 2.1.278, where one in `acceptEdits` and one in
  // `auto` each sat on the first call outside their folder with `waitingFor: 'permission prompt'`. The two modes that never ask are
  // `dontAsk`, which denies instead, and `bypassPermissions`, which allows instead.
  assert.doesNotThrow(() => validate(team('dontAsk', 'bypassPermissions')));
  // Every other mode the parser takes is refused, and the step that is in one is named — the second here, so a rule that only ever looked
  // at the first would fail.
  for (const mode of ['default', 'acceptEdits', 'plan', 'manual', 'auto']) {
    refused(team('dontAsk', mode), new RegExp(`^s1: \`workspace: folder\` works in a folder nobody has opened, \`background: true\` runs the step as a background session, and \`permissionMode: ${mode}\` can stop and ask a person to approve something — a read or a write outside the folder can`));
  }
  // The line left off is the same defect: the engine files such a task in `auto`.
  refused(team('dontAsk', undefined), /^s1: `workspace: folder` works in a folder nobody has opened, `background: true` runs the step as a background session, and it sets no `permissionMode:`, so it runs on the engine's default, `auto`, which can stop and ask a person to approve something/);
  // And the fix is named, all three ways.
  refused(team(undefined), /Delete `background: true`, and the step runs as a job, which asks nobody in any mode; or write `permissionMode: dontAsk`, which denies such a call with no prompt and lets the session carry on\. A step in `dontAsk` that must write its own work needs `allowedTools: Edit\(\*\*\)` beside it: `dontAsk` asks nobody, so it allows nothing, not even a write in the step's own folder, and `Edit\(…\)` is the rule every file-editing tool is matched against\.$/);

  // A job waits on nobody in any mode: `claude -p` in `auto`, `dontAsk`, `default` and `acceptEdits`, in folders under `/tmp`, was denied each
  // call it could not make and exited on its own (agent-runtime's open issue 28, M1, 2.1.280). So a claude step without `background: true`
  // passes in every mode — named `false`, or left off — and so does `claude-detached`, which is `claude -p` by another road. And codex:
  // `codex exec` is not interactive, and has one shell fenced by the sandbox its mode names. Judged on Claude's words, a codex folder team
  // in `workspace-write` was once refused and told to write `permissionMode: dontAsk`, which codex does not take.
  const on = (harness: string | undefined, background: boolean | undefined, ...modes: Array<string | undefined>): Workflow[] => modes.map((permissionMode, i) =>
    ({ name: `s${i}`, after: i ? [`s${i - 1}`] : [], body: 'x', workspace: 'folder', ...(harness ? { harness } : {}), ...(background !== undefined ? { background } : {}), ...(permissionMode ? { permissionMode } : {}) }) as Workflow);
  for (const harness of HARNESSES) {
    for (const mode of [...PERMISSION_MODES[harness]!, undefined]) {
      assert.doesNotThrow(() => validate(on(harness, undefined, mode)), `${harness} ${mode ?? 'with no mode'}, a job`);
      if (harness !== 'codex') assert.doesNotThrow(() => validate(on(harness, false, mode)), `${harness} ${mode ?? 'with no mode'}, \`background: false\``);
    }
  }
  assert.doesNotThrow(() => validate(on(undefined, undefined, 'acceptEdits', 'auto', undefined)), 'claude by default, a job');
  assert.doesNotThrow(() => parseFolder([['write', '---\nworkspace: folder\nharness: codex\npermissionMode: workspace-write\n---\nWrite.\n']]), 'as a person writes one');
  assert.doesNotThrow(() => parseFolder([['write', '---\nworkspace: folder\n---\nWrite.\n']]), 'and a claude step that names no mode, which a job runs in `auto`');

  // A team that is not a folder team is not judged on this at all: a git run's steps work in a checkout a person opened, with settings of
  // its own, and every mode has always been theirs to choose — a background session's too.
  assert.doesNotThrow(() => validate([{ name: 'implement', after: [], body: 'x', background: true, permissionMode: 'acceptEdits' } as Workflow]));

  // At load, from files: the same refusal reaches a person writing a folder of markdown.
  assert.throws(() => parseFolder([['write', '---\nworkspace: folder\nbackground: true\npermissionMode: acceptEdits\n---\nWrite.\n']]),
    (e: WorkflowError) => e.exitCode === 2 && /^write: `workspace: folder` works in a folder nobody has opened, `background: true` runs the step as a background session, and `permissionMode: acceptEdits` can/.test(e.message));
});

test('`background: true` runs a claude step as a background session, `background: false` and no line as a job; REFUSED at load: another word, no value, the line twice, any harness but claude, and a `budget:` beside it — in the engine\'s words', () => {
  assert.equal(fm('supervise', 'background: true').background, true);
  assert.equal(fm('supervise', 'harness: claude\nbackground: true').background, true);
  assert.equal(fm('supervise', 'background: false').background, false);
  assert.equal(fm('supervise', '').background, undefined);
  assert.equal(fm('supervise', 'background: false\nbudget: 2').budget, 2, 'a job keeps a cap');
  const refusedWith = (pattern: RegExp) => (e: WorkflowError) => e.exitCode === 2 && pattern.test(e.message);
  assert.throws(() => fm('supervise', 'background: yes'), refusedWith(/^supervise: `background: yes` is not `true` or `false`\./));
  assert.throws(() => fm('supervise', 'background:'), refusedWith(/^supervise: `background: ` is not `true` or `false`\.|^supervise: `background` has no value/));
  assert.throws(() => fm('supervise', 'background: true\nbackground: true'), refusedWith(/background/));
  for (const harness of ['codex', 'claude-detached']) {
    assert.throws(() => fm('supervise', `harness: ${harness}\nbackground: true`),
      refusedWith(new RegExp(`^supervise: \`background: true\` asks for a Claude Code background session \\(\`claude --bg\`\\), and the \`${harness}\` harness has no such mode: .*\\. Run the step on claude — delete \`harness: ${harness}\` — or delete \`background: true\`\\.$`)), harness);
    assert.doesNotThrow(() => fm('supervise', `harness: ${harness}\nbackground: false`), `${harness}: \`background: false\` asks for nothing`);
  }
  assert.throws(() => fm('supervise', 'background: true\nbudget: 2'),
    refusedWith(/^supervise: `budget: 2` is a spend cap, and `background: true` runs the step as a background session: a `claude --bg` session does not keep one: .*\. Delete `background: true` to run the step as a job \(`claude -p`\), which ends its session at the cap, or delete the budget line\.$/));
});

test('`denials: fail` is read on a job of `claude` and `claude-detached`, and a step without the line has none; REFUSED at load: another word, no value, the line twice, on codex, and beside `background: true` — where no denial is ever read', () => {
  assert.equal(fm('review', 'denials: fail').denials, 'fail', 'at shipped defaults: harness claude, a job');
  assert.equal(fm('review', 'harness: claude-detached\ndenials: fail').denials, 'fail');
  assert.equal(fm('review', 'background: false\ndenials: fail').denials, 'fail', 'a job says what it was denied');
  assert.equal(fm('review', '').denials, undefined);
  assert.deepEqual(DENIALS, ['fail']);
  for (const word of ['true', 'stop', 'Fail', 'record']) {
    assert.throws(() => fm('review', `denials: ${word}`),
      refusedWith(new RegExp(`^review: \`denials: ${word}\` is not \`fail\`\. \`denials: fail\` stops the step when the harness denied its try a call — it reads \`denied\` and waits on a person — rather than passing it on; without the line, what was denied is said beside the step and decides nothing\. Write \`denials: fail\`, or delete the line\.$`)), word);
  }
  assert.throws(() => fm('review', 'denials:'), refusedWith(/^review: `denials` has no value|^review: `denials: ` is not `fail`/));
  assert.throws(() => fm('review', 'denials: fail\ndenials: fail'), refusedWith(/^review: `denials` is set twice/));
  assert.throws(() => fm('review', 'harness: codex\ndenials: fail'),
    refusedWith(/^review: `denials: fail` stops the step on a call the harness denied, and `codex exec` records none: .* Run the step on claude — delete `harness: codex` — or delete `denials: fail`\.$/));
  assert.throws(() => fm('supervise', 'background: true\ndenials: fail'),
    refusedWith(/^supervise: `denials: fail` stops the step on a call the harness denied, and `background: true` runs it as a Claude Code background session \(`claude --bg`\), whose denials are not read \(agent-runtime's open issue 28\) — so the line would never stop anything\. Delete `background: true` to run the step as a job \(`claude -p`\), which records each call it was denied, or delete `denials: fail`\.$/));
  // Written back after `allowedTools`, before `background`, and read back as the step.
  const step = fm('review', 'denials: fail\nallowedTools: Edit(**)');
  assert.equal(renderStep(step), ['---', 'allowedTools: Edit(**)', 'denials: fail', '---', 'Do the work.', ''].join('\n'));
  assert.deepEqual(parseWorkflow('review', renderStep(step)), step);
});

test('`allowRuleOf`: the rule a folder\'s `allowedTools:` takes for a call the harness denied — a file edit by any tool as `Edit(…)`, an absolute path from the root, a command by its first word and whatever follows it; any other call as it was denied', () => {
  assert.equal(allowRuleOf('Write(/tmp/w/notes.md)'), 'Edit(//tmp/w/notes.md)');
  assert.equal(allowRuleOf('MultiEdit(/tmp/w/a.ts)'), 'Edit(//tmp/w/a.ts)');
  assert.equal(allowRuleOf('NotebookEdit(/tmp/w/n.ipynb)'), 'Edit(//tmp/w/n.ipynb)');
  assert.equal(allowRuleOf('Edit(src/a.ts)'), 'Edit(src/a.ts)', 'a relative path is the session\'s own directory\'s, as written');
  assert.equal(allowRuleOf('Write(//tmp/x)'), 'Edit(//tmp/x)', 'a path already from the root keeps its two slashes');
  assert.equal(allowRuleOf('Read(/home/me/.ssh/config)'), 'Read(//home/me/.ssh/config)');
  assert.equal(allowRuleOf('Bash(pytest)'), 'Bash(pytest:*)');
  assert.equal(allowRuleOf('Skill(look)'), 'Skill(look)');
  assert.equal(allowRuleOf('SendMessage'), 'SendMessage');
  assert.equal(allowRuleOf('mcp__playwright__browser_click'), 'mcp__playwright__browser_click');
  assert.equal(allowRuleOf('Write(/tmp/a (copy).md)'), 'Edit(//tmp/a (copy).md)', 'a path with brackets in it is the path');
  // Every rule it words for a file edit is one `allowedTools:` takes: `fileRuleRefusal` refuses a path rule on any other file-editing tool.
  for (const denied of ['Write(/tmp/w/notes.md)', 'MultiEdit(src/a.ts)', 'NotebookEdit(n.ipynb)', 'Bash(pytest)']) {
    assert.doesNotThrow(() => fm('review', `allowedTools: ${allowRuleOf(denied)}`), denied);
  }
});

test("`allowRuleOf` of a path this run made: from the step's own directory inside it, and the run's id as `*` outside it — the next run works in directories named by its own id", () => {
  const at = { cwd: '/home/me/.agent-workflows/worktrees/r-7/implement', runId: 'r-7' };
  assert.equal(allowRuleOf('Write(/home/me/.agent-workflows/worktrees/r-7/implement/notes.md)', at), 'Edit(notes.md)');
  assert.equal(allowRuleOf('Write(/home/me/.agent-workflows/worktrees/r-7/implement/docs/a.md)', at), 'Edit(docs/a.md)');
  assert.equal(allowRuleOf('Write(/home/me/.agent-workflows/runs/r-7/artifacts/implement/shot.png)', at), 'Edit(//home/me/.agent-workflows/runs/*/artifacts/implement/shot.png)');
  assert.equal(allowRuleOf('Read(/home/me/.agent-workflows/worktrees/r-7/plan/PLAN.md)', at), 'Read(//home/me/.agent-workflows/worktrees/*/plan/PLAN.md)', "a sibling's worktree");
  assert.equal(allowRuleOf('Write(/home/me/.agent-workflows/worktrees/r-7/implement-2/x)', at), 'Edit(//home/me/.agent-workflows/worktrees/*/implement-2/x)', 'a directory whose name starts as the cwd\'s is not in it');
  assert.equal(allowRuleOf('Write(/tmp/r-70/x)', at), 'Edit(//tmp/r-70/x)', 'a part is the run\'s id whole, or it is kept');
  assert.equal(allowRuleOf('Bash(pytest)', at), 'Bash(pytest:*)');
  for (const denied of ['Write(/home/me/.agent-workflows/worktrees/r-7/implement/notes.md)', 'Write(/home/me/.agent-workflows/runs/r-7/artifacts/implement/shot.png)']) {
    assert.doesNotThrow(() => fm('review', `allowedTools: ${allowRuleOf(denied, at)}`), denied);
  }
});

test("`disallowedBy`: the step's own deny rule that may have denied a call, which no allow rule overrides — and none for a call no rule of it names", () => {
  const at = { cwd: '/w/r-7/implement', runId: 'r-7' };
  assert.equal(disallowedBy('SendMessage', ['Bash(npm run build)', 'SendMessage']), 'SendMessage', 'a bare tool');
  assert.equal(disallowedBy('Bash(npm)', ['Bash(npm run build)']), 'Bash(npm run build)', 'the command\'s first word is all the call keeps');
  assert.equal(disallowedBy('Bash(git)', ['Bash(git push:*)']), 'Bash(git push:*)');
  assert.equal(disallowedBy('Bash(rm)', ['Bash']), 'Bash');
  assert.equal(disallowedBy('Write(/etc/hosts)', ['Edit(//etc/**)']), 'Edit(//etc/**)', 'an `Edit` rule covers every file-editing tool');
  assert.equal(disallowedBy('Write(/w/r-7/implement/secrets/k.pem)', ['Edit(secrets/**)'], at), 'Edit(secrets/**)', 'a relative rule is the session\'s directory\'s');
  assert.equal(disallowedBy('Read(/w/r-7/implement/deep/.env)', ['Read(.env)'], at), 'Read(.env)', 'a name with no slash, at any depth');
  assert.equal(disallowedBy('Read(/w/r-7/implement/a/b.ts)', ['Read(//w/r-7/implement/a)'], at), 'Read(//w/r-7/implement/a)', 'a directory names what is under it');
  assert.equal(disallowedBy('Skill(look)', ['Skill(look)']), 'Skill(look)');
  // Refused: a rule on another tool, another command, another path, another skill; a relative rule with no directory to read it from.
  assert.equal(disallowedBy('Bash(pytest)', ['Bash(npm run build)', 'SendMessage']), undefined);
  assert.equal(disallowedBy('Bash(npm)', ['Read']), undefined);
  assert.equal(disallowedBy('Write(/tmp/x)', ['Edit(//etc/**)']), undefined);
  assert.equal(disallowedBy('Write(/etc/hostsx)', ['Edit(//etc/hosts)']), undefined, 'a path is matched whole');
  assert.equal(disallowedBy('Read(/w/r-7/implement/a.ts)', ['Edit(**)'], at), undefined, 'an `Edit` rule is no `Read` rule');
  assert.equal(disallowedBy('Write(/w/r-7/implement/src/a.ts)', ['Edit(secrets/**)'], at), undefined);
  assert.equal(disallowedBy('Write(/w/r-7/implement/secrets/k.pem)', ['Edit(secrets/**)']), undefined, 'no directory: a relative rule is not read');
  assert.equal(disallowedBy('Write(/home/me/x)', ['Edit(~/x)'], at), undefined, '`~` is nobody\'s here');
  assert.equal(disallowedBy('Skill(look)', ['Skill(shadcn)']), undefined);
  assert.equal(disallowedBy('SendMessage', []), undefined);
});

test("`slot: none` takes a run out of the cap on runs in flight, and a run without the line waits for a slot like any other; REFUSED at load: another word, no value, and the line twice", () => {
  assert.equal(fm('supervise', 'slot: none').slot, 'none');
  assert.equal(fm('implement', 'check: npm test').slot, undefined, 'counted unless it says otherwise');
  const refused = (lines: string, pattern: RegExp) => assert.throws(() => fm('supervise', lines), (e: WorkflowError) => e.exitCode === 2 && pattern.test(e.message), lines);
  for (const word of ['None', 'false', '0', 'off', 'one', 'true']) {
    refused(`slot: ${word}`, new RegExp(`^supervise: \`slot: ${word}\` is not \`none\`\\. \`slot: none\` keeps this step's run out of the cap on runs in flight \\(WF_MAX_RUNS\\), for a workflow of one step that watches the other runs rather than doing a run's work\\. Without the line, the run waits for a slot and holds one, like every other run\\.$`));
  }
  refused('slot:', /^supervise: `slot` has no value\. Delete the line rather than leaving it blank/);
  refused('slot: none\nslot: none', /^supervise: `slot` is set twice/);
});

test("REFUSED at load: `slot: none` on a step of a workflow that has another — a slot is a run's, not a step's, so the work beside it would run outside the cap too", () => {
  const watcher = { name: 'supervise', after: [], body: 'x', slot: 'none' } as Workflow;
  assert.doesNotThrow(() => validate([watcher]), 'a workflow of one step is what takes no slot');
  const refused = (steps: Workflow[], pattern: RegExp) => assert.throws(() => validate(steps), (e: WorkflowError) => e.exitCode === 2 && pattern.test(e.message), pattern.source);
  refused([watcher, { name: 'implement', after: [], body: 'x' }],
    /^supervise: `slot: none` takes this step's whole RUN out of the cap on runs in flight \(WF_MAX_RUNS\), and this workflow has implement beside it — a slot is a run's, not a step's, so implement would run outside the cap too\. A run that takes no slot is one step: a session that watches the other runs\. Delete the line, or give supervise a folder of its own\.$/);
  // Wherever it is written: on the first step of a chain, on the last, or on a step beside another.
  refused([{ name: 'implement', after: [], body: 'x' }, { ...watcher, after: ['implement'] }], /and this workflow has implement beside it/);
  refused([{ ...watcher, slot: 'none' }, { name: 'review', after: ['supervise'], body: 'x' }], /and this workflow has review beside it/);
  refused([watcher, { name: 'implement', after: [], body: 'x' }, { name: 'review', after: ['implement'], body: 'x' }], /this workflow has implement, review beside it/);
});

test("REFUSED at load: a `resume:` on a step that runs in the repository's checkout — its session ran in another directory, and an ending starts cold", () => {
  assert.throws(() => fm('ship', 'workspace: main\nresume: review'), (e: WorkflowError) => e.exitCode === 2 && /^ship: `workspace: main` runs the step in the repository's own checkout, and `resume: review` continues review's session, which ran in the worktree review worked in — the same conversation, in another directory, told none of what this step needs\. A step that ends a run starts cold, where the base branch is, and is told which branch to act on\. Delete one of the two lines\.$/.test(e.message));
  assert.throws(() => fm('ship', 'resume: review\nworkspace: main'), /`workspace: main` runs the step in the repository's own checkout, and `resume: review`/, 'whichever order the two lines are written in');
  // And each key on its own is read as it was: `resume:` implies `after:`, and an ending step waits on what it acts on.
  assert.deepEqual([fm('ship', 'resume: review').resume, fm('ship', 'resume: review').after], ['review', ['review']]);
  assert.equal(fm('ship', 'after: review\nworkspace: main').workspace, 'main');
});

test("REFUSED at load: a `check:` on a step that runs in the repository's checkout — the run would execute it there, on whatever a person has in it", () => {
  assert.throws(() => fm('ship', 'workspace: main\ncheck: npm test'), (e: WorkflowError) => e.exitCode === 2 && /^ship: `workspace: main` runs the step in the repository's own checkout, and `check: npm test` is a command the run executes there after the step hands off — a verdict on whatever is in that checkout by then, not on this step's work\. A step that ends a run runs its check itself, in its prose, and says in its closeout what it found\. Delete one of the two lines\.$/.test(e.message));
  // Whichever order the two lines are written in, and with the check's own refusals still its own.
  assert.throws(() => fm('ship', 'check: npm test\nworkspace: main'), /`workspace: main` runs the step in the repository's own checkout, and `check: npm test`/);
  assert.throws(() => fm('ship', 'workspace: main\ncheck: none'), /`workspace: main` runs the step in the repository's own checkout, and `check: none`/, 'the two together are refused before the check is read on its own');
});

test("`remote: true` bridges a step's sessions to claude.ai, `remote: false` does not, and a step without the line has neither; REFUSED at load: a word that is not `true` or `false`, no value, and the line twice", () => {
  assert.equal(fm('implement', 'remote: true').remote, true);
  assert.equal(fm('implement', 'remote: false').remote, false, 'the author said no, and it is kept');
  assert.equal(fm('implement', 'check: npm test').remote, undefined, 'never a default');
  // Which harness bridges a session is the engine's to say, at `wf start`: the parser reads the word on any.
  assert.equal(fm('review', 'harness: codex\nremote: true').remote, true);
  const refused = (lines: string, pattern: RegExp) => assert.throws(() => fm('implement', lines), (e: WorkflowError) => e.exitCode === 2 && pattern.test(e.message), lines);
  for (const word of ['yes', 'no', 'on', 'True', '1', 'claude']) {
    refused(`remote: ${word}`, new RegExp(`^implement: \`remote: ${word}\` is not \`true\` or \`false\`\. \`remote: true\` bridges every session of the step to claude\.ai, where anyone signed in to the account can drive it from a browser or a phone; \`remote: false\`, or no line, does not\. Write one of the two, or delete the line\.$`));
  }
  refused('remote:', /^implement: `remote` has no value\. Delete the line rather than leaving it blank/);
  refused('remote: true\nremote: false', /^implement: `remote` is set twice/);
});

test('REFUSED at load: `rounds:` on a step with no `loop:`, and rounds that are not a count above zero', () => {
  assert.match(refusal({ 'review.md': '---\nafter: implement\nrounds: 2\n---\nreview it\n' }),
    /^review: `rounds: 2` counts the rounds of a loop, and this step has no `loop:`\. Add `loop: <step>`.*that is `retries:`\./);
  for (const bad of ['0', 'three', '-1', '2.5']) {
    assert.match(refusal(loopFiles(`loop: implement\nrounds: ${bad}`)), /`rounds: .*` is not a count\. `rounds` is how many rounds `loop:` may run, the first included: a whole number above zero/, bad);
  }
});

test('REFUSED at load: a loop a round could not file again as it was — a step in it that forks, merges or resumes, a step in two loops, a target that declares `replies`', () => {
  // implement → review (loop: implement), and docs beside review: review forks a worktree cut once, off round 1.
  assert.match(refusal(loopFiles('loop: implement', { 'docs.md': '---\nafter: implement\n---\ndocument it\n' })),
    /^review: `loop: implement` files review again after implement each round, in the workspace implement works in, and review does not work there: docs waits on implement too, so review forks a worktree of its own, cut once, which would not have the next round's work\. A loop's steps are a chain/);
  // Read in the workflow's order, so review's merge is found before test's fork beside it.
  assert.throws(() => validate([step('implement'), looping('review', ['implement', 'test'], 'implement'), step('test', ['implement'])]),
    /review does not work there: it waits on implement and test, so it merges their branches into a worktree of its own/);
  assert.throws(() => validate([step('implement'), { ...step('test', ['implement']), resume: 'implement' }, looping('review', ['test'], 'implement')]),
    /test: `resume: implement`, and test is in review's loop \(`loop: implement`\), which files it as a new session each round/);
  assert.throws(() => validate([step('implement'), { ...looping('review', [], 'implement'), resume: 'implement', after: ['implement'] }]),
    /review: `resume: implement`, and review is in review's loop/, 'the looping step is a new session each round, too');
  assert.throws(() => validate([step('a'), looping('b', ['a'], 'a'), looping('c', ['b'], 'b')]),
    /b is in two loops: b's \(`loop: a`\) and c's \(`loop: b`\)\. A round of either would file it again under the other/);
  const replies = { type: 'object', properties: { replies: { type: 'string' } }, required: ['replies'], additionalProperties: false };
  assert.match(refusal(loopFiles('loop: implement', { 'implement.md': '---\noutput: implement.schema.json\n---\nimplement it\n', 'implement.schema.json': replies })),
    /^implement: `output: implement\.schema\.json` declares `replies`, and review loops back to implement \(`loop: implement`\), so the run adds `replies` to its closeout: its answer to each finding\. Rename the field\./);
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
  assert.equal(workflowFolder('dev', plans, repo), path.join(plans, 'dev'), "the folder where it is written, before the repository's of that name");
});

test('REFUSED at shipped defaults: `workflowFolder` on a name the repository does not have, a path that is not there, a path that is not read as a name, and a file — naming where it looked, and the workflows there are', () => {
  const { repo, workflows } = withWorkflows();
  const plans = path.join(repo, 'plans');
  fs.mkdirSync(plans);
  const refused = (message: string) => (err: Error & { exitCode?: number }) => err.exitCode === 2 && err.message === message;
  const theirs = "The repository's workflows are: dev, ui — name one, or give the path to a workflow folder.";
  assert.throws(() => workflowFolder('deb', repo, repo), refused(`no workflow folder at ${path.join(repo, 'deb')}, nor a workflow named deb in ${workflows}. ${theirs}`));
  assert.throws(() => workflowFolder('./workflows/deb', repo, repo), refused(`no workflow folder at ${path.join(workflows, 'deb')}. ${theirs}`));
  // From the plan folder, `workflows/dev` is a path that is not there, and never the repository's dev.
  assert.throws(() => workflowFolder('workflows/dev', plans, repo), refused(`no workflow folder at ${path.join(plans, 'workflows', 'dev')}. ${theirs}`));
  fs.writeFileSync(path.join(repo, 'brief.md'), 'a brief\n');
  assert.throws(() => workflowFolder('brief.md', repo, repo), refused(`no workflow folder at ${path.join(repo, 'brief.md')}, nor a workflow named brief.md in ${workflows}. ${theirs}`));
  const bare = scratch('wf-bare-');
  assert.throws(() => workflowFolder('dev', bare, bare),
    refused(`no workflow folder at ${path.join(bare, 'dev')}, nor a workflow named dev in ${path.join(bare, 'workflows')}. Give the path to a workflow folder, or the name of a folder of steps under ${path.join(bare, 'workflows')}.`));
});

/** A folder's own files, for `parseWorkflow`'s `read`, as `loadWorkflows` reads them. */
const readIn = (dir: string) => (file: string): string | undefined => {
  try { return fs.readFileSync(path.resolve(dir, file), 'utf8'); } catch { return undefined; }
};

/** Every workflow folder this repository ships: its `workflows/`, this package's own and its `ui`, and the examples. */
const shippedFolders = (): string[] => {
  const root = path.join(import.meta.dirname, '..', '..', '..', 'workflows');
  const pkg = path.join(import.meta.dirname, '..');
  const examples = path.join(pkg, 'wf-examples');
  return [
    ...fs.readdirSync(root).filter((name) => name !== 'agents').map((name) => path.join(root, name)),
    path.join(pkg, 'workflows'),
    path.join(pkg, 'workflows', 'ui'),
    ...fs.readdirSync(examples).map((name) => path.join(examples, name)),
  ].filter((dir) => fs.statSync(dir).isDirectory());
};

test("every agent step of the shipped workflows runs on a 200k window — the workflows of work, the package's own ui copy, and the supervisor", () => {
  // Measured before it was set (agent-runtime open issue 26): a `--bg` session compacts at its window, carries on and signs off. The
  // supervisor's session never ends and grows on every answer, which makes it the one a cap is for.
  const root = path.join(import.meta.dirname, '..', '..', '..', 'workflows');
  const folders = ['dev', 'dev-build', 'dev-planned', 'dev-planned-build', 'ui', 'supervisor'].map((name) => path.join(root, name));
  folders.push(path.join(import.meta.dirname, '..', 'workflows', 'ui'));
  for (const dir of folders) {
    for (const step of loadWorkflows(dir)) assert.equal(step.context, 200_000, `${path.relative(root, dir)}/${step.name}.md`);
  }
});

test('`renderStep` is the parser run backwards: every step of every shipped folder, loaded, rendered and parsed again, is the step it was — and the folder rendered is the folder', () => {
  const folders = shippedFolders();
  const root = path.join(import.meta.dirname, '..', '..', '..', 'workflows');
  for (const name of ['dev', 'dev-build', 'dev-planned', 'dev-planned-build', 'ui']) assert.ok(folders.includes(path.join(root, name)), `${name} is among them`);
  assert.ok(folders.includes(path.join(import.meta.dirname, '..', 'workflows')), "and the package's own");
  for (const dir of folders) {
    const steps = loadWorkflows(dir);
    const read = readIn(dir);
    const agents = loadAgents(agentsDir(dir));
    for (const step of steps) {
      const text = renderStep(step);
      assert.deepEqual(parseWorkflow(step.name, text, read, agents), step, `${path.relative(root, dir)}/${step.name}.md, rendered:\n${text}`);
      assert.equal(renderStep(parseWorkflow(step.name, text, read, agents)), text, 'and renders to the same text again');
    }
    assert.deepEqual(parseFolder(steps.map((step) => [step.name, renderStep(step)]), read, agents), steps, dir);
  }
  // What a render of a shipped step looks like: the keys it sets in the keys' order, no comments, then its own note — none. The keys
  // its agent gives it are the agent's file's, and are not written into the step's.
  const review = loadWorkflows(path.join(root, 'dev')).find((s) => s.name === 'review')!;
  assert.equal(renderStep(review), ['---', 'after: implement', 'agent: reviewer', 'budget: 20', 'loop: implement', 'rounds: 3', '---', '', ''].join('\n'));
  assert.equal(review.model, 'opus', "and the step runs with the agent's keys all the same");
  assert.doesNotMatch(renderStep(review).split('\n---\n')[0]!, /^#/m, 'the file has comments in its frontmatter, and the step does not carry them');
  assert.match(fs.readFileSync(path.join(root, 'dev', 'review.md'), 'utf8'), /^# /m);
});

test('`renderStep` of a step that sets every key: one line a key, in `STEP_KEYS` order, each as the parser reads it — and it reads back as the step', () => {
  const read = (file: string) => (file === 'review.schema.json' ? JSON.stringify(LOOPING) : undefined);
  // Every key but `workspace:`, which the parser refuses beside a `check:`, and `slot:`, which is a workflow of one step's: both render below.
  // `agent:` renders in test/agents.test.ts, which has agents to resolve it with, and `background:`, which keeps no `budget:`, below.
  const values: Record<Exclude<StepKey, 'workspace' | 'slot' | 'agent' | 'background'>, string> = {
    after: 'implement', resume: 'implement', input: 'implement', harness: 'claude-detached', model: 'opus', effort: 'xhigh', context: '200000', permissionMode: 'dontAsk',
    tools: 'Read, Grep,Glob , Bash', disallowedTools: 'Bash(npm run build), SendMessage', allowedTools: 'Edit(**),Bash(npm test)', denials: 'fail', remote: 'true', deadlineSeconds: '900', maxAttempts: '2', budget: '2.50',
    check: 'npm test && node -e "console.log(1 ? 2 : 3)"', retries: '0', gate: 'true', output: 'review.schema.json', loop: 'implement', rounds: '2',
  };
  const step = parseWorkflow('review', `---\n${Object.entries(values).reverse().map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n\nDo the work.\n\nAll of it.\n\n`, read);
  for (const key of STEP_KEYS) if (key !== 'workspace' && key !== 'slot' && key !== 'agent' && key !== 'background') assert.notEqual(step[key], undefined, key);
  const text = renderStep(step);
  assert.equal(text, [
    '---',
    'after: implement',
    'resume: implement',
    'input: implement',
    'harness: claude-detached',
    'model: opus',
    'effort: xhigh',
    'context: 200k',
    'permissionMode: dontAsk',
    'tools: Read, Grep, Glob, Bash',
    'disallowedTools: Bash(npm run build), SendMessage',
    'allowedTools: Edit(**), Bash(npm test)',
    'denials: fail',
    'remote: true',
    'deadlineSeconds: 900',
    'maxAttempts: 2',
    'budget: 2.5',
    'check: npm test && node -e "console.log(1 ? 2 : 3)"',
    'retries: 0',
    'gate: true',
    'output: review.schema.json',
    'loop: implement',
    'rounds: 2',
    '---',
    'Do the work.',
    '',
    'All of it.',
    '',
  ].join('\n'));
  assert.deepEqual(parseWorkflow('review', text, read), step);
  // `remote: false` is a setting the parser reads, and is written; `retries: 0` too.
  assert.match(renderStep({ ...step, remote: false }), /^remote: false$/m);

  // And `workspace: main`, which no step sets beside a `check:`: after `input`, before `harness`, and read back as the step.
  const ending = parseWorkflow('ship', '---\nafter: review\ngate: true\nworkspace: main\nharness: claude\n---\nShip it.\n');
  const rendered = renderStep(ending);
  assert.equal(rendered, ['---', 'after: review', 'workspace: main', 'harness: claude', 'gate: true', '---', 'Ship it.', ''].join('\n'));
  assert.deepEqual(parseWorkflow('ship', rendered), ending);

  // And `slot: none`, which only a workflow of one step sets: after `workspace`, before `harness`.
  const watching = parseWorkflow('supervise', '---\nharness: claude\nslot: none\nworkspace: main\n---\nWatch the runs.\n');
  const watched = renderStep(watching);
  assert.equal(watched, ['---', 'workspace: main', 'slot: none', 'harness: claude', '---', 'Watch the runs.', ''].join('\n'));
  assert.deepEqual(parseWorkflow('supervise', watched), watching);

  // And `background: true`, which keeps no `budget:`: after `allowedTools`, before `remote`; `background: false` is written too.
  const session = parseWorkflow('supervise', '---\nremote: true\nbackground: true\nallowedTools: Read\n---\nWatch the runs.\n');
  const kept = renderStep(session);
  assert.equal(kept, ['---', 'allowedTools: Read', 'background: true', 'remote: true', '---', 'Watch the runs.', ''].join('\n'));
  assert.deepEqual(parseWorkflow('supervise', kept), session);
  assert.match(renderStep({ ...session, background: false }), /^background: false$/m);
});

test('`renderStep` writes only what a step sets: `undefined`, `null` and an empty list of `after`, `input`, `disallowedTools` or `allowedTools` are no line — and a step that sets nothing is its body', () => {
  const bare: StepDraft = { name: 'implement', after: [], body: 'Implement it.' };
  assert.equal(renderStep(bare), 'Implement it.\n');
  assert.equal(renderStep({ ...bare, harness: undefined, input: [], disallowedTools: [], allowedTools: [], model: null } as unknown as StepDraft), 'Implement it.\n', 'as the board lists a step: null and [] for what it does not set');
  assert.deepEqual(parseWorkflow('implement', renderStep(bare)), { ...parseWorkflow('implement', 'Implement it.') }, 'and reads back as the step');

  // A draft names its `output:` by file, and the schema is read from the folder; a loop's rounds are the default when it sets none.
  const draft: StepDraft = { name: 'review', after: ['implement'], body: 'Review it.', output: { file: 'review.schema.json' }, loop: 'implement' };
  const text = renderStep(draft);
  assert.equal(text, '---\nafter: implement\noutput: review.schema.json\nloop: implement\n---\nReview it.\n');
  const read = (file: string) => (file === 'review.schema.json' ? JSON.stringify(LOOPING) : undefined);
  assert.deepEqual([parseWorkflow('review', text, read).output?.schema, parseWorkflow('review', text, read).rounds], [LOOPING, DEFAULT_ROUNDS]);

  // A body that opens on `---` keeps an empty frontmatter before it, or it would be read as one.
  const rule: StepDraft = { name: 'implement', after: [], body: '---\nThe brief, below a rule.' };
  assert.equal(renderStep(rule), '---\n\n---\n---\nThe brief, below a rule.\n');
  assert.throws(() => parseWorkflow('implement', '---\n---\n---\nThe brief, below a rule.\n'), /`---` is not `key: value`/, 'an empty block would not do');
  assert.equal(parseWorkflow('implement', renderStep({ ...rule, model: 'opus' })).body, '---\nThe brief, below a rule.', 'nor is one needed after keys');
  assert.equal(parseWorkflow('implement', renderStep(rule)).body, '---\nThe brief, below a rule.');
});

test("REFUSED by `renderStep`, in the parser's words where the parser has them: a key no step has, `guide`; and what a file cannot hold — a line break in a value, a comma in a step's name in a list", () => {
  const step: StepDraft = { name: 'review', after: ['implement'], body: 'Review it.' };
  const parsersWords = (lines: string): string => {
    try { fm('review', lines); } catch (e) { return (e as Error).message; }
    return assert.fail(`${lines} parsed`);
  };
  const refused = (draft: object) => (e: unknown) => e instanceof WorkflowError && e.exitCode === 2 && e.message === message(draft);
  const message = (draft: object): string => {
    try { renderStep(draft as StepDraft); } catch (e) { return (e as Error).message; }
    return assert.fail(`${JSON.stringify(draft)} rendered`);
  };

  assert.equal(message({ ...step, afer: ['implement'] }), parsersWords('afer: implement'), 'a key no step has: the parser\'s sentence');
  assert.match(message({ ...step, afer: ['implement'] }), /^review: `afer` is not a key a step has\. A step's keys are: after, /);
  assert.equal(message({ ...step, guide: 'CLAUDE.md' }), parsersWords('guide: CLAUDE.md'));
  assert.throws(() => renderStep({ ...step, colour: 'red' } as StepDraft), refused({ ...step, colour: 'red' }));
  assert.doesNotThrow(() => renderStep({ ...step, colour: undefined, shade: null } as unknown as StepDraft), 'a key set to nothing is not set');

  // Written as given, the break would end the line, and what follows would be a key of its own: a harness nobody chose.
  const injected = { ...step, check: 'npm test\nharness: codex' };
  assert.equal(message(injected), "review: `check` holds a line break, and a frontmatter line is one key and its value: what follows the break would be read as a line of its own. Write it on one line — commands joined with `&&`.");
  assert.match(message({ ...step, model: 'opus\r' }), /^review: `model` holds a line break/);
  assert.match(message({ ...step, tools: ['Read', 'Grep\nBash'] }), /^review: `tools` holds a line break/);

  assert.equal(message({ ...step, after: ['implement, docs'] }),
    "review: `after` lists `implement, docs`, and a list is split on every comma, so it would be read as `implement`, `docs`. A step's name has no comma: give each step an entry of its own.");
  assert.match(message({ ...step, input: ['a,b'] }), /^review: `input` lists `a,b`/);

  // What the parser judges, renderStep writes as given, for the parser to refuse.
  for (const [draft, lines] of [
    [{ ...step, tools: [] }, 'tools: '],
    [{ ...step, model: '' }, 'model: '],
    [{ ...step, deadlineSeconds: '5m' }, 'deadlineSeconds: 5m'],
    [{ ...step, gate: false }, 'gate: false'],
    [{ ...step, harness: 'banana' }, 'harness: banana'],
    [{ ...step, disallowedTools: ['Bash(git push, git reset)'] }, 'disallowedTools: Bash(git push, git reset)'],
    [{ ...step, output: {} }, 'output: '],
  ] as const) {
    const text = renderStep(draft as unknown as StepDraft);
    assert.ok(text.includes(`\n${lines}\n`), text);
    assert.throws(() => parseWorkflow('review', text), WorkflowError, lines);
  }
});

test("`stepNameRefusal`: a step's name is its file's in the folder — REFUSED: none, a slash, a control character, a dot first, spaces around, a comma, its .md, the README's, too long", () => {
  for (const name of ['implement', 'review-2', 'plan review', 'a.b', 'étape']) assert.equal(stepNameRefusal(name), undefined, name);
  const fix = 'Name it as its file is named, without .md — implement, say.';
  const cases: Array<[unknown, string]> = [
    ['', `A step has no name, and a step is named by its file in the workflow's folder. ${fix}`],
    ['  ', `A step has no name, and a step is named by its file in the workflow's folder. ${fix}`],
    [undefined, `A step has no name, and a step is named by its file in the workflow's folder. ${fix}`],
    ['../review', `\`../review\` is not a step's name: a step is a file in its workflow's folder, and a slash names a file in another. ${fix}`],
    ['ui\\review', `\`ui\\review\` is not a step's name: a step is a file in its workflow's folder, and a slash names a file in another. ${fix}`],
    ['review\nharness: codex', `\`review\nharness: codex\` is not a step's name: it holds a control character — "review\\nharness: codex" — which a line of frontmatter cannot. ${fix}`],
    ['..', `\`..\` is not a step's name: a name that starts with a dot is a hidden file, which a person listing the folder does not see. ${fix}`],
    ['.review', `\`.review\` is not a step's name: a name that starts with a dot is a hidden file, which a person listing the folder does not see. ${fix}`],
    [' review', "` review` is not a step's name: `after:` trims every name it lists, so no step could wait on it. Write it without the spaces around it."],
    ['plan,review', `\`plan,review\` is not a step's name: \`after:\` and \`input:\` split on every comma, so no step could wait on it. ${fix}`],
    ['review.md', "`review.md` is not a step's name: it is a file's name, and a step is named without its .md: `review`."],
    ['README', `\`README\` is not a step's name: README.md is the folder's README, which says what the workflow is for and is never read as a step. ${fix}`],
    ['readme', `\`readme\` is not a step's name: readme.md is the folder's README, which says what the workflow is for and is never read as a step. ${fix}`],
    ['r'.repeat(253), `\`${'r'.repeat(253)}\` is not a step's name: ${'r'.repeat(253)}.md is longer than a file's name may be, 255 bytes. ${fix}`],
  ];
  for (const [name, why] of cases) assert.equal(stepNameRefusal(name), why, JSON.stringify(name));
  assert.equal(stepNameRefusal('r'.repeat(252)), undefined, '252 and .md is 255');
});

test('`parseFolder` reads steps from their text as `loadWorkflows` reads a folder: in the order of their files, validated, in the order they run — refused in the same words', () => {
  // `a-b.md` sorts before `a.md`, though `a` sorts before `a-b`: the files' order breaks the tie, as a folder lists them.
  const files: Array<[string, string]> = [['a', 'first\n'], ['a-b', 'second\n'], ['c', '---\nafter: a\n---\nthird\n']];
  const dir = folder(Object.fromEntries(files.map(([name, text]) => [`${name}.md`, text])));
  assert.deepEqual(loadWorkflows(dir).map((s) => s.name), ['a-b', 'a', 'c']);
  assert.deepEqual(parseFolder(files), loadWorkflows(dir));
  assert.deepEqual(parseFolder([...files].reverse()), loadWorkflows(dir), 'whatever order they are given in');

  const cycle: Array<[string, string]> = [['a', '---\nafter: b\n---\nx\n'], ['b', '---\nafter: a\n---\ny\n']];
  const words = folderRefusal(folder(Object.fromEntries(cycle.map(([name, text]) => [`${name}.md`, text])))).message;
  assert.equal(words, 'these steps wait on each other: a, b');
  assert.throws(() => parseFolder(cycle), (e: Error) => e instanceof WorkflowError && e.message === words);
});
