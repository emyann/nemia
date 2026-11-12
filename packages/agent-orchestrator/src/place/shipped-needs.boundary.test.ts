/**
 * The names a template's check knows the builtin places' needs by (`SHIPPED_PLACE_NEEDS`, which `template.store.ts` reads in place of
 * the place's code) are the git place's own: read off the real place, its whole subject. And the git place's mise needs run as the sweep
 * runs a check (`checkRan`, `needsEnv`) on a scratch store whose tools folder holds a stand-in `mise`, which records each command it
 * is given and reads every tool installed once `mise install` ran: no row fetches mise or a tool.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { scratch } from 'test-kit/scratch';
import { SHIPPED_PLACE_NEEDS } from './place.ts';
import { builtinGitPlace } from './builtin.store.ts';
import { checkRan, needsEnv } from '../needs/needs.verb.ts';
import { needStateOf } from '../needs/needs.ts';
import { toolsBinDir } from '../config/root.store.ts';

test("the needs the template's check knows the shipped places by are the git place's own, by name", () => {
  assert.deepEqual(
    (builtinGitPlace.declared.needs ?? []).map((need) => need.name),
    SHIPPED_PLACE_NEEDS,
  );
});

/** The git place's need `name`. */
const needOf = (name: string) => {
  const need = builtinGitPlace.declared.needs?.find((n) => n.name === name);
  assert.ok(need, `the git place declares ${name}`);
  return need;
};

test("the git place's mise needs: mise found in the tools folder, and the repository's toolchain missing until mise install ran", async (t) => {
  const home = scratch('wf-place-mise-');
  const said = path.join(home, 'mise-said.txt');
  const read = (check: string) => Effect.runPromise(checkRan(home, { check }, { ms: 5_000 })).then(needStateOf);

  await t.test('mise is met once a mise is in the tools folder', async () => {
    fs.mkdirSync(toolsBinDir(home), { recursive: true });
    fs.writeFileSync(
      path.join(toolsBinDir(home), 'mise'),
      `#!/bin/sh\necho "$*" >> '${said}'\n[ "$1" = install ] && [ "$2" = --dry-run-code ] && { [ -f '${home}/installed' ] || exit 1; exit 0; }\n[ "$1" = install ] && touch '${home}/installed'\nexit 0\n`,
      { mode: 0o755 },
    );
    assert.equal(await read(needOf('mise').check), 'met');
  });

  await t.test(
    'repository-toolchain reads missing while mise says a tool is to install, and met once its fix ran mise install',
    async () => {
      const need = needOf('repository-toolchain');
      assert.equal(need.scope, 'repository');
      assert.equal(await read(need.check), 'missing');
      const fix = need.fixes?.[0]?.command ?? '';
      const ran = spawnSync('sh', ['-c', fix], { cwd: home, env: needsEnv(home, process.env) });
      assert.equal(ran.status, 0, String(ran.stderr));
      assert.ok(fs.readFileSync(said, 'utf8').split('\n').includes('install'), 'the fix ran mise install');
      assert.equal(await read(need.check), 'met');
    },
  );
});
