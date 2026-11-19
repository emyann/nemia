/**
 * A factory's home, on its settings page, where the api answers the line that opens it (`commands.home`): what the home is, and that line
 * to copy, which opens a person's own session there.
 */
import { Card, CardContent, Title } from '@/components/ui/ds';
import { CommandText } from './FactorySchedules';

/**
 * The home of the factory `name`, marked `data-factory-home` with its name: what it gives a session, and the line `line` that opens one.
 * @param name The factory's name.
 * @param line The line that opens a person's own session in its home, as the api answered it.
 */
export function FactoryHome({ name, line }: { name: string; line: string }) {
  return (
    <Card variant="outlined" data-factory-home={name} classNames={{ content: 'gap-4' }}>
      <CardContent
        headline={
          <Title size="medium" component="h3">
            Home
          </Title>
        }
        supportingText="Where this factory's sessions start, with its memory, skills and settings. Open your own session there, rendered read-only on your machine, with the folder you type it in added beside it:"
        classNames={{ header: 'mb-0' }}
      />
      <CommandText text={line} />
    </Card>
  );
}
