/**
 * The decider screen's pure part: what a branch touched, told by where it is and by what reads it.
 *
 * Data in, lines out. `branches.ts` asks git (`numstat`, `sensitiveDiff`), `views.ts` the engine (`consumption`),
 * `cli.ts` prints, and nothing here reads a disk or spawns a thing — so every line the screen shows a
 * person can be tested as a string.
 *
 * The lists are written once, here, and `wf decide --help` prints them. A glob is a path from the
 * repository root: `*` and `?` stay within a directory, `**` crosses any number of them — a leading
 * `**` and its slash cross none as well, so the root's `package.json` is in the list — and a trailing
 * `/` takes everything below.
 */

/**
 * One file a branch changed, as `git diff --numstat` counts it. A rename keeps where it came `from`.
 * A binary file has no line counts: `null`, never 0, because git counted nothing.
 */
export type Change = { path: string; from?: string; added: number | null; removed: number | null };

/** A part of the repository a change touched: a workspace package, a top-level directory, or the root. */
export type Group = { name: string; files: number; added: number; removed: number; binary: number };

export type Radius = {
  changes: Change[]; groups: Group[]; agentFacing: string[]; checkAffecting: string[];
  /** The changes to a file where the next agent reads (`isLesson`), for the lesson line. */
  lessons: Change[];
  /**
   * The base's `workspaces` globs that have `**`, as written (`deepWorkspaces`): each file still counts once, and the screen names
   * them. Absent on a radius nobody read workspaces for.
   */
  deepWorkspaces?: string[];
};

/** A branch the screen read, and what it touched — or why that could not be read. */
export type Touched = { branch: string; radius: Radius | { error: string } };

/** Files an agent reads as instructions before it reads the brief. A change to one changes every step after it. */
export const AGENT_FACING: readonly string[] = ['**/CLAUDE.md', '**/AGENTS.md', '**/.claude/', '**/.codex/', '**/.mcp.json', '**/README.md'];

/**
 * Files that decide what a check means: its scripts, its dependencies, its compiler, and its tests. A
 * change could edit one of these to make its check pass, so they are the default `--sensitive` list,
 * and their whole diff is on the screen.
 */
export const CHECK_AFFECTING: readonly string[] = ['**/package.json', '**/package-lock.json', '**/tsconfig*.json', '**/turbo.json', '**/*.test.*', '**/test/', '**/.e2e/'];

/**
 * Where the next agent reads what this one learned (CLAUDE.md's "When you miss"): these, and the `docs/` of
 * each workspace package (`lessonGlobs`). Not any `docs/`: an app's `src/routes/docs/` is product code, and a
 * lesson line that counts it says a lesson was written when none was — the one wrong answer the line is for.
 */
export const LESSON: readonly string[] = ['**/CLAUDE.md', '**/AGENTS.md', 'docs/'];

/**
 * A `workspaces` glob as the radius matches it: a leading `./` and a trailing `/` dropped, so `./packages/*` is `packages/*`, with or
 * without a slash after it. npm reads them the same; a regexp built from `./packages/*` as written never matched a path git prints, so every package's
 * change fell into one `packages` group and no package's `docs/` counted as a lesson.
 */
export const workspaceGlob = (written: string): string => written.replace(/^(?:\.\/+)+/, '').replace(/\/+$/, '');

/**
 * The globs among a repository's `workspaces` that have `**`, as written. Not refused — the repository's `package.json` is not
 * ours — but named on the screen (`radiusLines`), since such a glob names a package at any depth: each file counts once all the
 * same, in the outermost package on its way (`packageOf`), and as a lesson only in that package's own `docs/` (`isLesson`).
 */
export const deepWorkspaces = (workspaces: readonly string[]): string[] => workspaces.filter((w) => workspaceGlob(w).includes('**'));

/**
 * The lesson list for a repository: `LESSON`, and `<workspace>/docs/` for each of its npm `workspaces` globs without `**`. Made from
 * `packages/**`, that glob would take a `docs/` inside a package's source too — `packages/x/src/docs/`, product code — so a `**` glob's
 * packages are read one file at a time instead (`isLesson`).
 */
export const lessonGlobs = (workspaces: readonly string[]): string[] =>
  [...LESSON, ...workspaces.map(workspaceGlob).filter((w) => !w.includes('**')).map((w) => `${w}/docs/`)];

/** The group of a file in no directory. */
export const ROOT_GROUP = '(root)';

export function globRegExp(glob: string): RegExp {
  const g = glob.endsWith('/') ? `${glob}**` : glob;
  let re = '';
  for (let i = 0; i < g.length; i++) {
    if (g.startsWith('**/', i)) { re += '(?:.*/)?'; i += 2; }
    else if (g.startsWith('**', i)) { re += '.*'; i += 1; }
    else if (g[i] === '*') re += '[^/]*';
    else if (g[i] === '?') re += '[^/]';
    else re += g[i]!.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

export const matches = (file: string, globs: readonly string[]): boolean => globs.some((g) => globRegExp(g).test(file));

/** Both ends of a rename: moving a test out of `test/` changes the check as much as editing it. */
const pathsOf = (c: Change): string[] => (c.from ? [c.from, c.path] : [c.path]);
const nameOf = (c: Change): string => (c.from ? `${c.from} → ${c.path}` : c.path);
const linesOf = (c: Change): string => (c.added === null || c.removed === null ? 'binary' : `+${c.added} −${c.removed}`);

/** A path git had to quote — a tab, a quote, a backslash in it — as the name it is. */
function unquote(s: string): string {
  if (s.length < 2 || !s.startsWith('"') || !s.endsWith('"')) return s;
  const ESCAPED: Record<string, string> = { n: '\n', t: '\t', r: '\r', a: '\x07', b: '\b', f: '\f', v: '\v' };
  const body = s.slice(1, -1);
  const bytes: number[] = [];
  const utf8 = new TextEncoder();
  for (let i = 0; i < body.length; i++) {
    if (body[i] !== '\\') {
      const ch = String.fromCodePoint(body.codePointAt(i)!);
      i += ch.length - 1;
      bytes.push(...utf8.encode(ch));
      continue;
    }
    // Git writes each byte of a name it quotes as three octal digits.
    const octal = /^[0-3][0-7]{2}/.exec(body.slice(i + 1));
    if (octal) { bytes.push(parseInt(octal[0], 8)); i += 3; continue; }
    const next = body[++i] ?? '';
    bytes.push(...utf8.encode(ESCAPED[next] ?? next));
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

/** `old => new`, or `dir/{old => new}/rest` when the two share a prefix or a suffix. */
function renamed(spec: string): { path: string; from?: string } {
  const tidy = (p: string) => unquote(p.replace(/\/{2,}/g, '/'));
  const brace = /^(.*)\{(.*) => (.*)\}(.*)$/.exec(spec);
  if (brace) {
    const [, before, from, to, after] = brace as unknown as [string, string, string, string, string];
    return { from: tidy(`${before}${from}${after}`), path: tidy(`${before}${to}${after}`) };
  }
  const [from, to, ...more] = spec.split(' => ');
  return to !== undefined && !more.length ? { from: unquote(from!), path: unquote(to) } : { path: unquote(spec) };
}

/**
 * `git diff --numstat` read into changes. A line it cannot read is refused rather than skipped: a
 * radius that drops a file it did not understand under-reports exactly what it exists to report.
 */
export function parseNumstat(numstat: string): Change[] {
  return numstat.split('\n').filter((line) => line.trim()).map((line) => {
    const m = /^(-|\d+)\t(-|\d+)\t(.+)$/.exec(line);
    if (!m) throw new Error(`not a line of git diff --numstat: ${JSON.stringify(line)}`);
    const count = (n: string) => (n === '-' ? null : Number(n));
    return { ...renamed(m[3]!), added: count(m[1]!), removed: count(m[2]!) };
  });
}

/**
 * The workspace package a file is in: the outermost directory on its way that a `workspaces` glob names (`packages/agent-orchestrator`),
 * or undefined when none does. Outermost, so a glob with `**`, which names every directory below `packages/`, puts a file in one package.
 */
export function packageOf(file: string, workspaces: readonly string[]): string | undefined {
  const dirs = file.split('/').slice(0, -1);
  const packages = workspaces.map((w) => globRegExp(workspaceGlob(w)));
  for (let n = 1; n <= dirs.length; n++) {
    const dir = dirs.slice(0, n).join('/');
    if (packages.some((p) => p.test(dir))) return dir;
  }
  return undefined;
}

/**
 * The group a file counts in: the workspace package it is in (`packageOf`), else its top-level directory, else the root.
 */
export function groupOf(file: string, workspaces: readonly string[] = []): string {
  const dirs = file.split('/').slice(0, -1);
  if (!dirs.length) return ROOT_GROUP;
  return packageOf(file, workspaces) ?? dirs[0]!;
}

/**
 * Whether a file is where the next agent reads: on `lessonGlobs`, or — for a package a `**` glob names — in the `docs/` of the one
 * package `packageOf` puts it in, and no `docs/` deeper in that package.
 */
export function isLesson(file: string, workspaces: readonly string[] = []): boolean {
  if (matches(file, lessonGlobs(workspaces))) return true;
  const deep = deepWorkspaces(workspaces).map((w) => globRegExp(workspaceGlob(w)));
  const pkg = deep.length ? packageOf(file, workspaces) : undefined;
  return pkg !== undefined && deep.some((p) => p.test(pkg)) && file.startsWith(`${pkg}/docs/`);
}

/**
 * What a branch touched, grouped by blast radius. A file counts in every group it touched — a move
 * from one package to another is a change to both — and a binary file counts as a file, with no lines.
 */
export function radius(numstat: string, workspaces: readonly string[] = []): Radius {
  const changes = parseNumstat(numstat);
  const groups = new Map<string, Group>();
  for (const c of changes) {
    for (const name of new Set(pathsOf(c).map((p) => groupOf(p, workspaces)))) {
      const g = groups.get(name) ?? { name, files: 0, added: 0, removed: 0, binary: 0 };
      g.files++;
      if (c.added === null || c.removed === null) g.binary++;
      else { g.added += c.added; g.removed += c.removed; }
      groups.set(name, g);
    }
  }
  const touching = (globs: readonly string[]) => changes.filter((c) => pathsOf(c).some((p) => matches(p, globs)));
  return {
    changes,
    groups: [...groups.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),
    agentFacing: touching(AGENT_FACING).map(nameOf),
    checkAffecting: touching(CHECK_AFFECTING).map(nameOf),
    lessons: changes.filter((c) => pathsOf(c).some((p) => isLesson(p, workspaces))),
    deepWorkspaces: deepWorkspaces(workspaces),
  };
}

/**
 * The radius for a person: a line per group, then the agent-facing and check-affecting lines, each only when true — and a line naming
 * a `workspaces` glob with `**`, when the base has one, since the groups above are read through it.
 */
export function radiusLines(r: Radius): string[] {
  if (!r.changes.length) return ['nothing — the branch changed no file against the base'];
  const width = Math.max(...r.groups.map((g) => g.name.length));
  const files = Math.max(...r.groups.map((g) => `${g.files}`.length));
  const groups = r.groups.map((g) => {
    const counted = g.files - g.binary;
    const lines = [counted ? `+${g.added} −${g.removed}` : '', g.binary ? (counted ? `${g.binary} binary` : 'binary') : ''].filter(Boolean).join(' · ');
    return `${g.name.padEnd(width)}  ${`${g.files}`.padStart(files)} file${g.files === 1 ? ' ' : 's'}  ${lines}`;
  });
  return [
    ...groups,
    ...(r.agentFacing.length ? [`agent-facing     ${r.agentFacing.join(', ')}`] : []),
    ...(r.checkAffecting.length ? [`check-affecting  ${r.checkAffecting.join(', ')}`] : []),
    ...(r.deepWorkspaces?.length
      ? [`workspaces       ${r.deepWorkspaces.join(', ')} in the base's package.json ${r.deepWorkspaces.length > 1 ? 'cross' : 'crosses'} directories: a file counts once, in the outermost package on its way, and as a lesson only in that package's docs/`]
      : []),
  ];
}

/**
 * The branches whose diff the screen reads: the run's result branches, or — when no terminal step has
 * one yet, as when the first step's check refused it — every branch a step worked on, since that is
 * where the work a person has to judge is.
 *
 * `base` is the run's own base branch, given only for a run that cut worktrees (`isolate`): it is dropped from that fallback, because
 * such a run's work is never on it. A step that recorded the base branch worked in the repository's own checkout (`workspace: main`),
 * where the run commits nothing — so the diff between the run's frozen base and that branch is not the run's work but the base moving
 * under it, which every other run's merge adds to. Read as the work, a workflow of one such step showed a person everything merged
 * since it started, above the question it was asking them. `tipBranches` refuses the same branch for the same reason.
 *
 * A run that worked on its base branch itself (`--no-worktree`) gives none: there that branch is exactly where its work is.
 */
export const branchesToRead = (result: readonly string[], worked: ReadonlyArray<string | undefined>, base?: string): string[] =>
  result.length ? [...result] : [...new Set(worked.filter((b): b is string => Boolean(b) && b !== base))];

/** The paths whose whole diff the screen prints: every end of every change a glob names. */
export const sensitivePaths = (changes: readonly Change[], globs: readonly string[]): string[] =>
  changes.filter((c) => pathsOf(c).some((p) => matches(p, globs))).flatMap(pathsOf);

/** `--sensitive a,b` read into globs; empty entries dropped. */
export const parseGlobs = (arg: string): string[] => arg.split(',').map((g) => g.trim()).filter(Boolean);

/** The heading over the files printed in full, saying why they are. */
export const sensitiveHeading = (globs: readonly string[] | undefined): string =>
  globs
    ? `in full: the files --sensitive names (${globs.join(', ')}), in place of what decides a check`
    : 'in full: the check-affecting files — what a change could edit to make its check pass';

/** What each branch touched, for a person: the branch, then its radius beneath it. */
export const touchedLines = (touched: readonly Touched[]): string[] =>
  touched.flatMap(({ branch, radius: r }) => ('error' in r
    ? [`touched  ${branch}  —  not read: ${r.error}`]
    : [`touched  ${branch}`, ...radiusLines(r).map((line) => `  ${line}`)]));

/**
 * The files printed in full on one branch, under a heading that says why: the diff git gave, `none`
 * when no changed file is on the list — said, so an empty section is not mistaken for one never
 * looked at — or why it could not be read.
 */
export function inFullLines(t: Touched, globs: readonly string[] | undefined, diff: string | undefined, many = false): string[] {
  const heading = `${sensitiveHeading(globs)}${many ? `, on ${t.branch}` : ''}`;
  const body = 'error' in t.radius ? [`not read: ${t.radius.error}`]
    : diff === undefined ? [`not read: git could not diff ${t.branch}`]
    : diff.trim() ? diff.replace(/\n+$/, '').split('\n')
    : ['none'];
  return [`── ${heading} ${'─'.repeat(Math.max(3, 64 - heading.length))}`, ...body];
}

/**
 * The lesson line, for the whole run: whether its branches changed a file the next agent reads. A
 * branch that could not be read is not a branch that wrote nothing, and the line says it does not know.
 */
export function lessonLine(touched: readonly Touched[]): string {
  const unread = touched.filter((t) => 'error' in t.radius).map((t) => t.branch);
  if (unread.length) return `lesson  not known — ${unread.join(', ')} could not be read`;
  const written = touched.flatMap(({ branch, radius: r }) => (r as Radius).lessons
    .map((c) => `${nameOf(c)} ${linesOf(c)}${touched.length > 1 ? ` (${branch})` : ''}`));
  return `lesson  ${written.length ? written.join(' · ') : 'nothing written where the next agent reads'}`;
}

/**
 * What a session consumed, as the engine's `Usage` carries it: a count nobody measured is absent, never 0. `costUsd` is the harness's own
 * figure, and `apiMs` and `toolMs` the time it counted waiting on the model and running tools — each read once a session has ended.
 */
export type Consumed = {
  turns?: number; toolCalls?: number; inputTokens?: number; outputTokens?: number; costUsd?: number; apiMs?: number; toolMs?: number;
  /** The input in its three classes, which sum to `inputTokens` where the runner saw them: read from the cache, written to it, neither. */
  cacheReadTokens?: number; cacheWriteTokens?: number; uncachedTokens?: number;
  /** The largest context one response read. Of several attempts, the largest of theirs: a peak does not add up. */
  peakContextTokens?: number;
  /**
   * One attempt's first response: the context it read and what of it was written to the cache (`rebuiltCache`). Not summed: several
   * attempts have no one first response.
   */
  firstContextTokens?: number; firstCacheWriteTokens?: number;
  /** How many times its sessions compacted their conversation, which a session does short of its window. Absent where none was seen. */
  compactions?: number;
  /**
   * How many of its attempts were resumed and wrote their parent's conversation to the cache again (`rebuiltCache`) — a reading of the
   * counts above, not a count the engine made. Absent where none did.
   */
  rebuiltCaches?: number;
};

const FIELDS = ['turns', 'toolCalls', 'inputTokens', 'outputTokens', 'costUsd', 'apiMs', 'toolMs', 'cacheReadTokens', 'cacheWriteTokens', 'uncachedTokens'] as const;

/**
 * Several attempts' usage as one. A count is the sum only when every attempt measured it: a sum over
 * the attempts that happened to be counted would under-report, and read as the whole. The peak is the
 * largest, by the same rule: an attempt that measured none may have been the largest.
 */
export function sumUsage(usages: ReadonlyArray<Consumed | null | undefined>): Consumed | undefined {
  if (!usages.length) return undefined;
  const sum: Consumed = {};
  for (const field of FIELDS) {
    if (usages.every((u) => u?.[field] !== undefined)) sum[field] = usages.reduce((n, u) => n + u![field]!, 0);
  }
  if (usages.every((u) => u?.peakContextTokens !== undefined)) sum.peakContextTokens = Math.max(...usages.map((u) => u!.peakContextTokens!));
  const rebuilt = usages.reduce((n, u) => n + (u?.rebuiltCaches ?? 0), 0);
  if (rebuilt) sum.rebuiltCaches = rebuilt;
  const compactions = usages.reduce((n, u) => n + (u?.compactions ?? 0), 0);
  if (compactions) sum.compactions = compactions;
  return Object.keys(sum).length ? sum : undefined;
}

/**
 * Whether a resumed attempt rebuilt its cache rather than read it: its first response wrote more than half the context it read to the
 * cache. A continuation's first response reads its parent's whole conversation, which a warm cache serves as reads; written again, it is
 * the same tokens at twenty times a read's price — 43 resumed sessions did, 200k to 640k tokens each, over the week to 2026-09-18, and the
 * one input count hid it. Judged on the first response alone: the attempt's writes in all grow with its work, and a warm continuation from
 * 60k to 150k writes some 90k. Never for an attempt that started cold, whose first writes are its cache, nor one whose runner did not see
 * its first response.
 */
export const rebuiltCache = (u: Consumed | null | undefined, resumed: boolean): boolean =>
  resumed && u?.firstCacheWriteTokens !== undefined && u.firstContextTokens !== undefined && u.firstCacheWriteTokens > u.firstContextTokens / 2;

/** Past this a context is large, cap or no cap: the median worker of 2026-09-18 peaked at 173k, the largest at 831k. */
export const LARGE_CONTEXT = 200_000;

/**
 * Where a peak stands against a step's `context:` cap: `cap` once the session reached it — it compacted, which Claude Code does well short
 * of its window (at 173,584 and 173,254 tokens under a 200k one, engine open issue 26), or its peak got there — and `large` past
 * `LARGE_CONTEXT` on a step with none. Null otherwise, and where nobody measured either.
 */
export function peakMark(u: Consumed | null | undefined, cap: number | undefined): 'cap' | 'large' | null {
  const peak = u?.peakContextTokens;
  if (cap !== undefined) return u?.compactions || (peak !== undefined && peak >= cap) ? 'cap' : null;
  return peak !== undefined && peak > LARGE_CONTEXT ? 'large' : null;
}

/** How often a session compacted, in words: `compacted`, `compacted twice`, `compacted 3 times`. */
const compactedWords = (n: number): string => `compacted${n === 1 ? '' : n === 2 ? ' twice' : ` ${n} times`}`;

/**
 * What a session read, by price, for a person at a glance: `read 21.4M · wrote 412k · peak 167k` — the cache's reads and writes, which
 * are nearly all of an attempt's input and priced twenty-fold apart, and the largest context it carried. The peak says where it reached
 * a step's `context:` cap — compacting says it did — or passed 200k with none, and a resumed attempt that rebuilt its cache says so. Empty where nothing measured
 * any of it: a runner that counted none says nothing, rather than 0.
 */
export function readWords(u: Consumed | null | undefined, cap?: number): string {
  if (!u) return '';
  const mark = peakMark(u, cap);
  const where = [
    ...(u.compactions ? [compactedWords(u.compactions)] : []),
    ...(mark === 'large' ? [`past ${count(LARGE_CONTEXT)} with no cap`] : []),
  ].join(', ');
  const reached = mark === 'cap' ? `${u.compactions ? `${where} ` : ''}at its ${count(cap!)} cap` : where;
  const peak = u.peakContextTokens !== undefined
    ? `peak ${count(u.peakContextTokens)}${reached ? `, ${reached}` : ''}`
    : reached || undefined;
  const rebuilt = u.rebuiltCaches
    ? u.rebuiltCaches > 1
      ? `${u.rebuiltCaches} resumed sessions wrote their context to the cache again instead of reading it`
      : 'a resumed session wrote its context to the cache again instead of reading it'
    : undefined;
  return [
    ...(u.cacheReadTokens !== undefined ? [`read ${count(u.cacheReadTokens)}`] : []),
    ...(u.cacheWriteTokens !== undefined ? [`wrote ${count(u.cacheWriteTokens)}`] : []),
    ...(peak ? [peak] : []),
    ...(rebuilt ? [rebuilt] : []),
  ].join(' · ');
}

/**
 * Dollars for a person: to the cent, and to three figures under one — a session's $0.004 rounded to "$0.00" is the zero these lines
 * refuse.
 */
export const dollars = (usd: number): string => `$${usd > 0 && usd < 0.01 ? Number(usd.toPrecision(3)) : usd.toFixed(2)}`;

/** A budget as its author writes one: `$3`, `$2.50`. */
export const budgetWord = (usd: number): string => (Number.isInteger(usd) ? `$${usd}` : dollars(usd));

/** A count for a person, to three figures: 112000 → 112k, 6350000 → 6.35M. */
export function count(n: number): string {
  for (const [of, unit] of [[1e9, 'B'], [1e6, 'M'], [1e3, 'k']] as const) {
    if (n >= of * 0.9995) return `${Number((n / of).toPrecision(3))}${unit}`;
  }
  return String(n);
}

/** A duration for a person, as the operator measures one: `58s`, `19m42s`, `1h05m`, `2d03h`. */
export function durationWord(ms: number): string {
  const s = Math.floor(Math.max(0, ms) / 1000);
  const two = (n: number) => String(n).padStart(2, '0');
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m${two(s % 60)}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h${two(m % 60)}m`;
  return `${Math.floor(h / 24)}d${two(h % 24)}h`;
}

/**
 * What a step consumed, beside its check: `used` and `cost`. Unmeasured says so, never `0` — a zero
 * that means "nobody counted" reads as "cost nothing". Cost prints a number only where the engine measured
 * one: the harness's own figure, read once a session has ended (agent-runtime's README, *What an attempt consumed*).
 * The api and tool time go beside the counts once either was measured, and each says not measured where the
 * other was — `claude-detached` counts api time and no tool time — and neither is said where nothing timed it.
 */
export function usedLines(u: Consumed | undefined): string[] {
  const read = readWords(u);
  const cost = `cost  ${u?.costUsd !== undefined ? dollars(u.costUsd) : 'not measured'}${read ? ` · ${read}` : ''}`;
  if (!u) return ['used  not measured', cost];
  const said = (n: number | undefined, what: string, unmeasured: string) => (n === undefined ? `${unmeasured} not measured` : `${count(n)} ${what}`);
  // A measured moment is not nothing: under a second reads `<1s`, never `0s`.
  const took = (ms: number | undefined, what: string) => (ms === undefined ? `${what} not measured` : `${what} ${ms > 0 && ms < 1000 ? '<1s' : durationWord(ms)}`);
  const timed = u.apiMs !== undefined || u.toolMs !== undefined ? [took(u.apiMs, 'api'), took(u.toolMs, 'tools')] : [];
  return [
    `used  ${[
      said(u.turns, 'turns', 'turns'),
      said(u.toolCalls, 'tool calls', 'tool calls'),
      said(u.inputTokens, 'in', 'tokens in'),
      said(u.outputTokens, 'out', 'tokens out'),
      ...timed,
    ].join(' · ')}`,
    cost,
  ];
}
