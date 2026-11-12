/**
 * A harness as two needs: what each runtime adapter declares of its install and its sign-in (`HarnessDeclaration.needs`), as objects'
 * `Need`s (`harnessNeedsOf`), named `<harness>` and `<harness>-sign-in` and swept, held, read and fixed as every other need is; and the
 * pure judgements over them — the harnesses a run needs (`harnessesOfRun`), the runs a removal waits on (`runsHoldingRemoval`) and the word
 * the readiness read says of a version found against its pin (`harnessVersionWord`). Typed by `contracts/harness-needs.contract.ts`,
 * which proves the three judgements. Pure.
 */
import type { HarnessDeclaration, HarnessNeeds } from 'agent-runtime/vocabulary';
import type { HarnessPart, Need, NeedFix } from 'objects';
import type {
  HarnessesOfRun,
  HarnessVersionWord,
  HarnessVersionWordOf,
  RunNeeding,
  RunsHoldingRemoval,
  StepHarness,
} from '../../contracts/harness-needs.contract.ts';

export type { HarnessVersionWord, RunNeeding, StepHarness };

/**
 * The harnesses a run needs, from its frozen steps (`StepHarness`): each that a step running a session runs on — the one it names, else
 * `defaultHarness` — among `withNeeds`, the harnesses whose adapters declare needs, in `withNeeds`' order and each once.
 */
export const harnessesOfRun: HarnessesOfRun = (steps, defaultHarness, withNeeds) => {
  const out: string[] = [];
  for (const h of withNeeds) if (!out.includes(h) && steps.some((s) => s.runsSession && (s.harness ?? defaultHarness) === h)) out.push(h);
  return out;
};

/** The unfinished runs whose needs name `need`, each once in the order given: what a fix that takes `need` away waits on. */
export const runsHoldingRemoval: RunsHoldingRemoval = (need, unfinished) => {
  const out: string[] = [];
  for (const r of unfinished) if (r.needs.includes(need) && !out.includes(r.run)) out.push(r.run);
  return out;
};

/**
 * What the read says of the version a harness answered (`found`) against `pin`: `tested` at the pin, `untested` else, `unread` with none.
 */
export const harnessVersionWord: HarnessVersionWordOf = (found, pin) =>
  found === undefined ? 'unread' : found === pin ? 'tested' : 'untested';

/** The first `x.y.z` in what a harness's version command printed, or undefined where it printed none. */
export const versionIn = (printed: string): string | undefined => /\d+\.\d+\.\d+/.exec(printed)?.[0];

/** The name of a harness's sign-in need: `<harness>-sign-in`. */
export const signInNeedOf = (harness: string): string => `${harness}-sign-in`;

/** The harnesses of `declarations` that declare needs, in their order: those a person installs and signs in. */
export const harnessesWithNeeds = (declarations: Readonly<Record<string, HarnessDeclaration>>): string[] =>
  Object.entries(declarations).flatMap(([name, d]) => (d.needs === undefined ? [] : [name]));

/** Which harness, and which of its two needs, the need named `need` is, among `declarations`; undefined for a need of no harness. */
export const harnessOfNeed = (
  need: string,
  declarations: Readonly<Record<string, HarnessDeclaration>>,
): { readonly name: string; readonly part: HarnessPart; readonly needs: HarnessNeeds } | undefined => {
  for (const [name, d] of Object.entries(declarations)) {
    if (d.needs === undefined) continue;
    if (need === name) return { name, part: 'install', needs: d.needs };
    if (need === signInNeedOf(name)) return { name, part: 'sign-in', needs: d.needs };
  }
  return undefined;
};

/**
 * How the default harness's token is kept: the harness (`harness`), the command that prints a token (`maker`), and the command that keeps
 * it in the store (`keep`), which a person types after it.
 */
export type TokenKept = { readonly harness: string; readonly maker: string; readonly keep: string };

/**
 * Each harness of `declarations` that declares needs, as two needs: `<harness>`, its install — its program found, fixed by its install
 * (the first fix, a `puts`) or taken away by its removal (the second, `kind: removes`) — and `<harness>-sign-in`, its sign-in, fixed by
 * the fixes its adapter declares in order, one a person types (`typed`) of kind `typed`. Where `token` names the harness, the fix that
 * makes its token is offered with the command that keeps it after it (`<maker> && <keep>`). A harness that declares none (a command, a
 * remote agent) gives none.
 */
export function harnessNeedsOf(declarations: Readonly<Record<string, HarnessDeclaration>>, token?: TokenKept): Need[] {
  return Object.entries(declarations).flatMap(([name, d]): Need[] => {
    const needs = d.needs;
    if (needs === undefined) return [];
    const install: Need = {
      name,
      message: `${needs.title} (${needs.program}) is installed: this release was tested with ${needs.pin}`,
      check: needs.check,
      fixes: [
        { command: needs.install, message: `install ${needs.title} ${needs.pin} into the tools folder` },
        { command: needs.remove, message: `remove ${needs.title} from the tools folder`, kind: 'removes' },
      ],
    };
    const signIn: Need = {
      name: signInNeedOf(name),
      message: `${needs.title} is signed in as the user the daemon runs as`,
      check: needs.signIn.check,
      fixes: needs.signIn.fixes.map((fix): NeedFix => ({
        command: token?.harness === name && fix.command === token.maker ? `${fix.command} && ${token.keep}` : fix.command,
        message: fix.message,
        ...(fix.code === undefined ? {} : { code: fix.code }),
        ...(fix.typed ? { kind: 'typed' as const } : {}),
      })),
    };
    return [install, signIn];
  });
}
