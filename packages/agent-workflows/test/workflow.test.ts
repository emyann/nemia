/**
 * The format, and the two ways a folder of markdown is not a workflow.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fansOut, loadWorkflows, terminalSteps, parseWorkflow, validate, WorkflowError, type Workflow } from '../src/workflow.ts';
import { CLOSEOUT_FIELDS, DEFAULT_ROUNDS, loopSpan, outputFields, STEP_KEYS, type StepKey } from '../src/workflow.ts';

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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-'));
  assert.throws(() => loadWorkflows(dir), /no \.md steps/);
  assert.throws(() => loadWorkflows(path.join(dir, 'nope')), /no workflow folder/);
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
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-shipped-'));
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
  const values: Record<StepKey, string> = {
    after: 'implement', resume: 'implement', input: 'implement', harness: 'claude-detached', model: 'opus', effort: 'xhigh', permissionMode: 'dontAsk',
    tools: 'Read, Grep, Glob, Bash', deadlineSeconds: '900', maxAttempts: '2', check: 'npm test && npm run typecheck', retries: '1', output: 'review.schema.json',
    loop: 'implement', rounds: '2',
  };
  const text = `---\n${Object.entries(values).map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\nDo the work.\n`;
  const w = parseWorkflow('review', text, (file) => (file === 'review.schema.json' ? JSON.stringify(LOOPING) : undefined));
  for (const key of STEP_KEYS) assert.notEqual(w[key], undefined, `${key} is on the list and never read`);
  assert.equal(w.deadlineSeconds, 900);
  assert.equal(w.retries, 1);
  assert.deepEqual(w.input, ['implement']);
  assert.deepEqual(w.output, { file: 'review.schema.json', schema: LOOPING });
  assert.deepEqual([w.loop, w.rounds], ['implement', 2]);
  assert.deepEqual([w.effort, w.tools], ['xhigh', ['Read', 'Grep', 'Glob', 'Bash']]);
});

test('a key a step does not have is refused by name, with the keys it does have', () => {
  const list = "A step's keys are: after, resume, input, harness, model, effort, permissionMode, tools, deadlineSeconds, maxAttempts, check, retries, output, loop, rounds.";
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-'));
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-output-'));
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
    /^implement: `output: implement\.schema\.json` declares `replies`, and review loops back to implement \(`loop: implement`\), so from round 2 the run adds `replies` to its closeout/);
});
