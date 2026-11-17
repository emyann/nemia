import { Check as Done, Copy } from 'lucide-react';
import { Button } from '@/components/ui/ds';
import { useCopy } from '@/lib/useCopy';

/**
 * Copies a line to the clipboard, and says so for a moment — or that it could not, so a person selects the line instead. `what` names
 * what is copied, for the button's title: a command to run, a path to a folder nobody can type from memory. Outside a secure context,
 * where the page has no clipboard, it says it could not copy rather than throwing.
 */
export function CopyButton({ text, what = 'the command' }: { text: string; what?: string }) {
  const { said, copy } = useCopy(text);
  return (
    <span
      title={said === 'failed' ? 'Could not copy: select the line and copy it' : said === 'copied' ? 'Copied' : `Copy ${what}`}
      className="inline-flex shrink-0"
    >
      <Button variant="text" size="xsmall" icon={said === 'copied' ? Done : Copy} data-copy onPress={copy} aria-label={`Copy: ${text}`} />
    </span>
  );
}
