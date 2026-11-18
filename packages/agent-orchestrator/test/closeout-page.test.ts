/**
 * A step's closeout on a run's detail (`closeoutIn`), read in either version: a v1 closeout's body, its values, each linked only where it
 * is an http(s) address (`valueOf`), and what the run refuses of its envelope; a v0 closeout converted, its first line the summary and
 * its whole text the body. And what a step's files and values link: the run's own `closeout.json` is no file of the step's folder
 * listing (`folderFiles`), and a picture a step's browser wrote into its files directory is linked and drawn where the same picture
 * under `/tmp/playwright-mcp`, where a step's browser wrote before, is its path alone (`artifactOf`).
 */
import { beforeAll, describe, test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { artifactsDir } from '../src/record/record.store.ts';
import type { Views } from '../src/summary/reads.verb.ts';
import type { Run } from '../src/run.ts';
import type { StepSpec } from '../src/workflow.ts';
import { closeoutIn } from '../src/resource/tries.verb.ts';
import { artifactOf, folderFiles, valueOf } from '../src/resource/files.store.ts';
import { toldOf } from '../src/resource/told.verb.ts';
import { approvedSection, fromSection, retrySection } from '../src/brief/brief-sections.ts';
import { fromRunSection } from '../src/brief/handed.ts';
import { artifactsContract } from '../src/artifacts/artifacts.ts';
import type { PlaceService } from '../src/place/place.store.ts';
import { run as aRun } from './assessed.ts';
import { STORE } from './ambient.ts';

const RUN = { id: 'r-closeout', steps: {} } as unknown as Run;
const STEP = { name: 'implement', after: [], body: 'x' } as unknown as StepSpec;

/** The closeout `said` as the step's detail reads it, off an engine whose task holds it as its last attempt's. */
const read = (said: unknown) =>
  closeoutIn(STORE, RUN, 'implement', STEP, 't1', new Map([['t1', { state: { attempts: [{ closeout: said }] } }]]) as unknown as Views, [
    STEP,
  ]);

describe("closeoutIn: a step's closeout read in either version", () => {
  test('a v1 closeout gives its body and its values, linked only where a value is an http(s) address, and its envelope refused', () => {
    const c = read({
      apiVersion: 'nemia/v1',
      outcome: 'done',
      summary: 'Opened the pull request.',
      body: '## What\n\nAll of it.',
      artifacts: [
        { name: 'PR', value: 'https://example.com/pr/1' },
        { name: 'script', value: 'javascript:alert(1)' },
        { name: 'version', value: '0.4.0' },
      ],
      needs: 'look at it',
    })!;
    assert.deepEqual([c.apiVersion, c.summary, c.body], ['nemia/v1', 'Opened the pull request.', '## What\n\nAll of it.']);
    assert.deepEqual(c.values, [
      { name: 'PR', value: 'https://example.com/pr/1', link: 'https://example.com/pr/1' },
      { name: 'script', value: 'javascript:alert(1)', link: null },
      { name: 'version', value: '0.4.0', link: null },
    ]);
    assert.equal(c.refused.length, 1);
    assert.match(c.refused[0], /`needs` is set on a `done` closeout/);
  });
  test('a v0 closeout is converted on read: its first line the summary, its whole text the body, nothing refused', () => {
    const c = read({ outcome: 'done', summary: 'First line.\n\nMore.', artifacts: ['a.md'], needs: 'x' })!;
    assert.deepEqual(
      [c.apiVersion, c.summary, c.body, c.values, c.refused, c.artifacts],
      [null, 'First line.', 'First line.\n\nMore.', [], [], [{ path: 'a.md', relativePath: 'a.md' }]],
    );
  });
});

describe('closeoutIn: the shape of each field it serves', () => {
  const properties = { pr: { type: ['string', 'null'] }, notes: { type: 'string' } };
  const output = { file: 'o.json', schema: { type: 'object', properties, required: ['pr', 'notes'], additionalProperties: false } };
  const said = { apiVersion: 'nemia/v1', outcome: 'done', summary: 's', artifacts: [], pr: 'https://x.test/pr/1', notes: 'n' };
  const served = (step: StepSpec) =>
    closeoutIn(STORE, RUN, 'implement', step, 't1', new Map([['t1', { state: { attempts: [{ closeout: said }] } }]]) as unknown as Views, [
      step,
    ])!;
  test('a step whose output marked a field `link` serves its shape', () => {
    const c = served({ ...STEP, output: { ...output, shapes: { pr: 'link' } } } as unknown as StepSpec);
    assert.deepEqual(c.shapes, { pr: 'link' });
    assert.deepEqual(Object.keys(c.schema), ['pr', 'notes']);
  });
  test('a run frozen before shapes were kept serves none, and still reads', () => {
    const c = served({ ...STEP, output } as unknown as StepSpec);
    assert.equal(c.shapes, undefined);
    assert.equal(c.output.pr, 'https://x.test/pr/1');
  });
});

describe("what a step's values and files link: valueOf, folderFiles, artifactOf", () => {
  test('valueOf links an http(s) address', () => {
    assert.equal(valueOf({ name: 'a', value: 'http://x.test/a' }).link, 'http://x.test/a');
  });
  test('valueOf links no other scheme', () => {
    assert.equal(valueOf({ name: 'a', value: 'ftp://x.test/a' }).link, null);
  });
  test('valueOf links no address inside words', () => {
    assert.equal(valueOf({ name: 'a', value: 'see https://x.test' }).link, null);
  });
  test("a step's folder listing leaves out the closeout.json the run wrote there", () => {
    const dir = artifactsDir(STORE, RUN, 'implement');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'closeout.json'), '{}');
    fs.writeFileSync(path.join(dir, 'notes.md'), 'n');
    assert.deepEqual(
      folderFiles(RUN, 'implement', dir, 'artifacts').files.map((f) => f.path),
      [path.join(dir, 'notes.md')],
    );
  });
  const pictures = { id: 'r-pictures' };
  test('a picture in the step files directory reads with its url and as an image', () => {
    const dir = artifactsDir(STORE, pictures, 'design');
    fs.mkdirSync(dir, { recursive: true });
    const picture = path.join(dir, 'page-1.png');
    fs.writeFileSync(picture, 'png');
    assert.deepEqual(artifactOf(STORE, pictures, 'design', picture, null), {
      path: picture,
      relativePath: 'page-1.png',
      name: 'page-1.png',
      url: '/api/runs/r-pictures/steps/design/artifacts/page-1.png',
      kind: 'image',
      size: 3,
    });
  });
  test('one under /tmp/playwright-mcp, by its path alone', () => {
    assert.deepEqual(artifactOf(STORE, pictures, 'design', '/tmp/playwright-mcp/page-1.png', null), {
      path: '/tmp/playwright-mcp/page-1.png',
    });
  });
  test("every file a step's folder lists carries its path from that folder, one that is a directory included", () => {
    const dir = artifactsDir(STORE, { id: 'r-relative' }, 'implement');
    fs.mkdirSync(path.join(dir, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'shot.png'), 'png');
    const files = folderFiles(RUN, 'implement', dir, 'artifacts').files;
    assert.deepEqual(
      files.map((f) => f.relativePath),
      ['shot.png', 'sub'],
    );
    for (const f of files) assert.equal(path.dirname(path.resolve(dir, f.relativePath ?? '/')), path.resolve(dir));
  });
  describe('a named file carries its path from the step folder that holds it, and none outside every one', () => {
    const dir = artifactsDir(STORE, pictures, 'design');
    const work = path.join(STORE, 'folders', 'r-pictures-design');
    const rows: [string, string, string | null, string | undefined][] = [
      ['a picture in the artifacts folder', path.join(dir, 'page-1.png'), null, 'page-1.png'],
      ['one nested under it', path.join(dir, 'sub', 'x.png'), null, path.join('sub', 'x.png')],
      ['a path from the workspace root', 'notes/./x.md', null, path.join('notes', 'x.md')],
      ["a folder run's absolute path in its own folder", path.join(work, 'out', 'y.md'), work, path.join('out', 'y.md')],
      ['an absolute path in no folder of the step', '/tmp/playwright-mcp/page-1.png', work, undefined],
      ['one that climbs out of the workspace', '../x', null, undefined],
      ["the run's own closeout", 'closeout.json', null, undefined],
    ];
    for (const [name, file, folder, relative] of rows) {
      test(name, () => {
        assert.equal(artifactOf(STORE, pictures, 'design', file, folder).relativePath, relative);
      });
    }
  });
});

describe('what a step was told: its task cut back into the sections the run composed, each with whose words it carries', () => {
  let record!: {
    repo: string;
    workspace: string;
    branch: string;
    baseRef: string;
    isolate: boolean;
    id: string;
    brief: string;
    workflowDir: string;
    steps: Record<
      string,
      {
        readonly taskId: string | null;
        readonly check?: { readonly taskId: string; readonly tip?: string | undefined } | undefined;
        readonly route?: { readonly route: string; readonly try: number; readonly by: 'person' | 'table' | 'script' | 'judge' } | undefined;
        readonly sent?: { readonly card: string; readonly at: string } | undefined;
        readonly pinned?:
          | readonly {
              readonly kind: 'workflow' | 'agent' | 'skill' | 'rules';
              readonly name: string;
              readonly n: number;
              readonly hash: string;
            }[]
          | undefined;
        readonly workspace?: string | undefined;
        readonly branch?: string | undefined;
        readonly tries?:
          | readonly {
              readonly taskId: string;
              readonly cause: 'retries' | 'signoff' | 'continue' | 'fresh' | 'recheck' | 'round' | 'merge' | 'back';
              readonly model?: string | undefined;
              readonly check?: { readonly taskId: string; readonly tip?: string | undefined } | undefined;
              readonly paused?: true | undefined;
              readonly retried?: true | undefined;
              readonly budget?: number | undefined;
            }[]
          | undefined;
        readonly handedOff?: string | undefined;
        readonly landed?: import('../src/record/record.ts').LandingRecord | undefined;
        readonly filesRead?: { readonly taskId: string; readonly lacked: { readonly [x: string]: string } } | undefined;
        readonly closeoutHash?: string | undefined;
        readonly declared?: readonly string[] | undefined;
      }
    >;
    createdAt: string;
    context?: readonly string[] | undefined;
    workflow?: readonly StepSpec[] | undefined;
    factory?: string | undefined;
    pinned?:
      | readonly {
          readonly kind: 'workflow' | 'agent' | 'skill' | 'rules';
          readonly name: string;
          readonly n: number;
          readonly hash: string;
        }[]
      | undefined;
    placeSkill?: { readonly skill: string; readonly version: string } | undefined;
    stagedFile?: string | undefined;
    place?: undefined;
    after?: readonly string[] | undefined;
    inputs?: readonly string[] | undefined;
    cards?: readonly string[] | undefined;
    workflowFiles?: string | undefined;
    carriedFiles?: string | undefined;
    from?: { readonly inbox: string } | undefined;
    scheduled?: { readonly factory: string; readonly workflow: string; readonly due: string } | undefined;
    gates?: readonly string[] | undefined;
    models?: { readonly [x: string]: string } | undefined;
    mounts?: readonly { readonly path: string; readonly readOnly: boolean }[] | undefined;
    volumes?: readonly { readonly path: string; readonly readOnly: boolean }[] | undefined;
    harnessSettings?: { readonly [x: string]: { readonly [x: string]: unknown } } | undefined;
    costLine?: number | undefined;
    tips?: { readonly [x: string]: string } | undefined;
    cancelledAt?: string | undefined;
    cancelledBy?:
      | {
          readonly kind: 'agent' | 'person';
          readonly run?: string | undefined;
          readonly step?: string | undefined;
          readonly agent?: string | undefined;
          readonly token?: string | undefined;
        }
      | undefined;
    labels?: { readonly [x: string]: string } | undefined;
    saidBefore?: { readonly [x: string]: readonly { readonly at: string; readonly text: string }[] } | undefined;
    slotHeldAt?: string | undefined;
    gatesTimed?: readonly { readonly step: string; readonly try: number }[] | undefined;
    deniedCounted?: readonly { readonly task: string; readonly attempts: number }[] | undefined;
    settlesCounted?: readonly string[] | undefined;
    runTimed?: boolean | undefined;
    approvals?:
      | readonly {
          readonly step: string;
          readonly at: string;
          readonly try: number;
          readonly message?: string | undefined;
          readonly budgets?: { readonly [x: string]: number } | undefined;
          readonly work?: { readonly [x: string]: number } | undefined;
          readonly actor?:
            | {
                readonly kind: 'agent' | 'person';
                readonly run?: string | undefined;
                readonly step?: string | undefined;
                readonly agent?: string | undefined;
                readonly token?: string | undefined;
              }
            | undefined;
        }[]
      | undefined;
    acceptances?:
      | readonly {
          readonly step: string;
          readonly at: string;
          readonly try: number;
          readonly message: string;
          readonly actor?:
            | {
                readonly kind: 'agent' | 'person';
                readonly run?: string | undefined;
                readonly step?: string | undefined;
                readonly agent?: string | undefined;
                readonly token?: string | undefined;
              }
            | undefined;
        }[]
      | undefined;
    pruned?:
      | {
          readonly at: string;
          readonly worktrees: readonly { readonly path: string; readonly bytes: number }[];
          readonly artifacts?: { readonly at: string; readonly bytes: number } | undefined;
        }
      | undefined;
    hold?:
      | {
          readonly at: string;
          readonly until: readonly string[];
          readonly actor?:
            | {
                readonly kind: 'agent' | 'person';
                readonly run?: string | undefined;
                readonly step?: string | undefined;
                readonly agent?: string | undefined;
                readonly token?: string | undefined;
              }
            | undefined;
          readonly why?: string | undefined;
          readonly by?: string | undefined;
        }
      | undefined;
    unheld?:
      | {
          readonly since: string;
          readonly actor: {
            readonly kind: 'agent' | 'person';
            readonly run?: string | undefined;
            readonly step?: string | undefined;
            readonly agent?: string | undefined;
            readonly token?: string | undefined;
          };
        }
      | undefined;
    pause?:
      | {
          readonly at: string;
          readonly by: string;
          readonly actor?:
            | {
                readonly kind: 'agent' | 'person';
                readonly run?: string | undefined;
                readonly step?: string | undefined;
                readonly agent?: string | undefined;
                readonly token?: string | undefined;
              }
            | undefined;
          readonly why?: string | undefined;
          readonly timeoutMs?: number | undefined;
        }
      | undefined;
  };
  let task!: string;
  let views!: Views;
  let parts!: import('../src/runner.ts').TaskPart[];
  beforeAll(() => {
    record = aRun(
      { design: 't-d', implement: 't-i' },
      {
        id: 'r-told',
        workflow: steps,
        after: ['parent-a1'],
        approvals: [{ step: 'design', try: 1, at: '2026-01-01T00:00:00Z', message: 'Go on.' }],
      },
    );
    task = [
      'Opened by the run.',
      '',
      '## What was asked for',
      '',
      'Add a flag.',
      '',
      '## From nowhere',
      '',
      'A heading of the card that names no step of the run.',
      fromSection('design', steps, () => said),
      approvedSection(implement, record, steps),
      retrySection(implement, { try: 2, by: 'retries', mode: 'fresh', resumed: false, status: 'failed', refusal }),
      fromRunSection(parent),
      artifactsContract('/a/implement'),
    ].join('\n');
    views = new Map([['t-i', { state: { brief: task } }]]) as unknown as Views;
    parts = toldOf(record, 'implement', null, views, {} as PlaceService['Service']).taskParts ?? [];
  });
  const findings = { type: 'array', items: { type: 'string' } };
  const design = {
    name: 'design',
    after: [],
    body: 'd',
    gate: true,
    output: { file: 'd.json', schema: { type: 'object', properties: { findings }, required: ['findings'], additionalProperties: false } },
  } as unknown as StepSpec;
  const implement = { name: 'implement', after: ['design'], input: ['design'], body: 'i' } as unknown as StepSpec;
  const steps = [design, implement];
  const said = { outcome: 'done' as const, summary: 's', artifacts: [], output: { findings: ['one'] } };
  const parent = { run: 'parent-a1', asked: 'Lay the ground.', steps: [], how: 'waited' as const, landed: true };
  const refusal = { command: 'npm test', verdict: 1 as const, stdout: '## not a heading of the brief', stderr: '' };
  test('each section is cut with its source, and a step or check part names the step that gave it', () => {
    assert.deepEqual(
      parts.map((p) => (p.kind === 'from' ? ['from', p.run, p.how] : [p.source, p.step])),
      [
        ['run', undefined],
        ['person', undefined],
        ['step', 'design'],
        ['person', undefined],
        ['run', undefined],
        ['check', 'implement'],
        ['from', 'parent-a1', 'waited'],
        ['run', undefined],
      ],
    );
  });
  test("a card's heading that names no step stays inside the person's part", () => {
    const asked = parts[1];
    assert.ok(asked.kind === 'text' && asked.text.includes('## From nowhere'));
  });
  test('the parts, joined, give the task back', () => {
    const texts = parts.map((p) => (p.kind === 'text' ? p.text : `## From run ${p.run}\n${p.body}`));
    assert.equal(texts.join('\n'), task);
  });
});
