import { ByteSize } from 'effect';
import { UploadIcon, XIcon } from 'lucide-react';
import { FILE_KEPT_FOR, FILE_LIMIT } from 'objects';
import { Button, DropZone, FileTrigger, IconButton } from '@/components/ui/ds';
import { inputsAdded } from '@/lib/startInputs';

/** How long a file uploaded for a start is kept, in words: a day, or its hours. */
const KEPT = FILE_KEPT_FOR === 24 * 60 * 60 * 1000 ? 'a day' : `${Math.round(FILE_KEPT_FOR / 3_600_000)} hours`;

/** The most one file may be, in bytes (`FILE_LIMIT`), and in words. */
const MOST = Number(FILE_LIMIT);
const MOST_WORDS = ByteSize.format(FILE_LIMIT);

/** `bytes` in words, in the units the limit is said in. */
const sizeWords = (bytes: number): string => ByteSize.format(ByteSize.bytes(bytes));

/** Whether `file` is past what the files api keeps of one. */
export const pastLimit = (file: File): boolean => file.size > MOST;

/** Where the file at `index` stands while the start uploads: uploaded, uploading now, or waiting its turn. */
const markOf = (index: number, sent: number): 'sent' | 'uploading' | 'waiting' =>
  index < sent ? 'sent' : index === sent ? 'uploading' : 'waiting';

/**
 * The files a start hands its run, as the client hands a start its inputs: dropped on the kit's drop zone, or picked with its file trigger,
 * each listed by its name and size, removable until the start is pressed. The files api's limit is said before anything is sent, and a
 * file past it is marked in failure's ink, its size beside the cap: the form starts nothing while one is listed. A file added under a
 * name already listed takes its place (`inputsAdded`), since the run finds each by its name. While the start uploads them (`uploading`),
 * each says whether it is sent, uploading or waiting, `sent` being how many are.
 * @param files The files listed, in order.
 * @param onChange Told the list as it is after a file is added or removed.
 * @param sent How many of the files, in order, are uploaded.
 * @param uploading Whether the start is uploading them now.
 * @param isDisabled Whether the list may change: not while the start is pressed.
 */
export function StartInputs({
  files,
  onChange,
  sent = 0,
  uploading = false,
  isDisabled = false,
}: {
  files: readonly File[];
  onChange: (files: File[]) => void;
  sent?: number;
  uploading?: boolean;
  isDisabled?: boolean;
}) {
  const add = (added: readonly File[]) => onChange(inputsAdded(files, added));
  return (
    <div className="min-w-0 space-y-2" data-start-inputs>
      <DropZone
        aria-label="Files for the run"
        isDisabled={isDisabled}
        className="flex-row flex-wrap justify-start gap-3 p-3 text-start"
        onDrop={(event) => {
          void Promise.all(event.items.flatMap((item) => (item.kind === 'file' ? [item.getFile()] : []))).then(add);
        }}
      >
        <UploadIcon aria-hidden size={20} className="shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block text-body-medium">Files for the run: drop them here, or</span>
          <span className="block text-body-small text-on-surface-variant" data-file-limit>
            Each file up to {MOST_WORDS}, kept {KEPT} for the start.
          </span>
        </span>
        <FileTrigger allowsMultiple onSelect={(list) => add([...(list ?? [])])}>
          <Button variant="tonal" size="small" isDisabled={isDisabled}>
            Choose files
          </Button>
        </FileTrigger>
      </DropZone>
      {files.length > 0 && (
        <ul aria-label="Files listed for the run" className="divide-y divide-outline-variant rounded-shape-small border border-outline-variant">
          {files.map((file, index) => {
            const past = pastLimit(file);
            const mark = uploading ? markOf(index, sent) : null;
            return (
              <li
                key={file.name}
                data-start-input={file.name}
                data-past-limit={past || undefined}
                data-upload={mark ?? undefined}
                className="flex min-w-0 items-center gap-2 py-1 ps-3 pe-1"
              >
                <span className="min-w-0 flex-1 truncate font-mono text-body-medium" title={file.name}>
                  {file.name}
                </span>
                <span className={past ? 'shrink-0 text-body-small text-failure' : 'shrink-0 text-body-small text-on-surface-variant'}>
                  {past ? `${sizeWords(file.size)}, past the ${MOST_WORDS} a file may be` : sizeWords(file.size)}
                </span>
                {mark && <span className="shrink-0 text-body-small text-on-surface-variant">{MARK_WORDS[mark]}</span>}
                <IconButton
                  size="xsmall"
                  variant="standard"
                  icon={XIcon}
                  aria-label={`Remove ${file.name}`}
                  isDisabled={isDisabled}
                  onPress={() => onChange(files.filter((f) => f !== file))}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** What each file says while the start uploads them. */
const MARK_WORDS = { sent: 'Sent', uploading: 'Uploading…', waiting: 'Waiting' } as const;
