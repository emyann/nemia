/**
 * A switch onto another template, told as one person's story on the stage (`story.ts`) over a scratch store: a factory applied from the
 * tests' team exported as the template `team` at 0.1.0, nothing edited on its tree, then moved onto `other` at 1.0.0, a template of
 * another name that holds other rules, another hire and another step's words, and none of an agent `team` holds. `nemia factory diff`
 * says it is a switch with no common base and lists every file the two hold differently as a conflict, writing nothing; `nemia factory
 * upgrade` is held to its `--plan`; the controller waits with the status alone; each conflict is resolved, and the merge keeps each
 * choice. After it, `other` at 1.1.0 read from another folder of the same name merges three ways again.
 *
 * Beside the story: a base whose status names no template yet is refused a switch until a pass names it, or, where its template
 * cannot be read, until it is put back; an upgrade already under way
 * keeps its three-way merge, and a factory whose template changed under its version (`ContentChanged`) is named and switched. The merge
 * with no base itself is `src/upgrade/merge.test.ts`; the naming of a base, `src/applied/applied.verb.test.ts`. `WF_ROOT` is set before
 * `src` is imported, which reads it as it loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parse, stringify } from 'yaml';
import { scratch } from 'test-kit/scratch';
import { staged, story } from './story.ts';
import { teamCopy } from './team.ts';

const ROOT = scratch('wf-upgrade-switch-');
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
const FACTORIES = path.join(ROOT, 'factories');
const { templated: programsAt } = await import('./templated.ts');
const { exportTemplate, reconciled } = programsAt(ROOT);
const { readFactory } = await import('../src/runner.ts');
const { appliedDir, digestOf, entriesIn, readStatus, resolutionsFile, statusFile, treeDir } =
  await import('../src/applied/applied.store.ts');
const { main } = await import('../src/cli/main.ts');
const { engineOf, runWith } = await import('../src/runtime-client.ts');
const stage = staged({ runWith, main, engineOf });

/** The document `file` of `dir`, changed by `change`. */
function edit(dir: string, file: string, change: (doc: Record<string, any>) => void): void {
  const doc = parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  change(doc);
  fs.writeFileSync(path.join(dir, file), stringify(doc, { lineWidth: 0 }));
}

/** Every file under `dir`, by its path in it, with its bytes, so a command is seen to have written nothing there. */
const bytesUnder = (dir: string): Record<string, string> =>
  Object.fromEntries(
    (fs.readdirSync(dir, { recursive: true }) as string[])
      .filter((f) => fs.statSync(path.join(dir, f)).isFile())
      .sort()
      .map((f) => [f, fs.readFileSync(path.join(dir, f), 'base64')]),
  );

/** The text of `file` in `folder`. */
const textIn = (folder: string, file: string): string => fs.readFileSync(path.join(folder, file), 'utf8');

/** `file` in `folder` with `from` replaced by `to`. */
const rewrite = (folder: string, file: string, from: string, to: string): void => {
  const text = textIn(folder, file);
  assert.ok(text.includes(from), `${file} holds ${from}`);
  fs.writeFileSync(path.join(folder, file), text.replace(from, to));
};

/** What `argv` printed, as `nemia` prints it, line by line. */
async function printedBy(t: { mock: { method: Function } }, ...argv: string[]): Promise<string[]> {
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...words: unknown[]) => printed.push(words.join(' ')));
  try {
    await stage.main(argv);
  } finally {
    log.mock.restore();
  }
  return printed.flatMap((p) => p.split('\n'));
}

/** Refused by kind and exit 2, its message matching each of `patterns`. */
const refusedWith =
  (tag: 'Missing' | 'Conflict' | 'Invalid', ...patterns: RegExp[]) =>
  (err: Error & { exitCode?: number; _tag?: string }) =>
    err._tag === tag && err.exitCode === 2 && patterns.every((pattern) => pattern.test(err.message));

/** The factory `name`, read as the controller reads it. */
const factory = (name: string) =>
  readFactory(name) as ReturnType<typeof readFactory> & { template: NonNullable<ReturnType<typeof readFactory>['template']> };

/** The conflicts a plan lists, by address: each line under `conflicts:` indented two spaces. */
function conflictsIn(printed: readonly string[]): string[] {
  const from = printed.findIndex((line) => line.startsWith('conflicts: '));
  return printed.slice(from + 1).flatMap((line) => (/^ {2}\S/.test(line) ? [line.trim()] : []));
}

/** The lines a plan lists under `merges cleanly:`, each `<path>  from <side>`. */
function cleanIn(printed: readonly string[]): string[] {
  const from = printed.findIndex((line) => line.startsWith('merges cleanly: '));
  const to = printed.findIndex((line) => line.startsWith('conflicts: '));
  return printed.slice(from + 1, to).map((line) => line.trim());
}

const RULES = 'RULES.md';
const ALMA = 'workflows/agents/alma.md';
const HIRE = 'factory.json#hires.dev/implement';

/**
 * Two templates from the tests' team: `team` at 0.1.0, with rules and an agent `alma` the other holds none of; and `other` at 1.0.0, its
 * own name, other rules, `dev/implement` hired to the reviewer, and other words for the ship step. Each folder named as its template.
 */
function templates(): { team: string; other: string; repo: string } {
  const repo = scratch('wf-upgrade-switch-repo-');
  fs.renameSync(teamCopy(), path.join(repo, 'workflows'));
  stage.place().world.repository(repo, {});
  stage.place().world.commit(repo, 'base');
  const team = path.join(scratch('wf-upgrade-switch-team-'), 'team');
  exportTemplate({ dir: team, from: repo });
  const other = path.join(scratch('wf-upgrade-switch-other-'), 'other');
  fs.cpSync(team, other, { recursive: true });
  fs.writeFileSync(path.join(team, RULES), 'Never touch the database.\n\nNever push.\n');
  fs.cpSync(path.join(team, 'agents/implementer'), path.join(team, 'agents/alma'), { recursive: true });
  fs.writeFileSync(path.join(team, 'agents/alma/instructions.md'), 'You are Alma; run npm run md3 before you sign off.\n');
  edit(team, 'agents/alma/agent.yaml', (doc) => {
    doc.metadata.name = 'alma';
  });
  edit(other, 'nemia.yaml', (doc) => {
    doc.metadata.name = 'other';
    doc.spec.version = '1.0.0';
    doc.spec.hires['dev/implement'] = 'reviewer';
  });
  fs.writeFileSync(path.join(other, RULES), 'Write the tests first.\n\nNever push.\n');
  rewrite(other, 'workflows/dev/ship.md', 'Stage the merge', 'Stage, then check, the merge');
  return { team, other, repo };
}

test('a switch onto another template: previewed with no common base, held to its plan, waited on, resolved, merged', async (t) => {
  const s = story(t);
  let dirs = { team: '', other: '', repo: '' };
  const tree = () => treeDir('crew');
  let plan = '';
  let conflicts: string[] = [];
  let applied: Record<string, string> = {};

  await s.test('a factory applied from team at 0.1.0, nothing edited on its tree, its base named team', async (t) => {
    dirs = templates();
    await printedBy(t, 'factory', 'apply', 'crew', '--template', dirs.team, '--repo', dirs.repo);
    const status = reconciled(factory('crew'));
    assert.deepEqual([status.conditions[0]?.reason, status.template, status.version], ['Rendered', 'team', '0.1.0']);
    assert.ok(fs.existsSync(path.join(tree(), ALMA)), 'the tree holds the agent only team has');
    applied = bytesUnder(appliedDir('crew'));
  });

  await s.test(
    'nemia factory diff says it is a switch with no common base, and lists each file the two hold differently as a conflict',
    async (t) => {
      const before = bytesUnder(FACTORIES);
      const printed = await printedBy(t, 'factory', 'diff', 'crew', '--to', '1.0.0', '--template', dirs.other);
      assert.deepEqual(bytesUnder(FACTORIES), before, 'the preview writes nothing');
      assert.equal(printed[0], 'crew: team 0.1.0 → other 1.0.0');
      assert.match(printed[1] ?? '', /^switch: .*other.*team.*no common base/);
      assert.ok(!printed.some((line) => line.trim().startsWith('base:')), 'no base side is quoted: there is none');
      conflicts = conflictsIn(printed);
      for (const at of [HIRE, ALMA]) assert.ok(conflicts.includes(at), `${at} asks:\n${printed.join('\n')}`);
      assert.ok(
        conflicts.some((at) => at.startsWith(`${RULES}:`)),
        `the rules ask:\n${printed.join('\n')}`,
      );
      assert.ok(
        conflicts.some((at) => at.startsWith('workflows/dev/ship.md')),
        `the ship step's words ask:\n${printed.join('\n')}`,
      );
      const theirsOf = (at: string) => printed.slice(printed.indexOf(`  ${at}`)).find((line) => line.startsWith('    theirs'));
      assert.equal(theirsOf(ALMA), '    theirs: none', "the agent only the tree holds: the template's side is none");
      const tree = entriesIn(treeDir('crew')).map((e) => e.path);
      for (const line of cleanIn(printed)) {
        const [at, from] = line.split('  ');
        assert.equal(from, 'from the template', `nothing the tree holds is taken silently: ${line}`);
        assert.ok(!tree.includes(at ?? ''), `${at} is a file only the new template holds`);
      }
      const files = printed.find((line) => line.includes(' files it')) ?? '';
      assert.match(files, /--template .* --plan sha256:[0-9a-f]{64} files it/, 'a switch is filed with its plan');
      plan = /--plan (sha256:[0-9a-f]{64})/.exec(files)?.[1] ?? '';
    },
  );

  await s.test('nemia factory upgrade refuses a switch without its plan, and files it with it', async (t) => {
    const file = path.join(FACTORIES, 'crew.json');
    const filedAs = fs.readFileSync(file, 'utf8');
    await assert.rejects(
      stage.main(['factory', 'upgrade', 'crew', '--to', '1.0.0', '--template', dirs.other]),
      refusedWith('Invalid', /--plan/),
    );
    assert.equal(fs.readFileSync(file, 'utf8'), filedAs, 'refused, nothing written');
    const printed = await printedBy(t, 'factory', 'upgrade', 'crew', '--to', '1.0.0', '--template', dirs.other, '--plan', plan);
    assert.equal(printed[0], 'crew: 0.1.0 → 1.0.0');
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).template.source, dirs.other);
  });

  await s.test('the controller waits with the status alone: the base still named team, each conflict with no base side', () => {
    const before = bytesUnder(tree());
    const waiting = reconciled(factory('crew'));
    assert.deepEqual(bytesUnder(tree()), before, 'the tree is left as it is');
    assert.deepEqual(bytesUnder(appliedDir('crew')), applied, 'and the base');
    assert.deepEqual([waiting.version, waiting.template, waiting.conditions[0]?.reason], ['0.1.0', 'team', 'UpgradePending']);
    assert.match(waiting.conditions[0]?.message ?? '', /team.*other.*no common base/);
    assert.deepEqual(
      waiting.upgrade?.conflicts.map((c) => c.at),
      conflicts,
    );
    assert.ok(
      waiting.upgrade?.conflicts.every((c) => c.base === null),
      'no conflict has a base side',
    );
  });

  await s.test('each conflict resolved: the agent kept, the hire taken, the rules written by hand, the rest the template', async (t) => {
    const mine = path.join(scratch('wf-upgrade-switch-choice-'), 'rules.md');
    for (const at of conflicts) {
      const choice =
        at === ALMA
          ? ['--ours']
          : at.startsWith(`${RULES}:`)
            ? (fs.writeFileSync(mine, 'Never touch the database.\n'), ['--file', mine])
            : ['--theirs'];
      await printedBy(t, 'factory', 'resolve', 'crew', at, ...choice);
    }
    const resolutions = JSON.parse(fs.readFileSync(resolutionsFile('crew'), 'utf8'));
    assert.deepEqual([resolutions.to, resolutions.template], ['1.0.0', 'other'], 'the choices are for other at 1.0.0');
  });

  await s.test('the controller merges: each choice in the tree, the base the new render, the status naming other', () => {
    const merged = reconciled(factory('crew'));
    assert.deepEqual([merged.version, merged.template, merged.conditions[0]?.reason], ['1.0.0', 'other', 'Upgraded']);
    assert.ok(textIn(tree(), ALMA).includes('You are Alma; run npm run md3 before you sign off.'), 'the agent the tree alone held, kept');
    assert.equal(JSON.parse(textIn(tree(), 'factory.json')).hires['dev/implement'], 'reviewer', "the template's hire");
    assert.ok(textIn(tree(), RULES).includes('Never touch the database.\n'), 'the rule written by hand');
    assert.ok(!fs.existsSync(path.join(appliedDir('crew'), ALMA)), 'the base is the new render, which holds no alma');
    assert.equal(digestOf(entriesIn(appliedDir('crew'))), merged.digest);
  });

  await s.test('after it, other at 1.1.0 from another folder of the same name merges three ways: a tree edit kept', async (t) => {
    const copy = path.join(scratch('wf-upgrade-switch-copy-'), 'other');
    fs.cpSync(dirs.other, copy, { recursive: true });
    edit(copy, 'nemia.yaml', (doc) => {
      doc.spec.version = '1.1.0';
    });
    rewrite(copy, 'workflows/dev/workflow.yaml', 'rounds: 3', 'rounds: 4');
    rewrite(tree(), RULES, 'Never touch the database.', 'Never touch the database, nor deploy.');
    const printed = await printedBy(t, 'factory', 'diff', 'crew', '--to', '1.1.0', '--template', copy);
    assert.equal(printed[0], 'crew: 1.0.0 → 1.1.0', 'no switch: the same template, read from elsewhere');
    assert.ok(!printed.some((line) => line.startsWith('switch:')), printed.join('\n'));
    assert.ok(printed.includes('conflicts: 0'), printed.join('\n'));
    await printedBy(t, 'factory', 'upgrade', 'crew', '--to', '1.1.0', '--template', copy);
    const merged = reconciled(factory('crew'));
    assert.deepEqual([merged.version, merged.template, merged.conditions[0]?.reason], ['1.1.0', 'other', 'Upgraded']);
    assert.ok(textIn(tree(), RULES).includes('nor deploy'), "the tree's edit kept");
    assert.match(textIn(tree(), 'workflows/dev/review.md'), /^rounds: 4$/m, "the template's change taken");
  });
});

test('a base whose status names no template is refused a switch until a pass names it; an upgrade under way stays three-way', async (t) => {
  t.mock.method(console, 'log', () => {});
  const dirs = templates();
  await stage.main(['factory', 'apply', 'later', '--template', dirs.team, '--repo', dirs.repo]);
  reconciled(factory('later'));
  const diff = ['factory', 'diff', 'later', '--to', '1.0.0', '--template', dirs.other];
  const unnamed = (change: (status: Record<string, unknown>) => void = () => {}) => {
    const { template: _named, ...status } = JSON.parse(fs.readFileSync(statusFile('later'), 'utf8'));
    change(status);
    fs.writeFileSync(statusFile('later'), JSON.stringify(status));
  };
  unnamed();
  const before = bytesUnder(FACTORIES);
  await assert.rejects(stage.main(diff), refusedWith('Conflict', /nemia up/));
  await assert.rejects(
    stage.main(['factory', 'upgrade', 'later', '--to', '1.0.0', '--template', dirs.other, '--plan', 'sha256:0']),
    refusedWith('Conflict', /nemia up/),
  );
  assert.deepEqual(bytesUnder(FACTORIES), before, 'refused, nothing written');
  assert.equal(reconciled(factory('later')).template, 'team', 'one pass names it');
  const printed = await printedBy(t, ...diff);
  assert.equal(printed[0], 'later: team 0.1.0 → other 1.0.0', 'then the switch is previewed');
  unnamed((status) => {
    status.upgrade = { from: '0.1.0', to: '0.2.0', conflicts: [] };
  });
  const underWay = await printedBy(t, ...diff);
  assert.equal(underWay[0], 'later: 0.1.0 → 1.0.0', 'an upgrade under way, its base unnamed, is previewed three ways');
  assert.equal(readStatus('later')?.template, undefined);
});

test('a base unnamed whose template cannot be read is named by no pass, and the refusal says to put the template back', async (t) => {
  t.mock.method(console, 'log', () => {});
  const dirs = templates();
  await stage.main(['factory', 'apply', 'moved', '--template', dirs.team, '--repo', dirs.repo]);
  reconciled(factory('moved'));
  const { template: _named, ...status } = JSON.parse(fs.readFileSync(statusFile('moved'), 'utf8'));
  fs.writeFileSync(statusFile('moved'), JSON.stringify(status));
  const aside = path.join(scratch('wf-upgrade-switch-aside-'), 'team');
  fs.renameSync(dirs.team, aside);
  const gone = reconciled(factory('moved'));
  assert.deepEqual([gone.conditions[0]?.reason, gone.template], ['TemplateInvalid', undefined], 'a folder gone names nothing');
  const before = bytesUnder(FACTORIES);
  const diff = ['factory', 'diff', 'moved', '--to', '1.0.0', '--template', dirs.other];
  await assert.rejects(
    stage.main(diff),
    (err: Error & { exitCode?: number; _tag?: string }) =>
      refusedWith('Conflict', /put the template back/i)(err) && err.message.includes(dirs.team),
  );
  assert.deepEqual(bytesUnder(FACTORIES), before, 'refused, nothing written');
  fs.renameSync(aside, dirs.team);
  assert.equal(reconciled(factory('moved')).template, 'team', 'put back, one pass names it');
  assert.equal((await printedBy(t, ...diff))[0], 'moved: team 0.1.0 → other 1.0.0');
});

test('a factory whose template changed under its version is named after that template, and switched from it with no base', async (t) => {
  t.mock.method(console, 'log', () => {});
  const dirs = templates();
  await stage.main(['factory', 'apply', 'kit', '--template', dirs.team, '--repo', dirs.repo]);
  reconciled(factory('kit'));
  rewrite(dirs.team, RULES, 'Never push.', 'Never push to main.');
  const { template: _named, ...status } = JSON.parse(fs.readFileSync(statusFile('kit'), 'utf8'));
  fs.writeFileSync(statusFile('kit'), JSON.stringify(status));
  const changed = reconciled(factory('kit'));
  assert.deepEqual([changed.conditions[0]?.reason, changed.template], ['ContentChanged', 'team']);
  const before = bytesUnder(FACTORIES);
  const printed = await printedBy(t, 'factory', 'diff', 'kit', '--to', '1.0.0', '--template', dirs.other);
  assert.deepEqual(bytesUnder(FACTORIES), before, 'the preview writes nothing');
  assert.equal(printed[0], 'kit: team 0.1.0 → other 1.0.0');
  assert.match(printed[1] ?? '', /^switch: /);
  const conflicts = conflictsIn(printed);
  assert.ok(conflicts.includes(ALMA) && conflicts.some((at) => at.startsWith(`${RULES}:`)), printed.join('\n'));
});
