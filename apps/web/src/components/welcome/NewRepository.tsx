import { useState } from 'react';
import { CutPress } from '@/components/look';
import { TextField } from '@/components/ui/ds';

/**
 * The new way's panel: a name, and an empty repository made for it in Nemia's store, `onMake` handed the name. `pending` while it is
 * made; `refused` the api's words on a name or a make refused.
 */
export function NewRepository({
  onMake,
  pending = false,
  refused,
}: {
  onMake: (name: string) => void;
  pending?: boolean;
  refused?: string | undefined;
}) {
  const [name, setName] = useState('');
  const ready = /\S/.test(name);
  return (
    <form
      data-new-repository
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (ready) onMake(name.trim());
      }}
    >
      <TextField
        label="Name"
        supportingText="Lowercase letters, digits, dots, dashes and underscores, such as my-app: it is made in Nemia's store, under repositories/"
        value={name}
        onChange={setName}
        isDisabled={pending}
      />
      {refused !== undefined && (
        <p role="alert" data-volume-refused className="m-0 text-body-small break-words text-failure">
          {refused}
        </p>
      )}
      <div>
        <CutPress type="submit" data-new-make isDisabled={!ready || pending} pending={pending}>
          Make it
        </CutPress>
      </div>
    </form>
  );
}
