Where the intent goes next, read off the intake's closeout: `handsOver: design` routes to `build`, a change that needs a design and a
spec a person approves before it is built; `handsOver: change` routes to `quick`, a change the intent settles, whatever its size;
`handsOver: nothing` routes to `end`, which ends the run on the intent, its result, with no card filed and no build or quick run. No
agent runs here. The person approves the intent and this route together at the gate, changes the route with `nemia route` (`build`,
`quick` or `end`), or sends the intake back with `nemia retry`.
