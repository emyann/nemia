/**
 * The board's structure (`docs/architecture.md`, *Who owns what*): it reaches the api over HTTP alone. Its source imports no workspace
 * package and no node built-in, and no relative path that leaves `apps/web` (`importBreaks`); the lint block for `apps/web/src` in
 * `.oxlintrc.json` refuses the same packages as they are typed. Only `lib/useFeed.ts` and `lib/useStepTranscript.ts` open an
 * `EventSource`, the api's two streams (`eventSourceBreaks`). Its reads go through `lib/api/read.ts` (`unschemedReads`, `read.test.ts`).
 *
 * The board names no store path and builds no command of its own: a command it shows is text the api answered. The files that do today are
 * the known exceptions architecture.md lists, counted here file by file, JSDoc included (`STORE_PATHS`, `COMMAND_TEXT`): a count only
 * shrinks. `ratchetBreaks` refuses a file the baseline does not hold, a count above the measure or below it, so a freed place cannot be
 * taken again, an entry for a file that is gone or clean, and an entry that names no card. A change that cuts a store path or a command
 * from a file lowers its count in the same commit.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';

const WEB = path.join(import.meta.dirname, '..');

/** The two files that open a stream from the api, and only they. */
const STREAMS = ['src/lib/useFeed.ts', 'src/lib/useStepTranscript.ts'];

/** A store's path or the variable that moves it: `~/.agent-workflows`, `~/.agent-engine`, `WF_ROOT`, `AE_ROOT`. */
const STORE_PATH = /\.agent-workflows|\.agent-engine|\bWF_ROOT\b|\bAE_ROOT\b/g;

/** A command of the orchestrator's CLI, under its name today or the one it takes: `wf retry`, `nemia start`. */
const COMMAND = /\b(?:wf|nemia) [a-z]+/g;

const COMMANDS_CARD = "Nemia platform slice 4: the command table and the rename to nemia; the api answers the web's command text";
const PATHS_CARD =
  "Nemia platform slice 4: the command table and the rename to nemia; the api answers the web's text, store paths included";

type Baseline = Record<string, { count: number; card: string }>;

/** Each file that spells a store path today, with its count of them and the card that moves them to the api. */
const STORE_PATHS: Baseline = {
  'src/components/NewWorkflow.tsx': { count: 1, card: PATHS_CARD },
  'src/routes/agents.tsx': { count: 3, card: PATHS_CARD },
  'src/routes/agents_.$from.$agent.tsx': { count: 1, card: PATHS_CARD },
  'src/routes/agents_.new.tsx': { count: 1, card: PATHS_CARD },
  'src/routes/agents_.skills.new.tsx': { count: 1, card: PATHS_CARD },
  'src/routes/workflows.tsx': { count: 1, card: PATHS_CARD },
};

/** Each file that spells a command today, JSDoc included, with its count of them and the card that moves them to the api. */
const COMMAND_TEXT: Baseline = {
  'src/components/AgentForm.tsx': { count: 1, card: COMMANDS_CARD },
  'src/components/Artifacts.tsx': { count: 5, card: COMMANDS_CARD },
  'src/components/Ask.tsx': { count: 2, card: COMMANDS_CARD },
  'src/components/CanvasLegend.tsx': { count: 1, card: COMMANDS_CARD },
  'src/components/CardGate.tsx': { count: 2, card: COMMANDS_CARD },
  'src/components/Closeout.tsx': { count: 1, card: COMMANDS_CARD },
  'src/components/DaemonLine.tsx': { count: 3, card: COMMANDS_CARD },
  'src/components/Decide.tsx': { count: 28, card: COMMANDS_CARD },
  'src/components/FactoriesCanvas.tsx': { count: 1, card: COMMANDS_CARD },
  'src/components/FactoryCanvas.tsx': { count: 4, card: COMMANDS_CARD },
  'src/components/FactoryCardStart.tsx': { count: 1, card: COMMANDS_CARD },
  'src/components/FactoryStart.tsx': { count: 2, card: COMMANDS_CARD },
  'src/components/Facts.tsx': { count: 4, card: COMMANDS_CARD },
  'src/components/Gate.tsx': { count: 7, card: COMMANDS_CARD },
  'src/components/LiftHold.tsx': { count: 2, card: COMMANDS_CARD },
  'src/components/Needs.tsx': { count: 6, card: COMMANDS_CARD },
  'src/components/PruneRun.tsx': { count: 3, card: COMMANDS_CARD },
  'src/components/Questions.tsx': { count: 2, card: COMMANDS_CARD },
  'src/components/QueueLane.tsx': { count: 2, card: COMMANDS_CARD },
  'src/components/RemoveRun.tsx': { count: 1, card: COMMANDS_CARD },
  'src/components/RunGone.tsx': { count: 1, card: COMMANDS_CARD },
  'src/components/RunNode.tsx': { count: 6, card: COMMANDS_CARD },
  'src/components/SkillForm.tsx': { count: 1, card: COMMANDS_CARD },
  'src/components/StartRun.tsx': { count: 7, card: COMMANDS_CARD },
  'src/components/StatusChip.tsx': { count: 4, card: COMMANDS_CARD },
  'src/components/StepInspector.tsx': { count: 3, card: COMMANDS_CARD },
  'src/components/StepNode.tsx': { count: 1, card: COMMANDS_CARD },
  'src/components/Timeline.tsx': { count: 3, card: COMMANDS_CARD },
  'src/components/TryAgent.tsx': { count: 2, card: COMMANDS_CARD },
  'src/components/WorkflowCanvas.tsx': { count: 1, card: COMMANDS_CARD },
  'src/components/conversation/PromptBox.tsx': { count: 2, card: COMMANDS_CARD },
  'src/lib/api/asks.ts': { count: 11, card: COMMANDS_CARD },
  'src/lib/api/daemon.ts': { count: 3, card: COMMANDS_CARD },
  'src/lib/api/decision.ts': { count: 10, card: COMMANDS_CARD },
  'src/lib/api/detail.ts': { count: 13, card: COMMANDS_CARD },
  'src/lib/api/factories.ts': { count: 1, card: COMMANDS_CARD },
  'src/lib/api/inbox.ts': { count: 9, card: COMMANDS_CARD },
  'src/lib/api/judged.ts': { count: 10, card: COMMANDS_CARD },
  'src/lib/api/library.ts': { count: 1, card: COMMANDS_CARD },
  'src/lib/api/runs.ts': { count: 15, card: COMMANDS_CARD },
  'src/lib/api/stats.ts': { count: 1, card: COMMANDS_CARD },
  'src/lib/api/tries.ts': { count: 4, card: COMMANDS_CARD },
  'src/lib/api/usage.ts': { count: 3, card: COMMANDS_CARD },
  'src/lib/api/workflows.ts': { count: 4, card: COMMANDS_CARD },
  'src/lib/asks.ts': { count: 14, card: COMMANDS_CARD },
  'src/lib/canvas.ts': { count: 4, card: COMMANDS_CARD },
  'src/lib/daemon.ts': { count: 6, card: COMMANDS_CARD },
  'src/lib/decide.ts': { count: 5, card: COMMANDS_CARD },
  'src/lib/factories.ts': { count: 2, card: COMMANDS_CARD },
  'src/lib/factory.ts': { count: 5, card: COMMANDS_CARD },
  'src/lib/gate.ts': { count: 5, card: COMMANDS_CARD },
  'src/lib/inbox.ts': { count: 5, card: COMMANDS_CARD },
  'src/lib/layout.ts': { count: 1, card: COMMANDS_CARD },
  'src/lib/pass.ts': { count: 3, card: COMMANDS_CARD },
  'src/lib/prune.ts': { count: 4, card: COMMANDS_CARD },
  'src/lib/say.ts': { count: 1, card: COMMANDS_CARD },
  'src/lib/stats.ts': { count: 3, card: COMMANDS_CARD },
  'src/lib/status.ts': { count: 16, card: COMMANDS_CARD },
  'src/lib/transcript.ts': { count: 1, card: COMMANDS_CARD },
  'src/routes/agents.tsx': { count: 1, card: COMMANDS_CARD },
  'src/routes/factories.$factory.tsx': { count: 1, card: COMMANDS_CARD },
  'src/routes/inbox.tsx': { count: 7, card: COMMANDS_CARD },
  'src/routes/inbox_.$name.tsx': { count: 1, card: COMMANDS_CARD },
  'src/routes/runs.$runId.tsx': { count: 12, card: COMMANDS_CARD },
  'src/routes/runs.$runId_.steps.$step.tsx': { count: 1, card: COMMANDS_CARD },
  'src/routes/runs.index.tsx': { count: 8, card: COMMANDS_CARD },
  'src/routes/stats.tsx': { count: 3, card: COMMANDS_CARD },
  'src/routes/workflows.tsx': { count: 2, card: COMMANDS_CARD },
  'src/routes/workflows_.$from.$workflow.$step.tsx': { count: 1, card: COMMANDS_CARD },
};

/** Every `.ts` and `.tsx` under `src`, by its path from `apps/web`, with its text. */
const sourceTexts = (): Map<string, string> =>
  new Map(
    fs
      .readdirSync(path.join(WEB, 'src'), { recursive: true, encoding: 'utf8' })
      .map((f) => `src/${f.split(path.sep).join('/')}`)
      .filter((f) => /\.tsx?$/.test(f))
      .sort()
      .map((f) => [f, fs.readFileSync(path.join(WEB, f), 'utf8')]),
  );

/** Source text with each comment line blanked: a line that opens with `//`, `/*` or `*`. */
const withoutComments = (text: string): string =>
  text
    .split('\n')
    .map((line) => (/^\s*(\/\/|\/\*|\*)/.test(line) ? '' : line))
    .join('\n');

/** Every module a piece of source names: imports and re-exports, type-only included, `import()` and `require()`. */
function importsIn(text: string): string[] {
  const code = withoutComments(text);
  const found = new Set<string>();
  for (const m of code.matchAll(/^\s*(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/gm)) found.add(m[1]);
  for (const m of code.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm)) found.add(m[1]);
  for (const m of code.matchAll(/\b(?:import|require)\s*\(\s*['"`]([^'"`]+)['"`]/g)) found.add(m[1]);
  return [...found].sort();
}

/** Whether a relative module named in `file` leaves `apps/web`. */
const leavesWeb = (file: string, mod: string): boolean =>
  mod.startsWith('.') && path.posix.normalize(path.posix.join(path.posix.dirname(file), mod)).startsWith('../');

/** Each import of the board's source that reaches past the api: a workspace package, a node built-in, a path out of `apps/web`. */
function importBreaks(texts: ReadonlyMap<string, string>): string[] {
  const out: string[] = [];
  for (const [file, text] of texts)
    for (const mod of importsIn(text)) {
      if (/^agent-(runtime|orchestrator)(\/|$)/.test(mod))
        out.push(`${file} imports ${mod}, a workspace package: the board reaches the api over HTTP alone`);
      else if (mod.startsWith('node:') || builtinModules.includes(mod))
        out.push(`${file} imports ${mod}, a node built-in: the board runs in a browser, and asks the api for what node knows`);
      else if (leavesWeb(file, mod)) out.push(`${file} imports ${mod}, a path out of apps/web: the board reaches the api over HTTP alone`);
    }
  return out;
}

/** Each file outside `STREAMS` that names an `EventSource` in its code: the api's streams are opened in those two files alone. */
const eventSourceBreaks = (texts: ReadonlyMap<string, string>): string[] =>
  [...texts]
    .filter(([file, text]) => !STREAMS.includes(file) && /\bEventSource\b/.test(withoutComments(text)))
    .map(([file]) => `${file} opens an EventSource: the api's streams are opened in ${STREAMS.join(' and ')} alone`);

/** Each file's count of `pattern`, for the files that hold it at least once. */
const measured = (texts: ReadonlyMap<string, string>, pattern: RegExp): Record<string, number> =>
  Object.fromEntries([...texts].map(([file, text]) => [file, text.match(pattern)?.length ?? 0]).filter(([, count]) => count !== 0));

/**
 * What a measure and its baseline disagree on, each a sentence naming the fix: a file the baseline does not hold, a count above or below
 * the measure, an entry for a file gone or clean, and an entry with no card.
 */
function ratchetBreaks(what: string, counts: Record<string, number>, baseline: Baseline, exists: (file: string) => boolean): string[] {
  const out: string[] = [];
  for (const [file, count] of Object.entries(counts))
    if (!(file in baseline))
      out.push(`${file} holds ${count} ${what}: the board shows what the api answers, so have the api answer it, never add it here`);
  for (const [file, { count: allowed, card }] of Object.entries(baseline)) {
    const count = counts[file] ?? 0;
    if (!card.trim()) out.push(`${file}'s entry for ${what} names no card: name the card that moves it to the api`);
    if (!exists(file))
      out.push(`${file} holds ${what} in the baseline but is not on disk: where it moved, rename its entry; else take it off`);
    else if (count === 0) out.push(`${file} holds no ${what} left: take its entry off the baseline`);
    else if (count > allowed)
      out.push(`${file} holds ${count} ${what}, more than the ${allowed} the baseline allows: have the api answer it instead`);
    else if (count < allowed) out.push(`${file} holds ${count} ${what}, fewer than the baseline's ${allowed}: lower its count to ${count}`);
  }
  return out;
}

const onDisk = (file: string): boolean => fs.existsSync(path.join(WEB, file));

test('the scan reads the board, and sees each way a file names a module', () => {
  const texts = sourceTexts();
  assert.ok(texts.size > 100 && STREAMS.every((f) => texts.has(f)), `read ${texts.size} files`);
  const text = [
    "import type { RunSummary } from './api/runs.ts';",
    'import {',
    '  a,',
    "} from '@/lib/multi-line.ts';",
    "export { b } from 'agent-orchestrator/run';",
    "import 'node:fs';",
    "const m = await import('../../../api/src/app.ts');",
    "// from 'nowhere' in a comment is no import",
    " * import('node:os') in a JSDoc is none either",
  ].join('\n');
  assert.deepEqual(importsIn(text), [
    '../../../api/src/app.ts',
    './api/runs.ts',
    '@/lib/multi-line.ts',
    'agent-orchestrator/run',
    'node:fs',
  ]);
});

test('the board imports no workspace package, no node built-in and no path out of apps/web', () => {
  assert.deepEqual(importBreaks(sourceTexts()), []);
});

test('REFUSED: a workspace package, a node built-in, and a path out of apps/web', () => {
  const planted = (mod: string): string[] => importBreaks(new Map([...sourceTexts(), ['src/x.ts', `import { y } from '${mod}';\n`]]));
  assert.deepEqual(planted('agent-orchestrator/run'), [
    'src/x.ts imports agent-orchestrator/run, a workspace package: the board reaches the api over HTTP alone',
  ]);
  assert.deepEqual(planted('agent-runtime'), [
    'src/x.ts imports agent-runtime, a workspace package: the board reaches the api over HTTP alone',
  ]);
  assert.deepEqual(planted('node:fs'), [
    'src/x.ts imports node:fs, a node built-in: the board runs in a browser, and asks the api for what node knows',
  ]);
  assert.deepEqual(planted('path'), [
    'src/x.ts imports path, a node built-in: the board runs in a browser, and asks the api for what node knows',
  ]);
  assert.deepEqual(planted('../../../api/src/app.ts'), [
    'src/x.ts imports ../../../api/src/app.ts, a path out of apps/web: the board reaches the api over HTTP alone',
  ]);
  assert.deepEqual(planted('../../api/src/app.ts'), [
    'src/x.ts imports ../../api/src/app.ts, a path out of apps/web: the board reaches the api over HTTP alone',
  ]);
  for (const mod of ['react', 'agent-orchestrator-ui', './lib/api.ts', '@/lib/api.ts', '../test/fixtures.ts'])
    assert.deepEqual(planted(mod), [], `${mod} is let through`);
});

test(`only ${STREAMS.join(' and ')} open an EventSource`, () => {
  assert.deepEqual(eventSourceBreaks(sourceTexts()), []);
});

test('REFUSED: an EventSource opened in another file; one named in a JSDoc is let through', () => {
  const planted = (text: string): string[] => eventSourceBreaks(new Map([...sourceTexts(), ['src/lib/x.ts', text]]));
  assert.deepEqual(planted("const s = new EventSource('/api/feed/stream');\n"), [
    "src/lib/x.ts opens an EventSource: the api's streams are opened in src/lib/useFeed.ts and src/lib/useStepTranscript.ts alone",
  ]);
  assert.deepEqual(planted('/** Follows an EventSource, or anything that dispatches its events. */\nexport const x = 1;\n'), []);
});

test('the store paths and the commands the board spells are held to their baselines, each entry naming its card', () => {
  const texts = sourceTexts();
  assert.deepEqual(ratchetBreaks('store paths', measured(texts, STORE_PATH), STORE_PATHS, onDisk), []);
  assert.deepEqual(ratchetBreaks('commands', measured(texts, COMMAND), COMMAND_TEXT, onDisk), []);
});

test('the patterns find what they name, and not their neighbours', () => {
  const texts = new Map([
    ['a.ts', "const root = '~/.agent-workflows/runs'; // AE_ROOT\nconst e = process.env.WF_ROOT;\nconst no = 'WF_ROOTS .agent-engined';"],
    [
      'b.ts',
      '/** Run `wf retry <run> <step>`, or `nemia start` once renamed. */\nconst s = `wf decide ${id}`;\nconst no = "wfx retry, wf 2";',
    ],
  ]);
  assert.deepEqual(measured(texts, STORE_PATH), { 'a.ts': 4 });
  assert.deepEqual(measured(texts, COMMAND), { 'b.ts': 3 });
});

test('REFUSED: a new file that spells a store path or a command, a count above or below the baseline, an entry gone, clean or with no card', () => {
  const baseline: Baseline = { 'src/a.ts': { count: 2, card: 'slice 4' } };
  const exists = (file: string): boolean => file !== 'src/gone.ts';
  const breaks = (counts: Record<string, number>, entries: Baseline = baseline): string[] =>
    ratchetBreaks('commands', counts, entries, exists);
  assert.deepEqual(breaks({ 'src/a.ts': 2 }), [], 'the measure the baseline holds is let through');
  assert.deepEqual(breaks({ 'src/a.ts': 2, 'src/b.ts': 1 }), [
    'src/b.ts holds 1 commands: the board shows what the api answers, so have the api answer it, never add it here',
  ]);
  assert.deepEqual(breaks({ 'src/a.ts': 3 }), [
    'src/a.ts holds 3 commands, more than the 2 the baseline allows: have the api answer it instead',
  ]);
  assert.deepEqual(breaks({ 'src/a.ts': 1 }), ["src/a.ts holds 1 commands, fewer than the baseline's 2: lower its count to 1"]);
  assert.deepEqual(breaks({}), ['src/a.ts holds no commands left: take its entry off the baseline']);
  assert.deepEqual(breaks({}, { 'src/gone.ts': { count: 1, card: 'slice 4' } }), [
    'src/gone.ts holds commands in the baseline but is not on disk: where it moved, rename its entry; else take it off',
  ]);
  assert.deepEqual(breaks({ 'src/a.ts': 2 }, { 'src/a.ts': { count: 2, card: ' ' } }), [
    "src/a.ts's entry for commands names no card: name the card that moves it to the api",
  ]);
  const planted = new Map([...sourceTexts(), ['src/x.ts', "const say = 'run wf retry, under ~/.agent-workflows';\n"]]);
  assert.deepEqual(ratchetBreaks('store paths', measured(planted, STORE_PATH), STORE_PATHS, onDisk), [
    'src/x.ts holds 1 store paths: the board shows what the api answers, so have the api answer it, never add it here',
  ]);
  assert.deepEqual(ratchetBreaks('commands', measured(planted, COMMAND), COMMAND_TEXT, onDisk), [
    'src/x.ts holds 1 commands: the board shows what the api answers, so have the api answer it, never add it here',
  ]);
});
