import { CutPress } from '@/components/look';
import { TextField } from '@/components/ui/ds';
import { createFactory } from '@/lib/api/factories';
import { useFactoryWrite } from '@/lib/useFactoryWrite';

/**
 * The scratch way's form: a name and nothing else, an empty factory filed with no volume, `onMade` told its name once the api answered.
 * A refusal is said in the api's words.
 */
export function ScratchForm({ onMade }: { onMade: (name: string) => void }) {
  const form = useFactoryWrite(createFactory, onMade);
  return (
    <form
      data-scratch-form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        form.make();
      }}
    >
      <TextField
        label="Name"
        supportingText="A lowercase slug, such as my-app"
        value={form.name}
        onChange={form.setName}
        isDisabled={form.pending}
      />
      {form.refused !== undefined && (
        <p role="alert" data-factory-refused className="m-0 text-body-small break-words text-failure">
          {form.refused}
        </p>
      )}
      <div>
        <CutPress type="submit" data-factory-make isDisabled={!form.ready} pending={form.pending}>
          Make an empty factory
        </CutPress>
      </div>
    </form>
  );
}
