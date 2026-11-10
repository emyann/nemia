/** A hand-built view of a task filed when a fixture says, as the engine's view carries it (`State.filedAt`). */

/**
 * `views`, each one `filed` names carrying that filing time on its state (`State.filedAt`), as the engine's view of a filed task does;
 * a view `filed` does not name is left as it is, and a filing of a task `views` holds no view of is read by no one.
 */
export const filedViews = <V extends { readonly state: object }>(
  views: ReadonlyMap<string, V>,
  filed: ReadonlyMap<string, string>,
): Map<string, V> =>
  new Map(
    [...views].map(([taskId, view]) => {
      const at = filed.get(taskId);
      return [taskId, at === undefined ? view : { ...view, state: { ...view.state, filedAt: at } }];
    }),
  );

/** A view of each task `filed` names that says its filing time alone: what a run's start is read off (`firstFiledAt`). */
export const filedAlone = (filed: ReadonlyMap<string, string>): Map<string, { state: { filedAt: string } }> =>
  new Map([...filed].map(([taskId, at]) => [taskId, { state: { filedAt: at } }]));
