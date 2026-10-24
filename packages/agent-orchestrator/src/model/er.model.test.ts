/**
 * `erDiagram`: one block per entity in order, then each relation in entity and field order, every line one beautiful-mermaid reads.
 * One fixture model, a row per rule: the runtime's own cases (`agent-runtime/src/core/er.test.ts`), so the two copies print alike.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Schema } from 'effect';
import { brandedCount, brandedId, foreignId } from './brand.model.ts';
import { erDiagram, type ErModel } from './er.model.ts';

const TaskId = brandedId('TaskId', /^t-/);
const RunId = foreignId('RunId');
const AttemptNumber = brandedCount('AttemptNumber', 1);

const Attempt = Schema.Struct({
  n: AttemptNumber.OnRead,
  task: TaskId.OnRead,
  resumes: Schema.optional(Schema.NullOr(TaskId.OnRead)),
}).annotate({ identifier: 'Attempt' });
const Session = Schema.Struct({ native: Schema.String }).annotate({ identifier: 'Session' });
const Mount = Schema.Struct({ path: Schema.String, readOnly: Schema.Boolean }).annotate({ identifier: 'Mount' });
const Outcome = Schema.Literals(['succeeded', 'failed']).annotate({ identifier: 'Outcome' });

const Task = Schema.Struct({
  id: TaskId.OnCreate,
  harness: Schema.String,
  restarts: Schema.optional(Schema.Number),
  held: Schema.Boolean,
  outcome: Schema.NullOr(Outcome),
  phase: Schema.Literals(['queued', 'running']),
  place: Schema.Literal('host'),
  labels: Schema.Record(Schema.String, Schema.String),
  tags: Schema.Array(Schema.String),
  closeout: Schema.Unknown,
  run: RunId.OnRead,
  attempts: Schema.Array(Attempt),
  byTurn: Schema.Record(Schema.String, Attempt),
  session: Session,
  mount: Schema.optional(Mount),
  either: Schema.Union([Session, Mount]),
}).annotate({ identifier: 'Task' });

const MODEL: ErModel = { entities: [Task, Attempt, Session, Mount], ids: { TaskId: 'Task' } };
const lines = erDiagram(MODEL).split('\n');
const has = (line: string) => assert.ok(lines.includes(line), `the diagram holds \`${line}\`:\n${lines.join('\n')}`);

test('erDiagram draws each rule of the contract', async (t) => {
  await t.test('it opens with `erDiagram`, ends with no newline, and draws one block per entity, in order', () => {
    assert.equal(lines[0], 'erDiagram');
    assert.notEqual(lines.at(-1), '');
    const heads = lines.filter((l) => /^ {2}\w+ \{$/.test(l));
    assert.deepEqual(heads, ['  Task {', '  Attempt {', '  Session {', '  Mount {']);
  });
  await t.test('an id this entity is named by is its PK', () => has('    TaskId id PK'));
  await t.test('a plain field is its type, an optional one says so', () => {
    has('    string harness');
    has('    number restarts "optional"');
    has('    boolean held');
  });
  await t.test('an annotated field is its identifier, a set of literals an enum, one literal its value', () => {
    has('    Outcome outcome');
    has('    enum phase');
    has('    host place');
  });
  await t.test('a record of plain values is an object, an array of them a list, anything else unknown', () => {
    has('    object labels');
    has('    list tags');
    has('    unknown closeout');
  });
  await t.test('a count is an attribute by its name, never a key', () => has('    AttemptNumber n'));
  await t.test('an id of another entity is an FK and a relation to that entity', () => {
    has('    TaskId task FK');
    has('  Task ||--o{ Attempt : task');
    has('    TaskId resumes FK "optional"');
    has('  Task ||--o{ Attempt : resumes');
  });
  await t.test('a foreign id is an FK and a relation to a node named by the id, with no block of its own', () => {
    has('    RunId run FK');
    has('  RunId ||--o{ Task : run');
    assert.ok(!lines.includes('  RunId {'));
  });
  await t.test('an entity held once is a relation and no attribute; held optionally, zero or one', () => {
    has('  Task ||--|| Session : session');
    has('  Task ||--o| Mount : mount');
    assert.ok(!lines.some((l) => / (session|mount|attempts|byTurn|either)$/.test(l) && l.startsWith('    ')));
  });
  await t.test('an entity held in an array or a record is a relation to many', () => {
    has('  Task ||--o{ Attempt : attempts');
    has('  Task ||--o{ Attempt : byTurn');
  });
  await t.test('a union of entities is a relation to each', () => {
    has('  Task ||--|| Session : either');
    has('  Task ||--|| Mount : either');
  });
  await t.test('every relation follows the blocks, in entity then field order', () => {
    const relations = lines.filter((l) => /^ {2}\w+ \S+--\S+ \w+ : \w+$/.test(l));
    const firstRelation = lines.findIndex((l) => relations.includes(l));
    assert.ok(lines.slice(firstRelation).every((l) => relations.includes(l)));
    assert.deepEqual(relations, [
      '  RunId ||--o{ Task : run',
      '  Task ||--o{ Attempt : attempts',
      '  Task ||--o{ Attempt : byTurn',
      '  Task ||--|| Session : session',
      '  Task ||--o| Mount : mount',
      '  Task ||--|| Session : either',
      '  Task ||--|| Mount : either',
      '  Task ||--o{ Attempt : task',
      '  Task ||--o{ Attempt : resumes',
    ]);
  });
});
