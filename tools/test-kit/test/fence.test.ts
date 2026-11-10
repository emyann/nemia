/**
 * The matcher of Claude Code's rule shapes (`fence.ts`): what each shape of rule reaches, how a command is split into the parts a rule
 * is matched against, what a fence runs of a list of calls, and that a shape it does not model throws rather than passing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bash,
  type Call,
  deniedPartsOfCall,
  partsOf,
  partsOfCall,
  reaches,
  readsOutside,
  runsUnder,
  shown,
  typedPartsOf,
  WORK,
} from 'test-kit/fence';

test('the matcher reads the rule shapes the fences use, and throws on a wildcard it does not model', () => {
  const push = { tool: 'Bash', command: 'git push origin main' } as const;
  assert.equal(reaches('Bash(git push:*)', push), true);
  assert.equal(reaches('Bash(git push *)', push), true);
  assert.equal(reaches('Bash(git push)', push), false, 'a rule with no wildcard is the command exactly');
  assert.equal(reaches('Bash(git push)', { tool: 'Bash', command: 'git push' }), true);
  assert.equal(reaches('Bash(git pu:*)', push), false, 'a prefix ends at a word');
  assert.equal(reaches('Bash(git:*)', push), true);
  assert.equal(reaches('Bash', push), true, 'a bare Bash is every command');
  assert.equal(reaches('Bash(git branch --list:*)', { tool: 'Bash', command: 'git branch -D x' }), false);
  const unsafe = { tool: 'mcp__playwright__browser_run_code_unsafe' };
  assert.equal(reaches('mcp__playwright__browser_run_code_unsafe', unsafe), true);
  assert.equal(reaches('mcp__playwright', unsafe), true, 'a server is every tool of it');
  assert.equal(reaches('mcp__playwright__*', unsafe), true);
  assert.equal(reaches('mcp__playwright__browser_navigate', unsafe), false);
  assert.equal(reaches('Bash(git push:*)', unsafe), false);
  assert.equal(reaches('Edit(**)', { tool: 'Edit' }), true, 'an edit rule on any path reaches an edit');
  assert.equal(reaches('Edit(src/**)', { tool: 'Write' }), true, 'a write is matched against Edit rules');
  assert.equal(reaches('Edit', { tool: 'Write' }), true);
  assert.equal(reaches('Read(**)', { tool: 'Edit' }), false);
  assert.equal(reaches('Edit(**)', push), false);
  assert.equal(reaches('Bash(git * main)', push), true, 'a * inside a rule is any run of characters');
  assert.equal(reaches('Bash(git * main)', { tool: 'Bash', command: 'git push origin main2' }), false, 'up to the end of the command');
  const store = 'Bash(nemia factory instruction *--store*)';
  assert.equal(reaches(store, { tool: 'Bash', command: 'nemia factory instruction f --store' }), true);
  assert.equal(reaches(store, { tool: 'Bash', command: 'nemia factory instruction --store f' }), true, 'and none');
  assert.equal(reaches(store, { tool: 'Bash', command: 'nemia factory instruction f' }), false);
  assert.equal(reaches('Bash(git (x) *.md)', { tool: 'Bash', command: 'git (x) a.md' }), true, "a rule's other characters are its own");
  assert.equal(reaches('Bash(git (x) *.md)', { tool: 'Bash', command: 'git (x) a_md' }), false);
  const fetch = { tool: 'WebFetch', domain: 'code.claude.com' } as const;
  assert.equal(reaches('WebFetch(domain:code.claude.com)', fetch), true);
  assert.equal(reaches('WebFetch(domain:docs.claude.com)', fetch), false, 'a rule on a host is that host alone');
  assert.equal(reaches('WebFetch(domain:claude.com)', fetch), false, 'a host is matched whole, never as a suffix');
  assert.equal(reaches('WebFetch(domain:code.claude.com)', { tool: 'WebFetch' }), false, 'and reaches no fetch that says no host');
  assert.equal(reaches('WebFetch', fetch), true, 'a bare WebFetch is every host');
  assert.equal(reaches('WebFetch(domain:code.claude.com)', { tool: 'WebSearch' }), false);
  assert.throws(
    () => reaches('mcp__play*', unsafe),
    (err: Error) => err.message.includes('not modelled'),
  );
  assert.throws(
    () => reaches('WebFetch(url:https://code.claude.com/docs)', fetch),
    (err: Error) => err.message.includes('a rule on WebFetch is modelled for `domain:` alone'),
  );
});

test('the matcher reads a rule on a browser tool by the address it opens, as written, and throws on a parameter it does not model', () => {
  const live = 'mcp__playwright__browser_navigate(url:*:8787*)';
  const to = (url?: string): Call => ({ tool: 'mcp__playwright__browser_navigate', url });
  for (const url of ['http://127.0.0.1:8787/', 'localhost:8787', 'http://[::1]:8787/runs', 'http://localhost:8787'])
    assert.equal(reaches(live, to(url)), true, url);
  assert.equal(reaches(live, to('http://127.0.0.1:41234/')), false, 'another port');
  assert.equal(reaches(live, to('http://127.0.0.1:18787/')), false, "the colon is the port's");
  assert.equal(reaches(live, to()), false, 'a call that gives no address is matched by no parameter rule');
  assert.equal(reaches(live, { tool: 'mcp__playwright__browser_tabs', url: 'http://127.0.0.1:8787/' }), false, "a rule is one tool's");
  assert.equal(reaches('mcp__playwright__browser_navigate', to('http://127.0.0.1:8787/')), true, 'a bare name is every call of it');
  assert.equal(reaches('mcp__playwright', to('http://127.0.0.1:8787/')), true);
  assert.equal(shown(to('http://127.0.0.1:8787/')), 'mcp__playwright__browser_navigate(url:http://127.0.0.1:8787/)');
  for (const rule of ['mcp__playwright__browser_evaluate(function:*)', 'mcp__playwright__*(url:*)'])
    assert.throws(
      () => reaches(rule, to('http://127.0.0.1:8787/')),
      (err: Error) => err.message.includes('modelled for `url:` and `filename:` alone'),
      rule,
    );
  const named = 'mcp__playwright__browser_take_screenshot(filename:*)';
  const shot = (filename?: string): Call => ({ tool: 'mcp__playwright__browser_take_screenshot', filename });
  for (const filename of ['x.png', 'a/x.png', '/tmp/playwright-mcp/x.png']) assert.equal(reaches(named, shot(filename)), true, filename);
  assert.equal(reaches(named, shot()), false, 'a picture given no name is matched by no rule on its name');
  assert.equal(reaches(named, { tool: 'mcp__playwright__browser_snapshot', filename: 'x.yml' }), false);
  assert.equal(shown(shot('x.png')), 'mcp__playwright__browser_take_screenshot(filename:x.png)');
});

test('the matcher splits a command into the parts Claude Code matches, strips the wrappers it strips, and throws on a form it does not model', () => {
  assert.deepEqual(partsOf('cd packages/agent-orchestrator && pkill -f "turbo run test"'), [
    'cd packages/agent-orchestrator',
    'pkill -f "turbo run test"',
  ]);
  assert.deepEqual(partsOf('a || b; c | d |& e & f\ng'), ['a', 'b', 'c', 'd', 'e', 'f', 'g']);
  assert.deepEqual(partsOf('timeout 5 pkill -f turbo'), ['pkill -f turbo']);
  assert.deepEqual(partsOf('FOO=1 nohup timeout 2.5s killall node'), ['killall node']);
  assert.deepEqual(partsOf('true &'), ['true'], 'a command sent to the background is its own part');
  assert.deepEqual(partsOf("bash -c 'pkill -f x'"), ["bash -c 'pkill -f x'"], 'a shell started by a command is one part');
  assert.deepEqual(partsOf('timeoutx pkill'), ['timeoutx pkill'], 'a wrapper is a whole word');
  for (const command of ['kill $(pgrep -f turbo)', 'kill `pgrep -f turbo`', "bash -c 'a; pkill x'", 'npm test 2>&1', 'echo "a'])
    assert.throws(
      () => partsOf(command),
      (err: Error) => err.message.includes('not modelled'),
      command,
    );
  const compound = { tool: 'Bash', command: 'cd packages/agent-orchestrator && pkill -f "turbo run test"' } as const;
  assert.equal(reaches('Bash(pkill:*)', compound), false, 'a rule matched against the whole command misses the part');
  assert.ok(partsOfCall(compound).some((part) => reaches('Bash(pkill:*)', part)));
  assert.deepEqual(partsOfCall({ tool: 'Edit' }), [{ tool: 'Edit' }]);
  const assigned: Call = { tool: 'Bash', command: 'true && X=http://localhost:4318 timeout 5 true' };
  assert.deepEqual(typedPartsOf(assigned.command), ['true', 'X=http://localhost:4318 timeout 5 true']);
  assert.deepEqual(
    deniedPartsOfCall(assigned).map((part) => part.command),
    ['true', 'X=http://localhost:4318 timeout 5 true'],
    'a deny is matched against a part as typed too',
  );
  assert.ok(
    deniedPartsOfCall(assigned).some((part) => reaches('Bash(*:4318*)', part)),
    'so a deny of an address reaches an assignment',
  );
  assert.ok(!partsOfCall(assigned).some((part) => reaches('Bash(*:4318*)', part)), 'and an allow of it reaches nothing an assignment says');
  assert.deepEqual(deniedPartsOfCall({ tool: 'Edit' }), [{ tool: 'Edit' }]);
});

test('the matcher reads an edit rule by the path it covers, from the root, the home or the working folder, and throws on one it does not model', () => {
  const local = 'Edit(//**/.claude/settings.local.json)';
  assert.equal(reaches(local, { tool: 'Edit', path: '/home/u/projects/.claude/settings.local.json' }), true);
  assert.equal(reaches(local, { tool: 'Write', path: '/.claude/settings.local.json' }), true, 'a write too, and **/ is no folder as well');
  assert.equal(reaches(local, { tool: 'Edit', path: '/home/u/projects/.claude/settings.json' }), false);
  assert.equal(reaches(local, { tool: 'Edit', path: '/home/u/projects/x.claude/settings.local.json' }), false, 'a folder whole');
  assert.equal(reaches('Edit(~/.claude.json)', { tool: 'Write', path: '/home/u/.claude.json' }), true);
  assert.equal(reaches('Edit(~/.claude.json)', { tool: 'Write', path: '/home/u/x/.claude.json' }), false);
  assert.equal(reaches('Edit(//a/*/c)', { tool: 'Edit', path: '/a/b/c' }), true);
  assert.equal(reaches('Edit(//a/*/c)', { tool: 'Edit', path: '/a/b/d/c' }), false, 'a * stays within a folder');
  assert.equal(reaches('Read(//**)', { tool: 'Edit', path: '/a' }), false);
  assert.equal(reaches('Edit', { tool: 'Write', path: '/a' }), true);
  const contract = 'Edit(packages/*/contracts/*.contract.ts)';
  assert.equal(reaches(contract, { tool: 'Write', path: `${WORK}/packages/a/contracts/x.contract.ts` }), true, 'from the session');
  assert.equal(reaches(contract, { tool: 'Edit', path: `${WORK}/packages/a/contracts/x.contract.ts` }), true);
  assert.equal(reaches(contract, { tool: 'Write', path: `${WORK}/packages/a/contracts/laws.ts` }), false);
  assert.equal(reaches(contract, { tool: 'Write', path: `${WORK}/packages/a/contracts/n/x.contract.ts` }), false, 'one folder deep');
  assert.equal(reaches(contract, { tool: 'Write', path: `${WORK}/packages/a/b/contracts/x.contract.ts` }), false, 'a * is one name');
  assert.equal(reaches(contract, { tool: 'Write', path: '/elsewhere/packages/a/contracts/x.contract.ts' }), false, 'anchored');
  assert.equal(
    reaches('Edit(*/contracts/*.contract.ts)', { tool: 'Write', path: `${WORK}/packages/a/contracts/x.contract.ts` }),
    false,
    'a leading * is one folder, not two',
  );
  for (const odd of ['Edit(src/**)', 'Edit(x.ts)'])
    assert.throws(
      () => reaches(odd, { tool: 'Edit', path: `${WORK}/src/b` }),
      (err: Error) => err.message.includes('is not modelled') && err.message.includes('say how it reads'),
      odd,
    );
});

test('a fence runs what an allow reaches in every part and no deny reaches in any, and its mode or its check of a path can lift either', () => {
  const fence = { allow: ['Bash(git log:*)', 'Bash(cat:*)'], deny: ['Bash(*GIT_*)'] };
  const calls = ['git log -1', 'cat a && git log', 'GIT_PAGER=sh git log', 'git push', 'cat /etc/hostname'].map(bash);
  assert.deepEqual(runsUnder(fence, calls), ['Bash(git log -1)', 'Bash(cat a && git log)']);
  assert.deepEqual(runsUnder(fence, calls, { inside: false }), ['Bash(git log -1)', 'Bash(cat a && git log)', 'Bash(cat /etc/hostname)']);
  assert.deepEqual(
    runsUnder(fence, calls, { dontAsk: false }),
    ['Bash(git log -1)', 'Bash(cat a && git log)', 'Bash(git push)', 'Bash(cat /etc/hostname)'],
    'a mode that asks no allow runs what no deny reaches',
  );
  assert.equal(readsOutside(bash('ls ..')), true);
  assert.equal(readsOutside(bash('ls packages')), false);
  assert.throws(
    () => runsUnder({ allow: ['mcp__playwright__browser_navigate(url:*)'], deny: [] }, calls),
    (err: Error) => err.message.includes('in an allow list is not modelled'),
  );
});
