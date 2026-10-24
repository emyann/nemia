/**
 * `nemia start` asks the runtime of each local step's first filing's config (`configRefused`, which `stepsToStart` asks last, before any
 * run is written) and refuses one it refuses, in its words, after the step's line they come from. The load judges no harness's words,
 * so a folder that names one its harness refuses loads, and is refused here: by `startRun` and `startPlan` with nothing written, and
 * started once the refusal `startRun` reads (`StartRefusal`) is another. `WF_ROOT` is set before the import, since the module reads it as
 * it loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { scratch } from './scratch.ts';
import { testPlace } from '../place/memory/index.ts';
import { eachTest, runGiven } from './placed.ts';

const ROOT = scratch('wf-start-config-');
process.env.WF_ROOT = ROOT;
const { configRefused, startRun, StartRefusal, stepsToStart } = await import('../src/start/start.verb.ts');
const stand = eachTest(testPlace);
const runPlaced = runGiven(() => stand().layer);
const { startPlan } = await import('../src/plan/plan.verb.ts');
type ConfigRefused = import('../src/start/start.verb.ts').ConfigRefused;
type Workflow = import('../src/step/step.ts').Workflow;
const { configRefusal } = await import('../src/runtime-client.ts');
const { declared } = await import('../place/git/declared.ts');

/** A folder of `implement`, with `own` among its keys, and its ending `ship`, which lands on its check once approved, with `ending`. */
function folder(name: string, own = 'effort: high', ending = 'gate: true'): string {
  const dir = path.join(ROOT, 'workflows', name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'implement.md'), `---\nplace: git\n${own}\n---\nBuild it.\n`);
  fs.writeFileSync(
    path.join(dir, 'ship.md'),
    `---\nafter: implement\nplace: git\nworkspace: main\n${ending}\ncheck: npm test\n---\nShip it.\n`,
  );
  return dir;
}

/** A repository with one commit, so a run has a base to record. */
function aRepo(): string {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  stand().world.repository(repo, {});
  return repo;
}

const runsWritten = (): string[] =>
  fs.existsSync(path.join(ROOT, 'runs'))
    ? fs
        .readdirSync(path.join(ROOT, 'runs'))
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.slice(0, -5))
        .sort()
    : [];

/** `startRun` of `workflowDir` in a repository of its own, run to its end: the run's id, or the refusal it failed with. */
function started(workflowDir: string, opts: { gates?: string[]; refused?: ConfigRefused } = {}): string {
  const program = startRun({ brief: 'add a flag', repo: aRepo(), workflowDir, gates: opts.gates });
  const placed = program.pipe(Effect.provide(stand().layer));
  const exit = Effect.runSyncExit(opts.refused ? placed.pipe(Effect.provideService(StartRefusal, opts.refused)) : placed);
  if (exit._tag === 'Success') return exit.value.id;
  throw Effect.runSync(Effect.flip(Effect.failCause(exit.cause)));
}

const places = { home: ROOT };
const GATED = folder('gated');

/** What the git place denies a landing session, as a start hands it on. */
const DENIED = declared.denyWhileLanding;

test("REFUSED: a step's value its harness refuses, named by the line it comes from and the field it is filed as", () => {
  const steps = stepsToStart(GATED, true, places, DENIED).map((s) => (s.name === 'implement' ? { ...s, effort: 'ultra' } : s));
  assert.equal(
    configRefused(steps, places, [], DENIED),
    `implement: \`effort: ultra\` (filed as \`effort\`): ${configRefusal('claude', { effort: 'ultra' })}`,
  );
});

test('REFUSED: an ending on a harness that cannot be denied the commit it lands, named by the step alone, as no line of it gave the deny list', () => {
  const steps = stepsToStart(GATED, true, places, DENIED).map((s) => (s.name === 'ship' ? { ...s, harness: 'codex' } : s));
  const why = configRefused(steps, places, [], DENIED);
  assert.equal(why, `ship: ${configRefusal('codex', { disallowedTools: [...declared.denyWhileLanding] })}`);
});

test('REFUSED: the deny list follows an ending that lands on its check, gated or not — and an ending with no `check:` takes none', () => {
  const codex = (over: Partial<Workflow>) =>
    stepsToStart(GATED, true, places, DENIED).map((s) => (s.name === 'ship' ? { ...s, harness: 'codex', ...over } : s));
  const ungated = codex({ gate: undefined });
  assert.match(
    configRefused(ungated, places, [], DENIED)!,
    /^ship: .*is a deny list/,
    'an ungated ending lands on its check all the same — its workflow files it — so it is denied the commit, which codex cannot be',
  );
  assert.match(configRefused(ungated, places, ['ship'], DENIED)!, /^ship: .*is a deny list/, 'and a gate given at start changes nothing');
  assert.equal(
    configRefused(codex({ gate: undefined, check: undefined }), places, [], DENIED),
    undefined,
    'an ending with no check lands nothing on one: its session commits in its own prose, and nothing is denied it',
  );
});

test('a step on a remote agent is asked nothing, and a folder whose every step its harness takes is no refusal', () => {
  const steps = stepsToStart(GATED, true, places, DENIED);
  assert.equal(configRefused(steps, places, [], DENIED), undefined);
  const remote = steps.map((s) => (s.name === 'implement' ? { ...s, harness: 'a2a:reviewer', effort: 'ultra' } : s));
  assert.equal(configRefused(remote, places, [], DENIED), undefined);
});

const ULTRA = folder('ultra', 'effort: ultra');
const ULTRA_REFUSED = `implement: \`effort: ultra\` (filed as \`effort\`): ${configRefusal('claude', { effort: 'ultra' })}`;

test("REFUSED at `nemia start`: a step whose line its harness refuses fails `startRun` as Invalid, naming the step and its line, in the runtime's words, and no run is written", () => {
  const before = runsWritten();
  assert.throws(
    () => started(ULTRA),
    (err: Error & { _tag?: string }) => err._tag === 'Invalid' && err.message === ULTRA_REFUSED,
  );
  assert.deepEqual(runsWritten(), before);
});

test('REFUSED at `nemia start <folder>`: a card whose workflow has a step its harness refuses fails `startPlan` behind the card, and no run is written', async () => {
  const plan = fs.mkdtempSync(path.join(ROOT, 'plan-'));
  fs.writeFileSync(path.join(plan, 'card.md'), `---\nworkflow: ${ULTRA}\n---\nadd a flag\n`);
  const before = runsWritten();
  await assert.rejects(
    async () => await runPlaced(startPlan({ dir: plan, repo: aRepo() })),
    (err: Error & { _tag?: string }) => err._tag === 'Invalid' && err.message === `card.md: \`workflow: ${ULTRA}\` — ${ULTRA_REFUSED}`,
  );
  assert.deepEqual(runsWritten(), before);
});

test('the same folder starts when the refusal `startRun` reads takes every step: the refusal came from the gate, not from the load', () => {
  const id = started(ULTRA, { refused: () => undefined });
  assert.ok(runsWritten().includes(id));
});

test('the gates `startRun` is given are the gates its refusal is asked of the steps with', () => {
  const asked: (readonly string[])[] = [];
  started(folder('gates-asked'), {
    gates: ['implement'],
    refused: (_steps: unknown, _places: unknown, gates: readonly string[]) => void asked.push(gates),
  });
  assert.deepEqual(asked, [['implement']]);
});

test("REFUSED at `nemia start`: `remote: true` where the runtime bridges no session — codex — named by its line, in the runtime's words; taken on a claude job, and `remote: false` on any", () => {
  const before = runsWritten();
  assert.throws(
    () => started(folder('remote-codex', 'harness: codex\nremote: true')),
    (err: Error) =>
      err.message === `implement: \`remote: true\` (filed as \`claude\`): ${configRefusal('codex', { claude: { remoteControl: true } })}`,
  );
  assert.deepEqual(runsWritten(), before);
  for (const own of ['remote: true', 'harness: claude\nremote: true']) assert.ok(started(folder(`bridged-${own.length}`, own)), own);
  assert.ok(started(folder('unbridged', 'harness: codex\nremote: false')));
});

test('REFUSED at `nemia start`, before a run is written: a factory file that still says `background:` or `harness: claude-detached`, each naming the line to delete', () => {
  for (const own of ['background: true', 'background: false', 'harness: claude-detached']) {
    const before = runsWritten();
    assert.throws(
      () => started(folder(`retired-${own.replace(/\W+/g, '-')}`, own)),
      (err: Error & { _tag?: string }) =>
        err._tag === 'Invalid' && err.message.startsWith('implement: ') && err.message.includes('Delete the line'),
      own,
    );
    assert.deepEqual(runsWritten(), before, own);
  }
});

test("REFUSED at `nemia start`, every word the load once judged by a copy of the runtime's lists, now by the runtime, after the step's line", () => {
  const cases: [string, string, string, Record<string, unknown>][] = [
    ['effort: ultra', 'claude', 'effort', { effort: 'ultra' }],
    ['harness: codex\neffort: ultra', 'codex', 'effort', { effort: 'ultra' }],
    ['permissionMode: read-only', 'claude', 'permissionMode', { permissionMode: 'read-only' }],
    ['harness: claude\npermissionMode: yolo', 'claude', 'permissionMode', { permissionMode: 'yolo' }],
    ['harness: codex\nsandbox: plan', 'codex', 'permissionMode', { permissionMode: 'plan' }],
    ['context: 50k', 'claude', 'contextTokens', { contextTokens: 50_000 }],
    ['harness: codex\ncontext: 200k', 'codex', 'contextTokens', { contextTokens: 200_000 }],
    ['harness: codex\nbudget: 5', 'codex', 'budgetUsd', { budgetUsd: 5 }],
    ['harness: codex\nallowedTools: Read', 'codex', 'allowedTools', { allowedTools: ['Read'] }],
    ['harness: codex\ndisallowedTools: Bash(git push)', 'codex', 'disallowedTools', { disallowedTools: ['Bash(git push)'] }],
  ];
  for (const [own, harness, field, config] of cases) {
    const line = own.split('\n').at(-1)!;
    const before = runsWritten();
    assert.throws(
      () => started(folder(`words-${runsWritten().length}-${own.replace(/\W+/g, '-')}`, own)),
      (err: Error & { _tag?: string }) =>
        err._tag === 'Invalid' && err.message === `implement: \`${line}\` (filed as \`${field}\`): ${configRefusal(harness, config)}`,
      own,
    );
    assert.deepEqual(runsWritten(), before, own);
  }
});

test("REFUSED at `nemia start`: a codex sandbox written under its former name, `permissionMode:`, is quoted as the file writes it — the step's own line, or its agent's — never as the `sandbox:` it is read as", () => {
  const refusedAs = `implement: \`permissionMode: dontAsk\` (filed as \`permissionMode\`): ${configRefusal('codex', { permissionMode: 'dontAsk' })}`;
  const own = folder('former-mode', 'harness: codex\npermissionMode: dontAsk');
  assert.throws(
    () => started(own),
    (err: Error) => err.message === refusedAs,
  );
  fs.mkdirSync(path.join(ROOT, 'workflows', 'agents'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'workflows', 'agents', 'moded.md'), '---\nharness: codex\npermissionMode: dontAsk\n---\nYou build.\n');
  const before = runsWritten();
  assert.throws(
    () => started(folder('former-mode-agent', 'agent: moded')),
    (err: Error) => err.message === refusedAs,
    "the agent's line, for a step that writes no fence of its own",
  );
  assert.deepEqual(runsWritten(), before);
});

test("a lone step in the checkout and an ending after a step start in a store whose path every permission rule carries, and their runs are written: the store's refusal asks the root", () => {
  const lone = path.join(ROOT, 'workflows', 'lone-ending');
  fs.mkdirSync(lone, { recursive: true });
  fs.writeFileSync(path.join(lone, 'ship.md'), '---\nplace: git\nworkspace: main\n---\nShip it.\n');
  for (const dir of [lone, GATED]) {
    const id = started(dir);
    assert.ok(runsWritten().includes(id), dir);
  }
});
