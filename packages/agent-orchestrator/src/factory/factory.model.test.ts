/**
 * The factory model: a factory's name refuses what `factoryNameRefusal` refuses and takes what `nemia factory add` is given, a factory
 * decodes as its store reads one, a hire names its factory, step and agent by id, and a factory whose hire or schedule is of a workflow
 * it does not offer is refused.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Option, Schema } from 'effect';
import { Factory, FactoryName, factoryModel, Hire } from './factory.model.ts';

/** A factory as `readFactory` answers one: attached, hiring and scheduling, its instruction in the store. */
const PIPAO = {
  name: 'pipao',
  repos: ['/home/me/code/app'],
  workflows: ['build', 'intake'],
  hires: { 'build/implement': 'ada', 'intake/frame-the-idea': 'iris-2' },
  schedules: { build: { cron: '0 9 * * 1', brief: 'The week’s cleanup.', since: '2026-09-16T10:00:00.000Z' } },
  instruction: { store: true },
};

test("a factory's name is checked on create by factoryNameRefusal's rule and read as any string", async (t) => {
  await t.test('refuses what factoryNameRefusal refuses', () => {
    for (const name of ['', 'Nemia', 'a/b', '.x', '-x', '..', 'a b', 'é', 'a'.repeat(41)])
      assert.equal(Option.isNone(FactoryName.create.option(name)), true, JSON.stringify(name));
  });
  await t.test('takes what nemia factory add is given', () => {
    for (const name of ['pipao', 'nemia', 'nemia-2', '2x', 'a'.repeat(40), 'default'])
      assert.equal(Schema.is(FactoryName.OnCreate)(name), true, name);
  });
  await t.test('reads a name written before the check', () => assert.equal(Schema.is(FactoryName.OnRead)('Old Name'), true));
});

test('a factory decodes as its store reads one, and one whose wiring outlives a workflow it offers is refused', async (t) => {
  await t.test('attached, hiring and scheduling', () => assert.equal(Schema.decodeUnknownResult(Factory)(PIPAO)._tag, 'Success'));
  await t.test('as nemia factory add files it', () =>
    assert.equal(Schema.is(Factory)({ name: 'nemia', repos: ['/r'], workflows: [], hires: {}, schedules: {} }), true),
  );
  const rows: Record<string, object> = {
    'no repository': { ...PIPAO, repos: [] },
    'a hire into a workflow it does not offer': { ...PIPAO, hires: { ...PIPAO.hires, 'quick/implement': 'ada' } },
    'a schedule of a workflow it does not offer': { ...PIPAO, schedules: { quick: PIPAO.schedules.build } },
  };
  for (const [row, factory] of Object.entries(rows))
    await t.test(`REFUSED: ${row}`, () => assert.equal(Schema.is(Factory)(factory), false));
});

test('a hire names its factory, its workflow and step, and its agent, each by id', () => {
  assert.equal(Schema.is(Hire)({ factory: 'pipao', workflow: 'build', step: 'implement', agent: 'ada' }), true);
  assert.equal(Schema.is(Hire)({ factory: 'pipao', step: 'build/implement', agent: 'ada' }), false, 'the workflow is its own field');
  assert.deepEqual(factoryModel.ids, { FactoryName: 'Factory' });
  assert.deepEqual(factoryModel.entities, [Factory, Hire]);
});
