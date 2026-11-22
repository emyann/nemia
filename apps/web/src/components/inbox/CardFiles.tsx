/**
 * The files a card carries, on its page: each by its name, its size and type, whether its text names it, and whether its factory still
 * keeps it; and, on a card no run was started from, files dropped, pasted or chosen to attach, and each taken off. A started card's
 * files are said and never changed: its run took them as they were.
 */
import { ByteSize } from 'effect';
import { PaperclipIcon, XIcon } from 'lucide-react';
import { CARD_FILES_BYTES_MOST, CARD_FILES_MOST, type CardFileStatus } from 'objects';
import { Button, DropZone, FileTrigger, IconButton } from '@/components/ui/ds';
import { Pending } from '@/components/look';

/** What a card carries at most, in words. */
const MOST_WORDS = `${CARD_FILES_MOST} files and ${ByteSize.format(ByteSize.bytes(CARD_FILES_BYTES_MOST))}`;

/** What a file of the card says beside its name. */
const aboutOf = (file: CardFileStatus) =>
  [
    file.size === undefined ? null : ByteSize.format(ByteSize.bytes(file.size)),
    file.mediaType ?? null,
    file.inText ? 'in its text' : null,
    file.kept ? null : 'let go of: attach it again',
  ]
    .filter((part) => part !== null)
    .join(' · ');

/**
 * The card's files: listed a row each, and, where `canChange`, a drop zone that takes files dropped or chosen (`onAttach`), and a
 * Remove on each row (`onDetach`). `pending` says a change is being sent, and keeps both still; `refused` is the api's refusal of the
 * last change, in full.
 */
export function CardFiles({
  files,
  canChange,
  onAttach,
  onDetach,
  pending = false,
  refused = null,
}: {
  files: readonly CardFileStatus[];
  canChange: boolean;
  onAttach: (files: File[]) => void;
  onDetach: (name: string) => void;
  pending?: boolean;
  refused?: string | null;
}) {
  if (!canChange && files.length === 0) return null;
  return (
    <section aria-label="Files the card carries" className="min-w-0 space-y-2" data-card-files>
      <h2 className="text-title-small">Files</h2>
      {files.length === 0 ? (
        <p className="text-body-small text-on-surface-variant">
          The card carries no file. Every run started from it is handed the files it carries.
        </p>
      ) : (
        <ul aria-label="Files of the card" className="divide-y divide-outline-variant rounded-shape-small border border-outline-variant">
          {files.map((file) => (
            <li
              key={file.name}
              data-card-file={file.name}
              data-kept={file.kept || undefined}
              className="flex min-w-0 items-center gap-2 py-1 ps-3 pe-1"
            >
              <span className="min-w-0 flex-1 truncate font-mono text-body-medium" title={file.name}>
                {file.name}
              </span>
              <span className={file.kept ? 'shrink-0 text-body-small text-on-surface-variant' : 'shrink-0 text-body-small text-failure'}>
                {aboutOf(file)}
              </span>
              {canChange && (
                <IconButton
                  size="xsmall"
                  variant="standard"
                  icon={XIcon}
                  aria-label={`Remove ${file.name}`}
                  isDisabled={pending}
                  onPress={() => onDetach(file.name)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {canChange && (
        <DropZone
          aria-label="Files to attach to the card"
          isDisabled={pending}
          className="flex-row flex-wrap justify-start gap-3 p-3 text-start"
          onDrop={(event) => {
            void Promise.all(event.items.flatMap((item) => (item.kind === 'file' ? [item.getFile()] : []))).then(onAttach);
          }}
        >
          <PaperclipIcon aria-hidden size={20} className="shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block text-body-medium">Attach files: drop them here, or</span>
            <span className="block text-body-small text-on-surface-variant">A card carries {MOST_WORDS} at most.</span>
          </span>
          <FileTrigger allowsMultiple onSelect={(list) => onAttach([...(list ?? [])])}>
            <Button variant="tonal" size="small" icon={pending ? Pending : undefined} isDisabled={pending}>
              Choose files
            </Button>
          </FileTrigger>
        </DropZone>
      )}
      {refused !== null && <NotChanged message={refused} />}
    </section>
  );
}

/** The api's refusal of the last change to the card's files, in full. */
function NotChanged({ message }: { message: string }) {
  return (
    <div data-refused className="space-y-1 rounded border border-failure bg-failure-container px-3 py-2">
      <p className="text-body-medium font-medium text-on-failure-container">Not changed. The api refused it:</p>
      <p className="font-mono text-body-small whitespace-pre-wrap break-words text-on-failure-container">{message}</p>
    </div>
  );
}
