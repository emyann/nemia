/**
 * `nemia frontmatter rewrite [<folder>...] [--check]`: every markdown file under the folders given — or, given none, the store's own:
 * `$WF_ROOT/workflows/`, `inbox/`, and each factory's `tree/` and `applied/` — whose frontmatter is still in the former line form,
 * rewritten as YAML with every value byte for byte (`rewriteFormer`), and every step or agent file that still writes a fence key at the top
 * level with the key moved into its harness's block (`fenceMoved`), each through a file beside it renamed onto it. `.git` and
 * `node_modules` are not walked, nor a link.
 *
 * It says each file rewritten, each file refused with its refusal (which names the line), and each line of a file in YAML whose plain
 * value goes on past ` #` (`commentTails`): YAML reads that tail as a comment where the former reader read it as the value, and only the
 * author knows which was meant, so it is listed and never rewritten.
 *
 * `--check` writes nothing, and exits 1 where a rewrite is due, as a formatter's `--check` does; a file refused exits 2, the refusal's
 * code, with or without it. Either way the lines are the error's words, on stderr.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { Effect } from 'effect';
import { tried } from '../runtime-client.ts';
import type { Args, Spec } from '../command/command.ts';
import { rootGiven } from '../config/root.store.ts';
import type { Command } from '../command/entry.verb.ts';
import { isRefusal, Missing } from '../refusal/refusal.ts';
import { AGENTS_FOLDER, SKILLS_FOLDER, splitFrontmatter, WorkflowError } from '../step/step.ts';
import { fenceMoved, frontmatterKey } from '../former/former.ts';
import { DEFAULT_HARNESS } from '../harness/harness.ts';
import { commentTails, rewriteFormer } from './frontmatter.ts';

/** The folders a walk does not go into: a repository's history and a package's dependencies. */
const SKIPPED = new Set(['.git', 'node_modules']);

/**
 * What a walk found: the files rewritten (or due, under `--check`), those refused with why, each ` #` tail as `file:line`, and each fence
 * key left at the top level because the file's harness is not known (`fenceMoved`'s `kept`), as `file: key`.
 */
export type Rewritten = {
  readonly check: boolean;
  readonly rewritten: readonly string[];
  readonly refused: readonly { readonly file: string; readonly why: string }[];
  readonly tails: readonly string[];
  readonly kept?: readonly { readonly file: string; readonly key: string }[];
};

/**
 * The folders a rewrite covers given none, under the store `home`: its workflows and inbox, and each factory's tree and applied base, as
 * `applied/applied.store.ts` lays them out (`treeDir`, `appliedDir`). Only those there.
 */
export function storeFolders(home: string): string[] {
  const factories = path.join(home, 'factories');
  const named = fs.existsSync(factories)
    ? fs
        .readdirSync(factories, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort()
    : [];
  return [
    path.join(home, 'workflows'),
    path.join(home, 'inbox'),
    ...named.flatMap((name) => ['tree', 'applied'].map((sub) => path.join(factories, name, sub))),
  ].filter((dir) => fs.existsSync(dir) && fs.statSync(dir).isDirectory());
}

/** Every `*.md` file under `dir`, in order, `.git`, `node_modules` and links passed over. */
export function markdownIn(dir: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .flatMap((d) => {
      const at = path.join(dir, d.name);
      if (d.isDirectory()) return SKIPPED.has(d.name) ? [] : markdownIn(at);
      return d.isFile() && d.name.endsWith('.md') ? [at] : [];
    });
}

/** `text` written over `file` through a file beside it renamed onto it, the file's mode kept: no reader sees half of it. */
function replaceFile(file: string, text: string): void {
  const mode = fs.statSync(file).mode & 0o777;
  const beside = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${randomBytes(4).toString('hex')}`);
  try {
    fs.writeFileSync(beside, text);
    fs.chmodSync(beside, mode);
    fs.renameSync(beside, file);
  } finally {
    fs.rmSync(beside, { force: true });
  }
}

/** The lines of `text`'s frontmatter, already YAML, that YAML ends at ` #`, as `file:line`; none for a frontmatter that does not read. */
function tailsOf(file: string, text: string): string[] {
  try {
    const { block } = splitFrontmatter(file, text);
    return block === null ? [] : commentTails(block).map((line) => `${file}:${line}`);
  } catch (err) {
    if (isRefusal(err)) return [];
    throw err;
  }
}

/** The folders `args` names, resolved, each refused (`Missing`) where it is no folder; the store's own where it names none. */
function foldersOf(args: Args, home: string): string[] {
  const given = Array.isArray(args.folders) ? (args.folders as readonly string[]) : [];
  if (!given.length) return storeFolders(home);
  return given.map((folder) => {
    const dir = path.resolve(folder);
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory())
      throw new Missing({
        message: `nemia frontmatter rewrite: ${dir} is no folder. Name a folder of markdown files, or none for the store's own: nemia frontmatter rewrite [<folder>...]. Nothing was rewritten.`,
      });
    return dir;
  });
}

/**
 * Whether `file` may be a step or an agent, whose top-level fence keys move into its harness's block: no skill, no README, nothing under a
 * `skills/` folder, whose frontmatter is the harness's own.
 */
const fenced = (file: string): boolean =>
  !['SKILL.md', 'README.md'].includes(path.basename(file)) && !file.split(path.sep).includes(SKILLS_FOLDER);

/**
 * The harness `file` runs on, for the block its fence moves into: its own `harness:` line, else the agent its `agent:` line names, read
 * beside its folder (`agents/<name>.md`), whose harness is its own line's or the default; an agent's own file with no line runs on the
 * default. Undefined where nothing here says: a step with no `agent:` line, which a factory may hire onto any agent, or one whose agent
 * lives in another place.
 */
function harnessOfFile(file: string, text: string): string | undefined {
  const own = frontmatterKey(text, 'harness');
  if (own !== undefined) return own;
  if (path.basename(path.dirname(file)) === AGENTS_FOLDER) return DEFAULT_HARNESS;
  const agent = frontmatterKey(text, 'agent');
  const at = agent === undefined ? undefined : path.join(path.dirname(file), '..', AGENTS_FOLDER, `${agent}.md`);
  if (at === undefined || !fs.existsSync(at)) return undefined;
  return frontmatterKey(fs.readFileSync(at, 'utf8'), 'harness') ?? DEFAULT_HARNESS;
}

/** Each markdown file under `folders` rewritten where its frontmatter is former — or only found, under `check` — and read for tails. */
export function rewriteFolders(folders: readonly string[], check: boolean): Rewritten {
  const files = [...new Set(folders.flatMap(markdownIn))];
  const rewritten: string[] = [];
  const refused: { file: string; why: string }[] = [];
  const tails: string[] = [];
  const kept: { file: string; key: string }[] = [];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    try {
      const yaml = rewriteFormer(file, text);
      const moved = fenced(file)
        ? fenceMoved(file, yaml.text, harnessOfFile(file, yaml.text))
        : { text: yaml.text, changed: false, kept: [] };
      kept.push(...moved.kept.map((key) => ({ file, key })));
      const written = moved.text;
      const changed = yaml.changed || moved.changed;
      if (changed) {
        if (!check) replaceFile(file, written);
        rewritten.push(file);
      }
      tails.push(...tailsOf(file, changed ? written : text));
    } catch (err) {
      if (!(err instanceof WorkflowError)) throw err;
      refused.push({ file, why: err.message });
    }
  }
  return { check, rewritten, refused, tails, kept };
}

/**
 * What `nemia frontmatter rewrite` says of a walk: each file rewritten or due, each refused, each tail, each fence key kept, and none of
 * them where none.
 */
export function rewrittenLines({ check, rewritten, refused, tails, kept = [] }: Rewritten): string[] {
  const lines = [
    ...rewritten.map((file) => `${check ? 'due' : 'rewritten'}: ${file}`),
    ...refused.map(({ why }) => `refused: ${why}`),
    ...tails.map(
      (at) =>
        `comment: ${at} — YAML reads what follows " #" as a comment, where the former reader kept it in the value: quote the value to keep it, or leave it`,
    ),
    ...kept.map(
      ({ file, key }) =>
        `kept: ${file} — \`${key}:\` stays at the top level, where it is still read: the file names no \`harness:\` and no agent beside it, so which harness's block takes it is not known here. Add \`harness: <id>\` and rewrite again, or move it by hand into the block of the harness that runs it, \`<harness>: { fence: … }\``,
    ),
  ];
  if (check && rewritten.length) lines.push('a rewrite is due: nemia frontmatter rewrite, with the same folders, writes it');
  return lines.length ? lines : ['every frontmatter is YAML already: nothing to rewrite'];
}

/** The walk's end as the CLI's exit: a refused file as its refusal (2), a rewrite due under `--check` as 1, else what it found. */
const ended = (found: Rewritten): Effect.Effect<Rewritten, WorkflowError> => {
  if (found.refused.length) return Effect.fail(new WorkflowError(rewrittenLines(found).join('\n')));
  if (found.check && found.rewritten.length) return Effect.die(Object.assign(new Error(rewrittenLines(found).join('\n')), { exitCode: 1 }));
  return Effect.succeed(found);
};

const USAGE = '[<folder>...] [--check]';

const SPEC: Spec = {
  positionals: [{ key: 'folders', takes: 'many', kind: 'name' }],
  flags: [{ flag: '--check', kind: 'switch', key: 'check' }],
  unknown: (arg) => `nemia frontmatter rewrite does not take ${arg}. It takes folders and --check: nemia frontmatter rewrite ${USAGE}.`,
};

/** `nemia frontmatter rewrite`: the former line form of every frontmatter under the folders given, or the store's, rewritten as YAML. */
export const FRONTMATTER_REWRITE: Command<Rewritten> = {
  name: 'frontmatter rewrite',
  usage: USAGE,
  help: [
    "rewrite as YAML each markdown file's frontmatter still in the former",
    "line form, under the folders given or the store's own. --check: write",
    'nothing, and exit 1 where a rewrite is due',
  ],
  spec: SPEC,
  writes: true,
  class: 'ask',
  asksAlways: true,
  only: { side: 'cli', why: 'it rewrites files on the machine nemia runs on, folders a person names among them' },
  handler: (args, _env, home) =>
    tried(() => rewriteFolders(foldersOf(args, rootGiven(home, 'frontmatter rewrite')), args.check === true)).pipe(Effect.flatMap(ended)),
  print: (found) => rewrittenLines(found),
};
