/**
 * What a step got, in its part: a line per source in the one order (`GOT_ORDER`) — you, each step that handed it something, named by
 * its packet as the graph names it, each check, each run it was handed, the run's own sections, and its agent with its skills — each
 * folded to its line, opening to what it said.
 */
import type { RunDetail } from '@/lib/runView';
import type { StepPartModel } from '@/lib/stepPart';
import { stepAnchor } from '@/lib/asks';
import { RouteLink } from '../../agent/AgentParts';
import { Markdown } from '../../markdown/Markdown';
import { LINK } from '../Facts';
import { Fold } from './Fold';

/** One line of what the step got. */
type GotLine = Exclude<StepPartModel['got'], 'none'>[number];

/** A packet as its chip says it: the giver's name, and how many fields and files it carried. */
type Packet = NonNullable<Extract<GotLine, { from: 'step' }>['packet']>;

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

/** A packet's chip, as the graph's edge names it: its label, then its fields and files. */
function PacketChip({ packet }: { packet: Packet }) {
  return (
    <span data-packet={packet.label} className="border border-outline-variant px-1.5 py-0.5 font-mono text-body-small">
      {packet.label} · {plural(packet.fields, 'field')} · {plural(packet.files, 'file')}
    </span>
  );
}

/** Texts, each as the markdown it is. */
const Texts = ({ texts }: { texts: readonly string[] }) => (
  <>
    {texts.map((text, i) => (
      <Markdown key={i}>{text}</Markdown>
    ))}
  </>
);

/** Who a line is from, as its fold's title says it. */
function titleOf(line: GotLine): string {
  switch (line.from) {
    case 'you':
      return 'From you';
    case 'step':
      return `From ${line.step}`;
    case 'check':
      return line.step === null ? 'From a check' : `From the check of ${line.step}`;
    case 'other-run':
      return `From the run ${line.run}`;
    case 'run':
      return 'From the run';
    case 'agent':
      return line.agent === null ? 'From its agent' : `From its agent, ${line.agent}`;
  }
}

/** What a line holds, opened. */
function Said({ run, line }: { run: RunDetail; line: GotLine }) {
  switch (line.from) {
    case 'you':
    case 'run':
    case 'check':
      return <Texts texts={line.texts} />;
    case 'step':
      return (
        <>
          <RouteLink to="/runs/$runId" params={{ runId: run.id }} hash={stepAnchor(line.step)} className={LINK}>
            What {line.step} gave
          </RouteLink>
          <Texts texts={line.texts} />
        </>
      );
    case 'other-run':
      return (
        <>
          <p className="text-body-small text-on-surface-variant">
            asked: {line.asked}
            {line.how && ` · handed ${line.how}`}
          </p>
          <Markdown>{line.body}</Markdown>
        </>
      );
    case 'agent':
      return (
        <>
          {line.skills.length > 0 && <p className="font-mono text-body-small">skills: {line.skills.join(', ')}</p>}
          {line.text && <Markdown>{line.text}</Markdown>}
        </>
      );
  }
}

/** What the step got, a fold a source, in `GOT_ORDER`. */
export function PartGot({ run, got }: { run: RunDetail; got: readonly GotLine[] }) {
  return (
    <section data-part-got aria-label="What it got" className="min-w-0 space-y-1">
      <h3 className="text-label-medium text-on-surface-variant uppercase">Got</h3>
      <ul className="space-y-0.5">
        {got.map((line, i) => (
          <li key={i} data-got={line.from} className="min-w-0">
            <Fold
              name={`got-${line.from}`}
              title={
                <span className="inline-flex flex-wrap items-center gap-2 normal-case">
                  {titleOf(line)}
                  {line.from === 'step' && line.packet && <PacketChip packet={line.packet} />}
                </span>
              }
            >
              <Said run={run} line={line} />
            </Fold>
          </li>
        ))}
      </ul>
    </section>
  );
}
