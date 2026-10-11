/**
 * `nemia admit --at-least`: each run a call names read off its record for its factory, and each factory for its level, at the moment of
 * the call; a call acting on a factory below the floor denied, one above it answered as with no floor, and a run that does not read
 * asked. `nemia admit --auto`: an approval the agent's rules allow given unasked for a run of a factory at auto where all agree, and
 * asked where a fact fails, at semi-auto, or once the person dropped the rule. A store of its own, since `WF_ROOT` is read as the module
 * loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from '../../test/scratch.ts';
import { Effect } from 'effect';
import { testEngine } from 'agent-runtime/testing';

const ROOT = scratch('wf-admit-');
process.env.WF_ROOT = ROOT;
const { ADMIT, admitted } = await import('./admit.verb.ts');
const { TABLE } = await import('../command/commands.verb.ts');
const { addFactory } = await import('../factory/factory.store.ts');
const { writeFactoryLevel } = await import('../level/level.store.ts');
const { writeLevel } = await import('../nemia/level.store.ts');
const { engineOf, runWith } = await import('../runtime-client.ts');
const { confirmedFile, dropRule } = await import('../auto/auto.store.ts');

const fake = testEngine();
const e = engineOf(fake.layer);

/** Writes the run `id`'s record, started in `factory`, or in none, its steps `workflow` filed as `steps` say. */
function writeRun(
  id: string,
  factory?: string,
  workflow: object[] = [{ name: 'build', after: [], body: 'Build it.', harness: 'codex' }],
  steps = {},
) {
  fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
  const record = {
    id,
    workspace: ROOT,
    brief: `The brief of ${id}`,
    createdAt: '2026-10-06T08:00:00.000Z',
    workflowDir: path.join(ROOT, 'no-such-workflow'),
    place: { kind: 'folder' },
    workflow,
    steps,
    ...(factory === undefined ? {} : { factory }),
  };
  fs.writeFileSync(path.join(ROOT, 'runs', `${id}.json`), JSON.stringify(record));
}

for (const name of ['pipao', 'hkb']) addFactory({ name, repos: [fs.mkdtempSync(path.join(ROOT, `${name}-`))] });
writeRun('r-pipao', 'pipao');
writeRun('r-hkb', 'hkb');
writeRun('r-default');
writeFactoryLevel('hkb', { since: '2026-10-06T08:00:00.000Z', raise: { level: 'semi-auto', until: '2099-01-01T00:00:00.000Z' } });

/** Admission's decision for the shell line `command` at the floor `semi-auto`, or none. */
const decided = async (command: string, floor: 'semi-auto' | 'none' = 'semi-auto') =>
  (await runWith(e, admitted(JSON.stringify({ tool: 'Bash', input: { command }, cwd: '/w' }), TABLE, floor === 'none' ? undefined : floor)))
    ?.decision;

test('REFUSED: a call on a run of a factory at manual, or on the factory, is denied; one raised is hers; an unread run is asked', async () => {
  assert.equal(await decided('nemia show r-pipao'), 'deny');
  assert.equal(await decided('nemia start ./brief.md --factory pipao'), 'deny');
  assert.equal(await decided('nemia show r-default'), 'deny', "the default factory follows the store's level, manual where unset");
  assert.equal(await decided('nemia show r-hkb'), undefined, 'a factory raised above manual is hers');
  assert.equal(await decided('nemia show r-gone'), 'ask');
  assert.equal(await decided('nemia show r-pipao', 'none'), undefined, 'no floor, no scope');
  writeLevel({ level: 'semi-auto', since: '2026-10-06T08:00:00.000Z' });
  assert.equal(await decided('nemia show r-default'), undefined, "the store's level raises the default factory");
  assert.equal(await decided('nemia show r-pipao'), undefined, 'and every factory without its own');
});

test('REFUSED: a floor that is no level', () => {
  assert.equal(ADMIT.check?.({ atLeast: 'on' }), '"on" is no level: nemia admit [--at-least manual|semi-auto|auto] [--auto <agent>].');
  assert.equal(ADMIT.check?.({ atLeast: 'semi-auto' }), null);
});

/** Puts on the board a task settled as it succeeded, with `closeout` and its exit code. */
const settled = (id: string, closeout?: unknown, exitCode = 0) => {
  Effect.runSync(e.file({ id, brief: `the task ${id}`, cwd: ROOT }));
  fake.settle(id, 'succeeded', { ...(closeout === undefined ? {} : { closeout }), exitCode });
};

for (const name of ['auto', 'semi']) addFactory({ name, repos: [fs.mkdtempSync(path.join(ROOT, `${name}-`))] });
writeFactoryLevel('auto', { since: '2026-10-06T08:00:00.000Z', raise: { level: 'auto', until: '2099-01-01T00:00:00.000Z' } });
writeFactoryLevel('semi', { since: '2026-10-06T08:00:00.000Z', raise: { level: 'semi-auto', until: '2099-01-01T00:00:00.000Z' } });
const GATED = [{ name: 'build', after: [], body: 'Build it.', harness: 'codex', gate: true, check: 'npm test' }];
for (const [id, factory] of [
  ['g-auto', 'auto'],
  ['g-semi', 'semi'],
  ['g-refused', 'auto'],
] as const)
  writeRun(id, factory, GATED, { build: { taskId: `${id}-build`, check: { taskId: `${id}-check` } } });
for (const id of ['g-auto', 'g-semi', 'g-refused']) settled(`${id}-build`, { outcome: 'done', summary: 'Built.', artifacts: [] });
settled('g-auto-check', undefined, 0);
settled('g-semi-check', undefined, 0);
settled('g-refused-check', undefined, 1);

/** Admission's decision for the shell line `command` with nemia's rules at auto, or none. */
const decidedAtAuto = async (command: string) =>
  (await runWith(e, admitted(JSON.stringify({ tool: 'Bash', input: { command }, cwd: '/w' }), TABLE, undefined, 'nemia', ROOT)))?.decision;

test('at auto, an approval the default allows is given unasked; at semi-auto, on a refused check, with the default dropped, or a list unread, asked', async () => {
  assert.equal(await decided('nemia approve g-auto build', 'none'), 'ask', 'no rules handed, the approval is asked');
  assert.equal(await decidedAtAuto('nemia approve g-auto build'), undefined);
  assert.equal(await decidedAtAuto('nemia approve g-semi build'), 'ask', 'the same state at semi-auto');
  assert.equal(await decidedAtAuto('nemia approve g-refused build'), 'ask', 'its check refused');
  assert.equal(await decidedAtAuto('nemia approve g-gone build'), 'ask', 'a run that does not read');
  assert.equal(await decidedAtAuto('nemia auto confirm nemia default'), 'ask');
  dropRule(ROOT, 'nemia', 'default', new Date('2026-10-06T09:00:00.000Z'));
  assert.equal(await decidedAtAuto('nemia approve g-auto build'), 'ask', 'nothing in force');
  fs.writeFileSync(confirmedFile(ROOT, 'nemia'), '{');
  assert.equal(await decidedAtAuto('nemia approve g-auto build'), 'ask', 'a list that does not read lets nothing through');
});

test('REFUSED: --auto naming no agent', () => {
  assert.match(ADMIT.check?.({ auto: '../x' }) ?? '', /^`..\/x` is not an agent's name:/);
  assert.equal(ADMIT.check?.({ auto: 'nemia' }), null);
});
