/**
 * Every `sdk.d.ts:<line>` citation in our prose points at what it claims, in the Agent SDK that is installed.
 *
 * A boundary test: the real installed `sdk.d.ts` is its whole subject — a stand-in of it would be a second table of line numbers,
 * which is the very thing this refuses — and the files it scans are the real git listing of the checkout.
 *
 * Prose is not a constraint: a dozen comments across the runtime name a line of the SDK's own declarations, and an SDK bump rewrites
 * that file top to bottom — 0.3.270 to 0.3.308 moved every one of them, some by two hundred lines. A citation nobody can check rots
 * into a line that says something else, and a reader who follows it is misled with no warning, which is the same class of fault as a
 * lock that fell behind a range. So each citation is named here with the identifier it stands for, and the cited line — or, for a
 * range, some line of it — must hold that identifier in the installed `sdk.d.ts`. A citation this table does not name is refused too:
 * a new one is added here, at the bump that introduced it, or it is not a citation anybody can trust.
 *
 * The line numbers belong to `test/sdk-pin.ts`'s `SDK_VERSION` alone, and are re-read at each bump. The one way to do that is to grep
 * the installed file for each identifier below.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { SDK_VERSION } from './sdk-pin.ts';

const ROOT = path.join(import.meta.dirname, '..', '..', '..');
const SDK = path.join(ROOT, 'node_modules', '@anthropic-ai', 'claude-agent-sdk', 'sdk.d.ts');

/**
 * What each citation stands for: the identifier the cited line, or some line of the cited range, declares. A range is cited where the
 * claim is about a whole type or a doc comment with its field, and then the identifier is looked for anywhere inside it.
 */
const CLAIMS: Record<string, string> = {
  '1205-1220': 'McpHttpServerConfig',
  '1265-1315': 'McpServerStatus',
  '1694': 'env',
  '1896': 'includePartialMessages',
  '1991': 'mcpServers',
  '2054': 'permissionPrompts',
  '2349': 'strictMcpConfig',
  '2350-2461': 'systemPrompt',
  '2451-2461': 'systemPrompt',
  '3078': 'mcpServerStatus',
  '4687': 'appendSystemPrompt',
  '9304': 'autoCompactWindow',
};

/** Every `sdk.d.ts:<n>` and `sdk.d.ts:<n>-<m>` in `text`, by the `<n>` or `<n>-<m>` it cites. */
const citationsIn = (text: string): string[] => [...text.matchAll(/sdk\.d\.ts:(\d+(?:-\d+)?)/g)].map((m) => m[1]);

/** The files git lists under the packages and the apps, where our prose is. */
const ours = (): string[] =>
  execFileSync('git', ['ls-files', '-co', '--exclude-standard', 'packages', 'apps', 'tools', 'workflows', 'docs', 'README.md'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
    .split('\n')
    .filter((f) => /\.(ts|tsx|md|json)$/.test(f));

/**
 * Where the citation `cited`, made in `at`, does not hold what `claims` says it does in the `sdk.d.ts` whose lines are `lines`,
 * worded with what the cited lines do hold. `claims` is a parameter so the refusals below can be made to happen on a planted table.
 */
const citationRefusals = (lines: string[], at: string, cited: string, claims: Record<string, string> = CLAIMS): string[] => {
  const claim = claims[cited];
  if (claim === undefined)
    return [
      `${at} cites sdk.d.ts:${cited}, which test/sdk-citations.test.ts names no identifier for. Add it to CLAIMS with the ` +
        'identifier the line declares, so the next SDK bump refuses it when it moves.',
    ];
  const [from, to] = cited.includes('-') ? cited.split('-').map(Number) : [Number(cited), Number(cited)];
  if (to > lines.length)
    return [`${at} cites sdk.d.ts:${cited}, past the end of the installed sdk.d.ts (${lines.length} lines, ${SDK_VERSION})`];
  const slice = lines.slice(from - 1, to);
  if (slice.some((l) => new RegExp(`\\b${claim}\\b`).test(l))) return [];
  return [
    `${at} cites sdk.d.ts:${cited} for \`${claim}\`, and ${from === to ? `line ${from}` : `no line of ${cited}`} of the installed ` +
      `sdk.d.ts (${SDK_VERSION}) declares it. It holds: ${JSON.stringify(slice.length > 3 ? [...slice.slice(0, 3), '…'] : slice)}. ` +
      `Grep the installed sdk.d.ts for ${claim} and correct the citation and this table together.`,
  ];
};

const lines = fs.readFileSync(SDK, 'utf8').split('\n');

test('every sdk.d.ts citation in our prose points at the identifier it claims', () => {
  const found: string[] = [];
  const refusals: string[] = [];
  for (const file of ours()) {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    for (const cited of citationsIn(text)) {
      found.push(cited);
      refusals.push(...citationRefusals(lines, file, cited));
    }
  }
  assert.deepEqual(refusals, []);
  assert.ok(found.length >= 12, `the repository cites sdk.d.ts ${found.length} times: this file is here because it cites it at all`);
  assert.deepEqual(
    Object.keys(CLAIMS)
      .filter((c) => !found.includes(c))
      .sort(),
    [],
    'and the table names no citation the prose no longer makes: a line nobody cites is a line nobody re-reads',
  );
});

test('REFUSED: a citation one line off, a citation past the end of the file, and a citation the table does not name', () => {
  const drifted = citationRefusals(lines, 'a/file.ts', '2053', { '2053': 'permissionPrompts' });
  assert.equal(drifted.length, 1, 'a citation one line above the declaration is refused');
  assert.match(drifted[0], /line 2053 of the installed sdk\.d\.ts/);
  assert.match(drifted[0], /Grep the installed sdk\.d\.ts for permissionPrompts/, 'and says how to correct it');
  assert.deepEqual(citationRefusals(lines, 'a/file.ts', '2054', { '2054': 'permissionPrompts' }), [], 'and the line itself is not');

  const narrowed = citationRefusals(lines, 'a/file.ts', '1205-1220', { '1205-1220': 'McpServerStatus' });
  assert.equal(narrowed.length, 1, 'a range that holds a different type than the one claimed is refused');
  assert.match(narrowed[0], /no line of 1205-1220/);

  const unnamed = citationRefusals(lines, 'a/file.ts', '2054', {});
  assert.equal(unnamed.length, 1);
  assert.match(unnamed[0], /names no identifier for/, 'a citation nobody wrote a claim for is refused');

  const past = citationRefusals(lines, 'a/file.ts', '999999', { '999999': 'permissionPrompts' });
  assert.equal(past.length, 1);
  assert.match(past[0], /past the end of the installed sdk\.d\.ts/);
});
