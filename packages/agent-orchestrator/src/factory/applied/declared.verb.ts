/**
 * What a template declares of its parameters, read through the Template door (`declaredAt`), and the `--set` words a factory's first
 * writable volume gives them (`originSetsAt`), which `factory apply`, `factory volume add` and a factory's commands read alike. A
 * controller beneath them, which imports none: it reads the template's stores, which no store file of the factory's may.
 */
import { Effect } from 'effect';
import { tried } from '../../runtime-client.ts';
import type { Volume } from '../factory.ts';
import { originHostOf, originParams } from '../volume/origin-params.ts';
import { openedTree, packageSkillNames } from '../../template/template.store.ts';
import { TemplateSource } from '../../template/door/templates.model.ts';
import { TemplateDoor, templatePlace } from '../../template/door/templates.store.ts';
import type { FactorySpec } from '../../template/index.ts';

/**
 * The parameters the template at `source` declares, by name, read through the Template door as `renderedAt` reads it; none where it
 * does not open without a problem, whose render then says why.
 * @param source The template, a folder or an archive by its whole path or a builtin template's name.
 */
export const declaredAt = Effect.fn('declaredAt')(function* (source: string) {
  const place = yield* templatePlace(source);
  const tree = yield* (yield* TemplateDoor).templates.read(TemplateSource.read(place));
  const read = yield* tried(() => openedTree(place, tree, packageSkillNames()));
  if (read.problems.length) return {};
  return (read.folder.documents.get('nemia.yaml') as { spec: FactorySpec }).spec.parameters ?? {};
});

/**
 * The `--set` words the first writable one of `volumes` gives the template at `source` (`originParams`), before any a person gives.
 * @param source The template the factory is made from.
 * @param volumes The volumes the factory is given, in order.
 */
export const originSetsAt = Effect.fn('originSetsAt')(function* (source: string, volumes: readonly Volume[]) {
  const first = volumes.find((v) => !v.readOnly);
  if (first === undefined) return [];
  const declared = yield* declaredAt(source).pipe(Effect.orElseSucceed(() => ({})));
  return originParams(declared, { firstWritable: true, ...hostOf(first) });
});

/** The host `volume` was cloned from, as `originParams` takes it: absent where it was given by its path. */
const hostOf = (volume: Volume): { originHost?: string } => {
  const host = originHostOf(volume.origin);
  return host === undefined ? {} : { originHost: host };
};
