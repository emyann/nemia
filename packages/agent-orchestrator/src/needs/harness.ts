/**
 * A harness as two needs: what each runtime adapter declares of its install and its sign-in (`HarnessDeclaration.needs`), as objects'
 * `Need`s (`harnessNeedsOf`), named `<harness>` and `<harness>-sign-in` and swept, held, read and fixed as every other need is; and the
 * pure judgements over them — the harnesses a run needs (`harnessesOfRun`), the runs a removal waits on (`runsHoldingRemoval`) and the word
 * the readiness read says of a version found against its pin (`harnessVersionWord`). Typed by `contracts/harness-needs.contract.ts`,
 * which proves the three judgements. Pure.
 */
import type { HarnessDeclaration, HarnessNeeds } from 'agent-runtime/vocabulary';
import type { HarnessPart, Need } from 'objects';
import type { HarnessesOfRun, HarnessVersionWordOf, RunNeeding, RunsHoldingRemoval } from '../../contracts/harness-needs.contract.ts';

export type { RunNeeding };

/**
 * The harnesses a run needs, from its frozen steps (`StepHarness`): each that a step running a session runs on — the one it names, else
 * `defaultHarness` — among `withNeeds`, the harnesses whose adapters declare needs, in `withNeeds`' order and each once.
 * @param steps The run's frozen steps, each with whether it runs a session and the harness it names.
 * @param defaultHarness The harness a step that names none runs on.
 * @param withNeeds The harnesses whose adapters declare needs, in their order.
 */
export const harnessesOfRun: HarnessesOfRun = (steps, defaultHarness, withNeeds) => {
  const out: string[] = [];
  for (const h of withNeeds) if (!out.includes(h) && steps.some((s) => s.runsSession && (s.harness ?? defaultHarness) === h)) out.push(h);
  return out;
};

/**
 * The unfinished runs whose needs name `need`, each once in the order given: what a fix that takes `need` away waits on.
 * @param need The name of the need the fix takes away.
 * @param unfinished The unfinished runs, each with the needs it names.
 */
export const runsHoldingRemoval: RunsHoldingRemoval = (need, unfinished) => {
  const out: string[] = [];
  for (const r of unfinished) if (r.needs.includes(need) && !out.includes(r.run)) out.push(r.run);
  return out;
};

/**
 * What the read says of the version a harness answered (`found`) against `pin`: `tested` at the pin, `untested` else, `unread` with none.
 * @param found The version the harness answered, or undefined where it answered none.
 * @param pin The version this release was tested with.
 */
export const harnessVersionWord: HarnessVersionWordOf = (found, pin) =>
  found === undefined ? 'unread' : found === pin ? 'tested' : 'untested';

/**
 * The first `x.y.z` in what a harness's version command printed, or undefined where it printed none.
 * @param printed What the harness's version command printed.
 */
export const versionIn = (printed: string) => /\d+\.\d+\.\d+/.exec(printed)?.[0];

/**
 * The name of a harness's sign-in need: `<harness>-sign-in`.
 * @param harness The harness's name.
 */
export const signInNeedOf = (harness: string) => `${harness}-sign-in`;

/**
 * The harnesses of `declarations` that declare needs, in their order: those a person installs and signs in.
 * @param declarations Each harness's declaration, by its name.
 */
export const harnessesWithNeeds = (declarations: Readonly<Record<string, HarnessDeclaration>>) =>
  Object.entries(declarations).flatMap(([name, d]) => (d.needs === undefined ? [] : [name]));

/**
 * Which harness, and which of its two needs, the need named `need` is, among `declarations`; undefined for a need of no harness.
 * @param need The need's name.
 * @param declarations Each harness's declaration, by its name.
 */
export const harnessOfNeed = (need: string, declarations: Readonly<Record<string, HarnessDeclaration>>) => {
  for (const [name, d] of Object.entries(declarations)) {
    if (d.needs === undefined) continue;
    if (need === name)
      return { name, part: 'install', needs: d.needs } satisfies
        | { readonly name: string; readonly part: HarnessPart; readonly needs: HarnessNeeds }
        | undefined;
    if (need === signInNeedOf(name))
      return { name, part: 'sign-in', needs: d.needs } satisfies
        | { readonly name: string; readonly part: HarnessPart; readonly needs: HarnessNeeds }
        | undefined;
  }
  return undefined;
};

/**
 * How the default harness's token is kept: the harness (`harness`), the command that prints a token (`maker`), and the command that keeps
 * it in the store (`keep`), which a person types after it.
 */
export type TokenKept = { readonly harness: string; readonly maker: string; readonly keep: string };

/**
 * The mark a harness's removal leaves in its folder of the tools folder, `<tools>/harnesses/<harness>/deactivated`, and its install takes
 * away: a harness so marked was deactivated by a person, so neither the daemon's start adopts it from an older release's tree nor an
 * upgrade carries it (`adoptBundled`, `harnessesHeld`).
 */
export const DEACTIVATED = 'deactivated';

/** The mark of `harness` as a shell word, under `NEMIA_TOOLS`, which every check and fix is run with. */
const markOf = (harness: string) => `"$NEMIA_TOOLS/harnesses/${harness}/${DEACTIVATED}"`;

/**
 * The install of `harness` as it is run: its mark taken away (`DEACTIVATED`), then its adapter's `install`.
 * @param harness The harness's name.
 * @param needs What its adapter declares of its install and sign-in.
 */
export const harnessInstallCommand = (harness: string, needs: HarnessNeeds) => `rm -f ${markOf(harness)} && {\n${needs.install}\n}`;

/**
 * The removal of `harness` as it is run: its adapter's `remove`, then its mark left in its folder (`DEACTIVATED`).
 * @param harness The harness's name.
 * @param needs What its adapter declares of its install and sign-in.
 */
const harnessRemoveCommand = (harness: string, needs: HarnessNeeds) =>
  `{\n${needs.remove}\n} && mkdir -p "$NEMIA_TOOLS/harnesses/${harness}" && : > ${markOf(harness)}`;

/**
 * Each harness of `declarations` that declares needs, as two needs: `<harness>`, its install — its program found, fixed by its install
 * (the first fix, a `puts`) or taken away by its removal (the second, `kind: removes`), each with its mark (`harnessInstallCommand`,
 * `harnessRemoveCommand`) — and `<harness>-sign-in`, its sign-in, fixed by
 * the fixes its adapter declares in order, one a person types (`typed`) of kind `typed`. Where `token` names the harness, the fix that
 * makes its token is offered with the command that keeps it after it (`<maker> && <keep>`). A harness that declares none (a command, a
 * remote agent) gives none.
 * @param declarations Each harness's declaration, by its name.
 * @param token How the default harness's token is kept, or undefined where none is.
 */
export function harnessNeedsOf(declarations: Readonly<Record<string, HarnessDeclaration>>, token?: TokenKept) {
  return Object.entries(declarations).flatMap(([name, d]) => {
    const needs = d.needs;
    if (needs === undefined) return [];
    const install: Need = {
      name,
      message: `${needs.title} (${needs.program}), at ${needs.pin}, the version this release was tested with`,
      check: needs.check,
      fixes: [
        { command: harnessInstallCommand(name, needs), message: `install ${needs.title} ${needs.pin} into the tools folder` },
        { command: harnessRemoveCommand(name, needs), message: `remove ${needs.title} from the tools folder`, kind: 'removes' },
      ],
    };
    const signIn: Need = {
      name: signInNeedOf(name),
      message: `${needs.title} is signed in as the user the daemon runs as`,
      check: needs.signIn.check,
      fixes: needs.signIn.fixes.map((fix) => ({
        command: token?.harness === name && fix.command === token.maker ? `${fix.command} && ${token.keep}` : fix.command,
        message: fix.message,
        ...(fix.code === undefined ? {} : { code: fix.code }),
        ...(fix.typed ? { kind: 'typed' as const } : {}),
      })),
    };
    return [install, signIn];
  });
}
