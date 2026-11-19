/** The fixture's suite: its one test file, Vitest's globals, since a copy outside the repository resolves no package. */
export default { test: { include: ['test/*.test.ts'], globals: true, pool: 'forks' } };
