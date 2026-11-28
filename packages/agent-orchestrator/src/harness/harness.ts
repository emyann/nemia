/**
 * The harnesses a step runs on (`HARNESSES`), what each declares (`declarationOf`, the runtime's declarations read here for the layers
 * above, which import no runtime), and a step on a remote agent: how it is named (`remoteNameOf`) and the keys it may not set
 * (`remoteRefusal`, `REMOTE_REFUSED_KEYS`). The words each harness takes are the runtime's, asked at `nemia start` (`configRefused` in
 * start.verb.ts).
 */
import { refuse, STEP_KEYS, type StepKey, type StepSpec } from '../step/step.ts';
import { DEFAULT_HARNESS, HARNESS_DECLARATIONS, HARNESS_KNOBS } from 'agent-runtime/vocabulary';

/** The harness a step runs on when it names none: the runtime's. */
export { DEFAULT_HARNESS };

/**
 * Claude Code's permission matching and measured tool sets, as the runtime declares them (`rulesOf` reads them off a harness's
 * declaration), for the api, which imports no runtime.
 */
export { CLAUDE_RULES, type ClaudeRules, type Dated } from 'agent-runtime/vocabulary';

/**
 * What harness `harness` declares, `DEFAULT_HARNESS` where it is `undefined`: `undefined` for a name the runtime has no declaration
 * for, a remote agent's among them. Pure.
 * @param harness The harness's name, or undefined for the default one.
 */
export const declarationOf = (harness: string | undefined) => {
  const name = harness ?? DEFAULT_HARNESS;
  return Object.hasOwn(HARNESS_DECLARATIONS, name) ? HARNESS_DECLARATIONS[name] : undefined;
};

/**
 * How harness `harness` matches its permission rules, and the tool sets measured on it: `undefined` where it declares none. Pure.
 * @param harness The harness's name, or undefined for the default one.
 */
export const rulesOf = (harness: string | undefined) => declarationOf(harness)?.rules;

/**
 * The key harness `harness`'s fence is named by — its mode, or `sandbox` — `DEFAULT_HARNESS`'s where it is `undefined`, and `undefined`
 * for a harness with no knobs. Pure.
 * @param harness The harness's name, or undefined for the default one.
 */
export const fenceKeyOf = (harness: string | undefined) => declarationOf(harness)?.knobs?.fence.key;

/**
 * The tool lists harness `harness`'s fence takes (`tools` and its allow and deny rules), `DEFAULT_HARNESS`'s where it is
 * `undefined`: none where its fence is one word, and `undefined` for a harness with no knobs. Pure.
 * @param harness The harness's name, or undefined for the default one.
 */
export const fenceListsOf = (harness: string | undefined) => declarationOf(harness)?.knobs?.fence.lists;

/**
 * How a step names a remote A2A agent, one another party runs: `harness: a2a:<name>`, the name one the store's `a2a-agents.json` declares
 * (`a2a.store.ts`), which the runtime client hands the engine as a harness of that name. The parser checks the shape and what such a step
 * may not set (`REMOTE_REFUSED`); `nemia start` checks the name is declared (`undeclaredRefusal` in start.verb.ts).
 */
export const REMOTE_PREFIX = 'a2a:';

/** A remote agent's name, as `a2a-agents.json` declares it and `harness:` names it after the prefix: lowercase words joined by dashes. */
export const REMOTE_NAME = /^[a-z][a-z0-9-]*$/;

/**
 * Whether a step's harness is a remote A2A agent (`REMOTE_PREFIX`). Pure.
 * @param harness The step's harness, or undefined where it names none.
 */
export const isRemoteHarness = (harness: string | undefined) => harness?.startsWith(REMOTE_PREFIX) ?? false;

/**
 * The name `harness: a2a:<name>` gives, or `undefined` for a local harness. Pure.
 * @param harness The step's harness, or undefined where it names none.
 */
export const remoteNameOf = (harness: string | undefined) =>
  harness !== undefined && isRemoteHarness(harness) ? harness.slice(REMOTE_PREFIX.length) : undefined;

const RUNS_AS_CONFIGURED =
  'is how a harness of ours is to run the session, and a remote agent runs as its operator configured it: A2A carries no such argument, and the runtime refuses a task filed with one';
const FENCED_THERE =
  "fences a session on this machine, and a remote agent runs on another party's, under their fence: nothing here would hold it";

/**
 * The keys a step on a remote A2A agent may not set, and why: each tells a harness of ours something, and a remote agent is not one.
 * Refused rather than dropped, since a line the run does not read is a constraint nobody enforces — `permissionMode: plan` would read as a
 * fence.
 */
const REMOTE_REFUSED: Partial<Record<StepKey, string>> = {
  model: RUNS_AS_CONFIGURED,
  effort: RUNS_AS_CONFIGURED,
  context: RUNS_AS_CONFIGURED,
  remote: 'bridges a Claude Code session to claude.ai, and a remote agent is not Claude Code',
  permissionMode: FENCED_THERE,
  sandbox: FENCED_THERE,
  tools: FENCED_THERE,
  skills:
    "gives a session on this machine skills from a plugin directory of the step's own, and a remote agent has the skills its operator gave it, and loads none of ours",
  disallowedTools: FENCED_THERE,
  allowedTools: FENCED_THERE,
  denials: 'stops the step on a call its harness denied, and a remote agent reports none',
  writable:
    "gives a session on this machine a folder of the run's factory to write, and a remote agent works on another party's machine, where no folder of this one is mounted",
  reads:
    "gives a session on this machine a folder of the store to read, and a remote agent works on another party's machine, where no folder of this one is mounted",
  budget: 'is a spend cap a harness of ours keeps, and a remote agent keeps none and reports no cost',
  memory: "limits the memory of a session's process on this machine, and a remote agent's process runs on another party's machine",
  memoryRequest: "asks memory of this machine for a session, and a remote agent's process runs on another party's machine",
  output:
    "declares the fields of a closing statement the harness is asked for, and A2A has no closeout schema: a Task the agent completes is the step's sign-off, and a data part on its reply is what it says",
  tally: 'counts fields of the closeout `output:` declares, and a step on a remote agent declares no `output:`',
  loop: 'goes round again on the `again` its `output:` declares, and a step on a remote agent declares no `output:`',
  resume: "continues a session a harness of ours kept, and the run keeps none of a remote agent's: a new Task is sent",
  check:
    "is a command the run executes in the step's workspace, and a remote agent works on another party's machine: nothing it does reaches the workspace, and a check would judge work nobody did there",
};

/**
 * Why a remote step's try may not be asked for with `nemia retry --<key>` — `--model`, `--budget` — in the words its load refuses the key
 * in, or undefined for a local harness: the tick files a remote try with no harness arguments (`localFields`), so the flag would be
 * dropped.
 * @param step The step the try is asked of.
 * @param flag The flag asked with.
 * @param value The flag's value, as given.
 * @param command The retry to ask instead, without the flag.
 */
export function remoteRetryRefusal(step: StepSpec, flag: 'model' | 'budget', value: string | number, command: string) {
  if (!isRemoteHarness(step.harness)) return undefined;
  return `\`--${flag} ${value}\` ${REMOTE_REFUSED[flag]}, and ${step.name} runs on \`harness: ${step.harness}\`, a remote A2A agent: its try would be sent without it. Ask without --${flag}: ${command}.`;
}

/**
 * The keys a step on a remote A2A agent may not set (`REMOTE_REFUSED`), in `STEP_KEYS`' order: what the board's form leaves off such a
 * step.
 */
export const REMOTE_REFUSED_KEYS: readonly StepKey[] = STEP_KEYS.filter((key) => REMOTE_REFUSED[key] !== undefined);

/**
 * Refused: a key a step on a remote agent may not set (`REMOTE_REFUSED`), from the step or from its agent. Nothing else is judged
 * against a remote harness: the key's own reading assumes a harness of ours.
 * @param step The step file, as the refusal names it.
 * @param meta The step's lines, by key, its agent's given among them.
 * @param harness The step's harness, a remote agent's.
 */
export function remoteRefusal(step: string, meta: Partial<Record<StepKey, string>>, harness: string) {
  const said = (key: string, why: string) =>
    refuse(
      `${step}: \`${key}: ${meta[key as StepKey]}\` ${why}, and \`harness: ${harness}\` is a remote A2A agent. Delete the line — from the step, or from the agent it names if the agent gives it.`,
    );
  for (const key of STEP_KEYS) {
    const why = REMOTE_REFUSED[key];
    if (why !== undefined && meta[key] !== undefined) said(key, why);
  }
}

/**
 * The harnesses a step may run on: those whose declaration says it runs a brief as an agent (`runsBrief`), in the runtime's order, the
 * default first.
 *
 * Checked here because nothing below checks it early enough: an unknown `harness` falls silently to the
 * default.
 *
 * `check` is not on the list. That harness is the run's own: it executes a step's `check:`
 * command, and no step runs on it.
 */
export const HARNESSES: readonly string[] = Object.entries(HARNESS_DECLARATIONS)
  .filter(([, declaration]) => declaration.runsBrief === true)
  .map(([name]) => name);

/**
 * What each harness a step may run on is, in a line a person reads, and each word of its fence, most guarded first, with what it means
 * and its rank, 1 the most guarded: the runtime's declarations (`note`, `guarded`), for the api, which imports no runtime. A harness
 * that says no line of itself is left out, and one with no fence has no words.
 */
export const HARNESS_NOTES = HARNESSES.flatMap((harness) => {
  const declaration = declarationOf(harness);
  if (declaration?.note === undefined) return [];
  const fence = (declaration.guarded ?? []).map(({ word, meaning }, i) => ({ word, meaning, rank: i + 1 }));
  return [{ harness, note: declaration.note, fence }];
});

/**
 * The fence keys of every harness: each one's own key and its tool lists. One list for the package, read by the template and by the
 * markdown readers, which take a harness's fence under its block (`<harness>: { fence: … }`, `fenceKeysOf`).
 */
export const HARNESS_FENCE_KEYS: readonly string[] = [
  ...new Set(Object.values(HARNESS_KNOBS).flatMap((knobs) => [knobs.fence.key, ...knobs.fence.lists])),
];

/**
 * The fence keys harness `harness`'s block takes, its own key then its tool lists, or `undefined` for a name that is no harness.
 * @param harness The harness's name.
 */
export const fenceKeysOf = (harness: string) => {
  if (!Object.hasOwn(HARNESS_KNOBS, harness)) return undefined;
  const knobs = HARNESS_KNOBS[harness];
  return knobs === undefined ? undefined : [knobs.fence.key, ...knobs.fence.lists];
};
