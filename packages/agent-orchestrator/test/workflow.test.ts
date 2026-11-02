/**
 * The format read from a folder on disk: an empty or missing folder, a README, a folder of workflows, the shipped examples, every key
 * read, the keys' meanings, a step's `output:` schema file, `workflowFolder`'s lookup, the former lines `nemia start` is told of, a
 * skill's `rules.json`, the round trip of every folder there is, and the words a person reads. A step file's own keys, the list
 * entries, the former names and `renderStep` are tables beside the parser (`src/workflow/step-file.test.ts`); the structure of a
 * workflow is `src/workflow/validate.test.ts`; a step's name and `parseFolder`, `src/folder/folder.test.ts`.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fansOut, parseWorkflow, WorkflowError } from '../src/workflow.ts';
import { loadWorkflows, workflowDescription, workflowFolder, workflowReadme } from '../src/folder/folder.store.ts';
import { CLOSEOUT_FIELDS, outputFields, STEP_KEY_MEANINGS, STEP_KEYS, type StepKey } from '../src/workflow.ts';
import { agentsDir, parseFolder, renderStep, type StepDraft } from '../src/workflow.ts';
import { skillsFor } from '../src/skills/read.store.ts';
import { loadAgents } from '../src/agents/read.store.ts';
import {
  autoDropped,
  cardRetired,
  codexModeLine,
  codexModeWritten,
  formerKeyLine,
  formerKeysIn,
  harnessPromptLine,
  parseAgent,
} from '../src/workflow.ts';
import { formerKeyLines } from '../src/folder/folder.store.ts';
import { Schema } from 'effect';
import { WorkflowDir } from '../src/folder/folder.model.ts';
import { baseLine, formerFenceLine, formerFormLine, placeLine } from '../src/former/former.ts';
import { scratch } from './scratch.ts';
import { placesOf, shippedFolders, TEAM_DEV, teamCopy } from './team.ts';

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
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), typeof content === 'string' ? content : JSON.stringify(content, null, 2));
  }
  return dir;
};

/** A row of a table read from disk: what it does, and, for a refusal, the text its message opens on and what else it names. */
type Row = { row: string; run: () => unknown; naming?: [at: string, ...named: string[]] };

/** Each row of `rows` as a subtest of `t`: a refusal read as a `WorkflowError` with exit 2 naming what it says; any other, run. */
async function table(t: TestContext, rows: readonly Row[]): Promise<void> {
  for (const { row, run, naming } of rows)
    await t.test(row, () => {
      if (!naming) return void run();
      assert.throws(run, refusedNaming(...naming));
    });
}

/** A row refusing `outputFolder(files)` at load, naming each of `named` after `review: `. */
const atLoad = (row: string, files: Record<string, string | object | null>, ...named: string[]): Row => ({
  row: `REFUSED: ${row}`,
  run: () => loadWorkflows(outputFolder(files)),
  naming: ['review: ', ...named],
});

test('`output:` schema files are read at load, beside the steps: the file as the step names it, strict, inside the folder', async (t) => {
  const items = FINDINGS.properties.findings.items;
  const withItems = (changed: object) => ({ ...FINDINGS, properties: { findings: { type: 'array', items: { ...items, ...changed } } } });
  const { additionalProperties: _, ...open } = FINDINGS;
  const outside = path.join(scratch('wf-outside-'), 'review.schema.json');
  fs.writeFileSync(outside, JSON.stringify(FINDINGS));
  const naming = (file: string) => ({ 'review.md': `---\nafter: implement\nplace: git\noutput: ${file}\n---\nreview it\n` });
  const up = path.relative(outputFolder(), outside);
  const loose = { type: 'object', properties: { optional: { type: 'string' } } };
  const around = (product: object) => ({
    'review.schema.json': { type: 'object', properties: { product }, required: ['product'], additionalProperties: false },
  });
  const closed = { type: 'object', properties: {}, required: [], additionalProperties: false };
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
    [{ ...closed, patternProperties: { '^x-': loose } }, 'product.patternProperties.^x-'],
    [{ ...closed, dependentSchemas: { a: loose } }, 'product.dependentSchemas.a'],
    [{ ...closed, dependencies: { a: loose } }, 'product.dependencies.a'],
    [{ ...closed, unevaluatedProperties: loose }, 'product.unevaluatedProperties'],
    [{ ...closed, propertyNames: loose }, 'product.propertyNames'],
  ];
  await table(t, [
    {
      row: 'the file and the schema it held, and a .json beside the steps is no step',
      run: () => {
        const steps = loadWorkflows(outputFolder());
        assert.deepEqual(
          steps.map((s) => s.name),
          ['implement', 'review'],
        );
        assert.deepEqual(steps[1].output, { file: 'review.schema.json', schema: FINDINGS });
        assert.deepEqual(outputFields(steps[1]), ['findings']);
        assert.equal(steps[0].output, undefined, 'absent means the step declares nothing');
      },
    },
    {
      row: 'a path relative to the workflow folder',
      run: () => {
        const dir = outputFolder({ 'review.schema.json': null, 'schemas/review.json': FINDINGS, ...naming('schemas/review.json') });
        assert.deepEqual(loadWorkflows(dir)[1].output?.schema, FINDINGS);
      },
    },
    {
      row: 'a path that only passes through a folder, inside',
      run: () => assert.deepEqual(loadWorkflows(outputFolder(naming('schemas/../review.schema.json')))[1].output?.schema, FINDINGS),
    },
    atLoad(
      'a file that is not there',
      { 'review.schema.json': null },
      '`output: review.schema.json` is not there',
      'JSON Schema',
      'beside review.md',
    ),
    atLoad(
      'a file that is not there, though a step of its name is',
      { 'review.schema.json': null, 'review.schema.json.md': '---\nplace: git\n---\nnot the schema\n' },
      'is not there',
    ),
    {
      row: 'REFUSED: a step read without its folder',
      run: () => parseWorkflow('review', '---\nplace: git\noutput: review.schema.json\n---\nreview it\n'),
      naming: ['review: ', '`output: review.schema.json`', 'without its folder'],
    },
    atLoad('a path that climbs out', naming(up), `\`output: ${up}\``, 'outside the workflow folder', '`output: review.schema.json`'),
    atLoad('an absolute path', naming(outside), `\`output: ${outside}\``, 'outside the workflow folder'),
    atLoad('out, however spelled', naming('schemas/../../review.schema.json'), 'outside the workflow folder'),
    {
      row: 'REFUSED: outside, read without its folder',
      run: () => parseWorkflow('review', naming(outside)['review.md']),
      naming: ['review: ', 'outside the workflow folder'],
    },
    atLoad(
      'not strict: required empty',
      { 'review.schema.json': { ...FINDINGS, required: [] } },
      'not strict at the top',
      '`findings`',
      '`required`',
    ),
    atLoad('not strict: open', { 'review.schema.json': open }, 'not strict at the top', '`additionalProperties`', '`false`'),
    atLoad(
      'not strict: required names a ghost',
      { 'review.schema.json': { ...FINDINGS, required: ['findings', 'ghost'] } },
      '`required` names `ghost`',
    ),
    atLoad(
      'not strict: an item field not required',
      { 'review.schema.json': withItems({ required: ['file', 'what'] }) },
      'not strict at findings[]: `line` is not in `required`',
      'nullable',
    ),
    atLoad(
      'not strict: an item open',
      { 'review.schema.json': withItems({ additionalProperties: true }) },
      'not strict at findings[]: `additionalProperties`',
    ),
    atLoad(
      'not strict: deep in an anyOf',
      {
        'review.schema.json': withItems({
          properties: {
            ...items.properties,
            fix: { anyOf: [{ type: 'null' }, { type: 'object', properties: { patch: { type: 'string' } } }] },
          },
          required: [...items.required, 'fix'],
        }),
      },
      'not strict at findings[].fix.anyOf[1]',
      '`patch`',
    ),
    atLoad('not JSON', { 'review.schema.json': '{ "findings": ' }, '`output: review.schema.json` is not JSON'),
    ...[[], { type: 'array', items: {} }, closed].map((shape) =>
      atLoad(
        `not a schema of fields: ${JSON.stringify(shape)}`,
        { 'review.schema.json': shape },
        'not a schema of fields',
        '`"type": "object"`',
      ),
    ),
    atLoad(
      'a definition beside the properties',
      { 'review.schema.json': { ...FINDINGS, $defs: { finding: items } } },
      '`$defs`',
      '`properties`',
    ),
    ...CLOSEOUT_FIELDS.map((field) =>
      atLoad(
        `a field every closeout has: ${field}`,
        {
          'review.schema.json': {
            type: 'object',
            properties: { ...FINDINGS.properties, [field]: { type: 'string' } },
            required: ['findings', field],
            additionalProperties: false,
          },
        },
        `declares \`${field}\``,
        'every closeout already has',
        '`summary`',
        '`body`',
      ),
    ),
    atLoad(
      'a $ref to a loose definition',
      around({ $defs: { value: loose }, $ref: '#/properties/product/$defs/value' }),
      '`$ref` at product',
      'delete `$ref`',
    ),
    ...['$ref', '$dynamicRef', '$recursiveRef'].map((ref) =>
      atLoad(
        `${ref}, however strict the target`,
        around({
          $defs: { value: { ...loose, required: ['optional'], additionalProperties: false } },
          [ref]: '#/properties/product/$defs/value',
        }),
        `uses \`${ref}\` at product.`,
      ),
    ),
    ...under.map(([product, at]) =>
      atLoad(`loose under ${at}`, around(product), `is not strict at ${at}: \`optional\` is not in \`required\``),
    ),
  ]);
});

/** A repository whose workflows/ holds `dev` and `ui`, each a folder of one step, and `notes`, a folder of none. */
const withWorkflows = (): { repo: string; workflows: string; plans: string } => {
  const repo = scratch('wf-named-');
  const workflows = path.join(repo, 'workflows');
  for (const name of ['dev', 'ui']) {
    fs.mkdirSync(path.join(workflows, name), { recursive: true });
    fs.writeFileSync(path.join(workflows, name, 'implement.md'), 'implement it\n');
  }
  fs.mkdirSync(path.join(workflows, 'notes'));
  const plans = path.join(repo, 'plans');
  fs.mkdirSync(path.join(plans, 'dev'), { recursive: true });
  fs.mkdirSync(path.join(plans, 'agents'));
  fs.writeFileSync(path.join(repo, 'brief.md'), 'a brief\n');
  return { repo, workflows, plans };
};

test("`workflowFolder`: a path from where it is written first, then a name under the repository's workflows/ — and a refusal naming where it looked", async (t) => {
  const { repo, workflows, plans } = withWorkflows();
  const relative = path.relative(process.cwd(), repo);
  const bare = scratch('wf-bare-');
  const found: Array<[row: string, given: string, from: string, root: string, dir: string]> = [
    ['a name', 'dev', repo, repo, path.join(workflows, 'dev')],
    ['a name, from anywhere', 'ui', plans, repo, path.join(workflows, 'ui')],
    ['a path from where it is written', 'workflows/ui', repo, repo, path.join(workflows, 'ui')],
    ['a path that climbs', '../workflows/ui', plans, repo, path.join(workflows, 'ui')],
    ['an absolute path', path.join(workflows, 'dev'), plans, repo, path.join(workflows, 'dev')],
    ["the folder where it is written, before the repository's", 'dev', plans, repo, path.join(plans, 'dev')],
    ['a relative repository, resolved', 'ui', plans, relative, path.join(workflows, 'ui')],
  ];
  const theirs = ["The repository's workflows are: dev, ui"];
  const refused: Array<[row: string, given: string, from: string, root: string, named: string[]]> = [
    [
      'a name it does not have',
      'deb',
      repo,
      repo,
      [`no workflow folder at ${path.join(repo, 'deb')}`, `nor a workflow named deb in ${workflows}`, ...theirs],
    ],
    ['a path that is not there', './workflows/deb', repo, repo, [`no workflow folder at ${path.join(workflows, 'deb')}.`, ...theirs]],
    [
      "a path from elsewhere, never the repository's name",
      'workflows/dev',
      plans,
      repo,
      [`no workflow folder at ${path.join(plans, 'workflows', 'dev')}.`],
    ],
    [
      'a file',
      'brief.md',
      repo,
      repo,
      [`no workflow folder at ${path.join(repo, 'brief.md')}`, 'nor a workflow named brief.md', ...theirs],
    ],
    [
      'a repository with no workflows',
      'dev',
      bare,
      bare,
      [`nor a workflow named dev in ${path.join(bare, 'workflows')}`, 'Give the path to a workflow folder'],
    ],
    ['an agents folder', './agents', plans, repo, []],
  ];
  for (const [row, given, from, root, dir] of found)
    await t.test(row, () => {
      assert.equal(workflowFolder(given, from, root), dir);
      assert.equal(Schema.is(WorkflowDir.OnCreate)(workflowFolder(given, from, root)), true, "minted as the Workflow door's id");
    });
  for (const [row, given, from, root, named] of refused)
    await t.test(`REFUSED: ${row}`, () => {
      assert.throws(
        () => workflowFolder(given, from, root),
        (e: unknown) => {
          assert.ok(e instanceof WorkflowError, String(e));
          assert.equal(e.exitCode, 2);
          for (const name of named) assert.ok(e.message.includes(name), `names ${name}: ${e.message}`);
          return true;
        },
      );
    });
});

test('`nemia start` is told which files of a folder still say a former line, which reads as it did — and nothing of one on the new', async (t) => {
  const rows: Array<[row: string, files: Record<string, string>, dir: string, lines: (root: string, dir: string) => string[]]> = [
    [
      'disallow and allow: the steps, then the agents they name',
      {
        'team/write.md': '---\nplace: git\nagent: writer\ndisallow: SendMessage\n---\n',
        'team/review.md': '---\nafter: write\nplace: git\n---\nReview.\n',
        'agents/writer.md': '---\nallow: Edit(**)\noverridable: fence\n---\nWrite.\n',
        'agents/unused.md': '---\nallow: Edit(**)\n---\nNobody names me.\n',
      },
      'team',
      (root, dir) => [
        formerKeyLine(path.join(dir, 'write.md'), 'disallow'),
        formerKeyLine(path.join(root, 'agents', 'writer.md'), 'allow'),
      ],
    ],
    [
      'the lists on the new names',
      { 'write.md': '---\nplace: git\nclaude:\n  fence:\n    allowedTools: Edit(**)\n---\nWrite.\n' },
      '',
      () => [],
    ],
    [
      'the former line form, and the fence keys at the top',
      {
        'team/write.md': '---\nplace: git\nagent: writer\ncheck: { npm test; npm run lint: x; }\n---\nWrite.\n',
        'team/review.md': '---\nafter: write\nplace: git\ncheck: "npm test # all of it"\n---\nReview.\n',
        'agents/writer.md': '---\nmodel: opus\noverridable: model\ndisallowedTools: Bash(git push:*), Bash(echo a: b)\n---\nWrite.\n',
      },
      'team',
      (root, dir) => [
        formerFormLine(path.join(dir, 'write.md')),
        formerFormLine(path.join(root, 'agents', 'writer.md')),
        formerFenceLine(path.join(root, 'agents', 'writer.md'), 'disallowedTools'),
      ],
    ],
    [
      'systemPrompt: an agent a step names, and not one on harnessPrompt or one nobody names',
      {
        'team/write.md': '---\nplace: git\nagent: writer\n---\n',
        'team/review.md': '---\nafter: write\nplace: git\nagent: reviewer\n---\n',
        'agents/writer.md': '---\nsystemPrompt: own\noverridable: model\n---\nWrite.\n',
        'agents/reviewer.md': '---\nharnessPrompt: no-coding\noverridable: model\n---\nReview.\n',
        'agents/unused.md': '---\nsystemPrompt: default\n---\nNobody names me.\n',
      },
      'team',
      (root) => [harnessPromptLine(path.join(root, 'agents', 'writer.md'), 'own')],
    ],
    [
      "a codex sandbox as permissionMode: a step's own line or its agent's, and the agent's",
      {
        'team/review.md': '---\nplace: git\nharness: codex\npermissionMode: read-only\n---\nReview.\n',
        'team/check.md': '---\nafter: review\nplace: git\nagent: checker\npermissionMode: read-only\n---\nCheck.\n',
        'team/implement.md': '---\nafter: check\nplace: git\npermissionMode: dontAsk\n---\nImplement.\n',
        'agents/checker.md': '---\nharness: codex\noverridable: fence\npermissionMode: read-only\n---\nYou check.\n',
      },
      'team',
      (root, dir) => [
        formerFenceLine(path.join(dir, 'check.md'), 'permissionMode'),
        codexModeLine(path.join(dir, 'check.md'), 'read-only'),
        formerFenceLine(path.join(dir, 'implement.md'), 'permissionMode'),
        formerFenceLine(path.join(dir, 'review.md'), 'permissionMode'),
        codexModeLine(path.join(dir, 'review.md'), 'read-only'),
        formerFenceLine(path.join(root, 'agents', 'checker.md'), 'permissionMode'),
        codexModeLine(path.join(root, 'agents', 'checker.md'), 'read-only'),
      ],
    ],
    [
      "a codex sandbox in codex's block",
      { 'review.md': '---\nplace: git\nharness: codex\ncodex:\n  fence:\n    sandbox: read-only\n---\nReview.\n' },
      '',
      () => [],
    ],
    [
      'workspace: folder',
      { 'write.md': '---\nworkspace: folder\n---\nWrite.\n', 'review.md': '---\nafter: write\nworkspace: folder\n---\nReview.\n' },
      '',
      (_, dir) => [placeLine(path.join(dir, 'review.md')), placeLine(path.join(dir, 'write.md'))],
    ],
    ['place: folder', { 'write.md': '---\nplace: folder\n---\nWrite.\n' }, '', () => []],
    [
      'workspace: main',
      { 'ship.md': '---\nplace: git\nworkspace: main\n---\nShip.\n' },
      '',
      (_, dir) => [baseLine(path.join(dir, 'ship.md'))],
    ],
    ['workspace: base', { 'ship.md': '---\nplace: git\nworkspace: base\n---\nShip.\n' }, '', () => []],
  ];
  for (const [row, files, sub, lines] of rows)
    await t.test(row, () => {
      const root = folder(files);
      const dir = path.join(root, sub);
      assert.doesNotThrow(() => loadWorkflows(dir), 'the folder starts: the former lines stop nothing');
      assert.deepEqual(formerKeyLines(dir), lines(root, dir));
    });
  await t.test('the files a line is about, and what it names', () => {
    assert.deepEqual(formerKeysIn('---\nallow: Edit(**)\n# disallow: Bash\n  disallow : SendMessage\n---\nallow: is in the body\n'), [
      'allow',
      'disallow',
    ]);
    assert.deepEqual(formerKeysIn('no frontmatter\nallow: x\n'), []);
    assert.deepEqual(formerKeyLines(path.join(scratch('wf-none-'), 'nope')), [], 'no folder: nothing to say');
    assert.match(formerFormLine('w/write.md'), /^w\/write\.md: /);
    assert.ok(baseLine('w/ship.md').includes('`workspace: base`'));
    const [write, review] = loadWorkflows(path.join(folder(rows[2][1]), 'team'));
    assert.equal(write.check, '{ npm test; npm run lint: x; }', 'a former line reads as the rest of the line, as it did');
    assert.equal(review.check, 'npm test # all of it', 'a quoted value is YAML');
  });
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
