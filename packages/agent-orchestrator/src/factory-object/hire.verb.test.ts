/**
 * A factory's Hires (hire.verb.ts), over the Workflow door's files in a scratch store: one per step offered, named `<workflow>.<step>`;
 * who fills each and where its model came from; a step its file and a hire both fill refused; and two steps whose names join to one,
 * both listed with an error and neither got by it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Exit, Schema } from 'effect';
import { Hire } from 'objects';
import { scratch } from 'test-kit/scratch';
import { StoreRoot } from '../config/root.store.ts';
import { hireNamedIn, hiresOf, type HiringFactory } from './hire.verb.ts';

const home = scratch('nemia-hire-object-');
const repo = scratch('nemia-hire-object-repo-');
const write = (at: string, text: string) => {
  fs.mkdirSync(path.dirname(at), { recursive: true });
  fs.writeFileSync(at, text);
};
const wf = path.join(repo, 'workflows');
write(path.join(wf, 'make', 'implement.md'), '---\nplace: git\nmodel: opus\n---\nImplement it.\n');
write(path.join(wf, 'make', 'plan.md'), '---\nplace: git\nagent: reviewer\n---\nPlan it.\n');
write(path.join(wf, 'make', 'review.md'), '---\nplace: git\nagent: reviewer\n---\nReview it.\n');
write(path.join(wf, 'make', 'land.md'), '---\nplace: git\n---\nLand it.\n');
write(path.join(wf, 'agents', 'reviewer.md'), '---\nmodel: sonnet\n---\nYou are reviewer.\n');
write(path.join(wf, 'agents', 'implementer.md'), '---\neffort: high\n---\nYou are implementer.\n');
write(path.join(wf, 'a.b', 'c.md'), '---\nplace: git\n---\nDo c.\n');
write(path.join(wf, 'a', 'b.c.md'), '---\nplace: git\n---\nDo b.c.\n');
write(path.join(wf, 'other', 'x.md'), '---\nplace: git\n---\nDo x.\n');

const acme: HiringFactory = {
  name: 'acme',
  hires: { 'make/implement': 'implementer', 'make/review': 'implementer' },
  workflows: ['make', 'a.b', 'a'],
  repo,
};

const hires = await Effect.runPromise(hiresOf(acme, home, '2026-11-01T00:00:00.000Z').pipe(Effect.provide(StoreRoot.layer(home))));
const named = (name: string) => hires.find((h) => h.metadata.name === name);

test('one Hire per step of each workflow the factory offers, named <workflow>.<step>, each a Hire of objects', () => {
  assert.deepEqual(hires.map((h) => h.metadata.name).sort(), ['a.b.c', 'a.b.c', 'make.implement', 'make.land', 'make.plan', 'make.review']);
  for (const h of hires) assert.ok(Schema.is(Hire)(h), h.metadata.name);
  assert.equal(named('make.implement')?.metadata.namespace, 'acme');
});

test('who fills a step: the factory, the step itself, neither, or both, refused', () => {
  assert.equal(named('make.implement')?.status.filled, 'factory');
  assert.equal(named('make.implement')?.status.agent, 'implementer');
  assert.equal(named('make.implement')?.spec.agent, 'implementer');
  assert.equal(named('make.plan')?.status.filled, 'step');
  assert.equal(named('make.plan')?.status.agent, 'reviewer');
  assert.equal(named('make.land')?.status.filled, 'unfilled');
  assert.equal(named('make.review')?.status.filled, 'refused');
  assert.match(named('make.review')?.status.error ?? '', /nemia factory fire acme --step make\/review/);
});

test("where a setting came from: the step's own file, its agent's, or the harness's default", () => {
  assert.deepEqual(named('make.implement')?.status.settings.model, { value: 'opus', from: 'step' });
  assert.equal(named('make.implement')?.status.settings.effort.from, 'agent');
  assert.deepEqual(named('make.plan')?.status.settings.model, { value: 'sonnet', from: 'agent' });
  assert.equal(named('make.land')?.status.settings.model.from, 'default');
});

test('two steps whose names join to one are both listed with an error naming the other, and a read by it is Conflict', async () => {
  const both = hires.filter((h) => h.metadata.name === 'a.b.c');
  assert.equal(both.length, 2);
  for (const h of both) {
    assert.match(h.status.error ?? '', /the step c of a\.b/);
    assert.match(h.status.error ?? '', /the step b\.c of a/);
  }
  const got = await Effect.runPromiseExit(hireNamedIn(hires, 'acme', 'a.b.c'));
  assert.ok(Exit.isFailure(got) && JSON.stringify(got.cause).includes('"_tag":"Conflict"'));
  const none = await Effect.runPromiseExit(hireNamedIn(hires, 'acme', 'make.none'));
  assert.ok(Exit.isFailure(none) && JSON.stringify(none.cause).includes('"_tag":"Missing"'));
  assert.equal((await Effect.runPromise(hireNamedIn(hires, 'acme', 'make.plan'))).metadata.name, 'make.plan');
});
