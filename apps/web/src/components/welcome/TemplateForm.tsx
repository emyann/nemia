import { useState } from 'react';
import type { Template } from 'objects';
import { RadioTile, RadioTileGroup, CutPress } from '@/components/look';
import { TextField } from '@/components/ui/ds';
import { applyTemplate } from '@/lib/api/factories';
import { parameterReadsOf, setsOf, startWordOf } from '@/lib/templateParameters';
import { useFactoryWrite } from '@/lib/useFactoryWrite';
import { TemplateParameters } from './TemplateParameters';

/** Whether a template can be applied: Nemia read it with no problem. */
const readable = (template: Template) => (template.status.problems ?? []).length === 0;

/** What a template's tile says: its description, or for one that cannot be applied, its problems. */
const lineOf = (template: Template) =>
  readable(template) ? (template.spec.description ?? '') : (template.status.problems ?? []).join('; ');

/**
 * The template way's form: each template Nemia builds in as a tile, its description its line, one Nemia cannot read offered disabled
 * with its problems; what the chosen one gives, its workflows and agents by name; the parameters it asks drawn open and the rest folded,
 * each field starting at its default; a name; the template applied with no volume, each field the person changed from its default sent
 * as a `--set` word and every other parameter left at its default, `onMade` told its name once the api answered. Picking another
 * template starts its fields again. A refusal is said in the api's words.
 */
export function TemplateForm({ templates, onMade }: { templates: readonly Template[]; onMade: (name: string) => void }) {
  const [picked, setPicked] = useState<string | undefined>(undefined);
  const [given, setGiven] = useState<{ template: string; values: Record<string, string> }>({ template: '', values: {} });
  const chosen = templates.find((t) => t.metadata.name === picked && readable(t)) ?? templates.find(readable);
  const reads = parameterReadsOf(chosen?.spec.parameters ?? {});
  const values = Object.fromEntries(
    reads.map((read) => [read.name, (given.template === chosen?.metadata.name ? given.values[read.name] : undefined) ?? startWordOf(read)]),
  );
  const form = useFactoryWrite((name) => applyTemplate(name, chosen?.metadata.name ?? '', setsOf(reads, values)), onMade);
  return (
    <form
      data-template-form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (chosen !== undefined) form.make();
      }}
    >
      <RadioTileGroup label="Template" layout="column" value={chosen?.metadata.name ?? null} onChange={(name) => setPicked(name)}>
        {templates.map((template) => (
          <RadioTile
            key={template.metadata.name}
            value={template.metadata.name}
            data-template-offer={template.metadata.name}
            isDisabled={!readable(template)}
            title={template.metadata.name}
            description={lineOf(template)}
          />
        ))}
      </RadioTileGroup>
      {chosen !== undefined && (
        <dl data-template-gives className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-body-medium">
          <dt className="text-on-surface-variant">Workflows</dt>
          <dd className="m-0 text-on-surface">{chosen.status.workflows.join(', ')}</dd>
          <dt className="text-on-surface-variant">Agents</dt>
          <dd className="m-0 text-on-surface">{chosen.status.agents.join(', ')}</dd>
        </dl>
      )}
      {chosen !== undefined && (
        <TemplateParameters
          template={chosen}
          reads={reads}
          values={values}
          onChange={(name, value) => setGiven({ template: chosen.metadata.name, values: { ...values, [name]: value } })}
          isDisabled={form.pending}
        />
      )}
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
        <CutPress type="submit" data-factory-make isDisabled={!form.ready || chosen === undefined} pending={form.pending}>
          Make the factory
        </CutPress>
      </div>
    </form>
  );
}
