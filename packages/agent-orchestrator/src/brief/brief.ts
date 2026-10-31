/**
 * What a step is told: its brief (`composeBrief`) or, on a remote A2A agent, its remote brief (`remoteBrief`), with what the runs it waited
 * on or was handed as context concluded (`ParentCloseout`). Pure; the sections a brief is made of are `brief-sections.ts`'s.
 */
import type { Workflow } from '../step/step.ts';
import { fenced, isRepositoryRun, placeOf, type RepositoryRun, type Run } from '../record/record.ts';
import type { FiledFolders } from '../filed/filed.ts';
import { closeoutContract, isLoopTarget, type Closeout } from '../closeout/index.ts';
import { handedSection, type ParentCloseout } from './handed.ts';
import { depsLines, givenPlan, workspacePlan, type Provisioned } from '../workspace/workspace.ts';
import {
  acceptedSection,
  approvedSection,
  fromSection,
  loopSection,
  retriedInRound,
  retrySection,
  roundSection,
  type RetryBriefing,
  type RoundBriefing,
} from './brief-sections.ts';
import { landsOnCheck, merged, owesReplies } from '../status/status.ts';
import { isRemoteHarness } from '../harness/harness.ts';
import { mergeReviewSection, mergeSection } from '../merge/merge.ts';
import { checkContract, checkHandedSection, landingContract, type CheckHanded, type LandingWords } from '../check/check.ts';
import { artifactsContract } from '../artifacts/artifacts.ts';
import { briefBody, rendersAgent, skillLayers } from '../agents/agents.ts';
import { ownNote } from '../ending/ending.ts';
import { FENCE_KEYS, headedLayers, ownDenies, type ComposedLayer } from '../workflow/index.ts';
import { INPUTS_HEADING, inputsLine, mountsLine } from '../start/index.ts';
import { resultSteps, workChecks } from '../branches/index.ts';
import { costsSection, type WorkflowCosts } from '../costs/index.ts';
import { sayFilled, skillSaid, type PlaceSay } from '../place/place.ts';

/**
 * What a step's place gives its brief: how an ending that lands on its check stages the merge and what it denies (`words`), and the
 * place's own commands (`say`). A folder run's place gives none; a repository run's absent `say` sends the step to its place's skill.
 */
export type BriefPlace = { readonly words?: LandingWords; readonly say?: PlaceSay };

/**
 * What a step's closeout says of `replies` (`closeoutContract`): owed on a round filed, none on a merge filed — told by the round itself,
 * since its brief is composed before the record moves the try behind — else owed past round 1 (`owesReplies`), none for any other try of
 * a loop's target, and nothing for a step that closes no loop.
 */
const repliesOf = (step: Workflow, run: Run, steps: readonly Workflow[], round?: RoundBriefing): 'owed' | 'none' | false => {
  if (round) return round.merge ? 'none' : 'owed';
  if (owesReplies(steps, run, step.name)) return 'owed';
  return isLoopTarget(steps, step.name) ? 'none' : false;
};

/** The conflicts a step's merge left, named with how its place says to see them; nothing for a merge that left none. */
const conflictLines = (merge: { readonly conflicts: readonly string[]; readonly say: string } | undefined): string[] =>
  merge?.conflicts.length
    ? [
        '',
        'The merge left conflicts, and they are yours to resolve — that is what a step waiting on several others is for:',
        '',
        ...merge.conflicts.map((file) => `- ${file}`),
        ...(merge.say ? ['', merge.say] : []),
      ]
    : [];

/**
 * What a brief opens with, before anything else of Nemia's: which layer of what the session is told is which, and which wins where two
 * differ. It is the last thing Nemia says before the harness's own words about the folder it works in, and the only thing of ours that
 * lands after them, so it is where the precedence can be said as an instruction the session reads. Written once, read by `composeBrief`,
 * which opens every brief with it, and by `toldLayers`, which cuts a brief back on it.
 */
export const PRECEDENCE =
  "Of what you are told, your instructions are layer 1, the custom instructions 2, the files of the folder you work in 3, this factory's rules 4 and this step's policy 5: where two of them say different things, the higher number wins, and what is asked of you below is above them all.";

/** What the brief opens with: the precedence (`PRECEDENCE`), then the layers the step is told in its brief (`briefBody`), where it has
 * any. */
const opened = (step: Workflow): string => [PRECEDENCE, briefBody(step)].filter(Boolean).join('\n\n');

/**
 * What a step is told. THE decision about what one step knows of another.
 *
 * It gets: its own prose, the original request, and where to look. It does NOT get the previous
 * step's transcript, reasoning or self-assessment.
 *
 * The reason is the one a pull request already demonstrates: a PR description is not the author's
 * transcript, it is an artifact the author deliberately produced, and the reviewer judges the diff
 * rather than the author's account of it. Passing the implementer's reasoning to the reviewer
 * would anchor it on the same context that produced the work — the failure we already avoid when
 * deciding whether to resume a failed session — and would offer unverifiable claims alongside
 * verifiable evidence.
 *
 * So: intent and artifacts travel, process does not. If a step wants to say something to the next
 * one, it declares it — an `output:` the next step reads with `input:`, handed on under
 * `## From <step>` — or writes a file, deliberately, like a person would. A declared output is the
 * producer's deliberate product, like the file; its summary is its account, and stays with the person.
 *
 * One level up, a run that waited on runs is handed what they concluded, summaries included, on its roots
 * (`## From run <id>`): by then a person has read those summaries and landed the work — see `fromRunSection`. A run handed others as
 * context (`--from`) is handed theirs the same way, after, each labelled landed or not landed, not judged — see `contextSection`.
 *
 * And a step after a gate is handed the approval that let it be filed, and the words given with it (`## Approved`): a person's decision
 * on the record, which the step after the gate and every step after that one read — see `approvedSection`.
 *
 * A step after a loop a person ended as it stands is handed the same way what they said and what the loop still had open (`## Accepted`):
 * it was filed because a person decided the findings are not this run's work, and it is the only step that can tell anyone — see
 * `acceptedSection`.
 *
 * A step filed after a step with a `check:` is handed what that check said (`## What <step>'s check said`): its exit, the last lines of
 * each stream, and every line of its stdout that starts `wf <name>:`, whole. That is evidence, not process: the run executed the command,
 * so what it printed is a fact about the work, as the diff is — a reviewer reads the lines a check marked in its brief rather than being
 * sent to a log its fence does not reach. See `checkHandedSection`.
 *
 * Every brief ends on what finishing means: the command the step is judged by, when it has one, where its files go, and then the
 * closeout, last, because it says to give it last. A loop's target past its first round answers the findings it was handed. A folder
 * run's steps are told of folders and never of git (`placeOf`). A try or a round that continues the last session is told only what
 * became of it and the contracts; a step that continues another (`resume`) is told what it reads and a tree the run installed, never the
 * spec again. How the run provisioned the tree is said only when it did more than link it (`depsLines`). What was asked for carries the
 * folders the run mounts (`mountsLine`), only when there are any; the files given with it stand after it under a heading of their own
 * (`INPUTS_HEADING`, `inputsLine`), likewise, as part of what was asked and outside the request's own sections.
 *
 * A fan-in works on a branch with every step it waits on merged in, unless it works in the repository's checkout or in a folder, where
 * nothing is merged. A folder step is told which earlier steps worked in its own folder, read off the folders the record names, not the
 * plan, and the folders it was given (`givenPlan`), inside the fence — never those of steps it does not wait on; it is told to judge
 * only what it can open. A step in the repository's own checkout (`workspace: main`) is told the run's result branches, or, for a run
 * that cut none, that there is no work of its to read; never where the checkout stands, since a step composed again on every answer
 * would name a commit behind it. Unless it has a check of its own, which the run executes on its merge (`landingContract`), it is told
 * the workflow's checks its work was judged by (`workChecks`).
 *
 * @param closeoutOf How each step signed off. Read only for the steps this one names in `input:`.
 * @param artifactsDir The directory the run made for this step's files (`artifactsDir` in record.store.ts).
 * @param deps What the run made of this worktree's `node_modules` when it cut it (`provisionDeps` in worktree.store.ts).
 * @param retry For a step tried again: the try, and what became of the one before it (`retrySection`).
 * @param round For a loop's target filed as its next round: the round, and what the looping step asked (`roundSection`).
 * @param parents For a root of a run that waited on runs (`--after`), filed on the pass that saw them land, or was handed runs as context
 *   (`--from`): what each concluded (`handedSection`), the runs waited on first, gathered by file.verb.ts. Given to no other step: a run
 *   with neither, and every step after a root, is composed without it.
 * @param inputsDir The directory the run copied `nemia start --input` files into (`inputsDir` in record.store.ts): named, with
 *   `run.inputs`, under their own heading after what was asked for, as mounted where `folders` holds it (`inputsLine`).
 * @param checked For a step filed after checked steps: what each of their checks said on the try or round it follows
 *   (`checkHandedSection`), read by file.verb.ts. Absent, and nothing is said of a check: the board's preview composes without it.
 * @param folders The folders the step is filed with beyond its factory's, each read-only (`filedFolders` in filed.ts): the artifacts
 *   folders of the steps before it and the store's its `reads:` names, named under what was asked for (`mountsLine`), and the run's
 *   inputs folder, named so on the inputs line (`inputsLine`). Absent, and nothing is said of them.
 * @param costs For a step whose `reads:` names `costs`: what recent finished runs of its workflow in its factory cost (`costsRead`), read
 *   by file.verb.ts and said among what the step is handed (`costsSection`). Absent, and nothing is said of costs.
 * @param place What the run's place says (`BriefPlace`): for an ending that lands on its check, how it stages the merge and what it
 *   denies (`landingWords`), said in its contract; and the commands a step reads its work and merges its base with. Absent, and the
 *   contract and the brief send the step to its place's skill.
 * @param merge For a step that waits on several, as its place merged them (`make`): the paths the merge left conflicted, and the place's
 *   sentence of how to see them (`say.conflicts`). Conflicts are named under what is in the workspace; none, and nothing is said of them.
 */
export function composeBrief(
  step: Workflow,
  run: Run,
  steps: readonly Workflow[],
  closeoutOf: (step: string) => Closeout | undefined = () => undefined,
  artifactsDir?: string,
  deps?: Provisioned,
  retry?: RetryBriefing,
  round?: RoundBriefing,
  parents?: readonly ParentCloseout[],
  inputsDir?: string,
  checked?: readonly CheckHanded[],
  folders?: FiledFolders,
  costs?: WorkflowCosts,
  place: BriefPlace = {},
  merge?: { readonly conflicts: readonly string[]; readonly say: string },
): string {
  const inFolder = placeOf(run) === 'folder';
  const contracts = [
    ...(step.check ? [landsOnCheck(step, run) ? landingContract(step.check, place.words) : checkContract(step.check)] : []),
    ...(artifactsDir ? [artifactsContract(artifactsDir, step.workspace === 'main', inFolder)] : []),
    closeoutContract(step, repliesOf(step, run, steps, round), inFolder),
  ].join('\n');
  const again = againSection(step, run, steps, closeoutOf, inFolder, place.say, retry, round);
  if (retry?.resumed || round?.resumed) return again.slice(1) + contracts;
  const given = givenSections(step, run, steps, closeoutOf, checked, place.say) + again;
  const tree = depsLines(deps);
  const handed = handedOf(step, run, steps, closeoutOf, parents, costs);

  if (step.resume && !retry && !round)
    return (
      opened(step) + handed.decided.join('') + (tree.length ? ['', '## Where to look', '', ...tree].join('\n') : '') + given + contracts
    );

  const earlier = step.after.length
    ? step.after
    : steps.filter((s) => s.name !== step.name && run.steps[s.name]?.taskId).map((s) => s.name);

  const inputs = inputsLine(inputsDir, run.inputs, inFolder, folders);
  const request = [run.brief, ...mountsLine(step, run, folders), ...(inputs ? ['', INPUTS_HEADING, '', inputs] : [])];
  const opening = [opened(step), ''];
  const parts = [...opening, '## What was asked for', '', ...request, ...handed.parents, ...handed.decided];

  if (step.after.length > 1 && step.workspace !== 'main' && !inFolder) {
    return [
      ...parts,
      '',
      '## What is in this workspace',
      '',
      `The work of ${step.after.join(' and ')} has been merged into this branch.`,
      ...conflictLines(merge),
      ...(tree.length ? ['', ...tree] : []),
      ...(given ? [given] : []),
      contracts,
    ].join('\n');
  }

  if (earlier.length || tree.length || step.workspace === 'main' || inFolder) parts.push('', '## Where to look', '');
  if (inFolder) {
    parts.push(
      'This step works in a folder the run made for it: what you leave there, and name in `artifacts`, is what the steps after you and the person who decides receive.',
    );
    const plan = workspacePlan(steps, step);
    const here = run.steps[step.name]?.workspace ?? (plan.kind === 'inherit' ? run.steps[plan.from]?.workspace : undefined);
    const inHere = earlier.filter((name) => here !== undefined && run.steps[name]?.workspace === here);
    const given = givenPlan(run, plan);
    if (inHere.length) parts.push('', `This folder has already been worked in by: ${inHere.join(', ')}. Their work is on disk here.`);
    if (given.from.length) {
      const where = given.from.map((g) => `- ${g.step}: \`${g.dir}\``);
      parts.push(
        '',
        `${inHere.length ? 'Other steps' : 'The steps before you'} worked in folders of their own, which this one is not. What each left has been copied into this folder:`,
        '',
        ...where,
        '',
        'Read what you need there. Each is a copy, taken as this step was filed, so nothing you do to it reaches them: what you make goes in this folder, outside `given`.',
      );
    }
    if (inHere.length || given.from.length) {
      parts.push('', 'Judge what is there. You have not been given their reasoning, on purpose — read the work,', 'not an account of it.');
    }
  } else if (step.workspace === 'main' && isRepositoryRun(run)) {
    parts.push(...endingLook(step, run, steps, earlier, place.say));
  } else if (earlier.length && isRepositoryRun(run)) {
    parts.push(
      `This workspace has already been worked in by: ${earlier.join(', ')}.`,
      ...laterLook(run, place.say),
      '',
      'Judge what is there. You have not been given their reasoning, on purpose — read the change,',
      'not an account of it.',
    );
  }
  if (tree.length) parts.push(...(earlier.length ? [''] : []), ...tree);

  parts.push(...(given ? [given] : []), contracts);
  return parts.join('\n');
}

/**
 * How a step after others reads what they changed against the run's base: the place's own commands (`say.look`), or, with none, where
 * its place's skill says them.
 */
function laterLook(run: RepositoryRun, say: PlaceSay | undefined): string[] {
  const lead = `Their work is on disk, and against \`${run.baseRef}\` you can see exactly what changed`;
  if (!say) return [`${lead}, ${skillSaid('read')}.`];
  return [`${lead}:`, '', '```', ...say.look.map((line) => sayFilled(line, { baseRef: run.baseRef })), '```'];
}

/**
 * Where a step in the repository's own checkout looks (`workspace: main`): that it is there, the run's result branches and how to read
 * each against the base — in the place's words (`say.results`), or where its place's skill says them — or that the run cut none; the
 * workflow's checks, unless it has its own; and that the checkout is the person's.
 */
function endingLook(
  step: Workflow,
  run: RepositoryRun,
  steps: readonly Workflow[],
  earlier: readonly string[],
  say: PlaceSay | undefined,
): string[] {
  const results = resultSteps(steps)
    .map((s) => run.steps[s.name]?.branch)
    .filter((b): b is string => Boolean(b));
  const lead = `${earlier.length ? `The work of ${earlier.join(', ')} is not in this directory: it is` : "The run's work is"} on ${results.join(' and ')}, cut from \`${run.baseRef}\``;
  const read = say
    ? [
        `${lead}:`,
        '',
        '```',
        ...results.flatMap((branch) => say.results.map((line) => sayFilled(line, { base: run.branch, branch }))),
        '```',
      ]
    : [`${lead}. Read each against \`${run.branch}\` ${skillSaid('read')}.`];
  return [
    `You are in ${run.repo}, the repository's own checkout, on ${run.branch} — not in a worktree of this run's.`,
    ...(results.length
      ? [...read, '']
      : [
          `This run cut no branch of its own — it is this step, and nothing else — so there is no work of its to read: what you act on is what you find, here and wherever you were told to look.`,
          '',
        ]),
    ...(step.check ? [] : workChecks(steps)).flatMap((check) => [`This workflow's check, which its work was judged by: \`${check}\``, '']),
    'What you do here a person sees in their own checkout: it is theirs, and this step is the run doing what they would do by hand.',
    'Leave it as you found it but for what you were asked to do — the run commits nothing here for you.',
  ];
}

/**
 * What a step is handed under what was asked for: what each run it waited on or was handed concluded (`parents`), then what a person
 * approved and accepted before it and what recent runs of its workflow cost (`decided`), each section left out where it says nothing.
 */
function handedOf(
  step: Workflow,
  run: Run,
  steps: readonly Workflow[],
  closeoutOf: (step: string) => Closeout | undefined,
  parents: readonly ParentCloseout[] = [],
  costs?: WorkflowCosts,
): { parents: string[]; decided: string[] } {
  return {
    parents: parents.map((p) => handedSection(p)),
    decided: [approvedSection(step, run, steps), acceptedSection(step, run, steps, closeoutOf), costs ? costsSection(costs) : ''].filter(
      Boolean,
    ),
  };
}

/** What a step filed again is told of why: its try's section (`retrySection`), its merge's (`mergeSection`) or its round's, or nothing. */
function againSection(
  step: Workflow,
  run: Run,
  steps: readonly Workflow[],
  closeoutOf: (step: string) => Closeout | undefined,
  inFolder: boolean,
  say: PlaceSay | undefined,
  retry?: RetryBriefing,
  round?: RoundBriefing,
): string {
  if (retry) return retrySection(step, retry, inFolder) + retriedInRound(step, run, steps, retry, closeoutOf);
  if (round?.merge) return mergeSection(step, round.merge, round.loop, steps, say);
  return round ? roundSection(step, round, steps, closeoutOf, inFolder) : '';
}

/**
 * What a step is handed of the steps before it, in every brief but a resumed try's or round's: what each step it reads declared
 * (`## From <step>`), what each checked step it follows was told by its check (`## What <step>'s check said`), and its loop's findings.
 */
function givenSections(
  step: Workflow,
  run: Run,
  steps: readonly Workflow[],
  closeoutOf: (step: string) => Closeout | undefined,
  checked: readonly CheckHanded[] = [],
  say?: PlaceSay,
): string {
  return (
    (step.input ?? []).map((from) => fromSection(from, steps, closeoutOf)).join('\n') +
    checked.map((c) => checkHandedSection(c)).join('') +
    (step.loop
      ? merged(run.steps[step.name])
        ? mergeReviewSection(step, run, closeoutOf, say)
        : loopSection(step, run, steps, closeoutOf)
      : '')
  );
}

/**
 * The brief of a step on a remote A2A agent (`harness: a2a:<name>`): its note, what was asked for, what the runs this one waited on
 * concluded, what a person approved or accepted before it, what the steps it reads declared, and, on a try, which try it is and what a
 * person said with it.
 *
 * Nothing of this machine. The agent runs somewhere else, as its operator configured it, so a path under the store — an artifacts
 * directory, the run's inputs, a workspace — names nothing it can open, and none is said: files given with `nemia start --input` are named,
 * never located. Nor a contract: it has no `check:`, no `output:` and no closing statement's schema (`remoteRefusal` in
 * harness/harness.ts), and it is done when its Task completes. A try is a new Task, never a turn of the last one, so it is told what any
 * first try is, and then which try it is.
 */
export function remoteBrief(
  step: Workflow,
  run: Run,
  steps: readonly Workflow[],
  closeoutOf: (step: string) => Closeout | undefined = () => undefined,
  retry?: RetryBriefing,
  parents?: readonly ParentCloseout[],
): string {
  const opening = briefBody(step) ? [briefBody(step), ''] : [];
  const inputs = run.inputs?.length
    ? [
        '',
        `Files were given with it (\`nemia start --input\`): ${run.inputs.map((n) => `\`${n}\``).join(', ')}. They stay on the machine that runs this workflow and are not sent to you.`,
      ]
    : [];
  const handed = [
    ...(parents ?? []).map((p) => handedSection(p, true)),
    approvedSection(step, run, steps),
    acceptedSection(step, run, steps, closeoutOf),
  ].filter(Boolean);
  const given = (step.input ?? []).map((from) => fromSection(from, steps, closeoutOf));
  return [
    ...opening,
    '## What was asked for',
    '',
    run.brief,
    ...inputs,
    ...handed,
    ...given,
    ...(retry ? [remoteTrySection(step, retry)] : []),
  ].join('\n');
}

/**
 * `## Try <n>` of a step on a remote A2A agent: who asked for it, how the last try ended, and what a person said with it, fenced as data.
 */
function remoteTrySection(step: Workflow, r: RetryBriefing): string {
  const who =
    r.by === 'retries'
      ? `The run filed this try itself: this step declares \`retries: ${step.retries ?? 0}\`.`
      : r.by === 'signoff' || r.by === 'pause'
        ? 'The run filed this try itself.'
        : `A person asked for this try (\`nemia retry\`)${r.message !== undefined ? ', with what they said below' : ''}.`;
  return [
    '',
    `## Try ${r.try}`,
    '',
    `The last try of this step ended \`${r.status}\`. ${who} This is a new task: nothing of the last one is continued, so do the work asked for above.`,
    ...(r.message !== undefined ? ['', '## Your answer', '', ...fenced(r.message, 'text')] : []),
  ].join('\n');
}

/**
 * What a step was told, by layer: its agent and the agent's instructions, the person's custom instructions for it and the agent's own
 * skills; the rules of the factory its run was started in (`factory`), as the run froze them; the step's policy, its own note, the skills
 * its line adds (`skillLayers`) and the fence lines it tightens its agent's with (`fenceLines`); and the task, what its brief told it
 * after them. Null where the step has none. `via` says where the agent's words, the person's and the factory's went: the session's prompt
 * (`prompt`), or the head of its brief (`brief`). `folderFiles` says whether the session reads the files of the folder it works in, the
 * third layer, which Nemia composes nothing of: false for a step on a remote agent, which works wherever its operator put it.
 */
export type ToldLayers = {
  agent: string | null;
  instructions: string | null;
  custom: string | null;
  factory: string | null;
  agentSkills: string[];
  policy: string;
  addedSkills: string[];
  fence: Array<{ key: string; value: string }>;
  folderFiles: boolean;
  task: string | null;
  via: 'prompt' | 'brief';
};

/**
 * The fence lines step `step`'s own file sets over its agent's (`StepAgent.keys`), each as resolved, a list joined with `, `, in the
 * order of `FENCE_KEYS`: none for a step with no agent, whose fence is no layer over another's. Its `disallowedTools:` is its own rules
 * alone (`ownDenies`), which add to its agent's, and none where it only repeated them.
 */
function fenceLines(step: Workflow): ToldLayers['fence'] {
  const own = step.agent?.keys ?? [];
  return FENCE_KEYS.flatMap((key) => {
    const value = key === 'disallowedTools' && step[key] !== undefined ? ownDenies(step) : step[key];
    if (!own.includes(key) || value === undefined || (key === 'disallowedTools' && !value.length)) return [];
    return [{ key, value: Array.isArray(value) ? value.join(', ') : value }];
  });
}

/**
 * What the frozen `step` was told, by layer (`ToldLayers`), its task cut from `brief`, the brief it was filed with or would be: after the
 * precedence (`PRECEDENCE`) and its own note where its agent is rendered (`rendersAgent`), after the precedence and its instructions,
 * custom instructions, factory's rules and note, each under its heading (`headedLayers`), where they head the brief — a step on another
 * harness or on `resume:`, or one filed with its rendered folder gone. A brief filed before either the precedence or the headings was
 * written opens with the same layers plainly joined, and cuts on them too. A brief that opens with none of them, then a blank line — a
 * resumed try's, or one of a record frozen without its instructions — is the task whole, never cut at a guess; a null brief is no task.
 */
export function toldLayers(step: Workflow, brief: string | null): ToldLayers {
  const agent = step.agent;
  const policy = ownNote(step);
  const instructions = agent?.instructions ?? null;
  const custom = agent?.customInstructions ?? null;
  const factory = agent?.factoryRules ?? null;
  const skills = skillLayers(step);
  const opened = brief === null ? undefined : openingOf(step, policy, brief);
  return {
    agent: agent?.name ?? null,
    instructions,
    custom,
    factory,
    agentSkills: skills.agent,
    policy,
    addedSkills: skills.added,
    fence: fenceLines(step),
    folderFiles: !isRemoteHarness(step.harness),
    task: brief === null || !opened ? brief : brief.slice(opened.head.length),
    via: opened?.via ?? (rendersAgent(step) ? 'prompt' : 'brief'),
  };
}

/**
 * The head of `brief` the task starts after, and where the layers above it went (`ToldLayers.via`), or undefined where the brief opens
 * with none of the heads a brief of `step` has ever opened with. Every candidate is tried, the longest first — the precedence
 * (`PRECEDENCE`) above each of them, as every brief composed since it was written opens; then each of them alone, as a brief filed before
 * it does — so a head that is another's prefix never cuts a brief short.
 *
 * @param policy The step's own note (`ownNote`), the opening of a rendered step's brief, whose layers above went into its prompt.
 */
function openingOf(step: Workflow, policy: string, brief: string): { via: ToldLayers['via']; head: string } | undefined {
  const agent = step.agent;
  const layers: ReadonlyArray<readonly [ComposedLayer, string | undefined]> = [
    ['instructions', agent?.instructions],
    ['custom', agent?.customInstructions],
    ['factory', agent?.factoryRules],
    ['policy', policy],
  ];
  const bodies: Array<{ via: ToldLayers['via']; opening: string }> = [
    ...(rendersAgent(step) ? [{ via: 'prompt' as const, opening: policy }] : []),
    ...(agent ? [{ via: 'brief' as const, opening: headedLayers(layers) }] : []),
    {
      via: 'brief',
      opening: layers
        .map(([, words]) => words)
        .filter(Boolean)
        .join('\n\n'),
    },
  ];
  const heads = [
    ...bodies.map(({ via, opening }) => ({ via, head: `${PRECEDENCE}\n\n${opening ? `${opening}\n\n` : ''}` })),
    ...bodies.filter(({ opening }) => opening).map(({ via, opening }) => ({ via, head: `${opening}\n\n` })),
  ];
  return heads.find(({ head }) => brief.startsWith(head));
}
