import { Card, CardContent, Tag, Title } from '@/components/ui/ds';
import type { FactoryCondition, FactoryTemplate } from '@/lib/api/factories';
import { conditionAmiss } from '@/lib/factories';

/** A condition the daemon wrote of a factory's template: a tag of its type and state, why, and what it says. */
function ConditionLine({ condition }: { condition: FactoryCondition }) {
  const amiss = conditionAmiss(condition);
  return (
    <li
      className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-body-small"
      data-condition={condition.type}
      data-condition-status={condition.status}
      data-amiss={amiss ? '' : undefined}
    >
      <Tag color={amiss ? 'error' : 'secondary'}>
        {condition.type} {condition.status}
      </Tag>
      <span className="font-medium">{condition.reason}</span>
      <span className="text-muted-foreground">{condition.message}</span>
    </li>
  );
}

/**
 * The template a factory is made from, read-only, the first section of its Settings, titled by its card: where it is and the version
 * wanted; the version its tree was applied at, or that the daemon has not rendered it yet; the parameters given; and each condition the
 * daemon wrote, a tag with why, in the error colour where it is amiss (`conditionAmiss`).
 */
export function TemplateCard({ template }: { template: FactoryTemplate }) {
  const params = Object.entries(template.params);
  return (
    <section aria-label="Template" data-factory-template>
      <Card variant="outlined" data-template={template.source} classNames={{ content: 'gap-2' }}>
        <CardContent
          headline={
            <Title size="medium" component="h3">
              Template
            </Title>
          }
          supportingText={
            <>
              <code className="font-mono break-all">{template.source}</code> at version{' '}
              <span className="font-mono" data-template-version>
                {template.version}
              </span>
              {' · '}
              {template.applied === null ? (
                <span data-template-applied="">not rendered yet: the daemon renders its tree on its next pass</span>
              ) : (
                <span data-template-applied={template.applied}>
                  applied at <span className="font-mono">{template.applied}</span>
                </span>
              )}
            </>
          }
          classNames={{ header: 'mb-0' }}
        />
        {params.length > 0 && (
          <dl className="flex flex-wrap gap-x-4 gap-y-1 text-body-small" data-template-params>
            {params.map(([key, value]) => (
              <div key={key} className="flex gap-1" data-param={key}>
                <dt className="text-muted-foreground">{key}</dt>
                <dd className="font-mono">{String(value)}</dd>
              </div>
            ))}
          </dl>
        )}
        {template.conditions.length > 0 && (
          <ul className="flex flex-col gap-1">
            {template.conditions.map((condition) => (
              <ConditionLine key={condition.type} condition={condition} />
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}
