/**
 * `workflows/ui/`, the workflow for a change a person will see, held to its shape — so an edit that drops
 * the build check, the screenshots, the look, the loop or the ship fails the suite rather than a run. The e2e is the
 * implementer's own run, for the screenshots, and the check's on the merged tree only (since 2026-09-25), which the gated ship
 * runs, as the dev folders' does (since 2026-09-25 too).
 *
 *   implement ⇄ review → ship   (review: the diff, and implement's screenshots and the pages beside it)
 *
 * Looking is the look skill (`.claude/skills/look/SKILL.md`), which both steps use. It was a step of its own, with a
 * respond to answer both reviewers, until the reviewer ran on Claude and the loop gave the edge back (plan §4 U2).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Ajv } from 'ajv';
import { composeBrief, workspacePlan, type Run } from '../src/run.ts';
import { landingContract } from '../src/check.ts';
import { closeoutSchemaOf, outputLines, type Closeout } from '../src/closeout.ts';
import { loopSpan, terminalSteps } from '../src/workflow.ts';
import { loadWorkflows } from '../src/workflow-store.ts';
import { scratch } from './scratch.ts';
import { toldIn } from './told.ts';

const REPO = path.join(import.meta.dirname, '..', '..', '..');
const WORKFLOWS = path.join(import.meta.dirname, '..', 'workflows');
/** The build folders' and ui's implement check: the build every round, and the e2e only where the run set no `WF_BASE_REF` — the merged tree. */
const BUILD =
  'npm test && npm run typecheck && npm run lint && npm run build && if [ -n "${WF_BASE_REF:-}" ]; then echo "wf check: no e2e in a round\'s check; it runs once, on the merged tree, where no WF_BASE_REF is set"; else npm run e2e; fi';
/** `dev`'s implement check, as its folder writes it: the suite and the types, then the build and the e2e on what git says was touched. */
const DEV_CHECK = loadWorkflows(path.join(REPO, 'workflows', 'dev')).find((s) => s.name === 'implement')!.check!;
const ui = loadWorkflows(path.join(WORKFLOWS, 'ui'));
const steps = Object.fromEntries(ui.map((s) => [s.name, s]));

/** A step's prose with its line breaks as spaces, so a sentence is found wherever the file wraps it. */
const said = (text: string) => text.replace(/\s+/g, ' ');
/** What a ui step is told, its agent's skills with it (`toldIn`), as one line. */
const told = (step: (typeof ui)[number]) => said(toldIn(path.join(WORKFLOWS, 'ui'), step));

/**
 * The skills a step's body tells it to use and it could not reach: one named by a file the repository does not have, and one named
 * only as `the <name> skill` on a step with no Skill tool, which the body is all it is told. A `tools:` line without `Skill` gives a
 * session no Skill tool — measured with Claude Code 2.1.270, whose session still lists the repository's skills beside it — so
 * such a step must be told the skill's file, which Read opens.
 */
function unreachableSkills(step: { body: string; tools?: string[] }): string[] {
  const text = said(step.body);
  const problems = new Set<string>();
  for (const [, file] of text.matchAll(/`(\.claude\/skills\/[^`/]+\/SKILL\.md)`/g)) {
    if (!fs.existsSync(path.join(REPO, file!))) problems.add(`${file} is not in the repository`);
  }
  const loads = !step.tools || step.tools.includes('Skill');
  for (const [, name] of text.matchAll(/\bthe ([\w-]+) skill\b/g)) {
    if (!loads && !text.includes(`\`.claude/skills/${name}/SKILL.md\``))
      problems.add(`the ${name} skill is named, and this step has no Skill tool and is not told its file`);
  }
  return [...problems];
}

test("the ui workflow loads as two steps, the loop between them and the ship after it — every declared schema strict, the shipper's message's too, or it would not", () => {
  assert.deepEqual(
    ui.map((s) => s.name),
    ['implement', 'review', 'ship'],
  );
  assert.deepEqual(
    ui.filter((s) => s.output).map((s) => [s.name, s.output!.schema.additionalProperties]),
    [
      ['implement', false],
      ['review', false],
      ['ship', false],
    ],
  );
  assert.deepEqual([steps.review?.loop, steps.review?.rounds], ['implement', 3]);
  assert.deepEqual(loopSpan(ui, steps.review!), ['implement', 'review']);
  assert.deepEqual(
    terminalSteps(ui).map((s) => s.name),
    ['ship'],
  );
  // A chain: review works in implement's workspace, so each round it reads the change as it stands.
  assert.deepEqual(workspacePlan(ui, steps.review!), { kind: 'inherit', from: 'implement' });
});

test('look and respond are gone: both steps use the look skill, which the repository carries, and the loop answers the review', () => {
  for (const gone of ['look.md', 'look.schema.json', 'respond.md'])
    assert.equal(fs.existsSync(path.join(WORKFLOWS, 'ui', gone)), false, `${gone} is gone`);
  // Since agents card 1b both are told so by their agents' skills, `look-at-a-page` and `read-a-screenshot`.
  assert.ok(told(steps.implement!).includes('Before you sign off, use the look skill on every page you changed'), told(steps.implement!));
  assert.ok(told(steps.review!).includes('Read the diff.'), told(steps.review!));
  assert.ok(
    told(steps.review!).includes("use the look skill on implement's screenshots and on the pages, side by side"),
    told(steps.review!),
  );
  assert.ok(!said(steps.review!.body).includes('Read the diff.'), 'and the review is the skill, not the body');

  // The skill the two briefs name is there, under that name, and the one browser tool it forbids is refused by the settings too.
  const skill = fs.readFileSync(path.join(REPO, '.claude', 'skills', 'look', 'SKILL.md'), 'utf8');
  assert.match(skill, /^---\nname: look\ndescription: \S/);
  assert.match(skill, /never `browser_run_code_unsafe`/i);
  const settings = JSON.parse(fs.readFileSync(path.join(REPO, '.claude', 'settings.json'), 'utf8')) as { permissions: { deny: string[] } };
  assert.ok(settings.permissions.deny.includes('mcp__playwright__browser_run_code_unsafe'), 'denied by name');
});

test('REFUSED: a step told to use the look skill that could not reach it — no Skill tool and not told its file, or told a file that is not there', () => {
  // review has the Skill tool, and its skill `read-a-screenshot` names the file too. The guard is exercised on a copy without the tool.
  assert.equal(steps.review?.tools?.includes('Skill'), true);
  const fenced = { ...steps.review!, tools: steps.review!.tools!.filter((t) => t !== 'Skill') };
  // The ship looks at nothing: it merges, and runs the check.
  for (const step of ui.filter((s) => s.name !== 'ship')) {
    assert.match(told(step), /`\.claude\/skills\/look\/SKILL\.md`/, `${step.name} is told the skill's file`);
    assert.deepEqual(unreachableSkills({ ...step, body: told(step) }), [], step.name);
  }

  const review = { ...steps.review!, body: told(steps.review!) };
  const file = '`.claude/skills/look/SKILL.md`';
  assert.deepEqual(unreachableSkills({ ...fenced, body: review.body.replaceAll(file, 'the skill') }), [
    'the look skill is named, and this step has no Skill tool and is not told its file',
  ]);
  assert.ok(
    unreachableSkills({ ...fenced, body: review.body.replaceAll(file, '`.claude/skills/looking/SKILL.md`') }).includes(
      '.claude/skills/looking/SKILL.md is not in the repository',
    ),
    'a renamed skill',
  );
  // The rule is the Skill tool's: a step that has it loads the skill by name.
  assert.deepEqual(unreachableSkills({ ...review, body: review.body.replaceAll(file, 'the skill') }), []);
});

test('implement is checked by the build, and in a browser only on the merged tree; review, which writes nothing, declares no check', () => {
  assert.equal(steps.implement?.check, BUILD);
  assert.equal(steps.review?.check, undefined);
});

test('implement declares the screenshots it looked at and the pages they show, and only review reads them', () => {
  assert.equal(steps.implement?.harness, 'claude');
  assert.equal(steps.implement?.output?.file, 'implement.schema.json');
  const declared = steps.implement!.output!.schema.properties as Record<string, { type: string; items: unknown }>;
  assert.deepEqual(Object.keys(declared), ['screenshots', 'pages']);
  for (const field of ['screenshots', 'pages'])
    assert.deepEqual([declared[field]!.type, declared[field]!.items], ['array', { type: 'string' }], field);
  assert.deepEqual(
    ui.filter((s) => s.input?.includes('implement')).map((s) => s.name),
    ['review'],
  );
});

test('review writes nothing by machinery: on Claude, tools that read and Bash, in dontAsk, denied build and e2e — and implement has every tool', () => {
  const { harness, after, input, tools, disallowedTools, permissionMode, output, loop, rounds } = steps.review!;
  assert.deepEqual(
    { harness, after, input, tools, disallowedTools, permissionMode, output: output?.file, loop, rounds },
    {
      harness: 'claude',
      after: ['implement'],
      input: ['implement'],
      tools: ['Read', 'Grep', 'Glob', 'Bash', 'Skill', 'WebFetch', 'WebSearch'],
      disallowedTools: REVIEW_DENIED,
      permissionMode: 'dontAsk',
      output: 'review.schema.json',
      loop: 'implement',
      rounds: 3,
    },
  );
  assert.deepEqual(
    tools?.filter((t) => ['Edit', 'Write', 'NotebookEdit'].includes(t)),
    [],
    'nothing that edits',
  );
  assert.equal(steps.implement?.tools, undefined);
  assert.deepEqual(steps.implement?.disallowedTools, IMPLEMENT_DENIED);
});

/** What the settings allow for implement's check, and write into the workspace: a reviewer is denied both by name. */
const REVIEW_DENIED = ['Bash(npm run build)', 'Bash(npm run e2e)'];
/** What an unattended session has and no step needs (plan §4b, "what a worker gets, measured"). */
const IMPLEMENT_DENIED = ['SendMessage', 'CronCreate', 'CronDelete', 'RemoteTrigger'];

test("every dev* folder, and ui, ends in `ship`: gated, in the repository's checkout, with implement's denies and that folder's check, which the run executes on the merge — and its prose stages the merge and signs off the message, and neither runs the check nor commits", () => {
  const CHECKS: Record<string, string> = {
    // The suite and the types, then the build when git says the work touched the web app, and the e2e on the merged tree alone
    // (web-check.test.ts runs both).
    dev: DEV_CHECK,
    'dev-planned': DEV_CHECK,
    'dev-build': BUILD,
    'dev-planned-build': BUILD,
    // ui's is the build folders' line, and so its ship is theirs, note and all; the package's copy is shipped too.
    ui: BUILD,
    [path.relative(path.join(REPO, 'workflows'), path.join(WORKFLOWS, 'ui'))]: BUILD,
  };
  for (const [folder, check] of Object.entries(CHECKS)) {
    const dir = path.join(REPO, 'workflows', folder);
    const byName = Object.fromEntries(loadWorkflows(dir).map((s) => [s.name, s]));
    const ship = byName.ship!;
    assert.ok(ship, `${folder} has an ending step`);
    const { after, workspace, gate, harness, model, disallowedTools, check: own, tools, loop } = ship;
    assert.deepEqual(
      { after, workspace, gate, harness, model, disallowedTools, check: own, tools, loop },
      {
        after: ['review'],
        workspace: 'main',
        gate: true,
        harness: 'claude',
        model: 'opus',
        disallowedTools: IMPLEMENT_DENIED,
        check,
        tools: undefined,
        loop: undefined,
      },
      folder,
    );
    // Its check is implement's, the same line: what the work was judged by is what the merged tree is judged by.
    assert.equal(own, byName.implement!.check, `${folder}: ship's check is implement's`);
    // And the message the run commits the merge with is the step's closeout, one required string.
    assert.equal(ship.output?.file, 'shipper.schema.json', folder);
    const schema = closeoutSchemaOf(ship, loadWorkflows(dir)) as { required: string[]; properties: Record<string, { type: string }> };
    assert.ok(schema.required.includes('message'), `${folder}: a sign-off gives its message`);
    assert.equal(schema.properties.message!.type, 'string');
    assert.equal(
      terminalSteps(loadWorkflows(dir))
        .map((s) => s.name)
        .join(),
      'ship',
      `${folder} ends there`,
    );

    // The prose is the recipe, one for every folder (the shipper's): stage the merge, write the message, leave the rest to the run.
    // Told by the shipper's body and its two skills, `trial-merge-a-branch` and `say-why-it-aborted`, given whole (since agents card 1b).
    const body = said(toldIn(dir, ship));
    for (const sentence of [
      "Ship it: stage the merge of this run's result onto the base branch, and sign off with the message to commit it with.",
      'git merge --no-ff --no-commit <branch>…',
      // The merge is committed with a message the shipper writes, not git's `Merge branch '…'`: what shipped, and the evidence for it.
      "Write the commit message — never git's default.",
      "the run's own title — the first line under *What was asked for* — trimmed to about 72 characters.",
      '"Merge branch …" is what this message replaces.',
      'a body of two to six lines: what was built, in plain words, then one line naming the run, its branch, how many commits it brought, and the check the run executes on the merged tree.',
      "`git log --format='%s' <base>..<branch>`, `git diff --stat <base>...<branch>`",
      "never from anyone's account of the work.",
      'No trailers of any kind: no `Co-Authored-By`, no `Signed-off-by`, no session URL.',
      "Leave the merge staged, and sign off `done`, the message whole as your closeout's `message`.",
      "Do not run the check, do not commit, and do not abort a merge that is clean: the run does each, on the check's exit",
      '`git merge --abort` if a merge is staged, then sign off `blocked` saying what happened.',
      // A job cannot end its turn to wait for a suite: the lesson the owner gave with the plan's approval.
      '`[structured-output-enforce]`',
      'timeout 580 bash -c "while kill -0 <pid>; do sleep 5; done"',
      'Do not push, and do not delete the branch',
    ])
      assert.ok(body.includes(sentence), `${folder}: ${sentence}\n\n${body}`);
    assert.ok(!body.includes('`git commit --no-edit`'), `${folder}: the recipe never commits git's default message\n\n${body}`);
    const run: Run = {
      id: 'r-1',
      repo: '/repo',
      workspace: '/repo',
      baseRef: 'abc123',
      branch: 'main',
      isolate: true,
      brief: 'Ship it',
      workflowDir: dir,
      createdAt: '2026-09-19T00:00:00Z',
      steps: Object.fromEntries(
        Object.keys(byName).map((name) => [
          name,
          name === 'ship' ? { taskId: null } : { taskId: `t-${name}`, workspace: '/wt', branch: 'wf/r-1/implement' },
        ]),
      ),
    };
    const brief = composeBrief(ship, run, loadWorkflows(dir), undefined, '/wf/runs/r-1/artifacts/ship');
    // The title the recipe's subject is taken from is the brief's, under its heading — the brief's first line where the step has no note of
    // its own, since the shipper's instructions are in its system prompt (`briefBody`).
    assert.match(brief, /(^|\n)## What was asked for\n\nShip it/, `${folder}\n\n${brief}`);
    // The brief says the run executes the folder's check on the merge and commits it — once — and never hands the step a check to run.
    assert.equal(brief.split(landingContract(check)).length, 2, `${folder}\n\n${brief}`);
    assert.ok(!brief.includes("This workflow's check, which its work was judged by:"), `${folder}\n\n${brief}`);
    assert.ok(!brief.includes('## Finishing'), `${folder}: no contract to run a check before signing off\n\n${brief}`);
  }

  // One ending, written once: every dev* folder's ship.md is the same wiring and the shipper. A build folder's adds a note after it, the
  // team's reason to run its build and e2e on the merged tree, which the shipper — one recipe for every folder — does not give.
  const shipIn = (folder: string) => fs.readFileSync(path.join(REPO, 'workflows', folder, 'ship.md'), 'utf8');
  assert.equal(shipIn('dev-planned'), shipIn('dev'), 'dev-planned');
  assert.equal(shipIn('dev-planned-build'), shipIn('dev-build'), 'dev-planned-build');
  assert.equal(shipIn('ui'), shipIn('dev-build'), 'ui');
  assert.equal(fs.readFileSync(path.join(WORKFLOWS, 'ui', 'ship.md'), 'utf8'), shipIn('ui'), "the package's ui");
  // The same wiring, its check its own folder's (and a comment on what that line does mid-merge), then its note.
  const wiring = (folder: string) =>
    shipIn(folder)
      .replace(/^check: .+$/m, 'check:')
      .replace(/^# (Mid-merge, |and runs the e2e |With no WF_BASE_REF there, ).+\n/gm, '');
  assert.ok(wiring('dev-build').startsWith(wiring('dev')), 'dev-build is the same wiring, then its note');
  const WHY = [
    "`npm run build` regenerates the web app's route tree",
    '`npm run e2e` visits every page in both themes',
    'the merged tree is the first tree either has seen',
  ];
  for (const folder of Object.keys(CHECKS)) {
    const body = said(loadWorkflows(path.join(REPO, 'workflows', folder)).find((s) => s.name === 'ship')!.body);
    for (const why of WHY) assert.equal(body.includes(why), CHECKS[folder] === BUILD, `${folder}: ${why}\n\n${body}`);
  }
});

test("every shipped Claude reviewer is denied `npm run build` and `npm run e2e`, which the settings allow for implement's sake, and every implement what no step needs", () => {
  // The deny is what keeps review from them: the settings allow both, so in dontAsk nothing else would.
  const settings = JSON.parse(fs.readFileSync(path.join(REPO, '.claude', 'settings.json'), 'utf8')) as {
    permissions: { allow: string[] };
  };
  for (const rule of REVIEW_DENIED)
    assert.ok(settings.permissions.allow.includes(rule), `${rule} is allowed by the settings, word for word`);

  const folders = [
    WORKFLOWS,
    path.join(WORKFLOWS, 'ui'),
    ...['dev', 'dev-build', 'dev-planned', 'dev-planned-build', 'ui'].map((d) => path.join(REPO, 'workflows', d)),
  ];
  for (const dir of folders) {
    const byName = Object.fromEntries(loadWorkflows(dir).map((s) => [s.name, s]));
    assert.deepEqual(byName.implement?.disallowedTools, IMPLEMENT_DENIED, `${dir}: implement`);
    const review = byName.review!;
    if (review.harness === 'codex') {
      assert.deepEqual(
        [review.sandbox, review.permissionMode, review.disallowedTools],
        ['read-only', undefined, undefined],
        `${dir}: codex has no tool list, and its sandbox writes nothing`,
      );
    } else {
      assert.deepEqual([review.permissionMode, review.disallowedTools], ['dontAsk', REVIEW_DENIED], `${dir}: review`);
    }
  }
});

test('`wf decide` on a ui review reads each finding as a place — the file and line, or the page and theme — never as JSON', () => {
  const what = 'The legend covers the last row of nodes.';
  const said: Closeout = {
    outcome: 'done',
    summary: 'Read and looked.',
    artifacts: [],
    output: {
      findings: [
        { where: { file: 'apps/web/src/components/StepNode.tsx', line: 12 }, what },
        { where: { page: '/workflows', theme: 'dark' }, what },
      ],
      again: true,
    },
  };
  assert.deepEqual(outputLines(steps.review!, said), [
    'findings:',
    '  - apps/web/src/components/StepNode.tsx:12',
    `    what: ${what}`,
    '  - /workflows · dark',
    `    what: ${what}`,
    'again: true',
  ]);
});

type Branch = { type: string; properties: Record<string, unknown>; required: string[]; additionalProperties: boolean };
type Findings = {
  type: string;
  items: { properties: { where: { anyOf: Branch[] }; what: unknown }; required: string[]; additionalProperties: boolean };
};

test("review's schema is the shipped review's, `again` and all, with a finding's place a file and a line or a page and a theme", () => {
  const shipped = loadWorkflows(WORKFLOWS).find((s) => s.name === 'review')!.output!.schema;
  const schema = steps.review!.output!.schema;
  assert.deepEqual(schema.required, shipped.required);
  assert.deepEqual(schema.properties.again, shipped.properties.again);

  const findings = schema.properties.findings as unknown as Findings;
  const theirs = (shipped.properties.findings as { items: { properties: Record<string, unknown> } }).items.properties;
  assert.equal(findings.type, 'array');
  assert.deepEqual([findings.items.required, findings.items.additionalProperties], [['where', 'what'], false]);
  const [code, page] = findings.items.properties.where.anyOf;
  assert.equal(findings.items.properties.where.anyOf.length, 2);
  assert.deepEqual(
    [code!.required, code!.additionalProperties, page!.required, page!.additionalProperties],
    [['file', 'line'], false, ['page', 'theme'], false],
  );
  assert.deepEqual(code!.properties, { file: theirs.file, line: theirs.line }, 'a file and a line, as the shipped review names them');
  assert.deepEqual((page!.properties.theme as { enum: string[] }).enum, ['light', 'dark', 'both']);
});

test('REFUSED: a review finding that names neither a file nor a page — nor half of one, nor both at once — in the closeout review is filed with', () => {
  const validate = new Ajv({ strict: true, allowUnionTypes: true }).compile(closeoutSchemaOf(steps.review!, Object.values(steps)));
  const closeout = (...findings: unknown[]) => ({
    outcome: 'done',
    summary: 'Read and looked.',
    artifacts: [],
    needs: null,
    findings,
    again: findings.length > 0,
  });
  const what = 'The legend covers the last row of nodes.';

  for (const allowed of [
    closeout(),
    closeout({ where: { file: 'apps/web/src/components/StepNode.tsx', line: 12 }, what }),
    closeout({ where: { file: 'apps/web/test/components.test.ts', line: null }, what }),
    closeout({ where: { page: '/workflows', theme: 'dark' }, what }),
  ]) {
    assert.equal(validate(allowed), true, `${JSON.stringify(allowed.findings)}: ${JSON.stringify(validate.errors)}`);
  }

  for (const refused of [
    { where: {}, what },
    { where: { what }, what },
    { where: { file: 'apps/web/src/components/StepNode.tsx' }, what },
    { where: { page: '/workflows' }, what },
    { where: { page: '/workflows', theme: 'sepia' }, what },
    { where: { file: 'apps/web/src/components/StepNode.tsx', line: 12, page: '/workflows', theme: 'dark' }, what },
    { where: null, what },
    { file: 'apps/web/src/components/StepNode.tsx', line: 12, what },
    { where: { page: '/workflows', theme: 'light' } },
  ]) {
    assert.equal(validate(closeout(refused)), false, JSON.stringify(refused));
    // Refused for the finding, and for nothing else of the closeout.
    assert.ok(
      validate.errors!.every((e) => e.instancePath.startsWith('/findings/0')),
      JSON.stringify(validate.errors),
    );
  }
});

/** The files of two workflow folders that differ — missing from either, or not the same bytes — READMEs aside, which describe where each lives. */
function differences(ours: string, theirs: string): string[] {
  const files = (dir: string) => fs.readdirSync(dir).filter((f) => f !== 'README.md');
  const all = [...new Set([...files(ours), ...files(theirs)])].sort();
  return all.filter((f) => {
    const [a, b] = [path.join(ours, f), path.join(theirs, f)];
    return !fs.existsSync(a) || !fs.existsSync(b) || !fs.readFileSync(a).equals(fs.readFileSync(b));
  });
}

test("the repository's workflows/ui/ is the package's, file for file — and a copy that is not is caught", () => {
  const shipped = path.join(WORKFLOWS, 'ui');
  const drifted = scratch('wf-ui-copy-');
  fs.cpSync(shipped, drifted, { recursive: true });
  fs.appendFileSync(path.join(drifted, 'review.md'), '\nAlso check the spelling.\n');
  fs.writeFileSync(path.join(drifted, 'look.md'), '---\nafter: implement\n---\nLook.\n');
  fs.rmSync(path.join(drifted, 'review.schema.json'));
  fs.writeFileSync(path.join(drifted, 'README.md'), '# Not the package\n');
  assert.deepEqual(
    differences(drifted, shipped),
    ['look.md', 'review.md', 'review.schema.json'],
    'the README may differ, and nothing else',
  );
  fs.rmSync(drifted, { recursive: true, force: true });

  const repository = path.join(REPO, 'workflows', 'ui');
  assert.deepEqual(differences(repository, shipped), []);
  assert.ok(fs.existsSync(path.join(repository, 'README.md')), 'the repository copy says what it is');

  // And the agents its steps name, beside it: the package's agents/ holds ui's two and the shipper, with their schemas,
  // each the repository's byte for byte.
  const agents = path.join(WORKFLOWS, 'agents');
  const theirs = path.join(REPO, 'workflows', 'agents');
  assert.deepEqual(fs.readdirSync(agents).sort(), [
    'implement.schema.json',
    'shipper.md',
    'shipper.schema.json',
    'ui-implementer.md',
    'ui-reviewer.md',
  ]);
  for (const file of fs.readdirSync(agents))
    assert.ok(fs.readFileSync(path.join(agents, file)).equals(fs.readFileSync(path.join(theirs, file))), `agents/${file}`);

  // And the skills those three agents give, beside agents/ as in the repository: every one of them and nothing else, each folder the
  // repository's file for file.
  const skills = path.join(WORKFLOWS, 'skills');
  const given = loadWorkflows(path.join(WORKFLOWS, 'ui')).flatMap((s) => s.agent?.skills ?? []);
  assert.deepEqual(fs.readdirSync(skills).sort(), [...new Set(given)].sort());
  assert.deepEqual(fs.readdirSync(skills).sort(), [
    'implement-a-web-change',
    'look-at-a-page',
    'read-a-screenshot',
    'review-a-web-change',
    'say-why-it-aborted',
    'trial-merge-a-branch',
  ]);
  for (const skill of fs.readdirSync(skills))
    assert.deepEqual(differences(path.join(skills, skill), path.join(REPO, 'workflows', 'skills', skill)), [], `skills/${skill}`);
});

test("review is handed implement's screenshots and pages, and not its summary, beside the loop's contract", () => {
  const run: Run = {
    id: 'r-1',
    repo: '/repo',
    workspace: '/repo',
    baseRef: 'abc123',
    branch: 'main',
    isolate: true,
    brief: 'Make the Factory darker',
    workflowDir: path.join(WORKFLOWS, 'ui'),
    createdAt: '2026-09-13T00:00:00Z',
    steps: { implement: { taskId: 't1' }, review: { taskId: null }, ship: { taskId: null } },
  };
  const shot = '/wf/runs/r-1/artifacts/implement/factory-dark.png';
  const told: Closeout = {
    outcome: 'done',
    summary: 'IMPLEMENTER-ACCOUNT',
    artifacts: [shot],
    output: { screenshots: [shot], pages: ['/'] },
  };
  const brief = composeBrief(steps.review!, run, ui, (name) => (name === 'implement' ? told : undefined), '/wf/runs/r-1/artifacts/review');
  assert.match(brief, /\n## From implement\n/);
  assert.ok(brief.includes(JSON.stringify(shot)), brief);
  assert.doesNotMatch(brief, /IMPLEMENTER-ACCOUNT/);
  assert.match(brief, /\n## Round 1 of 3\n/);
  assert.deepEqual(closeoutSchemaOf(steps.review!, Object.values(steps)).required, [
    'outcome',
    'summary',
    'artifacts',
    'needs',
    'findings',
    'again',
  ]);
});
