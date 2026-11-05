/**
 * The builtin templates as objects (`Template`, `TemplateList`, from `objects`), cluster-scoped, by name: each folder of the builtin
 * templates (`builtinTemplatesIn`, at `BuiltinTemplates`) read through the Template door and checked (`checkedTree`). Its `spec` is its
 * manifest's spec as written, each key kept only where it decodes as the object's (`TemplateSpec`), its `description` the manifest's
 * `metadata.description`; its `status` where it is read from, its content's digest, the names of its workflows, agents and skills, and
 * every problem, a key left out of the spec among them. A template that does not read is listed all the same, its problems saying why.
 *
 * And a template's render (`templateTree`): rendered with its parameters' defaults (`renderedAt`, which writes nothing), then written
 * once per content digest under the folder of renders (`TemplateRenders`, `<tmpdir>/nemia-templates-<uid>`), laid out as a factory's
 * tree is, so the api reads its workflows, agents and skills as it reads a factory's. A write outside the store on a read: staged beside
 * its place and renamed into it (`stageFolder`). The folder of renders is this user's own (`RenderOwner`), made `0700`; a folder in it
 * that this user does not own is refused `Conflict`, never served, and a render already there is reused untouched only where its content
 * digests as the render does, and staged again where it does not.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Context, Effect, Result, Schema } from 'effect';
import { API_VERSION, type Template, TemplateSpec, type TemplateStatus } from 'objects';
import { digestOf, entriesIn, stageFolder, treeWiringOf, type Entry } from '../applied/applied.store.ts';
import { renderedAt } from '../applied/applied.verb.ts';
import { bornAt, objectsListed, versionOf, type ObjectQuery } from '../factory-object/factory.verb.ts';
import { Conflict, Invalid, Missing } from '../refusal/refusal.ts';
import { checkedTree, packageSkillNames, problemLine } from '../template/template.store.ts';
import { isMap } from '../template/index.ts';
import { TemplateSource } from '../templates/templates.model.ts';
import { BuiltinTemplates, builtinTemplatesIn, TemplateDoor } from '../templates/templates.store.ts';

/** A builtin template rendered on disk: its name, where it is read from, its digest, its render's folder, and the wiring it holds. */
export type TemplateTreeRendered = {
  name: string;
  source: string;
  digest: string;
  dir: string;
  workflows: string[];
  hires: Record<string, string>;
};

/** The user the folder of renders belongs to, by uid: this process's; none where the platform has no uid, and nothing is checked. */
export const RenderOwner = Context.Reference<number | undefined>('agent-orchestrator/RenderOwner', {
  defaultValue: () => process.getuid?.(),
});

/**
 * The folder templates are rendered under, one folder per content digest: `<tmpdir>/nemia-templates-<uid>`, this user's own, unless given
 * another. The temporary folder is the machine's, so the name says whose it is: one shared by every user would be another's to make first.
 */
export const TemplateRenders = Context.Reference<string>('agent-orchestrator/TemplateRenders', {
  defaultValue: () => path.join(os.tmpdir(), `nemia-templates-${process.getuid?.() ?? os.userInfo().username}`),
});

/** Why `dir` is not this user's own (`uid`) — a link, no folder, or owned by another — or undefined where it is, or is not there. */
function notOwned(dir: string, uid: number | undefined): string | undefined {
  const stat = fs.lstatSync(dir, { throwIfNoEntry: false });
  if (stat === undefined) return undefined;
  if (!stat.isDirectory()) return `${dir} is no folder`;
  if (uid !== undefined && stat.uid !== uid) return `${dir} is owned by uid ${stat.uid}, not by this user (uid ${uid})`;
  return undefined;
}

/**
 * `Conflict` saying why the folder of renders `root` is not this user's, and what works: this user cannot remove another's folder from
 * the machine's temporary folder, which is sticky, so its owner or root removes it, or the api is started where `os.tmpdir()` is this
 * user's own (`TMPDIR`).
 */
const rootRefusal = (why: string, root: string): Conflict =>
  new Conflict({
    message: `${why}, so no template is rendered or served from it: have its owner, or root, remove it (rm -rf ${root}) and ask again, or restart the api with TMPDIR set to a folder of this user's own, under which it renders.`,
  });

/** `Conflict` saying why `dir`, inside this user's own folder of renders, is not this user's, and that removing it lets it be staged. */
const insideRefusal = (why: string, dir: string): Conflict =>
  new Conflict({
    message: `${why}, so it is not served: remove it (rm -rf ${dir}), and the next ask stages the render again.`,
  });

/**
 * The template render of `entries` at `dir`, under the folder of renders `root`: `root` made this user's own, `0700`; `dir` staged where
 * it is not there, reused where it is this user's and its content digests as `entries` do, and staged again where it is this user's and
 * does not. `Conflict` where `root` or a folder on the way to `dir` is not this user's: nothing of it is served.
 */
const renderStaged = Effect.fn('renderStaged')(function* (root: string, dir: string, entries: readonly Entry[]) {
  const uid = yield* RenderOwner;
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const rootWhy = notOwned(root, uid);
  if (rootWhy !== undefined) return yield* Effect.fail(rootRefusal(rootWhy, root));
  if ((fs.statSync(root).mode & 0o077) !== 0) fs.chmodSync(root, 0o700);
  for (const on of [path.dirname(dir), dir]) {
    const why = notOwned(on, uid);
    if (why !== undefined) return yield* Effect.fail(insideRefusal(why, on));
  }
  if (fs.existsSync(dir) && digestOf(entriesIn(dir)) !== digestOf(entries)) fs.rmSync(dir, { recursive: true, force: true });
  stageFolder(dir, entries, false);
});

/** The names of a template's documents among its `files`: each workflow, agent and skill whose document is there, each sorted. */
export function templateDocumentsOf(files: readonly string[]): { workflows: string[]; agents: string[]; skills: string[] } {
  const named = (holder: string, leaf: string): string[] =>
    files
      .map((file) => file.split('/'))
      .filter((parts) => parts.length === 3 && parts[0] === holder && parts[2] === leaf)
      .map((parts) => parts[1] ?? '')
      .sort();
  return { workflows: named('workflows', 'workflow.yaml'), agents: named('agents', 'agent.yaml'), skills: named('skills', 'SKILL.md') };
}

/** The keys a manifest gives the spec in, in the order they are read: `description` from its `metadata`, the rest from its `spec`. */
const SPEC_KEYS = ['version', 'description', 'instruction', 'rules', 'parameters', 'hires', 'revisions'] as const;

/** The spec of a template whose manifest gives none: no parameters, no hires. */
const NO_SPEC: TemplateSpec = { parameters: {}, hires: {} };

/** The spec the manifest `doc` writes, each key kept where it decodes as `TemplateSpec`'s; each other a problem of `place`'s manifest. */
function servedSpec(doc: unknown, place: string): { spec: TemplateSpec; problems: string[] } {
  const manifest = isMap(doc) ? doc : {};
  const written = isMap(manifest.spec) ? manifest.spec : {};
  const metadata = isMap(manifest.metadata) ? manifest.metadata : {};
  let spec = NO_SPEC;
  const problems: string[] = [];
  for (const key of SPEC_KEYS) {
    const value = key === 'description' ? metadata.description : written[key];
    if (value === undefined) continue;
    const decoded = Schema.decodeUnknownResult(TemplateSpec)({ ...spec, [key]: value });
    if (Result.isSuccess(decoded)) spec = decoded.success;
    else
      problems.push(
        `nemia.yaml: ${key === 'description' ? 'metadata' : 'spec'}.${key} does not read as a template's ${key}, so it is left out of the spec served: fix it, then check it with nemia template lint ${place}.`,
      );
  }
  return { spec, problems };
}

/** The builtin template `name`, at `place`, as an object: read through the door and checked, or listed with why it does not read. */
const templateAt = Effect.fn('templateAt')(function* (name: string, place: string) {
  const door = yield* TemplateDoor;
  const read = yield* Effect.result(door.templates.read(TemplateSource.read(place)));
  const meta = { name, creationTimestamp: bornAt(place) };
  if (Result.isFailure(read)) {
    const status: TemplateStatus = { source: place, workflows: [], agents: [], skills: [], problems: [read.failure.message] };
    return object(meta, NO_SPEC, status);
  }
  const checked = checkedTree(read.success, packageSkillNames());
  const { spec, problems } = servedSpec(checked.folder.documents.get('nemia.yaml'), place);
  const every = [...checked.problems.map(problemLine), ...problems];
  const status: TemplateStatus = {
    source: place,
    ...(checked.digest === undefined ? {} : { digest: checked.digest }),
    ...templateDocumentsOf(checked.files.map((file) => file.path)),
    ...(every.length ? { problems: every } : {}),
  };
  return object(meta, spec, status, checked.digest);
});

/** A Template of `meta`, `spec` and `status`, its `resourceVersion` its digest, or a digest of its spec and status where it has none. */
const object = (
  meta: { name: string; creationTimestamp: string },
  spec: TemplateSpec,
  status: TemplateStatus,
  digest?: string,
): Template => ({
  apiVersion: API_VERSION,
  kind: 'Template',
  metadata: { ...meta, resourceVersion: digest ?? versionOf(spec, status) },
  spec,
  status,
});

/** The folder of the builtin template `name`, or `Missing` naming the list and the builtin templates there are. */
const builtinNamed = Effect.fn('builtinNamed')(function* (name: string) {
  const folder = yield* BuiltinTemplates;
  const builtins = builtinTemplatesIn(folder);
  if (builtins.includes(name)) return path.join(folder, name);
  const has = builtins.length ? `the builtin templates are ${builtins.join(', ')}` : 'Nemia has no builtin template';
  return yield* Effect.fail(
    new Missing({ message: `Nemia has no builtin template named ${name}: ${has}. Name one of them; GET /api/templates lists them.` }),
  );
});

/** A page of the builtin templates, as a `TemplateList`, sorted by name; one that does not read listed with its problems. */
export const templateList = Effect.fn('templateList')(function* (query: ObjectQuery) {
  const folder = yield* BuiltinTemplates;
  const items = yield* Effect.forEach(builtinTemplatesIn(folder), (name) => templateAt(name, path.join(folder, name)));
  return yield* objectsListed('Template', items, query, 'template');
});

/** The builtin template `name`, as a `Template`; `Missing` where no builtin template has that name. */
export const templateObject = Effect.fn('templateObject')(function* (name: string) {
  return yield* templateAt(name, yield* builtinNamed(name));
});

/**
 * The builtin template `name` rendered with its parameters' defaults, written once into `<TemplateRenders>/<digest>/<name>` as a
 * factory's tree is laid out (`workflows/<workflow>/`, `workflows/agents/`, `workflows/skills/`, `factory.json`, `NEMIA.md`, `RULES.md`),
 * reused untouched where it is there as this user's with the render's content (`renderStaged`); its workflows and hires. `Missing` where
 * no builtin template has that name, `Invalid` where it does not render, its problems named, `Conflict` where the folder of renders, or
 * one in it on the way, is not this user's.
 */
export const templateTree = Effect.fn('templateTree')(function* (name: string) {
  const place = yield* builtinNamed(name);
  const tree = yield* (yield* TemplateDoor).templates.read(TemplateSource.read(place));
  const read = yield* renderedAt(place, []);
  const wiring = 'problems' in read ? undefined : treeWiringOf(read.entries);
  if ('problems' in read || wiring === undefined || !('wiring' in wiring) || tree.digest === undefined) {
    const problems = 'problems' in read ? read.problems : wiring !== undefined && 'error' in wiring ? [wiring.error] : [];
    return yield* Effect.fail(
      new Invalid({
        message: `the template ${name} does not render with its parameters' defaults${problems.length ? `:\n${problems.join('\n')}\n` : '. '}Give each parameter a default in its nemia.yaml and fix each problem; nemia template lint ${place} checks it.`,
      }),
    );
  }
  const root = yield* TemplateRenders;
  const dir = path.join(root, tree.digest, name);
  yield* renderStaged(root, dir, read.entries);
  return {
    name,
    source: place,
    digest: tree.digest,
    dir,
    workflows: [...wiring.wiring.workflows],
    hires: { ...wiring.wiring.hires },
  } satisfies TemplateTreeRendered;
});
