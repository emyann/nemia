/**
 * A step as the tick tells it (`toldOf`): the step its brief is composed for, the harness's own arguments it is filed with (`ownOf`), and
 * what its place says to it (`placeTold`). A controller: it reads the run's rendered agent folder, the skills where a start of
 * the run's folder finds them, and the run's place.
 */
import type { ClaudeFlags, CodexArgs } from '../runtime-client.ts';
import type { Run } from '../record/record.ts';
import type { Workflow } from '../step/step.ts';
import { realRepoOf } from '../workspace/worktree.store.ts';
import { agentFilesDir, renderedIn, skillsAgain } from '../agents/agents.store.ts';
import { placesOf } from '../folder/lookup.store.ts';
import { skillsFor } from '../folder/folder.store.ts';
import { renderedFlags, rendersAgent, unrendered } from '../agents/agents.ts';
import type { LandingWords } from '../check/check.ts';
import { landingWords, placeSay } from '../place/landing.store.ts';
import type { PlaceSay } from '../place/place.ts';
import { composeBrief } from '../brief/brief.ts';

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
 * What `step` of `run` is told and denied by its place (`landingWords`, `placeSay`), read from `placeDir` or the run's own place
 * (`placeDirOf`); or undefined, with a note for `step` on `notes` saying why its place gives none (`placeDirOf` or `readPlaceJson`
 * refusing): the step is then not filed, and the pass goes on.
 */
export function placeTold(run: Run, step: Workflow, notes: string[], placeDir?: string): PlaceTold | undefined {
  try {
    return { words: landingWords(run, step, placeDir), say: placeSay(run, placeDir) };
  } catch (err) {
    notes.push(`${step.name}: not filed, for its place gives it no words: ${(err as Error).message}`);
    return undefined;
  }
}

/**
 * What `step` of `run`, not yet filed, would be told now from `steps` (`composeBrief`), with what its place says to it (`placeTold`):
 * what the board shows of a step to come. Where the place gives no words, the brief sends the step to its place's skill.
 */
export function briefNow(step: Workflow, run: Run, steps: readonly Workflow[]): string {
  const told = placeTold(run, step, []) ?? {};
  const none = [undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined] as const;
  return composeBrief(step, run, steps, ...none, told);
}
