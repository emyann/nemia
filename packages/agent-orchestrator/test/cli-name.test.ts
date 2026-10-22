/**
 * The orchestrator names its command `nemia` in every word it prints: its help, its refusals, the commands `nemia ls` and `nemia decide`
 * offer. `wf` is the alias (`bin/wf.ts`): it runs the same commands, with `WF_HINT` on stderr first.
 *
 * A `wf` said as a word in `src` or `bin` is refused (`wfLines`), but on a line `KEPT` holds: a value stored and read back as it was
 * written (a daemon file's `by: 'wf up'`), the check's marker `wf <name>:`, which steps and workflows print, and the alias's own words.
 * A `wf` in a path (`wf/` branches, `/srv/wf`), a prefix (`wf-`), a file name (`wf.ts`) or git's identity (`user.name=wf`) is no word.
 * Tests are not read: they spawn either bin and quote old records.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { CLI } from '../src/runner.ts';

const PKG = path.join(import.meta.dirname, '..');

/** A `wf` said as a word: no part of a longer name, a path, a prefix, a file name or an assignment. */
const WF_WORD = /(?<![\w/=.-])wf(?![\w/@.-])/;

/** A line of `src` or `bin` that says `wf` and keeps it: its file, and a text the line holds. */
type Kept = { file: string; text: string };

/** Each line of the orchestrator that keeps `wf`, by its file and a text that line holds. */
const KEPT: readonly Kept[] = [
  { file: 'src/check/check.ts', text: '`wf <name>:`' },
  { file: 'src/check/check.ts', text: '/^wf [a-z][a-z-]*: /' },
  { file: 'src/check/check.ts', text: '`wf pictures: …`' },
  { file: 'src/check/check.ts', text: '`pkg:test: wf …`' },
  { file: 'src/brief/brief.ts', text: '`wf <name>:`' },
  { file: 'src/daemon/daemon.store.ts', text: "Schema.Literals(['api', 'wf up'])" },
  { file: 'src/daemon/daemon.ts', text: "(`by: 'wf up'`)" },
  { file: 'src/daemon/daemon.ts', text: "HolderKind = 'api' | 'wf up';" },
  { file: 'src/daemon/daemon.ts', text: "file.by ?? 'wf up';" },
  { file: 'src/daemon/daemon.ts', text: 'for the `wf up` a file names' },
  { file: 'src/daemon/daemon.ts', text: "kind === 'wf up' ? 'nemia up' : kind" },
  { file: 'src/daemon/daemon.ts', text: "self: HolderKind = 'wf up'" },
  { file: 'src/cli/main.ts', text: "holder: 'wf up'" },
  { file: 'src/cli/main.ts', text: 'for the `wf` alias' },
  { file: 'src/admission/admission.ts', text: "const PROGRAMS = ['nemia', 'wf'];" },
  { file: 'src/admission/admission.ts', text: '(`nemia`, by any path, or `wf`)' },
  { file: 'src/cli/flags.ts', text: "export const WF_HINT = 'wf is now nemia: " },
  { file: 'src/cli/flags.ts', text: 'What `wf`, the alias of `nemia`, prints' },
];

/** Each `.ts` file of `src` and `bin` but a test, by its path from the package, with its text. */
function sources(): Map<string, string> {
  const files = new Map<string, string>();
  for (const dir of ['src', 'bin']) {
    for (const f of fs.readdirSync(path.join(PKG, dir), { recursive: true, encoding: 'utf8' })) {
      const file = `${dir}/${f.split(path.sep).join('/')}`;
      if (file.endsWith('.ts') && !file.endsWith('.test.ts')) files.set(file, fs.readFileSync(path.join(PKG, file), 'utf8'));
    }
  }
  return files;
}

/**
 * Each line of `files` that says `wf` as a word and that no entry of `kept` holds, as `file:line: text`.
 * @param files Each file's text, by its path from the package.
 * @param kept The lines that keep `wf`.
 */
function wfLines(files: ReadonlyMap<string, string>, kept: readonly Kept[]): string[] {
  return [...files].flatMap(([file, text]) =>
    text
      .split('\n')
      .flatMap((line, i) =>
        WF_WORD.test(line) && !kept.some((k) => k.file === file && line.includes(k.text)) ? [`${file}:${i + 1}: ${line.trim()}`] : [],
      ),
  );
}

/** Each entry of `kept` that holds no line of `files`: a keep left after its line went. */
function staleKept(files: ReadonlyMap<string, string>, kept: readonly Kept[]): Kept[] {
  return kept.filter((k) => !(files.get(k.file) ?? '').split('\n').some((line) => line.includes(k.text) && WF_WORD.test(line)));
}

test('every word the orchestrator prints names the command nemia, and `wf` is said only where a line keeps it', () => {
  const files = sources();
  assert.deepEqual(wfLines(files, KEPT), [], 'say `nemia`; a `wf` that is stored or read back as written goes into KEPT');
  assert.deepEqual(staleKept(files, KEPT), [], 'a KEPT entry whose line no longer says `wf` goes');
});

test('REFUSED: a refusal or a JSDoc naming `wf` as the command is found; a branch, a prefix, a file name and a kept line are not', () => {
  const files = new Map([
    [
      'src/x.ts',
      [
        'throw new Invalid(`no such run: ${id}. wf retry takes a run by its id`);',
        '/** Holds a run, as `wf hold` does. */',
        "const why = 'refused (wf';",
        'const branch = `wf/${run}/${step}`;',
        "const dir = scratch('wf-x-');",
        "const bin = 'bin/wf.ts';",
        "git('-c', 'user.name=wf', 'commit');",
        "const by = 'wf up';",
      ].join('\n'),
    ],
  ]);
  assert.deepEqual(wfLines(files, [{ file: 'src/x.ts', text: "const by = 'wf up';" }]), [
    'src/x.ts:1: throw new Invalid(`no such run: ${id}. wf retry takes a run by its id`);',
    'src/x.ts:2: /** Holds a run, as `wf hold` does. */',
    "src/x.ts:3: const why = 'refused (wf';",
  ]);
  assert.deepEqual(
    wfLines(files, [{ file: 'src/y.ts', text: "const by = 'wf up';" }]).at(-1),
    "src/x.ts:8: const by = 'wf up';",
    'a keep holds its own file only',
  );
  assert.deepEqual(
    staleKept(files, [
      { file: 'src/x.ts', text: "const by = 'wf up';" },
      { file: 'src/x.ts', text: 'gone' },
    ]),
    [{ file: 'src/x.ts', text: 'gone' }],
  );
});

test('the bin is nemia, and wf its alias, each a file of its own', () => {
  assert.equal(CLI, 'nemia');
  const pkg = JSON.parse(fs.readFileSync(path.join(PKG, 'package.json'), 'utf8')) as { bin: Record<string, string> };
  assert.deepEqual(pkg.bin, { nemia: 'bin/nemia.ts', wf: 'bin/wf.ts' });
  for (const bin of Object.values(pkg.bin)) assert.ok(fs.existsSync(path.join(PKG, bin)), bin);
});
