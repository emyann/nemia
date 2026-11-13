/**
 * What `nemia start` prints of a run it started, worded here off what the api answers (`objects`' `RunStarted`, the run's facts in
 * `run`): its steps, the inbox card it came from, its factory and a `--repo` that only found it, the folders and volumes it mounts, where
 * it works, where it copied its inputs and its workflow's files, what it waits on and reads as context, where it waits on a person, its
 * models and labels, how to start it; the store's pause while one stands, the lines of its folder on a former spelling, and a card's
 * retired `repo:` not read. An api that says nothing of the run is said in one line: the run started, and what reads it.
 */
import type { RunStarted, RunStartedFacts } from 'objects';
import { pausedWords } from '../../watch/lines.ts';

/** The steps of the run and their agents: `<id>  3 step(s): implement (implementer) → review → …`. */
const headLine = (id: string, { steps }: RunStartedFacts): string =>
  `${id}  ${steps.length} step(s): ${steps.map((s) => (s.agent !== undefined ? `${s.name} (${s.agent})` : s.name)).join(' → ')}`;

/** Where an inbox card's run came from, the card kept in the inbox as started, and why its `queued:` line is still on it. */
const fromLines = ({ id, card, queueLeft }: RunStarted, { from }: RunStartedFacts): string[] =>
  card === undefined
    ? []
    : [
        `from inbox card ${from ?? card} — kept in the inbox, listed as started`,
        ...(queueLeft !== undefined
          ? [
              `${queueLeft}: the tick does not start it again while ${id}'s record stands; take the line off with nemia inbox queue ${card} --off`,
            ]
          : []),
      ];

/** The run's factory, the repository it is on, and a `--repo` that only found the factory, its wiring placing the run on another. */
const factoryLines = ({ repoFoundFactory }: RunStarted, { factory, repo, repository, workflow }: RunStartedFacts): string[] => [
  ...(factory !== undefined ? [`factory: ${factory}${repository ? `, on ${repo}` : ''}`] : []),
  ...(repoFoundFactory !== undefined
    ? [`--repo ${repoFoundFactory} only found the factory ${factory ?? ''}: ${workflow} works on ${repo}`]
    : []),
];

/** The folders of its factory a run mounts, read-only but where written, and those left out, being no directory. */
const mountLines = (notMounted: readonly string[], { mounts = [], writable = [] }: RunStartedFacts): string[] => [
  ...(mounts.length
    ? [`mounts: ${mounts.join(', ')} — read-only, for every local step${writable.length ? ' but where written below' : ''}`]
    : []),
  ...writable.map((w) => `writable: ${w.path} — for ${w.steps.join(', ')} alone`),
  ...(notMounted.length
    ? [`not mounted: ${notMounted.join(', ')} — of the factory's repositories, and no directory now; start again once it is there`]
    : []),
];

/** The factory's volumes a run mounts, read-only, then each writable one with the steps that write it; then those left out. */
const volumeLines = (notVolumes: readonly string[], { volumes = [], writableVolumes = [] }: RunStartedFacts): string[] => [
  ...(volumes.length ? [`volumes: ${volumes.join(', ')} — read-only, for every local step`] : []),
  ...writableVolumes.map(
    (w) =>
      `volume: ${w.path} — ${w.steps.length ? `writable for ${w.steps.join(', ')}, read-only for every other local step` : 'writable, and read-only for every step here, since none writes'}; not the run's workspace: nothing commits or lands what a step writes there`,
  ),
  ...(notVolumes.length
    ? [`not mounted: ${notVolumes.join(', ')} — of the factory's volumes, and no directory now; start again once it is there`]
    : []),
];

/** Where the run works, and where it copied its inputs, the cards it is handed, and its workflow's and carried files. */
const placeLines = ({ workspace, repository, inputs, cards, workflowFiles, carriedFiles }: RunStartedFacts): string[] => [
  `workspace: ${workspace}${repository ? '' : ' — a folder per step, made as each is filed, with no git repository'}`,
  ...(inputs !== undefined ? [`inputs: ${inputs.names.join(', ')} — copied into ${inputs.dir}`] : []),
  ...(cards !== undefined ? [`cards: ${cards.names.join(', ')} — copied into ${cards.dir}`] : []),
  ...(workflowFiles !== undefined ? [`workflow files: copied into ${workflowFiles}`] : []),
  ...(carriedFiles !== undefined ? [`carried files: copied into ${carriedFiles}`] : []),
];

/** What the run waits on to land, and each run it reads as context, landed or still in flight. */
const waitLines = (landed: readonly string[], { after = [], branch, context = [] }: RunStartedFacts): string[] => [
  ...(after.length ? [`waits on: ${after.join(', ')} — nothing is filed until nemia decide says each has landed on ${branch}`] : []),
  ...context.map((id) =>
    landed.includes(id)
      ? `reads: ${id} — handed what it concluded, as context; not waited on`
      : `reads: ${id}, still in flight — what it has when this run's steps are filed is handed, not landed, not judged`,
  ),
];

/** The steps that wait on a person: each gated, and the endings a person approves before they are filed. */
const gateLines = (id: string, { gated = [], ends = [] }: RunStartedFacts): string[] => [
  ...(gated.length
    ? [
        `gated at: ${gated.join(', ')} — nothing after ${gated.length > 1 ? 'each' : 'it'} is filed until nemia approve ${id} <step>, once it has signed off`,
      ]
    : []),
  ...(ends.length
    ? [
        `ends at: ${ends.join(', ')} — nothing of ${ends.length > 1 ? 'them' : 'it'} runs until nemia approve ${id} ${ends[0] ?? ''}, which is what files ${ends.length > 1 ? 'them' : 'it'}`,
      ]
    : []),
];

/** The models the run names for its steps, for it alone; its labels, by key; and each label it did not inherit, with how to set it. */
const ownLines = (id: string, { models, labels, labelsLeftOut = [] }: RunStartedFacts): string[] => [
  ...(models !== undefined
    ? [
        `models: ${Object.entries(models)
          .map(([step, model]) => `${step}=${model}`)
          .join(', ')} — for this run alone; its other steps run on their agents'`,
      ]
    : []),
  ...(labels !== undefined
    ? [
        `labels: ${Object.keys(labels)
          .sort()
          .map((key) => `${key}=${labels[key] ?? ''}`)
          .join(',')}`,
      ]
    : []),
  ...labelsLeftOut.map(
    ({ key, values }) =>
      `label ${key} not inherited: ${values.map((v) => `${v.run} has ${key}=${v.value}`).join(', ')} — set it with nemia label run ${id} ${key}=<value>`,
  ),
];

/** A card's own `repo:`, which is retired and was not read. */
export const ignoredRepoLine = (repo: string): string =>
  `the card's repo: ${repo} is retired and was not read — its factory places the run (nemia factory attach <factory> <workflow> --repo <name>); delete the line`;

/** The line of a start whose api said nothing of the run: it started, and what reads it. */
const bareLine = (id: string): string =>
  `${id}  started on the daemon — nemia show ${id} reads it, and the daemon's next pass files its first step`;

/** What `nemia start` prints of the run `answer` says was started: its facts in words, then what stands beside it. */
export function startedLines(answer: RunStarted, now: Date = new Date()): string[] {
  const { id, run } = answer;
  if (run === undefined) return [bareLine(id)];
  const paused = answer.paused === undefined ? null : pausedWords(answer.paused, now);
  return [
    headLine(id, run),
    ...fromLines(answer, run),
    ...factoryLines(answer, run),
    ...mountLines(answer.notMounted ?? [], run),
    ...volumeLines(answer.notVolumes ?? [], run),
    ...(run.settings?.length
      ? [`harness settings: ${run.settings.join(', ')} — for every step on their harness, beneath its agent's own`]
      : []),
    ...placeLines(run),
    ...waitLines(answer.landed ?? [], run),
    ...gateLines(id, run),
    ...ownLines(id, run),
    `run 'nemia tick' (or 'nemia up') to start it`,
    ...(paused !== null ? [`${paused}: nothing of this run is filed until then`] : []),
    ...(answer.hints ?? []),
    ...(answer.ignoredRepo !== undefined ? [ignoredRepoLine(answer.ignoredRepo)] : []),
  ];
}
