import type { DecideCommand } from '../../lib/api/decision.ts';
import { CopyButton } from './CopyButton';
import { Body } from '@/components/ui/ds';

/** A command's words, then its label, the command and the button that copies it. */
export function CommandLine({ command: c }: { command: DecideCommand }) {
  return (
    <>
      {c.said && (
        <Body size="small" colorRole="on-surface-variant">
          {c.said.replace(`:  ${c.command}`, '')}
        </Body>
      )}
      <div className="flex items-center gap-2">
        <Body size="small" component="span" colorRole="on-surface-variant" className="w-16 shrink-0">
          {c.label}
        </Body>
        <Body size="small" component="span" className="contents">
          <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded bg-surface-container-highest px-2 py-1 font-mono">
            {c.command}
          </code>
        </Body>
        <CopyButton text={c.command} />
      </div>
    </>
  );
}
