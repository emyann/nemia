/**
 * What a step was told, folded away: it is long, and it does not change while you look at the step. Where its run froze its layers,
 * each is drawn apart, as the run froze it when it started — the agent's instructions with its own skills, the person's custom
 * instructions, the step's policy with the skills its line adds and the fence lines it tightens, and the task; a run that froze none
 * shows its brief whole. At a gate, the step's policy is drawn open on its own (`StepPolicy`), the layer a person judges the step by.
 */
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import type { StepLayers } from '../lib/api';

/**
 * The fold: `told`, the brief whole, drawn only where `layers` is null; `filed` says whether it was told or would be told now. Nothing
 * where there is neither.
 */
export function Told({ told, layers, filed }: { told: string | null; layers: StepLayers | null; filed: boolean }) {
  if (!told && !layers) return null;
  return (
    <details className="text-sm" data-told>
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
        {filed ? 'What it was told' : 'What it would be told now'}
      </summary>
      {layers ? <Layers layers={layers} /> : <Words text={told ?? ''} />}
    </details>
  );
}

/** The four layers in the order the session reads them, and where the agent's words and the person's went. */
function Layers({ layers }: { layers: StepLayers }) {
  return (
    <div className="mt-2 flex flex-col gap-3">
      {layers.agent === null ? (
        <p className="text-xs text-muted-foreground">No agent: its own words are all it was told, before the task.</p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            The agent's instructions and yours were frozen at the start of the run and given{' '}
            {layers.via === 'prompt' ? "in the session's system prompt" : 'at the head of its brief'}.
          </p>
          <Layer name="instructions" title={`Instructions — ${layers.agent}'s`}>
            <Words text={layers.instructions} />
            <Skills word="Its skills:" skills={layers.agentSkills} />
          </Layer>
          <Layer name="custom" title="Your custom instructions">
            <Words text={layers.custom} />
          </Layer>
        </>
      )}
      <Layer name="policy" title="The step's policy">
        <Words text={layers.policy || null} />
        <Skills word="Adds the skills:" skills={layers.addedSkills} />
        <Fence agent={layers.agent} fence={layers.fence} />
      </Layer>
      <Layer name="task" title="The task">
        <Words text={layers.task} none="Not composed: the run could not say it" />
      </Layer>
    </div>
  );
}

/**
 * The step's policy, drawn open at its gate: its own words, the skills it adds and the fence lines it tightens, then what it was told
 * before — its agent's instructions, and the person's custom instructions where there are any — which win where they conflict, and where
 * every layer is. Nothing for a step with no agent, whose own words are all it was told and are drawn as its body.
 */
export function StepPolicy({ layers }: { layers: StepLayers }) {
  const { agent } = layers;
  if (agent === null) return null;
  const before = layers.custom === null ? `${agent}'s instructions` : `${agent}'s instructions and your custom instructions`;
  return (
    <div data-gate-policy className="flex flex-col gap-2 rounded border border-neutral-200 p-3 dark:border-neutral-800">
      <Layer name="policy" title="The step's policy">
        <Words text={layers.policy || null} none={`No words of its own: ${agent}'s instructions are all it was told`} />
        <Skills word="Adds the skills:" skills={layers.addedSkills} />
        <Fence agent={agent} fence={layers.fence} />
      </Layer>
      <p className="text-xs text-muted-foreground">
        Told after {before}; where they conflict, this wins. Every layer is under “What it was told”.
      </p>
    </div>
  );
}

/** One layer, under its title. */
export function Layer({ name, title, children }: { name: string; title: string; children: ReactNode }) {
  return (
    <section data-layer={name} className="flex flex-col gap-1">
      <h4 className="text-xs font-medium text-muted-foreground">{title}</h4>
      {children}
    </section>
  );
}

/** A layer's words as written, or `none` where the run froze none. */
export function Words({ text, none = 'None frozen on this run' }: { text: string | null; none?: string }) {
  if (text === null) return <p className="text-xs text-muted-foreground italic">{none}</p>;
  return <pre className="overflow-x-auto rounded bg-muted p-3 text-xs whitespace-pre-wrap">{text}</pre>;
}

/** The skills a layer gives, after `word`; nothing where it gives none. */
export function Skills({ word, skills }: { word: string; skills: string[] }) {
  if (!skills.length) return null;
  return (
    <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
      {word}{' '}
      {skills.map((skill) => (
        <Badge key={skill} variant="outline" data-skill={skill}>
          {skill}
        </Badge>
      ))}
    </p>
  );
}

/** The fence lines a step's own file tightens agent `agent`'s with, each as its line writes it; nothing where it sets none. */
function Fence({ agent, fence }: { agent: string | null; fence: StepLayers['fence'] }) {
  if (!fence.length) return null;
  return (
    <div className="flex flex-col gap-1 text-xs text-muted-foreground">
      <p>Tightens {agent}'s fence:</p>
      <ul className="flex flex-col gap-1">
        {fence.map(({ key, value }) => (
          <li key={key} data-fence={key}>
            <code className="rounded bg-muted px-1 py-0.5 font-mono break-all text-foreground">
              {key}: {value}
            </code>
          </li>
        ))}
      </ul>
    </div>
  );
}
