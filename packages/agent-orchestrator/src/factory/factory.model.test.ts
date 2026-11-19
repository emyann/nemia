/**
 * The factory model: a factory's name refuses what `factoryNameRefusal` refuses and takes what `nemia factory add` is given, a factory
 * decodes as its store reads one, a hire names its factory, step and agent by id, and a factory whose hire or schedule is of a workflow
 * it does not offer is refused.
 */
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { Option, Schema } from 'effect';
import { Factory, FactoryName, factoryModel, Hire } from './factory.model.ts';
import { erDiagram } from '../model/er.model.ts';

/** A factory as `readFactory` answers one: attached, hiring and scheduling, its instruction in the store. */
const PIPAO = {
  name: 'pipao',
  volumes: [{ path: '/home/me/code/app', readOnly: false }],
  workflows: ['build', 'intake'],
  hires: { 'build/implement': 'ada', 'intake/frame-the-idea': 'iris-2' },
  schedules: { build: { cron: '0 9 * * 1', brief: 'The week’s cleanup.', since: '2026-09-16T10:00:00.000Z' } },
  instruction: { store: true },
};

describe("a factory's name is checked on create by factoryNameRefusal's rule and read as any string", () => {
  test('refuses what factoryNameRefusal refuses', () => {
    for (const name of ['', 'Nemia', 'a/b', '.x', '-x', '..', 'a b', 'é', 'a'.repeat(41)])
      assert.equal(Option.isNone(FactoryName.create.option(name)), true, JSON.stringify(name));
  });
  test('takes what nemia factory add is given', () => {
    for (const name of ['pipao', 'nemia', 'nemia-2', '2x', 'a'.repeat(40), 'default'])
      assert.equal(Schema.is(FactoryName.OnCreate)(name), true, name);
  });
  test('reads a name written before the check', () => assert.equal(Schema.is(FactoryName.OnRead)('Old Name'), true));
});

describe('a factory decodes as its store reads one, and one whose wiring outlives a workflow it offers is refused', () => {
  test('attached, hiring and scheduling', () => assert.equal(Schema.decodeUnknownResult(Factory)(PIPAO)._tag, 'Success'));
  test("naming a workflow's repository, even of a workflow it no longer offers, which an upgrade may leave", () =>
    assert.equal(
      Schema.is(Factory)({
        name: 'acme',
        volumes: [{ path: '/r/app', readOnly: false }],
        workflows: ['mill'],
        hires: {},
        schedules: {},
        workflowRepos: { mill: 'app', gone: 'app' },
      }),
      true,
    ));
  test('as a factory’s apply files it, the template it was applied from read as written', () =>
    assert.equal(
      Schema.is(Factory)({
        name: 'acme',
        volumes: [{ path: '/r', readOnly: false }],
        workflows: [],
        hires: {},
        schedules: {},
        template: { source: 'templates/shop', version: '1.0.0', params: { budget: 7 } },
      }),
      true,
    ));
  test('with no volume, as nemia factory add files one given none', () =>
    assert.equal(Schema.is(Factory)({ ...PIPAO, volumes: [] }), true));
  test('as nemia factory add files it', () =>
    assert.equal(
      Schema.is(Factory)({ name: 'nemia', volumes: [{ path: '/r', readOnly: false }], workflows: [], hires: {}, schedules: {} }),
      true,
    ));
  const rows: Record<string, object> = {
    'a hire into a workflow it does not offer': { ...PIPAO, hires: { ...PIPAO.hires, 'quick/implement': 'ada' } },
    'a schedule of a workflow it does not offer': { ...PIPAO, schedules: { quick: PIPAO.schedules.build } },
  };
  for (const [row, factory] of Object.entries(rows)) test(`REFUSED: ${row}`, () => assert.equal(Schema.is(Factory)(factory), false));
});

test('a hire names its factory, its workflow and step, and its agent, each by id', () => {
  assert.equal(Schema.is(Hire)({ factory: 'pipao', workflow: 'build', step: 'implement', agent: 'ada' }), true);
  assert.equal(Schema.is(Hire)({ factory: 'pipao', step: 'build/implement', agent: 'ada' }), false, 'the workflow is its own field');
});

test("the factory's part of the diagram draws its four entities, and a FactoryName as the factory it names", () => {
  const lines = erDiagram(factoryModel).split('\n');
  for (const entity of ['Factory', 'AppliedTemplate', 'Hire', 'Volume'])
    assert.ok(lines.includes(`  ${entity} {`), `${entity} has a block`);
  assert.ok(lines.includes('  Factory ||--o{ Hire : factory'), lines.join('\n'));
});

describe('a factory mounts read-only volumes beside its writable ones, and one named twice is refused', () => {
  const acme = { name: 'acme', volumes: [{ path: '/r', readOnly: false }], workflows: [], hires: {}, schedules: {} };
  test('a folder beside its repositories', () =>
    assert.equal(Schema.is(Factory)({ ...acme, volumes: [...acme.volumes, { path: '/notes', readOnly: true }] }), true));
  const rows: Record<string, object> = {
    'a volume named twice': {
      ...acme,
      volumes: [
        { path: '/notes', readOnly: true },
        { path: '/notes', readOnly: false },
      ],
    },
  };
  for (const [row, factory] of Object.entries(rows)) test(`REFUSED: ${row}`, () => assert.equal(Schema.is(Factory)(factory), false));
});

describe('a factory names the harness settings a factory may set, and one naming another key or harness is refused, never stripped', () => {
  const acme = { name: 'acme', volumes: [{ path: '/r', readOnly: false }], workflows: [], hires: {}, schedules: {} };
  test('attribution off', () =>
    assert.equal(Schema.is(Factory)({ ...acme, harnessSettings: { claude: { attribution: { commit: '', pr: '' } } } }), true));
  const rows: Record<string, object> = {
    'a permission, which widens the fence': { ...acme, harnessSettings: { claude: { permissions: { allow: ['Bash(*)'] } } } },
    'a harness the runtime carries no settings of': { ...acme, harnessSettings: { codex: { model: 'x' } } },
  };
  for (const [row, factory] of Object.entries(rows)) test(`REFUSED: ${row}`, () => assert.equal(Schema.is(Factory)(factory), false));
});

describe('a factory sets a cost line for a workflow it offers, and one for a workflow it does not offer, or of no dollars, is refused', () => {
  const mill = { name: 'mill', volumes: [{ path: '/r', readOnly: false }], workflows: ['build'], hires: {}, schedules: {} };
  test('a line of $80 for build, which it offers', () => assert.equal(Schema.is(Factory)({ ...mill, costLines: { build: 80 } }), true));
  const rows: Record<string, object> = {
    'a line for a workflow it does not offer': { ...mill, costLines: { intake: 80 } },
    'a line of no dollars': { ...mill, costLines: { build: 0 } },
    'a line below zero': { ...mill, costLines: { build: -1 } },
  };
  for (const [row, factory] of Object.entries(rows)) test(`REFUSED: ${row}`, () => assert.equal(Schema.is(Factory)(factory), false));
});

describe("a writable volume cloned from a URL keeps its origin, and an old file's repos key is no factory", () => {
  const mill = { name: 'mill', workflows: [], hires: {}, schedules: {} };
  test('the URL of its one clone', () =>
    assert.equal(
      Schema.is(Factory)({ ...mill, volumes: [{ path: '/store/clones/h/o/r', readOnly: false, origin: 'https://h/o/r' }] }),
      true,
    ));
  test('REFUSED: repos, with no volumes', () => assert.equal(Schema.is(Factory)({ ...mill, repos: ['/r'] }), false));
});
