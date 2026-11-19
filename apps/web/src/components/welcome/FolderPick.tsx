import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pending } from '@/components/look';
import { Button, ComboBox, ComboBoxItem } from '@/components/ui/ds';
import { folderNamesQuery } from '@/lib/api/folders';

/** How long the field waits after a key before it asks the api what is under the path. */
const SETTLE_MS = 200;

/** `typed`, once it has stood unchanged a moment, so the listing is asked once a pause and not once a key. */
function useSettled(typed: string) {
  const [settled, setSettled] = useState(typed);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(typed), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [typed]);
  return settled;
}

/** The whole path of `name` in the folder `dir`. */
const joined = (dir: string, name: string) => (dir.endsWith('/') ? `${dir}${name}` : `${dir}/${name}`);

/**
 * The folder way's field: a path typed, the api offering the folders under what is typed as the person goes (names alone, under the
 * folders the server lists), a pick of one putting its whole path in the field. "Use this folder" hands on the path and whether the
 * listing found it a git repository (`undefined` where it could not tell: a path outside what it lists is still added, and judged then).
 * `pending` while the volume is being added; `refused`, the api's words on an add it refused.
 */
export function FolderPick({
  onUse,
  pending = false,
  refused,
}: {
  onUse: (path: string, repository: boolean | undefined) => void;
  pending?: boolean;
  refused?: string | undefined;
}) {
  const queryClient = useQueryClient();
  const [typed, setTyped] = useState('');
  const settled = useSettled(typed);
  const listed = useQuery(folderNamesQuery(settled));
  const read = settled === typed ? listed.data : undefined;
  const offered = read === undefined ? [] : read.names.map((name) => ({ id: joined(read.path, name), name }));
  const path = typed.replace(/(.)\/+$/, '$1');
  return (
    <form
      data-folder-pick
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!path.startsWith('/')) return;
        void queryClient.fetchQuery(folderNamesQuery(path)).then(
          (asked) => onUse(path, asked.folder ? asked.repository : undefined),
          () => onUse(path, undefined),
        );
      }}
    >
      <ComboBox
        data-folder-field
        label="Folder"
        placeholder="/home/you/code/my-app"
        supportingText={
          listed.error !== null && listed.error !== undefined
            ? `No help here: ${listed.error.message}`
            : read?.more
              ? 'More folders than shown: type more of the name.'
              : 'Its whole path, from /.'
        }
        items={offered}
        allowsCustomValue
        menuTrigger="input"
        inputValue={typed}
        onInputChange={setTyped}
        onChange={(key) => {
          if (key !== null) setTyped(String(key));
        }}
        isDisabled={pending}
        className="[--md3-field-notch:var(--background)]"
      >
        {(f) => <ComboBoxItem id={f.id} textValue={f.id} label={f.name} />}
      </ComboBox>
      {refused !== undefined && (
        <p role="alert" data-volume-refused className="m-0 text-body-small break-words text-failure">
          {refused}
        </p>
      )}
      <div>
        <Button
          type="submit"
          variant="filled"
          data-folder-use
          isDisabled={!path.startsWith('/') || pending}
          icon={pending ? Pending : undefined}
        >
          Use this folder
        </Button>
      </div>
    </form>
  );
}

/**
 * The offer to make the chosen folder a git repository, and what the step says on a no: runs work in a git repository, so the folder is
 * not added until it is one. `declined` once the person said no; `onYes` makes it one (`git init`, one empty first commit, none of its
 * files added), `onNo` declines, `onAnother` goes back to the field.
 */
export function InitOffer({
  path,
  declined,
  pending = false,
  refused,
  onYes,
  onNo,
  onAnother,
}: {
  path: string;
  declined: boolean;
  pending?: boolean;
  refused?: string | undefined;
  onYes: () => void;
  onNo: () => void;
  onAnother: () => void;
}) {
  return (
    <section data-init-offer={declined ? 'declined' : 'offered'} aria-label="Make it a repository" className="flex flex-col gap-3">
      <p className="m-0 text-body-large text-on-surface">
        <span className="font-mono break-all">{path}</span> is not a git repository yet.
      </p>
      {declined ? (
        <p data-init-declined className="m-0 text-body-medium text-on-surface-variant">
          Runs work in a git repository, each on a branch of its own, so this folder is not added as it is. Make it one, or choose another
          folder.
        </p>
      ) : (
        <p className="m-0 text-body-medium text-on-surface-variant">
          Runs work in a git repository. Make it one? Nemia runs <code className="font-mono">git init</code> there and makes one empty first
          commit: none of your files is committed, and runs see them once you commit them.
        </p>
      )}
      {refused !== undefined && (
        <p role="alert" data-init-refused className="m-0 text-body-small break-words text-failure">
          {refused}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="filled" data-init-yes onPress={onYes} isDisabled={pending} icon={pending ? Pending : undefined}>
          {declined ? 'Make it a repository' : 'Yes, make it one'}
        </Button>
        {!declined && (
          <Button variant="outlined" data-init-no onPress={onNo} isDisabled={pending}>
            No
          </Button>
        )}
        <Button variant="text" data-init-another onPress={onAnother} isDisabled={pending}>
          Choose another folder
        </Button>
      </div>
    </section>
  );
}
