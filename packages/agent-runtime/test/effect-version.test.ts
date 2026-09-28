/**
 * Effect is one version in the whole workspace: every package that depends on it names the same exact version, and the
 * lockfile installs it once, at that version. A caret on a release candidate admits the next one and every `4.x` final, so a
 * range lets `npm install` move the code under every package that uses it; two pins let two copies of Effect meet at a seam.
 *
 * Each rule is made to refuse planted manifests first: a scan that read nothing, or matched nothing, passes too.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..', '..', '..');
const EFFECT = 'effect';
const LISTS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies', 'overrides'] as const;
const EXACT = /^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/;

type Manifest = Partial<Record<(typeof LISTS)[number], Record<string, unknown>>>;
type Spec = { where: string; list: string; spec: string };

/** Every `effect` entry in a manifest's dependency lists, and in its `overrides`, by the workspace that names it. */
const effectSpecs = (manifests: Record<string, Manifest>): Spec[] =>
  Object.entries(manifests).flatMap(([where, m]) =>
    LISTS.flatMap((list) => {
      const spec = m[list]?.[EFFECT];
      return spec === undefined ? [] : [{ where, list, spec: String(typeof spec === 'string' ? spec : JSON.stringify(spec)) }];
    }),
  );

/** What is wrong with the specs, one sentence each saying what to do: a range, or exact pins that differ. */
function pinProblems(specs: Spec[]): string[] {
  const ranges = specs
    .filter((s) => !EXACT.test(s.spec))
    .map((s) => `${s.where} gives effect ${s.spec} in ${s.list}, a range: pin it exactly, the same version as every other package`);
  const pins = specs.filter((s) => EXACT.test(s.spec));
  const first = pins[0];
  const differ = pins
    .filter((s) => s.spec !== first?.spec)
    .map(
      (s) =>
        `effect is ${first.spec} in ${first.where} and ${s.spec} in ${s.where}: one version in every package — change them together, with the lockfile`,
    );
  return [...ranges, ...differ];
}

/** The root's manifest and every workspace's, by `packages/<name>`, `apps/<name>` or `(root)`. */
const manifests = (): Record<string, Manifest> => {
  const found: Record<string, Manifest> = Object.fromEntries(
    ['packages', 'apps'].flatMap((top) =>
      fs
        .readdirSync(path.join(ROOT, top))
        .filter((ws) => fs.existsSync(path.join(ROOT, top, ws, 'package.json')))
        .map((ws) => [`${top}/${ws}`, JSON.parse(fs.readFileSync(path.join(ROOT, top, ws, 'package.json'), 'utf8')) as Manifest]),
    ),
  );
  found['(root)'] = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as Manifest;
  return found;
};

test('the scan reads every workspace, and finds the runtime depending on effect — or it would pass by reading nothing', () => {
  const read = manifests();
  assert.ok(Object.keys(read).length >= 5, 'every workspace read');
  assert.ok(
    effectSpecs(read).some((s) => s.where === 'packages/agent-runtime' && s.list === 'dependencies'),
    'the runtime depends on effect',
  );
});

test('every package that depends on effect pins it exactly, to one version', () => {
  assert.deepEqual(pinProblems(effectSpecs(manifests())), []);
});

test('the lockfile installs effect once, at the pin', () => {
  const pin = effectSpecs(manifests())[0].spec;
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8')) as {
    packages: Record<string, { version?: string }>;
  };
  const installed = Object.entries(lock.packages).filter(
    ([key]) => key === `node_modules/${EFFECT}` || key.endsWith(`/node_modules/${EFFECT}`),
  );
  assert.deepEqual(
    installed.map(([key, p]) => [key, p.version]),
    [[`node_modules/${EFFECT}`, pin]],
    'one copy of effect, at the version every package pins: run npm install after changing the pin, and keep a package that nests its own effect out',
  );
});

test('REFUSED: a range in any list or workspace, and two exact pins that differ', () => {
  const range = (where: string, list: string, spec: string) =>
    `${where} gives effect ${spec} in ${list}, a range: pin it exactly, the same version as every other package`;
  for (const spec of ['^4.0.0-rc.116', '~4.0.0-rc.116', '*', 'latest', '4.x', '>=4.0.0-rc.116', '4', '']) {
    assert.deepEqual(pinProblems(effectSpecs({ 'packages/agent-runtime': { dependencies: { effect: spec } } })), [
      range('packages/agent-runtime', 'dependencies', spec),
    ]);
  }
  assert.deepEqual(
    pinProblems(
      effectSpecs({
        'packages/agent-runtime': { dependencies: { effect: '4.0.0-rc.116' } },
        'packages/agent-orchestrator': { devDependencies: { effect: '^4.0.0-rc.116' } },
        '(root)': { overrides: { effect: '~4.0.0' } },
      }),
    ),
    [range('packages/agent-orchestrator', 'devDependencies', '^4.0.0-rc.116'), range('(root)', 'overrides', '~4.0.0')],
  );
  assert.deepEqual(
    pinProblems(
      effectSpecs({
        'packages/agent-runtime': { dependencies: { effect: '4.0.0-rc.116' } },
        'apps/api': { peerDependencies: { effect: '4.0.0-rc.118' } },
      }),
    ),
    [
      'effect is 4.0.0-rc.116 in packages/agent-runtime and 4.0.0-rc.118 in apps/api: one version in every package — change them together, with the lockfile',
    ],
  );
  assert.deepEqual(
    pinProblems(
      effectSpecs({
        'packages/agent-runtime': { dependencies: { effect: '4.0.0-rc.116' } },
        'packages/agent-orchestrator': { dependencies: { effect: '4.0.0-rc.116', xstate: '^5' } },
        'apps/web': { dependencies: { react: '^19' } },
      }),
    ),
    [],
    'the same exact pin in two workspaces, beside one without effect, is not refused',
  );
});

const SKILL = '.claude/skills/effect/SKILL.md';

/** Whether `effect`'s barrel has a name as the skill writes it: `Either`, or `Context.Tag` for `Tag` on the `Context` module. */
const has = (barrel: Record<string, unknown>, name: string): boolean => {
  const [mod, member] = name.split('.');
  const at = barrel[mod];
  return member === undefined ? at !== undefined : typeof at === 'object' && at !== null && member in at;
};

/**
 * What the skill's table of Effect 3 names gets wrong about the version it is read against, one sentence each: a version it
 * was not measured on, a name on the left the version has, a name on the right it lacks, or a table with no row read.
 */
function renameProblems(skill: string, barrel: Record<string, unknown>, pin: string): string[] {
  const section = /## Effect 3 names this version does not have\s*\n([\s\S]*?)\n## Services and layers/.exec(skill)?.[1];
  if (section === undefined) return [`${SKILL} has no table of Effect 3 names before its Services and layers: put it back`];
  const measured = /Measured on `([^`]+)`/.exec(section)?.[1];
  const rows = section
    .split('\n')
    .filter((line) => /^\|\s*`/.test(line))
    .map((line) =>
      line
        .split('|')
        .slice(1, 3)
        .map((cell) => [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1])),
    );
  return [
    ...(measured === pin
      ? []
      : [`${SKILL} was measured on ${measured}, and effect is pinned to ${pin}: measure the table again, then say ${pin}`]),
    ...(rows.length ? [] : [`${SKILL} lists no Effect 3 name`]),
    ...rows.flatMap(([gone = [], now = []]) => [
      ...gone.filter((n) => has(barrel, n)).map((n) => `${SKILL} says ${n} is gone, and effect ${pin} has it: take its row out`),
      ...now
        .filter((n) => !has(barrel, n))
        .map((n) => `${SKILL} says to write ${n}, and effect ${pin} has no such name: find what replaced it`),
    ]),
  ];
}

test("the effect skill's table of Effect 3 names holds for the pinned version", async () => {
  const skill = fs.readFileSync(path.join(ROOT, SKILL), 'utf8');
  const barrel = { ...(await import(EFFECT)) } as Record<string, unknown>;
  assert.deepEqual(renameProblems(skill, barrel, effectSpecs(manifests())[0].spec), []);
  assert.ok((skill.match(/^\|\s*`/gm) ?? []).length >= 11, 'every row read');
});

test('REFUSED: a table measured on another version, a name it says is gone that is there, a replacement that is not', async () => {
  const skill = fs.readFileSync(path.join(ROOT, SKILL), 'utf8');
  const barrel = { ...(await import(EFFECT)) } as Record<string, unknown>;
  const pin = effectSpecs(manifests())[0].spec;
  assert.deepEqual(renameProblems(skill, barrel, '4.0.0'), [
    `${SKILL} was measured on ${pin}, and effect is pinned to 4.0.0: measure the table again, then say 4.0.0`,
  ]);
  assert.deepEqual(renameProblems(skill.replace('| `Effect.catchAll` |', '| `Effect.catch` |'), barrel, pin), [
    `${SKILL} says Effect.catch is gone, and effect ${pin} has it: take its row out`,
  ]);
  assert.deepEqual(renameProblems(skill.replace('| `Effect.forkChild` |', '| `Effect.fork` |'), barrel, pin), [
    `${SKILL} says to write Effect.fork, and effect ${pin} has no such name: find what replaced it`,
  ]);
  assert.deepEqual(renameProblems(skill.replace('| `Result` |', '| `Either` |'), barrel, pin), [
    `${SKILL} says to write Either, and effect ${pin} has no such name: find what replaced it`,
  ]);
  assert.deepEqual(renameProblems(skill.replace('## Services and layers', '## Layers'), barrel, pin), [
    `${SKILL} has no table of Effect 3 names before its Services and layers: put it back`,
  ]);
});
