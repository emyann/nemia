import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import type { SkillDetail, SkillDraft } from '../lib/api';
import { draftOfForm, EMPTY_SKILL_FORM, skillEdited, skillFormOf, type SkillForm as Form } from '../lib/skills';
import { Field } from './AgentForm';

/**
 * A skill's form: its name — its folder, set once — a title, what it does, its card's tags and examples, and its instructions, the body of
 * its SKILL.md. Nothing is judged here that the package judges on save; a refusal of the last save is shown above the fields in the
 * package's words. `readOnly` draws a skill the board does not write: the repository's, or a builtin one. `between` draws what sits
 * between the card and the instructions — the page's switch — told whether the form holds unsaved words, and `onChanged` tells the page the
 * same.
 */
export function SkillForm({
  detail,
  readOnly = false,
  saving,
  refusal,
  onSave,
  between,
  onChanged,
}: {
  detail: SkillDetail | null;
  readOnly?: boolean;
  saving: boolean;
  refusal: ReactNode;
  onSave: (draft: SkillDraft) => void;
  between?: (changed: boolean) => ReactNode;
  onChanged?: (changed: boolean) => void;
}) {
  const was = detail ? skillFormOf(detail) : EMPTY_SKILL_FORM;
  const [form, setForm] = useState<Form>(was);
  const changed = skillEdited(form, was);
  useEffect(() => onChanged?.(changed), [changed, onChanged]);
  const set = (key: keyof Form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <form
      aria-label={detail ? `Skill ${detail.skill.name}` : 'New skill'}
      data-skill-form={detail?.skill.name ?? ''}
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!readOnly) onSave(draftOfForm(form));
      }}
    >
      {refusal}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Name"
          hint={
            detail
              ? 'Its folder, skills/<name>/, and what an agent gives it by. Not renamed here: an agent names it by this.'
              : 'Its folder, skills/<name>/, and what an agent gives it by: lowercase words joined by dashes, 64 characters at most.'
          }
          value={form.name}
          onChange={set('name')}
          readOnly={readOnly || detail !== null}
          mono
          placeholder={detail ? undefined : 'write-a-note'}
        />
        <Field
          label="Title"
          hint="The name a caller reads on an agent's card. Empty, the card uses the skill's name."
          value={form.title}
          onChange={set('title')}
          readOnly={readOnly}
          placeholder={detail ? undefined : 'Write a note'}
        />
        <Field
          className="sm:col-span-2"
          label="Description"
          hint="What it does and when to use it, one line: a session that is only told its name reads this to decide to load it."
          value={form.description}
          onChange={set('description')}
          readOnly={readOnly}
          placeholder={detail ? undefined : 'Writes the notes of a change. Use when a change is done and needs its notes.'}
        />
        <Field
          label="Tags"
          hint="One a line: the words on an agent's card for it."
          value={form.tags}
          onChange={set('tags')}
          readOnly={readOnly}
          mono
          area="min-h-16"
        />
        <Field
          label="Examples"
          hint="One a line: what a person would ask an agent that gives it."
          value={form.examples}
          onChange={set('examples')}
          readOnly={readOnly}
          area="min-h-16"
        />
      </div>

      {between?.(changed)}

      <Field
        label="Instructions"
        hint="The body of its SKILL.md, in markdown: what a session that loads it is told."
        value={form.body}
        onChange={set('body')}
        readOnly={readOnly}
        markdown
        area="min-h-72"
        placeholder={detail ? undefined : 'When a change is done, write its notes…'}
      />

      {!readOnly && (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" isDisabled={saving || !changed}>
            {saving ? 'Saving…' : detail ? 'Save' : 'Create skill'}
          </Button>
          {detail && changed && (
            <Button variant="ghost" onPress={() => setForm(was)} isDisabled={saving}>
              Discard changes
            </Button>
          )}
          <p className="text-body-small text-muted-foreground">
            A save changes every agent that gives it, from what a run started later freezes. A run already started keeps what it froze.
          </p>
        </div>
      )}
    </form>
  );
}
