import { CutTag } from '@/components/look';
import { Tag } from '@/components/ui/ds';
import type { RunDetail } from '@/lib/api';

/**
 * One kind the run is behind on, in words: `agent coder: rev 5, ledger at 6` for what a filing after this would take, and
 * `agent coder: implement ran on rev 5, ledger at 6` for a step that has already been filed on the older one.
 *
 * The ledger, not the world: the api reads these numbers off the revisions ledger (`kindsOf`), which holds a number per content
 * anything resolved — so a kind reverted to the content the run pins is still a number behind the ledger's last, and the refresh verb
 * the api prints (`run.refresh`) answers that there is nothing to take. A resolve is the folder and a digest of every agent and skill
 * file it names, which a page's read does not pay.
 */
export const behindWords = (k: NonNullable<RunDetail['kinds']>[number]): string =>
  `${k.kind} ${k.name}: ${k.step ? `${k.step} ran on rev ${k.pinned}` : `rev ${k.pinned}`}, ledger at ${k.now}`;

/**
 * The kinds the run resolved that the ledger has gone past — its workflow folder, an agent, a skill, the factory's rules — one tag per
 * kind, with the verb to type to take them. A note, so at rest: nothing of it waits on a person, and a run on the newest of every kind
 * draws nothing. The tag is the look's (`CutTag`), as every tag on the board is.
 */
export function KindsBehind({ run }: { run: RunDetail }) {
  const kinds = run.kinds;
  if (kinds.length === 0) return null;
  return (
    <section
      aria-label="The revisions this run is behind on"
      data-kinds-behind={kinds.length}
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded border border-outline px-3 py-2 text-body-medium text-foreground"
    >
      <p className="text-muted-foreground">
        The revisions ledger has gone past what it resolved.{' '}
        {run.refresh && <span className="font-mono text-body-medium">{run.refresh}</span>} takes the new revisions for every filing after
        it.
      </p>
      <ul className="flex flex-wrap items-center gap-1.5">
        {kinds.map((k) => (
          <li key={`${k.kind}/${k.name}/${k.step ?? ''}`}>
            <CutTag>
              <Tag data-kind-behind={k.kind} variant="tonal" color="neutral">
                {behindWords(k)}
              </Tag>
            </CutTag>
          </li>
        ))}
      </ul>
    </section>
  );
}
