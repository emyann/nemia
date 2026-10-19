/**
 * What a run's repository grants the sessions of its steps: `repoAllows` reads the allow rules the repository's own harness settings
 * give a session started there (`projectAllows`), and carries beside them the sentence about the harness's trust of that repository,
 * asked only where a judgement refuses (`untrustedNote`). Read by `nemia start` and once a pass, and judged by `unallowedRefusal`.
 *
 * A controller: it reaches the runtime through the client (`runtime-client.ts`), as the trust beside it does.
 */
import { folderTrust, projectAllows } from '../runtime-client.ts';
import { DEFAULT_HARNESS } from '../harness/harness.ts';
import { untrustedNote } from './trust.ts';

/**
 * What the allow rules of a run's repository say to the judgement that a step's tools are callable: the rules themselves, and the
 * sentence about the harness's trust of that repository, a thunk so only the refusing road reads the harness's own file.
 */
export type Allows = { readonly rules: readonly string[]; readonly untrusted: () => string | undefined };

/** What a run that works on no repository grants: no rule, and nothing to say about a trust. */
export const NO_ALLOWS: Allows = { rules: [], untrusted: () => undefined };

/**
 * The allow rules the repository `repo` grants a session started in it, for the harness a step runs on unless it names another, with
 * its trust said where the harness does not have it (`untrustedNote`, read only when the thunk is asked). `NO_ALLOWS` for a run that
 * works on no repository, whose steps work in folders the run makes. `factory` names the factory the run is started in, whose verb
 * asks the trust again.
 */
export function repoAllows(repo: string | undefined, factory?: string): Allows {
  if (repo === undefined) return NO_ALLOWS;
  return {
    rules: projectAllows(DEFAULT_HARNESS, repo) ?? [],
    untrusted: () => untrustedNote(folderTrust(DEFAULT_HARNESS, repo, undefined, repo), factory),
  };
}
