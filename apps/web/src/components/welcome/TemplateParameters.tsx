import { useState } from 'react';
import type { Template } from 'objects';
import { Disclosure, DisclosurePanel, DisclosureTrigger, NumberField, Switch, TextField } from '@/components/ui/ds';
import { type ParameterRead, parameterFieldOf } from '@/lib/templateParameters';

/** What a parameter's field is given: the parameter as the form reads it, its description, its value and where a change goes. */
type FieldProps = {
  read: ParameterRead;
  description: string;
  value: string;
  onChange: (name: string, value: string) => void;
  isDisabled: boolean;
};

/** One parameter's field: a switch for a boolean, a number field for a number, a text field for a string, labelled by its name. */
function ParameterField({ read, description, value, onChange, isDisabled }: FieldProps) {
  if (read.type === 'boolean')
    return (
      <div data-template-param={read.name}>
        <Switch
          labelPosition="start"
          supportingText={description}
          isSelected={value === 'true'}
          onChange={(selected) => onChange(read.name, selected ? 'true' : 'false')}
          isDisabled={isDisabled}
        >
          {read.name}
        </Switch>
      </div>
    );
  if (read.type === 'number')
    return (
      <div data-template-param={read.name}>
        <NumberField
          label={read.name}
          supportingText={description}
          value={value === '' ? Number.NaN : Number(value)}
          onChange={(n) => onChange(read.name, Number.isNaN(n) ? '' : String(n))}
          isDisabled={isDisabled}
        />
      </div>
    );
  return (
    <div data-template-param={read.name}>
      <TextField
        label={read.name}
        supportingText={description}
        value={value}
        onChange={(text) => onChange(read.name, text)}
        isDisabled={isDisabled}
      />
    </div>
  );
}

/**
 * A template's parameters as fields: those it asks, or that have no default, drawn open; every other one no volume sets folded under
 * More parameters, drawn only while open; nothing where it has neither. Each field's value is the form's, told each change by name.
 */
export function TemplateParameters({
  template,
  reads,
  values,
  onChange,
  isDisabled,
}: {
  template: Template;
  reads: readonly ParameterRead[];
  values: Readonly<Record<string, string>>;
  onChange: (name: string, value: string) => void;
  isDisabled: boolean;
}) {
  const [more, setMore] = useState(false);
  const field = (read: ParameterRead) => (
    <ParameterField
      key={read.name}
      read={read}
      description={template.spec.parameters[read.name]?.description ?? ''}
      value={values[read.name] ?? ''}
      onChange={onChange}
      isDisabled={isDisabled}
    />
  );
  const asked = reads.filter((read) => parameterFieldOf(read) === 'asked');
  const folded = reads.filter((read) => parameterFieldOf(read) === 'more');
  if (asked.length === 0 && folded.length === 0) return null;
  return (
    <div data-template-params className="flex flex-col gap-4">
      {asked.map(field)}
      {folded.length > 0 && (
        <Disclosure isExpanded={more} onExpandedChange={setMore}>
          <DisclosureTrigger>More parameters</DisclosureTrigger>
          <DisclosurePanel isUnstyled>{more && <div className="flex flex-col gap-4 pt-2">{folded.map(field)}</div>}</DisclosurePanel>
        </Disclosure>
      )}
    </div>
  );
}
