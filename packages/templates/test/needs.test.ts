/**
 * sdlc's machine needs (`spec.needs` of `build` and `quick`), as a factory gets them: rendered each way of landing into each workflow's
 * README frontmatter, where the daemon reads them, and run as the sweep runs a check (`sh -c`). Where `github` is true a run needs gh on
 * the PATH, signed in with the `workflow` scope, and a git identity, which the account fills; where it is false nothing of GitHub holds
 * a run: the two gh checks are met, whatever the machine has. Either way a run needs a Chromium where Playwright looks, which the steps'
 * browser tools open (`browser`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { scratch } from 'test-kit/scratch';
import { renderedSdlc } from './template.ts';

/** A need as the README's frontmatter holds it, as far as this test reads it. */
type Need = { name: string; check: string; fills?: string; fixes?: Array<{ command: string; code?: string; kind?: string }> };

/** The two workflows that land a change, and so need what landing on GitHub takes. */
const LANDING = ['build', 'quick'];

/** The needs a rendered workflow's README declares in its frontmatter (`needs:`), none where it has no frontmatter. */
function needsOf(tree: string, workflow: string): Need[] {
  const text = fs.readFileSync(path.join(tree, 'workflows', workflow, 'README.md'), 'utf8');
  const block = /^---\n([\s\S]*?)\n---\n/.exec(text);
  return block?.[1] === undefined ? [] : ((yaml.load(block[1]) as { needs?: Need[] }).needs ?? []);
}

/** The exit of `check` run as the sweep runs one, on a PATH that holds no gh, from a scratch folder. */
function checked(check: string, carried: string): number | null {
  const bin = scratch('nemia-needs-bin-');
  fs.symlinkSync(process.execPath, path.join(bin, 'node'));
  const ran = spawnSync('/bin/sh', ['-c', check], {
    cwd: scratch('nemia-needs-cwd-'),
    env: { PATH: bin, HOME: scratch('nemia-needs-home-'), WF_CARRIED_FILES: carried },
    encoding: 'utf8',
    timeout: 30_000,
  });
  return ran.status;
}

for (const github of [true, false]) {
  test(`with github=${github}, build and quick declare gh, its sign-in and the git identity it fills, in their README`, async () => {
    const { tree } = await renderedSdlc(github ? ['github=true'] : []);
    const carried = path.join(tree, 'workflows', 'carried');
    for (const workflow of LANDING) {
      const needs = needsOf(tree, workflow);
      assert.deepEqual(
        needs.map((need) => need.name),
        ['gh', 'gh-sign-in', 'git-identity', 'browser'],
        workflow,
      );
      const of = (name: string): Need | undefined => needs.find((need) => need.name === name);
      assert.equal(of('git-identity')?.fills, 'git-identity', `${workflow}'s identity fills the git place's need`);
      assert.match(of('gh')?.fixes?.[0]?.command ?? '', /needs\.ts" install-gh$/);
      assert.match(of('git-identity')?.fixes?.[0]?.command ?? '', /needs\.ts" identity/);
      const signIn = of('gh-sign-in')?.fixes?.[0];
      assert.match(signIn?.command ?? '', /--scopes workflow <\/dev\/null && gh auth setup-git$/);
      assert.ok(new RegExp(signIn?.code ?? '^$').test('AB12-CD34'), `${workflow}'s sign-in reads a device code`);
      assert.doesNotMatch(JSON.stringify(needs), /\$\{\{/, 'every parameter is written with its value');
      for (const name of ['gh', 'gh-sign-in'])
        assert.equal(checked(of(name)?.check ?? 'exit 9', carried) === 0, !github, `${workflow}'s ${name} check, gh absent`);
    }
  });
}

test('build and quick declare a browser, met where Playwright keeps a Chromium and missing where it keeps none', async () => {
  const { tree } = await renderedSdlc([]);
  for (const workflow of LANDING) {
    const browser = needsOf(tree, workflow).find((need) => need.name === 'browser');
    assert.equal(browser?.fixes?.[0]?.kind, 'typed', `${workflow}'s browser is installed by the person, with their Playwright's installer`);
    const home = scratch('nemia-needs-home-');
    const ran = () =>
      spawnSync('/bin/sh', ['-c', browser?.check ?? 'exit 9'], { cwd: home, env: { PATH: '/usr/bin:/bin', HOME: home }, timeout: 30_000 })
        .status;
    assert.notEqual(ran(), 0, `${workflow}'s browser is missing where Playwright keeps no Chromium`);
    fs.mkdirSync(path.join(home, '.cache', 'ms-playwright', 'chromium-1200'), { recursive: true });
    assert.equal(ran(), 0, `${workflow}'s browser is met once Playwright keeps a Chromium`);
  }
});
