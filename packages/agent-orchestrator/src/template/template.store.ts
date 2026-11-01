/**
 * A factory template's tree, checked: each YAML document parsed with the line every value stands on, and every problem at once
 * (`checkedTree`), pure over a tree the Template door read (`src/templates/templates.store.ts`); a tree opened for a render
 * (`openedTree`); and the tree a repository's workflows, agents and skills and a factory's hires, instruction and rules make
 * (`exportTree`), read through the loader's own readers and checked before the door writes it. What a template is read from and
 * written to is the door's: nothing here writes the disk.
 */
import fs from 'node:fs';
import path from 'node:path';
import { LineCounter, parseAllDocuments, stringify, type Document } from 'yaml';
import { loadAgents } from '../agents/read.store.ts';
import { outsideRefusal, type Factory } from '../factory/factory.ts';
import { workflowDescription, workflowsIn } from '../folder/folder.store.ts';
import { stepFiles } from '../folder/folder.ts';
import { placesOf } from '../folder/lookup.store.ts';
import { readKeys } from '../former/former.ts';
import { givenSkillOf } from '../keys/index.ts';
import { Invalid, Missing } from '../refusal/refusal.ts';
import { entriesOf, isBuiltinPlace, lookupRoots, PLACE_SKILLS, skillFiles, skillsFor } from '../skills/read.store.ts';
import { splitFrontmatter, WorkflowError } from '../step/step.ts';
import { firstPiece } from '../piece/piece.ts';
import { contentDigest, pathRefusals, type TreeFile } from '../archive/archive.ts';
import { walkFolder, type TemplateTree } from '../templates/templates.store.ts';
import { templateNameRefusal, type Problem } from '../templates/templates.ts';
import { checkTemplate, documentFile, draftOf, type Draft, type ReadFolder, type Source, type StepSource } from './index.ts';

export type { Problem } from '../templates/templates.ts';

/** A document as parsed, with what turns its offsets into lines. */
type Parsed = { doc: Document.Parsed | undefined; lines: LineCounter };

/** The document `file` holds, parsed, or the problems of it: one that does not parse, at its line, or a second document, the first kept. */
function parseDocument(file: string, text: string, problems: Problem[]): Parsed | undefined {
  const lines = new LineCounter();
  const docs = parseAllDocuments(text, { lineCounter: lines, uniqueKeys: true, prettyErrors: true });
  if (!Array.isArray(docs)) return { doc: undefined, lines };
  const errors = docs.flatMap((doc) => doc.errors);
  for (const error of errors) {
    const [at] = error.linePos ?? [];
    problems.push({ file, line: at?.line, col: at?.col, message: `does not parse: ${firstPiece(error.message, '\n')}` });
  }
  if (errors.length) return undefined;
  const second = docs[1];
  if (second !== undefined) {
    const at = lines.linePos(second.range[0]);
    problems.push({ file, ...at, message: 'holds a second document, and a file of a template holds one: split it, or remove the second.' });
  }
  return { doc: docs[0], lines };
}

/** Where in `parsed` the value at `at` stands: its own line, or the nearest that holds it, where it is missing. */
function lineOf(parsed: Parsed, at: ReadonlyArray<string | number>): { line?: number; col?: number } {
  const { doc } = parsed;
  if (!doc) return {};
  for (let i = at.length; i >= 0; i--) {
    const node: unknown = i === 0 ? doc.contents : doc.getIn(at.slice(0, i), true);
    const range = (node as { range?: [number, number, number] } | null)?.range;
    if (range) return parsed.lines.linePos(range[0]);
  }
  return {};
}

/** The template `name` of the tree `files`, read: its files, each document parsed, and what stops one being read, at its line. */
function readTemplateFolder(
  name: string,
  files: readonly TreeFile[],
  problems: Problem[],
): { folder: ReadFolder; parsed: Map<string, Parsed> } {
  const parsed = new Map<string, Parsed>();
  for (const file of files) {
    if (!documentFile(file.path, name)) continue;
    const doc = parseDocument(file.path, Buffer.from(file.bytes).toString('utf8'), problems);
    if (doc) parsed.set(file.path, doc);
  }
  const documents = new Map([...parsed].map(([file, { doc }]) => [file, doc === undefined ? null : (doc.toJS() as unknown)]));
  return { folder: { name, files: files.map((f) => f.path), documents }, parsed };
}

/** The names of nemia's builtin place skills, each present to a template that names it. */
export const placeSkillNames = (): string[] =>
  entriesOf(PLACE_SKILLS).filter((name) => fs.existsSync(path.join(PLACE_SKILLS, name, 'SKILL.md')));

/** A problem as a person reads it: `<file>:<line>:<col>: <words>`, or `<file>: <words>` where it has no line. */
export const problemLine = (p: Problem): string => `${p.file}${p.line === undefined ? '' : `:${p.line}:${p.col ?? 1}`}: ${p.message}`;

/** A template as read and checked: every problem, sorted, its documents read (`folder`), and the version its manifest gives. */
export type CheckedTemplate = TemplateTree & { folder: ReadFolder; version: unknown };

/**
 * The tree `tree` checked: every problem at once, sorted by file then line — what its read found (a link, a path longer than an archive
 * holds), a document that does not parse, and each that `checkTemplate` refuses, at the line its value stands on. `placeSkills` names
 * the builtin place skills a template may name (`placeSkillNames`). Pure.
 */
export function checkedTree(tree: TemplateTree, placeSkills: readonly string[]): CheckedTemplate {
  const problems = [...tree.problems];
  const { folder, parsed } = readTemplateFolder(tree.name, tree.files, problems);
  for (const refusal of checkTemplate(folder, [...placeSkills])) {
    const doc = parsed.get(refusal.file);
    problems.push({ file: refusal.file, ...(doc ? lineOf(doc, refusal.at) : {}), message: refusal.message });
  }
  problems.sort((a, b) => a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0) || (a.col ?? 0) - (b.col ?? 0));
  const manifest = folder.documents.get('nemia.yaml') as { spec?: { version?: unknown } } | null | undefined;
  return { ...tree, problems, folder, version: manifest?.spec?.version };
}

/** A template opened for a render: `checkedTree`'s, one of its files by its path in it (`file`), and that file's text (`text`). */
export type OpenTemplate = CheckedTemplate & { file: (at: string) => TreeFile; text: (at: string) => string };

/**
 * The tree read from `source`, checked (`checkedTree`), each of its files then read off the tree. Refused: a file asked for that is no
 * file of the template (Invalid), so a `{path}` cannot reach out. Pure.
 */
export function openedTree(source: string, tree: TemplateTree, placeSkills: readonly string[]): OpenTemplate {
  const checked = checkedTree(tree, placeSkills);
  const byPath = new Map(checked.files.map((f) => [f.path, f]));
  const file = (at: string): TreeFile => {
    const found = byPath.get(at);
    if (found === undefined)
      throw new Invalid({ message: `${at} is no file of the template ${source}: name a file of the template, by its path in it.` });
    return found;
  };
  return { ...checked, file, text: (at) => Buffer.from(file(at).bytes).toString('utf8') };
}

/** The tree `name` of `files` as a read of a folder answers it: each path longer than an archive holds a problem, else its digest. */
export function folderTreeOf(name: string, files: TreeFile[]): TemplateTree {
  const problems = pathRefusals(name, files);
  return { name, files, problems, digest: problems.length ? undefined : contentDigest(name, files) };
}

/** The files of the workflow folder `dir` but its steps, by path from it; a link refused by name. */
function othersOf(dir: string, refusals: string[]): string[] {
  const problems: Problem[] = [];
  const steps = new Set(stepFiles(entriesOf(dir)));
  const others = walkFolder(dir, problems).filter((file) => !steps.has(file));
  refusals.push(...problems.map((p) => `${path.join(dir, p.file)}: ${p.message}`));
  return others;
}

/** The step `file` of a workflow as its file writes it, its own keys by the names the parser reads; or why it does not read. */
function stepSource(dir: string, file: string, refusals: string[]): StepSource[] {
  const at = path.join(dir, file);
  try {
    if (fs.lstatSync(at).isSymbolicLink()) throw new Error(`${at} is a link, and a step's file is its own: copy what it points at here.`);
    const { block, body } = splitFrontmatter(at, fs.readFileSync(at, 'utf8'));
    const keys = block === null ? {} : readKeys<string>(at, block, () => undefined).meta;
    return [{ name: path.basename(file, '.md'), keys: keys as Record<string, string>, body: body.trim(), file: at }];
  } catch (err) {
    refusals.push((err as Error).message);
    return [];
  }
}

/** The workflows `names` of the repository's folder of workflows `root`, each read; a name it holds no workflow of refused, by name. */
function workflowSources(root: string, names: readonly string[], factory: string | undefined, refusals: string[]): Source['workflows'] {
  const held = new Set(workflowsIn(root));
  return names.flatMap((name) => {
    if (!held.has(name)) {
      refusals.push(
        `the factory ${factory} attaches ${name}, and ${root} holds no workflow ${name}: write it there, or detach it — nemia factory detach ${factory} ${name}.`,
      );
      return [];
    }
    const dir = path.join(root, name);
    const steps = stepFiles(entriesOf(dir)).flatMap((file) => stepSource(dir, file, refusals));
    return [{ name, dir, description: workflowDescription(dir), steps, others: othersOf(dir, refusals) }];
  });
}

/** The loader's answer for an agent and a skill, over the roots a workflow of `root` looks in, the first root that has a name winning. */
function lookups(root: string, from: string): Pick<Source, 'agent' | 'skill'> {
  const workflowDir = path.join(root, '_');
  const places = placesOf(from);
  const roots = lookupRoots(workflowDir, places).map((r) => path.join(r, 'agents'));
  const agents = roots.map((dir) => ({ dir, found: loadAgents(dir) }));
  const skills = skillsFor(workflowDir, places).at;
  return {
    agent: (name) => {
      const at = agents.find(({ found }) => found.has(name));
      const agent = at?.found.get(name);
      if (!at || agent === undefined) return undefined;
      if (agent instanceof Error) return { refused: agent.message };
      const output = agent.keys.output;
      return {
        name,
        file: path.join(at.dir, `${name}.md`),
        agent,
        output: output ? fs.readFileSync(path.join(at.dir, output), 'utf8') : undefined,
      };
    },
    skill: (name) => {
      const dir = skills.get(name);
      if (dir === undefined) return undefined;
      if (dir instanceof Error) return { refused: dir.message };
      if (givenSkillOf(name)?.folder !== undefined) return { named: dir };
      return isBuiltinPlace(dir) ? 'place' : { dir };
    },
  };
}

/** The factory's parts a draft holds, as its door read them; one whose repositories do not hold `from` refused. */
function factorySource(
  parts: FactoryParts,
  from: string,
  refusals: string[],
): { source: NonNullable<Source['factory']>; workflows: string[] } {
  const { factory, instruction, rules } = parts;
  const { name } = factory;
  if (outsideRefusal(factory, from)) {
    const repos = factory.repos.map((r) => path.resolve(r)).sort();
    throw new Invalid({
      message: `${from}: the factory ${name} works on ${repos.join(', ')}, and its workflows are read from one of them: --from ${repos[0]}. Nothing was written.`,
    });
  }
  if (instruction.error) refusals.push(`the factory ${name}'s instruction: ${instruction.error}`);
  if (rules.error) refusals.push(`the factory ${name}'s rules: ${rules.error}`);
  return {
    source: {
      name,
      file: parts.file,
      hires: factory.hires,
      instruction: instruction.words === null ? undefined : { words: instruction.words, file: instruction.file },
      rules: rules.words === null ? undefined : { words: rules.words, file: rules.file },
      ...(factory.revisions === undefined ? {} : { revisions: factory.revisions }),
    },
    workflows: [...factory.workflows],
  };
}

/** The files of the file or folder `from`, under `at` in a tree, each with its mode; a link refused by name. */
function copiedFiles(from: string, at: string): TreeFile[] {
  const stat = fs.lstatSync(from);
  if (stat.isSymbolicLink())
    throw new Invalid({ message: `${from} is a link, and a template's files are its own: copy what it points at there.` });
  if (stat.isDirectory())
    return fs
      .readdirSync(from)
      .sort()
      .flatMap((name) => copiedFiles(path.join(from, name), `${at}/${name}`));
  return [{ path: at, mode: stat.mode & 0o777, bytes: fs.readFileSync(from) }];
}

/** The files of the skill folder `dir` under `at` (`skillFiles`), each a regular file with its mode; refused with its link refusal. */
function skillTree(dir: string, at: string): TreeFile[] {
  return skillFiles(dir).map((file) => {
    if ('refused' in file) throw new WorkflowError(file.refused);
    return { path: `${at}/${file.path}`, mode: fs.statSync(file.real).mode & 0o777, bytes: fs.readFileSync(file.real) };
  });
}

/** The mode a document or a text of a draft is written with: a plain file's. */
const PLAIN = 0o644;

/**
 * The draft's files as a tree: a document as YAML on lines of any length, a text as it is, a copy with its modes, and a skill as its
 * real files (`skillFiles`); a path given twice holds what was given last. Reads the copies and skills the draft names.
 */
export function treeOfDraft(draft: Draft): TreeFile[] {
  const files = new Map<string, TreeFile>();
  for (const file of draft.files) {
    const made =
      'copy' in file
        ? copiedFiles(file.copy, file.path)
        : 'skill' in file
          ? skillTree(file.skill, file.path)
          : [
              {
                path: file.path,
                mode: PLAIN,
                bytes: Buffer.from('document' in file ? stringify(file.document, { lineWidth: 0 }) : file.text),
              },
            ];
    for (const one of made) files.set(one.path, one);
  }
  return [...files.values()];
}

/** A factory's words as read where they are kept: its words, or null where there are none, why they do not read, and its file. */
export type WordsRead = { words: string | null; error: string | null; file: string };

/** A factory an export holds the parts of, as its door read them: the factory, its file, its instruction and its rules. */
export type FactoryParts = { factory: Factory; file: string; instruction: WordsRead; rules: WordsRead };

/** What `nemia template export` asks: the folder to write, the repository to read, and the factory whose parts it holds. */
export type ExportAsk = { dir: string; from: string; factory?: FactoryParts };

/**
 * The tree of a template to be written at `ask.dir` from the repository `ask.from`: each workflow of its `workflows/` (with `factory`,
 * only those it attaches), the agents and skills they name as the loader finds them, the factory's hires, instruction and rules; and
 * checked. Answers the folder, its name, its tree, and where each part came from; the Template door writes it. Refused, nothing written:
 * a folder that is no name, a factory whose repositories are not `from`, a workflow it attaches that `from` lacks, what `draftOf`
 * refuses, and a draft that does not pass its own check (Invalid), each problem by name; a `from` with no workflows/ (Missing).
 */
export function exportTree(
  ask: ExportAsk,
  placeSkills: readonly string[],
): { dir: string; name: string; files: TreeFile[]; from: Draft['from'] } {
  const dir = path.resolve(ask.dir);
  const from = path.resolve(ask.from);
  const name = path.basename(dir);
  const misnamed = templateNameRefusal(name);
  if (misnamed !== null) throw new Invalid({ message: `${dir}: ${misnamed}` });
  const root = path.join(from, 'workflows');
  if (!fs.statSync(root, { throwIfNoEntry: false })?.isDirectory())
    throw new Missing({ message: `${from} holds no workflows/, the folder export reads: name the repository that does, with --from.` });
  const refusals: string[] = [];
  const factory = ask.factory === undefined ? undefined : factorySource(ask.factory, from, refusals);
  const workflows = workflowSources(root, factory?.workflows ?? workflowsIn(root), ask.factory?.factory.name, refusals);
  const draft = draftOf({ template: name, workflows, factory: factory?.source, ...lookups(root, from) });
  refusals.push(...draft.refusals);
  if (refusals.length) throw new Invalid({ message: `${dir} was not written:\n${refusals.map((r) => `  ${r}`).join('\n')}` });
  const files = treeOfDraft(draft);
  const { problems } = checkedTree(folderTreeOf(name, files), placeSkills);
  if (problems.length)
    throw new Invalid({
      message: `${dir} was not written, since the draft does not pass:\n${problems.map((p) => `  ${problemLine(p)}`).join('\n')}`,
    });
  return { dir, name, files, from: draft.from };
}

/** The words a version may hold to name a default archive: one file-name part, never a slash, a backslash or a part that climbs. */
const VERSION_PART = /^[0-9A-Za-z][0-9A-Za-z.+-]*$/;

/** The archive pack writes where `--out` names none, `<name>-<version>.tgz` in `cwd`; a version that is no file-name part refused. */
function defaultOut(dir: string, name: string, version: unknown): string {
  const text = String(version);
  if (!VERSION_PART.test(text))
    throw new Invalid({
      message: `${dir}: the version ${JSON.stringify(text)} in nemia.yaml names no file, and pack names its archive <name>-<version>.tgz: write a version of letters, digits, dots, + and -, or name the archive with --out.`,
    });
  return `${name}-${text}.tgz`;
}

/** The folder `dir`, as a template's place, or refused where it is no folder (Missing): what pack packs. */
export function folderAsked(dir: string): string {
  if (!fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory())
    throw new Missing({ message: `${dir} is no folder: name a template's folder, the one that holds its nemia.yaml.` });
  return path.resolve(dir);
}

/** The archive `archive`, as a template's place, or refused where it is no file (Missing): what unpack reads. */
export function archiveAsked(archive: string): string {
  if (!fs.statSync(archive, { throwIfNoEntry: false })?.isFile())
    throw new Missing({ message: `${archive} is no file: name an archive nemia template pack wrote.` });
  return path.resolve(archive);
}

/** What `nemia template pack` asks: the template's folder, the archive to write (by default `<name>-<version>.tgz`), and where from. */
export type PackAsk = { dir: string; out?: string; cwd: string };

/**
 * Where pack writes the archive of the checked folder `read`: `ask.out` resolved from `ask.cwd`, by default `<name>-<version>.tgz` there.
 * Refused: a folder that does not pass its check, every problem at its line, and a version that names no file where no `out` is given
 * (Invalid).
 */
export function packOut(ask: PackAsk, read: CheckedTemplate): string {
  if (read.problems.length)
    throw new Invalid({
      message: `${ask.dir} was not packed, since it does not pass:\n${read.problems.map((p) => `  ${problemLine(p)}`).join('\n')}`,
    });
  return path.resolve(ask.cwd, ask.out ?? defaultOut(ask.dir, read.name, read.version));
}
