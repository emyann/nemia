import type { Expression } from 'blobatar';
import { happy, idle, sleepy, surprised, thinking, unsure } from 'blobatar/expression';
import { faceOf, type FaceExpression, type Presence } from '../lib/presence';
import { AgentFace } from './AgentParts';

/** The library's pose for each of her expressions. */
const POSE: Record<FaceExpression, Expression> = { idle, thinking, surprised, happy, sleepy, unsure };

/**
 * Nemia's face: her blobatar on its squircle plate, dimmed in the dark theme as any agent's plate is, wearing the expression of her
 * `presence` (`faceOf`): idle when she is up, thinking while she answers, surprised when something waits on the person, happy with an
 * answer unread, sleepy when she is down, unsure when a message was not sent. `size` in pixels.
 */
export function NemiaFace({ presence, size = 60, className }: { presence: Presence; size?: number; className?: string }) {
  const expression = faceOf(presence);
  return (
    <span data-nemia-face={expression} className="inline-grid shrink-0 place-items-center">
      <AgentFace name="nemia" size={size} plate expression={POSE[expression]} className={className} />
    </span>
  );
}
