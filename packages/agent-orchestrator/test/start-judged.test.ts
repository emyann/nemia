/**
 * `nemia start` judging a folder's steps before a run is written (`stepsToStart`), told on the stage (`story.ts`): a step given a tool
 * no rule of its session names is refused, naming the step, the tool, the fence and the fixes (`unallowedRefusal`), and starts once the
 * repository the run works on allows it, its rules read at the start; the harness's trust of that repository said as the second thing
 * to check where it is withheld (`untrustedNote`). Then three tables: the runtime asked of each local step's first filing
 * (`configRefused`), pure; a start refused in the runtime's words, after the step's line they come from, by `startRun` and `startPlan`
 * with nothing written, and started once the refusal `startRun` reads (`StartRefusal`) is another; and a store whose path a permission
 * rule cannot carry, refused in the store's words before the runtime's (`storeRootRefusal`).
 *
 * The store's root is read as the modules load, so it is one for the file, and holds a `(`: a step naming nothing under the store starts
 * there, which every start of the story and the second table is. A root that holds a `*`, and one every rule carries, are rows of the
 * pure `storeRootRefusal` (`src/start/store-root.test.ts`); an ending after a step starting under a root every rule carries is the
 * start of `mounts.test.ts`'s story. `WF_ROOT` is set before the runner is imported.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { scratch } from './scratch.ts';
import { names } from './assessed.ts';
import { staged, story } from './story.ts';

const ROOT = path.join(scratch('wf-start-judged-'), 'First (Last)');
fs.mkdirSync(ROOT);
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
const { runWith } = await import('../src/runner.ts');
const { configRefused, startRun, StartRefusal, stepsToStart } = await import('../src/start/start.verb.ts');
const { startPlan } = await import('../src/plan/plan.verb.ts');
const { loadWorkflows } = await import('../src/folder/folder.store.ts');
const { configRefusal, engineOf } = await import('../src/runtime-client.ts');
const { main } = await import('../src/cli/main.ts');
const stage = staged({ runWith, main, engineOf });
type ConfigRefused = import('../src/start/start.verb.ts').ConfigRefused;
type Workflow = import('../src/step/step.ts').Workflow;
type Refusal = Error & { _tag?: string; exitCode?: number };

/** A holder of the workflow folder `name` of `steps`, and of `agents` beside it: the folder's path. */
function folder(name: string, steps: Record<string, string>, agents: Record<string, string> = {}): string {
  const dir = path.join(ROOT, 'trees', name, 'workflows', name);
  fs.mkdirSync(path.join(dir, '..', 'agents'), { recursive: true });
  fs.mkdirSync(dir, { recursive: true });
  for (const [step, text] of Object.entries(steps)) fs.writeFileSync(path.join(dir, `${step}.md`), text);
  for (const [agent, text] of Object.entries(agents)) fs.writeFileSync(path.join(dir, '..', 'agents', `${agent}.md`), text);
  return dir;
}

/** A folder of one step, `implement`, with `own` among its keys, and `agents` beside it. */
const lone = (name: string, own: string, agents: Record<string, string> = {}) =>
  folder(name, { implement: `---\nplace: git\n${own}\n---\nBuild it.\n` }, agents);

/** The repository's own harness settings, allowing `allow` and nothing else. */
function settings(repo: string, allow: readonly string[]): void {
  fs.mkdirSync(path.join(repo, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.claude', 'settings.json'), JSON.stringify({ permissions: { allow: [...allow] } }));
}

/** A repository with one commit, so a run has a base to record; with its own settings allowing `allow` where it is given. */
function aRepo(allow?: readonly string[]): string {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  stage.place().world.repository(repo, {});
  if (allow) settings(repo, allow);
  return repo;
}

/** The runs on disk, by id. */
const runsWritten = (): string[] =>
  fs.existsSync(path.join(ROOT, 'runs'))
    ? fs
        .readdirSync(path.join(ROOT, 'runs'))
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.slice(0, -5))
        .sort()
    : [];

/** Whether the run `id` is written to disk. */
const written = (id: string): boolean => runsWritten().includes(id);

/** `startRun` of `workflowDir` in `repo` (one of its own by default): the run's id, or the refusal it failed with, thrown. */
function started(
  workflowDir: string,
  opts: { repo?: string; gates?: string[]; inputs?: string[]; refused?: ConfigRefused; isolate?: boolean } = {},
): string {
  const program = startRun({
    brief: 'add a flag',
    repo: opts.repo ?? aRepo(),
    workflowDir,
    gates: opts.gates,
    ...(opts.inputs ? { inputs: opts.inputs } : {}),
    ...(opts.isolate === undefined ? {} : { isolate: opts.isolate }),
  });
  const placed = program.pipe(Effect.provide(stage.place().layer));
  const exit = Effect.runSyncExit(opts.refused ? placed.pipe(Effect.provideService(StartRefusal, opts.refused)) : placed);
  if (exit._tag === 'Success') return exit.value.id;
  throw Effect.runSync(Effect.flip(Effect.failCause(exit.cause)));
}

/** That `act` is refused as `Invalid` with exit 2, naming each of `facts`, and writes no run: the refusal's words. */
async function refused(act: () => unknown, ...facts: string[]): Promise<string> {
  const before = runsWritten();
  let failed: Refusal | undefined;
  try {
    await act();
  } catch (err) {
    failed = err as Refusal;
  }
  assert.ok(failed, 'refused');
  assert.deepEqual([failed._tag, failed.exitCode], ['Invalid', 2], failed.message);
  names(failed.message, ...facts);
  assert.deepEqual(runsWritten(), before, 'nothing written');
  return failed.message;
}

test('nemia start judges what a session may call: a tool no rule names refused, started once the repository allows it, its trust said second', async (t) => {
  const s = story(t);
  const held = folder(
    'held',
    { design: '---\nplace: git\nagent: architect\n---\nWrite the spec.\n' },
    { architect: '---\nrole: Architect\npermissionMode: dontAsk\ntools: Read, Grep, Glob, WebFetch\n---\nDesign it.\n' },
  );

  await s.test(
    'REFUSED: a step given a tool no rule of its session names, as Invalid with exit 2, naming the step, the tool, the fence and the fix',
    async () => {
      const said = await refused(
        () => started(held),
        'gives its session `WebFetch`',
        'agents/architect.md',
        'take `WebFetch` off `tools:`',
      );
      assert.match(said, /^design: /);
    },
  );

  await s.test('a trust the harness withholds is said as the second thing to check, and nothing is said where it is given', async () => {
    const config = scratch('wf-untrusted-');
    process.env.CLAUDE_CONFIG_DIR = config;
    try {
      names(await refused(() => started(held)), 'gives its session `WebFetch`', 'Check too that', ' trusts ', 'withholds ');
      const trusted = aRepo();
      fs.writeFileSync(
        path.join(config, '.claude.json'),
        JSON.stringify({ projects: { [path.resolve(trusted)]: { hasTrustDialogAccepted: true } } }),
      );
      const said = await refused(() => started(held, { repo: trusted }), 'gives its session `WebFetch`');
      assert.equal(said.includes('Check too that'), false, 'a trusted repository adds no second thing to check');
    } finally {
      delete process.env.CLAUDE_CONFIG_DIR;
    }
  });

  await s.test('the same folder starts in a repository whose own settings allow the call, scoped or bare', () => {
    for (const allow of [['WebFetch'], ['WebFetch(domain:example.com)', 'Bash(npm test)']])
      assert.ok(written(started(held, { repo: aRepo(allow) })), allow.join(', '));
  });

  await s.test(
    'the rules are read off the repository at the start: the folder refused there starts once that repository allows it',
    async () => {
      const repo = aRepo();
      await refused(() => started(held, { repo }), 'gives its session `WebFetch`');
      settings(repo, ['WebFetch']);
      assert.ok(written(started(held, { repo })), 'the same folder and the same repository, with the rule added');
    },
  );
});

/** What a place denies a landing session, as a start hands it on: a commit, as the git place denies one, given here by hand. */
const DENIED = ['Bash(git commit:*)'];
const PLACES = { home: ROOT };

test("configRefused: the runtime asked of each local step's first filing, refused in its words after the line it comes from", async (t) => {
  const gated = folder('gated', {
    implement: '---\nplace: git\neffort: high\n---\nBuild it.\n',
    ship: '---\nafter: implement\nplace: git\nworkspace: base\ngate: true\ncheck: npm test\n---\nShip it.\n',
  });
  const steps = loadWorkflows(gated, PLACES);
  const over = (name: string, more: Partial<Workflow>) => steps.map((s) => (s.name === name ? { ...s, ...more } : s));

  await t.test("REFUSED: a step's value its harness refuses, named by the line it comes from and the field it is filed as", () => {
    names(
      configRefused(over('implement', { effort: 'ultra' }), PLACES, [], DENIED),
      'implement: `effort: ultra` (filed as `effort`): ',
      configRefusal('claude', { effort: 'ultra' })!,
    );
  });

  await t.test('REFUSED: an ending on a harness that cannot be denied the commit it lands, named by the step alone', () => {
    const why = configRefused(over('ship', { harness: 'codex' }), PLACES, [], DENIED);
    names(why, `ship: ${configRefusal('codex', { disallowedTools: [...DENIED] })}`);
  });

  await t.test(
    'REFUSED: the deny list follows an ending that lands on its check, gated or not; an ending with no `check:` takes none',
    () => {
      const ungated = over('ship', { harness: 'codex', gate: undefined });
      assert.match(
        configRefused(ungated, PLACES, [], DENIED)!,
        /^ship: .*is a deny list/,
        'an ungated ending lands on its check all the same',
      );
      assert.match(configRefused(ungated, PLACES, ['ship'], DENIED)!, /^ship: .*is a deny list/, 'a gate given at start changes nothing');
      assert.equal(configRefused(over('ship', { harness: 'codex', gate: undefined, check: undefined }), PLACES, [], DENIED), undefined);
    },
  );

  await t.test('a step on a remote agent is asked nothing, and a folder whose every step its harness takes is no refusal', () => {
    const [implement] = loadWorkflows(lone('taken', 'effort: high'), PLACES);
    assert.equal(configRefused([implement], PLACES, [], DENIED), undefined);
    assert.equal(configRefused([{ ...implement, harness: 'a2a:reviewer', effort: 'ultra' }], PLACES, [], DENIED), undefined);
  });

  await t.test('stepsToStart asks the same of a folder it lets through, the gates beside the workflow', () => {
    const asked: (readonly string[])[] = [];
    stepsToStart(
      lone('let-through', 'effort: high'),
      true,
      PLACES,
      DENIED,
      undefined,
      ['implement'],
      (_s, _p, gates) => void asked.push(gates),
    );
    assert.deepEqual(asked, [['implement']]);
  });
});

test("REFUSED at nemia start, before a run is written: a step's first filing its harness refuses, in the runtime's words after the step's line", async (t) => {
  const ultra = lone('ultra', 'effort: ultra');
  const ultraSaid = ['implement: `effort: ultra` (filed as `effort`): ', configRefusal('claude', { effort: 'ultra' })!];

  await t.test('REFUSED: a step whose line its harness refuses fails startRun as Invalid, exit 2, and no run is written', async () => {
    await refused(() => started(ultra), ...ultraSaid);
  });

  await t.test('REFUSED: a card whose workflow has a step its harness refuses fails startPlan behind the card', async () => {
    const plan = fs.mkdtempSync(path.join(ROOT, 'plan-'));
    fs.writeFileSync(path.join(plan, 'card.md'), `---\nworkflow: ${ultra}\n---\nadd a flag\n`);
    await refused(() => stage.runPlaced(startPlan({ dir: plan, repo: aRepo() })), `card.md: \`workflow: ${ultra}\` — `, ...ultraSaid);
  });

  await t.test(
    'the same folder starts when the refusal startRun reads takes every step: the refusal came from the gate, not the load',
    () => {
      assert.ok(written(started(ultra, { refused: () => undefined })));
    },
  );

  await t.test('the gates startRun is given are the gates its refusal is asked of the steps with', () => {
    const asked: (readonly string[])[] = [];
    started(lone('gates-asked', 'effort: high'), {
      gates: ['implement'],
      refused: (_steps: unknown, _places: unknown, gates: readonly string[]) => void asked.push(gates),
    });
    assert.deepEqual(asked, [['implement']]);
  });

  await t.test(
    'REFUSED: `remote: true` where the runtime bridges no session — codex — named by its line; taken on a claude job, and `remote: false` on any',
    async () => {
      await refused(
        () => started(lone('remote-codex', 'harness: codex\nremote: true')),
        'implement: `remote: true` (filed as `claude`): ',
        configRefusal('codex', { claude: { remoteControl: true } })!,
      );
      for (const own of ['remote: true', 'harness: claude\nremote: true', 'harness: codex\nremote: false'])
        assert.ok(started(lone(`bridged-${own.replace(/\W+/g, '-')}`, own)), own);
    },
  );

  for (const own of ['background: true', 'background: false', 'harness: claude-detached'])
    await t.test(`REFUSED: a file that still says \`${own}\`, naming the line to delete`, async () => {
      const said = await refused(() => started(lone(`retired-${own.replace(/\W+/g, '-')}`, own)), 'Delete the line');
      assert.match(said, /^implement: /);
    });

  const words: [string, string, string, Record<string, unknown>][] = [
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
  for (const [own, harness, field, config] of words) {
    const line = own.split('\n').at(-1)!;
    await t.test(
      `REFUSED: \`${own.replace('\n', ', ')}\`, a word the load once judged by a copy of the runtime's lists, now by the runtime`,
      async () => {
        await refused(
          () => started(lone(`words-${own.replace(/\W+/g, '-')}`, own)),
          `implement: \`${line}\` (filed as \`${field}\`): `,
          configRefusal(harness, config)!,
        );
      },
    );
  }

  await t.test(
    "REFUSED: a codex sandbox written under its former name, `permissionMode:`, quoted as the file writes it — the step's line, or its agent's",
    async () => {
      const said = [
        'implement: `permissionMode: dontAsk` (filed as `permissionMode`): ',
        configRefusal('codex', { permissionMode: 'dontAsk' })!,
      ];
      await refused(() => started(lone('former-mode', 'harness: codex\npermissionMode: dontAsk')), ...said);
      const moded = { moded: '---\nharness: codex\npermissionMode: dontAsk\n---\nYou build.\n' };
      await refused(() => started(lone('former-mode-agent', 'agent: moded', moded)), ...said);
    },
  );
});

/** The store's words for `step`, given `what` by a rule naming a path under the store, and never the runtime's. */
const storeRefused = async (dir: string, step: string, what: string, opts: Parameters<typeof started>[1] = {}) => {
  const said = await refused(() => started(dir, opts), `${step}: `, what, `WF_ROOT=${ROOT} `, 'cannot carry the "("', 'WF_ROOT=/srv/wf');
  assert.match(said, new RegExp(`^${step}: `));
  assert.doesNotMatch(said, /Mount a folder|is not a list of permission rules/, "the runtime's words about a mount or a rule list");
};
const lines = (steps: Record<string, string>) =>
  Object.fromEntries(Object.entries(steps).map(([name, front]) => [name, `---\nplace: git\n${front}\n---\n${name} it\n`]));

test("REFUSED at nemia start: a store whose path holds a `(`, which no permission rule carries, in the store's words before anything is written", async (t) => {
  await t.test('REFUSED: a later step, handed the artifacts folders of the steps before it', async () => {
    const dir = folder('handed', lines({ implement: 'harness: claude', review: 'after: implement' }));
    await storeRefused(dir, 'review', 'the artifacts folders of the steps before it', { isolate: false });
  });

  await t.test('REFUSED: a step whose `reads:` names the inbox', async () => {
    await storeRefused(folder('reads', lines({ triage: 'reads: inbox' })), 'triage', 'the inbox', { isolate: false });
  });

  await t.test("REFUSED: a lone step in the checkout, and one after another, each filed a read of its run's artifacts folder", async () => {
    await storeRefused(folder('alone', lines({ ship: 'workspace: base' })), 'ship', "a read of its run's artifacts folder");
    const after = folder('after', lines({ implement: '', ship: 'after: implement\nworkspace: base' }));
    await storeRefused(after, 'ship', "a read of its run's artifacts folder");
  });

  await t.test("REFUSED at nemia start --input: a lone step, filed its run's inputs folder read-only", async () => {
    const given = path.join(ROOT, 'notes.md');
    fs.writeFileSync(given, 'notes\n');
    await storeRefused(folder('plain', lines({ implement: '' })), 'implement', "the run's inputs folder", { inputs: [given] });
  });

  await t.test('a workflow of one step, handed nothing and reading no store folder, starts in the same store', () => {
    assert.ok(written(started(folder('one', lines({ implement: 'harness: claude' })), { isolate: false })));
  });
});
