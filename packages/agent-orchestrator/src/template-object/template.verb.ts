/**
 * The builtin templates as objects (`Template`, `TemplateList`, from `objects`), cluster-scoped, by name: each folder of the builtin
 * templates (`builtinTemplatesIn`, at `BuiltinTemplates`) read through the Template door and checked (`checkedTree`). Its `spec` is its
 * manifest's spec as written, each key kept only where it decodes as the object's (`TemplateSpec`), its `description` the manifest's
 * `metadata.description`; its `status` where it is read from, its content's digest, the names of its workflows, agents and skills, and
 * every problem, a key left out of the spec among them. A template that does not read is listed all the same, its problems saying why.
 *
 * And a template's render (`templateTree`): rendered with its parameters' defaults (`renderedAt`, which writes nothing), then written
 * once per content digest under the folder of renders (`TemplateRenders`, `<tmpdir>/nemia-templates`), laid out as a factory's tree is,
 * so the api reads its workflows, agents and skills as it reads a factory's. A write outside the store on a read: staged beside its
 * place and renamed into it (`stageFolder`), and a folder already there reused untouched.
 */
import os from 'node:os';
import path from 'node:path';
import { Context, Effect, Result, Schema } from 'effect';
import { API_VERSION, type Template, TemplateSpec, type TemplateStatus } from 'objects';
import { stageFolder, treeWiringOf } from '../applied/applied.store.ts';
import { renderedAt } from '../applied/applied.verb.ts';
import { bornAt, objectsListed, versionOf, type ObjectQuery } from '../factory-object/factory.verb.ts';
import { Invalid, Missing } from '../refusal/refusal.ts';
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

/** The folder templates are rendered under, one folder per content digest: `<tmpdir>/nemia-templates`, unless given another. */
export const TemplateRenders = Context.Reference<string>('agent-orchestrator/TemplateRenders', {
  defaultValue: () => path.join(os.tmpdir(), 'nemia-templates'),
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
 * reused untouched where it is there; its workflows and hires. `Missing` where no builtin template has that name, `Invalid` where it does
 * not render, its problems named.
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
  const dir = path.join(yield* TemplateRenders, tree.digest, name);
  stageFolder(dir, read.entries, false);
  return {
    name,
    source: place,
    digest: tree.digest,
    dir,
    workflows: [...wiring.wiring.workflows],
    hires: { ...wiring.wiring.hires },
  } satisfies TemplateTreeRendered;
});
