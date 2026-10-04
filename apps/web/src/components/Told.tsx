/**
 * What a step was told, folded away: it is long, and it does not change while you look at the step. Where its run froze its layers,
 * each is drawn apart, as the run froze it when it started — the agent's instructions with its own skills, the person's custom
 * instructions, the step's policy with the skills its line adds, and the task; a run that froze none shows its brief whole.
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
      </Layer>
      <Layer name="task" title="The task">
        <Words text={layers.task} none="Not composed: the run could not say it" />
      </Layer>
    </div>
  );
}

/** One layer, under its title. */
function Layer({ name, title, children }: { name: string; title: string; children: ReactNode }) {
  return (
    <section data-layer={name} className="flex flex-col gap-1">
      <h4 className="text-xs font-medium text-muted-foreground">{title}</h4>
      {children}
    </section>
  );
}

/** A layer's words as written, or `none` where the run froze none. */
function Words({ text, none = 'None frozen on this run' }: { text: string | null; none?: string }) {
  if (text === null) return <p className="text-xs text-muted-foreground italic">{none}</p>;
  return <pre className="overflow-x-auto rounded bg-muted p-3 text-xs whitespace-pre-wrap">{text}</pre>;
}

/** The skills a layer gives, after `word`; nothing where it gives none. */
function Skills({ word, skills }: { word: string; skills: string[] }) {
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
