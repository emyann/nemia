/**
 * A step with an agent, on the builder, read by layer as S5's fold reads a run's: what its agent brings — the agent's instructions with its
 * skills, and your custom instructions for it, read-only here and written on the agent's page — then the step's policy, what the step's
 * own file adds over them. Each layer is labelled as `Told` labels it.
 */
import type { ReactNode } from 'react';
import type { StepLayers } from '../lib/api';
import { AgentLink } from './AgentParts';
import { Layer, Skills, Words } from './Told';

const LINE = 'text-[11px] leading-snug text-neutral-500 dark:text-neutral-400';

/**
 * What agent `agent` brings a step, from the listing's `layers`: its instructions, folded, with its skills, and your custom instructions
 * for it, or none. Where the listing read another agent — the draft moved the step to `agent` since — one line says a save reads them.
 */
export function AgentLayers({ agent, layers }: { agent: string; layers: StepLayers | null }) {
  if (layers?.agent !== agent)
    return (
      <p data-agent-layers-unread className={LINE}>
        Save to read {agent}'s instructions here.
      </p>
    );
  return (
    <>
      <Layer name="instructions" title={`Instructions — ${agent}'s`}>
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Read them</summary>
          <Words text={layers.instructions} none={`None: agents/${agent}.md says nothing`} />
        </details>
        <Skills word="Its skills:" skills={layers.agentSkills} />
        <p className={LINE}>
          Written in <AgentLink from="yours" name={agent} />
          's file, <span className="font-mono">agents/{agent}.md</span>.
        </p>
      </Layer>
      <Layer name="custom" title="Your custom instructions">
        {layers.custom === null ? (
          <p className={LINE}>
            None. Write them on <AgentLink from="yours" name={agent} />
            's page.
          </p>
        ) : (
          <Words text={layers.custom} />
        )}
      </Layer>
    </>
  );
}

/**
 * The step's policy over agent `agent`: its own words (`note`), then the keys its file sets as its policy (`children`), which may only
 * tighten the agent's fence. `layers` says whether there are custom instructions it is told after; where it was read for another agent,
 * both are named.
 */
export function PolicyLayer({
  agent,
  layers,
  note,
  children,
}: {
  agent: string;
  layers: StepLayers | null;
  note: ReactNode;
  children: ReactNode;
}) {
  const custom = layers?.agent !== agent || layers.custom !== null;
  return (
    <Layer name="policy" title="The step's policy">
      <div className="space-y-3">
        <div className="space-y-1">
          {note}
          <p data-agent-note className={LINE}>
            Told after {agent}'s instructions{custom ? ' and your custom instructions' : ''}; where they conflict, these words win.
          </p>
        </div>
        <p data-fence-note className={LINE}>
          May only tighten {agent}'s fence: a loosening is refused on save.
        </p>
        {children}
      </div>
    </Layer>
  );
}
