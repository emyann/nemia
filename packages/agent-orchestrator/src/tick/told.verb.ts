/**
 * A step as the tick tells it (`toldOf`): the step its brief is composed for, the harness's own arguments it is filed with (`ownOf`), and
 * what its place says to it (`placeTold`); the files its last closeout lacked (`lacksTold`), and which files the steps before it named
 * are there (`foldersTold`). A controller: it reads the run's rendered agent folder, the skills where a start of
 * the run's folder finds them, and the run's place.
 */
import path from 'node:path';
import type { ClaudeFlags, CodexArgs } from '../runtime-client.ts';
import { lackedOf, type Run, type StepRecord } from '../record/record.ts';
import type { Closeout } from '../closeout/index.ts';
import { filedFolders, type FiledFolders } from '../filed/filed.ts';
import { artifactFiles, filesHanded, holdsCloseout } from '../artifacts/artifacts.store.ts';
import { lackLines } from '../artifacts/artifacts.ts';
import type { RetryBriefing } from '../brief/index.ts';
import type { Workflow } from '../step/step.ts';
import { realRepoOf } from '../workspace/worktree.store.ts';
import { agentFilesDir, renderedIn, skillsAgain } from '../agents/agents.store.ts';
import { placesOf } from '../folder/lookup.store.ts';
import { skillsFor } from '../skills/read.store.ts';
import { renderedFlags, rendersAgent, unrendered } from '../agents/agents.ts';
import type { LandingWords } from '../check/check.ts';
import { landingWords, placeSay } from '../place/landing.store.ts';
import type { Place } from '../place/place.store.ts';
import type { PlaceSay } from '../place/place.ts';
import { composeBrief } from '../brief/index.ts';
import { artifactsDir, inputsDir } from '../record/record.store.ts';
import { DEFAULT_FACTORY } from '../factory/factory.ts';
import { factoryServers } from '../servers/servers.store.ts';
import type { FactoryServers } from '../servers/servers.ts';
import { inboxDir } from '../record/files.store.ts';

/**
 * A step as the tick tells it and files it: with its agent's instructions in Claude Code's prompt and its skills in a plugin, where
 * `nemia start` rendered them (`rendersAgent`, `renderedFlags`); a step it does not render — a codex step, a record that gives no agent —
 * is filed with no flags and told everything in its brief. Where the rendered folder is not there as its flags name it (`unrendered`,
 * `renderedIn`) — gone, or rendered under the plugin's former name — a flag naming a file that is not there would end the session at its
 * start, so its brief tells it its skills whole, read again from where a start of this run's folder finds them (`skillsAgain`). Bridged to
 * claude.ai, where anyone signed in can drive it, only when the step says `remote: true`, never by default: as Claude Code's own flag,
 * first among its others (`claude.remoteControl`). A codex step of a repository run is filed with its repository's real path as the
 * directory Codex's trust extends from (`codex.trustFrom`), so a `--repo` given through a symlink names what the operator's Codex config
 * lists; a folder run has no repository, and a step on another harness takes no Codex arguments, so either is filed with none, as is one
 * whose repository is no longer there to resolve (`realRepoOf`). Both are the harness's own arguments (`own`), which the first filing, a
 * try and a round each spread into its `config`.
 */
export function toldOf(run: Run, step: Workflow): { step: Workflow; own: { claude?: ClaudeFlags; codex?: CodexArgs } } {
  const dir = agentFilesDir(run, step.name);
  const told =
    rendersAgent(step) && !renderedIn(dir, step)
      ? unrendered(step, step.agent?.skills?.length ? skillsAgain(step, skillsFor(run.workflowDir, placesOf(run.repo))) : [])
      : step;
  return { step: told, own: ownOf(told, renderedFlags(told, dir), () => realRepoOf(run)) };
}

/**
 * The harness's own arguments a step is filed with (`toldOf`), off the flags its agent rendered to and its repository's real path, which
 * is asked only of a step whose harness takes it. Pure but for `repoOf`.
 */
export const ownOf = (step: Pick<Workflow, 'harness' | 'remote'>, rendered: ClaudeFlags | undefined, repoOf: () => string | undefined) => {
  const repo = step.harness === 'codex' ? repoOf() : undefined;
  return {
    claude: step.remote ? { remoteControl: true as const, ...rendered } : rendered,
    ...(repo === undefined ? {} : { codex: { trustFrom: repo } }),
  };
};

/**
 * What a step's place says to it (`placeTold`): how it lands, undefined for a step that does not land on its check (`words`), and its
 * commands (`say`), undefined for a folder run's step.
 */
export type PlaceTold = { readonly words: LandingWords | undefined; readonly say: PlaceSay | undefined };

/** A step as a try files it (`toldOf`), with what its place says to it (`PlaceTold`). */
export type Told = ReturnType<typeof toldOf> & PlaceTold;

/**
 * What `step` of `run` is told and denied by `place` (`landingWords`, `placeSay`), its branches named off `heads` where given.
 */
export function placeTold(run: Run, step: Workflow, place: Place, heads?: Readonly<Record<string, string>>): PlaceTold {
  return { words: landingWords(run, step, place, heads), say: placeSay(run, place) };
}

/**
 * Where a step of `run` is filed its folders from (`filedFolders`, `filedConfig`): the run's artifacts folder, the store's inbox, and the
 * run's inputs folder (`inputsDir`) only when its record names an input, so a run given none is filed and told as before.
 */
export const filedAt = (
  run: Pick<Run, 'id' | 'inputs' | 'factory'>,
): { runArtifacts: string; inbox: string; inputs?: string; servers: FactoryServers } => ({
  runArtifacts: path.dirname(artifactsDir(run, 'step')),
  inbox: inboxDir(),
  ...(run.inputs?.length ? { inputs: inputsDir(run) } : {}),
  servers: recordedServers(run.factory),
});

/**
 * The MCP servers the factory `factory` records, `{}` for one that records none — and `{}`, silently here, for a record that does not
 * read: this is spread into every filing, and a throw would be a defect that stops the whole pass over one bad file. The pass refuses
 * the step itself and says why (`fileReady`), where a note can carry the file and the command to type, and `nemia factory servers`
 * refuses it loudly to the person who asks.
 */
const recordedServers = (factory: string | undefined): FactoryServers => {
  try {
    return factoryServers(factory ?? DEFAULT_FACTORY);
  } catch {
    return {};
  }
};

/**
 * What `step` of `run`, not yet filed, would be told now from `steps` (`composeBrief`), with what its place says to it (`placeTold`):
 * what the board shows of a step to come. Where the place gives no words, the brief sends the step to its place's skill.
 */
export function briefNow(step: Workflow, run: Run, steps: readonly Workflow[], place: Place): string {
  const told = placeTold(run, step, place);
  const none = [undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined] as const;
  return composeBrief(step, run, steps, ...none, told);
}

/**
 * The files the closeout of the try that ended named that the run did not have (`lackedOf`), as its next try is told them: a line each,
 * with a near name off what the step's files directory holds now (`lackLines`). Nothing for a try that lacked none.
 */
export const lacksTold = (run: Run, name: string, record: StepRecord): Pick<RetryBriefing, 'lacks'> => {
  const lacked = lackedOf(record);
  if (!lacked.length) return {};
  const there = artifactFiles(run, name).map((file) => file.path);
  return { lacks: lackLines(lacked, artifactsDir(run, name), there) };
};

/**
 * The folders a step is filed with and its brief names (`filedFolders`), those a step before it handed over that hold its
 * `closeout.json` (`holdsCloseout`), which the brief sends the step to, and for each other, which of the files that step's closeout named
 * are there now (`filesHanded`): the brief lists those, and hands on no name with no file.
 */
export const foldersTold = (
  run: Run,
  reads: { steps: readonly Workflow[]; signedOff: (step: string) => Closeout | undefined },
  step: Workflow,
): FiledFolders => {
  const folders = filedFolders(step, reads.steps, filedAt(run));
  const closeouts = folders.handed.filter((m) => holdsCloseout(run, path.basename(m.path))).map((m) => m.path);
  const named = folders.handed
    .filter((m) => !closeouts.includes(m.path))
    .map((m) => {
      const from = path.basename(m.path);
      return [m.path, filesHanded(run, from, reads.signedOff(from))] as const;
    });
  return { ...folders, named: Object.fromEntries(named), closeouts };
};
