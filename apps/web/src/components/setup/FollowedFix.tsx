import type { Fix } from 'objects';
import { useFixFollow } from '@/lib/useFixFollow';
import { FixRun } from './FixRun';

/**
 * A started fix followed live (`useFixFollow`) and drawn as it runs (`FixRun`); its end is told to `onEnded`, which reads the readiness
 * again. Setup's fixes and the ones Settings starts beside an upgrade's outcome alike.
 */
export function FollowedFix({ fix, onEnded }: { fix: Fix; onEnded: (ended: Fix) => void }) {
  const followed = useFixFollow(fix, onEnded);
  return (
    <FixRun
      need={fix.need}
      phase={followed.phase}
      output={followed.output}
      {...(fix.code === undefined ? {} : { code: fix.code })}
      {...(followed.ended?.exitCode === undefined ? {} : { exitCode: followed.ended.exitCode })}
      {...(followed.unread === undefined ? {} : { unread: followed.unread })}
    />
  );
}
