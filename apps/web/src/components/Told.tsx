/**
 * What a step was told, folded away: it is long, and it does not change while you look at the step. Where its run froze its layers,
 * each is drawn apart, as the run froze it when it started — the agent's instructions with its own skills, the person's custom
 * instructions, the rules of the factory it was started in where it froze some, the step's policy with the skills its line adds and the
 * fence lines it tightens, and the task; a run that froze none shows its brief whole. Each is drawn as the markdown it is written in
 * (`Words`). At a gate, the step's policy is drawn open on its own (`StepPolicy`), the layer a person judges the step by. The task is
 * drawn in its parts where the api split it (`TaskParts`): each run it was handed a block of its own, headed by how it was handed and
 * linked to that run.
 *
 * On a step's own page the same layers are what a run of it will be told, read now (`homes`): each beside where it lives, linked to where
 * it is edited, and the task left to the brief a run is started with.
 */
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import type { StepLayers, TaskPart } from '../lib/api';
import { RouteLink } from './AgentParts';
import { Markdown } from './Markdown';

/**
 * Where each layer of a step lives, for its page: drawn beside the agent's instructions, your custom instructions, the factory's rules and
 * the step's policy, each a link to where it is edited or the file it is written in; and each skill, by its name, as a link to its page or
 * its name alone. `factory` is null where the page is read in no factory, which has no rules to tell.
 */
export type LayerHomes = {
  instructions: ReactNode;
  custom: ReactNode;
  factory: ReactNode;
  words: ReactNode;
  skill: (name: string) => ReactNode;
};

/**
 * What the board calls each layer of what a step is told, with its number in the precedence order: where two of them say different
 * things, the higher number wins (`PRECEDENCE_NOTE`). The agent's own words are headed by whose they are.
 */
export const INSTRUCTIONS = (agent: string): string => `1. Instructions — ${agent}'s`;
export const CUSTOM_INSTRUCTIONS = '2. Your custom instructions';
export const FOLDER_FILES = "3. The folder's files";
export const FACTORY_RULES = "4. The factory's rules";
export const STEP_POLICY = "5. The step's policy";

/** What the fold says of the numbers it heads its layers with. */
export const PRECEDENCE_NOTE = 'Where two of them say different things, the higher number wins, and the task is above them all.';

/** What the fold says of a step with no agent: Nemia composed no layer above its own words, which are its policy. */
const noAgent = (will: boolean): string =>
  `No agent: of the words Nemia composes, its own are all it ${will ? 'will be' : 'was'} told. ${PRECEDENCE_NOTE}`;

/** What the layer of the folder's files says: the session reads them where it works, and the board has none of them to draw. */
export const FOLDER_FILES_SAID =
  'The files of the folder this step works in. The session reads them itself, wherever it works, and Nemia composes none of them.';

/**
 * What the rules' layer says of a step told none on a page read in a factory: what is true of the step. Its listing leaves the rules out
 * where the factory wrote none, where what it keeps cannot be told, and where the step is on a remote agent, and says no more.
 */
const NO_RULES_TOLD = 'This step is told none: the factory keeps none that can be told, or the step is on a remote agent';

/**
 * What a step's policy is told after, in words: agent `agent`'s instructions, then your custom instructions and the factory's rules,
 * each where `layers` holds some.
 */
export function toldBefore(agent: string, layers: Pick<StepLayers, 'custom' | 'factory'>): string {
  const first = `${agent}'s instructions`;
  const rest = [
    ...(layers.custom === null ? [] : ['your custom instructions']),
    ...(layers.factory === null ? [] : ["the factory's rules"]),
  ];
  if (!rest.length) return first;
  return rest.length === 1 ? `${first} and ${rest[0]}` : `${first}, ${rest[0]} and ${rest[1]}`;
}

/**
 * The fold: `told`, the brief whole, drawn only where `layers` is null; `parts`, the task in its parts, where the api split it; `filed`
 * says whether it was told or would be told now. Nothing where there is neither. Given `homes`, `layers` are what a run of the step will
 * be told, read now: drawn open, each beside its home.
 */
export function Told({
  told,
  layers,
  parts = null,
  filed,
  homes,
}: {
  told: string | null;
  layers: StepLayers | null;
  parts?: TaskPart[] | null;
  filed: boolean;
  homes?: LayerHomes;
}) {
  if (!told && !layers) return null;
  if (layers && homes) return <WillBeTold layers={layers} homes={homes} />;
  return (
    <details className="text-body-medium" data-told>
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
        {filed ? 'What it was told' : 'What it would be told now'}
      </summary>
      {layers ? <Layers layers={layers} parts={parts} /> : <Words text={told ?? ''} />}
    </details>
  );
}

/**
 * The layers in the order the session reads them, the factory's rules among them only where the run froze some, and where the agent's
 * words, the person's and the factory's went.
 */
function Layers({ layers, parts }: { layers: StepLayers; parts: TaskPart[] | null }) {
  return (
    <div className="mt-2 flex flex-col gap-3">
      {layers.agent === null ? (
        <p className="text-body-small text-muted-foreground">{noAgent(false)}</p>
      ) : (
        <>
          <p className="text-body-small text-muted-foreground">
            {layers.factory === null ? "The agent's instructions and yours" : "The agent's instructions, yours and the factory's rules"}{' '}
            were frozen at the start of the run and given{' '}
            {layers.via === 'prompt' ? "in the session's system prompt" : 'at the head of its brief'}. {PRECEDENCE_NOTE}
          </p>
          <Layer name="instructions" title={INSTRUCTIONS(layers.agent)}>
            <Words text={layers.instructions} />
            <Skills word="Its skills:" skills={layers.agentSkills} />
          </Layer>
          <Layer name="custom" title={CUSTOM_INSTRUCTIONS}>
            <Words text={layers.custom} />
          </Layer>
        </>
      )}
      {layers.folderFiles && (
        <Layer name="folder" title={FOLDER_FILES}>
          <p className="text-body-small text-muted-foreground">{FOLDER_FILES_SAID}</p>
        </Layer>
      )}
      {layers.factory !== null && (
        <Layer name="factory" title={FACTORY_RULES}>
          <Words text={layers.factory} />
        </Layer>
      )}
      <Layer name="policy" title={STEP_POLICY}>
        <Words text={layers.policy || null} />
        <Skills word="Adds the skills:" skills={layers.addedSkills} />
        <Fence agent={layers.agent} fence={layers.fence} />
      </Layer>
      <Layer name="task" title="The task">
        {parts?.length ? <TaskParts parts={parts} /> : <Words text={layers.task} none="Not composed: the run could not say it" />}
      </Layer>
    </div>
  );
}

/**
 * What a run of a step will be told, read now from the files and frozen when a run starts: the layers in the order the session reads them,
 * each beside where it lives, the agent's instructions folded, the factory's rules where the page is read in a factory or some are told,
 * and the task left to the brief a run is started with.
 */
function WillBeTold({ layers, homes }: { layers: StepLayers; homes: LayerHomes }) {
  return (
    <details open className="text-body-medium" data-told data-will-be-told>
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">What it will be told</summary>
      <div className="mt-2 flex flex-col gap-3">
        <p data-read-now className="text-body-small text-muted-foreground">
          Read now from the files, and frozen when a run starts: a run is told what they say then
          {layers.agent === null
            ? '.'
            : `, ${layers.factory === null ? "the agent's words and yours" : "the agent's words, yours and the factory's rules"} ${layers.via === 'prompt' ? 'in its system prompt' : 'at the head of its brief'}. ${PRECEDENCE_NOTE}`}
        </p>
        {layers.agent === null ? (
          <p className="text-body-small text-muted-foreground">{noAgent(true)}</p>
        ) : (
          <>
            <Layer name="instructions" title={INSTRUCTIONS(layers.agent)} home={homes.instructions}>
              <details data-instructions-fold>
                <summary className="cursor-pointer text-body-small text-muted-foreground hover:text-foreground">Read them</summary>
                <Words text={layers.instructions} none="Its file gives no instructions" />
              </details>
              <Skills word="Its skills:" skills={layers.agentSkills} link={homes.skill} />
            </Layer>
            <Layer name="custom" title={CUSTOM_INSTRUCTIONS} home={homes.custom}>
              <Words text={layers.custom} none="None written" />
            </Layer>
          </>
        )}
        {layers.folderFiles && (
          <Layer name="folder" title={FOLDER_FILES}>
            <p className="text-body-small text-muted-foreground">{FOLDER_FILES_SAID}</p>
          </Layer>
        )}
        {(layers.factory !== null || homes.factory) && (
          <Layer name="factory" title={FACTORY_RULES} home={homes.factory ?? undefined}>
            <Words text={layers.factory} none={NO_RULES_TOLD} />
          </Layer>
        )}
        <Layer name="policy" title={STEP_POLICY} home={homes.words}>
          <Words text={layers.policy || null} none="No words of its own" />
          <Skills word="Adds the skills:" skills={layers.addedSkills} link={homes.skill} />
          <Fence agent={layers.agent} fence={layers.fence} />
        </Layer>
        <p data-layer="task" className="text-body-small text-muted-foreground">
          Then the task: the brief a run is started with.
        </p>
      </div>
    </details>
  );
}

/**
 * A step's body, drawn above its fold only where its run froze no layers (`layers` null): there it is all the record says of the step's
 * own words. Nothing where layers were frozen, since the fold draws each of the body's words by layer, and nothing for an empty body.
 */
export function StepBody({ body, layers }: { body: string | null; layers: StepLayers | null }) {
  if (layers !== null || !body) return null;
  return <Markdown className="text-body-medium">{body}</Markdown>;
}

/**
 * The step's policy, drawn open at its gate: its own words, the skills it adds and the fence lines it tightens, then what it was told
 * before (`toldBefore`) — its agent's instructions, then the person's custom instructions and the factory's rules where there are any —
 * over which it wins where they conflict, and where every layer is. Nothing for a step with no agent, whose own words are all it was told
 * and are its policy layer in the fold, nor for a run that froze no layers (`layers` null).
 */
export function StepPolicy({ layers }: { layers: StepLayers | null }) {
  const agent = layers?.agent ?? null;
  if (layers === null || agent === null) return null;
  return (
    <div data-gate-policy className="flex flex-col gap-2 rounded border border-outline-variant p-3">
      <Layer name="policy" title={STEP_POLICY}>
        <Words text={layers.policy || null} none={`No words of its own: ${agent}'s instructions are all it was told`} />
        <Skills word="Adds the skills:" skills={layers.addedSkills} />
        <Fence agent={agent} fence={layers.fence} />
      </Layer>
      <p className="text-body-small text-muted-foreground">
        Told after {toldBefore(agent, layers)}; where they conflict, this wins. Every layer is under “What it was told”.
      </p>
    </div>
  );
}

/** How a run was handed to the step, as its block's heading says it. */
const HANDED = { read: 'Read as context', waited: 'Waited on, shipped' } as const;

/**
 * A task in its parts: its own text as `Words`, and each run it was handed a block headed by how it was handed and the first line that
 * run was asked, linked to the run's page, over the section's body. A run the record names as neither waited on nor read is a plain
 * block, its section as it was written.
 */
export function TaskParts({ parts }: { parts: TaskPart[] }) {
  return (
    <div className="flex flex-col gap-2">
      {parts.map((part, i) => {
        if (part.kind === 'text') return <Words key={i} text={part.text} />;
        if (!part.how) return <Words key={i} text={`## From run ${part.run}\n\n${part.body}`} />;
        return (
          <section key={i} data-from-run={part.run} data-how={part.how} className="flex flex-col gap-1 rounded border p-2">
            <h5 title={part.run} className="min-w-0 text-label-medium text-muted-foreground">
              <RouteLink to="/runs/$runId" params={{ runId: part.run }} className="block truncate hover:underline">
                {HANDED[part.how]} · {part.asked || part.run} ↗
              </RouteLink>
            </h5>
            <Words text={part.body} />
          </section>
        );
      })}
    </div>
  );
}

/** One layer, under its title, and where it lives beside the title where `home` is given. */
export function Layer({ name, title, home, children }: { name: string; title: string; home?: ReactNode; children: ReactNode }) {
  return (
    <section data-layer={name} className="flex flex-col gap-1">
      {home === undefined ? (
        <h4 className="text-label-medium text-muted-foreground">{title}</h4>
      ) : (
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <h4 className="text-label-medium text-muted-foreground">{title}</h4>
          <span data-home={name} className="min-w-0 text-body-small break-all text-muted-foreground">
            {home}
          </span>
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * A layer's words, drawn as the markdown they are written in, at the fold's size on a quiet ground of their own, a `#` under the
 * layer's title; or `none` where the run froze none.
 */
export function Words({ text, none = 'None frozen on this run' }: { text: string | null; none?: string }) {
  if (text === null) return <p className="text-body-small text-muted-foreground italic">{none}</p>;
  return (
    <Markdown level={5} className="rounded bg-muted/60 p-3">
      {text}
    </Markdown>
  );
}

/** The skills a layer gives, after `word`, each drawn by `link` where it is given; nothing where it gives none. */
export function Skills({ word, skills, link }: { word: string; skills: string[]; link?: (name: string) => ReactNode }) {
  if (!skills.length) return null;
  return (
    <p className="flex flex-wrap items-center gap-1 text-body-small text-muted-foreground">
      {word}{' '}
      {skills.map((skill) => (
        <Badge key={skill} variant="outline" data-skill={skill}>
          {link ? link(skill) : skill}
        </Badge>
      ))}
    </p>
  );
}

/** The fence lines a step's own file tightens agent `agent`'s with, each as its line writes it; nothing where it sets none. */
function Fence({ agent, fence }: { agent: string | null; fence: StepLayers['fence'] }) {
  if (!fence.length) return null;
  return (
    <div className="flex flex-col gap-1 text-body-small text-muted-foreground">
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
