/**
 * The two lines inside Nemia's chat that are about the chat itself, neither of them a part of the look (`change-the-board` names none,
 * and `test/look.test.ts` refuses one it does not): her session stopped, with a way to start it, and the board having lost the daemon.
 */
import type { ReactNode } from 'react';
import { CircleXIcon, PauseIcon } from 'lucide-react';
import { LinkButton } from '@/components/ui/button';
import { container } from '@/lib/meaning';
import { clockWord } from '@/lib/quota';
import { routeLink } from '../routeLink';

const RouterLinkButton = routeLink(LinkButton);

/** A band: its icon, its heading and its sentence, over an accent at its left, or in the failure's container whole. */
function Band({
  role,
  what,
  icon,
  title,
  children,
}: {
  role: 'status' | 'alert';
  what: string;
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  const failed = role === 'alert';
  return (
    <div data-chat-band={what} role={role} className={failed ? container.failure : 'border-l-4 border-rest bg-surface-container-highest'}>
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

/**
 * Why her session stopped, and what to do: Start her session leads to her settings, where a level above Manual files her one, and Why
 * it stopped to the same page's section. `words` is the board's own account of her session (`sessionOf`).
 */
export function ChatStoppedBand({ words }: { words: string }) {
  return (
    <>
      <Band role="status" what="stopped" icon={<PauseIcon />} title="Her session stopped">
        {`${words} Your factories still tick; gates still come to you. What you write waits for her.`}
      </Band>
      <div className="flex flex-wrap gap-2">
        <RouterLinkButton to="/settings" variant="secondary" size="sm" data-chat-start>
          Start her session
        </RouterLinkButton>
        <RouterLinkButton to="/settings" variant="link" size="sm">
          Why it stopped
        </RouterLinkButton>
      </div>
    </>
  );
}

/**
 * The board having lost the daemon, since `since`: it tries the kept message again on its own, and nothing the person wrote is lost.
 * What they may do with that message — send it again, change it, throw it away — is on the message itself (`ChatKeptMessage`).
 */
export function ChatLostBand({ since, now }: { since: string; now: Date }) {
  return (
    <Band role="alert" what="lost" icon={<CircleXIcon />} title="No answer from the daemon">
      {`Since ${clockWord(new Date(since), now)}. The board tries again every few seconds; nothing you wrote is lost.`}
    </Band>
  );
}
