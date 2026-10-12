import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { FactoryCondition, FactoryTemplate } from '@/lib/api';
import { conditionAmiss } from '@/lib/factories';

/** A condition the daemon wrote of a factory's template: a badge of its type and state, why, and what it says. */
function ConditionLine({ condition }: { condition: FactoryCondition }) {
  const amiss = conditionAmiss(condition);
  return (
    <li
      className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-body-small"
      data-condition={condition.type}
      data-condition-status={condition.status}
      data-amiss={amiss ? '' : undefined}
    >
      <Badge variant={amiss ? 'destructive' : 'secondary'}>
        {condition.type} {condition.status}
      </Badge>
      <span className="font-medium">{condition.reason}</span>
      <span className="text-muted-foreground">{condition.message}</span>
    </li>
  );
}

/**
 * The template a factory is made from, read-only, above its floor: where it is and the version wanted; the version its tree was applied
 * at, or that the daemon has not rendered it yet; the parameters given; and each condition the daemon wrote, a badge with why, in the
 * destructive colour where it is amiss (`conditionAmiss`).
 */
export function TemplateCard({ template }: { template: FactoryTemplate }) {
  const params = Object.entries(template.params);
  return (
    <div className="border-b p-3">
      <Card size="sm" data-template={template.source}>
        <CardHeader>
          <CardTitle>Template</CardTitle>
          <CardDescription>
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
          </CardDescription>
        </CardHeader>
        {params.length > 0 || template.conditions.length > 0 ? (
          <CardContent className="flex flex-col gap-2">
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
          </CardContent>
        ) : null}
      </Card>
    </div>
  );
}
