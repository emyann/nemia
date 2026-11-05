Where the intent goes next, read off the intake's closeout: `needsDesign: yes` routes to `build`, a change that needs a design and a
spec a person approves before it is built; `needsDesign: no` routes to `quick`, a change the intent settles, whatever its size. No
agent runs here. The person approves the intent and this route together at the gate, changes the route with `nemia route`, or sends
the intake back with `nemia retry`.
