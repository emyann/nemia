/**
 * The legs CI proves the contracts in (`tools/contracts/legs.ts`), and the `contracts` job of `.github/workflows/ci.yml` that runs
 * them: every contract proved by exactly one leg, a leg of its own whose contract is gone refused by every leg, the files a contract
 * may be in found as tsverify's CLI finds them, and the job wired to the legs — a matrix of every leg, each with its own verdict
 * cache, none cancelled by another — while `npm run contracts` still proves them all. `prove.ts` itself is proved by running it: CI's
 * job does on every push.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';
import { readWorkflow, type Workflow } from './ci-workflow.ts';
import { ALONE, LEGS, contractFilesUnder, legOf, planOf, type Contract } from '../../contracts/legs.ts';
import { contractsOf } from '../../contracts/prove.ts';

const ROOT = path.join(import.meta.dirname, '..', '..', '..');

/** The job that proves the contracts, one leg per entry of its matrix. */
const JOB = 'contracts';

/** The leg's step, as the job runs it. */
const RUN = 'npm run contracts -- ${{ matrix.leg }}';

/** What the root's `contracts` script runs: every leg, with none named. */
const SCRIPT = 'node tools/contracts/prove.ts';

const CACHE = 'node_modules/.cache/tsverify';

const LEG = '${{ matrix.leg }}';

/** Where the `contracts` job and the root's script drift from the legs, each said with its fix. */
const contractsDrift = (workflow: Workflow, script: string | undefined): string[] => {
  const job = workflow.jobs[JOB];
  if (job === undefined) return [`ci.yml has no ${JOB} job: add it back, a matrix of the legs tools/contracts/legs.ts names`];
  const drift: string[] = [];
  const legs = job.strategy?.matrix?.leg ?? [];
  if ([...legs].map(String).sort().join() !== [...LEGS].sort().join())
    drift.push(
      `the ${JOB} job's matrix.leg is [${legs.join(', ')}]: list every leg of tools/contracts/legs.ts, [${LEGS.join(', ')}], and no other`,
    );
  if (job.strategy?.['fail-fast'] !== false)
    drift.push(`the ${JOB} job's strategy cancels the other legs when one fails: set fail-fast: false, so each leg gives its verdict`);
  const steps = job.steps ?? [];
  if (!steps.some((s) => s.run === RUN))
    drift.push(`the ${JOB} job runs no step \`${RUN}\`: each leg proves its own contracts, by that command`);
  const cache = steps.find((s) => s.with?.path === CACHE);
  if (cache === undefined || !String(cache.with?.key).includes(LEG) || !String(cache.with?.['restore-keys']).includes(LEG))
    drift.push(`the ${JOB} job keeps no verdict cache of each leg's own at ${CACHE}: put ${LEG} in its cache step's key and restore-keys`);
  if (script !== SCRIPT)
    drift.push(`the root's contracts script is ${JSON.stringify(script)}: set it to \`${SCRIPT}\`, which proves every leg`);
  return drift;
};

const rootScript = (): string | undefined =>
  (JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as { scripts?: Record<string, string> }).scripts?.contracts;

const FOUND: Contract[] = [
  { file: 'packages/agent-runtime/src/core/domain.ts', name: 'decide' },
  ALONE.observe,
  { file: 'packages/agent-orchestrator/src/gate/gate.ts', name: 'holdsOpen' },
  ALONE['approval-refusal'],
  { file: 'apps/cli/src/route.ts', name: 'routeOf' },
];

test('every contract found is proved by exactly one leg, and a leg of its own proves its contract alone', () => {
  const proved = LEGS.flatMap((leg) => planOf(FOUND, leg));
  assert.equal(proved.length, FOUND.length, 'no contract is proved twice');
  assert.deepEqual(new Set(proved), new Set(FOUND), 'no contract is left out');
  for (const [leg, contract] of Object.entries(ALONE)) assert.deepEqual(planOf(FOUND, legOf(contract)), [contract], leg);
  assert.deepEqual(
    planOf(FOUND, 'rest').map((c) => c.name),
    ['decide', 'holdsOpen', 'routeOf'],
    'the rest leg proves the contracts that share a file with a leg of its own',
  );
});

test('REFUSED: a leg of its own whose contract is no longer where it names, by every leg', () => {
  const moved = FOUND.filter((c) => c !== ALONE.observe);
  for (const leg of LEGS) assert.throws(() => planOf(moved, leg), Error, leg);
});

test("the contracts ALONE names are each a contract tsverify reads in this checkout's file", () => {
  for (const contract of Object.values(ALONE))
    assert.ok(contractsOf(path.join(ROOT, contract.file)).includes(contract.name), contract.name);
});

test('a file may hold a contract when it imports tsverify, or relatively imports a file that does, and not otherwise', () => {
  const root = scratch('contract-files');
  fs.mkdirSync(path.join(root, 'contracts'));
  fs.mkdirSync(path.join(root, 'src', 'deep'), { recursive: true });
  fs.writeFileSync(path.join(root, 'contracts', 'f.contract.ts'), "import { spec } from '@emyann/tsverify';\nexport type F = 1;\n");
  fs.writeFileSync(
    path.join(root, 'src', 'deep', 'f.ts'),
    "import type { F } from '../../contracts/f.contract.ts';\nexport const f = 1;\n",
  );
  fs.writeFileSync(path.join(root, 'src', 'own.ts'), "import { contract } from '@emyann/tsverify';\n");
  fs.writeFileSync(path.join(root, 'src', 'plain.ts'), "import { g } from './deep/g.ts';\nexport const h = 1;\n");
  assert.deepEqual(
    contractFilesUnder(path.join(root, 'src')).map((f) => path.relative(root, f)),
    [path.join('src', 'deep', 'f.ts'), path.join('src', 'own.ts')],
  );
});

test('the contracts job runs every leg with a verdict cache of its own, and npm run contracts proves them all', () => {
  assert.deepEqual(contractsDrift(readWorkflow(), rootScript()), []);
});

test("REFUSED: a leg left out of the matrix, legs cancelled by one, a leg's command, a cache shared by the legs, and a script of one leg", () => {
  const shipped = readWorkflow();
  const broken = (edit: (job: NonNullable<Workflow['jobs'][string]>) => void): Workflow => {
    const copy = structuredClone(shipped);
    const job = copy.jobs[JOB];
    assert.ok(job !== undefined, `the ${JOB} job is there today`);
    edit(job);
    return copy;
  };
  const cases: [string, Workflow, string | undefined][] = [
    ['a leg left out', broken((job) => job.strategy?.matrix?.leg?.splice(LEGS.indexOf('observe'), 1)), SCRIPT],
    ['fail-fast', broken((job) => delete job.strategy?.['fail-fast']), SCRIPT],
    ['every contract in each leg', broken((job) => job.steps?.forEach((s) => s.run === RUN && (s.run = 'npm run contracts'))), SCRIPT],
    [
      'one cache for every leg',
      broken((job) => job.steps?.forEach((s) => s.with?.path === CACHE && (s.with.key = 'tsverify-${{ github.sha }}'))),
      SCRIPT,
    ],
    ['a script of one leg', shipped, `${SCRIPT} rest`],
  ];
  for (const [why, workflow, script] of cases) assert.equal(contractsDrift(workflow, script).length, 1, why);
});
