/**
 * A step with an agent, on the builder, read by layer as S5's fold reads a run's: what its agent brings — the agent's instructions with its
 * skills, and your custom instructions for it, read-only here and written on the agent's page — then the rules of the factory the
 * listing was read in, where it keeps some, and the step's policy, what the step's own file adds over them. Each layer is labelled as
 * `Told` labels it.
 */
import type { ReactNode } from 'react';
import type { StepLayers } from '../lib/api';
import { AgentLink } from './AgentParts';
import { Layer, Skills, toldBefore, Words } from './Told';

const LINE = 'text-[11px] leading-snug text-muted-foreground';

/**
 * What agent `agent` brings a step, from the listing's `layers`: its instructions, folded, with its skills, your custom instructions for
 * it, or none, and the factory's rules a run started there is told after them, where the listing read some. Where the listing read
 * another agent — the draft moved the step to `agent` since — one line says a save reads them.
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
      {layers.factory !== null && (
        <Layer name="factory" title="The factory's rules">
          <Words text={layers.factory} />
          <p className={LINE}>Written on the factory's Settings: every agent hired into it is told them.</p>
        </Layer>
      )}
    </>
  );
}

/**
 * The step's policy over agent `agent`: its own words (`note`), then the keys its file sets as its policy (`children`), which may only
 * tighten the agent's fence. `layers` says whether there are custom instructions and factory's rules it is told after (`toldBefore`);
 * where it was read for another agent, only that any are told before it.
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
  const before =
    layers?.agent !== agent ? `${agent}'s instructions, and any custom instructions you wrote for it` : toldBefore(agent, layers);
  return (
    <Layer name="policy" title="The step's policy">
      <div className="space-y-3">
        <div className="space-y-1">
          {note}
          <p data-agent-note className={LINE}>
            Told after {before}; where they conflict, these words win.
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
