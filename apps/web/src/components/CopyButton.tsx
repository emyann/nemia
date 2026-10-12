import { useEffect, useState } from 'react';
import { Check as Done, Copy } from 'lucide-react';

/**
 * Copies a line to the clipboard, and says so for a moment — or that it could not, so a person selects the line instead. `what` names
 * what is copied, for the button's title: a command to run, a path to a folder nobody can type from memory. Outside a secure context,
 * where the page has no clipboard, it says it could not copy rather than throwing.
 */
export function CopyButton({ text, what = 'the command' }: { text: string; what?: string }) {
  const [said, setSaid] = useState<'copy' | 'copied' | 'failed'>('copy');
  useEffect(() => {
    if (said === 'copy') return;
    const timer = setTimeout(() => setSaid('copy'), 1_500);
    return () => clearTimeout(timer);
  }, [said]);
  const copy = () => {
    const written = navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject(new Error('no clipboard'));
    written.then(
      () => setSaid('copied'),
      () => setSaid('failed'),
    );
  };
  return (
    <button
      type="button"
      data-copy
      onClick={copy}
      aria-label={`Copy: ${text}`}
      title={said === 'failed' ? 'Could not copy: select the line and copy it' : said === 'copied' ? 'Copied' : `Copy ${what}`}
      className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      {said === 'copied' ? <Done aria-hidden className="size-3.5" /> : <Copy aria-hidden className="size-3.5" />}
    </button>
  );
}
