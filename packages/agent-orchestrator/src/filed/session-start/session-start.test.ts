/**
 * What a step is filed where its run froze a home (`filedConfig` with a `start`): what no law of `contracts/session-home.contract.ts`
 * states, since the laws hold `sessionStart`, `inWorkspace` and `memoryFilesOf` alone, and what the solver could not settle there: no
 * exclude is a folder switched on or a folder inside one. One table, each row a filing: where the session starts, the workspace added
 * first and how, the home denied, the step's rules read against the workspace, the skills offered and the memory files loaded by the
 * volumes' switches; and the filings that stay as they were without a home.
 */
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { parseWorkflow, type StepSpec } from '../../workflow.ts';
import { filedConfig, startOf, WORKSPACE, type StartFound } from '../filed.ts';
import type { Run } from '../../record/record.ts';

const WS = '/wt/run';
const HOME = '/runs/r/home/abc';

const stepOf = (lines = '') => parseWorkflow('design', `---\nplace: git\n${lines}---\nDesign.\n`);

/** A step that writes contracts alone, in `dontAsk`, as a design step of a factory does. */
const DESIGN = stepOf('permissionMode: dontAsk\nallowedTools: ["Edit(packages/*/contracts/*.contract.ts)", "Bash(cd ${{ workspace }})"]\n');
/** A step whose fence writes nothing: `dontAsk` with no `Edit` rule. */
const READER = stepOf('permissionMode: dontAsk\nallowedTools: ["Bash(cd ${{ workspace }})"]\n');

const found = (over: Partial<StartFound> = {}) => ({ home: HOME, mcp: false, skills: {}, ...over }) satisfies StartFound;

const filed = (step: StepSpec, t: { start?: StartFound; workspace?: string; run?: Partial<Run>; own?: Record<string, unknown> } = {}) =>
  filedConfig(
    step,
    [step],
    { gates: [], ...(t.run as object) },
    {
      model: undefined,
      budgetUsd: undefined,
      runArtifacts: '/runs/r/artifacts',
      inbox: '/inbox',
      own: t.own ?? {},
      ...(t.workspace === undefined ? {} : { workspace: t.workspace }),
      ...(t.start === undefined ? {} : { start: t.start }),
    },
  );

describe('filedConfig in a home: where the session starts, the workspace beside it, and what the switches give it', () => {
  test('a step that writes starts in the home, its workspace added first and ruled by its own rules, read against it, the home denied', () => {
    assert.equal(startOf(DESIGN, WS, found()).cwd, HOME);
    const config = filed(DESIGN, { workspace: WS, start: found() });
    assert.deepEqual(config.mounts?.[0], { path: WS, readOnly: false, ruled: true });
    assert.ok(config.allowedTools?.includes(`Edit(/${WS}/packages/*/contracts/*.contract.ts)`));
    assert.ok(config.allowedTools?.includes(`Bash(cd ${WS})`));
    assert.ok(config.disallowedTools?.includes(`Edit(/${HOME}/**)`));
    assert.equal(config.env[WORKSPACE], WS);
    assert.equal(config.projectMcpFrom, WS, "the workspace's .mcp.json, the home having none");
  });
  test('a step whose fence writes nothing has its workspace read-only beside the home', () => {
    assert.deepEqual(filed(READER, { workspace: WS, start: found() }).mounts?.[0], { path: WS, readOnly: true });
  });
  test("the home's .mcp.json is the servers' file where it has one", () => {
    assert.equal(filed(DESIGN, { workspace: WS, start: found({ mcp: true }) }).projectMcpFrom, HOME);
  });
  test('a run that froze no home files the step as before, but for `${{ workspace }}`, which names the workspace wherever it starts', () => {
    const before = filed(DESIGN);
    const now = filed(DESIGN, { workspace: WS });
    assert.equal(startOf(DESIGN, WS, undefined).cwd, WS);
    assert.deepEqual(
      { ...now, allowedTools: now.allowedTools?.map((r) => r.replace(WS, '${{ workspace }}')) },
      before,
      'the same config, the expression aside',
    );
  });
  test('a step on Codex or a remote agent starts in its workspace, filed as without a home', () => {
    for (const harness of ['codex', 'a2a:far']) {
      const step: StepSpec = { ...stepOf(), harness };
      assert.equal(startOf(step, WS, found()).cwd, WS, harness);
      assert.deepEqual(filed(step, { workspace: WS, start: found() }), filed(step, { workspace: WS }), harness);
    }
  });
  test("the home's skills and each added folder's are offered beside the step's own, but a volume's switched off", () => {
    const skills = { [HOME]: ['home-skill'], [WS]: ['repo-skill'], '/vol': ['vol-skill'] };
    const run = { volumes: [{ path: '/vol', readOnly: true }] };
    const on = filed(DESIGN, { workspace: WS, start: found({ skills }), run, own: { enabledSkills: ['p:own'] } });
    assert.deepEqual(on.enabledSkills, ['p:own', 'home-skill', 'repo-skill', 'vol-skill']);
    const off = filed(DESIGN, {
      workspace: WS,
      start: found({ skills }),
      run: { volumes: [{ path: '/vol', readOnly: true, skills: false }], worked: { skills: false } },
      own: { enabledSkills: ['p:own'] },
    });
    assert.deepEqual(off.enabledSkills, ['p:own', 'home-skill']);
    const open = filed(DESIGN, { workspace: WS, start: found({ skills }), own: { enabledSkills: 'default' } });
    assert.equal(open.enabledSkills, 'default', 'a list left open stays open');
  });
  test("no added folder's CLAUDE.md loads unless a volume is switched on, and then every other added folder is skipped", () => {
    const off = filed(DESIGN, { workspace: WS, start: found(), run: { volumes: [{ path: '/vol', readOnly: true }] } });
    assert.equal(off.env.CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD, undefined);
    assert.equal(Object.hasOwn(off, 'claude'), false);
    const on = filed(DESIGN, {
      workspace: WS,
      start: found(),
      run: { volumes: [{ path: '/vol', readOnly: true }], worked: { claudeMd: true } },
      own: { claude: { settings: '{"env":{"A":"1"}}' } },
    });
    assert.equal(on.env.CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD, '1');
    const settings: unknown = JSON.parse((on as unknown as { claude: { settings: string } }).claude.settings);
    assert.deepEqual(settings, { env: { A: '1' }, claudeMdExcludes: ['/vol/**', '/runs/r/artifacts/design/**'] });
    const volume = filed(DESIGN, {
      workspace: WS,
      start: found(),
      run: { volumes: [{ path: '/vol', readOnly: true, claudeMd: true }] },
      own: { claude: { settings: '{}' } },
    });
    assert.equal(volume.env.CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD, '1', "a volume's own switch loads them");
    assert.deepEqual(JSON.parse((volume as unknown as { claude: { settings: string } }).claude.settings), {
      claudeMdExcludes: [`${WS}/**`, '/runs/r/artifacts/design/**'],
    });
  });
  test('no exclude is a folder switched on or a folder inside one, while each folder left off beside them is skipped', () => {
    const config = filed(DESIGN, {
      workspace: WS,
      start: found(),
      run: {
        volumes: [
          { path: '/vol', readOnly: true, claudeMd: true },
          { path: '/vol/inner', readOnly: true, claudeMd: true },
          { path: '/beside', readOnly: true },
        ],
      },
      own: { claude: { settings: '{}' } },
    });
    const { claudeMdExcludes } = JSON.parse((config as unknown as { claude: { settings: string } }).claude.settings) as {
      claudeMdExcludes: string[];
    };
    for (const on of ['/vol', '/vol/inner'])
      assert.deepEqual(
        claudeMdExcludes.filter((x) => x === on || x.startsWith(on + '/')),
        [],
        on,
      );
    assert.ok(claudeMdExcludes.includes('/beside/**'), 'the volume left off is skipped');
  });
  test("a step's own excludes are kept beside the folders skipped, and settings no exclude can be written into load no added folder's CLAUDE.md", () => {
    const run = { volumes: [{ path: '/vol', readOnly: true, claudeMd: true as const }] };
    const kept = filed(DESIGN, {
      workspace: WS,
      start: found(),
      run,
      own: { claude: { settings: '{"claudeMdExcludes":["**/vendor/**"]}' } },
    });
    assert.deepEqual(JSON.parse((kept as unknown as { claude: { settings: string } }).claude.settings), {
      claudeMdExcludes: ['**/vendor/**', `${WS}/**`, '/runs/r/artifacts/design/**'],
    });
    assert.equal(kept.env.CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD, '1');
    for (const settings of ['/etc/claude/settings.json', '["a list"]']) {
      const unwritten = filed(DESIGN, { workspace: WS, start: found(), run, own: { claude: { settings } } });
      assert.equal(unwritten.env.CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD, undefined, settings);
      assert.equal((unwritten as unknown as { claude: { settings: string } }).claude.settings, settings, 'left as given');
    }
  });
  test('the switches of a mount never reach the runtime, which takes a path, a mode and `ruled` alone', () => {
    const config = filed(DESIGN, { workspace: WS, start: found(), run: { volumes: [{ path: '/vol', readOnly: true, claudeMd: true }] } });
    for (const m of config.mounts ?? [])
      assert.deepEqual(
        Object.keys(m).filter((k) => !['path', 'readOnly', 'ruled'].includes(k)),
        [],
      );
  });
});
