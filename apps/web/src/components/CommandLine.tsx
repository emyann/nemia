import type { DecideCommand } from '../lib/api';
import { CopyButton } from './CopyButton';

/** A command's words, then its label, the command and the button that copies it. */
export function CommandLine({ command: c }: { command: DecideCommand }) {
  return (
    <>
      {c.said && <p className="text-body-small text-muted-foreground">{c.said.replace(`:  ${c.command}`, '')}</p>}
      <div className="flex items-center gap-2">
        <span className="w-16 shrink-0 text-body-small text-muted-foreground">{c.label}</span>
        <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded bg-muted px-2 py-1 font-mono text-body-small">
          {c.command}
        </code>
        <CopyButton text={c.command} />
      </div>
    </>
  );
}
