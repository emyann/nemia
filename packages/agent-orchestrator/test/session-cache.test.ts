/**
 * A continued session keeps its prompt cache: every task the run files with `resumeFrom` carries what the task whose session it continues
 * was filed with — its closeout schema, byte for byte as JSON, its model, effort, tools, disallowed tools and permission mode. Each of
 * those is part of the cached prompt: the schema is Claude Code's `StructuredOutput` tool, a tool sits at the front, and a changed one
 * rewrites the whole conversation at twenty times the price of reading it: a continuation filed with another schema than the one it
 * continues rewrites hundreds of thousands of tokens.
 *
 * And its context window (`contextTokens`), which is not part of the cached prompt — a resume given another window, or none, reads the
 * whole prompt from the cache (agent-runtime open issue 26) — but which a resumed session keeps only when it is given it again: Claude
 * Code's copy of a resumed session keeps the flags it was started with and no others, so a continuation filed without the window runs on
 * the model's whole window, and one filed with another compacts where the session it continues did not.
 *
 * Walked at shipped defaults, over the tests' team's `dev` (`team.ts`), whose review loops back to implement: a first try, a nudge, an
 * answer to a blocked step (`nemia retry --message`), a round 2 and a round 3 — and over a folder whose loop's target declares an `output:`
 * of its own. And the run's own nudge
 * to sign off, filed with no person's word when a session ends `unsigned`. `WF_ROOT` is read as the module loads, so it is set before the
 * import.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { EnginePhase } from '../src/views/views-words.ts';
import { CLOSEOUT_SCHEMA, closeoutSchemaOf } from '../src/closeout/closeout.ts';
import type { Workflow } from '../src/workflow.ts';
import { scratch } from './scratch.ts';
import { TEAM } from './team.ts';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from '../place/memory/index.ts';
import { eachTest, runGiven, runOver } from './placed.ts';

const ROOT = scratch('wf-cache-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
process.env.WF_ROOT = ROOT;
const { advanceRun, retryRun, startRun, stepsOf, runWith: runEngine } = await import('../src/runner.ts');
const { engineOf } = await import('../src/runtime-client.ts');
const stand = eachTest(testPlace);
const engine = eachTest(testEngine);
const runWith = runOver(runEngine, () => stand().layer);
const runPlaced = runGiven(() => stand().layer);
const { readRun } = await import('../src/record/record.store.ts');

const LOOPED = ['dev'];

/**
 * What a task is filed with that the harness puts in the cached prompt, beside the conversation itself — and the window the session keeps.
 */
const CACHED = ['closeoutSchema', 'model', 'effort', 'tools', 'disallowedTools', 'permissionMode', 'contextTokens'] as const;

type Filed = { id: string; resumeFrom?: string; closeoutSchema?: object; config?: Record<string, unknown> } & Record<string, unknown>;

/** What `f` was filed with under `key`: its schema is the task's, and the rest are its harness's arguments, under `config`. */
const cachedOf = (f: Filed, key: (typeof CACHED)[number]): unknown => (key === 'closeoutSchema' ? f.closeoutSchema : f.config?.[key]);

/**
 * Each continuation, against the task whose session it continues, named by the field that differs. A session is `native-<task id>` on
 * the board below, so a `resumeFrom` names the task it came from. A continuation of a session nobody here filed is a difference too.
 */
function chainDifferences(filed: readonly Filed[]): string[] {
  const byId = new Map(filed.map((f) => [f.id, f]));
  const out: string[] = [];
  for (const f of filed) {
    if (!f.resumeFrom) continue;
    const from = byId.get(f.resumeFrom.replace(/^native-/, ''));
    if (!from) {
      out.push(`${f.id}: continues ${f.resumeFrom}, which no task here was`);
      continue;
    }
    for (const key of CACHED) {
      if (JSON.stringify(cachedOf(f, key)) !== JSON.stringify(cachedOf(from, key))) out.push(`${f.id}: ${key} is not ${from.id}'s`);
    }
  }
  return out;
}

/** A repository with one commit, so `nemia start` has a base to record. */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  stand().world.repository(repo, {});
  return repo;
};

/** The engine stand-in the walk settles by hand, keeping each task as it was filed. Each task's session is its own, `native-<id>`. */
const board = () => {
  const held = engine();
  const settle = (id: string, phase: EnginePhase, closeout?: unknown, exitCode?: number, end?: object) =>
    held.settle(id, phase, {
      ...(closeout !== undefined && { closeout }),
      ...(exitCode !== undefined && { exitCode }),
      ...end,
    });
  return { e: engineOf(held.layer), tasks: held.tasks, settle };
};

/**
 * A value a strict schema accepts: the first of each choice, one item in each array. What a step says matters to the walk only by its
 * shape.
 */
function valueOf(schema: Record<string, unknown>): unknown {
  if (Array.isArray(schema.anyOf)) return valueOf(schema.anyOf[0] as Record<string, unknown>);
  if (Array.isArray(schema.enum)) return schema.enum[0];
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;
  if (type === 'object') {
    const properties = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
    return Object.fromEntries(Object.entries(properties).map(([k, v]) => [k, valueOf(v)]));
  }
  if (type === 'array') return [valueOf(schema.items as Record<string, unknown>)];
  return type === 'boolean' ? false : type === 'integer' || type === 'number' ? 1 : type === 'null' ? null : 'x';
}

const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };

/**
 * A run of `dir` through a loop's first try, a nudge, an answer to its blocked try, round 2 and round 3, every other step signing off with
 * what its schema asks for — and the tasks it filed, in order. `first` is how try 2 is asked for: a nudge, or a new session on a model.
 * The target's try 1 ends unsigned, so a nudge follows; try 2 signs blocked, so an answer follows; try 3, round 1, is handed no `replies`;
 * the looping step's rounds 1 and 2 ask again, and its round 3 is done.
 */
async function walk(
  dir: string,
  first: { mode: 'nudge' | 'fresh'; model?: string } = { mode: 'nudge' },
): Promise<{ id: string; filed: Filed[]; target: string; looping: string; steps: Workflow[] }> {
  const run = await runPlaced(startRun({ brief: 'add a flag', repo: aRepo(), workflowDir: dir }));
  const steps = stepsOf(run);
  const looping = steps.find((s) => s.loop)!;
  const target = looping.loop!;
  const b = board();
  const order: string[] = [];
  const tryOfId = (id: string, step: string) =>
    id === `${run.id}-${step}` ? 1 : Number(new RegExp(`^${run.id}-${step}-try(\\d+)$`).exec(id)?.[1] ?? NaN);

  for (let pass = 0; pass < 60; pass++) {
    const p = await runWith(b.e, advanceRun(readRun(run.id)));
    const pending = [...b.tasks.entries()].filter(([, t]) => t.phase === 'pending');
    if (!pending.length && !p.looped.length && !p.tried.length) break;
    for (const [id, t] of pending) {
      order.push(id);
      if (id.endsWith('-check')) {
        b.settle(id, 'succeeded', undefined, 0);
        continue;
      }
      const schema = t.spec.closeoutSchema as { properties: Record<string, Record<string, unknown>> } | undefined;
      const said: Record<string, unknown> = {
        ...SIGNED,
        ...(schema
          ? (valueOf({
              ...schema,
              properties: Object.fromEntries(Object.entries(schema.properties).filter(([k]) => !(k in SIGNED))),
            }) as object)
          : {}),
      };
      const n = tryOfId(id, target);
      if (n === 1) {
        b.settle(id, 'succeeded');
        continue;
      }
      if (n === 2) {
        b.settle(id, 'succeeded', { ...said, outcome: 'blocked', needs: 'which flag?' });
        continue;
      }
      if (n === 3) said.replies = [];
      const r = tryOfId(id, looping.name);
      if (r) said.again = r < 3;
      b.settle(id, 'succeeded', said);
    }
    if (pending.some(([id]) => tryOfId(id, target) === 1)) await runWith(b.e, retryRun(run.id, target, first));
    if (pending.some(([id]) => tryOfId(id, target) === 2))
      await runWith(b.e, retryRun(run.id, target, { mode: 'nudge', message: 'the --dry-run flag' }));
  }
  return { id: run.id, filed: order.map((id) => b.tasks.get(id)!.spec), target, looping: looping.name, steps };
}

for (const name of LOOPED) {
  test(`${name}, at shipped defaults: every continued session is filed with what the session it continues was — schema, model, effort, tools — through a nudge, an answer, round 2 and round 3`, async () => {
    const { id, filed, target, looping, steps } = await walk(path.join(TEAM, name));
    const resumed = filed.filter((f) => f.resumeFrom).map((f) => f.id.slice(id.length + 1));
    assert.deepEqual(
      resumed,
      [2, 3, 4, 5].map((n) => `${target}-try${n}`),
      `the walk reached a nudge (try 2), an answer (try 3), round 2 (try 4) and round 3 (try 5):\n${filed.map((f) => f.id).join('\n')}`,
    );
    assert.ok(
      filed.some((f) => f.id.endsWith(`-${looping}-try3`)),
      'round 3 was reviewed',
    );
    assert.deepEqual(chainDifferences(filed), []);
    for (const f of filed.filter((x) => x.id.includes(`-${target}`) && !x.id.endsWith('-check'))) {
      assert.equal(
        JSON.stringify(f.closeoutSchema),
        JSON.stringify(
          closeoutSchemaOf(
            steps.find((s) => s.name === target)!,
            steps,
          ),
        ),
        `${f.id}: the chain is the one the frozen workflow gives the target, from its first try`,
      );
      assert.ok((f.closeoutSchema as { required: string[] }).required.includes('replies'), `${f.id}: replies and all`);
    }
  });
}

test("REFUSED before the fix, now kept: a `nemia retry --model` session is continued on its model — by the answer to it, and by the round after — not on the step's", async () => {
  const { id, filed, target } = await walk(path.join(TEAM, 'dev'), { mode: 'fresh', model: 'sonnet' });
  const of = (n: number) => filed.find((f) => f.id === `${id}-${target}-try${n}`)!;
  assert.deepEqual(
    [2, 3, 4, 5].map((n) => [of(n).config?.model, Boolean(of(n).resumeFrom)]),
    [
      ['sonnet', false],
      ['sonnet', true],
      ['sonnet', true],
      ['sonnet', true],
    ],
    "try 2 a new session on sonnet (`--model sonnet`), blocked; try 3 answers it, continuing sonnet's session; round 2 continues try 3's",
  );
  assert.equal(filed.find((f) => f.id === `${id}-${target}`)!.config?.model, 'opus', "the first try on the step's model");
  assert.deepEqual(chainDifferences(filed), []);
});

test("a loop's target that declares an `output:` of its own keeps one schema too: its fields, then `replies`, on every try", async () => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  const notes = { type: 'object', properties: { notes: { type: 'string' } }, required: ['notes'], additionalProperties: false };
  const looping = {
    type: 'object',
    properties: { findings: { type: 'array', items: { type: 'string' } }, again: { type: 'boolean' } },
    required: ['findings', 'again'],
    additionalProperties: false,
  };
  fs.writeFileSync(
    path.join(dir, 'implement.md'),
    '---\nplace: git\ncheck: npm test\nmodel: opus\neffort: high\noutput: implement.schema.json\n---\nimplement it\n',
  );
  fs.writeFileSync(path.join(dir, 'implement.schema.json'), JSON.stringify(notes));
  fs.writeFileSync(
    path.join(dir, 'review.md'),
    '---\nafter: implement\nplace: git\noutput: review.schema.json\nloop: implement\n---\nreview it\n',
  );
  fs.writeFileSync(path.join(dir, 'review.schema.json'), JSON.stringify(looping));
  const { filed } = await walk(dir);
  assert.deepEqual(chainDifferences(filed), []);
  assert.deepEqual(
    (filed[0].closeoutSchema as { required: string[] }).required,
    ['apiVersion', 'outcome', 'summary', 'body', 'artifacts', 'needs', 'notes', 'replies'],
    'the first try',
  );
});

test("a loop's target with a context window keeps it on every try — a nudge, an answer, a `--model` session and the rounds after it", async () => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  const looping = {
    type: 'object',
    properties: { findings: { type: 'array', items: { type: 'string' } }, again: { type: 'boolean' } },
    required: ['findings', 'again'],
    additionalProperties: false,
  };
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\ncheck: npm test\nmodel: opus\ncontext: 200k\n---\nimplement it\n');
  fs.writeFileSync(
    path.join(dir, 'review.md'),
    '---\nafter: implement\nplace: git\ncontext: 150000\noutput: review.schema.json\nloop: implement\n---\nreview it\n',
  );
  fs.writeFileSync(path.join(dir, 'review.schema.json'), JSON.stringify(looping));
  for (const first of [{ mode: 'nudge' as const }, { mode: 'fresh' as const, model: 'sonnet' }]) {
    const { id, filed, target } = await walk(dir, first);
    assert.deepEqual(chainDifferences(filed), [], first.mode);
    const tries = filed.filter((f) => f.id.startsWith(`${id}-${target}`) && !f.id.endsWith('-check'));
    assert.deepEqual(
      tries.map((f) => f.config?.contextTokens),
      tries.map(() => 200_000),
      `${first.mode}: ${tries.map((f) => f.id).join(', ')}`,
    );
    assert.ok(tries.length >= 5, 'a first try, a nudge or a new session, an answer, and two rounds');
    assert.ok(
      filed.filter((f) => f.id.includes('-review')).every((f) => f.config?.contextTokens === 150_000),
      "the reviewer's sessions on its own window",
    );
  }
});

test('REFUSED by the check: a chain that changes its schema — round 1 without `replies`, round 2 with them, as it was filed before — or its model, effort, tools, fence or mode', () => {
  const target: Workflow = { name: 'implement', after: [], body: 'implement it' };
  const steps: Workflow[] = [target, { name: 'review', after: ['implement'], body: 'review it', loop: 'implement' }];
  const was = { ...closeoutSchemaOf(target, steps), properties: CLOSEOUT_SCHEMA.properties, required: CLOSEOUT_SCHEMA.required };
  const chain: Filed[] = [
    { id: 'r-implement', closeoutSchema: was, config: { model: 'opus', effort: 'high' } },
    {
      id: 'r-implement-try2',
      resumeFrom: 'native-r-implement',
      closeoutSchema: closeoutSchemaOf(target, steps),
      config: { model: 'opus', effort: 'high' },
    },
  ];
  assert.deepEqual(
    chainDifferences(chain),
    ["r-implement-try2: closeoutSchema is not r-implement's"],
    "the target's round-1 session filed without `replies`, and round 2 continuing it with them",
  );
  const reordered = { ...closeoutSchemaOf(target, steps), required: [...closeoutSchemaOf(target, steps).required].reverse() };
  assert.deepEqual(
    chainDifferences([
      { ...chain[1], id: 'r-implement' },
      { ...chain[1], closeoutSchema: reordered, resumeFrom: 'native-r-implement' },
    ]),
    ["r-implement-try2: closeoutSchema is not r-implement's"],
    'byte for byte: the same fields in another order is another tool',
  );

  const args = {
    model: 'opus',
    effort: 'high',
    tools: ['Read'],
    disallowedTools: ['SendMessage'],
    permissionMode: 'dontAsk',
    contextTokens: 200_000,
  };
  const same = { closeoutSchema: CLOSEOUT_SCHEMA, config: args };
  for (const [key, value] of [
    ['model', 'sonnet'],
    ['effort', 'medium'],
    ['tools', ['Read', 'Bash']],
    ['disallowedTools', []],
    ['permissionMode', 'auto'],
    ['contextTokens', 150_000],
    ['contextTokens', undefined],
  ] as const) {
    assert.deepEqual(
      chainDifferences([
        { id: 'a', ...same },
        { id: 'a-try2', resumeFrom: 'native-a', ...same, config: { ...args, [key]: value } },
      ]),
      [`a-try2: ${key} is not a's`],
      key,
    );
  }
  assert.deepEqual(chainDifferences([{ id: 'a-try2', resumeFrom: 'native-a', ...same }]), [
    'a-try2: continues native-a, which no task here was',
  ]);
  assert.deepEqual(
    chainDifferences([
      { id: 'a', ...same },
      { id: 'a-try2', resumeFrom: 'native-a', ...same },
    ]),
    [],
  );
});

for (const name of LOOPED) {
  test(`${name}, at shipped defaults: the run's own nudge to sign off continues an unsigned session filed as that session was — schema, model, effort, tools, window`, async () => {
    const run = await runPlaced(startRun({ brief: 'add a flag', repo: aRepo(), workflowDir: path.join(TEAM, name) }));
    const target = stepsOf(run).find((s) => s.loop)!.loop!;
    const b = board();
    const order: string[] = [];
    const first = `${run.id}-${target}`;
    const nudge = `${first}-try2`;
    for (let pass = 0; pass < 20 && !b.tasks.has(nudge); pass++) {
      await runWith(b.e, advanceRun(readRun(run.id)));
      for (const [id, t] of b.tasks) {
        if (t.phase !== 'pending' || id === nudge) continue;
        order.push(id);
        if (id.endsWith('-check')) b.settle(id, 'succeeded', undefined, 0);
        else if (id === first) b.settle(id, 'failed', undefined, undefined, { reason: 'harness', closedOut: false, former: 'unsigned' });
        else
          b.settle(id, 'succeeded', {
            ...SIGNED,
            ...(valueOf(t.spec.closeoutSchema as Record<string, unknown>) as object),
            outcome: 'done',
            needs: null,
          });
      }
    }
    assert.ok(
      b.tasks.has(nudge),
      `the run filed ${nudge} itself, its target ended as the engine records a session that never called StructuredOutput, failed with its last attempt unsigned: ${[...b.tasks.keys()].join(', ')}`,
    );
    const filed = [...order, nudge].map((id) => b.tasks.get(id)!.spec);
    assert.equal(b.tasks.get(nudge)!.spec.resumeFrom, `native-${first}`, 'the same session, continued');
    assert.deepEqual(chainDifferences(filed), []);
    assert.equal(readRun(run.id).steps[target]?.tries?.at(-1)?.then, 'signoff');
  });
}
