/**
 * The checks every harness shares of a task's `config`, in their own file (`src/harness-args.ts`), and asked through the
 * `Runner` — each made to refuse, at shipped defaults.
 *
 * They were `refusalOf`'s, in the engine; they moved beside the arguments they check, in the same words
 * (`test/refusal.test.ts` holds those words at both doors). What is new is what a task says about the move itself: a
 * harness argument filed beside `config` is refused naming where it goes, and a `config` that is not an object, or holds
 * a key that is no harness argument, is refused rather than carried to a runner that would drop it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect } from 'effect';
import { argsRefusalOf, HARNESS_ARGS, type HarnessArgs } from '../src/harness-args.ts';
import { Runner, testOps, type RunnerOps } from '../src/runner.ts';
import { composite } from '../src/runner-composite.ts';

const task = { brief: 'b', cwd: '/r' };
type Asked = Parameters<NonNullable<RunnerOps['refuses']>>[0];

/** What `ops`, made a `Runner` as every runner is (`Runner.layer`), says of `t`. */
const refusedBy = (ops: RunnerOps, t: Asked) =>
  Effect.runSync(Effect.gen(function* () { return (yield* Runner).refuses?.(t); }).pipe(Effect.provide(Runner.layer(ops))));

test('HARNESS_ARGS is the ten arguments a harness takes', () => {
  assert.deepEqual([...HARNESS_ARGS].sort(), [
    'allowedTools', 'contextTokens', 'disallowedTools', 'effort', 'mcp', 'model', 'permissionMode', 'remoteControl', 'tools', 'worktree',
  ]);
});

test('a harness argument filed beside config is refused, naming where it goes — each of the ten', () => {
  const value: Record<keyof HarnessArgs, unknown> = {
    model: 'opus', permissionMode: 'auto', effort: 'high', tools: ['Read'], allowedTools: ['Edit(**)'], disallowedTools: ['SendMessage'],
    mcp: {}, contextTokens: 200000, remoteControl: false, worktree: true,
  };
  for (const key of HARNESS_ARGS) {
    const says = argsRefusalOf({ ...task, [key]: value[key] } as never);
    assert.equal(says, `\`${key}\` is the harness's configuration: file it under \`config\`, as \`config: { ${key}: … }\`.`, key);
    // The same value under `config` is taken: the refusal is about where, not what.
    assert.equal(argsRefusalOf({ ...task, config: { [key]: value[key] } }), undefined, `config.${key}`);
  }
  // An absent key a JSON caller spelled out as undefined is no argument at all.
  assert.equal(argsRefusalOf({ ...task, model: undefined } as never), undefined);
});

test('a config that is not an object of arguments is refused, and says what one is', () => {
  for (const config of [null, 'opus', 7, ['model'], true]) {
    const says = argsRefusalOf({ ...task, config } as never) ?? '';
    assert.ok(says.startsWith(`\`config: ${JSON.stringify(config)}\` is not a harness's configuration. Give an object of its arguments`), says);
  }
  assert.equal(argsRefusalOf({ ...task, config: {} }), undefined, 'an empty one is the harness defaults');
  assert.equal(argsRefusalOf({ ...task, config: undefined }), undefined, 'and so is none');
});

test('a key in config that is no harness argument is refused by name, with the list', () => {
  const says = argsRefusalOf({ ...task, config: { model: 'opus', modle: 'haiku' } } as never) ?? '';
  assert.ok(says.startsWith('`config.modle` is not a harness argument.'), says);
  for (const key of HARNESS_ARGS) assert.ok(says.includes(key), `the list names ${key}`);
  // The task's own fields do not belong in it either: a budget is the task's, not the harness's.
  assert.match(argsRefusalOf({ ...task, config: { budgetUsd: 1 } } as never) ?? '', /^`config\.budgetUsd` is not a harness argument\./);
});

test('where a key is and whether it is one are said before what its value is', () => {
  // Two faults: the first sentence a person reads fixes the one that makes the second make sense.
  assert.match(argsRefusalOf({ ...task, model: 'opus', config: { effort: '' } } as never) ?? '', /^`model` is the harness's configuration/);
  assert.match(argsRefusalOf({ ...task, config: { stray: 1, effort: '' } } as never) ?? '', /^`config\.stray` is not a harness argument/);
});

test('every Runner refuses the shared checks before its own, and asks its own when they pass', () => {
  const asked: string[] = [];
  const ops: RunnerOps = { ...testOps(), refuses: (t) => { asked.push(t.config?.model ?? '-'); return t.config?.model === 'huge' ? 'no huge models' : undefined; } };
  const refuses = (t: Asked) => refusedBy(ops, t);

  assert.match(refuses({ ...task, config: { model: '' } }) ?? '', /^`model` is empty\./);
  assert.deepEqual(asked, [], 'a value no harness could use never reaches the runner');
  assert.equal(refuses({ ...task, config: { model: 'huge' } }), 'no huge models', 'its own words, once the shared checks pass');
  assert.equal(refuses({ ...task, config: { model: 'opus' } }), undefined);
  assert.deepEqual(asked, ['huge', 'opus']);

  // A runner that says nothing of its own still refuses the shared checks: `Runner.layer` asks them for it.
  const bare = { ...testOps() };
  delete bare.refuses;
  assert.match(refusedBy(bare, { ...task, config: { tools: ['Read,Grep'] } }) ?? '', /^`tools: \["Read,Grep"\]` is not a list of tool names\./);
});

test("a composite asks the task's own harness, as a spawn is sent", () => {
  const said = (word: string): RunnerOps => ({ ...testOps(), refuses: () => word });
  const both = composite({ a: said('a refuses'), b: said('b refuses') }, 'a');
  assert.equal(both.refuses?.({ ...task, harness: 'b' }), 'b refuses');
  assert.equal(both.refuses?.(task), 'a refuses', 'and the fallback for a task that names none');
  // Through the layer, the shared checks come first whichever harness is named.
  assert.match(refusedBy(both, { ...task, harness: 'b', config: { effort: '' } }) ?? '', /^`effort` is empty\./);
});
