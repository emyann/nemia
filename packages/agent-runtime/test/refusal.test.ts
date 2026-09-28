/**
 * What `file` refuses, at both doors, in one set of words (open issue 6).
 *
 * The harness-agnostic refusals live under the Effect `file` (`refusalOf` in `src/engine.ts`), so a consumer of
 * `agent-runtime/effect` cannot journal `deadlineSeconds: NaN` — which stopped its task on the first pass — and
 * `createEngine().file()` throws the same sentence behind `file: `. The harness's own words stay at the facade
 * (`test/facade.test.ts`); the Effect door has no harnesses to ask.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { Effect, Layer } from 'effect';
import { Journal } from '../src/journal.ts';
import { Runner } from '../src/runner.ts';
import { file, type Filing } from '../src/engine.ts';
import { createEngine, type Event, type HarnessArgs, type PromiseJournal, type Sighting } from '../src/facade.ts';

/** The Effect door, over a store and a harness that cost nothing. */
const effectDoor = () => {
  const layer = Layer.mergeAll(Journal.test(), Runner.test({ sessions: new Map<string, Sighting>(), spawned: [] }));
  const run = <A, E>(e: Effect.Effect<A, E, Journal | Runner>) => Effect.runPromise(e.pipe(Effect.provide(layer)));
  return { run, listed: () => run(Effect.flatMap(Journal, (j) => j.list)) };
};

/** The Promise door, at shipped defaults, over a store a test can read. */
const promiseDoor = () => {
  const tasks = new Map<string, Event[]>();
  const journal: PromiseJournal = {
    async append(taskId, event) {
      tasks.set(taskId, [...(tasks.get(taskId) ?? []), event]);
    },
    async read(taskId) {
      return [...(tasks.get(taskId) ?? [])];
    },
    async list() {
      return [...tasks.keys()].sort();
    },
    async feed() {
      return { entries: [], cursor: 0 };
    },
  };
  return { engine: createEngine({ journal }), listed: () => journal.list() };
};

const ok: Filing = { brief: 'b', cwd: '/r' };

/** Every harness-agnostic refusal: what is filed beside `ok`, and the sentence it is refused in. Values a type forbids are cast, as a JSON caller would send them. */
const REFUSALS: Array<
  [Partial<Record<keyof Filing | keyof HarnessArgs | 'maxAttempts' | 'resume' | 'priority' | 'remoteControl', unknown>>, RegExp]
> = [
  [{ brief: '  ' }, /^`brief` is empty\. Say what the session should do\.$/],
  [{ cwd: '' }, /^`cwd` is empty\./],
  [{ cwd: 'repo' }, new RegExp(`^\`cwd: repo\` is not an absolute path.*from here that is ${path.resolve('repo')}\\.$`)],
  // Retired, at what were their defaults: the runtime makes one attempt per start, and trying again is the caller's.
  [
    { maxAttempts: 1 },
    /^`maxAttempts` is retired: the runtime makes one attempt per start.*file it again.*`resumeFrom: <session id>`.*`retries:`.*`wf retry <run> <step>`/,
  ],
  [{ maxAttempts: 2 }, /^`maxAttempts` is retired:/],
  [{ resume: 'interrupted' }, /^`resume` is retired: the runtime makes one attempt per start.*`retries:`.*`wf retry <run> <step>`/],
  [{ resume: 'always' }, /^`resume` is retired:/],
  [{ deadlineSeconds: Number.NaN }, /^`deadlineSeconds: NaN` is not a number of seconds\./],
  [{ deadlineSeconds: 0 }, /^`deadlineSeconds: 0` is not a number of seconds\./],
  [{ deadlineSeconds: Infinity }, /^`deadlineSeconds: Infinity` is not a number of seconds\./],
  [{ config: { model: '' } }, /^`model` is empty\./],
  [{ resumeFrom: '' }, /^`resumeFrom` is empty\./],
  [{ config: { effort: '' } }, /^`effort` is empty\./],
  [{ config: { tools: ['Read,Grep'] } }, /^`tools: \["Read,Grep"\]` is not a list of tool names\./],
  [
    { config: { disallowedTools: ['Bash npm run build'] } },
    /^`disallowedTools: \["Bash npm run build"\]` is not a list of permission rules\./,
  ],
  [{ config: { allowedTools: ['Write(**'] } }, /^`allowedTools: \["Write\(\*\*"\]` is not a list of permission rules\./],
  [{ config: { mcp: [] } }, /^`mcp: \[\]` is not a map of MCP servers by name\./],
  [{ config: { mcp: { web: {} } } }, /^`mcp\.web` has neither `command` nor `url`\./],
  [{ config: { budgetUsd: 0 } }, /^`budgetUsd: 0` is not an amount of dollars\./],
  [{ config: { budgetUsd: -1 } }, /^`budgetUsd: -1` is not an amount of dollars\./],
  [{ config: { budgetUsd: Number.NaN } }, /^`budgetUsd: NaN` is not an amount of dollars\./],
  [{ config: { budgetUsd: Infinity } }, /^`budgetUsd: Infinity` is not an amount of dollars\./],
  [{ config: { budgetUsd: '5' } }, /^`budgetUsd: "5"` is not an amount of dollars\./],
  // Retired in stage 4c part 2 (2026-09-25), at any value: the runtime chooses no order, and the layer above admits.
  [
    { priority: 0 },
    /^`priority` is retired: the runtime starts a task on its next pass once it is admitted, so it chooses no order\. File tasks `queued: true` and `admit` each when it may start \(`ae admit <id>`\)/,
  ],
  [{ priority: 1 }, /^`priority` is retired:/],
  [{ priority: -1 }, /^`priority` is retired:/],
  [{ priority: Number.NaN }, /^`priority` is retired:/],
  [{ priority: 'high' }, /^`priority` is retired:/],
  // A harness argument until 2026-09-25, Claude Code's flag since: refused at its old place, whatever it says, naming the new one.
  [
    { config: { remoteControl: true } },
    /^`remoteControl` is Claude Code's own flag, no harness argument of its own since 2026-09-25: file it with Claude Code's flags, as `config: \{ claude: \{ remoteControl: true \} \}`, or leave it out\.$/,
  ],
  [{ config: { remoteControl: 'true' } }, /^`remoteControl` is Claude Code's own flag/],
  [{ remoteControl: true }, /^`remoteControl` is Claude Code's own flag/],
  [
    { config: { background: 'yes' } },
    /^`background: "yes"` is not true or false\. Give true to run the session as `claude --bg`, or leave it out to run it as a job\.$/,
  ],
  [{ config: { background: 1 } }, /^`background: 1` is not true or false\./],
  [{ config: { contextTokens: 0 } }, /^`contextTokens: 0` is not a number of tokens\./],
  [{ config: { contextTokens: 150000.5 } }, /^`contextTokens: 150000\.5` is not a number of tokens\./],
  [{ config: { contextTokens: '200k' } }, /^`contextTokens: "200k"` is not a number of tokens\./],
  // Where a harness's argument goes: under `config`, and nothing else there. A caller that still files one beside it —
  // an untyped one, or a record written before it moved — would otherwise start its session without it, saying nothing.
  [{ model: 'opus' }, /^`model` is the harness's configuration: file it under `config`, as `config: \{ model: … \}`\.$/],
  [{ permissionMode: 'dontAsk', config: { model: 'opus' } }, /^`permissionMode` is the harness's configuration: file it under `config`/],
  [{ worktree: true }, /^`worktree` is the harness's configuration/],
  // The spend cap was the runtime's own field until stage 4b (2026-09-25): a caller built before it is told where it went.
  [{ budgetUsd: 5 }, /^`budgetUsd` is the harness's configuration: file it under `config`, as `config: \{ budgetUsd: … \}`\.$/],
  [
    { config: 'opus' },
    /^`config: "opus"` is not a harness's configuration\. Give an object of its arguments, like \{ "model": "opus" \}, or leave it out\.$/,
  ],
  [{ config: null }, /^`config: null` is not a harness's configuration\./],
  [{ config: { priority: 1 } }, /^`config\.priority` is not a harness argument\. A harness's arguments are: model, permissionMode, /],
];

for (const [bad, says] of REFUSALS) {
  const spec = { ...ok, ...bad } as Filing;
  const name = Object.entries(bad)
    .map(([k, v]) => `${k}: ${typeof v === 'number' ? v : JSON.stringify(v)}`)
    .join(', ');

  test(`the Effect door refuses ${name}, journals nothing, and the Promise door refuses it in the same words`, async () => {
    const effect = effectDoor();
    const err = await effect.run(Effect.flip(file(spec)));
    assert.equal(err._tag, 'FileRefused', `failed with ${err._tag}: ${err.message}`);
    assert.match(err.message, says);
    assert.deepEqual(await effect.listed(), [], 'nothing was journalled, so no tick can spawn it');

    const promise = promiseDoor();
    await assert.rejects(promise.engine.file(spec), (e: Error & { exitCode?: number }) => {
      assert.equal(e.exitCode, 2, e.message);
      assert.equal(e.message, `file: ${err.message}`, 'one function, one sentence, at both doors');
      return true;
    });
    assert.deepEqual(await promise.listed(), []);
  });
}

test('the Effect door journals a filing that refuses nothing, with every checked key set', async () => {
  const effect = effectDoor();
  const full: Filing = {
    ...ok,
    deadlineSeconds: 60,
    resumeFrom: 's-1',
    queued: true,
    holdOpen: true,
    config: {
      model: 'opus',
      effort: 'high',
      tools: ['Read', 'Grep'],
      disallowedTools: ['SendMessage', 'Bash(npm run build)'],
      allowedTools: ['Edit(**)'],
      mcp: { web: { command: 'npx', args: ['web'] } },
      background: true,
      contextTokens: 200000,
      claude: { remoteControl: true },
    },
  };
  const id = await effect.run(file(full));
  assert.deepEqual(await effect.listed(), [id]);
});

test("the Effect door still journals a harness's own words: it has no harness to ask (issue 6, what is left)", async () => {
  // Pinned so the day the vocabulary half moves too, this test is the one that says so.
  const effect = effectDoor();
  await effect.run(file({ ...ok, harness: 'banana', config: { permissionMode: 'yolo' } }));
  assert.equal((await effect.listed()).length, 1);
});
