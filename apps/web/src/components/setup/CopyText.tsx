import { Check, Copy } from 'lucide-react';
import { IconButton } from '@/components/ui/ds';
import { cn } from '@/components/ui/ds/utils';
import { useCopy } from '@/lib/useCopy';

/** The copy glyph, as the kit's icon button takes one. */
const COPY = ({ className }: { size?: number; className?: string }) => <Copy size={14} className={className} />;

/** The glyph a copy shows for a moment once it copied. */
const COPIED = ({ className }: { size?: number; className?: string }) => <Check size={14} className={className} />;

/**
 * Text a person copies — a command to type at the server's shell, or the code a fix printed — in the mono face, selectable whole, with
 * the control that copies it, which says it copied for a moment (`useCopy`), or that it could not, so the person selects it instead.
 * `large` draws it as a code to read off the screen and type elsewhere. `label` names what is copied to a screen reader.
 */
export function CopyText({ text, label, large = false }: { text: string; label: string; large?: boolean }) {
  const { said, copy } = useCopy(text);
  return (
    <span data-copy-text={text} data-copied={said === 'copied' || undefined} className="flex min-w-0 items-center gap-1">
      <code
        className={cn(
          'min-w-0 font-mono break-all text-on-surface select-all',
          large
            ? 'bg-surface-container-high px-3 py-2 text-body-large tracking-widest'
            : 'bg-surface-container-high px-2 py-1 text-body-small',
        )}
      >
        {text}
      </code>
      <IconButton size="small" variant="standard" icon={said === 'copied' ? COPIED : COPY} aria-label={`Copy ${label}`} onPress={copy} />
      <span role="status" className="sr-only">
        {said === 'copied' ? 'Copied' : said === 'failed' ? 'Could not copy: select it and copy it' : ''}
      </span>
    </span>
  );
}
