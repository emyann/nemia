/**
 * `handoff`: commit whatever a step left uncommitted in its workspace, so the workspace it hands on is the workspace it made; the tick
 * asks it of every finished step of a repository run. Takes `{ workspace, step, why }`, `why` added to the commit's message; answers
 * `{ commit }`, or `{ commit: null }` when nothing is uncommitted, so it may run on every pass. The repository's hooks and signing are
 * honoured: refuses, in git's words, when git will not commit — a hook that refused it, a signature that failed, no repository there.
 */
import { failedWords, git, isDirectory, refused, type Asking, type Reply } from '../git.ts';
import type { PlaceRequests } from '../../../src/place/place.ts';

/** The verb's body. */
export function* handoff({ workspace, step, why }: PlaceRequests['handoff']): Asking<Reply<'handoff'>> {
  if (!isDirectory(workspace)) return refused(`${workspace} is not a directory, so nothing of ${step} is there to hand off`);
  try {
    if (!(yield* git(workspace, ['status', '--porcelain']))) return { commit: null };
    yield* git(workspace, ['add', '-A']);
    yield* git(workspace, [
      '-c',
      'user.email=wf@local',
      '-c',
      'user.name=wf',
      'commit',
      '-m',
      `${step}: hand off what was left uncommitted${why}`,
    ]);
    return { commit: yield* git(workspace, ['rev-parse', 'HEAD']) };
  } catch (err) {
    return refused(failedWords(err));
  }
}
