/**
 * The factories on disk: `$WF_ROOT/factories/<name>.json`, one file per factory, holding `{ "repos": [...] }` — read (`readFactories`),
 * filed (`addFactory`) and removed (`removeFactory`). A person's verbs are their one writer; the judgement is `factory.ts`'s.
 *
 * Beneath the controllers, beside `record.store.ts`, the one store file it imports; `runner.ts` re-exports what the package exports of it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { Result, Schema } from 'effect';
import { defaultFactoryRefusal, DEFAULT_FACTORY, factoryNameRefusal, noFactoryLine, type Factory, type FactoryListing } from './factory.ts';
import { Conflict, Invalid, Missing } from '../refusal/refusal.ts';
import { firstRefusal, HOME, isDirectory } from '../record/record.store.ts';

/** Where the factories are: `$WF_ROOT/factories`, beside `runs/` and `inbox/`. The default factory has no file there. */
export const factoriesDir = (): string => path.join(HOME, 'factories');

/** A factory's file: at least one repository, each a string; a key a later `wf` writes beside them is kept, not refused. */
const FactoryFileSchema = Schema.StructWithRest(Schema.Struct({ repos: Schema.NonEmptyArray(Schema.String) }), [
  Schema.Record(Schema.String, Schema.Unknown),
]);

/** One entry of the folder as `wf factory ls` lists it: the factory its file says, or why the file does not read as one. */
function factoryAt(file: string): FactoryListing {
  const at = path.join(factoriesDir(), file);
  const name = file.slice(0, -'.json'.length);
  const badName = factoryNameRefusal(name);
  if (badName) return { name, file: at, error: `${badName} Remove the file by hand.` };
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(at, 'utf8'));
  } catch (err) {
    return { name, file: at, error: `is not JSON (${(err as Error).message}): wf factory rm ${name}, then add it again.` };
  }
  const decoded = Schema.decodeUnknownResult(FactoryFileSchema)(raw);
  if (Result.isSuccess(decoded)) return { name, file: at, repos: decoded.success.repos };
  const { path: where, words } = firstRefusal(raw, decoded.failure);
  const field = where.length ? `\`${where.map(String).join('.')}\`` : 'the whole';
  return { name, file: at, error: `does not read as a factory: ${field} ${words}. wf factory rm ${name}, then add it again.` };
}

/**
 * `wf factory ls`: every factory in the store, its `.json` files by name — a hidden file, such as one `addFactory` is writing, left out —
 * each read as a factory or listed with why, so one bad file hides no other. None when there is no folder yet.
 */
export function readFactories(): FactoryListing[] {
  let names: string[];
  try {
    names = fs.readdirSync(factoriesDir());
  } catch {
    return [];
  }
  return names
    .filter((n) => n.endsWith('.json') && !n.startsWith('.'))
    .sort()
    .map(factoryAt);
}

/**
 * The repositories a factory is given, each resolved from where `wf` is typed, as `wf start --repo` records one, and named once. Refused,
 * `Invalid`: none given, and any that is not a directory, every one named. A directory is enough: git is never asked.
 */
function factoryRepos(name: string, given: readonly string[]): string[] {
  if (!given.length)
    throw new Invalid({
      message: `A factory names one repository at least, and none was given: wf factory add ${name} --repo <path> [--repo <path> ...]. Nothing was filed.`,
    });
  const repos = [...new Set(given.map((r) => path.resolve(r)))];
  const missing = repos.filter((r) => !isDirectory(r));
  if (missing.length)
    throw new Invalid({
      message: `--repo names a directory, and ${missing.join(', ')} ${missing.length > 1 ? 'are not directories' : 'is not a directory'}. Give the path to each repository's directory. Nothing was filed.`,
    });
  return repos;
}

/** A name `wf factory add` and `wf factory rm` refuse: not a slug (`Invalid`), or the default factory (`Conflict`). */
function refuseName(name: string, verb: 'add' | 'rm'): void {
  const bad = factoryNameRefusal(name);
  if (bad) throw new Invalid({ message: bad });
  if (name === DEFAULT_FACTORY) throw new Conflict({ message: defaultFactoryRefusal(verb) });
}

/**
 * `wf factory add`: a factory filed as `<name>.json`, written whole to a hidden file first and linked onto its name, which fails when the
 * name is taken: no reader sees half a file, and two adds of one name file one. Refused before anything is written: the name
 * (`refuseName`) and the repositories (`factoryRepos`); and, the file already there, `Conflict`, the file left as it was.
 */
export function addFactory(opts: { name: string; repos: readonly string[] }): { factory: Factory; file: string } {
  refuseName(opts.name, 'add');
  const repos = factoryRepos(opts.name, opts.repos);
  fs.mkdirSync(factoriesDir(), { recursive: true });
  const file = path.join(factoriesDir(), `${opts.name}.json`);
  const hidden = path.join(factoriesDir(), `.${opts.name}.json.${process.pid}.${randomBytes(4).toString('hex')}`);
  try {
    fs.writeFileSync(hidden, `${JSON.stringify({ repos }, null, 2)}\n`);
    fs.linkSync(hidden, file);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    throw new Conflict({
      message: `There is a factory ${opts.name} already, at ${file}, and it was left as it was. See it with wf factory ls; to name other repositories, wf factory rm ${opts.name}, then add it again.`,
    });
  } finally {
    fs.rmSync(hidden, { force: true });
  }
  return { factory: { name: opts.name, repos }, file };
}

/**
 * `wf factory rm`: a factory's file removed, one that does not read included, since removing it is its fix. Refused: the name
 * (`refuseName`), and a name with no factory (`Missing`), naming those there are.
 */
export function removeFactory(name: string): { file: string } {
  refuseName(name, 'rm');
  const file = path.join(factoriesDir(), `${name}.json`);
  try {
    fs.rmSync(file);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT')
      throw new Missing({
        message: `${noFactoryLine(
          name,
          readFactories().map((f) => f.name),
        )} Nothing was removed.`,
      });
    throw Object.assign(
      new Error(
        `wf factory rm: ${file} could not be removed — ${(err as Error).message}. Nothing was removed: remove the file by hand, or fix what stops it and remove it again.`,
      ),
      { exitCode: 1 },
    );
  }
  return { file };
}
