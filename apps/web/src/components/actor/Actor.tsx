import { Bot, UserRound } from 'lucide-react';
import { actorWords, type Actor as ActorRead } from 'objects';
import { cn } from '../../lib/utils';

/**
 * Who made a write, on one line: a glyph of who it is — the person, or an agent — and objects' own words of the actor (`actorWords`),
 * after `Made by` on hover: the person under the token's name, an agent by its agent and token names, a session by its agent, run and
 * step. The board's one drawing of an actor, wherever a served object carries one (a gate's approval, a try's answer, a run called off
 * or held, the store's pause). Absent — a record written before actors were said, or a write made in-process — it draws nothing.
 */
export function Actor({ actor, className }: { actor: ActorRead | undefined; className?: string }) {
  if (actor === undefined) return null;
  const Glyph = actor.kind === 'agent' ? Bot : UserRound;
  const words = actorWords(actor);
  return (
    <span
      data-actor={actor.kind}
      title={`Made by ${words}`}
      className={cn('inline-flex min-w-0 items-center gap-1 text-body-small text-on-surface-variant', className)}
    >
      <Glyph aria-hidden className="size-3.5 shrink-0" />
      <span className="break-words">{words}</span>
    </span>
  );
}
