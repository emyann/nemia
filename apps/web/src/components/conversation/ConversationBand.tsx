/**
 * The band both of the board's conversations draw over their talk — a step's session and Nemia's chat — to say something about the
 * conversation itself: her session stopped, the board having lost the daemon, a chat it cannot read at all, and a conversation no live
 * stream of which can be had while the api reads it again on a beat.
 *
 * It is no part of the look (`change-the-board` names none, and `test/look.test.ts` refuses one it does not): a deliberate decision,
 * kept where a reader of either conversation will find it.
 */
import type { ReactNode } from 'react';
import { container } from '@/lib/meaning';
import { cn } from '@/lib/utils';

/**
 * A band: its icon, its heading and its sentence, over an accent at its left while it is quiet (`status`, a note at rest), or in the
 * failure's container whole while it says a thing went wrong (`alert`). `what` is written as `data-band`, by which a page selects it.
 */
export function ConversationBand({
  role,
  what,
  icon,
  title,
  className,
  children,
}: {
  role: 'status' | 'alert';
  what: string;
  icon: ReactNode;
  title: string;
  className?: string;
  children: ReactNode;
}) {
  const failed = role === 'alert';
  return (
    <div
      data-band={what}
      role={role}
      className={cn(failed ? container.failure : 'border-l-4 border-rest bg-surface-container-highest', className)}
    >
      <div className="flex items-start gap-2.5 px-3.5 py-3">
        <span aria-hidden="true" className="mt-0.5 shrink-0 [&_svg]:size-4">
          {icon}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-title-small">{title}</span>
          <span className={failed ? 'text-body-small' : 'text-body-small text-on-surface-variant'}>{children}</span>
        </div>
      </div>
    </div>
  );
}
