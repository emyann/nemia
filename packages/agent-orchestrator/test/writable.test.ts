/**
 * A step's `writable:` as its file is read: a list of the factory's folders by their directory's names, refused where a name is not one,
 * on a remote agent, and over a fence that writes nothing — the key widens where a step's writes reach, never what it may do. And
 * `stepMounts`, which files the folders a step names writable and every other read-only. One table, a row a case.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseWorkflow, agentsDir } from '../src/workflow.ts';
import { loadAgents } from '../src/agents/read.store.ts';
import { stepMounts } from '../src/factory/factory.ts';
import { teamCopy } from './team.ts';
import { Invalid } from '../src/refusal/refusal.ts';

/** A step `review` with this frontmatter and a body, as a folder hands it to the parser. */
const fm = (lines: string) => parseWorkflow('review', `---\nplace: git\n${lines}\n---\nDo the work.\n`);

/** The fix every refusal over a fence that writes nothing names. */
const FIX = ['never what it may do', 'Delete the line', 'allows `Edit(**)`'];

/** A row: what it reads, and, for a refusal, the text its message opens on and what else it names. */
type Row = { row: string; run: () => unknown; naming?: string[] };

/** A row reading `lines` as the folders `writable` lists. */
const reads = (row: string, lines: string, writable?: string[]): Row => ({
  row,
  run: () => assert.deepEqual(fm(lines).writable, writable),
});
/** A row refusing `lines`, naming each of `naming` after `review: `. */
const refuses = (row: string, lines: string, ...naming: string[]): Row => ({
  row: `REFUSED: ${row}`,
  run: () => fm(lines),
  naming: ['review: ', ...naming],
});

const MOUNTS = [
  { path: '/srv/a', readOnly: true },
  { path: '/srv/web', readOnly: true },
];

test('`writable:`: the folders a step may write, read, refused, and mounted', async (t) => {
  const rows: Row[] = [
    reads('the folder names it lists', 'writable: web, docs', ['web', 'docs']),
    reads('none without the line', 'permissionMode: dontAsk'),
    refuses(
      'a path',
      'writable: web/src',
      '`writable: web/src` has `web/src`',
      "not a directory's name",
      '`writable: web, docs`',
      'nemia factory ls',
    ),
    refuses('a hidden one', 'writable: ..', '`writable: ..` has `..`', "not a directory's name"),
    refuses('one given twice', 'writable: web, web', 'names `web` twice'),
    refuses('none', 'writable: , ,', '`writable: , ,` names no folder'),
    refuses(
      'on a remote A2A agent',
      'harness: a2a:peer\nwritable: web',
      '`writable: web` gives a session on this machine',
      "another party's machine",
    ),
    refuses('over plan', 'permissionMode: plan\nwritable: web', '`writable: web`', 'runs in `plan`', 'writes nothing', ...FIX),
    refuses('over codex read-only', 'harness: codex\nsandbox: read-only\nwritable: web', 'runs in `read-only`', 'writes nothing', ...FIX),
    refuses(
      'over tools that write no file',
      'tools: Read, Grep\nwritable: web',
      'has only the tools `Read`, `Grep`',
      'none writes a file',
      ...FIX,
    ),
    refuses(
      'over dontAsk with no Edit rule',
      'permissionMode: dontAsk\nallowedTools: Bash(npm test)\nwritable: web',
      'runs in `dontAsk`',
      'asks before an edit',
      'allows no `Edit` rule',
      ...FIX,
    ),
    refuses('over default, which asks', 'permissionMode: default\nwritable: web', 'runs in `default`', 'asks before an edit', ...FIX),
    reads('over a fence that allows Edit', 'permissionMode: dontAsk\nallowedTools: Edit(**)\nwritable: web', ['web']),
    reads('over tools with Edit', 'tools: Read, Edit\nwritable: web', ['web']),
    reads('over tools with Bash, which writes by a redirection', 'tools: Read, Bash\nwritable: web', ['web']),
    reads("over the runtime's default mode", 'writable: web', ['web']),
    reads('over dontAsk with an edit rule', 'permissionMode: dontAsk\nallowedTools: Bash(npm test), Edit(src/**)\nwritable: web', ['web']),
    reads('over acceptEdits', 'permissionMode: acceptEdits\nwritable: web', ['web']),
    reads('over codex workspace-write', 'harness: codex\nsandbox: workspace-write\nwritable: web', ['web']),
    {
      row: "REFUSED: over an agent's fence that writes nothing, naming the agent's file",
      run: () => {
        const team = teamCopy();
        fs.writeFileSync(path.join(team, 'agents', 'planner.md'), '---\npermissionMode: plan\n---\nPlan it.\n');
        const agents = loadAgents(agentsDir(path.join(team, 'dev')));
        return parseWorkflow('plan', '---\nplace: git\nagent: planner\nwritable: web\n---\n', undefined, agents);
      },
      naming: ['plan: `writable: web`', "with agents/planner.md's, runs in `plan`", 'Delete the line', 'allows `Edit(**)`'],
    },
    {
      row: 'stepMounts: the folders named writable, every other read-only',
      run: () =>
        assert.deepEqual(stepMounts({ writable: ['web'] }, MOUNTS), [
          { path: '/srv/a', readOnly: true },
          { path: '/srv/web', readOnly: false },
        ]),
    },
    { row: 'stepMounts: none named, all read-only', run: () => assert.deepEqual(stepMounts({}, MOUNTS), MOUNTS) },
    {
      row: 'stepMounts: a parent folder is no folder of the factory',
      run: () => assert.deepEqual(stepMounts({ writable: ['srv'] }, MOUNTS), MOUNTS),
    },
    { row: 'stepMounts: a run that mounts none', run: () => assert.equal(stepMounts({ writable: ['web'] }, undefined), undefined) },
  ];
  for (const { row, run, naming } of rows)
    await t.test(row, () => {
      if (!naming) return void run();
      const [at = '', ...named] = naming;
      assert.throws(run, (e: unknown) => {
        assert.ok(e instanceof Invalid, String(e));
        assert.equal(e.exitCode, 2, e.message);
        assert.ok(e.message.startsWith(at), e.message);
        for (const name of named) assert.ok(e.message.includes(name), `names ${name}: ${e.message}`);
        return true;
      });
    });
});
