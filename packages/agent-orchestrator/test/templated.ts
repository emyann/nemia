/**
 * A template's programs run as a test runs them, at the store's root `root` the test set as `WF_ROOT`: export and a read through the
 * Template door's files, a template opened for a render, and the factory controller's pass over one factory (`reconcileFactory`), each
 * given `builtins` as the folder of the templates Nemia ships where the test names one (`BuiltinTemplates`), never the package's own.
 * Imported with `await import` after the file sets `WF_ROOT`, as the store's modules are.
 */
import path from 'node:path';
import { Cause, Effect, Exit } from 'effect';
import { StoreRoot } from '../src/config/root.store.ts';
import { BuiltinTemplates, TemplateDoor } from '../src/templates/templates.store.ts';
import { TemplateSource } from '../src/templates/templates.model.ts';
import { openedTree, placeSkillNames } from '../src/template/template.store.ts';
import { exportedTemplate } from '../src/template/template.verb.ts';
import { reconcileFactory } from '../src/applied/applied.verb.ts';

/** `program` given the builtin folder `builtins`, where one is named. */
export const withBuiltins = <A, E, R>(program: Effect.Effect<A, E, R>, builtins?: string): Effect.Effect<A, E, R> =>
  builtins === undefined ? program : Effect.provideService(program, BuiltinTemplates, builtins);

/** The programs at the store `root`, each answering what its program answers, or throwing the refusal it failed with. */
export function templated(root: string, builtins?: string) {
  const run = <A>(program: Effect.Effect<A, unknown, StoreRoot>): A => {
    const exit = Effect.runSyncExit(Effect.provideService(withBuiltins(program, builtins), StoreRoot, root));
    if (Exit.isSuccess(exit)) return exit.value;
    throw Cause.squash(exit.cause);
  };
  const read = (source: string) =>
    run(
      Effect.gen(function* () {
        return yield* (yield* TemplateDoor).templates.read(TemplateSource.read(path.resolve(source)));
      }),
    );
  return {
    /** `nemia template export`'s program: the folder `dir` written from the repository `from`. */
    exportTemplate: (ask: { dir: string; from: string; factory?: string }) => run(exportedTemplate(ask.dir, ask.from, ask.factory)),
    /** The template at `source`, read through the door and opened for a render. */
    openTemplate: (source: string) => openedTree(source, read(source), placeSkillNames()),
    /** One pass of the factory controller over `factory`: the status it observed. */
    reconciled: (factory: Parameters<typeof reconcileFactory>[0]) => run(reconcileFactory(factory)),
  };
}
