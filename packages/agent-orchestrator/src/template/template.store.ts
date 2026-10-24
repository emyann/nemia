/**
 * A factory template on disk, a folder or an archive of one: read through one reader (`readTemplate`), each YAML document parsed with
 * the line every value stands on, and checked (`checkTemplateAt`); written from a repository's workflows, agents and skills, and a
 * factory's hires, instruction and rules (`exportTemplate`), read through the loader's own readers, staged beside the folder, checked,
 * and only then put in place; packed into an archive (`packTemplate`) and unpacked from one (`unpackTemplate`), each staged and renamed
 * into place.
 */
import fs from 'node:fs';
import path from 'node:path';
import { LineCounter, parseAllDocuments, stringify, type Document } from 'yaml';
import { loadAgents } from '../agents/read.store.ts';
import { factoriesDir, readFactory } from '../factory/factory.store.ts';
import { outsideRefusal, type Factory } from '../factory/factory.ts';
import { workflowDescription, workflowsIn } from '../folder/folder.store.ts';
import { stepFiles } from '../folder/folder.ts';
import { placesOf } from '../folder/lookup.store.ts';
import { readKeys } from '../former/former.ts';
import { givenSkillOf, SKILL_NAME } from '../keys/index.ts';
import { Conflict, Invalid, Missing } from '../refusal/refusal.ts';
import { copySkillFiles, entriesOf, isShippedPlace, lookupRoots, PLACE_SKILLS, skillsFor } from '../skills/read.store.ts';
import { splitFrontmatter } from '../step/step.ts';
import { ARCHIVE_LIMIT, contentDigest, packArchive, pathRefusals, unpackArchive, type TreeFile } from '../archive/archive.ts';
import { checkTemplate, documentFile, draftOf, type Draft, type ReadFolder, type Source, type StepSource } from './index.ts';

/** A problem of a template on disk: its file, the line and column it stands on where it is in a document, and the words. */
export type Problem = { file: string; line?: number; col?: number; message: string };

/** A document as parsed, with what turns its offsets into lines. */
type Parsed = { doc: Document.Parsed | undefined; lines: LineCounter };

/**
 * The files under `dir`, by path from it with `/` between parts, sorted; each link refused by name, never followed, and each entry that
 * is neither a file nor a folder (a pipe, a socket, a device), never read.
 */
function walk(dir: string, problems: Problem[], under = ''): string[] {
  return fs
    .readdirSync(path.join(dir, under), { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry): string[] => {
      const file = under ? `${under}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) {
        problems.push({ file, message: `${file} is a link, and a template's files are its own: copy what it points at here.` });
        return [];
      }
      if (entry.isDirectory()) return walk(dir, problems, file);
      if (entry.isFile()) return [file];
      problems.push({ file, message: `${file} is neither a file nor a folder, and a template holds files: remove it.` });
      return [];
    });
}

/** The tree of the folder `dir`: each file's path, permission bits and bytes, as `walk` finds them. */
function readTree(dir: string, problems: Problem[]): TreeFile[] {
  return walk(dir, problems).map((file) => {
    const at = path.join(dir, file);
    return { path: file, mode: fs.statSync(at).mode & 0o777, bytes: fs.readFileSync(at) };
  });
}

/** The document `file` holds, parsed, or the problems of it: one that does not parse, at its line, or a second document, the first kept. */
function parseDocument(file: string, text: string, problems: Problem[]): Parsed | undefined {
  const lines = new LineCounter();
  const docs = parseAllDocuments(text, { lineCounter: lines, uniqueKeys: true, prettyErrors: true });
  if (!Array.isArray(docs)) return { doc: undefined, lines };
  const errors = docs.flatMap((doc) => doc.errors);
  for (const error of errors) {
    const [at] = error.linePos ?? [];
    problems.push({ file, line: at?.line, col: at?.col, message: `does not parse: ${error.message.split('\n')[0]}` });
  }
  if (errors.length) return undefined;
  if (docs.length > 1) {
    const at = lines.linePos(docs[1].range[0]);
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

/** A template as read: its name, its tree, the digest of its content (none where a path is longer than an archive holds), its problems. */
export type ReadTemplate = { name: string; files: TreeFile[]; digest: string | undefined; problems: Problem[] };

/**
 * The template at `source`, the one reader of a template: a folder, named `name` (by default its base name), its files read, each link
 * and each path longer than an archive holds a problem; or an archive file, named by its top folder, unpacked in memory. Refused: a
 * `source` that is neither (Missing), and an archive `unpackArchive` refuses (Invalid).
 */
export function readTemplate(source: string, name = path.basename(path.resolve(source))): ReadTemplate {
  const stat = fs.statSync(source, { throwIfNoEntry: false });
  if (stat?.isFile()) return { ...unpackArchive(fs.readFileSync(source), ARCHIVE_LIMIT, source), problems: [] };
  if (!stat?.isDirectory())
    throw new Missing({
      message: `${source} is neither a folder nor a file: name a template's folder, the one that holds its nemia.yaml, or an archive nemia template pack wrote.`,
    });
  const problems: Problem[] = [];
  const files = readTree(source, problems);
  const long = pathRefusals(name, files);
  problems.push(...long);
  return { name, files, digest: long.length ? undefined : contentDigest(name, files), problems };
}

/** The names of the place skills nemia ships, each present to a template that names it. */
const placeSkillNames = (): string[] => entriesOf(PLACE_SKILLS).filter((name) => fs.existsSync(path.join(PLACE_SKILLS, name, 'SKILL.md')));

/** A problem as a person reads it: `<file>:<line>:<col>: <words>`, or `<file>: <words>` where it has no line. */
export const problemLine = (p: Problem): string => `${p.file}${p.line === undefined ? '' : `:${p.line}:${p.col ?? 1}`}: ${p.message}`;

/** A template as read and checked: every problem, sorted, its documents read (`folder`), and the version its manifest gives. */
export type CheckedTemplate = ReadTemplate & { folder: ReadFolder; version: unknown };

/**
 * The template at `source`, read by `readTemplate` and checked: every problem at once, sorted by file then line — a link, a document
 * that does not parse, and each that `checkTemplate` refuses, at the line its value stands on. Refused as `readTemplate` refuses.
 */
export function checkedTemplate(source: string, name?: string): CheckedTemplate {
  const read = readTemplate(source, name);
  const { problems } = read;
  const { folder, parsed } = readTemplateFolder(read.name, read.files, problems);
  for (const refusal of checkTemplate(folder, placeSkillNames())) {
    const doc = parsed.get(refusal.file);
    problems.push({ file: refusal.file, ...(doc ? lineOf(doc, refusal.at) : {}), message: refusal.message });
  }
  problems.sort((a, b) => a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0) || (a.col ?? 0) - (b.col ?? 0));
  const manifest = folder.documents.get('nemia.yaml') as { spec?: { version?: unknown } } | null | undefined;
  return { ...read, folder, version: manifest?.spec?.version };
}

/** Every problem of the template at `source`, a folder (named `name`, by default its base name) or an archive: `checkedTemplate`'s. */
export const checkTemplateAt = (source: string, name?: string): Problem[] => checkedTemplate(source, name).problems;

/** A template opened for a render: `checkedTemplate`'s, one of its files by its path in it (`file`), and that file's text (`text`). */
export type OpenTemplate = CheckedTemplate & { file: (at: string) => TreeFile; text: (at: string) => string };

/**
 * The template at `source`, a folder or an archive, read and checked (`checkedTemplate`), each of its files then read off its tree, never
 * off the disk. Refused: a file asked for that is no file of the template (Invalid), so a `{path}` cannot reach out; else as
 * `readTemplate` refuses.
 */
export function openTemplate(source: string, name?: string): OpenTemplate {
  const checked = checkedTemplate(source, name);
  const byPath = new Map(checked.files.map((f) => [f.path, f]));
  const file = (at: string): TreeFile => {
    const found = byPath.get(at);
    if (found === undefined)
      throw new Invalid({ message: `${at} is no file of the template ${source}: name a file of the template, by its path in it.` });
    return found;
  };
  return { ...checked, file, text: (at) => Buffer.from(file(at).bytes).toString('utf8') };
}

/** The files of the workflow folder `dir` but its steps, by path from it; a link refused by name. */
function othersOf(dir: string, refusals: string[]): string[] {
  const problems: Problem[] = [];
  const steps = new Set(stepFiles(entriesOf(dir)));
  const others = walk(dir, problems).filter((file) => !steps.has(file));
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
      return isShippedPlace(dir) ? 'place' : { dir };
    },
  };
}

/** The factory `name`'s parts a draft holds, read from the store; one whose repositories do not hold `from` refused. */
function factorySource(ask: FactoryAsk, from: string, refusals: string[]): { source: NonNullable<Source['factory']>; workflows: string[] } {
  const { name } = ask;
  const factory = readFactory(name, 'Nothing was written.');
  if (outsideRefusal(factory, from)) {
    const repos = factory.repos.map((r) => path.resolve(r)).sort();
    throw new Invalid({
      message: `${from}: the factory ${name} works on ${repos.join(', ')}, and its workflows are read from one of them: --from ${repos[0]}. Nothing was written.`,
    });
  }
  const read = ask.instruction(factory);
  if (read.error) refusals.push(`the factory ${name}'s instruction: ${read.error}`);
  const rules = ask.rules(factory);
  if (rules.error) refusals.push(`the factory ${name}'s rules: ${rules.error}`);
  return {
    source: {
      name,
      file: path.join(factoriesDir(), `${name}.json`),
      hires: factory.hires,
      instruction: read.words === null ? undefined : { words: read.words, file: read.file },
      rules: rules.words === null ? undefined : { words: rules.words, file: rules.file },
      ...(factory.revisions === undefined ? {} : { revisions: factory.revisions }),
    },
    workflows: [...factory.workflows],
  };
}

/** A copy of the file or folder `from` at `to`, each file with its mode; a link refused by name. */
function copyTree(from: string, to: string): void {
  const stat = fs.lstatSync(from);
  if (stat.isSymbolicLink())
    throw new Invalid({ message: `${from} is a link, and a template's files are its own: copy what it points at there.` });
  if (stat.isDirectory()) {
    fs.mkdirSync(to, { recursive: true });
    for (const name of fs.readdirSync(from).sort()) copyTree(path.join(from, name), path.join(to, name));
    return;
  }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  fs.chmodSync(to, stat.mode & 0o7777);
}

/**
 * The draft's files, written under `dir`: a document as YAML on lines of any length, a text as it is, a copy with its modes, and a skill
 * as its real files (`copySkillFiles`).
 */
function writeDraft(dir: string, draft: Draft): void {
  for (const file of draft.files) {
    const at = path.join(dir, file.path);
    if ('copy' in file) {
      copyTree(file.copy, at);
      continue;
    }
    if ('skill' in file) {
      copySkillFiles(file.skill, at);
      continue;
    }
    fs.mkdirSync(path.dirname(at), { recursive: true });
    fs.writeFileSync(at, 'document' in file ? stringify(file.document, { lineWidth: 0 }) : file.text);
  }
}

/** Why `verb` does not write the folder `dir`: its name is no name, or it is there and is no folder, or holds something. */
function placeRefusal(dir: string, name: string, verb: 'export' | 'unpack'): void {
  if (!SKILL_NAME.test(name))
    throw new Invalid({
      message: `${dir}: a template is named by its folder, and ${name} is not a name: lowercase words joined by dashes. Name another folder.`,
    });
  const stat = fs.lstatSync(dir, { throwIfNoEntry: false });
  if (stat && !stat.isDirectory())
    throw new Conflict({ message: `${dir} is there, and is no folder: ${verb} writes a new folder. Move it away, or name another.` });
  if (entriesOf(dir).length)
    throw new Conflict({
      message: `${dir} holds files already, and ${verb} writes a new folder: name one that is not there, or is empty.`,
    });
}

/** A factory's instruction as read where it is kept: its words, or null where there are none, why it does not read, and its file. */
export type InstructionReader = (factory: Factory) => { words: string | null; error: string | null; file: string };

/** A factory an export holds the parts of: its name, and how its instruction and its rules are read, each as the other is. */
export type FactoryAsk = { name: string; instruction: InstructionReader; rules: InstructionReader };

/** What `nemia template export` asks: the folder to write, the repository to read, and the factory whose parts it holds. */
export type ExportAsk = { dir: string; from: string; factory?: FactoryAsk };

/**
 * The draft of a template written at `ask.dir` from the repository `ask.from`: each workflow of its `workflows/` (with `factory`, only
 * those it attaches), the agents and skills they name as the loader finds them, the factory's hires, instruction and rules; staged
 * beside the folder, checked, then put in place. Answers the folder and where each part came from. Refused, nothing written: a folder
 * that holds files (Conflict), one that is no name, a factory not filed or whose repositories are not `from`, a workflow it attaches
 * that `from` lacks, what `draftOf` refuses, and a draft that does not pass its own check (Invalid), each problem by name.
 */
export function exportTemplate(ask: ExportAsk): { dir: string; from: Draft['from'] } {
  const dir = path.resolve(ask.dir);
  const from = path.resolve(ask.from);
  const name = path.basename(dir);
  placeRefusal(dir, name, 'export');
  const root = path.join(from, 'workflows');
  if (!fs.statSync(root, { throwIfNoEntry: false })?.isDirectory())
    throw new Missing({ message: `${from} holds no workflows/, the folder export reads: name the repository that does, with --from.` });
  const refusals: string[] = [];
  const factory = ask.factory === undefined ? undefined : factorySource(ask.factory, from, refusals);
  const workflows = workflowSources(root, factory?.workflows ?? workflowsIn(root), ask.factory?.name, refusals);
  const draft = draftOf({ template: name, workflows, factory: factory?.source, ...lookups(root, from) });
  refusals.push(...draft.refusals);
  if (refusals.length) throw new Invalid({ message: `${dir} was not written:\n${refusals.map((r) => `  ${r}`).join('\n')}` });
  const staged = path.join(path.dirname(dir), `.${name}.export-${process.pid}`);
  fs.rmSync(staged, { recursive: true, force: true });
  try {
    writeDraft(staged, draft);
    const problems = checkTemplateAt(staged, name);
    if (problems.length)
      throw new Invalid({
        message: `${dir} was not written, since the draft does not pass:\n${problems.map((p) => `  ${problemLine(p)}`).join('\n')}`,
      });
    fs.rmSync(dir, { recursive: true, force: true });
    fs.renameSync(staged, dir);
  } finally {
    fs.rmSync(staged, { recursive: true, force: true });
  }
  return { dir, from: draft.from };
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

/** What `nemia template pack` asks: the template's folder, the archive to write (by default `<name>-<version>.tgz`), and where from. */
export type PackAsk = { dir: string; out?: string; cwd: string };

/**
 * The archive of the template folder `ask.dir`, written at `ask.out` (resolved from `ask.cwd`), staged beside it and renamed into place;
 * answers the archive and the digest of its content. Refused, nothing written: a `dir` that is no folder (Missing), one that does not pass
 * its check, every problem at its line, or that `packArchive` refuses, a version that names no file where no `out` is given (Invalid),
 * and an `out` that is there already (Conflict).
 */
export function packTemplate(ask: PackAsk): { out: string; digest: string } {
  if (!fs.statSync(ask.dir, { throwIfNoEntry: false })?.isDirectory())
    throw new Missing({ message: `${ask.dir} is no folder: name a template's folder, the one that holds its nemia.yaml.` });
  const read = checkedTemplate(ask.dir);
  if (read.problems.length)
    throw new Invalid({
      message: `${ask.dir} was not packed, since it does not pass:\n${read.problems.map((p) => `  ${problemLine(p)}`).join('\n')}`,
    });
  const out = path.resolve(ask.cwd, ask.out ?? defaultOut(ask.dir, read.name, read.version));
  if (fs.lstatSync(out, { throwIfNoEntry: false }))
    throw new Conflict({ message: `${out} is there already, and pack writes a new file: name another with --out, or remove it.` });
  const { archive, digest } = packArchive(read.name, read.files);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const staged = path.join(path.dirname(out), `.${path.basename(out)}.pack-${process.pid}`);
  try {
    fs.writeFileSync(staged, archive);
    fs.renameSync(staged, out);
  } finally {
    fs.rmSync(staged, { force: true });
  }
  return { out, digest };
}

/** What `nemia template unpack` asks: the archive to read, and the folder the template's own folder is written in. */
export type UnpackAsk = { archive: string; dir: string };

/**
 * The template inside the archive `ask.archive`, written at `<ask.dir>/<name>`, its name the archive's top folder, checked a name before
 * any path is joined; each file with its bytes and mode, staged beside it and renamed into place. Answers the folder and the digest of
 * its content. Refused, nothing written: an archive that is no file (Missing), one `unpackArchive` refuses (Invalid), and a
 * `<dir>/<name>` that is no folder or holds files (Conflict).
 */
export function unpackTemplate(ask: UnpackAsk): { dir: string; digest: string } {
  if (!fs.statSync(ask.archive, { throwIfNoEntry: false })?.isFile())
    throw new Missing({ message: `${ask.archive} is no file: name an archive nemia template pack wrote.` });
  const { name, files, digest } = unpackArchive(fs.readFileSync(ask.archive), ARCHIVE_LIMIT, ask.archive);
  const parent = path.resolve(ask.dir);
  const dir = path.join(parent, name);
  placeRefusal(dir, name, 'unpack');
  const staged = path.join(parent, `.${name}.unpack-${process.pid}`);
  fs.rmSync(staged, { recursive: true, force: true });
  try {
    fs.mkdirSync(staged, { recursive: true });
    for (const file of files) {
      const at = path.join(staged, file.path);
      fs.mkdirSync(path.dirname(at), { recursive: true });
      fs.writeFileSync(at, file.bytes, { flag: 'wx' });
      fs.chmodSync(at, file.mode);
    }
    fs.rmSync(dir, { recursive: true, force: true });
    fs.renameSync(staged, dir);
  } finally {
    fs.rmSync(staged, { recursive: true, force: true });
  }
  return { dir, digest };
}
